/**
 * CITARION Demo Data - Comprehensive mock data for all UI components
 * Based on 2026-2028 fintech UI/UX trends
 */

// ============================================
// Types
// ============================================

export interface DemoBot {
  id: string;
  name: string;
  type: 'grid' | 'dca' | 'bb' | 'argus' | 'vision' | 'orion' | 'range';
  status: 'running' | 'paused' | 'stopped' | 'error';
  exchange: string;
  symbol: string;
  ROI: number;
  profit: number;
  profitPercent: number;
  winRate: number;
  totalTrades: number;
  activePositions: number;
  uptime: string;
  lastActivity: Date;
  config: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  drawdown: number;
  dailyPnL: number;
  weeklyPnL: number;
  monthlyPnL: number;
}

export interface DemoSignal {
  id: string;
  type: 'entry' | 'exit' | 'stop_loss' | 'take_profit';
  status: 'active' | 'completed' | 'cancelled' | 'in_progress' | 'drawdown';
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopLoss: number;
  leverage: number;
  size: number;
  pnl: number;
  pnlPercent: number;
  progress: number; // 0-100
  source: string;
  provider: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  botId?: string;
  botName?: string;
  drawdownPercent?: number;
  maxDrawdown?: number;
  riskReward: number;
  timeInTrade: string;
}

export interface DemoPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercent: number;
  roe: number;
  leverage: number;
  liquidationPrice: number;
  margin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openTime: Date;
  exchange: string;
  botId?: string;
  botName?: string;
}

export interface DemoTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  status: 'filled' | 'partial' | 'cancelled' | 'pending';
  price: number;
  amount: number;
  total: number;
  fee: number;
  feeCurrency: string;
  pnl: number;
  pnlPercent: number;
  exchange: string;
  botId?: string;
  botName?: string;
  timestamp: Date;
  orderId: string;
}

export interface DemoJournalEntry {
  id: string;
  date: Date;
  title: string;
  content: string;
  trades: number;
  pnl: number;
  pnlPercent: number;
  winRate: number;
  emotion: 'confident' | 'neutral' | 'fearful' | 'greedy' | 'anxious';
  lessons: string[];
  mistakes: string[];
  improvements: string[];
  marketCondition: 'bull' | 'bear' | 'sideways' | 'volatile';
  tags: string[];
}

export interface DemoEquityPoint {
  date: Date;
  equity: number;
  pnl: number;
  drawdown: number;
  trades: number;
  winRate: number;
}

export interface DemoMetric {
  label: string;
  value: string | number;
  change?: number;
  changePercent?: number;
  trend?: 'up' | 'down' | 'neutral';
  period?: string;
}

// ============================================
// Bots Data
// ============================================

export const demoBots: DemoBot[] = [
  {
    id: 'bot-001',
    name: 'BTC Grid Master',
    type: 'grid',
    status: 'running',
    exchange: 'Binance',
    symbol: 'BTCUSDT',
    ROI: 45.67,
    profit: 4567.89,
    profitPercent: 45.67,
    winRate: 87.5,
    totalTrades: 342,
    activePositions: 8,
    uptime: '15d 8h 32m',
    lastActivity: new Date(Date.now() - 1000 * 60 * 5),
    config: { grids: 20, upperPrice: 72000, lowerPrice: 58000, profitPerGrid: 0.5 },
    riskLevel: 'medium',
    drawdown: 8.5,
    dailyPnL: 234.56,
    weeklyPnL: 1234.78,
    monthlyPnL: 4567.89,
  },
  {
    id: 'bot-002',
    name: 'ETH DCA Accumulator',
    type: 'dca',
    status: 'running',
    exchange: 'Bybit',
    symbol: 'ETHUSDT',
    ROI: 23.45,
    profit: 2345.67,
    profitPercent: 23.45,
    winRate: 72.3,
    totalTrades: 89,
    activePositions: 3,
    uptime: '30d 12h 15m',
    lastActivity: new Date(Date.now() - 1000 * 60 * 15),
    config: { baseOrder: 100, safetyOrders: 5, takeProfit: 3.5, deviation: 2.0 },
    riskLevel: 'low',
    drawdown: 5.2,
    dailyPnL: 89.34,
    weeklyPnL: 567.89,
    monthlyPnL: 2345.67,
  },
  {
    id: 'bot-003',
    name: 'SOL BB Reversal',
    type: 'bb',
    status: 'running',
    exchange: 'OKX',
    symbol: 'SOLUSDT',
    ROI: 67.89,
    profit: 6789.12,
    profitPercent: 67.89,
    winRate: 81.2,
    totalTrades: 156,
    activePositions: 2,
    uptime: '7d 4h 28m',
    lastActivity: new Date(Date.now() - 1000 * 60 * 2),
    config: { period: 20, deviation: 2.0, rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30 },
    riskLevel: 'medium',
    drawdown: 12.3,
    dailyPnL: 456.78,
    weeklyPnL: 2345.67,
    monthlyPnL: 6789.12,
  },
  {
    id: 'bot-004',
    name: 'Whale Hunter Pro',
    type: 'argus',
    status: 'running',
    exchange: 'Binance',
    symbol: 'BTCUSDT',
    ROI: 123.45,
    profit: 12345.67,
    profitPercent: 123.45,
    winRate: 68.9,
    totalTrades: 45,
    activePositions: 1,
    uptime: '45d 18h 42m',
    lastActivity: new Date(Date.now() - 1000 * 60 * 30),
    config: { whaleThreshold: 500000, volumeSpike: 3.0, followDelay: 5000 },
    riskLevel: 'high',
    drawdown: 18.7,
    dailyPnL: 567.89,
    weeklyPnL: 3456.78,
    monthlyPnL: 12345.67,
  },
  {
    id: 'bot-005',
    name: 'Vision AI Trader',
    type: 'vision',
    status: 'running',
    exchange: 'HyperLiquid',
    symbol: 'BTCUSDT',
    ROI: 89.34,
    profit: 8934.56,
    profitPercent: 89.34,
    winRate: 75.6,
    totalTrades: 78,
    activePositions: 2,
    uptime: '21d 6h 18m',
    lastActivity: new Date(Date.now() - 1000 * 60 * 8),
    config: { model: 'transformer-v3', confidence: 0.75, horizon: 24 },
    riskLevel: 'medium',
    drawdown: 15.4,
    dailyPnL: 345.67,
    weeklyPnL: 2123.45,
    monthlyPnL: 8934.56,
  },
  {
    id: 'bot-006',
    name: 'Multi-Asset Orion',
    type: 'orion',
    status: 'paused',
    exchange: 'Bybit',
    symbol: 'Multi',
    ROI: 34.56,
    profit: 3456.78,
    profitPercent: 34.56,
    winRate: 65.4,
    totalTrades: 234,
    activePositions: 5,
    uptime: '10d 2h 45m',
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 2),
    config: { maxPositions: 10, correlationLimit: 0.7, rebalanceInterval: 3600 },
    riskLevel: 'low',
    drawdown: 7.8,
    dailyPnL: 0,
    weeklyPnL: 1234.56,
    monthlyPnL: 3456.78,
  },
  {
    id: 'bot-007',
    name: 'Range Bot BTC',
    type: 'range',
    status: 'stopped',
    exchange: 'Binance',
    symbol: 'BTCUSDT',
    ROI: -5.67,
    profit: -567.89,
    profitPercent: -5.67,
    winRate: 45.6,
    totalTrades: 67,
    activePositions: 0,
    uptime: '5d 12h 30m',
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 24),
    config: { rangeHigh: 70000, rangeLow: 65000, positionSize: 0.01 },
    riskLevel: 'high',
    drawdown: 25.6,
    dailyPnL: 0,
    weeklyPnL: -234.56,
    monthlyPnL: -567.89,
  },
  {
    id: 'bot-008',
    name: 'XRP Grid Flex',
    type: 'grid',
    status: 'error',
    exchange: 'Bitget',
    symbol: 'XRPUSDT',
    ROI: 12.34,
    profit: 1234.56,
    profitPercent: 12.34,
    winRate: 58.9,
    totalTrades: 89,
    activePositions: 4,
    uptime: '3d 8h 15m',
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 6),
    config: { grids: 15, upperPrice: 2.5, lowerPrice: 1.8, profitPerGrid: 0.8 },
    riskLevel: 'critical',
    drawdown: 35.2,
    dailyPnL: -123.45,
    weeklyPnL: 456.78,
    monthlyPnL: 1234.56,
  },
];

