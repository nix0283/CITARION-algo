/**
 * Exchange Circuit Breaker
 * 
 * Implements the circuit breaker pattern for exchange API calls to prevent
 * flooding a failing exchange with retry attempts.
 * 
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: All requests are blocked, waiting for timeout
 * - HALF_OPEN: Limited requests allowed to test if exchange recovered
 * 
 * Features:
 * - Per-exchange circuit breaker instances
 * - Configurable failure/success thresholds
 * - Half-open state for recovery testing
 * - Automatic state transitions
 */

import { AllExchangeId } from "./types";

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Circuit breaker configuration
 */
export interface ExchangeCircuitBreakerConfig {
  /** Number of consecutive failures before opening (default: 5) */
  failureThreshold: number;
  /** Number of consecutive successes to close from half-open (default: 1) */
  successThreshold: number;
  /** Time to wait in OPEN state before transitioning to HALF_OPEN (default: 30000ms) */
  openTimeout: number;
  /** Maximum number of test calls allowed in HALF_OPEN state (default: 3) */
  halfOpenMaxCalls: number;
  /** Enable logging (default: true) */
  enableLogging: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ExchangeCircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 1,
  openTimeout: 30000, // 30 seconds
  halfOpenMaxCalls: 3,
  enableLogging: true,
};

/**
 * Internal state tracking
 */
interface InternalState {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  openedAt?: Date;
  halfOpenCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  totalCalls: number;
}

/**
 * Exchange Circuit Breaker
 * 
 * Usage:
 * ```typescript
 * const cb = new ExchangeCircuitBreaker('binance');
 * 
 * if (cb.canExecute()) {
 *   try {
 *     const result = await makeApiCall();
 *     cb.recordSuccess();
 *     return result;
 *   } catch (error) {
 *     cb.recordFailure();
 *     throw error;
 *   }
 * } else {
 *   throw new Error('Circuit breaker is open');
 * }
 * ```
 */
export class ExchangeCircuitBreaker {
  private exchangeId: AllExchangeId;
  private config: ExchangeCircuitBreakerConfig;
  private state: InternalState;

