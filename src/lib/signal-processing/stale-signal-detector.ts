/**
 * Stale Signal Detector Module
 * Detects and handles signals that have exceeded their TTL (Time To Live)
 * Audit Fix: P1.16 - Implement Stale Signal Detection with 30s TTL
 */

export interface SignalWithTTL {
  id: string;
  type: 'entry' | 'exit' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'modify';
  symbol: string;
  side: 'buy' | 'sell';
  price?: number;
  quantity?: number;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  source: 'tradingview' | 'telegram' | 'api' | 'bot' | 'manual';
  botId?: string;
  metadata?: Record<string, unknown>;
}

export interface StaleSignalConfig {
  defaultTTL: number; // Default TTL in milliseconds
  warningThreshold: number; // Percentage of TTL before warning (e.g., 0.8 = 80%)
  checkInterval: number; // How often to check for stale signals
  maxSignalAge: number; // Maximum age before auto-rejection
  enableAutoReject: boolean; // Automatically reject stale signals
}

const DEFAULT_CONFIG: StaleSignalConfig = {
  defaultTTL: 30000, // 30 seconds
  warningThreshold: 0.8, // Warn at 80% of TTL
  checkInterval: 1000, // Check every second
  maxSignalAge: 300000, // 5 minutes max age
  enableAutoReject: true,
};

export type SignalStatus = 'pending' | 'processing' | 'executed' | 'rejected' | 'expired';

export interface TrackedSignal extends SignalWithTTL {
  status: SignalStatus;
  receivedAt: number;
  processedAt?: number;
  warningIssued?: boolean;
  rejectionReason?: string;
}

export interface StaleSignalMetrics {
  totalTracked: number;
  activeSignals: number;
  expiredSignals: number;
  rejectedSignals: number;
  averageProcessingTime: number;
  signalsBySource: Record<string, number>;
}

export class StaleSignalDetector {
  private signals: Map<string, TrackedSignal> = new Map();
  private config: StaleSignalConfig;
  private checkInterval?: NodeJS.Timeout;
  private handlers = {
    onWarning: new Map<string, (signal: TrackedSignal) => void>(),
    onExpired: new Map<string, (signal: TrackedSignal) => void>(),
    onRejected: new Map<string, (signal: TrackedSignal, reason: string) => void>(),
  };
  private metrics: StaleSignalMetrics = {
    totalTracked: 0,
    activeSignals: 0,
    expiredSignals: 0,
    rejectedSignals: 0,
    averageProcessingTime: 0,
    signalsBySource: {},
  };
  private processingTimes: number[] = [];

  constructor(config: Partial<StaleSignalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Track a new signal with TTL
   */
  trackSignal(signal: SignalWithTTL): string {
    const id = signal.id || this.generateId();
    const ttl = signal.ttl || this.config.defaultTTL;

    const trackedSignal: TrackedSignal = {
      ...signal,
      id,
      ttl,
      status: 'pending',
      receivedAt: Date.now(),
    };

    this.signals.set(id, trackedSignal);
    this.updateMetrics(trackedSignal, 'add');

    console.log(`[StaleDetector] Tracking signal ${id} for ${signal.symbol} with TTL ${ttl}ms`);

    return id;
  }

  /**
   * Mark a signal as processing
   */
  markProcessing(id: string): boolean {
    const signal = this.signals.get(id);
    if (!signal) return false;

    signal.status = 'processing';
    return true;
  }

  /**
   * Mark a signal as executed
   */
  markExecuted(id: string): boolean {
    const signal = this.signals.get(id);
    if (!signal) return false;

    signal.status = 'executed';
    signal.processedAt = Date.now();

    const processingTime = signal.processedAt - signal.receivedAt;
    this.processingTimes.push(processingTime);
    
    // Keep only last 100 processing times for average calculation
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }

    this.updateAverageProcessingTime();
    this.updateMetrics(signal, 'execute');

    console.log(`[StaleDetector] Signal ${id} executed in ${processingTime}ms`);
    return true;
  }

  /**
   * Mark a signal as rejected
   */
  markRejected(id: string, reason: string): boolean {
    const signal = this.signals.get(id);
    if (!signal) return false;

    signal.status = 'rejected';
    signal.processedAt = Date.now();
    signal.rejectionReason = reason;

    this.metrics.rejectedSignals++;
    this.updateMetrics(signal, 'reject');

    console.log(`[StaleDetector] Signal ${id} rejected: ${reason}`);
    return true;
  }

  /**
   * Start monitoring for stale signals
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      console.warn('[StaleDetector] Monitoring already started');
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkStaleSignals();
    }, this.config.checkInterval);

    console.log('[StaleDetector] Started monitoring with interval:', this.config.checkInterval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      console.log('[StaleDetector] Stopped monitoring');
    }
  }

  /**
   * Check for stale signals
   */
  private checkStaleSignals(): void {
    const now = Date.now();

    for (const [id, signal] of this.signals.entries()) {
      // Skip non-pending signals
      if (signal.status !== 'pending' && signal.status !== 'processing') continue;

      const age = now - signal.timestamp;
      const elapsed = now - signal.receivedAt;
      const ttlProgress = elapsed / signal.ttl;

      // Check for expiration
      if (elapsed >= signal.ttl || age >= this.config.maxSignalAge) {
        this.handleExpiredSignal(signal);
        continue;
      }

      // Check for warning threshold
      if (ttlProgress >= this.config.warningThreshold && !signal.warningIssued) {
        this.handleWarning(signal);
      }
    }
  }