// ============================================
// Signals Data
// ============================================

export const demoSignals: DemoSignal[] = [
  {
    id: 'sig-001',
    type: 'entry',
    status: 'active',
    symbol: 'BTCUSDT',
    side: 'long',
    entryPrice: 65432.10,
    currentPrice: 66789.45,
    targetPrice: 72000.00,
    stopLoss: 63000.00,
    leverage: 3,
    size: 0.5,
    pnl: 678.68,
    pnlPercent: 2.07,
    progress: 24,
    source: 'TradingView',
    provider: 'CryptoSignals Pro',
    confidence: 0.85,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    updatedAt: new Date(Date.now() - 1000 * 60 * 2),
    botId: 'bot-001',
    botName: 'BTC Grid Master',
    riskReward: 2.5,
    timeInTrade: '4h 12m',
  },
  {
    id: 'sig-002',
    type: 'entry',
    status: 'in_progress',
    symbol: 'ETHUSDT',
    side: 'long',
    entryPrice: 3456.78,
    currentPrice: 3523.45,
    targetPrice: 3800.00,
    stopLoss: 3200.00,
    leverage: 2,
    size: 2.5,
    pnl: 166.68,
    pnlPercent: 1.93,
    progress: 52,
    source: 'Telegram',
    provider: 'Altcoin Buzz',
    confidence: 0.72,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
    updatedAt: new Date(Date.now() - 1000 * 60 * 5),
    botId: 'bot-002',
    botName: 'ETH DCA Accumulator',
    riskReward: 1.8,
    timeInTrade: '12h 34m',
  },
  {
    id: 'sig-003',
    type: 'entry',
    status: 'drawdown',
    symbol: 'SOLUSDT',
    side: 'short',
    entryPrice: 178.45,
    currentPrice: 182.34,
    targetPrice: 155.00,
    stopLoss: 195.00,
    leverage: 5,
    size: 50,
    pnl: -194.50,
    pnlPercent: -2.18,
    progress: 0,
    source: 'Discord',
    provider: 'Whale Alert',
    confidence: 0.65,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8),
    updatedAt: new Date(Date.now() - 1000 * 60 * 3),
    botId: 'bot-003',
    botName: 'SOL BB Reversal',
    drawdownPercent: 8.2,
    maxDrawdown: 12.5,
    riskReward: 1.6,
    timeInTrade: '8h 45m',
  },
  {
    id: 'sig-004',
    type: 'entry',
    status: 'completed',
    symbol: 'DOGEUSDT',
    side: 'long',
    entryPrice: 0.1234,
    currentPrice: 0.1456,
    targetPrice: 0.1450,
    stopLoss: 0.1100,
    leverage: 2,
    size: 10000,
    pnl: 222.00,
    pnlPercent: 18.0,
    progress: 100,
    source: 'TradingView',
    provider: 'Meme Coin Master',
    confidence: 0.78,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    updatedAt: new Date(Date.now() - 1000 * 60 * 30),
    botId: 'bot-006',
    botName: 'Multi-Asset Orion',
    riskReward: 1.8,
    timeInTrade: '23h 30m',
  },
  {
    id: 'sig-005',
    type: 'entry',
    status: 'active',
    symbol: 'BNBUSDT',
    side: 'long',
    entryPrice: 567.89,
    currentPrice: 589.34,
    targetPrice: 650.00,
    stopLoss: 530.00,
    leverage: 2,
    size: 5,
    pnl: 107.25,
    pnlPercent: 3.78,
    progress: 35,
    source: 'AI Prediction',
    provider: 'Vision AI',
    confidence: 0.92,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
    updatedAt: new Date(Date.now() - 1000 * 60),
    botId: 'bot-005',
    botName: 'Vision AI Trader',
    riskReward: 2.2,
    timeInTrade: '6h 15m',
  },
  {
    id: 'sig-006',
    type: 'exit',
    status: 'in_progress',
    symbol: 'AVAXUSDT',
    side: 'short',
    entryPrice: 45.67,
    currentPrice: 43.21,
    targetPrice: 40.00,
    stopLoss: 48.00,
    leverage: 3,
    size: 100,
    pnl: 246.00,
    pnlPercent: 5.38,
    progress: 72,
    source: 'Whale Tracker',
    provider: 'Argus Bot',
    confidence: 0.88,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18),
    updatedAt: new Date(Date.now() - 1000 * 60 * 10),
    botId: 'bot-004',
    botName: 'Whale Hunter Pro',
    riskReward: 2.0,
    timeInTrade: '17h 50m',
  },
  {
    id: 'sig-007',
    type: 'stop_loss',
    status: 'drawdown',
    symbol: 'LINKUSDT',
    side: 'long',
    entryPrice: 18.90,
    currentPrice: 17.45,
    targetPrice: 22.00,
    stopLoss: 17.50,
    leverage: 4,
    size: 200,
    pnl: -290.00,
    pnlPercent: -7.67,
    progress: 0,
    source: 'Telegram',
    provider: 'DeFi Signals',
    confidence: 0.55,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36),
    updatedAt: new Date(Date.now() - 1000 * 60 * 15),
    drawdownPercent: 15.3,
    maxDrawdown: 18.2,
    riskReward: 1.4,
    timeInTrade: '1d 12h',
  },
  {
    id: 'sig-008',
    type: 'take_profit',
    status: 'completed',
    symbol: 'MATICUSDT',
    side: 'long',
    entryPrice: 0.78,
    currentPrice: 0.92,
    targetPrice: 0.92,
    stopLoss: 0.72,
    leverage: 2,
    size: 5000,
    pnl: 700.00,
    pnlPercent: 17.95,
    progress: 100,
    source: 'Discord',
    provider: 'Layer 2 Alpha',
    confidence: 0.82,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60),
    botId: 'bot-006',
    botName: 'Multi-Asset Orion',
    riskReward: 2.3,
    timeInTrade: '2d',
  },
];