  constructor(exchangeId: AllExchangeId, config: Partial<ExchangeCircuitBreakerConfig> = {}) {
    this.exchangeId = exchangeId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      state: "CLOSED",
      failureCount: 0,
      successCount: 0,
      halfOpenCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalCalls: 0,
    };
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state.state;
  }

  /**
   * Check if a request can be executed
   * Returns true if the circuit is CLOSED or HALF_OPEN (with available test calls)
   */
  canExecute(): boolean {
    this.checkStateTransition();
    this.state.totalCalls++;

    switch (this.state.state) {
      case "CLOSED":
        return true;

      case "OPEN":
        return false;

      case "HALF_OPEN":
        // Allow limited test calls in half-open state
        if (this.state.halfOpenCalls < this.config.halfOpenMaxCalls) {
          this.state.halfOpenCalls++;
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Record a successful request
   * Transitions HALF_OPEN -> CLOSED after successThreshold successes
   */
  recordSuccess(): void {
    this.state.lastSuccessTime = new Date();
    this.state.totalSuccesses++;

    switch (this.state.state) {
      case "CLOSED":
        // Reset failure count on success
        this.state.failureCount = 0;
        break;

      case "HALF_OPEN":
        this.state.successCount++;
        if (this.state.successCount >= this.config.successThreshold) {
          this.transitionToClosed();
        }
        break;

      case "OPEN":
        // Should not happen, but handle gracefully
        this.log("Unexpected success in OPEN state");
        break;
    }
  }

  /**
   * Record a failed request
   * Transitions CLOSED -> OPEN after failureThreshold failures
   * Transitions HALF_OPEN -> OPEN on any failure
   */
  recordFailure(): void {
    this.state.lastFailureTime = new Date();
    this.state.totalFailures++;
    this.state.failureCount++;

    switch (this.state.state) {
      case "CLOSED":
        if (this.state.failureCount >= this.config.failureThreshold) {
          this.transitionToOpen();
        }
        break;

      case "HALF_OPEN":
        // Any failure in half-open immediately opens the circuit
        this.transitionToOpen();
        break;

      case "OPEN":
        // Already open, just update failure count
        break;
    }
  }

  /**
   * Force the circuit breaker to OPEN state
   * Use for manual intervention or external signals
   */
  forceOpen(): void {
    if (this.state.state !== "OPEN") {
      this.transitionToOpen();
      this.log("Circuit breaker forced OPEN");
    }
  }

  /**
   * Force the circuit breaker to CLOSED state
   * Use for manual reset after fixing issues
   */
  forceClose(): void {
    if (this.state.state !== "CLOSED") {
      this.transitionToClosed();
      this.log("Circuit breaker forced CLOSED");
    }
  }

  /**
   * Get detailed statistics about the circuit breaker
   */
  getStats(): {
    exchangeId: AllExchangeId;
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime?: Date;
    lastSuccessTime?: Date;
    openedAt?: Date;
    halfOpenCalls: number;
    totalFailures: number;
    totalSuccesses: number;
    totalCalls: number;
    config: ExchangeCircuitBreakerConfig;
  } {
    return {
      exchangeId: this.exchangeId,
      state: this.state.state,
      failureCount: this.state.failureCount,
      successCount: this.state.successCount,
      lastFailureTime: this.state.lastFailureTime,
      lastSuccessTime: this.state.lastSuccessTime,
      openedAt: this.state.openedAt,
      halfOpenCalls: this.state.halfOpenCalls,
      totalFailures: this.state.totalFailures,
      totalSuccesses: this.state.totalSuccesses,
      totalCalls: this.state.totalCalls,
      config: { ...this.config },
    };
  }

  /**
   * Reset all counters and state
   */
  reset(): void {
    this.state = {
      state: "CLOSED",
      failureCount: 0,
      successCount: 0,
      halfOpenCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalCalls: 0,
    };
    this.log("Circuit breaker reset");
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExchangeCircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Check if state should transition (OPEN -> HALF_OPEN based on timeout)
   */
  private checkStateTransition(): void {
    if (this.state.state === "OPEN" && this.state.openedAt) {
      const elapsed = Date.now() - this.state.openedAt.getTime();
      if (elapsed >= this.config.openTimeout) {
        this.transitionToHalfOpen();
      }
    }
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state.state;
    this.state = {
      ...this.state,
      state: "CLOSED",
      failureCount: 0,
      successCount: 0,
      halfOpenCalls: 0,
    };
    this.log(`State transition: ${previousState} -> CLOSED`);
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state.state;
    this.state = {
      ...this.state,
      state: "OPEN",
      openedAt: new Date(),
      successCount: 0,
      halfOpenCalls: 0,
    };
    this.log(`State transition: ${previousState} -> OPEN (failures: ${this.state.failureCount})`);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state.state;
    this.state = {
      ...this.state,
      state: "HALF_OPEN",
      successCount: 0,
      halfOpenCalls: 0,
    };
    this.log(`State transition: ${previousState} -> HALF_OPEN`);
  }

  /**
   * Log message if logging is enabled
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[CircuitBreaker:${this.exchangeId}] ${message}`);
    }
  }
}

// ==================== CIRCUIT BREAKER MANAGER ====================

/**
 * Manages circuit breaker instances per exchange
 * Singleton pattern for global access
 */
class CircuitBreakerManager {
  private instances: Map<string, ExchangeCircuitBreaker> = new Map();
  private defaultConfig: Partial<ExchangeCircuitBreakerConfig> = {};

  /**
   * Get or create circuit breaker for an exchange
   */
  get(exchangeId: AllExchangeId, config?: Partial<ExchangeCircuitBreakerConfig>): ExchangeCircuitBreaker {
    const key = exchangeId;
    
    if (!this.instances.has(key)) {
      this.instances.set(
        key,
        new ExchangeCircuitBreaker(exchangeId, { ...this.defaultConfig, ...config })
      );
    }
    
    return this.instances.get(key)!;
  }

  /**
   * Get all circuit breaker instances
   */
  getAll(): Map<string, ExchangeCircuitBreaker> {
    return new Map(this.instances);
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): Array<ReturnType<ExchangeCircuitBreaker["getStats"]>> {
    return Array.from(this.instances.values()).map((cb) => cb.getStats());
  }

  /**
   * Set default configuration for new circuit breakers
   */
  setDefaultConfig(config: Partial<ExchangeCircuitBreakerConfig>): void {
    this.defaultConfig = config;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.instances.forEach((cb) => cb.reset());
  }

  /**
   * Remove circuit breaker instance
   */
  remove(exchangeId: AllExchangeId): boolean {
    return this.instances.delete(exchangeId);
  }

  /**
   * Clear all instances
   */
  clear(): void {
    this.instances.clear();
  }
}

// Export singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();

// ==================== CIRCUIT BREAKER ERROR ====================

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  public readonly exchangeId: AllExchangeId;
  public readonly state: CircuitBreakerState;
  public readonly stats: ReturnType<ExchangeCircuitBreaker["getStats"]>;

  constructor(circuitBreaker: ExchangeCircuitBreaker) {
    const stats = circuitBreaker.getStats();
    super(
      `Circuit breaker for ${stats.exchangeId} is ${stats.state}. ` +
      `Total failures: ${stats.totalFailures}. ` +
      stats.openedAt
        ? `Open since: ${stats.openedAt.toISOString()}`
        : ""
    );
    this.name = "CircuitBreakerOpenError";
    this.exchangeId = stats.exchangeId;
    this.state = stats.state;
    this.stats = stats;
  }
}
