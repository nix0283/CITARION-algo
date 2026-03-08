/**
 * Exchange Adapters Index
 * 
 * Exports all exchange adapters for multi-exchange support.
 */

export { BinanceAdapter } from './binance-adapter';
export { BybitAdapter } from './bybit-adapter';
export { OKXAdapter } from './okx-adapter';

// Re-export types
export type {
  ExchangeId,
  MarketType,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  PositionSide,
  UnifiedOrderParams,
  UnifiedOrder,
  UnifiedPosition,
  UnifiedBalance,
  UnifiedTicker,
  UnifiedCandle,
  UnifiedOrderbook,
  ExchangeCredentials,
  IExchangeAdapter,
} from '../unified-exchange-adapter';

import { BinanceAdapter } from './binance-adapter';
import { BybitAdapter } from './bybit-adapter';
import { OKXAdapter } from './okx-adapter';
import { getUnifiedExchangeManager } from '../unified-exchange-adapter';

/**
 * Initialize all exchange adapters
 */
export function initializeExchangeAdapters(): void {
  const manager = getUnifiedExchangeManager();
  
  // Register Binance (Futures)
  manager.registerAdapter(new BinanceAdapter('futures'));
  
  // Register Binance (Spot)
  manager.registerAdapter(new BinanceAdapter('spot'));
  
  // Register Bybit (Linear Futures)
  manager.registerAdapter(new BybitAdapter('linear'));
  
  // Register Bybit (Spot)
  manager.registerAdapter(new BybitAdapter('spot'));
  
  // Register OKX (Swap)
  manager.registerAdapter(new OKXAdapter('SWAP'));
  
  // Register OKX (Spot)
  manager.registerAdapter(new OKXAdapter('SPOT'));
  
  console.log('[ExchangeAdapters] All adapters registered');
}

// Auto-initialize
if (typeof window === 'undefined') {
  // Only on server side
  initializeExchangeAdapters();
}
