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

// ==================== RISK MANAGEMENT ====================

export interface RiskManagementConfig {
  /** Maximum drawdown percentage before stopping */
  maxDrawdownPercent: number;
  /** Maximum open positions at once */
  maxOpenPositions: number;
  /** Daily loss limit in quote currency */
  dailyLossLimit: number;
  /** Weekly loss limit in quote currency */
  weeklyLossLimit: number;
  /** Maximum position size per trade */
  maxPositionSize: number;
  /** Maximum leverage allowed */
  maxLeverage: number;
  /** Enable emergency stop on risk breach */
  emergencyStopEnabled: boolean;
  /** Cooldown period after stop loss (minutes) */
  cooldownPeriodMinutes: number;
}

export interface RiskMetrics {
  currentDrawdown: number;
  currentDrawdownPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  dailyPnL: number;
  weeklyPnL: number;
  openPositions: number;
  positionUtilization: number;
  riskScore: number; // 0-100 risk score
  isWithinLimits: boolean;
  activeAlerts: RiskAlert[];
}

export interface RiskAlert {
  id: string;
  type: 'DRAWDOWN_WARNING' | 'DRAWDOWN_CRITICAL' | 'DAILY_LOSS_WARNING' | 'DAILY_LOSS_LIMIT' | 'POSITION_LIMIT' | 'LEVERAGE_WARNING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  timestamp: Date;
  value: number;
  threshold: number;
}

export interface DailyRiskTracker {
  date: string; // YYYY-MM-DD
  startBalance: number;
  currentBalance: number;
  realizedPnL: number;
  maxDrawdown: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

// ==================== PERFORMANCE METRICS ====================

export interface PerformanceMetrics {
  // Returns
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  dailyReturn: number;
  monthlyReturn: number;
  
  // Risk-adjusted
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  sterlingRatio: number;
  
  // Drawdown
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgDrawdown: number;
  maxDrawdownDuration: number; // days
  currentDrawdown: number;
  
  // Trading
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  payoffRatio: number; // avg win / avg loss
  avgWin: number;
  avgLoss: number;
  avgTradeDuration: number; // minutes
  
  // Grid specific
  gridEfficiency: number;
  levelUtilization: number;
  avgGridSpread: number;
  rebalanceCount: number;
  trailingCount: number;
  
  // Execution
  totalFees: number;
  feeRatio: number;
  avgSlippage: number;
  orderFillRate: number;
  
  // Volatility
  realizedVolatility: number;
  avgATR: number;
}

export interface PerformanceSnapshot {
  timestamp: Date;
  equity: number;
  balance: number;
  unrealizedPnL: number;
  drawdown: number;
  returnPercent: number;
}

// ==================== TRAILING GRID ====================

export interface TrailingGridConfig {
  enabled: boolean;
  /** Trail when price moves X% from grid center */
  trailTriggerPercent: number;
  /** Minimum distance to move grid (in quote currency) */
  minTrailDistance: number;
  /** Keep filled levels when trailing */
  keepFilledLevels: boolean;
  /** Maximum trail moves per session */
  maxTrailsPerSession: number;
  /** Trail direction: FOLLOW (follow price), OPPOSITE (trail opposite to position) */
  trailMode: 'FOLLOW' | 'OPPOSITE';
  /** Percentage of price movement to shift grid */
  trailSensitivity: number;
}

export interface TrailingGridState {
  originalCenter: number;
  currentCenter: number;
  trailCount: number;
  lastTrailTime: Date | null;
  lastTrailDirection: 'UP' | 'DOWN' | null;
  totalTrailingDistance: number;
  trailHistory: TrailingEvent[];
}

export interface TrailingEvent {
  timestamp: Date;
  price: number;
  fromCenter: number;
  toCenter: number;
  direction: 'UP' | 'DOWN';
  levelsShifted: number;
  filledLevelsPreserved: number;
}

// ==================== ADAPTIVE GRID ====================

export interface AdaptiveGridConfig {
  enabled: boolean;
  /** ATR period for volatility calculation */
  atrPeriod: number;
  /** Multiplier for ATR-based grid range */
  atrMultiplier: number;
  /** Minimum grid levels */
  minGridLevels: number;
  /** Maximum grid levels */
  maxGridLevels: number;
  /** Reconfigure grid when volatility changes X% */
  volatilityThreshold: number;
  /** Auto-adjust position size based on volatility */
  dynamicPositionSizing: boolean;
  /** Cooldown between reconfigurations (minutes) */
  reconfigureCooldown: number;
}

export interface AdaptiveGridState {
  baseATR: number;
  currentATR: number;
  atrPercent: number;
  lastReconfigureTime: Date | null;
  reconfigureCount: number;
  volatilityHistory: VolatilityRecord[];
  currentGridRange: { upper: number; lower: number };
}

export interface VolatilityRecord {
  timestamp: Date;
  atr: number;
  atrPercent: number;
  historicalVolatility: number;
  gridLevels: number;
}

// ==================== GRID LEVEL MANAGEMENT ====================

export interface GridLevelConfig {
  price: number;
  side: 'BUY' | 'SELL';
  quantity: number;
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED';
  orderId?: string;
  filledAt?: Date;
  avgFillPrice?: number;
}

export interface GridLevelAdjustment {
  type: 'ADD' | 'REMOVE' | 'MODIFY';
  levelIndex: number;
  oldPrice?: number;
  newPrice?: number;
  reason: string;
  timestamp: Date;
}

export interface DynamicLevelConfig {
  enabled: boolean;
  /** Add new levels when price approaches boundary */
  extendOnApproach: boolean;
  /** Distance percentage to extend grid */
  extendPercent: number;
  /** Remove unfilled levels far from price */
  removeDistantLevels: boolean;
  /** Distance percentage to consider "distant" */
  distantLevelPercent: number;
  /** Maximum levels to add in one adjustment */
  maxLevelsToAdd: number;
  /** Maximum levels to remove in one adjustment */
  maxLevelsToRemove: number;
}

// ==================== PROFIT TRACKER ====================

export interface GridLevelProfit {
  level: number;
  buyPrice: number;
  sellPrice: number;
  buyAmount: number;
  sellAmount: number;
  profit: number;
  profitPercent: number;
  completedAt: Date;
  duration: number; // milliseconds
}

export interface GridProfitStats {
  totalProfit: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgProfitPerLevel: number;
  bestLevel: number;
  worstLevel: number;
  profitByLevel: Record<number, number>;
  avgDuration: number;
}

// ==================== GRID TYPE ENUM ====================

export enum GridType {
  ARITHMETIC = 'ARITHMETIC',
  GEOMETRIC = 'GEOMETRIC',
  ADAPTIVE = 'ADAPTIVE',
}

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
  | 'PRICE_UPDATE'
  // New event types
  | 'GRID_TRAILED'
  | 'EMERGENCY_STOP'
  | 'RISK_ALERT'
  | 'GRID_RECONFIGURED'
  | 'GRID_LEVELS_ADDED'
  | 'GRID_LEVELS_REMOVED';

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
  
  // Extended metrics
  riskMetrics?: RiskMetrics;
  performanceMetrics?: PerformanceMetrics;
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
