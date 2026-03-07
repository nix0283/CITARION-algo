/**
 * CITARION Common Types
 * 
 * Централизованные типы, используемые в разных модулях проекта.
 * Этот файл предназначен для устранения дублирования типов.
 * 
 * @created 2025-01 - Stage 3 Code Audit Fix
 */

// =============================================================================
// TIMEFRAME TYPES
// =============================================================================

/**
 * Поддерживаемые таймфреймы
 */
export type Timeframe = 
  | "1m" | "3m" | "5m" | "15m" | "30m" | "45m"
  | "1h" | "2h" | "3h" | "4h" | "6h" | "8h" | "12h"
  | "1d" | "3d" | "1w" | "1M";

/**
 * Конвертация таймфрейма в миллисекунды
 */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60 * 1000,
  "3m": 3 * 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "45m": 45 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
};

/**
 * Конвертировать таймфрейм в миллисекунды
 */
export function timeframeToMs(timeframe: Timeframe): number {
  return TIMEFRAME_MS[timeframe];
}

/**
 * Конвертировать таймфрейм в минуты
 */
export function timeframeToMinutes(timeframe: Timeframe): number {
  return TIMEFRAME_MS[timeframe] / (60 * 1000);
}

/**
 * Конвертировать таймфрейм в строку для отображения
 */
export function timeframeToString(timeframe: Timeframe): string {
  const map: Record<Timeframe, string> = {
    "1m": "1 Minute",
    "3m": "3 Minutes",
    "5m": "5 Minutes",
    "15m": "15 Minutes",
    "30m": "30 Minutes",
    "45m": "45 Minutes",
    "1h": "1 Hour",
    "2h": "2 Hours",
    "3h": "3 Hours",
    "4h": "4 Hours",
    "6h": "6 Hours",
    "8h": "8 Hours",
    "12h": "12 Hours",
    "1d": "1 Day",
    "3d": "3 Days",
    "1w": "1 Week",
    "1M": "1 Month",
  };
  return map[timeframe];
}

// =============================================================================
// CANDLE TYPES
// =============================================================================

/**
 * Данные свечи (OHLCV)
 */
export interface Candle {
  /** Время открытия (Unix timestamp в миллисекундах) */
  timestamp: number;
  /** Цена открытия */
  open: number;
  /** Максимальная цена */
  high: number;
  /** Минимальная цена */
  low: number;
  /** Цена закрытия */
  close: number;
  /** Объём */
  volume: number;
}

/**
 * Типы свечей по направлению
 */
export type CandleDirection = 'bullish' | 'bearish' | 'neutral';

/**
 * Определить направление свечи
 */
export function getCandleDirection(candle: Candle): CandleDirection {
  if (candle.close > candle.open) return 'bullish';
  if (candle.close < candle.open) return 'bearish';
  return 'neutral';
}

/**
 * Размер тела свечи
 */