// ============================================
// Positions Data
// ============================================

export const demoPositions: DemoPosition[] = [
  {
    id: 'pos-001',
    symbol: 'BTCUSDT',
    side: 'long',
    size: 0.5,
    entryPrice: 65432.10,
    currentPrice: 66789.45,
    markPrice: 66750.00,
    pnl: 678.68,
    pnlPercent: 2.07,
    roe: 6.21,
    leverage: 3,
    liquidationPrice: 43621.40,
    margin: 10905.35,
    unrealizedPnl: 678.68,
    realizedPnl: 1234.56,
    openTime: new Date(Date.now() - 1000 * 60 * 60 * 4),
    exchange: 'Binance',
    botId: 'bot-001',
    botName: 'BTC Grid Master',
  },
  {
    id: 'pos-002',
    symbol: 'ETHUSDT',
    side: 'long',
    size: 2.5,
    entryPrice: 3456.78,
    currentPrice: 3523.45,
    markPrice: 3520.00,
    pnl: 166.68,
    pnlPercent: 1.93,
    roe: 3.86,
    leverage: 2,
    liquidationPrice: 1728.39,
    margin: 4320.98,
    unrealizedPnl: 166.68,
    realizedPnl: 567.89,
    openTime: new Date(Date.now() - 1000 * 60 * 60 * 12),
    exchange: 'Bybit',
    botId: 'bot-002',
    botName: 'ETH DCA Accumulator',
  },
  {
    id: 'pos-003',
    symbol: 'SOLUSDT',
    side: 'short',
    size: 50,
    entryPrice: 178.45,
    currentPrice: 182.34,
    markPrice: 182.50,
    pnl: -194.50,
    pnlPercent: -2.18,
    roe: -10.9,
    leverage: 5,
    liquidationPrice: 214.14,
    margin: 1784.50,
    unrealizedPnl: -194.50,
    realizedPnl: 345.67,
    openTime: new Date(Date.now() - 1000 * 60 * 60 * 8),
    exchange: 'OKX',
    botId: 'bot-003',
    botName: 'SOL BB Reversal',
  },
  {
    id: 'pos-004',
    symbol: 'BNBUSDT',
    side: 'long',
    size: 5,
    entryPrice: 567.89,
    currentPrice: 589.34,
    markPrice: 588.00,
    pnl: 107.25,
    pnlPercent: 3.78,
    roe: 7.56,
    leverage: 2,
    liquidationPrice: 378.59,
    margin: 1419.73,
    unrealizedPnl: 107.25,
    realizedPnl: 234.56,
    openTime: new Date(Date.now() - 1000 * 60 * 60 * 6),
    exchange: 'Binance',
    botId: 'bot-005',
    botName: 'Vision AI Trader',
  },
  {
    id: 'pos-005',
    symbol: 'AVAXUSDT',
    side: 'short',
    size: 100,
    entryPrice: 45.67,
    currentPrice: 43.21,
    markPrice: 43.30,
    pnl: 246.00,
    pnlPercent: 5.38,
    roe: 16.14,
    leverage: 3,
    liquidationPrice: 60.89,
    margin: 1522.33,
    unrealizedPnl: 246.00,
    realizedPnl: 456.78,
    openTime: new Date(Date.now() - 1000 * 60 * 60 * 18),
    exchange: 'Binance',
    botId: 'bot-004',
    botName: 'Whale Hunter Pro',
  },
];

