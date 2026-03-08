package api

import (
        "context"
        "encoding/json"
        "log"
        "net/http"
        "os"
        "strings"
        "time"

        "hft-service/internal/engine"
        "hft-service/internal/ws"

        "github.com/prometheus/client_golang/prometheus/promhttp"
)

// Server represents the HTTP API server
type Server struct {
        server         *http.Server
        engine         *engine.HFTEngine
        wsManager      *ws.WebSocketManager
        port           int
        handlers       *Handlers
        allowedOrigins []string
}

// NewServer creates a new API server
func NewServer(hftEngine *engine.HFTEngine, wsManager *ws.WebSocketManager, port int) *Server {
        handlers := NewHandlers(hftEngine, wsManager)
        
        // Get allowed origins from environment
        allowedOrigins := getAllowedOrigins()
        
        mux := http.NewServeMux()
        
        // Register routes
        mux.HandleFunc("/health", handlers.Health)
        mux.HandleFunc("/metrics", handlers.Metrics)
        mux.HandleFunc("/start", handlers.Start)
        mux.HandleFunc("/stop", handlers.Stop)
        mux.HandleFunc("/orderbook/", handlers.Orderbook)
        mux.HandleFunc("/signals", handlers.Signals)
        mux.HandleFunc("/subscribe", handlers.Subscribe)
        mux.HandleFunc("/stats", handlers.Stats)
        mux.Handle("/prometheus", promhttp.Handler())
        
        server := &http.Server{
                Addr:         ":" + itoa(port),
                Handler:      corsMiddleware(allowedOrigins, loggingMiddleware(mux)),
                ReadTimeout:  10 * time.Second,
                WriteTimeout: 10 * time.Second,
                IdleTimeout:  60 * time.Second,
        }
        
        return &Server{
                server:         server,
                engine:         hftEngine,
                wsManager:      wsManager,
                port:           port,
                handlers:       handlers,
                allowedOrigins: allowedOrigins,
        }
}

// getAllowedOrigins returns CORS allowed origins from environment
func getAllowedOrigins() []string {
        env := os.Getenv("ENVIRONMENT")
        if env == "" {
                env = "development"
        }
        
        allowedOriginsEnv := os.Getenv("ALLOWED_ORIGINS")
        
        if allowedOriginsEnv != "" {
                origins := strings.Split(allowedOriginsEnv, ",")
                result := make([]string, 0, len(origins))
                for _, origin := range origins {
                        trimmed := strings.TrimSpace(origin)
                        if trimmed != "" {
                                result = append(result, trimmed)
                        }
                }
                return result
        }
        
        // Production without configured origins
        if env == "production" || env == "prod" || env == "staging" {
                log.Println("[SECURITY] WARNING: ALLOWED_ORIGINS not set in", env, "environment")
                log.Println("[SECURITY] CORS will block all cross-origin requests")
                return []string{} // Block all cross-origin requests
        }
        
        // Development defaults
        return []string{
                "http://localhost:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:3001",
        }
}

// Start starts the HTTP server
func (s *Server) Start() error {
        log.Printf("API server starting on port %d", s.port)
        return s.server.ListenAndServe()
}

// Stop stops the HTTP server
func (s *Server) Stop() {
        ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
        defer cancel()
        s.server.Shutdown(ctx)
}

// Middleware functions
func corsMiddleware(allowedOrigins []string, next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                origin := r.Header.Get("Origin")
                
                // Handle preflight OPTIONS request
                if r.Method == "OPTIONS" {
                        // Check if origin is allowed
                        if isOriginAllowed(origin, allowedOrigins) {
                                w.Header().Set("Access-Control-Allow-Origin", origin)
                                w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                                w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
                                w.Header().Set("Access-Control-Allow-Credentials", "true")
                                w.Header().Set("Access-Control-Max-Age", "86400") // 24 hours
                                w.WriteHeader(http.StatusOK)
                        } else {
                                // Origin not allowed
                                if origin != "" {
                                        log.Printf("[CORS] Blocked preflight request from unauthorized origin: %s", origin)
                                }
                                w.WriteHeader(http.StatusForbidden)
                        }
                        return
                }
                
                // For regular requests, check origin and set headers
                if isOriginAllowed(origin, allowedOrigins) {
                        w.Header().Set("Access-Control-Allow-Origin", origin)
                        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                        w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
                        w.Header().Set("Access-Control-Allow-Credentials", "true")
                } else if origin != "" {
                        // Log blocked requests (but don't fail them - let the application handle auth)
                        log.Printf("[CORS] Request from unauthorized origin (no CORS headers set): %s", origin)
                }
                
                next.ServeHTTP(w, r)
        })
}

// isOriginAllowed checks if the origin is in the allowed list
func isOriginAllowed(origin string, allowedOrigins []string) bool {
        // Allow requests without origin (like curl, Postman, mobile apps)
        if origin == "" {
                return true
        }
        
        // If no origins configured in production, block all
        if len(allowedOrigins) == 0 {
                return false
        }
        
        // Check exact match
        for _, allowed := range allowedOrigins {
                if allowed == origin {
                        return true
                }
                // Support wildcard subdomains
                if strings.HasPrefix(allowed, "*.") {
                        domain := allowed[2:]
                        if strings.HasSuffix(origin, domain) {
                                return true
                        }
                }
        }
        
        return false
}

func loggingMiddleware(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                start := time.Now()
                next.ServeHTTP(w, r)
                duration := time.Since(start)
                log.Printf("%s %s - %v", r.Method, r.URL.Path, duration)
        })
}

// Helper function to convert int to string
func itoa(i int) string {
        if i == 0 {
                return "0"
        }
        
        neg := false
        if i < 0 {
                neg = true
                i = -i
        }
        
        var digits []byte
        for i > 0 {
                digits = append([]byte{byte('0' + i%10)}, digits...)
                i /= 10
        }
        
        if neg {
                digits = append([]byte{'-'}, digits...)
        }
        
        return string(digits)
}

// JSON response helpers
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(status)
        json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
        writeJSON(w, status, map[string]string{"error": message})
}
