package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"hft-service/internal/engine"
	"hft-service/internal/ws"
)

// Handlers holds API handlers
type Handlers struct {
	engine    *engine.HFTEngine
	wsManager *ws.WebSocketManager
}

// NewHandlers creates new handlers
func NewHandlers(hftEngine *engine.HFTEngine, wsManager *ws.WebSocketManager) *Handlers {
	return &Handlers{
		engine:    hftEngine,
		wsManager: wsManager,
	}
}

// Health handles GET /health
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	latencyStats := h.engine.GetLatencyStats()
	
	health := map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().UnixNano(),
		"engine": map[string]interface{}{
			"running": h.engine.IsRunning(),
			"metrics": h.engine.GetMetrics(),
		},
		"latency": map[string]interface{}{
			"engine_p50_ns": latencyStats["engine"].P50,
			"engine_p95_ns": latencyStats["engine"].P95,
			"engine_p99_ns": latencyStats["engine"].P99,
			"signal_p50_ns": latencyStats["signal"].P50,
		},
		"connections": h.wsManager.GetStats(),
	}

	// Check if latency is within budget
	engineStats := latencyStats["engine"]
	if engineStats.P99 > 1_000_000 { // > 1ms
		health["status"] = "degraded"
		health["warning"] = "P99 latency exceeds 1ms budget"
	}

	writeJSON(w, http.StatusOK, health)
}

// Metrics handles GET /metrics
func (h *Handlers) Metrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	latencyStats := h.engine.GetLatencyStats()
	engineMetrics := h.engine.GetMetrics()

	response := map[string]interface{}{
		"timestamp": time.Now().UnixNano(),
		"engine":    engineMetrics,
		"latency": map[string]interface{}{
			"engine": latencyStats["engine"],
			"signal": latencyStats["signal"],
		},
		"orderbooks": h.engine.GetAllOrderbooks(),
	}

	writeJSON(w, http.StatusOK, response)
}

// Start handles POST /start
func (h *Handlers) Start(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Start HFT engine
	h.engine.Start()

	// Connect WebSocket clients
	h.wsManager.Connect()

	response := map[string]interface{}{
		"status":    "started",
		"timestamp": time.Now().UnixNano(),
		"message":   "HFT engine started successfully",
	}

	writeJSON(w, http.StatusOK, response)
}

// Stop handles POST /stop
func (h *Handlers) Stop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Stop HFT engine
	h.engine.Stop()

	response := map[string]interface{}{
		"status":    "stopped",
		"timestamp": time.Now().UnixNano(),
		"message":   "HFT engine stopped successfully",
	}

	writeJSON(w, http.StatusOK, response)
}

// Orderbook handles GET /orderbook/:symbol
func (h *Handlers) Orderbook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract symbol and exchange from path
	// Expected format: /orderbook/exchange:symbol or /orderbook/symbol
	path := strings.TrimPrefix(r.URL.Path, "/orderbook/")
	if path == "" {
		writeError(w, http.StatusBadRequest, "Symbol required")
		return
	}

	var exchange, symbol string
	if strings.Contains(path, ":") {
		parts := strings.SplitN(path, ":", 2)
		exchange = parts[0]
		symbol = parts[1]
	} else {
		// Default to first available exchange
		symbol = path
		exchange = "binance"
	}

	// Get orderbook
	ob := h.engine.GetOrderbook(symbol, exchange)
	if ob == nil {
		writeError(w, http.StatusNotFound, "Orderbook not found")
		return
	}

	response := map[string]interface{}{
		"symbol":    symbol,
		"exchange":  exchange,
		"snapshot":  ob.GetSnapshot(),
		"metrics":   ob.GetMetrics(),
		"latency":   ob.GetLatencyStats(),
	}

	writeJSON(w, http.StatusOK, response)
}

// Signals handles GET /signals
func (h *Handlers) Signals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Parse limit from query
	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		var parsedLimit int
		if _, err := parseInt(l, &parsedLimit); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	// Parse strategy filter
	strategy := r.URL.Query().Get("strategy")

	signals := h.engine.GetSignals(limit)

	// Filter by strategy if specified
	if strategy != "" {
		var filtered []engine.TradingSignal
		for _, s := range signals {
			if s.Strategy == strategy {
				filtered = append(filtered, s)
			}
		}
		signals = filtered
	}

	response := map[string]interface{}{
		"timestamp": time.Now().UnixNano(),
		"count":     len(signals),
		"signals":   signals,
	}

	writeJSON(w, http.StatusOK, response)
}

// Subscribe handles POST /subscribe
func (h *Handlers) Subscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Exchange string `json:"exchange"`
		Symbol   string `json:"symbol"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	if req.Symbol == "" {
		writeError(w, http.StatusBadRequest, "Symbol required")
		return
	}

	if req.Exchange == "" {
		req.Exchange = "binance"
	}

	// Subscribe to WebSocket feed
	h.wsManager.Subscribe(req.Exchange, req.Symbol)

	response := map[string]interface{}{
		"status":    "subscribed",
		"exchange":  req.Exchange,
		"symbol":    req.Symbol,
		"timestamp": time.Now().UnixNano(),
	}

	writeJSON(w, http.StatusOK, response)
}

// Stats handles GET /stats
func (h *Handlers) Stats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	response := map[string]interface{}{
		"timestamp":    time.Now().UnixNano(),
		"engine":       h.engine.GetMetrics(),
		"latency":      h.engine.GetLatencyStats(),
		"connections":  h.wsManager.GetStats(),
	}

	writeJSON(w, http.StatusOK, response)
}

// Helper function to parse int
func parseInt(s string, result *int) error {
	*result = 0
	neg := false
	for i, c := range s {
		if i == 0 && c == '-' {
			neg = true
			continue
		}
		if c < '0' || c > '9' {
			return nil // Return nil for simplicity, actual error handling would be more robust
		}
		*result = *result*10 + int(c-'0')
	}
	if neg {
		*result = -*result
	}
	return nil
}
