package engine

import (
	"sort"
	"sync"
	"sync/atomic"
	"time"
	"unsafe"
)

// PriceLevel represents a single price level in the orderbook
type PriceLevel struct {
	Price    float64 `json:"price"`
	Quantity float64 `json:"quantity"`
}

// OrderbookSnapshot represents a complete orderbook state
type OrderbookSnapshot struct {
	Symbol    string        `json:"symbol"`
	Exchange  string        `json:"exchange"`
	Bids      []PriceLevel  `json:"bids"`
	Asks      []PriceLevel  `json:"asks"`
	Timestamp int64         `json:"timestamp"`
	SeqNum    uint64        `json:"seq_num"`
}

// OrderbookUpdate represents a delta update
type OrderbookUpdate struct {
	Symbol    string        `json:"symbol"`
	Exchange  string        `json:"exchange"`
	Bids      []PriceLevel  `json:"bids"`
	Asks      []PriceLevel  `json:"asks"`
	Timestamp int64         `json:"timestamp"`
	SeqNum    uint64        `json:"seq_num"`
}

// OrderbookMetrics contains calculated orderbook metrics
type OrderbookMetrics struct {
	BestBid         float64 `json:"best_bid"`
	BestAsk         float64 `json:"best_ask"`
	Spread          float64 `json:"spread"`
	SpreadBps       float64 `json:"spread_bps"`
	MidPrice        float64 `json:"mid_price"`
	Imbalance       float64 `json:"imbalance"`       // -1 to 1, negative = bid heavy
	BidVolume       float64 `json:"bid_volume"`      // Total bid volume
	AskVolume       float64 `json:"ask_volume"`      // Total ask volume
	TotalVolume     float64 `json:"total_volume"`    // Total volume
	WeightedBidPx   float64 `json:"weighted_bid_px"` // Volume-weighted bid price
	WeightedAskPx   float64 `json:"weighted_ask_px"` // Volume-weighted ask price
	LastUpdateNs    int64   `json:"last_update_ns"`
	UpdateCount     uint64  `json:"update_count"`
}

// Orderbook represents a thread-safe orderbook
type Orderbook struct {
	symbol   string
	exchange string

	// Use separate mutexes for bids and asks for better concurrency
	bidMutex sync.RWMutex
	askMutex sync.RWMutex

	bids []PriceLevel
	asks []PriceLevel

	// Atomic fields for fast reads
	lastUpdateNs atomic.Int64
	seqNum       atomic.Uint64
	updateCount  atomic.Uint64

	// Pre-computed metrics (updated atomically)
	bestBid   atomic.Uint64 // IEEE 754 float64 as uint64
	bestAsk   atomic.Uint64
	imbalance atomic.Uint64
	midPrice  atomic.Uint64

	// Configuration
	maxDepth int

	// Latency tracking
	latencyMeter *LatencyMeter
}

// NewOrderbook creates a new orderbook instance
func NewOrderbook(symbol, exchange string, maxDepth int) *Orderbook {
	ob := &Orderbook{
		symbol:       symbol,
		exchange:     exchange,
		bids:         make([]PriceLevel, 0, maxDepth),
		asks:         make([]PriceLevel, 0, maxDepth),
		maxDepth:     maxDepth,
		latencyMeter: NewLatencyMeter(1000), // Keep last 1000 measurements
	}
	return ob
}

// ApplySnapshot applies a full orderbook snapshot
func (ob *Orderbook) ApplySnapshot(snapshot *OrderbookSnapshot) int64 {
	start := time.Now()
	defer func() {
		latency := time.Since(start).Nanoseconds()
		ob.latencyMeter.Record(latency)
	}()

	ob.bidMutex.Lock()
	ob.askMutex.Lock()
	defer ob.bidMutex.Unlock()
	defer ob.askMutex.Unlock()

	// Deep copy bids and sort descending
	ob.bids = make([]PriceLevel, 0, len(snapshot.Bids))
	for _, bid := range snapshot.Bids {
		if len(ob.bids) < ob.maxDepth {
			ob.bids = append(ob.bids, bid)
		}
	}
	sort.Slice(ob.bids, func(i, j int) bool {
		return ob.bids[i].Price > ob.bids[j].Price // Descending for bids
	})

	// Deep copy asks and sort ascending
	ob.asks = make([]PriceLevel, 0, len(snapshot.Asks))
	for _, ask := range snapshot.Asks {
		if len(ob.asks) < ob.maxDepth {
			ob.asks = append(ob.asks, ask)
		}
	}
	sort.Slice(ob.asks, func(i, j int) bool {
		return ob.asks[i].Price < ob.asks[j].Price // Ascending for asks
	})

	// Update atomic fields
	ob.lastUpdateNs.Store(snapshot.Timestamp)
	ob.seqNum.Store(snapshot.SeqNum)
	ob.updateCount.Add(1)

	// Update cached metrics
	ob.updateMetricsAtomic()

	return time.Since(start).Nanoseconds()
}

