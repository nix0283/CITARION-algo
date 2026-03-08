/**
 * TypeScript types for CITARION
 */

// ==================== TRADING MODE ====================

export type TradingMode = "DEMO" | "REAL"

// ==================== MARKET DATA ====================

export interface MarketPrice {
  symbol: string
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
}

// ==================== POSITION ====================

export interface Position {
  id: string
  symbol: string
  direction: "LONG" | "SHORT"
  totalAmount: number
  avgEntryPrice: number
  currentPrice: number
  leverage: number
  unrealizedPnl: number
  stopLoss?: number | null
  takeProfit?: number | null
  trailingStop?: TrailingStopConfig | null
  // Funding tracking
  totalFundingPaid?: number
  totalFundingReceived?: number
  lastFundingTime?: string | null
  // Fees
  openFee?: number
  closeFee?: number
  isDemo: boolean
  createdAt: string
  updatedAt: string
}

export interface TrailingStopConfig {
  type: "PERCENT" | "ATR" | "PRICE"
  value: number
  activated: boolean
  highestPrice?: number
}

// ==================== TRADE ====================

export interface Trade {
  id: string
  symbol: string
  direction: "LONG" | "SHORT"
  status: "PENDING" | "OPEN" | "CLOSED" | "CANCELLED"
  entryPrice?: number
  exitPrice?: number
  amount: number
  leverage: number
  pnl: number
  pnlPercent: number
  fee: number
  stopLoss?: number | null
  takeProfits?: TakeProfitTarget[]
  closeReason?: "TP" | "SL" | "MANUAL" | "LIQUIDATION" | "TRAILING_STOP"
  signalSource?: "TELEGRAM" | "DISCORD" | "TRADINGVIEW" | "MANUAL"
  isDemo: boolean
  createdAt: string
  closedAt?: string
}

export interface TakeProfitTarget {
  price: number
  percentage: number
  filled: boolean
}

// ==================== SIGNAL ====================

export interface Signal {
  id: string
  source: "TELEGRAM" | "DISCORD" | "TRADINGVIEW" | "MANUAL"
  symbol: string
  direction: "LONG" | "SHORT"
  action: "BUY" | "SELL" | "CLOSE"
  entryPrices: number[]
  takeProfits: TakeProfitTarget[]
  stopLoss?: number | null
  leverage?: number
  rawMessage?: string
  confidence: number
  status: "PENDING" | "EXECUTED" | "FAILED" | "IGNORED"
  createdAt: string
}

// ==================== ACCOUNT ====================

export interface Account {
  id: string
  accountType: TradingMode
  exchangeId: string
  exchangeType: "spot" | "futures" | "inverse"
  exchangeName: string
  virtualBalance?: VirtualBalance
  isActive: boolean
  isTestnet: boolean
}

export interface VirtualBalance {
  USDT: number
  BTC: number
  ETH: number
  BNB: number
  SOL: number
  [key: string]: number
}

// ==================== BOT CONFIG ====================

export interface BotConfig {
  id: string
  name: string
  isActive: boolean
  exchangeId: string
  exchangeType: "spot" | "futures" | "inverse"
  
  // Trade amount
  tradeAmount: number
  amountType: "FIXED" | "PERCENTAGE"
  amountOverride: boolean
  
  // Trailing
  trailingEnabled: boolean
  trailingType?: TrailingType
  trailingValue?: number
  trailingStopPercent?: number
  
  // Leverage
  leverage: number
  leverageOverride: boolean
  
  // Stop Loss
  defaultStopLoss?: number
  
  // Filters
  maxOpenTrades: number
  allowedSymbols?: string[]
  blacklistedSymbols?: string[]
  
  // Notifications
  notifyOnEntry: boolean
  notifyOnExit: boolean
  notifyOnSL: boolean
  notifyOnTP: boolean
}

export type TrailingType = "BREAKEVEN" | "MOVING_TARGET" | "PERCENT_BELOW_HIGHEST" | "MOVING_2_TARGET"

// ==================== API RESPONSES ====================

export interface TradeOpenResponse {
  success: boolean
  trade?: Trade
  position?: Position
  error?: string
  message?: string
}

export interface TradeCloseResponse {
  success: boolean
  position?: { id: string; status: string; closedAt: string }
  pnl?: { value: number; percent: number; fee: number }
  error?: string
  message?: string
}

export interface ParsedSignalResponse {
  success: boolean
  signal?: Signal
  error?: string
  confidence?: number
}

// ==================== CHAT MESSAGE ====================

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  signal?: Signal
  timestamp: string
}

// ==================== WEBSOCKET ====================

export interface PriceUpdateMessage {
  type: "PRICE_UPDATE"
  data: Record<string, MarketPrice>
}

export interface PositionUpdateMessage {
  type: "POSITION_UPDATE"
  data: Position[]
}

export type WebSocketMessage = PriceUpdateMessage | PositionUpdateMessage

// ==================== FUNDING ====================

export interface FundingRate {
  symbol: string
  exchange: string
  fundingRate: number        // Decimal: 0.0001 = 0.01%
  fundingTime: Date | string
  markPrice?: number
  indexPrice?: number
  timestamp?: Date | string
}

export interface FundingPayment {
  id: string
  positionId: string
  symbol: string
  direction: "LONG" | "SHORT"
  quantity: number
  fundingRate: number
  payment: number            // Positive = received, Negative = paid
  fundingTime: Date | string
  createdAt?: Date | string
}

// ==================== PNL HISTORY ====================

export interface PnLHistory {
  id: string
  userId: string
  timestamp: Date | string
  isDemo: boolean
  balance: number
  equity: number
  realizedPnL: number
  unrealizedPnL: number
  fundingPnL: number
  feesPaid: number
  tradesCount: number
  winsCount: number
  lossesCount: number
}

export interface PnLStats {
  period: string
  realizedPnL: number
  unrealizedPnL: number
  fundingPnL: number
  feesPaid: number
  netPnL: number
  tradesCount: number
  winsCount: number
  lossesCount: number
  winRate: number
  profitFactor: number
  avgTrade: number
  bestTrade: number
  worstTrade: number
}
