/**
 * Graceful Shutdown Module - CITARION Trading Platform
 * 
 * A robust graceful shutdown system for managing clean application termination.
 * Handles signal trapping, handler prioritization, timeout enforcement, and
 * progress tracking for trading platform components.
 * 
 * @module graceful-shutdown
 * 
 * @example Basic Usage
 * ```typescript
 * import { setupGracefulShutdown } from '@/lib/graceful-shutdown';
 * 
 * const shutdown = setupGracefulShutdown({
 *   timeout: 30000,
 *   enableLogging: true,
 * });
 * 
 * // Register handlers
 * shutdown.registerBotStopper(async () => {
 *   await botManager.stopAll();
 * });
 * 
 * shutdown.registerConnectionCloser('database', async () => {
 *   await db.$disconnect();
 * });
 * ```
 * 
 * @example Advanced Usage
 * ```typescript
 * import { 
 *   GracefulShutdown, 
 *   HandlerPriority, 
 *   HandlerCategory 
 * } from '@/lib/graceful-shutdown';
 * 
 * const manager = GracefulShutdown.getInstance({
 *   timeout: 60000,
 *   enableLogging: true,
 * });
 * 
 * // Setup signal handlers
 * manager.setupSignalHandlers();
 * 
 * // Register custom handler with specific priority
 * manager.registerHandler({
 *   name: 'Emergency Position Close',
 *   category: HandlerCategory.POSITION_CLOSER,
 *   priority: HandlerPriority.CRITICAL,
 *   handler: async () => {
 *     await closeAllPositions();
 *   },
 *   timeout: 10000,
 *   continueOnFailure: false,
 * });
 * 
 * // Check shutdown status
 * if (manager.isShuttingDown()) {
 *   console.log('Shutdown in progress');
 * }
 * ```
 */

// Core class
export { GracefulShutdown } from '../graceful-shutdown';

// Enums
export {
  HandlerPriority,
  HandlerCategory,
  HandlerStatus,
} from '../graceful-shutdown';

// Convenience function
export { setupGracefulShutdown } from '../graceful-shutdown';

// Types
export type {
  ShutdownHandler,
  HandlerResult,
  ShutdownStatus,
  ShutdownSignal,
  GracefulShutdownOptions,
} from '../graceful-shutdown';

// ============================================================================
// Usage Documentation
// ============================================================================

/**
 * ## Handler Categories
 * 
 * - **BOT_STOPPER**: Handlers that stop all active trading bots
 * - **POSITION_CLOSER**: Handlers that close open positions (critical)
 * - **CONNECTION_CLOSER**: Handlers that close DB, Redis, WebSocket connections
 * - **STATE_SAVER**: Handlers that persist state before shutdown
 * - **CLEANUP**: General cleanup handlers
 * - **CUSTOM**: Custom handler type
 * 
 * ## Handler Priority Levels
 * 
 * Handlers are executed in priority order (lower number = higher priority):
 * 
 * 1. **CRITICAL (0)**: Must run first (e.g., emergency position close)
 * 2. **HIGH (1)**: High priority (e.g., stop active bots, save state)
 * 3. **NORMAL (2)**: Normal priority (e.g., close connections)
 * 4. **LOW (3)**: Low priority (e.g., cleanup, logging)
 * 
 * ## Signals Handled
 * 
 * - **SIGTERM**: Termination signal (from process manager)
 * - **SIGINT**: Interrupt signal (Ctrl+C)
 * - **SIGHUP**: Hangup signal (terminal closed)
 * 
 * ## Timeout Behavior
 * 
 * - Default total shutdown timeout: 30 seconds
 * - Default per-handler timeout: 5 seconds
 * - Position closer timeout: 15 seconds (higher)
 * - Bot stopper timeout: 10 seconds
 * 
 * If timeout is exceeded:
 * 1. Attempt to run CRITICAL priority handlers
 * 2. Force exit with configured exit code
 * 
 * ## Best Practices
 * 
 * 1. Register handlers early in application startup
 * 2. Use appropriate priority levels
 * 3. Keep handlers idempotent (can be called multiple times)
 * 4. Set `continueOnFailure: false` only for critical handlers
 * 5. Use specific timeouts for long-running handlers
 * 6. Log within handlers for debugging
 * 
 * ## Example Integration
 * 
 * ```typescript
 * // In your application startup
 * import { setupGracefulShutdown, HandlerPriority } from '@/lib/graceful-shutdown';
 * import { db } from '@/lib/db';
 * import { redis } from '@/lib/cache';
 * import { botManager } from '@/lib/bot-manager';
 * 
 * const shutdown = setupGracefulShutdown({
 *   timeout: 45000, // 45 seconds for trading platform
 *   enableLogging: process.env.NODE_ENV !== 'test',
 * });
 * 
 * // Critical: Close positions first
 * shutdown.registerPositionCloser(async () => {
 *   const positions = await getOpenPositions();
 *   for (const pos of positions) {
 *     await closePosition(pos.id);
 *   }
 * });
 * 
 * // High: Stop all bots
 * shutdown.registerBotStopper(async () => {
 *   await botManager.stopAll();
 * });
 * 
 * // High: Save bot states
 * shutdown.registerStateSaver('bot-states', async () => {
 *   await botManager.persistStates();
 * });
 * 
 * // Normal: Close database
 * shutdown.registerConnectionCloser('database', async () => {
 *   await db.$disconnect();
 * });
 * 
 * // Normal: Close Redis
 * shutdown.registerConnectionCloser('redis', async () => {
 *   await redis.quit();
 * });
 * 
 * // Low: Cleanup temp files
 * shutdown.registerCleanup('temp-files', async () => {
 *   await cleanupTempFiles();
 * });
 * ```
 */
