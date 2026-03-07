package ws

import (
	"encoding/json"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"hft-service/internal/engine"

	"github.com/gorilla/websocket"
)

// ExchangeClient represents a WebSocket client for an exchange
type ExchangeClient struct {
	name       string
	wsUrl      string
	conn       *websocket.Conn
	engine     *engine.HFTEngine
	
	// Connection state
	connected   atomic.Bool
	connecting  atomic.Bool
	reconnectCh chan struct{}
	stopCh      chan struct{}
	
	// Subscriptions
	subscriptions sync.Map // map[string]bool
	symbols      []string
	
	// Message handling
	msgCh       chan []byte
	errCh       chan error
	
	// Ping/pong
	lastPong    atomic.Int64
	pingTicker  *time.Ticker
	
	// Stats
	msgCount    atomic.Uint64
	bytesRx     atomic.Uint64
	bytesTx     atomic.Uint64
}

// NewExchangeClient creates a new exchange WebSocket client
func NewExchangeClient(name, wsUrl string, hftEngine *engine.HFTEngine) *ExchangeClient {
	return &ExchangeClient{
		name:        name,
		wsUrl:       wsUrl,
		engine:      hftEngine,
		reconnectCh: make(chan struct{}, 1),
		stopCh:      make(chan struct{}),
		msgCh:       make(chan []byte, 10000),
		errCh:       make(chan error, 10),
		symbols:     make([]string, 0),
	}
}

// Connect establishes the WebSocket connection
func (c *ExchangeClient) Connect() error {
	if c.connecting.Load() || c.connected.Load() {
		return nil
	}
	
	c.connecting.Store(true)
	defer c.connecting.Store(false)
	
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	
	conn, _, err := dialer.Dial(c.wsUrl, nil)
	if err != nil {
		return err
	}
	
	c.conn = conn
	c.connected.Store(true)
	c.lastPong.Store(time.Now().UnixNano())
	
	log.Printf("[%s] Connected to %s", c.name, c.wsUrl)
	
	// Start message handler
	go c.messageHandler()
	
	// Start ping/pong handler
	go c.pingHandler()
	
	// Resubscribe to symbols
	c.resubscribe()
	
	return nil
}

// Disconnect closes the WebSocket connection
func (c *ExchangeClient) Disconnect() {
	if !c.connected.Load() {
		return
	}
	
	c.connected.Store(false)
	if c.conn != nil {
		c.conn.Close()
	}
	
	log.Printf("[%s] Disconnected", c.name)
}

// Stop stops the client
func (c *ExchangeClient) Stop() {
	close(c.stopCh)
	c.Disconnect()
}

// Subscribe subscribes to orderbook updates for a symbol
func (c *ExchangeClient) Subscribe(symbol string) {
	key := c.name + ":" + symbol
	c.subscriptions.Store(key, true)
	c.symbols = append(c.symbols, symbol)
	
	if c.connected.Load() {
		c.sendSubscribe(symbol)
	}
}

// resubscribe resubscribes to all symbols after reconnection
func (c *ExchangeClient) resubscribe() {
	for _, symbol := range c.symbols {
		c.sendSubscribe(symbol)
	}
}

// sendSubscribe sends the subscription message
func (c *ExchangeClient) sendSubscribe(symbol string) {
	var msg interface{}
	
	switch c.name {
	case "binance":
		msg = map[string]interface{}{
			"method": "SUBSCRIBE",
			"params": []string{symbol + "@depth20@100ms"},
			"id":     time.Now().UnixNano(),
		}
	case "bybit":
		msg = map[string]interface{}{
			"op":   "subscribe",
			"args": []string{"orderbook.50." + symbol},
		}
	}
	
	if msg != nil {
		c.sendJSON(msg)
	}
}

// sendJSON sends a JSON message
func (c *ExchangeClient) sendJSON(msg interface{}) error {
	if !c.connected.Load() || c.conn == nil {
		return nil
	}
	
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	
	err = c.conn.WriteMessage(websocket.TextMessage, data)
	if err != nil {
		return err
	}
	
	c.bytesTx.Add(uint64(len(data)))
	return nil
}

