/**
 * Unified Exchange Manager
 * 
 * Based on Profitmaker's CCXT Instance Manager pattern.
 * Provides centralized management of exchange connections with
 * caching, fallback logic, and lifecycle management.
 * 
 * Key features:
 * - Exchange instance caching and reuse
 * - Automatic reconnection with exponential backoff
 * - Connection health monitoring
 * - Credential rotation support
 * - Rate limit coordination
 */

import { ExchangeType } from '@/lib/types';

// ==================== Types ====================

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // For OKX, Kucoin
  subaccount?: string; // For FTX (legacy), Bybit subaccounts
}

export interface ExchangeConfig {
  exchange: ExchangeType;
  credentials: ExchangeCredentials;
  sandbox?: boolean;
  rateLimit?: RateLimitConfig;
  timeout?: number;
  retries?: number;
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxOrdersPerSecond: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

export interface ExchangeInstance {
  id: string;
  exchange: ExchangeType;
  credentials: ExchangeCredentials;
  status: 'connected' | 'disconnected' | 'error' | 'rate_limited';
  lastUsed: number;
  requestCount: number;
  errorCount: number;
  lastError?: string;
  connectedAt: number;
}

export interface ExchangeHealth {
  exchange: ExchangeType;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  successRate: number;
  lastCheck: number;
  errorRate: number;
}

// ==================== Exchange Instance Manager ====================

/**
 * Centralized manager for exchange instances.
 * Implements caching, health monitoring, and automatic failover.
 */
export class ExchangeInstanceManager {
  private static instance: ExchangeInstanceManager;
  private instances: Map<string, ExchangeInstance> = new Map();
  private credentials: Map<ExchangeType, ExchangeCredentials> = new Map();
  private healthStatus: Map<ExchangeType, ExchangeHealth> = new Map();
  private rateLimiters: Map<ExchangeType, RateLimiter> = new Map();
  
  private readonly DEFAULT_RATE_LIMIT: RateLimitConfig = {
    maxRequestsPerMinute: 1200,
    maxOrdersPerSecond: 50,
    backoffMultiplier: 1.5,
    maxBackoffMs: 60000,
  };

  private constructor() {}

  static getInstance(): ExchangeInstanceManager {
    if (!ExchangeInstanceManager.instance) {
      ExchangeInstanceManager.instance = new ExchangeInstanceManager();
    }
    return ExchangeInstanceManager.instance;
  }

  /**
   * Register credentials for an exchange
   */
  registerCredentials(exchange: ExchangeType, credentials: ExchangeCredentials): void {
    this.credentials.set(exchange, credentials);
    
    // Initialize rate limiter
    if (!this.rateLimiters.has(exchange)) {
      this.rateLimiters.set(exchange, new RateLimiter(this.DEFAULT_RATE_LIMIT));
    }
  }

  /**
   * Get or create exchange instance with caching
   */
  getInstance(exchange: ExchangeType, config?: Partial<ExchangeConfig>): ExchangeInstance | null {
    const credentials = config?.credentials || this.credentials.get(exchange);
    if (!credentials) {
      console.warn(`No credentials registered for ${exchange}`);
      return null;
    }

    const instanceKey = this.getInstanceKey(exchange, credentials);
    
    // Check cache
    const cached = this.instances.get(instanceKey);
    if (cached && this.isInstanceHealthy(cached)) {
      cached.lastUsed = Date.now();
      return cached;
    }

    // Create new instance
    const newInstance = this.createInstance(exchange, credentials, config);
    if (newInstance) {
      this.instances.set(instanceKey, newInstance);
    }

    return newInstance;
  }

  /**
   * Get instance key for caching
   */
  private getInstanceKey(exchange: ExchangeType, credentials: ExchangeCredentials): string {
    // Create unique key based on exchange and credential hash
    const credHash = this.hashCredentials(credentials);
    return `${exchange}:${credHash}`;
  }

  /**
   * Hash credentials for cache key (partial, for identification only)
   */
  private hashCredentials(credentials: ExchangeCredentials): string {
    const key = credentials.apiKey.slice(-8);
    const sub = credentials.subaccount || 'main';
    return `${key}:${sub}`;
  }

