/**
 * Order Timeout Service Module
 * 
 * Provides order timeout tracking and automatic cancellation for the
 * CITARION trading platform.
 * 
 * Components:
 * - OrderTimeoutService: Main class for tracking and timing out orders
 * - Types: All type definitions
 * - Helper functions: Singleton management
 * 
 * Usage:
 * ```typescript
 * import { 
 *   OrderTimeoutService, 
 *   getOrderTimeoutService,
 *   type TrackedOrder,
 *   type OrderTimeoutCallback 
 * } from '@/lib/order-timeout';
 * 
 * // Option 1: Use singleton
 * const service = getOrderTimeoutService({
 *   checkIntervalMs: 30000,
 *   defaultTtlMs: 60000,
 * });
 * 
 * // Option 2: Create new instance
 * const service = new OrderTimeoutService({
 *   checkIntervalMs: 30000,
 *   defaultTtlMs: 60000,
 * });
 * 
 * // Set up callbacks
 * service.onOrderTimeout(async (order) => {
 *   console.log(`Order ${order.orderId} timed out`);
 *   // Cancel order on exchange...
 * });
 * 
 * service.onOrderCancelled(async (order, reason) => {
 *   console.log(`Order ${order.orderId} cancelled: ${reason}`);
 * });
 * 
 * service.onError(async (error, orderId) => {
 *   console.error(`Error for order ${orderId}:`, error);
 * });
 * 
 * // Start the service
 * service.start();
 * 
 * // Track an order
 * const tracked = service.trackOrder({
 *   orderId: 'order-123',
 *   symbol: 'BTCUSDT',
 *   side: 'BUY',
 *   quantity: 0.1,
 *   orderType: 'LIMIT',
 *   ttlMs: 120000, // Custom 2 minute TTL
 * });
 * 
 * // Check order status
 * const status = service.getOrderStatus('order-123');
 * 
 * // Manually cancel an order
 * await service.cancelOrder('order-123', 'User requested');
 * 
 * // Mark as filled
 * service.markOrderFilled('order-123');
 * 
 * // Get metrics
 * const metrics = service.getMetrics();
 * console.log('Metrics:', metrics);
 * 
 * // Stop the service
 * service.stop();
 * ```
 */

// Main class
export {
  OrderTimeoutService,
  getOrderTimeoutService,
  initOrderTimeoutService,
  resetOrderTimeoutService,
} from '../order-timeout-service';

// Types
export {
  // Order types
  OrderType,
  TrackedOrderStatus,
  TrackedOrder,
  OrderToTrack,
  
  // Result types
  TimeoutCheckResult,
  TimeoutServiceMetrics,
  
  // Callback types
  OrderTimeoutCallback,
  OrderCancelledCallback,
  ErrorCallback,
  
  // Config types
  OrderTimeoutServiceConfig,
  DEFAULT_CONFIG,
} from '../order-timeout-service';
