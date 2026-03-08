package engine

import (
	"math"
	"time"
)

// OrderbookImbalanceStrategy detects bid/ask imbalance for trading signals
type OrderbookImbalanceStrategy struct {
	threshold    float64 // Minimum imbalance to trigger
	signalStrength float64 // Base signal strength
	name         string
}

// NewOrderbookImbalanceStrategy creates a new imbalance strategy
func NewOrderbookImbalanceStrategy(threshold, signalStrength float64) *OrderbookImbalanceStrategy {
	return &OrderbookImbalanceStrategy{
		threshold:      threshold,
		signalStrength: signalStrength,
		name:          "OrderbookImbalance",
	}
}

// Name returns the strategy name
func (s *OrderbookImbalanceStrategy) Name() string {
	return s.name
}

// Evaluate evaluates the orderbook for imbalance signals
func (s *OrderbookImbalanceStrategy) Evaluate(orderbook *Orderbook, metrics OrderbookMetrics) *TradingSignal {
	// Check if we have valid metrics
	if metrics.TotalVolume == 0 || metrics.MidPrice == 0 {
		return nil
	}

	// Imbalance is already calculated: -1 to 1
	// Negative = bid heavy (buying pressure)
	// Positive = ask heavy (selling pressure)
	imbalance := metrics.Imbalance
	absImbalance := math.Abs(imbalance)

	// Check if imbalance exceeds threshold
	if absImbalance < s.threshold {
		return nil
	}

	// Determine direction
	// Heavy bids = upward pressure = BUY
	// Heavy asks = downward pressure = SELL
	var direction string
	var reason string
	
	if imbalance < 0 {
		direction = "BUY"
		reason = "Heavy bid side indicates upward pressure"
	} else {
		direction = "SELL"
		reason = "Heavy ask side indicates downward pressure"
	}

	// Calculate signal strength (0-1)
	// Scale imbalance to strength, capped at signalStrength
	strength := math.Min(absImbalance*s.signalStrength, 1.0)

	// Calculate suggested quantity based on volume
	quantity := s.calculateQuantity(metrics)

	return &TradingSignal{
		Symbol:    orderbook.symbol,
		Exchange:  orderbook.exchange,
		Strategy:  s.name,
		Direction: direction,
		Strength:  strength,
		Price:     metrics.MidPrice,
		Quantity:  quantity,
		Timestamp: time.Now().UnixNano(),
		Reason:    reason,
		Metadata: map[string]interface{}{
			"imbalance":      imbalance,
			"bid_volume":     metrics.BidVolume,
			"ask_volume":     metrics.AskVolume,
			"spread_bps":     metrics.SpreadBps,
			"weighted_bid":   metrics.WeightedBidPx,
			"weighted_ask":   metrics.WeightedAskPx,
		},
	}
}

// calculateQuantity calculates suggested position size
func (s *OrderbookImbalanceStrategy) calculateQuantity(metrics OrderbookMetrics) float64 {
	// Use a fraction of the thinner side's volume
	var thinnerVolume float64
	if metrics.BidVolume < metrics.AskVolume {
		thinnerVolume = metrics.BidVolume
	} else {
		thinnerVolume = metrics.AskVolume
	}
	
	// Suggest 1% of thinner side volume, minimum 0.001 BTC equivalent
	quantity := thinnerVolume * 0.01
	return math.Max(quantity, 0.001)
}

// MomentumStrategy detects rapid price movements
type MomentumStrategy struct {
	window      int     // Number of price updates to track
	threshold   float64 // Minimum price change percentage
	signalStrength float64 // Base signal strength
	name        string
	
	// Price history per orderbook
	priceHistory map[string]*PriceHistory
}

// PriceHistory tracks recent price movements
type PriceHistory struct {
	prices    []float64
	timestamps []int64
	index     int
	count     int
	capacity  int
}

// NewPriceHistory creates a new price history tracker
func NewPriceHistory(capacity int) *PriceHistory {
	return &PriceHistory{
		prices:     make([]float64, capacity),
		timestamps: make([]int64, capacity),
		capacity:   capacity,
	}
}

// Add adds a new price point
func (h *PriceHistory) Add(price float64, timestamp int64) {
	h.prices[h.index] = price
	h.timestamps[h.index] = timestamp
	h.index = (h.index + 1) % h.capacity
	if h.count < h.capacity {
		h.count++
	}
}

