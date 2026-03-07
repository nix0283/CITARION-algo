package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"hft-service/internal/api"
	"hft-service/internal/engine"
	"hft-service/internal/ws"

	"gopkg.in/yaml.v3"
)

// Config represents the main configuration structure
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Exchanges ExchangesConfig `yaml:"exchanges"`
	HFT      HFTConfig      `yaml:"hft"`
}

// ServerConfig holds HTTP server configuration
type ServerConfig struct {
	Port int `yaml:"port"`
}

// ExchangesConfig holds exchange connection settings
type ExchangesConfig struct {
	Binance ExchangeConfig `yaml:"binance"`
	Bybit   ExchangeConfig `yaml:"bybit"`
}

// ExchangeConfig holds individual exchange settings
type ExchangeConfig struct {
	Enabled   bool   `yaml:"enabled"`
	WsUrl     string `yaml:"ws_url"`
	ApiKey    string `yaml:"api_key"`
	SecretKey string `yaml:"secret_key"`
}

// HFTConfig holds HFT engine settings
type HFTConfig struct {
	MaxLatencyNs       int64   `yaml:"max_latency_ns"`
	OrderbookDepth     int     `yaml:"orderbook_depth"`
	SignalThreshold    float64 `yaml:"signal_threshold"`
	ImbalanceThreshold float64 `yaml:"imbalance_threshold"`
	MomentumWindow     int     `yaml:"momentum_window"`
	MomentumThreshold  float64 `yaml:"momentum_threshold"`
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

func main() {
	// Load configuration
	config, err := loadConfig("config/config.yaml")
	if err != nil {
		log.Printf("Warning: Could not load config file, using defaults: %v", err)
		config = &Config{
			Server: ServerConfig{Port: 3005},
			Exchanges: ExchangesConfig{
				Binance: ExchangeConfig{
					Enabled: true,
					WsUrl:   "wss://fstream.binance.com/ws",
				},
				Bybit: ExchangeConfig{
					Enabled: true,
					WsUrl:   "wss://stream.bybit.com/v5/public/linear",
				},
			},
			HFT: HFTConfig{
				MaxLatencyNs:       1_000_000, // 1ms in nanoseconds
				OrderbookDepth:     20,
				SignalThreshold:    0.7,
				ImbalanceThreshold: 0.3,
				MomentumWindow:     100,
				MomentumThreshold:  0.002, // 0.2%
			},
		}
	}

	// Initialize HFT engine
	hftEngine := engine.NewHFTEngine(engine.HFTEngineConfig{
		MaxLatencyNs:       config.HFT.MaxLatencyNs,
		OrderbookDepth:     config.HFT.OrderbookDepth,
		SignalThreshold:    config.HFT.SignalThreshold,
		ImbalanceThreshold: config.HFT.ImbalanceThreshold,
		MomentumWindow:     config.HFT.MomentumWindow,
		MomentumThreshold:  config.HFT.MomentumThreshold,
	})

	// Initialize WebSocket manager
	wsManager := ws.NewWebSocketManager(hftEngine)

	// Configure exchanges
	if config.Exchanges.Binance.Enabled {
		wsManager.AddExchange("binance", config.Exchanges.Binance.WsUrl)
	}
	if config.Exchanges.Bybit.Enabled {
		wsManager.AddExchange("bybit", config.Exchanges.Bybit.WsUrl)
	}

	// Initialize API server
	apiServer := api.NewServer(hftEngine, wsManager, config.Server.Port)

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Start components
	go func() {
		if err := apiServer.Start(); err != nil {
			log.Fatalf("API server error: %v", err)
		}
	}()

	log.Printf("HFT Service started on port %d", config.Server.Port)
	log.Printf("Sub-millisecond latency target: %dns", config.HFT.MaxLatencyNs)

	// Wait for shutdown signal
	<-sigChan
	log.Println("Shutting down HFT service...")

	// Stop components
	wsManager.Stop()
	hftEngine.Stop()
	apiServer.Stop()

	log.Println("HFT Service stopped")
}