// ============================================
// Trades History Data
// ============================================

export const demoTrades: DemoTrade[] = [
  {
    id: 'trade-001',
    symbol: 'BTCUSDT',
    side: 'buy',
    type: 'limit',
    status: 'filled',
    price: 65432.10,
    amount: 0.5,
    total: 32716.05,
    fee: 32.72,
    feeCurrency: 'USDT',
    pnl: 678.68,
    pnlPercent: 2.07,
    exchange: 'Binance',
    botId: 'bot-001',
    botName: 'BTC Grid Master',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4),
    orderId: 'ORD-12345',
  },
  {
    id: 'trade-002',
    symbol: 'ETHUSDT',
    side: 'buy',
    type: 'market',
    status: 'filled',
    price: 3456.78,
    amount: 2.5,
    total: 8641.95,
    fee: 8.64,
    feeCurrency: 'USDT',
    pnl: 166.68,
    pnlPercent: 1.93,
    exchange: 'Bybit',
    botId: 'bot-002',
    botName: 'ETH DCA Accumulator',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12),
    orderId: 'ORD-12346',
  },
  {
    id: 'trade-003',
    symbol: 'DOGEUSDT',
    side: 'sell',
    type: 'limit',
    status: 'filled',
    price: 0.1456,
    amount: 10000,
    total: 1456.00,
    fee: 1.46,
    feeCurrency: 'USDT',
    pnl: 222.00,
    pnlPercent: 18.0,
    exchange: 'Binance',
    botId: 'bot-006',
    botName: 'Multi-Asset Orion',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    orderId: 'ORD-12347',
  },
  {
    id: 'trade-004',
    symbol: 'MATICUSDT',
    side: 'sell',
    type: 'limit',
    status: 'filled',
    price: 0.92,
    amount: 5000,
    total: 4600.00,
    fee: 4.60,
    feeCurrency: 'USDT',
    pnl: 700.00,
    pnlPercent: 17.95,
    exchange: 'Binance',
    botId: 'bot-006',
    botName: 'Multi-Asset Orion',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
    orderId: 'ORD-12348',
  },
  {
    id: 'trade-005',
    symbol: 'SOLUSDT',
    side: 'sell',
    type: 'market',
    status: 'filled',
    price: 178.45,
    amount: 50,
    total: 8922.50,
    fee: 8.92,
    feeCurrency: 'USDT',
    pnl: -194.50,
    pnlPercent: -2.18,
    exchange: 'OKX',
    botId: 'bot-003',
    botName: 'SOL BB Reversal',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
    orderId: 'ORD-12349',
  },
  {
    id: 'trade-006',
    symbol: 'BNBUSDT',
    side: 'buy',
    type: 'limit',
    status: 'filled',
    price: 567.89,
    amount: 5,
    total: 2839.45,
    fee: 2.84,
    feeCurrency: 'BNB',
    pnl: 107.25,
    pnlPercent: 3.78,
    exchange: 'Binance',
    botId: 'bot-005',
    botName: 'Vision AI Trader',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
    orderId: 'ORD-12350',
  },
  {
    id: 'trade-007',
    symbol: 'AVAXUSDT',
    side: 'sell',
    type: 'market',
    status: 'filled',
    price: 45.67,
    amount: 100,
    total: 4567.00,
    fee: 4.57,
    feeCurrency: 'USDT',
    pnl: 246.00,
    pnlPercent: 5.38,
    exchange: 'Binance',
    botId: 'bot-004',
    botName: 'Whale Hunter Pro',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18),
    orderId: 'ORD-12351',
  },
  {
    id: 'trade-008',
    symbol: 'LINKUSDT',
    side: 'buy',
    type: 'limit',
    status: 'partial',
    price: 18.90,
    amount: 200,
    total: 3780.00,
    fee: 3.78,
    feeCurrency: 'USDT',
    pnl: -290.00,
    pnlPercent: -7.67,
    exchange: 'Binance',
    botId: 'bot-007',
    botName: 'Range Bot BTC',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36),
    orderId: 'ORD-12352',
  },
];

// ============================================
// Trading Journal Data
// ============================================

export const demoJournalEntries: DemoJournalEntry[] = [
  {
    id: 'journal-001',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 0),
    title: 'Strong Bitcoin Movement',
    content: 'Bitcoin broke through the 66k resistance with strong volume. All grid bots performing well today. Market sentiment is bullish.',
    trades: 12,
    pnl: 1234.56,
    pnlPercent: 3.45,
    winRate: 75.0,
    emotion: 'confident',
    lessons: ['Patience pays off - waited for the right entry', 'Volume confirmation is crucial for breakout trades'],
    mistakes: ['FOMO on LINK trade - entered too early'],
    improvements: ['Add volume filter to entry conditions', 'Implement trailing stop for winning positions'],
    marketCondition: 'bull',
    tags: ['breakout', 'volume', 'grid-trading'],
  },
  {
    id: 'journal-002',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
    title: 'Mixed Market Day',
    content: 'Altcoins showing weakness while BTC consolidates. Reduced position sizes on alt trades. SOL position in drawdown but holding.',
    trades: 8,
    pnl: 456.78,
    pnlPercent: 1.23,
    winRate: 62.5,
    emotion: 'neutral',
    lessons: ['Market rotation - BTC dominance increasing', 'Risk management helped limit losses'],
    mistakes: ['Overleveraged on SOL trade'],
    improvements: ['Monitor BTC dominance more closely', 'Add correlation check between positions'],
    marketCondition: 'sideways',
    tags: ['consolidation', 'risk-management', 'altcoins'],
  },
  {
    id: 'journal-003',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    title: 'Volatile Session',
    content: 'Flash crash followed by quick recovery. Whale Hunter caught the move perfectly. Vision AI prediction accuracy improving.',
    trades: 15,
    pnl: 2345.67,
    pnlPercent: 6.78,
    winRate: 80.0,
    emotion: 'confident',
    lessons: ['Volatility creates opportunity', 'AI predictions working well in volatile conditions'],
    mistakes: ['Missed the initial dip - slow reaction time'],
    improvements: ['Set up faster alerts for volatility spikes', 'Increase position size on high-confidence AI signals'],
    marketCondition: 'volatile',
    tags: ['volatility', 'ai-trading', 'whale-tracking'],
  },
  {
    id: 'journal-004',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    title: 'Drawdown Management',
    content: 'SOL position hit max drawdown. Decided to hold based on technical analysis. LINK position approaching stop loss.',
    trades: 5,
    pnl: -234.56,
    pnlPercent: -0.67,
    winRate: 40.0,
    emotion: 'anxious',
    lessons: ['Position sizing is critical for drawdown survival', 'Mental stop-loss is harder than planned stop-loss'],
    mistakes: ['Added to losing position', 'Ignored initial stop-loss warning'],
    improvements: ['Stick to planned risk management', 'Implement automated position reduction on drawdown'],
    marketCondition: 'bear',
    tags: ['drawdown', 'risk-management', 'emotions'],
  },
  {
    id: 'journal-005',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
    title: 'Weekend Recovery',
    content: 'Markets recovered over the weekend. DOGE and MATIC trades hit take profit. Rebalanced portfolio allocation.',
    trades: 10,
    pnl: 1567.89,
    pnlPercent: 4.56,
    winRate: 70.0,
    emotion: 'confident',
    lessons: ['Weekend trading can be profitable with low volume', 'Take profits when available'],
    mistakes: ['Closed ETH position too early'],
    improvements: ['Set partial take profits for longer moves', 'Review weekend trading strategy'],
    marketCondition: 'bull',
    tags: ['weekend', 'take-profit', 'rebalancing'],
  },
];