// ApplyDelta applies a delta update to the orderbook
func (ob *Orderbook) ApplyDelta(update *OrderbookUpdate) int64 {
	start := time.Now()
	defer func() {
		latency := time.Since(start).Nanoseconds()
		ob.latencyMeter.Record(latency)
	}()

	// Validate sequence number (must be greater than current)
	currentSeq := ob.seqNum.Load()
	if update.SeqNum > 0 && update.SeqNum <= currentSeq {
		// Stale update, ignore
		return 0
	}

	// Apply bid updates
	if len(update.Bids) > 0 {
		ob.bidMutex.Lock()
		ob.applySideUpdates(&ob.bids, update.Bids, true)
		ob.bidMutex.Unlock()
	}

	// Apply ask updates
	if len(update.Asks) > 0 {
		ob.askMutex.Lock()
		ob.applySideUpdates(&ob.asks, update.Asks, false)
		ob.askMutex.Unlock()
	}

	// Update atomic fields
	ob.lastUpdateNs.Store(update.Timestamp)
	ob.seqNum.Store(update.SeqNum)
	ob.updateCount.Add(1)

	// Update cached metrics
	ob.updateMetricsAtomic()

	return time.Since(start).Nanoseconds()
}

// applySideUpdates applies updates to one side of the book
func (ob *Orderbook) applySideUpdates(levels *[]PriceLevel, updates []PriceLevel, isBid bool) {
	for _, update := range updates {
		if update.Quantity == 0 {
			// Remove level
			ob.removeLevel(levels, update.Price)
		} else {
			// Update or insert level
			ob.upsertLevel(levels, update, isBid)
		}
	}

	// Trim to max depth
	if len(*levels) > ob.maxDepth {
		*levels = (*levels)[:ob.maxDepth]
	}
}

// removeLevel removes a price level
func (ob *Orderbook) removeLevel(levels *[]PriceLevel, price float64) {
	for i, level := range *levels {
		if level.Price == price {
			*levels = append((*levels)[:i], (*levels)[i+1:]...)
			return
		}
	}
}

// upsertLevel inserts or updates a price level
func (ob *Orderbook) upsertLevel(levels *[]PriceLevel, update PriceLevel, isBid bool) {
	// Find insertion point
	for i, level := range *levels {
		if level.Price == update.Price {
			// Update existing level
			(*levels)[i].Quantity = update.Quantity
			return
		}

		// Check if we should insert before this level
		shouldInsert := false
		if isBid {
			shouldInsert = update.Price > level.Price
		} else {
			shouldInsert = update.Price < level.Price
		}

		if shouldInsert {
			// Insert new level
			*levels = append(*levels, PriceLevel{})
			copy((*levels)[i+1:], (*levels)[i:])
			(*levels)[i] = update
			return
		}
	}

	// Append at end if not inserted
	*levels = append(*levels, update)
}

// updateMetricsAtomic updates atomic metrics for fast reads
func (ob *Orderbook) updateMetricsAtomic() {
	metrics := ob.calculateMetrics()
	ob.bestBid.Store(float64ToUint64(metrics.BestBid))
	ob.bestAsk.Store(float64ToUint64(metrics.BestAsk))
	ob.imbalance.Store(float64ToUint64(metrics.Imbalance))
	ob.midPrice.Store(float64ToUint64(metrics.MidPrice))
}

