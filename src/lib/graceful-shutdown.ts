/**
 * Graceful Shutdown Module for CITARION Trading Platform
 * 
 * Provides robust shutdown handling for:
 * - Bot stoppers (stop all active trading bots)
 * - Position closers (close open positions if needed)
 * - Connection closers (DB, Redis, WebSocket)
 * - State savers (persist state before shutdown)
 * 
 * Features:
 * - Signal handling (SIGTERM, SIGINT, SIGHUP)
 * - Handler priority levels
 * - Timeout for forced shutdown
 * - Progress tracking and logging
 * - Prevention of multiple shutdown triggers
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Handler priority levels - executed in order from highest to lowest priority
 */
export enum HandlerPriority {
  /** Critical handlers - must run first (e.g., emergency position close) */
  CRITICAL = 0,
  /** High priority handlers (e.g., stop active bots) */
  HIGH = 1,
  /** Normal priority handlers (e.g., close connections) */
  NORMAL = 2,
  /** Low priority handlers (e.g., cleanup, logging) */
  LOW = 3,
}

/**
 * Shutdown handler categories
 */
export enum HandlerCategory {
  BOT_STOPPER = 'bot_stopper',
  POSITION_CLOSER = 'position_closer',
  CONNECTION_CLOSER = 'connection_closer',
  STATE_SAVER = 'state_saver',
  CLEANUP = 'cleanup',
  CUSTOM = 'custom',
}

/**
 * Handler status during shutdown
 */
export enum HandlerStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  TIMEOUT = 'timeout',
}

/**
 * Shutdown signal types
 */
export type ShutdownSignal = 'SIGTERM' | 'SIGINT' | 'SIGHUP';

/**
 * Individual handler information
 */
export interface ShutdownHandler {
  /** Unique identifier for the handler */
  id: string;
  /** Handler name for logging */
  name: string;
  /** Category of the handler */
  category: HandlerCategory;
  /** Priority level (lower number = higher priority) */
  priority: HandlerPriority;
  /** The actual handler function to execute */
  handler: () => Promise<void>;
  /** Timeout for this specific handler (ms) */
  timeout?: number;
  /** Whether to continue shutdown if this handler fails */
  continueOnFailure?: boolean;
  /** Description of what this handler does */
  description?: string;
}

/**
 * Handler execution result
 */
export interface HandlerResult {
  handlerId: string;
  handlerName: string;
  status: HandlerStatus;
  startTime: number;
  endTime: number;
  duration: number;
  error?: Error;
}

/**
 * Overall shutdown status
 */
export interface ShutdownStatus {
  /** Whether shutdown is in progress */
  isShuttingDown: boolean;
  /** Signal that triggered shutdown */
  signal?: ShutdownSignal;
  /** When shutdown started */
  startTime?: number;
  /** When shutdown completed */
  endTime?: number;
  /** Total shutdown duration */
  duration?: number;
  /** Whether shutdown completed gracefully */
  graceful: boolean;
  /** Whether shutdown was forced due to timeout */
  forced: boolean;
  /** Results of all handler executions */
  handlerResults: HandlerResult[];
  /** Summary statistics */
  summary: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    timeout: number;
  };
}

/**
 * Configuration options for graceful shutdown
 */
export interface GracefulShutdownOptions {
  /** Total timeout for shutdown process (ms) - default 30000 */
  timeout: number;
  /** Whether to log to console - default true */
  enableLogging: boolean;
  /** Custom logger function */
  logger?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: Record<string, unknown>) => void;
  /** Exit code on forced shutdown - default 1 */
  forcedExitCode: number;
  /** Exit code on graceful shutdown - default 0 */
  gracefulExitCode: number;
  /** Whether to automatically exit process after shutdown - default true */
  autoExit: boolean;
  /** Delay before force exit after timeout (ms) - default 1000 */
  forceExitDelay: number;
}

/**
 * Default configuration options
 */