// GetMomentum calculates price momentum
func (h *PriceHistory) GetMomentum() (changePercent float64, direction string, volatility float64) {
	if h.count < 2 {
		return 0, "", 0
	}

	// Get oldest and newest prices
	startIdx := (h.index - h.count + h.capacity) % h.capacity
	endIdx := (h.index - 1 + h.capacity) % h.capacity
	
	startPrice := h.prices[startIdx]
	endPrice := h.prices[endIdx]
	
	if startPrice == 0 {
		return 0, "", 0
	}

	// Calculate percent change
	changePercent = (endPrice - startPrice) / startPrice
	
	// Determine direction
	if changePercent > 0 {
		direction = "BUY"
	} else {
		direction = "SELL"
		changePercent = -changePercent
	}

	// Calculate volatility (standard deviation)
	var sum, sumSq float64
	count := float64(h.count)
	for i := 0; i < h.count; i++ {
		idx := (startIdx + i) % h.capacity
		sum += h.prices[idx]
	}
	mean := sum / count
	
	for i := 0; i < h.count; i++ {
		idx := (startIdx + i) % h.capacity
		diff := h.prices[idx] - mean
		sumSq += diff * diff
	}
	volatility = math.Sqrt(sumSq / count) / mean

	return changePercent, direction, volatility
}

// NewMomentumStrategy creates a new momentum strategy
func NewMomentumStrategy(window int, threshold, signalStrength float64) *MomentumStrategy {
	return &MomentumStrategy{
		window:        window,
		threshold:     threshold,
		signalStrength: signalStrength,
		name:         "Momentum",
		priceHistory: make(map[string]*PriceHistory),
	}
}

// Name returns the strategy name
func (s *MomentumStrategy) Name() string {
	return s.name
}

// Evaluate evaluates the orderbook for momentum signals
func (s *MomentumStrategy) Evaluate(orderbook *Orderbook, metrics OrderbookMetrics) *TradingSignal {
	// Get mid price
	if metrics.MidPrice == 0 {
		return nil
	}

	// Get or create price history for this symbol
	key := orderbook.exchange + ":" + orderbook.symbol
	history, exists := s.priceHistory[key]
	if !exists {
		history = NewPriceHistory(s.window)
		s.priceHistory[key] = history
	}

	// Add current price
	history.Add(metrics.MidPrice, time.Now().UnixNano())

	// Calculate momentum
	changePercent, direction, volatility := history.GetMomentum()
	
	// Check if momentum exceeds threshold
	if changePercent < s.threshold {
		return nil
	}

	// Calculate signal strength
	// Higher momentum = stronger signal, capped at signalStrength
	strength := math.Min(changePercent*10*s.signalStrength, 1.0)

	// Adjust strength based on volatility (lower volatility = more reliable)
	if volatility > 0 {
		confidenceFactor := math.Max(0.5, 1-volatility)
		strength *= confidenceFactor
	}

	// Calculate suggested quantity
	quantity := s.calculateQuantity(metrics, volatility)

	// Determine reason
	reason := "Rapid upward price movement detected"
	if direction == "SELL" {
		reason = "Rapid downward price movement detected"
	}

	return &TradingSignal{
		Symbol:    orderbook.symbol,
		Exchange:  orderbook.exchange,
		Strategy:  s.name,
		Direction: direction,
		Strength:  strength,
		Price:     metrics.MidPrice,
		Quantity:  quantity,
		Timestamp: time.Now().UnixNano(),
		Reason:    reason,
		Metadata: map[string]interface{}{
			"change_percent": changePercent,
			"volatility":     volatility,
			"window_size":    s.window,
			"spread_bps":     metrics.SpreadBps,
		},
	}
}

// calculateQuantity calculates suggested position size for momentum
func (s *MomentumStrategy) calculateQuantity(metrics OrderbookMetrics, volatility float64) float64 {
	// Base quantity on total volume
	baseQty := metrics.TotalVolume * 0.005
	
	// Reduce size if volatility is high
	if volatility > 0.01 { // 1% volatility
		baseQty *= 0.5
	}
	
	return math.Max(baseQty, 0.001)
}

// SpreadCaptureStrategy captures spread when conditions are favorable
type SpreadCaptureStrategy struct {
	maxSpreadBps float64 // Maximum spread to consider (in basis points)
	minSpreadBps float64 // Minimum spread to make it worthwhile
	signalStrength float64
	name         string
}

// NewSpreadCaptureStrategy creates a new spread capture strategy
func NewSpreadCaptureStrategy(minSpreadBps, maxSpreadBps, signalStrength float64) *SpreadCaptureStrategy {
	return &SpreadCaptureStrategy{
		minSpreadBps:   minSpreadBps,
		maxSpreadBps:   maxSpreadBps,
		signalStrength: signalStrength,
		name:          "SpreadCapture",
	}
}

// Name returns the strategy name
func (s *SpreadCaptureStrategy) Name() string {
	return s.name
}

