/**
 * DCA Bot Types - Additional exports
 */

// Re-export all from types
export * from './types';

// Additional types

export interface DCAOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  clientOrderId?: string;
}

export interface DCAOrderResult {
  success: boolean;
  order?: import('./types').DCAOrder;
  error?: string;
}

export interface DCABalanceInfo {
  availableBalance: number;
  totalBalance: number;
  usedMargin: number;
  unrealizedPnl: number;
}

export interface DCAPositionInfo {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  margin: number;
  liquidationPrice?: number;
}