const DEFAULT_OPTIONS: GracefulShutdownOptions = {
  timeout: 30000,
  enableLogging: true,
  forcedExitCode: 1,
  gracefulExitCode: 0,
  autoExit: true,
  forceExitDelay: 1000,
};

// ============================================================================
// GracefulShutdown Class
// ============================================================================

/**
 * Graceful Shutdown Manager
 * 
 * Singleton class that manages the graceful shutdown process for the
 * CITARION trading platform. Handles signal registration, handler management,
 * timeout enforcement, and progress tracking.
 */
export class GracefulShutdown {
  private static instance: GracefulShutdown | null = null;
  
  private handlers: Map<string, ShutdownHandler> = new Map();
  private options: GracefulShutdownOptions;
  private shutdownStatus: ShutdownStatus;
  private isShuttingDownFlag: boolean = false;
  private signalHandlers: Map<ShutdownSignal, () => void> = new Map();
  private registered: boolean = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(options: Partial<GracefulShutdownOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.shutdownStatus = this.createInitialStatus();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(options?: Partial<GracefulShutdownOptions>): GracefulShutdown {
    if (!GracefulShutdown.instance) {
      GracefulShutdown.instance = new GracefulShutdown(options);
    }
    return GracefulShutdown.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (GracefulShutdown.instance) {
      GracefulShutdown.instance.unregisterSignalHandlers();
      GracefulShutdown.instance = null;
    }
  }

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Register a shutdown handler
   * 
   * @param config Handler configuration
   * @returns Handler ID for reference
   */
  public registerHandler(config: Omit<ShutdownHandler, 'id'> & { id?: string }): string {
    const id = config.id || this.generateHandlerId(config.category);
    
    if (this.handlers.has(id)) {
      this.log('warn', `Handler with ID '${id}' already exists, overwriting`, { id });
    }

    const handler: ShutdownHandler = {
      ...config,
      id,
    };

    this.handlers.set(id, handler);
    this.log('debug', `Registered shutdown handler: ${config.name}`, {
      id,
      category: config.category,
      priority: config.priority,
    });

    return id;
  }

  /**
   * Unregister a shutdown handler
   * 
   * @param id Handler ID to unregister
   * @returns Whether the handler was found and removed
   */
  public unregisterHandler(id: string): boolean {
    const removed = this.handlers.delete(id);
    if (removed) {
      this.log('debug', `Unregistered shutdown handler: ${id}`);
    }
    return removed;
  }

  /**
   * Check if shutdown is in progress
   */
  public isShuttingDown(): boolean {
    return this.isShuttingDownFlag;
  }

  /**
   * Get current shutdown status
   */
  public getStatus(): ShutdownStatus {
    return { ...this.shutdownStatus };
  }

  /**
   * Get all registered handlers
   */
  public getHandlers(): ShutdownHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get handlers by category
   */
  public getHandlersByCategory(category: HandlerCategory): ShutdownHandler[] {
    return this.getHandlers().filter(h => h.category === category);
  }

  /**
   * Get handlers by priority
   */
  public getHandlersByPriority(priority: HandlerPriority): ShutdownHandler[] {
    return this.getHandlers().filter(h => h.priority === priority);
  }

  /**
   * Initiate graceful shutdown
   * 
   * @param signal The signal that triggered shutdown
   * @returns Promise that resolves when shutdown completes
   */
  public async shutdown(signal?: ShutdownSignal): Promise<ShutdownStatus> {
    // Prevent multiple shutdown triggers
    if (this.isShuttingDownFlag) {
      this.log('warn', 'Shutdown already in progress, ignoring additional trigger', { signal });
      return this.shutdownStatus;
    }

    this.isShuttingDownFlag = true;
    this.shutdownStatus.isShuttingDown = true;
    this.shutdownStatus.signal = signal;
    this.shutdownStatus.startTime = Date.now();

    this.log('info', `Initiating graceful shutdown${signal ? ` (signal: ${signal})` : ''}`);
    this.log('info', `Total handlers registered: ${this.handlers.size}`);

    // Create timeout promise for forced shutdown
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown timeout exceeded (${this.options.timeout}ms)`));
      }, this.options.timeout);
    });

    try {
      // Race between shutdown completion and timeout
      await Promise.race([
        this.executeHandlers(),
        timeoutPromise,
      ]);

      this.shutdownStatus.graceful = true;
      this.shutdownStatus.forced = false;
      this.log('info', 'Graceful shutdown completed successfully');
    } catch (error) {
      this.log('error', 'Shutdown timed out or failed, forcing exit', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.forceShutdown();
    }

    this.shutdownStatus.endTime = Date.now();
    this.shutdownStatus.duration = this.shutdownStatus.endTime - this.shutdownStatus.startTime;
    this.updateSummary();

    this.log('info', 'Shutdown summary', {
      duration: `${this.shutdownStatus.duration}ms`,
      ...this.shutdownStatus.summary,
    });

    if (this.options.autoExit) {
      const exitCode = this.shutdownStatus.graceful
        ? this.options.gracefulExitCode
        : this.options.forcedExitCode;
      
      // Small delay before exit to allow logs to flush
      setTimeout(() => {
        process.exit(exitCode);
      }, 100);
    }

    return this.shutdownStatus;
  }

  /**
   * Force immediate shutdown
   * 
   * Called when graceful shutdown times out or fails critically.
   * Attempts to run any critical handlers before exiting.
   */
  public async forceShutdown(): Promise<void> {
    this.log('warn', 'Forcing shutdown...');
    this.shutdownStatus.forced = true;
    this.shutdownStatus.graceful = false;

    // Try to run critical handlers only
    const criticalHandlers = this.getHandlersByPriority(HandlerPriority.CRITICAL);
    
    if (criticalHandlers.length > 0) {
      this.log('info', `Attempting to run ${criticalHandlers.length} critical handlers before force exit`);
      
      // Run critical handlers with very short timeout
      const criticalTimeout = 3000; // 3 seconds for critical handlers
      
      await Promise.race([
        this.executeHandlersByPriority(HandlerPriority.CRITICAL),
        new Promise<void>((resolve) => setTimeout(resolve, criticalTimeout)),
      ]);
    }

    if (this.options.autoExit) {
      setTimeout(() => {
        process.exit(this.options.forcedExitCode);
      }, this.options.forceExitDelay);
    }
  }

  /**
   * Setup signal handlers
   * 
   * Registers handlers for SIGTERM, SIGINT, and SIGHUP signals
   */
  public setupSignalHandlers(): void {
    if (this.registered) {
      this.log('warn', 'Signal handlers already registered');
      return;
    }

    const signals: ShutdownSignal[] = ['SIGTERM', 'SIGINT', 'SIGHUP'];

    signals.forEach(signal => {
      const handler = () => {
        this.log('info', `Received ${signal} signal`);
        this.shutdown(signal);
      };

      process.on(signal, handler);
      this.signalHandlers.set(signal, handler);
    });

    this.registered = true;
    this.log('info', `Registered signal handlers: ${signals.join(', ')}`);
  }

  /**
   * Unregister signal handlers
   */
  public unregisterSignalHandlers(): void {
    this.signalHandlers.forEach((handler, signal) => {
      process.off(signal, handler);
    });
    this.signalHandlers.clear();
    this.registered = false;
    this.log('info', 'Unregistered all signal handlers');
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Execute all handlers in priority order
   */
  private async executeHandlers(): Promise<void> {
    const sortedHandlers = this.getSortedHandlers();

    for (const handler of sortedHandlers) {
      if (!this.isShuttingDownFlag) {
        // Shutdown was cancelled (shouldn't happen but safety check)
        break;
      }

      await this.executeHandler(handler);
    }
  }

  /**
   * Execute handlers of a specific priority level
   */
  private async executeHandlersByPriority(priority: HandlerPriority): Promise<void> {
    const handlers = this.getHandlersByPriority(priority);
    
    for (const handler of handlers) {
      await this.executeHandler(handler);
    }
  }

  /**
   * Execute a single handler
   */
  private async executeHandler(handler: ShutdownHandler): Promise<HandlerResult> {
    const result: HandlerResult = {
      handlerId: handler.id,
      handlerName: handler.name,
      status: HandlerStatus.RUNNING,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
    };

    this.shutdownStatus.handlerResults.push(result);

    this.log('info', `Executing handler: ${handler.name}`, {
      id: handler.id,
      category: handler.category,
      priority: handler.priority,
    });

    const handlerTimeout = handler.timeout || 5000; // Default 5s per handler

    try {
      // Execute handler with timeout
      await Promise.race([
        handler.handler(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Handler timeout (${handlerTimeout}ms)`)), handlerTimeout);
        }),
      ]);

      result.status = HandlerStatus.COMPLETED;
      this.log('info', `Handler completed: ${handler.name}`, { duration: `${result.duration}ms` });
    } catch (error) {
      result.error = error instanceof Error ? error : new Error(String(error));
      
      if (result.error.message.includes('timeout')) {
        result.status = HandlerStatus.TIMEOUT;
        this.log('error', `Handler timed out: ${handler.name}`, { timeout: handlerTimeout });
      } else {
        result.status = HandlerStatus.FAILED;
        this.log('error', `Handler failed: ${handler.name}`, {
          error: result.error.message,
        });
      }

      // Check if we should continue or abort
      if (handler.continueOnFailure === false) {
        this.log('error', `Handler ${handler.name} failed with continueOnFailure=false, aborting shutdown`);
        throw result.error;
      }
    } finally {
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
    }

    return result;
  }

  /**
   * Get handlers sorted by priority (highest priority first)
   */
  private getSortedHandlers(): ShutdownHandler[] {
    return this.getHandlers().sort((a, b) => a.priority - b.priority);
  }

  /**
   * Generate a unique handler ID
   */
  private generateHandlerId(category: HandlerCategory): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${category}_${timestamp}_${random}`;
  }

  /**
   * Create initial shutdown status
   */
  private createInitialStatus(): ShutdownStatus {
    return {
      isShuttingDown: false,
      graceful: false,
      forced: false,
      handlerResults: [],
      summary: {
        total: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        timeout: 0,
      },
    };
  }

  /**
   * Update summary statistics
   */
  private updateSummary(): void {
    const results = this.shutdownStatus.handlerResults;
    
    this.shutdownStatus.summary = {
      total: results.length,
      completed: results.filter(r => r.status === HandlerStatus.COMPLETED).length,
      failed: results.filter(r => r.status === HandlerStatus.FAILED).length,
      skipped: results.filter(r => r.status === HandlerStatus.SKIPPED).length,
      timeout: results.filter(r => r.status === HandlerStatus.TIMEOUT).length,
    };
  }

  /**
   * Log a message
   */
  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (!this.options.enableLogging) {
      return;
    }

    if (this.options.logger) {
      this.options.logger(level, message, data);
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[GracefulShutdown ${timestamp}]`;
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';

    switch (level) {
      case 'error':
        console.error(`${prefix} ERROR: ${message}${dataStr}`);
        break;
      case 'warn':
        console.warn(`${prefix} WARN: ${message}${dataStr}`);
        break;
      case 'debug':
        // Only log debug in development
        if (process.env.NODE_ENV !== 'production') {
          console.log(`${prefix} DEBUG: ${message}${dataStr}`);
        }
        break;
      default:
        console.log(`${prefix} INFO: ${message}${dataStr}`);
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Setup graceful shutdown with sensible defaults
 * 
 * This is the main entry point for setting up graceful shutdown.
 * It creates the singleton instance, registers signal handlers, and
 * provides a fluent API for registering component-specific handlers.
 * 
 * @example
 * ```typescript
 * const shutdown = setupGracefulShutdown({
 *   timeout: 30000,
 *   enableLogging: true,
 * });
 * 
 * // Register bot stopper
 * shutdown.registerBotStopper(async () => {
 *   await botManager.stopAll();
 * });
 * 
 * // Register position closer
 * shutdown.registerPositionCloser(async () => {
 *   await positionManager.closeAllPositions();
 * });
 * 
 * // Register connection closer
 * shutdown.registerConnectionCloser('database', async () => {
 *   await db.$disconnect();
 * });
 * ```
 */
export function setupGracefulShutdown(
  options: Partial<GracefulShutdownOptions> = {}
): {
  instance: GracefulShutdown;
  registerBotStopper: (handler: () => Promise<void>, options?: Partial<ShutdownHandler>) => string;
  registerPositionCloser: (handler: () => Promise<void>, options?: Partial<ShutdownHandler>) => string;
  registerConnectionCloser: (name: string, handler: () => Promise<void>, options?: Partial<ShutdownHandler>) => string;
  registerStateSaver: (name: string, handler: () => Promise<void>, options?: Partial<ShutdownHandler>) => string;
  registerCleanup: (name: string, handler: () => Promise<void>, options?: Partial<ShutdownHandler>) => string;
} {
  const instance = GracefulShutdown.getInstance(options);
  instance.setupSignalHandlers();

  return {
    instance,

    /**
     * Register a bot stopper handler
     * These handlers stop all active trading bots
     */
    registerBotStopper: (handler, opts = {}) => {
      return instance.registerHandler({
        name: opts.name || 'Bot Stopper',
        category: HandlerCategory.BOT_STOPPER,
        priority: opts.priority ?? HandlerPriority.HIGH,
        handler,
        continueOnFailure: opts.continueOnFailure ?? true,
        timeout: opts.timeout ?? 10000,
        description: opts.description || 'Stop all active trading bots',
        ...opts,
      });
    },

    /**
     * Register a position closer handler
     * These handlers close open positions if needed
     */
    registerPositionCloser: (handler, opts = {}) => {
      return instance.registerHandler({
        name: opts.name || 'Position Closer',
        category: HandlerCategory.POSITION_CLOSER,
        priority: opts.priority ?? HandlerPriority.CRITICAL,
        handler,
        continueOnFailure: opts.continueOnFailure ?? false,
        timeout: opts.timeout ?? 15000,
        description: opts.description || 'Close open positions before shutdown',
        ...opts,
      });
    },

    /**
     * Register a connection closer handler
     * These handlers close DB, Redis, WebSocket connections
     */
    registerConnectionCloser: (name, handler, opts = {}) => {
      return instance.registerHandler({
        name: `Connection Closer: ${name}`,
        category: HandlerCategory.CONNECTION_CLOSER,
        priority: opts.priority ?? HandlerPriority.NORMAL,
        handler,
        continueOnFailure: opts.continueOnFailure ?? true,
        timeout: opts.timeout ?? 5000,
        description: opts.description || `Close ${name} connection`,
        ...opts,
      });
    },

    /**
     * Register a state saver handler
     * These handlers persist state before shutdown
     */
    registerStateSaver: (name, handler, opts = {}) => {
      return instance.registerHandler({
        name: `State Saver: ${name}`,
        category: HandlerCategory.STATE_SAVER,
        priority: opts.priority ?? HandlerPriority.HIGH,
        handler,
        continueOnFailure: opts.continueOnFailure ?? true,
        timeout: opts.timeout ?? 5000,
        description: opts.description || `Save ${name} state before shutdown`,
        ...opts,
      });
    },

    /**
     * Register a cleanup handler
     * These handlers perform cleanup tasks
     */
    registerCleanup: (name, handler, opts = {}) => {
      return instance.registerHandler({
        name: `Cleanup: ${name}`,
        category: HandlerCategory.CLEANUP,
        priority: opts.priority ?? HandlerPriority.LOW,
        handler,
        continueOnFailure: opts.continueOnFailure ?? true,
        timeout: opts.timeout ?? 3000,
        description: opts.description || `Cleanup ${name}`,
        ...opts,
      });
    },
  };
}

// ============================================================================
// Re-export Types
// ============================================================================

export type {
  ShutdownHandler,
  HandlerResult,
  ShutdownStatus,
  GracefulShutdownOptions,
};