// Evaluate evaluates the orderbook for spread capture opportunities
func (s *SpreadCaptureStrategy) Evaluate(orderbook *Orderbook, metrics OrderbookMetrics) *TradingSignal {
	// Check spread conditions
	if metrics.SpreadBps < s.minSpreadBps || metrics.SpreadBps > s.maxSpreadBps {
		return nil
	}

	// Calculate potential profit
	// For spread capture, we want a balanced book with reasonable spread
	absImbalance := math.Abs(metrics.Imbalance)
	
	// Skip if too imbalanced (risky for spread capture)
	if absImbalance > 0.4 {
		return nil
	}

	// Signal strength based on spread size and balance
	strength := (metrics.SpreadBps / s.maxSpreadBps) * (1 - absImbalance) * s.signalStrength
	strength = math.Min(strength, 1.0)

	// For spread capture, direction is less important
	// We're looking to provide liquidity on both sides
	return &TradingSignal{
		Symbol:    orderbook.symbol,
		Exchange:  orderbook.exchange,
		Strategy:  s.name,
		Direction: "SPREAD",
		Strength:  strength,
		Price:     metrics.MidPrice,
		Quantity:  math.Min(metrics.BidVolume, metrics.AskVolume) * 0.01,
		Timestamp: time.Now().UnixNano(),
		Reason:    "Favorable spread conditions for market making",
		Metadata: map[string]interface{}{
			"spread_bps":  metrics.SpreadBps,
			"imbalance":   metrics.Imbalance,
			"best_bid":    metrics.BestBid,
			"best_ask":    metrics.BestAsk,
		},
	}
}

// VolumeSpikeStrategy detects unusual volume spikes
type VolumeSpikeStrategy struct {
	volumeMultiplier float64 // How many times average volume to trigger
	lookbackWindow   int     // Number of updates to average
	signalStrength   float64
	name             string
	
	volumeHistory map[string]*VolumeHistory
}

// VolumeHistory tracks volume history
type VolumeHistory struct {
	volumes  []float64
	index    int
	count    int
	capacity int
}

// NewVolumeHistory creates a new volume history tracker
func NewVolumeHistory(capacity int) *VolumeHistory {
	return &VolumeHistory{
		volumes:  make([]float64, capacity),
		capacity: capacity,
	}
}

// Add adds a volume measurement
func (h *VolumeHistory) Add(volume float64) {
	h.volumes[h.index] = volume
	h.index = (h.index + 1) % h.capacity
	if h.count < h.capacity {
		h.count++
	}
}

// GetAverage returns the average volume
func (h *VolumeHistory) GetAverage() float64 {
	if h.count == 0 {
		return 0
	}
	var sum float64
	for i := 0; i < h.count; i++ {
		sum += h.volumes[i]
	}
	return sum / float64(h.count)
}

// NewVolumeSpikeStrategy creates a new volume spike strategy
func NewVolumeSpikeStrategy(multiplier float64, lookback int, signalStrength float64) *VolumeSpikeStrategy {
	return &VolumeSpikeStrategy{
		volumeMultiplier: multiplier,
		lookbackWindow:   lookback,
		signalStrength:   signalStrength,
		name:            "VolumeSpike",
		volumeHistory:   make(map[string]*VolumeHistory),
	}
}

// Name returns the strategy name
func (s *VolumeSpikeStrategy) Name() string {
	return s.name
}

// Evaluate evaluates the orderbook for volume spike signals
func (s *VolumeSpikeStrategy) Evaluate(orderbook *Orderbook, metrics OrderbookMetrics) *TradingSignal {
	key := orderbook.exchange + ":" + orderbook.symbol
	history, exists := s.volumeHistory[key]
	if !exists {
		history = NewVolumeHistory(s.lookbackWindow)
		s.volumeHistory[key] = history
	}

	// Get average volume
	avgVolume := history.GetAverage()
	
	// Add current volume
	history.Add(metrics.TotalVolume)

	// Need enough history
	if history.count < s.lookbackWindow/2 {
		return nil
	}

	// Check for spike
	if avgVolume == 0 || metrics.TotalVolume < avgVolume*s.volumeMultiplier {
		return nil
	}

	// Calculate spike magnitude
	spikeRatio := metrics.TotalVolume / avgVolume
	
	// Determine direction based on imbalance
	direction := "BUY"
	if metrics.Imbalance > 0 {
		direction = "SELL"
	}

	// Signal strength based on spike ratio
	strength := math.Min(spikeRatio/s.volumeMultiplier*s.signalStrength, 1.0)

	return &TradingSignal{
		Symbol:    orderbook.symbol,
		Exchange:  orderbook.exchange,
		Strategy:  s.name,
		Direction: direction,
		Strength:  strength,
		Price:     metrics.MidPrice,
		Quantity:  metrics.TotalVolume * 0.01,
		Timestamp: time.Now().UnixNano(),
		Reason:    "Unusual volume spike detected",
		Metadata: map[string]interface{}{
			"spike_ratio":   spikeRatio,
			"avg_volume":    avgVolume,
			"current_volume": metrics.TotalVolume,
			"imbalance":     metrics.Imbalance,
		},
	}
}
