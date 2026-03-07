/**
 * Grid Bot Types
 * 
 * Типы для сеточного торгового бота
 */

// ==================== CONFIG ====================

export interface GridBotConfig {
  id: string;
  name: string;
  symbol: string;
  exchange: string;
  accountId: string;
  accountType: 'DEMO' | 'REAL';
  
  // Grid settings
  gridType: 'arithmetic' | 'geometric' | 'adaptive';
  gridLevels: number;
  upperPrice: number;
  lowerPrice: number;
  
  // Position settings
  positionSize: number;
  positionSizeType: 'fixed' | 'percent' | 'risk_based';
  leverage: number;
  
  // Trailing grid
  trailingEnabled: boolean;
  trailingActivationPercent: number;
  trailingDistancePercent: number;
  
  // Risk management
  maxDrawdown: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  maxOpenPositions: number;
  
  // Execution
  orderType: 'limit' | 'market';
  priceTickOffset: number;
  
  // Advanced
  rebalanceEnabled: boolean;
  rebalanceThreshold: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// ==================== GRID LEVEL ====================

export interface GridLevel {
  index: number;
  price: number;
  buyOrder?: GridOrder;
  sellOrder?: GridOrder;
  quantity: number;
  filled: boolean;
  filledAt?: Date;
  avgFillPrice?: number;
}

export interface GridOrder {
  id: string;
  exchangeOrderId?: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  price: number;
  quantity: number;
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  filledQuantity: number;
  avgPrice: number;
  fee: number;
  createdAt: Date;
  updatedAt: Date;
}

// ==================== STATE ====================

export interface GridBotState {
  id: string;
  status: GridBotStatus;
  
  // Grid state
  gridLevels: GridLevel[];
  currentUpperPrice: number;
  currentLowerPrice: number;
  
  // Position tracking
  totalInvested: number;
  currentValue: number;
  baseAssetBalance: number;
  quoteAssetBalance: number;
  
  // PnL
  realizedPnl: number;
  unrealizedPnl: number;
  totalFees: number;
  totalFunding: number;
  
  // Statistics
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  totalVolume: number;
  
  // Trailing
  trailingActivated: boolean;
  trailingHighestPrice: number;
  trailingLowestPrice: number;
  trailingStopPrice?: number;
  
  // Timing
  startedAt?: Date;
  stoppedAt?: Date;
  lastUpdate: Date;
  
  // Metrics
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  profitFactor: number;
}

export type GridBotStatus = 
  | 'IDLE' 
  | 'STARTING' 
  | 'RUNNING' 
  | 'PAUSED' 
  | 'STOPPING' 
  | 'STOPPED'
  | 'ERROR';

// ==================== EVENTS ====================

export interface GridBotEvent {
  type: GridBotEventType;
  timestamp: Date;
  botId: string;
  data: any;
}

export type GridBotEventType =
  | 'BOT_STARTED'
  | 'BOT_STOPPED'
  | 'BOT_PAUSED'
  | 'BOT_RESUMED'
  | 'GRID_INITIALIZED'
  | 'ORDER_PLACED'
  | 'ORDER_FILLED'
  | 'ORDER_CANCELLED'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED'
  | 'GRID_REBALANCED'
  | 'TRAILING_ACTIVATED'
  | 'TRAILING_STOP_UPDATED'
  | 'STOP_LOSS_TRIGGERED'
  | 'TAKE_PROFIT_TRIGGERED'
  | 'MAX_DRAWDOWN_REACHED'
  | 'ERROR'
  | 'PRICE_UPDATE';

// ==================== TRADE ====================

export interface GridTrade {
  id: string;
  botId: string;
  symbol: string;
  
  // Entry
  entryPrice: number;
  entryQuantity: number;
  entryTime: Date;
  entryReason: 'GRID_BUY' | 'GRID_SELL' | 'MANUAL';
  gridLevel: number;
  
  // Exit
  exitPrice?: number;
  exitQuantity?: number;
  exitTime?: Date;
  exitReason?: 'GRID_SELL' | 'GRID_BUY' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'LIQUIDATION';
  
  // PnL
  pnl: number;
  pnlPercent: number;
  fees: number;
  funding: number;
  
  // Status
  status: 'OPEN' | 'CLOSED';
  
  // Metadata
  leverage: number;
  margin: number;
}

// ==================== SIGNAL ====================

export interface GridSignal {
  type: 'PLACE_BUY' | 'PLACE_SELL' | 'CANCEL_BUY' | 'CANCEL_SELL' | 'REBALANCE' | 'STOP';
  level: number;
  price: number;
  quantity: number;
  reason: string;
  confidence: number;
}

// ==================== METRICS ====================

export interface GridBotMetrics {
  // Returns
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  dailyReturn: number;
  
  // Risk
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  
  // Trading
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgTradeDuration: number;
  
  // Grid specific
  gridEfficiency: number;
  avgGridSpread: number;
  rebalanceCount: number;
  
  // Execution
  totalFees: number;
  avgSlippage: number;
  orderFillRate: number;
}

// ==================== ADAPTER ====================

export interface GridBotAdapter {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Market data
  getCurrentPrice(): Promise<number>;
  getOrderbook(depth?: number): Promise<OrderbookSnapshot>;
  subscribePrice(callback: (price: number) => void): void;
  unsubscribePrice(): void;
  
  // Orders
  placeOrder(order: GridOrderRequest): Promise<GridOrderResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  getOpenOrders(): Promise<GridOrder[]>;
  getOrderStatus(orderId: string): Promise<GridOrder>;
  
  // Account
  getBalance(): Promise<BalanceInfo>;
  getPosition(): Promise<PositionInfo | null>;
  
  // Configuration
  setLeverage(leverage: number): Promise<void>;
  setMarginMode(mode: 'isolated' | 'cross'): Promise<void>;
}

export interface GridOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  quantity: number;
  price?: number;
  clientOrderId?: string;
}

export interface GridOrderResult {
  success: boolean;
  order?: GridOrder;
  error?: string;
}

export interface OrderbookSnapshot {
  symbol: string;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  timestamp: Date;
}

export interface BalanceInfo {
  baseAsset: string;
  quoteAsset: string;
  baseBalance: number;
  quoteBalance: number;
  availableBase: number;
  availableQuote: number;
}

export interface PositionInfo {
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

// ==================== WEBSOCKET ====================

export interface PriceUpdate {
  symbol: string;
  exchange: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: Date;
}

export interface OrderbookUpdate {
  symbol: string;
  exchange: string;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  timestamp: Date;
}
