/**
 * INSTITUTIONAL BOTS - Types
 *
 * Type definitions for all institutional trading bots:
 * - Spectrum (PR): Pairs Trading
 * - Reed (STA): Statistical Arbitrage
 * - Architect (MM): Market Making
 * - Equilibrist (MR): Mean Reversion
 * - Kron (TRF): Trend Following
 */

// =============================================================================
// COMMON TYPES
// =============================================================================

export type BotStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'HALTED' | 'ERROR';
export type BotMode = 'PAPER' | 'LIVE';

export interface BaseBotConfig {
  name: string;
  version: string;
  mode: BotMode;
  exchanges: ExchangeConfig[];
  riskConfig: RiskConfig;
  notifications: NotificationConfig;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export interface ExchangeConfig {
  exchange: string;
  symbols: string[];
  credentialRef: string;
  enabled: boolean;
}

export interface RiskConfig {
  maxPositionSize: number;
  maxTotalExposure: number;
  maxDrawdownPct: number;
  riskPerTrade: number;
  maxLeverage: number;
}

export interface NotificationConfig {
  telegram: boolean;
  email: boolean;
  onSignal: boolean;
  onTrade: boolean;
  onRiskEvent: boolean;
}

// =============================================================================
// SPECTRUM - PAIRS TRADING
// =============================================================================

export interface CointegrationResult {
  symbol1: string;
  symbol2: string;
  hedgeRatio: number;
  pValue: number;
  halfLife: number;
  spread: number[];
  zScore: number;
  meanReversionSpeed: number;
}

export interface PairSignal {
  id: string;
  timestamp: number;
  pair: [string, string];
  exchange: string;
  hedgeRatio: number;
  zScore: number;
  direction: 'LONG_SHORT' | 'SHORT_LONG';
  entrySpread: number;
  targetSpread: number;
  stopLossSpread: number;
  confidence: number;
}

export interface SpectrumConfig extends BaseBotConfig {
  name: 'Spectrum';
  code: 'PR';
  strategy: {
    lookbackPeriod: number;
    zScoreEntry: number;
    zScoreExit: number;
    zScoreStopLoss: number;
    minCointegration: number;
    maxHalfLife: number;
    rebalanceInterval: number;
    correlationThreshold: number;
    adfTestEnabled: boolean;
  };
}

export interface SpectrumState {
  status: BotStatus;
  pairs: Map<string, CointegrationResult>;
  positions: Map<string, PairPosition>;
  signals: PairSignal[];
  stats: PairStats;
}

export interface PairPosition {
  id: string;
  pair: [string, string];
  exchange: string;
  leg1: PositionLeg;
  leg2: PositionLeg;
  hedgeRatio: number;
  entrySpread: number;
  currentSpread: number;
  pnl: number;
  openedAt: number;
}

export interface PositionLeg {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
}

export interface PairStats {
  totalTrades: number;
  winRate: number;
  avgPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  correlationAvg: number;
}

// =============================================================================
// REED - STATISTICAL ARBITRAGE
// =============================================================================

export interface StatArbFactor {
  name: string;
  weight: number;
  value: number;
  normalized: number;
}

export interface StatArbSignal {
  id: string;
  timestamp: number;
  symbol: string;
  exchange: string;
  factors: StatArbFactor[];
  expectedReturn: number;
  confidence: number;
  holdingPeriod: number;
  direction: 'LONG' | 'SHORT';
}

export interface ReedConfig extends BaseBotConfig {
  name: 'Reed';
  code: 'STA';
  strategy: {
    factorModels: string[];
    lookbackPeriod: number;
    minExpectedReturn: number;
    maxHoldingPeriod: number;
    rebalanceFrequency: number;
    universeSize: number;
    sectorNeutral: boolean;
    marketNeutral: boolean;
    pcaComponents: number;
  };
}

export interface ReedState {
  status: BotStatus;
  factorModels: Map<string, number[]>;
  positions: Map<string, StatArbPosition>;
  signals: StatArbSignal[];
  residuals: Map<string, number[]>;
  stats: StatArbStats;
}

export interface StatArbPosition {
  id: string;
  symbol: string;
  exchange: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  expectedReturn: number;
  residual: number;
  pnl: number;
  openedAt: number;
}

export interface StatArbStats {
  totalTrades: number;
  winRate: number;
  avgPnL: number;
  factorReturns: Map<string, number>;
  informationRatio: number;
  trackingError: number;
}

// =============================================================================
// ARCHITECT - MARKET MAKING
// =============================================================================

export interface Quote {
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  spread: number;
  midPrice: number;
  timestamp: number;
}

export interface InventoryState {
  symbol: string;
  netPosition: number;
  avgCost: number;
  unrealizedPnl: number;
  targetInventory: number;
  skew: number;
}

export interface ArchitectConfig extends BaseBotConfig {
  name: 'Architect';
  code: 'MM';
  strategy: {
    baseSpreadPct: number;
    minSpreadPct: number;
    maxSpreadPct: number;
    orderSize: number;
    maxInventory: number;
    inventorySkewFactor: number;
    refreshRate: number;
    adverseSelectionProtection: boolean;
    latencyMs: number;
    volatilityAdjustment: boolean;
  };
}

export interface ArchitectState {
  status: BotStatus;
  quotes: Map<string, Quote>;
  inventory: Map<string, InventoryState>;
  orders: Map<string, MarketMakingOrder>;
  stats: MarketMakingStats;
}

export interface MarketMakingOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  filledSize: number;
  timestamp: number;
}