// messageHandler handles incoming messages
func (c *ExchangeClient) messageHandler() {
	for {
		select {
		case <-c.stopCh:
			return
		default:
			if !c.connected.Load() {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			
			_, data, err := c.conn.ReadMessage()
			if err != nil {
				if c.connected.Load() {
					c.errCh <- err
				}
				continue
			}
			
			c.msgCount.Add(1)
			c.bytesRx.Add(uint64(len(data)))
			
			// Process message
			c.processMessage(data)
		}
	}
}

// processMessage processes a WebSocket message
func (c *ExchangeClient) processMessage(data []byte) {
	start := time.Now()
	
	switch c.name {
	case "binance":
		c.processBinanceMessage(data)
	case "bybit":
		c.processBybitMessage(data)
	}
	
	latency := time.Since(start).Nanoseconds()
	if latency > 1_000_000 { // > 1ms
		log.Printf("[%s] Message processing took %dns", c.name, latency)
	}
}

// processBinanceMessage processes a Binance depth message
func (c *ExchangeClient) processBinanceMessage(data []byte) {
	// Binance depth message format
	var msg struct {
		LastUpdateID int64          `json:"lastUpdateId"`
		Bids         [][]string     `json:"bids"`
		Asks         [][]string     `json:"asks"`
		Symbol       string         `json:"s"`
	}
	
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}
	
	// Skip if not a depth update
	if msg.Symbol == "" || len(msg.Bids) == 0 {
		return
	}
	
	// Convert to orderbook snapshot
	snapshot := &engine.OrderbookSnapshot{
		Symbol:    msg.Symbol,
		Exchange:  "binance",
		Timestamp: time.Now().UnixNano(),
		SeqNum:    uint64(msg.LastUpdateID),
	}
	
	for _, bid := range msg.Bids {
		price := parseFloat(bid[0])
		qty := parseFloat(bid[1])
		if price > 0 {
			snapshot.Bids = append(snapshot.Bids, engine.PriceLevel{
				Price:    price,
				Quantity: qty,
			})
		}
	}
	
	for _, ask := range msg.Asks {
		price := parseFloat(ask[0])
		qty := parseFloat(ask[1])
		if price > 0 {
			snapshot.Asks = append(snapshot.Asks, engine.PriceLevel{
				Price:    price,
				Quantity: qty,
			})
		}
	}
	
	// Process through HFT engine
	if c.engine != nil {
		c.engine.ProcessSnapshot(snapshot)
	}
}