// calculateMetrics computes orderbook metrics
func (ob *Orderbook) calculateMetrics() OrderbookMetrics {
	ob.bidMutex.RLock()
	ob.askMutex.RLock()
	defer ob.bidMutex.RUnlock()
	defer ob.askMutex.RUnlock()

	metrics := OrderbookMetrics{
		LastUpdateNs: ob.lastUpdateNs.Load(),
		UpdateCount:  ob.updateCount.Load(),
	}

	if len(ob.bids) > 0 {
		metrics.BestBid = ob.bids[0].Price
	}
	if len(ob.asks) > 0 {
		metrics.BestAsk = ob.asks[0].Price
	}

	if metrics.BestBid > 0 && metrics.BestAsk > 0 {
		metrics.Spread = metrics.BestAsk - metrics.BestBid
		metrics.MidPrice = (metrics.BestBid + metrics.BestAsk) / 2
		if metrics.MidPrice > 0 {
			metrics.SpreadBps = (metrics.Spread / metrics.MidPrice) * 10000
		}
	}

	// Calculate volumes and weighted prices
	var bidVolumeSum, askVolumeSum float64
	var bidValueSum, askValueSum float64

	for _, bid := range ob.bids {
		bidVolumeSum += bid.Quantity
		bidValueSum += bid.Price * bid.Quantity
	}
	for _, ask := range ob.asks {
		askVolumeSum += ask.Quantity
		askValueSum += ask.Price * ask.Quantity
	}

	metrics.BidVolume = bidVolumeSum
	metrics.AskVolume = askVolumeSum
	metrics.TotalVolume = bidVolumeSum + askVolumeSum

	if bidVolumeSum > 0 {
		metrics.WeightedBidPx = bidValueSum / bidVolumeSum
	}
	if askVolumeSum > 0 {
		metrics.WeightedAskPx = askValueSum / askVolumeSum
	}

	// Calculate imbalance (-1 to 1)
	if metrics.TotalVolume > 0 {
		metrics.Imbalance = (bidVolumeSum - askVolumeSum) / metrics.TotalVolume
	}

	return metrics
}

// GetMetrics returns current orderbook metrics
func (ob *Orderbook) GetMetrics() OrderbookMetrics {
	return ob.calculateMetrics()
}

// GetMetricsFast returns atomic metrics (faster but less detailed)
func (ob *Orderbook) GetMetricsFast() (bestBid, bestAsk, midPrice, imbalance float64) {
	bestBid = uint64ToFloat64(ob.bestBid.Load())
	bestAsk = uint64ToFloat64(ob.bestAsk.Load())
	midPrice = uint64ToFloat64(ob.midPrice.Load())
	imbalance = uint64ToFloat64(ob.imbalance.Load())
	return
}

// GetSnapshot returns a copy of the current orderbook state
func (ob *Orderbook) GetSnapshot() *OrderbookSnapshot {
	ob.bidMutex.RLock()
	ob.askMutex.RLock()
	defer ob.bidMutex.RUnlock()
	defer ob.askMutex.RUnlock()

	bids := make([]PriceLevel, len(ob.bids))
	copy(bids, ob.bids)

	asks := make([]PriceLevel, len(ob.asks))
	copy(asks, ob.asks)

	return &OrderbookSnapshot{
		Symbol:    ob.symbol,
		Exchange:  ob.exchange,
		Bids:      bids,
		Asks:      asks,
		Timestamp: ob.lastUpdateNs.Load(),
		SeqNum:    ob.seqNum.Load(),
	}
}

// GetLatencyStats returns latency statistics
func (ob *Orderbook) GetLatencyStats() LatencyStats {
	return ob.latencyMeter.GetStats()
}

// GetDepth returns orderbook levels up to specified depth
func (ob *Orderbook) GetDepth(depth int) ([]PriceLevel, []PriceLevel) {
	ob.bidMutex.RLock()
	ob.askMutex.RLock()
	defer ob.bidMutex.RUnlock()
	defer ob.askMutex.RUnlock()

	bidDepth := depth
	if bidDepth > len(ob.bids) {
		bidDepth = len(ob.bids)
	}
	askDepth := depth
	if askDepth > len(ob.asks) {
		askDepth = len(ob.asks)
	}

	bids := make([]PriceLevel, bidDepth)
	copy(bids, ob.bids[:bidDepth])

	asks := make([]PriceLevel, askDepth)
	copy(asks, ob.asks[:askDepth])

	return bids, asks
}

// Helper functions for float64 <-> uint64 conversion (atomic operations)
func float64ToUint64(f float64) uint64 {
	return *(*uint64)(unsafe.Pointer(&f))
}

func uint64ToFloat64(u uint64) float64 {
	return *(*float64)(unsafe.Pointer(&u))
}