// ============================================
// Equity Curve Data (Last 30 days)
// ============================================

export const demoEquityCurve: DemoEquityPoint[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(Date.now() - 1000 * 60 * 60 * 24 * (29 - i));
  const baseEquity = 10000;
  const dailyGrowth = Math.sin(i * 0.3) * 2 + Math.random() * 3 - 0.5;
  const equity = baseEquity + i * 150 + dailyGrowth * 100;
  const pnl = dailyGrowth * 100;
  const drawdown = Math.max(0, -dailyGrowth * 50);
  const trades = Math.floor(Math.random() * 15) + 5;
  const winRate = Math.min(100, Math.max(40, 65 + dailyGrowth * 5));

  return {
    date,
    equity: Math.round(equity * 100) / 100,
    pnl: Math.round(pnl * 100) / 100,
    drawdown: Math.round(drawdown * 100) / 100,
    trades,
    winRate: Math.round(winRate * 10) / 10,
  };
});

// ============================================
// Summary Metrics
// ============================================

export const demoMetrics = {
  totalBalance: 15234.56,
  totalPnL: 5234.56,
  totalPnLPercent: 52.35,
  dailyPnL: 1234.56,
  dailyPnLPercent: 8.82,
  weeklyPnL: 4567.89,
  weeklyPnLPercent: 42.79,
  monthlyPnL: 5234.56,
  monthlyPnLPercent: 52.35,
  totalTrades: 1234,
  winRate: 72.5,
  avgTradeDuration: '4h 32m',
  sharpeRatio: 2.34,
  maxDrawdown: 15.6,
  avgROI: 45.67,
  profitFactor: 2.15,
  activeBots: 6,
  totalBots: 8,
  activeSignals: 4,
  totalSignals: 8,
  connectedExchanges: 5,
};

// ============================================
// Performance Chart Data
// ============================================

export const demoPerformanceData = {
  daily: Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    pnl: Math.round((Math.sin(i * 0.5) * 100 + Math.random() * 50) * 100) / 100,
    trades: Math.floor(Math.random() * 5) + 1,
  })),
  weekly: Array.from({ length: 7 }, (_, i) => ({
    day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
    pnl: Math.round((Math.sin(i * 0.8) * 500 + Math.random() * 300) * 100) / 100,
    trades: Math.floor(Math.random() * 20) + 5,
  })),
  monthly: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * (29 - i)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    pnl: Math.round((Math.sin(i * 0.3) * 200 + Math.random() * 150) * 100) / 100,
    equity: Math.round((10000 + i * 175 + Math.sin(i * 0.3) * 200) * 100) / 100,
  })),
};

// ============================================
// Asset Allocation Data
// ============================================

export const demoAssetAllocation = [
  { symbol: 'BTC', value: 6789.12, percent: 44.6, change: 5.67 },
  { symbol: 'ETH', value: 3456.78, percent: 22.7, change: 3.45 },
  { symbol: 'SOL', value: 1234.56, percent: 8.1, change: -2.34 },
  { symbol: 'BNB', value: 987.65, percent: 6.5, change: 2.12 },
  { symbol: 'USDT', value: 2766.45, percent: 18.2, change: 0 },
];

// ============================================
// Exchange Status Data
// ============================================

export const demoExchangeStatus = [
  { name: 'Binance', status: 'connected', latency: 45, lastUpdate: new Date(Date.now() - 1000) },
  { name: 'Bybit', status: 'connected', latency: 38, lastUpdate: new Date(Date.now() - 2000) },
  { name: 'OKX', status: 'connected', latency: 52, lastUpdate: new Date(Date.now() - 1500) },
  { name: 'HyperLiquid', status: 'connected', latency: 25, lastUpdate: new Date(Date.now() - 500) },
  { name: 'Bitget', status: 'disconnected', latency: 0, lastUpdate: new Date(Date.now() - 60000) },
];

// ============================================
// Exchange Balance Data (Per Asset)
// ============================================