// processBybitMessage processes a Bybit orderbook message
func (c *ExchangeClient) processBybitMessage(data []byte) {
	// Bybit V5 orderbook message format
	var msg struct {
		Topic string `json:"topic"`
		Type  string `json:"type"`
		TS    int64  `json:"ts"`
		Data  struct {
			S      [][]string `json:"s"` // Bids
			B      [][]string `json:"b"` // Asks (note: Bybit uses 'b' for asks in delta)
			U      int64      `json:"u"` // Update ID
			Seq    int64      `json:"seq"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}
	
	// Skip if not an orderbook message
	if msg.Topic == "" {
		return
	}
	
	// Extract symbol from topic (e.g., "orderbook.50.BTCUSDT")
	var symbol string
	if msg.Topic != "" {
		parts := splitByDot(msg.Topic)
		if len(parts) >= 3 {
			symbol = parts[2]
		}
	}
	
	if symbol == "" {
		return
	}
	
	// Convert to orderbook snapshot/update
	snapshot := &engine.OrderbookSnapshot{
		Symbol:    symbol,
		Exchange:  "bybit",
		Timestamp: time.Now().UnixNano(),
		SeqNum:    uint64(msg.Data.U),
	}
	
	// Bybit sends 'b' for bids and 'a' for asks
	var bidsData, asksData [][]string
	
	if msg.Type == "snapshot" {
		// For snapshot, data contains full book
		type SnapshotData struct {
			B [][]string `json:"b"` // Bids
			A [][]string `json:"a"` // Asks
		}
		var snap SnapshotData
		if err := json.Unmarshal(data, &struct {
			Topic string       `json:"topic"`
			Type  string       `json:"type"`
			TS    int64        `json:"ts"`
			Data  SnapshotData `json:"data"`
		}{}); err == nil {
			bidsData = snap.B
			asksData = snap.A
		}
	} else {
		// For delta, check the data structure
		bidsData = msg.Data.S
		asksData = msg.Data.B
	}
	
	for _, bid := range bidsData {
		if len(bid) >= 2 {
			price := parseFloat(bid[0])
			qty := parseFloat(bid[1])
			if price > 0 {
				snapshot.Bids = append(snapshot.Bids, engine.PriceLevel{
					Price:    price,
					Quantity: qty,
				})
			}
		}
	}
	
	for _, ask := range asksData {
		if len(ask) >= 2 {
			price := parseFloat(ask[0])
			qty := parseFloat(ask[1])
			if price > 0 {
				snapshot.Asks = append(snapshot.Asks, engine.PriceLevel{
					Price:    price,
					Quantity: qty,
				})
			}
		}
	}
	
	// Process through HFT engine
	if c.engine != nil {
		if msg.Type == "snapshot" {
			c.engine.ProcessSnapshot(snapshot)
		} else {
			update := &engine.OrderbookUpdate{
				Symbol:    snapshot.Symbol,
				Exchange:  snapshot.Exchange,
				Bids:      snapshot.Bids,
				Asks:      snapshot.Asks,
				Timestamp: snapshot.Timestamp,
				SeqNum:    snapshot.SeqNum,
			}
			c.engine.ProcessDelta(update)
		}
	}
}

// pingHandler handles ping/pong keepalive
func (c *ExchangeClient) pingHandler() {
	c.pingTicker = time.NewTicker(20 * time.Second)
	defer c.pingTicker.Stop()
	
	for {
		select {
		case <-c.stopCh:
			return
		case <-c.pingTicker.C:
			if !c.connected.Load() {
				continue
			}
			
			// Send ping
			if err := c.sendPing(); err != nil {
				log.Printf("[%s] Ping failed: %v", c.name, err)
				c.triggerReconnect()
			}
		}
	}
}

// sendPing sends a ping message
func (c *ExchangeClient) sendPing() error {
	switch c.name {
	case "binance":
		// Binance doesn't require explicit ping
		return nil
	case "bybit":
		return c.sendJSON(map[string]string{"op": "ping"})
	}
	return nil
}

// triggerReconnect triggers a reconnection
func (c *ExchangeClient) triggerReconnect() {
	select {
	case c.reconnectCh <- struct{}{}:
	default:
	}
}

// GetStats returns connection statistics
func (c *ExchangeClient) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"name":      c.name,
		"connected": c.connected.Load(),
		"msg_count": c.msgCount.Load(),
		"bytes_rx":  c.bytesRx.Load(),
		"bytes_tx":  c.bytesTx.Load(),
		"symbols":   len(c.symbols),
	}
}

// WebSocketManager manages multiple exchange connections
type WebSocketManager struct {
	clients sync.Map // map[string]*ExchangeClient
	engine  *engine.HFTEngine
}

// NewWebSocketManager creates a new WebSocket manager
func NewWebSocketManager(hftEngine *engine.HFTEngine) *WebSocketManager {
	return &WebSocketManager{
		engine: hftEngine,
	}
}

// AddExchange adds an exchange connection
func (m *WebSocketManager) AddExchange(name, wsUrl string) {
	client := NewExchangeClient(name, wsUrl, m.engine)
	m.clients.Store(name, client)
}

// Connect connects to all exchanges
func (m *WebSocketManager) Connect() {
	m.clients.Range(func(key, value interface{}) bool {
		client := value.(*ExchangeClient)
		go func() {
			if err := client.Connect(); err != nil {
				log.Printf("[%s] Connection failed: %v", client.name, err)
			}
		}()
		return true
	})
}

// Subscribe subscribes to a symbol on an exchange
func (m *WebSocketManager) Subscribe(exchange, symbol string) {
	if client, ok := m.clients.Load(exchange); ok {
		client.(*ExchangeClient).Subscribe(symbol)
	}
}

// Stop stops all connections
func (m *WebSocketManager) Stop() {
	m.clients.Range(func(key, value interface{}) bool {
		value.(*ExchangeClient).Stop()
		return true
	})
}

// GetStats returns statistics for all connections
func (m *WebSocketManager) GetStats() map[string]interface{} {
	stats := make(map[string]interface{})
	m.clients.Range(func(key, value interface{}) bool {
		name := key.(string)
		stats[name] = value.(*ExchangeClient).GetStats()
		return true
	})
	return stats
}

// IsConnected returns whether a specific exchange is connected
func (m *WebSocketManager) IsConnected(exchange string) bool {
	if client, ok := m.clients.Load(exchange); ok {
		return client.(*ExchangeClient).connected.Load()
	}
	return false
}

// Helper functions
func parseFloat(s string) float64 {
	var f float64
	for _, c := range s {
		if c >= '0' && c <= '9' || c == '.' || c == '-' {
			f = f*10 + float64(c-'0')
			if c == '.' {
				// Handle decimal (simplified)
			}
		}
	}
	return f
}

func splitByDot(s string) []string {
	var parts []string
	start := 0
	for i, c := range s {
		if c == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		parts = append(parts, s[start:])
	}
	return parts
}