  /**
   * Check if instance is healthy
   */
  private isInstanceHealthy(instance: ExchangeInstance): boolean {
    if (instance.status === 'error') {
      // Check if enough time has passed for retry
      const timeSinceLastError = Date.now() - instance.lastUsed;
      return timeSinceLastError > 30000; // 30 second cooldown
    }
    
    if (instance.status === 'rate_limited') {
      const limiter = this.rateLimiters.get(instance.exchange);
      return limiter ? limiter.canRequest() : true;
    }

    return instance.status === 'connected' || instance.status === 'disconnected';
  }

  /**
   * Create new exchange instance
   */
  private createInstance(
    exchange: ExchangeType,
    credentials: ExchangeCredentials,
    config?: Partial<ExchangeConfig>
  ): ExchangeInstance {
    const instance: ExchangeInstance = {
      id: `${exchange}_${Date.now()}`,
      exchange,
      credentials,
      status: 'connected',
      lastUsed: Date.now(),
      requestCount: 0,
      errorCount: 0,
      connectedAt: Date.now(),
    };

    // Validate credentials
    this.validateCredentials(instance).then(valid => {
      instance.status = valid ? 'connected' : 'error';
      if (!valid) {
        instance.lastError = 'Invalid credentials';
      }
    });

    return instance;
  }

  /**
   * Validate exchange credentials
   */
  private async validateCredentials(instance: ExchangeInstance): Promise<boolean> {
    // In production, this would make a test API call
    // For now, we check that credentials exist
    const { apiKey, apiSecret } = instance.credentials;
    return !!(apiKey && apiSecret && apiKey.length > 0 && apiSecret.length > 0);
  }

  /**
   * Record request for rate limiting
   */
  recordRequest(exchange: ExchangeType): boolean {
    const limiter = this.rateLimiters.get(exchange);
    if (!limiter) return true;

    return limiter.recordRequest();
  }

  /**
   * Record error for health monitoring
   */
  recordError(exchange: ExchangeType, error: string): void {
    const health = this.healthStatus.get(exchange);
    if (health) {
      health.errorRate = Math.min(1, health.errorRate + 0.1);
      health.lastCheck = Date.now();
      
      if (health.errorRate > 0.5) {
        health.status = 'unhealthy';
      } else if (health.errorRate > 0.2) {
        health.status = 'degraded';
      }
    }

    // Update instance status
    for (const [, instance] of this.instances) {
      if (instance.exchange === exchange) {
        instance.errorCount++;
        instance.lastError = error;
        
        if (error.includes('rate limit') || error.includes('429')) {
          instance.status = 'rate_limited';
        }
      }
    }
  }

  /**
   * Get health status for all exchanges
   */
  getHealthStatus(): Map<ExchangeType, ExchangeHealth> {
    return new Map(this.healthStatus);
  }

  /**
   * Clear all cached instances
   */
  clearCache(): void {
    this.instances.clear();
  }

  /**
   * Remove instances for specific exchange
   */
  removeExchange(exchange: ExchangeType): void {
    for (const [key, instance] of this.instances) {
      if (instance.exchange === exchange) {
        this.instances.delete(key);
      }
    }
    this.credentials.delete(exchange);
    this.rateLimiters.delete(exchange);
    this.healthStatus.delete(exchange);
  }
}

// ==================== Rate Limiter ====================

/**
 * Token bucket rate limiter with exponential backoff
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private consecutiveErrors: number = 0;
  private backoffUntil: number = 0;

  constructor(private config: RateLimitConfig) {
    this.tokens = config.maxRequestsPerMinute;
    this.lastRefill = Date.now();
  }

  /**
   * Check if request is allowed
   */
  canRequest(): boolean {
    if (Date.now() < this.backoffUntil) {
      return false;
    }

    this.refillTokens();
    return this.tokens > 0;
  }

  /**
   * Record a request
   */
  recordRequest(): boolean {
    if (!this.canRequest()) {
      return false;
    }
    
    this.tokens--;
    this.consecutiveErrors = 0;
    return true;
  }

  /**
   * Record rate limit hit - apply backoff
   */
  recordRateLimit(): void {
    this.consecutiveErrors++;
    
    // Exponential backoff
    const backoffMs = Math.min(
      Math.pow(this.config.backoffMultiplier, this.consecutiveErrors) * 1000,
      this.config.maxBackoffMs
    );
    
    this.backoffUntil = Date.now() + backoffMs;
  }

  /**
   * Refill tokens based on time passed
   */
  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    
    // Refill at rate per minute
    const refillRate = this.config.maxRequestsPerMinute / 60000;
    const tokensToAdd = timePassed * refillRate;
    