export interface DemoExchangeBalance {
  exchange: string;
  totalBalanceUSDT: number;
  availableUSDT: number;
  inOrderUSDT: number;
  inPositionUSDT: number;
  unrealizedPnl: number;
  todayPnl: number;
  todayPnlPercent: number;
  weekPnl: number;
  weekPnlPercent: number;
  monthPnl: number;
  monthPnlPercent: number;
  assets: DemoAssetBalance[];
  lastSync: Date;
  apiStatus: 'connected' | 'rate_limited' | 'error' | 'readonly';
  permissions: ('read' | 'trade' | 'withdraw')[];
}

export interface DemoAssetBalance {
  symbol: string;
  name: string;
  network: string;
  total: number;
  available: number;
  inOrder: number;
  inPosition: number;
  priceUSDT: number;
  valueUSDT: number;
  change24h: number;
  change7d: number;
  change30d: number;
  avgEntryPrice?: number;
  roi?: number;
  isStaking?: boolean;
  stakingAPY?: number;
}

export const demoExchangeBalances: DemoExchangeBalance[] = [
  {
    exchange: 'Binance',
    totalBalanceUSDT: 45678.90,
    availableUSDT: 12345.67,
    inOrderUSDT: 8234.56,
    inPositionUSDT: 25098.67,
    unrealizedPnl: 1234.56,
    todayPnl: 567.89,
    todayPnlPercent: 1.26,
    weekPnl: 3456.78,
    weekPnlPercent: 8.19,
    monthPnl: 12345.67,
    monthPnlPercent: 37.02,
    assets: [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        network: 'BTC',
        total: 0.4567,
        available: 0.1234,
        inOrder: 0.1000,
        inPosition: 0.2333,
        priceUSDT: 66789.45,
        valueUSDT: 30501.23,
        change24h: 2.34,
        change7d: 5.67,
        change30d: 12.45,
        avgEntryPrice: 54321.00,
        roi: 22.89,
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        network: 'ETH',
        total: 3.456,
        available: 1.234,
        inOrder: 0.500,
        inPosition: 1.722,
        priceUSDT: 3523.45,
        valueUSDT: 12178.91,
        change24h: 1.89,
        change7d: 4.23,
        change30d: 8.67,
        avgEntryPrice: 2987.50,
        roi: 17.92,
      },
      {
        symbol: 'BNB',
        name: 'BNB',
        network: 'BSC',
        total: 12.345,
        available: 5.000,
        inOrder: 2.345,
        inPosition: 5.000,
        priceUSDT: 589.34,
        valueUSDT: 7275.23,
        change24h: -0.45,
        change7d: 2.12,
        change30d: 6.78,
        avgEntryPrice: 512.00,
        roi: 15.11,
        isStaking: true,
        stakingAPY: 5.2,
      },
      {
        symbol: 'SOL',
        name: 'Solana',
        network: 'SOL',
        total: 45.67,
        available: 20.00,
        inOrder: 10.67,
        inPosition: 15.00,
        priceUSDT: 182.34,
        valueUSDT: 8326.78,
        change24h: -2.18,
        change7d: -1.34,
        change30d: 4.56,
        avgEntryPrice: 178.45,
        roi: 2.18,
      },
      {
        symbol: 'USDT',
        name: 'Tether',
        network: 'TRC20',
        total: 5678.90,
        available: 3456.78,
        inOrder: 1222.12,
        inPosition: 1000.00,
        priceUSDT: 1.00,
        valueUSDT: 5678.90,
        change24h: 0.01,
        change7d: 0.01,
        change30d: 0.02,
      },
    ],
    lastSync: new Date(Date.now() - 5000),
    apiStatus: 'connected',
    permissions: ['read', 'trade'],
  },
  {
    exchange: 'Bybit',
    totalBalanceUSDT: 23456.78,
    availableUSDT: 8234.56,
    inOrderUSDT: 5123.45,
    inPositionUSDT: 10098.77,
    unrealizedPnl: -234.56,
    todayPnl: 345.67,
    todayPnlPercent: 1.50,
    weekPnl: 2123.45,
    weekPnlPercent: 9.96,
    monthPnl: 5678.90,
    monthPnlPercent: 31.94,
    assets: [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        network: 'BTC',
        total: 0.2345,
        available: 0.1000,
        inOrder: 0.0545,
        inPosition: 0.0800,
        priceUSDT: 66789.45,
        valueUSDT: 15662.07,
        change24h: 2.34,
        change7d: 5.67,
        change30d: 12.45,
        avgEntryPrice: 58900.00,
        roi: 13.39,
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        network: 'ETH',
        total: 1.234,
        available: 0.500,
        inOrder: 0.234,
        inPosition: 0.500,
        priceUSDT: 3523.45,
        valueUSDT: 4347.94,
        change24h: 1.89,
        change7d: 4.23,
        change30d: 8.67,
        avgEntryPrice: 3150.00,
        roi: 11.86,
      },
      {
        symbol: 'USDT',
        name: 'Tether',
        network: 'ERC20',
        total: 3446.77,
        available: 1234.56,
        inOrder: 1212.12,
        inPosition: 1000.09,
        priceUSDT: 1.00,
        valueUSDT: 3446.77,
        change24h: 0,
        change7d: 0,
        change30d: 0,
      },
    ],
    lastSync: new Date(Date.now() - 3000),
    apiStatus: 'connected',
    permissions: ['read', 'trade'],
  },
  {
    exchange: 'OKX',
    totalBalanceUSDT: 12345.67,
    availableUSDT: 5678.90,
    inOrderUSDT: 2345.67,
    inPositionUSDT: 4321.10,
    unrealizedPnl: 456.78,
    todayPnl: 234.56,
    todayPnlPercent: 1.94,
    weekPnl: 1567.89,
    weekPnlPercent: 14.53,
    monthPnl: 3456.78,
    monthPnlPercent: 38.88,
    assets: [
      {
        symbol: 'SOL',
        name: 'Solana',
        network: 'SOL',
        total: 25.67,
        available: 10.00,
        inOrder: 5.67,
        inPosition: 10.00,
        priceUSDT: 182.34,
        valueUSDT: 4679.47,
        change24h: -2.18,
        change7d: -1.34,
        change30d: 4.56,
        avgEntryPrice: 165.00,
        roi: 10.51,
      },
      {
        symbol: 'AVAX',
        name: 'Avalanche',
        network: 'AVAX',
        total: 50.00,
        available: 25.00,
        inOrder: 0,
        inPosition: 25.00,
        priceUSDT: 43.21,
        valueUSDT: 2160.50,
        change24h: 3.45,
        change7d: 8.90,
        change30d: 15.67,
        avgEntryPrice: 38.50,
        roi: 12.23,
      },
      {
        symbol: 'USDT',
        name: 'Tether',
        network: 'TRC20',
        total: 5505.70,
        available: 2345.67,
        inOrder: 1160.03,
        inPosition: 2000.00,
        priceUSDT: 1.00,
        valueUSDT: 5505.70,
        change24h: 0,
        change7d: 0,
        change30d: 0,
      },
    ],
    lastSync: new Date(Date.now() - 8000),
    apiStatus: 'connected',
    permissions: ['read', 'trade'],
  },
  {
    exchange: 'HyperLiquid',
    totalBalanceUSDT: 8234.56,
    availableUSDT: 4567.89,
    inOrderUSDT: 1234.56,
    inPositionUSDT: 2432.11,
    unrealizedPnl: 789.12,
    todayPnl: 456.78,
    todayPnlPercent: 5.87,
    weekPnl: 2345.67,
    weekPnlPercent: 39.84,
    monthPnl: 4567.89,
    monthPnlPercent: 124.56,
    assets: [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        network: 'NATIVE',
        total: 0.0890,
        available: 0.0400,
        inOrder: 0.0190,
        inPosition: 0.0300,
        priceUSDT: 66789.45,
        valueUSDT: 5944.26,
        change24h: 2.34,
        change7d: 5.67,
        change30d: 12.45,
        avgEntryPrice: 52340.00,
        roi: 27.60,
      },
      {
        symbol: 'USDT',
        name: 'Tether',
        network: 'NATIVE',
        total: 2290.30,
        available: 1234.56,
        inOrder: 55.78,
        inPosition: 1000.00,
        priceUSDT: 1.00,
        valueUSDT: 2290.30,
        change24h: 0,
        change7d: 0,
        change30d: 0,
      },
    ],
    lastSync: new Date(Date.now() - 2000),
    apiStatus: 'connected',
    permissions: ['read', 'trade'],
  },
];