export function getCandleBody(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

/**
 * Размер верхней тени
 */
export function getUpperWick(candle: Candle): number {
  return candle.high - Math.max(candle.open, candle.close);
}

/**
 * Размер нижней тени
 */
export function getLowerWick(candle: Candle): number {
  return Math.min(candle.open, candle.close) - candle.low;
}

/**
 * Полный размер свечи (high - low)
 */
export function getCandleRange(candle: Candle): number {
  return candle.high - candle.low;
}

// =============================================================================
// TRADING SIGNAL TYPES
// =============================================================================

/**
 * Тип торгового сигнала
 */
export type SignalType = "LONG" | "SHORT" | "EXIT_LONG" | "EXIT_SHORT" | "NO_SIGNAL";

/**
 * Сторона позиции
 */
export type PositionSide = "LONG" | "SHORT";

/**
 * Сторона ордера
 */
export type OrderSide = "BUY" | "SELL";

/**
 * Тип ордера
 */
export type OrderType = "MARKET" | "LIMIT" | "STOP_MARKET" | "STOP_LIMIT" | "TRAILING_STOP";

/**
 * Статус ордера
 */
export type OrderStatus = "PENDING" | "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";

/**
 * Режим маржи
 */
export type MarginMode = "ISOLATED" | "CROSS";

/**
 * Time in Force
 */
export type TimeInForce = "GTC" | "IOC" | "FOK" | "GTX" | "POST_ONLY";

// =============================================================================
// EXCHANGE TYPES (Common subset)
// =============================================================================

/**
 * Активные биржи
 */
export type ActiveExchange = "binance" | "bybit" | "okx" | "bitget" | "bingx";

/**
 * Тип рынка
 */
export type MarketType = "SPOT" | "FUTURES" | "INVERSE";

/**
 * Режим торговли
 */
export type TradingMode = "LIVE" | "TESTNET" | "DEMO";

// =============================================================================
// PRICE TYPES
// =============================================================================

/**
 * Тикер (краткая информация о цене)
 */
export interface PriceTicker {
  symbol: string;
  exchange: ActiveExchange;
  bid: number;
  ask: number;
  last: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: number;
}

/**
 * Спред
 */
export function calculateSpread(bid: number, ask: number): { spread: number; spreadPercent: number } {
  const spread = ask - bid;
  const midPrice = (ask + bid) / 2;
  const spreadPercent = (spread / midPrice) * 100;
  return { spread, spreadPercent };
}

// =============================================================================
// PNL TYPES
// =============================================================================

/**
 * PnL данные
 */
export interface PnLData {
  /** Реализованный PnL */
  realized: number;
  /** Нереализованный PnL */
  unrealized: number;
  /** Общий PnL */
  total: number;
  /** PnL в процентах */
  percent: number;
  /** Время расчёта */
  timestamp: number;
}

/**
 * Рассчитать PnL для позиции
 */
export function calculatePnL(
  entryPrice: number,
  currentPrice: number,
  size: number,
  side: PositionSide,
  leverage: number = 1
): PnLData {
  const direction = side === "LONG" ? 1 : -1;
  const priceChange = currentPrice - entryPrice;
  const pnl = direction * priceChange * size * leverage;
  const pnlPercent = (pnl / (entryPrice * size / leverage)) * 100;
  
  return {
    realized: 0,
    unrealized: pnl,
    total: pnl,
    percent: pnlPercent,
    timestamp: Date.now(),
  };
}

/**
 * ROI (Return on Investment)
 */
export function calculateROI(
  initialValue: number,
  finalValue: number
): number {
  if (initialValue === 0) return 0;
  return ((finalValue - initialValue) / initialValue) * 100;
}

// =============================================================================
// RISK TYPES
// =============================================================================

/**
 * Уровень риска
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Результат проверки риска
 */
export interface RiskCheckResult {
  allowed: boolean;
  riskLevel: RiskLevel;
  reason?: string;
  suggestions?: string[];
  riskScore: number; // 0-100
}

/**
 * Рассчитать уровень риска по скору
 */
export function getRiskLevelFromScore(score: number): RiskLevel {
  if (score < 25) return "LOW";
  if (score < 50) return "MEDIUM";
  if (score < 75) return "HIGH";
  return "CRITICAL";
}

// =============================================================================
// DRAWDOWN TYPES
// =============================================================================

/**
 * Данные о просадке
 */
export interface DrawdownData {
  /** Текущая просадка */
  current: number;
  /** Максимальная просадка */
  max: number;
  /** В процентах */
  currentPercent: number;
  maxPercent: number;
  /** Начало просадки */
  startedAt: number | null;
  /** Длительность в мс */
  duration: number;
}

/**
 * Рассчитать просадку
 */
export function calculateDrawdown(
  currentValue: number,
  peakValue: number
): DrawdownData {
  const drawdown = peakValue - currentValue;
  const drawdownPercent = (drawdown / peakValue) * 100;
  
  return {
    current: drawdown,
    max: drawdown,
    currentPercent: drawdownPercent,
    maxPercent: drawdownPercent,
    startedAt: null,
    duration: 0,
  };
}

// =============================================================================
// METRICS TYPES
// =============================================================================

/**
 * Базовые метрики торговли
 */
export interface TradingMetrics {
  /** Количество сделок */
  totalTrades: number;
  /** Прибыльные сделки */
  winningTrades: number;
  /** Убыточные сделки */
  losingTrades: number;
  /** Win Rate в процентах */
  winRate: number;
  /** Общий PnL */
  totalPnl: number;
  /** Средняя прибыль */
  avgPnl: number;
  /** Profit Factor */
  profitFactor: number;
  /** Максимальная просадка */
  maxDrawdown: number;
  /** Sharpe Ratio */
  sharpeRatio: number;
}

/**
 * Рассчитать базовые метрики из списка PnL
 */
export function calculateBasicMetrics(pnls: number[]): Omit<TradingMetrics, 'maxDrawdown' | 'sharpeRatio'> {
  if (pnls.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      avgPnl: 0,
      profitFactor: 0,
    };
  }
  
  const totalTrades = pnls.length;
  const winningTrades = pnls.filter(p => p > 0).length;
  const losingTrades = pnls.filter(p => p < 0).length;
  const winRate = (winningTrades / totalTrades) * 100;
  const totalPnl = pnls.reduce((sum, p) => sum + p, 0);
  const avgPnl = totalPnl / totalTrades;
  
  const grossProfit = pnls.filter(p => p > 0).reduce((sum, p) => sum + p, 0);
  const grossLoss = Math.abs(pnls.filter(p => p < 0).reduce((sum, p) => sum + p, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    totalPnl,
    avgPnl,
    profitFactor,
  };
}

// =============================================================================
// LEVERAGE TYPES
// =============================================================================

/**
 * Рассчитать цену ликвидации
 */
export function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  side: PositionSide,
  maintenanceMarginRate: number = 0.004 // 0.4% по умолчанию
): number {
  const direction = side === "LONG" ? 1 : -1;
  const liquidationPrice = entryPrice * (1 - direction / leverage + direction * maintenanceMarginRate);
  return Math.max(0, liquidationPrice);
}