export interface MarketMakingStats {
  totalVolume: number;
  capturedSpread: number;
  inventoryPnl: number;
  totalPnl: number;
  fillRate: number;
  avgSpread: number;
  adverseSelectionCost: number;
  sharpeRatio: number;
}

// =============================================================================
// EQUILIBRIST - MEAN REVERSION
// =============================================================================

export interface MeanReversionSignal {
  id: string;
  timestamp: number;
  symbol: string;
  exchange: string;
  price: number;
  fairValue: number;
  deviation: number;
  zScore: number;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  expectedReturn: number;
}

export interface EquilibristConfig extends BaseBotConfig {
  name: 'Equilibrist';
  code: 'MR';
  strategy: {
    lookbackPeriod: number;
    zScoreEntry: number;
    zScoreExit: number;
    zScoreStopLoss: number;
    meanCalcMethod: 'SMA' | 'EMA' | 'KAMA' | 'REGRESSION';
    stdCalcMethod: 'SIMPLE' | 'EWMA' | 'PARKINSON';
    bollingerBands: boolean;
    rsiConfirmation: boolean;
    volumeConfirmation: boolean;
    maxHoldingPeriod: number;
  };
}

export interface EquilibristState {
  status: BotStatus;
  fairValues: Map<string, number>;
  positions: Map<string, MeanReversionPosition>;
  signals: MeanReversionSignal[];
  stats: MeanReversionStats;
}

export interface MeanReversionPosition {
  id: string;
  symbol: string;
  exchange: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  fairValue: number;
  entryZScore: number;
  currentZScore: number;
  pnl: number;
  openedAt: number;
}

export interface MeanReversionStats {
  totalTrades: number;
  winRate: number;
  avgPnL: number;
  avgHoldingTime: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgZScoreEntry: number;
  avgZScoreExit: number;
}

// =============================================================================
// KRON - TREND FOLLOWING
// =============================================================================

export interface TrendSignal {
  id: string;
  timestamp: number;
  symbol: string;
  exchange: string;
  direction: 'LONG' | 'SHORT';
  strength: number;
  confidence: number;
  indicators: {
    adx: number;
    macd: { value: number; signal: number; histogram: number };
    ema: { fast: number; medium: number; slow: number };
    supertrend: { value: number; direction: number };
  };
  price: number;
}

export interface KronConfig extends BaseBotConfig {
  name: 'Kron';
  code: 'TRF';
  strategy: {
    trendMethod: 'EMA_CROSS' | 'SUPERTREND' | 'ADX' | 'COMBINED';
    emaPeriods: { fast: number; medium: number; slow: number };
    adxThreshold: number;
    supertrendPeriod: number;
    supertrendMultiplier: number;
    minTrendStrength: number;
    trailingStop: {
      enabled: boolean;
      atrPeriod: number;
      atrMultiplier: number;
    };
    pyramidEnabled: boolean;
    maxPyramidLevels: number;
    positionSizing: 'FIXED' | 'VOLATILITY_ADJUSTED' | 'KELLY';
  };
}

export interface KronState {
  status: BotStatus;
  trends: Map<string, TrendDirection>;
  positions: Map<string, TrendPosition>;
  signals: TrendSignal[];
  stats: TrendStats;
}

export type TrendDirection = 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';

export interface TrendPosition {
  id: string;
  symbol: string;
  exchange: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  trailingStop: number;
  pyramidLevel: number;
  pnl: number;
  openedAt: number;
}

export interface TrendStats {
  totalTrades: number;
  winRate: number;
  avgPnL: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgHoldingTime: number;
  trendCapture: number; // % of trend captured
}