// ============================================
// Funding Rates Data
// ============================================

export interface DemoFundingRate {
  symbol: string;
  exchange: string;
  fundingRate: number;
  fundingRateAnnualized: number;
  nextFundingTime: Date;
  predictedRate?: number;
  openInterest: number;
  openInterestChange24h: number;
  longShortRatio: number;
  liquidationHeat: 'low' | 'medium' | 'high' | 'critical';
}

export const demoFundingRates: DemoFundingRate[] = [
  {
    symbol: 'BTCUSDT',
    exchange: 'Binance',
    fundingRate: 0.00012,
    fundingRateAnnualized: 10.51,
    nextFundingTime: new Date(Date.now() + 1000 * 60 * 60 * 2),
    predictedRate: 0.00015,
    openInterest: 12500000000,
    openInterestChange24h: 2.34,
    longShortRatio: 1.12,
    liquidationHeat: 'low',
  },
  {
    symbol: 'ETHUSDT',
    exchange: 'Binance',
    fundingRate: 0.00008,
    fundingRateAnnualized: 7.01,
    nextFundingTime: new Date(Date.now() + 1000 * 60 * 60 * 2),
    predictedRate: 0.00010,
    openInterest: 8750000000,
    openInterestChange24h: 1.56,
    longShortRatio: 1.08,
    liquidationHeat: 'low',
  },
  {
    symbol: 'SOLUSDT',
    exchange: 'Binance',
    fundingRate: -0.00045,
    fundingRateAnnualized: -39.42,
    nextFundingTime: new Date(Date.now() + 1000 * 60 * 60 * 2),
    openInterest: 2340000000,
    openInterestChange24h: -5.67,
    longShortRatio: 0.89,
    liquidationHeat: 'medium',
  },
  {
    symbol: 'BTCUSDT',
    exchange: 'Bybit',
    fundingRate: 0.00014,
    fundingRateAnnualized: 12.26,
    nextFundingTime: new Date(Date.now() + 1000 * 60 * 60 * 4),
    openInterest: 8900000000,
    openInterestChange24h: 3.45,
    longShortRatio: 1.15,
    liquidationHeat: 'low',
  },
  {
    symbol: 'ETHUSDT',
    exchange: 'Bybit',
    fundingRate: 0.00009,
    fundingRateAnnualized: 7.88,
    nextFundingTime: new Date(Date.now() + 1000 * 60 * 60 * 4),
    openInterest: 5600000000,
    openInterestChange24h: 2.12,
    longShortRatio: 1.05,
    liquidationHeat: 'low',
  },
  {
    symbol: 'BTCUSD',
    exchange: 'HyperLiquid',
    fundingRate: 0.00018,
    fundingRateAnnualized: 15.77,
    nextFundingTime: new Date(Date.now() + 1000 * 60 * 60),
    openInterest: 2340000000,
    openInterestChange24h: 8.90,
    longShortRatio: 1.23,
    liquidationHeat: 'medium',
  },
  {
    symbol: 'LINKUSDT',
    exchange: 'Binance',
    fundingRate: -0.00067,
    fundingRateAnnualized: -58.69,
    nextFundingTime: new Date(Date.now() + 1000 * 60 * 60 * 2),
    openInterest: 890000000,
    openInterestChange24h: -12.34,
    longShortRatio: 0.78,
    liquidationHeat: 'high',
  },
  {
    symbol: 'DOGEUSDT',
    exchange: 'Binance',
    fundingRate: 0.00034,
    fundingRateAnnualized: 29.78,
    nextFundingTime: new Date(Date.now() + 1000 * 60 * 60 * 2),
    openInterest: 1560000000,
    openInterestChange24h: 15.67,
    longShortRatio: 1.45,
    liquidationHeat: 'medium',
  },
];