/**
 * Рассчитать требуемую маржу
 */
export function calculateRequiredMargin(
  positionSize: number,
  entryPrice: number,
  leverage: number
): number {
  return (positionSize * entryPrice) / leverage;
}

// =============================================================================
// FEE TYPES
// =============================================================================

/**
 * Типы комиссий
 */
export type FeeType = "MAKER" | "TAKER";

/**
 * Данные о комиссии
 */
export interface FeeData {
  type: FeeType;
  rate: number; // в процентах, например 0.1 для 0.1%
  amount: number;
  currency: string;
}

/**
 * Рассчитать комиссию
 */
export function calculateFee(
  price: number,
  size: number,
  feeRate: number // в процентах, например 0.1 для 0.1%
): number {
  return (price * size * feeRate) / 100;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Округление до указанного количества знаков
 */
export function roundTo(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Форматирование цены
 */
export function formatPrice(price: number, decimals: number = 2): string {
  return price.toFixed(decimals);
}

/**
 * Форматирование процента
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

/**
 * Форматирование объёма
 */
export function formatVolume(volume: number): string {
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(2)}K`;
  return volume.toFixed(2);
}

/**
 * Проверка валидности цены
 */
export function isValidPrice(price: number): boolean {
  return typeof price === 'number' && !isNaN(price) && isFinite(price) && price > 0;
}

/**
 * Проверка валидности объёма
 */
export function isValidVolume(volume: number): boolean {
  return typeof volume === 'number' && !isNaN(volume) && isFinite(volume) && volume >= 0;
}

/**
 * Нормализация значения в диапазон [0, 1]
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Линейная интерполяция
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Ограничение значения в диапазоне
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Проверка на число
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Безопасное деление
 */
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (denominator === 0 || !isNumber(denominator)) return fallback;
  return numerator / denominator;
}