    this.tokens = Math.min(
      this.config.maxRequestsPerMinute,
      this.tokens + tokensToAdd
    );
    
    this.lastRefill = now;
  }

  /**
   * Get time until next request is allowed
   */
  getTimeUntilAvailable(): number {
    if (Date.now() < this.backoffUntil) {
      return this.backoffUntil - Date.now();
    }
    
    if (this.tokens > 0) {
      return 0;
    }
    
    // Calculate time until token refill
    const refillRate = this.config.maxRequestsPerMinute / 60000;
    return Math.ceil(1000 / refillRate);
  }
}

// ==================== Exchange Connection Pool ====================

/**
 * Pool manager for multiple exchange connections
 */
export class ExchangeConnectionPool {
  private connections: Map<string, ExchangeConnection> = new Map();
  private manager: ExchangeInstanceManager;

  constructor() {
    this.manager = ExchangeInstanceManager.getInstance();
  }

  /**
   * Acquire connection for exchange
   */
  async acquire(exchange: ExchangeType): Promise<ExchangeConnection | null> {
    const instance = this.manager.getInstance(exchange);
    if (!instance) {
      return null;
    }

    const connectionId = instance.id;
    
    if (this.connections.has(connectionId)) {
      return this.connections.get(connectionId)!;
    }

    const connection = new ExchangeConnection(instance, this.manager);
    await connection.connect();
    
    this.connections.set(connectionId, connection);
    return connection;
  }

  /**
   * Release connection back to pool
   */
  release(connection: ExchangeConnection): void {
    // Connection stays in pool for reuse
    // Just update last used time
    connection.updateLastUsed();
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    for (const connection of this.connections.values()) {
      await connection.disconnect();
    }
    this.connections.clear();
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    exchangeBreakdown: Record<string, number>;
  } {
    let active = 0;
    const breakdown: Record<string, number> = {};

    for (const connection of this.connections.values()) {
      if (connection.isActive()) {
        active++;
      }
      
      const exchange = connection.getExchange();
      breakdown[exchange] = (breakdown[exchange] || 0) + 1;
    }

    return {
      totalConnections: this.connections.size,
      activeConnections: active,
      exchangeBreakdown: breakdown,
    };
  }
}

// ==================== Exchange Connection ====================

/**
 * Individual exchange connection wrapper
 */
export class ExchangeConnection {
  private status: 'connected' | 'disconnected' | 'error' = 'disconnected';
  private lastUsed: number = Date.now();
  private requestQueue: Array<() => Promise<void>> = [];

  constructor(
    private instance: ExchangeInstance,
    private manager: ExchangeInstanceManager
  ) {}

  async connect(): Promise<void> {
    // Initialize connection
    this.status = 'connected';
    this.instance.status = 'connected';
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
    this.instance.status = 'disconnected';
  }

  isActive(): boolean {
    return this.status === 'connected';
  }

  getExchange(): ExchangeType {
    return this.instance.exchange;
  }

  updateLastUsed(): void {
    this.lastUsed = Date.now();
    this.instance.lastUsed = this.lastUsed;
  }

  /**
   * Execute request with retry logic
   */
  async executeRequest<T>(
    requestFn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      onRetry,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Check rate limit
      if (!this.manager.recordRequest(this.instance.exchange)) {
        throw new Error('Rate limit exceeded');
      }

      try {
        const result = await requestFn();
        this.updateLastUsed();
        return result;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if we should retry
        if (!this.shouldRetry(error as Error, attempt, maxRetries)) {
          this.manager.recordError(this.instance.exchange, lastError.message);
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        
        if (onRetry) {
          onRetry(attempt + 1, delay, lastError);
        }

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private shouldRetry(error: Error, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) return false;

    const message = error.message.toLowerCase();
    
    // Retry on rate limits
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }

    // Retry on temporary errors
    if (message.includes('timeout') || message.includes('network') || message.includes('500')) {
      return true;
    }

    // Don't retry on authentication errors
    if (message.includes('401') || message.includes('403') || message.includes('invalid key')) {
      return false;
    }

    // Don't retry on insufficient balance
    if (message.includes('insufficient') || message.includes('balance')) {
      return false;
    }

    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, delay: number, error: Error) => void;
}

// ==================== Singleton Export ====================

export const exchangeManager = ExchangeInstanceManager.getInstance();
export const connectionPool = new ExchangeConnectionPool();