  /**
   * Handle signal that's about to expire
   */
  private handleWarning(signal: TrackedSignal): void {
    signal.warningIssued = true;
    const remaining = signal.ttl - (Date.now() - signal.receivedAt);

    console.warn(`[StaleDetector] Signal ${signal.id} approaching expiry. ${remaining}ms remaining.`);

    // Call registered warning handlers
    const handler = this.handlers.onWarning.get(signal.source);
    if (handler) {
      handler(signal);
    }
  }

  /**
   * Handle expired signal
   */
  private handleExpiredSignal(signal: TrackedSignal): void {
    const age = Date.now() - signal.timestamp;

    if (this.config.enableAutoReject) {
      signal.status = 'expired';
      signal.rejectionReason = `Signal expired (age: ${age}ms, TTL: ${signal.ttl}ms)`;
      this.metrics.expiredSignals++;
      this.metrics.rejectedSignals++;

      console.warn(`[StaleDetector] Signal ${signal.id} auto-rejected. Age: ${age}ms`);

      // Call expired handlers
      const expiredHandler = this.handlers.onExpired.get(signal.source);
      if (expiredHandler) {
        expiredHandler(signal);
      }

      // Call rejected handlers
      const rejectedHandler = this.handlers.onRejected.get(signal.source);
      if (rejectedHandler) {
        rejectedHandler(signal, signal.rejectionReason);
      }
    }
  }

  /**
   * Register event handlers
   */
  onWarning(source: string, handler: (signal: TrackedSignal) => void): void {
    this.handlers.onWarning.set(source, handler);
  }

  onExpired(source: string, handler: (signal: TrackedSignal) => void): void {
    this.handlers.onExpired.set(source, handler);
  }

  onRejected(source: string, handler: (signal: TrackedSignal, reason: string) => void): void {
    this.handlers.onRejected.set(source, handler);
  }

  /**
   * Get signal by ID
   */
  getSignal(id: string): TrackedSignal | undefined {
    return this.signals.get(id);
  }

  /**
   * Get all active signals
   */
  getActiveSignals(): TrackedSignal[] {
    return Array.from(this.signals.values()).filter(
      (s) => s.status === 'pending' || s.status === 'processing'
    );
  }

  /**
   * Get signals by symbol
   */
  getSignalsBySymbol(symbol: string): TrackedSignal[] {
    return Array.from(this.signals.values()).filter((s) => s.symbol === symbol);
  }

  /**
   * Get signals by bot ID
   */
  getSignalsByBot(botId: string): TrackedSignal[] {
    return Array.from(this.signals.values()).filter((s) => s.botId === botId);
  }

  /**
   * Check if a signal is still valid
   */
  isSignalValid(id: string): boolean {
    const signal = this.signals.get(id);
    if (!signal) return false;

    const elapsed = Date.now() - signal.receivedAt;
    return elapsed < signal.ttl && signal.status === 'pending';
  }

  /**
   * Get remaining TTL for a signal
   */
  getRemainingTTL(id: string): number {
    const signal = this.signals.get(id);
    if (!signal) return 0;

    const elapsed = Date.now() - signal.receivedAt;
    return Math.max(0, signal.ttl - elapsed);
  }

  /**
   * Update metrics
   */
  private updateMetrics(signal: TrackedSignal, action: 'add' | 'execute' | 'reject'): void {
    if (action === 'add') {
      this.metrics.totalTracked++;
      this.metrics.activeSignals++;
      this.metrics.signalsBySource[signal.source] = 
        (this.metrics.signalsBySource[signal.source] || 0) + 1;
    } else if (action === 'execute') {
      this.metrics.activeSignals--;
    } else if (action === 'reject') {
      this.metrics.activeSignals--;
    }
  }

  /**
   * Update average processing time
   */
  private updateAverageProcessingTime(): void {
    if (this.processingTimes.length === 0) {
      this.metrics.averageProcessingTime = 0;
      return;
    }

    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    this.metrics.averageProcessingTime = sum / this.processingTimes.length;
  }

  /**
   * Get current metrics
   */
  getMetrics(): StaleSignalMetrics {
    return { ...this.metrics };
  }

  /**
   * Clean up old signals
   */
  cleanup(maxAge: number = 3600000): number {
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;

    for (const [id, signal] of this.signals.entries()) {
      if (
        signal.status !== 'pending' &&
        signal.status !== 'processing' &&
        signal.receivedAt < cutoff
      ) {
        this.signals.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[StaleDetector] Cleaned up ${cleaned} old signals`);
    }

    return cleaned;
  }

  /**
   * Generate unique signal ID
   */
  private generateId(): string {
    return `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get tracked signals count
   */
  get size(): number {
    return this.signals.size;
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    console.log('[StaleDetector] Shutting down...');
    this.stopMonitoring();
    
    // Auto-reject all pending signals
    for (const signal of this.signals.values()) {
      if (signal.status === 'pending') {
        this.handleExpiredSignal(signal);
      }
    }

    console.log('[StaleDetector] Shutdown complete. Final metrics:', this.metrics);
  }
}

// Singleton instance
let detectorInstance: StaleSignalDetector | null = null;

export function getStaleSignalDetector(config?: Partial<StaleSignalConfig>): StaleSignalDetector {
  if (!detectorInstance) {
    detectorInstance = new StaleSignalDetector(config);
  }
  return detectorInstance;
}

export default StaleSignalDetector;
