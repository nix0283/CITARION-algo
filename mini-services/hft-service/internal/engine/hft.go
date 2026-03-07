package engine

import (
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// LatencyStats holds latency distribution statistics
type LatencyStats struct {
	Count    int64   `json:"count"`
	Min      int64   `json:"min"`
	Max      int64   `json:"max"`
	Mean     int64   `json:"mean"`
	P50      int64   `json:"p50"`      // 50th percentile (median)
	P95      int64   `json:"p95"`      // 95th percentile
	P99      int64   `json:"p99"`      // 99th percentile
	P999     int64   `json:"p999"`     // 99.9th percentile
	LastNs   int64   `json:"last_ns"`  // Last measurement in nanoseconds
	Avg1s    int64   `json:"avg_1s"`   // Average over last 1 second
	Avg10s   int64   `json:"avg_10s"`  // Average over last 10 seconds
	Avg1m    int64   `json:"avg_1m"`   // Average over last 1 minute
}

// LatencyMeter tracks processing latency with percentile calculations
type LatencyMeter struct {
	measurements []int64
	index        int
	capacity     int
	count        int64
	sum          int64
	sum1s        int64
	sum10s       int64
	sum1m        int64
	count1s      int64
	count10s     int64
	count1m      int64
	lastNs       int64
	mutex        sync.RWMutex
	lastUpdate   time.Time
}

// NewLatencyMeter creates a new latency meter
func NewLatencyMeter(capacity int) *LatencyMeter {
	return &LatencyMeter{
		measurements: make([]int64, capacity),
		capacity:     capacity,
		lastUpdate:   time.Now(),
	}
}

// Record adds a latency measurement in nanoseconds
func (lm *LatencyMeter) Record(latencyNs int64) {
	lm.mutex.Lock()
	defer lm.mutex.Unlock()

	// Update ring buffer
	if lm.count < int64(lm.capacity) {
		lm.measurements[lm.index] = latencyNs
		lm.count++
	} else {
		lm.sum -= lm.measurements[lm.index]
		lm.measurements[lm.index] = latencyNs
	}
	lm.sum += latencyNs
	lm.index = (lm.index + 1) % lm.capacity
	lm.lastNs = latencyNs

	// Update time-based averages
	now := time.Now()
	elapsed := now.Sub(lm.lastUpdate)
	lm.lastUpdate = now

	// Decay time-based sums based on elapsed time
	// This is a simplified exponential decay
	decayFactor := 0.99
	if elapsed > time.Second {
		decayFactor = 0.9
	}
	
	lm.sum1s = int64(float64(lm.sum1s)*decayFactor) + latencyNs
	lm.sum10s = int64(float64(lm.sum10s)*0.999) + latencyNs
	lm.sum1m = int64(float64(lm.sum1m)*0.9999) + latencyNs
	
	lm.count1s++
	lm.count10s++
	lm.count1m++
}

// GetStats returns current latency statistics
func (lm *LatencyMeter) GetStats() LatencyStats {
	lm.mutex.RLock()
	defer lm.mutex.RUnlock()

	stats := LatencyStats{
		Count:  lm.count,
		LastNs: lm.lastNs,
	}

	if lm.count == 0 {
		return stats
	}

	// Calculate mean
	stats.Mean = lm.sum / lm.count

	// Calculate time-based averages
	if lm.count1s > 0 {
		stats.Avg1s = lm.sum1s / lm.count1s
	}
	if lm.count10s > 0 {
		stats.Avg10s = lm.sum10s / lm.count10s
	}
	if lm.count1m > 0 {
		stats.Avg1m = lm.sum1m / lm.count1m
	}

	// Calculate percentiles
	sorted := make([]int64, lm.count)
	if lm.count < int64(lm.capacity) {
		copy(sorted, lm.measurements[:lm.count])
	} else {
		copy(sorted, lm.measurements)
	}
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	stats.Min = sorted[0]
	stats.Max = sorted[len(sorted)-1]
	stats.P50 = sorted[len(sorted)*50/100]
	stats.P95 = sorted[len(sorted)*95/100]
	stats.P99 = sorted[len(sorted)*99/100]
	stats.P999 = sorted[len(sorted)*999/1000]

	return stats
}

// TradingSignal represents a generated trading signal
type TradingSignal struct {
	Symbol      string    `json:"symbol"`
	Exchange    string    `json:"exchange"`
	Strategy    string    `json:"strategy"`
	Direction   string    `json:"direction"` // "BUY" or "SELL"
	Strength    float64   `json:"strength"`  // 0 to 1
	Price       float64   `json:"price"`
	Quantity    float64   `json:"quantity"`
	Timestamp   int64     `json:"timestamp"`
	Reason      string    `json:"reason"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// HFTEngineConfig holds HFT engine configuration
type HFTEngineConfig struct {
	MaxLatencyNs       int64
	OrderbookDepth     int
	SignalThreshold    float64
	ImbalanceThreshold float64
	MomentumWindow     int
	MomentumThreshold  float64
}

// HFTEngine is the main HFT engine
type HFTEngine struct {
	config      HFTEngineConfig
	orderbooks  sync.Map // map[string]*Orderbook (key: exchange:symbol)
	signals     []TradingSignal
	signalsMutex sync.RWMutex
	maxSignals  int

	// Strategies
	strategies []Strategy

	// Engine state
	running    atomic.Bool
	startTime  time.Time
	
	// Latency tracking
	engineLatency *LatencyMeter
	signalLatency *LatencyMeter
	
	// Metrics
	totalUpdates    atomic.Uint64
	totalSignals    atomic.Uint64
	signalsByType   sync.Map // map[string]uint64
}

// Strategy interface for HFT strategies
type Strategy interface {
	Name() string
	Evaluate(orderbook *Orderbook, metrics OrderbookMetrics) *TradingSignal
}

// NewHFTEngine creates a new HFT engine
func NewHFTEngine(config HFTEngineConfig) *HFTEngine {
	engine := &HFTEngine{
		config:        config,
		signals:       make([]TradingSignal, 0, 1000),
		maxSignals:    1000,
		engineLatency: NewLatencyMeter(10000),
		signalLatency: NewLatencyMeter(1000),
	}

	// Register default strategies
	engine.strategies = []Strategy{
		NewOrderbookImbalanceStrategy(config.ImbalanceThreshold, config.SignalThreshold),
		NewMomentumStrategy(config.MomentumWindow, config.MomentumThreshold, config.SignalThreshold),
	}

	return engine
}

// Start begins the HFT engine
func (e *HFTEngine) Start() {
	e.running.Store(true)
	e.startTime = time.Now()
}

// Stop halts the HFT engine
func (e *HFTEngine) Stop() {
	e.running.Store(false)
}

// IsRunning returns whether the engine is running
func (e *HFTEngine) IsRunning() bool {
	return e.running.Load()
}

// GetOrCreateOrderbook gets or creates an orderbook for a symbol
func (e *HFTEngine) GetOrCreateOrderbook(symbol, exchange string) *Orderbook {
	key := exchange + ":" + symbol
	
	if ob, ok := e.orderbooks.Load(key); ok {
		return ob.(*Orderbook)
	}

	ob := NewOrderbook(symbol, exchange, e.config.OrderbookDepth)
	actual, loaded := e.orderbooks.LoadOrStore(key, ob)
	if loaded {
		ob = actual.(*Orderbook)
	}
	
	return ob
}

// GetOrderbook returns the orderbook for a symbol
func (e *HFTEngine) GetOrderbook(symbol, exchange string) *Orderbook {
	key := exchange + ":" + symbol
	if ob, ok := e.orderbooks.Load(key); ok {
		return ob.(*Orderbook)
	}
	return nil
}

// ProcessSnapshot processes an orderbook snapshot
func (e *HFTEngine) ProcessSnapshot(snapshot *OrderbookSnapshot) *TradingSignal {
	start := time.Now()
	defer func() {
		e.engineLatency.Record(time.Since(start).Nanoseconds())
	}()

	ob := e.GetOrCreateOrderbook(snapshot.Symbol, snapshot.Exchange)
	processingNs := ob.ApplySnapshot(snapshot)
	
	e.totalUpdates.Add(1)

	// Check if within latency budget
	if processingNs > e.config.MaxLatencyNs {
		// Log warning - exceeding latency budget
	}

	// Evaluate strategies if running
	if e.running.Load() {
		return e.evaluateStrategies(ob)
	}
	
	return nil
}

// ProcessDelta processes an orderbook delta update
func (e *HFTEngine) ProcessDelta(update *OrderbookUpdate) *TradingSignal {
	start := time.Now()
	defer func() {
		e.engineLatency.Record(time.Since(start).Nanoseconds())
	}()

	ob := e.GetOrCreateOrderbook(update.Symbol, update.Exchange)
	processingNs := ob.ApplyDelta(update)
	
	e.totalUpdates.Add(1)

	// Check if within latency budget
	if processingNs > e.config.MaxLatencyNs {
		// Log warning - exceeding latency budget
	}

	// Evaluate strategies if running
	if e.running.Load() {
		return e.evaluateStrategies(ob)
	}
	
	return nil
}

// evaluateStrategies runs all strategies and returns the strongest signal
func (e *HFTEngine) evaluateStrategies(ob *Orderbook) *TradingSignal {
	start := time.Now()
	defer func() {
		e.signalLatency.Record(time.Since(start).Nanoseconds())
	}()

	metrics := ob.GetMetrics()
	
	var bestSignal *TradingSignal
	
	for _, strategy := range e.strategies {
		signal := strategy.Evaluate(ob, metrics)
		if signal != nil && signal.Strength >= e.config.SignalThreshold {
			if bestSignal == nil || signal.Strength > bestSignal.Strength {
				bestSignal = signal
			}
		}
	}
	
	if bestSignal != nil {
		e.addSignal(*bestSignal)
		e.totalSignals.Add(1)
		
		// Update signal type counter
		counter, _ := e.signalsByType.LoadOrStore(bestSignal.Strategy, new(uint64))
		atomic.AddUint64(counter.(*uint64), 1)
	}
	
	return bestSignal
}

// addSignal adds a signal to the history
func (e *HFTEngine) addSignal(signal TradingSignal) {
	e.signalsMutex.Lock()
	defer e.signalsMutex.Unlock()
	
	e.signals = append(e.signals, signal)
	
	// Keep only recent signals
	if len(e.signals) > e.maxSignals {
		e.signals = e.signals[len(e.signals)-e.maxSignals:]
	}
}

// GetSignals returns recent trading signals
func (e *HFTEngine) GetSignals(limit int) []TradingSignal {
	e.signalsMutex.RLock()
	defer e.signalsMutex.RUnlock()
	
	if limit <= 0 || limit > len(e.signals) {
		limit = len(e.signals)
	}
	
	// Return most recent signals
	start := len(e.signals) - limit
	if start < 0 {
		start = 0
	}
	
	result := make([]TradingSignal, limit)
	copy(result, e.signals[start:])
	
	return result
}

// GetLatencyStats returns engine latency statistics
func (e *HFTEngine) GetLatencyStats() map[string]LatencyStats {
	return map[string]LatencyStats{
		"engine":  e.engineLatency.GetStats(),
		"signal":  e.signalLatency.GetStats(),
	}
}

// GetMetrics returns engine metrics
func (e *HFTEngine) GetMetrics() map[string]interface{} {
	signalCounts := make(map[string]uint64)
	e.signalsByType.Range(func(key, value interface{}) bool {
		signalCounts[key.(string)] = atomic.LoadUint64(value.(*uint64))
		return true
	})

	return map[string]interface{}{
		"running":       e.running.Load(),
		"uptime_ms":     time.Since(e.startTime).Milliseconds(),
		"total_updates": e.totalUpdates.Load(),
		"total_signals": e.totalSignals.Load(),
		"signals_by_type": signalCounts,
		"orderbook_count": e.getOrderbookCount(),
	}
}

// getOrderbookCount returns the number of active orderbooks
func (e *HFTEngine) getOrderbookCount() int {
	count := 0
	e.orderbooks.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	return count
}

// GetAllOrderbooks returns all orderbook snapshots
func (e *HFTEngine) GetAllOrderbooks() map[string]*OrderbookSnapshot {
	result := make(map[string]*OrderbookSnapshot)
	e.orderbooks.Range(func(key, value interface{}) bool {
		ob := value.(*Orderbook)
		result[key.(string)] = ob.GetSnapshot()
		return true
	})
	return result
}