// ============================================
// News & Events Data
// ============================================

export interface DemoNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: 'exchange' | 'market' | 'regulation' | 'ai' | 'listing' | 'delisting' | 'fork' | 'airdrop';
  importance: 'critical' | 'high' | 'medium' | 'low';
  timestamp: Date;
  url?: string;
  relatedSymbols?: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface DemoCalendarEvent {
  id: string;
  title: string;
  description: string;
  eventDate: Date;
  category: 'funding' | 'unlock' | 'listing' | 'fork' | 'upgrade' | 'earnings' | 'economic';
  importance: 'critical' | 'high' | 'medium' | 'low';
  relatedSymbols?: string[];
}

export const demoNews: DemoNewsItem[] = [
  {
    id: 'news-001',
    title: 'Binance Launches 7 AI Agent Skills for Unified Trading',
    summary: 'Binance introduces AI Agent Skills for real-time market data, order execution, and wallet management through a single unified interface. This enables automated trading bots to access spot market and wallet data seamlessly.',
    source: 'Binance',
    category: 'ai',
    importance: 'critical',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    url: 'https://www.binance.com/news',
    relatedSymbols: ['BNB'],
    sentiment: 'bullish',
  },
  {
    id: 'news-002',
    title: 'Bitcoin Breaks $66K Resistance with Strong Volume',
    summary: 'Bitcoin surged past the $66,000 resistance level with significant trading volume, signaling potential continuation of the bullish trend. Market analysts eye $70K as the next target.',
    source: 'CoinDesk',
    category: 'market',
    importance: 'high',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4),
    relatedSymbols: ['BTC'],
    sentiment: 'bullish',
  },
  {
    id: 'news-003',
    title: 'SEC Delays Decision on Ethereum ETF Options',
    summary: 'The U.S. Securities and Exchange Commission has delayed its decision on approving options trading for Ethereum ETFs, pushing the deadline further into Q2 2025.',
    source: 'Reuters',
    category: 'regulation',
    importance: 'high',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
    relatedSymbols: ['ETH'],
    sentiment: 'neutral',
  },
  {
    id: 'news-004',
    title: 'Solana Network Upgrade Scheduled for Next Week',
    summary: 'Solana Foundation announces major network upgrade aimed at improving transaction throughput and reducing fees. Expected to go live on mainnet next Tuesday.',
    source: 'Solana Foundation',
    category: 'upgrade',
    importance: 'medium',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8),
    relatedSymbols: ['SOL'],
    sentiment: 'bullish',
  },
  {
    id: 'news-005',
    title: 'HyperLiquid OI Reaches New All-Time High',
    summary: 'Open Interest on HyperLiquid DEX reaches $2.5B, demonstrating growing adoption of the decentralized perpetuals platform.',
    source: 'HyperLiquid',
    category: 'market',
    importance: 'medium',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 10),
    relatedSymbols: ['HYPE'],
    sentiment: 'bullish',
  },
  {
    id: 'news-006',
    title: 'Bybit Integrates New AI-Powered Risk Management',
    summary: 'Bybit launches AI-powered risk management system for institutional clients, featuring real-time position monitoring and automated stop-loss adjustments.',
    source: 'Bybit',
    category: 'ai',
    importance: 'medium',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12),
    sentiment: 'bullish',
  },
  {
    id: 'news-007',
    title: 'LINK Token Unlock: 18M Tokens Released',
    summary: 'Chainlink token unlock event scheduled for tomorrow will release 18 million LINK tokens into circulation, representing approximately 2.5% of supply.',
    source: 'Chainlink',
    category: 'unlock',
    importance: 'high',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18),
    relatedSymbols: ['LINK'],
    sentiment: 'bearish',
  },
  {
    id: 'news-008',
    title: 'DOGE Whales Accumulate: $500M in 24h',
    summary: 'Large wallet addresses holding over 10M DOGE have accumulated over $500M worth of tokens in the past 24 hours, according to on-chain analytics.',
    source: 'Whale Alert',
    category: 'market',
    importance: 'medium',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 20),
    relatedSymbols: ['DOGE'],
    sentiment: 'bullish',
  },
];

export const demoCalendarEvents: DemoCalendarEvent[] = [
  {
    id: 'event-001',
    title: 'BTC/USDT Futures Expiry',
    description: 'Monthly BTC futures contract expiry on CME',
    eventDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
    category: 'funding',
    importance: 'high',
    relatedSymbols: ['BTC'],
  },
  {
    id: 'event-002',
    title: 'ETH Staking Withdrawal Queue Reset',
    description: 'Ethereum staking withdrawal queue processing',
    eventDate: new Date(Date.now() + 1000 * 60 * 60 * 6),
    category: 'upgrade',
    importance: 'medium',
    relatedSymbols: ['ETH'],
  },
  {
    id: 'event-003',
    title: 'SOL Network Upgrade v1.18',
    description: 'Major Solana network upgrade with performance improvements',
    eventDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
    category: 'upgrade',
    importance: 'high',
    relatedSymbols: ['SOL'],
  },
  {
    id: 'event-004',
    title: 'LINK Token Unlock',
    description: '18M LINK tokens unlock (2.5% supply)',
    eventDate: new Date(Date.now() + 1000 * 60 * 60 * 12),
    category: 'unlock',
    importance: 'high',
    relatedSymbols: ['LINK'],
  },
  {
    id: 'event-005',
    title: 'FOMC Meeting',
    description: 'Federal Reserve interest rate decision',
    eventDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    category: 'economic',
    importance: 'critical',
  },
  {
    id: 'event-006',
    title: 'Binance New Listing Vote',
    description: 'Community vote for next listing',
    eventDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
    category: 'listing',
    importance: 'medium',
  },
];
