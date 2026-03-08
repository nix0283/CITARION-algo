/**
 * Zenbot Trading Engine
 * 
 * Интегрированный движок для торговли в стиле Zenbot.
 * 
 * Компоненты:
 * - Trailing Stop с high-water mark
 * - Risk Manager (max_sell_loss_pct, max_buy_loss_pct, max_slippage_pct)
 * - Sell Stop / Buy Stop
 * - Paper Trading режим
 * - Real Trading режим
 * 
 * @author CITARION (inspired by Zenbot)
 * @version 1.0.0
 */

import { TrailingStopManager, createTrailingStop, TrailingStopResult, TRAILING_STOP_PRESETS } from "./trailing-stop";
import { RiskManager, RiskManagerConfig, RiskCheckResult, RISK_PRESETS, RiskContext } from "./risk-manager";
import { 
  IStrategy, 
  StrategyConfig, 
  Candle, 
  StrategySignal, 
  SignalType,
  Timeframe,
} from "./types";
import { getStrategyManager } from "./manager";

// ==================== TYPES ====================

/**
 * Режим работы движка
 */
export type ZenbotEngineMode = 
  | "watch"      // Только наблюдение, без торговли
  | "paper"      // Paper trading (симуляция)
  | "live";      // Реальная торговля

/**
 * Тип ордера
 */
export type OrderType = "maker" | "taker";

/**
 * Конфигурация Zenbot Trading Engine
 */
export interface ZenbotEngineConfig {
  // === Core Settings ===
  /** Режим работы */
  mode: ZenbotEngineMode;
  /** Символ для торговли */
  symbol: string;
  /** Таймфрейм */
  timeframe: Timeframe;
  /** ID стратегии */
  strategyId: string;
  /** Параметры стратегии */
  strategyParams?: Record<string, number | boolean | string>;
  
  // === Order Settings ===
  /** Тип ордера (maker = limit, taker = market) */
  orderType: OrderType;
  /** Покупать на X% от баланса валюты */
  buyPct: number;
  /** Продавать на X% от баланса актива */
  sellPct: number;
  /** Начальный депозит в валюте */
  deposit: number;
  
  // === Price Adjustment ===
  /** % скидки на покупку (markdown) */
  markdownBuyPct: number;
  /** % наценки на продажу (markup) */
  markupSellPct: number;
  
  // === Stop Loss / Take Profit ===
  /** Продать если цена упала на X% от цены покупки */
  sellStopPct: number | null;
  /** Купить если цена выросла на X% от цены продажи */
  buyStopPct: number | null;
  
  // === Trailing Stop (Zenbot style) ===
  /** Активировать trailing stop при X% прибыли */
  profitStopEnablePct: number;
  /** Trailing stop на X% ниже high-water mark */
  profitStopPct: number;
  
  // === Loss Protection ===
  /** Макс. убыток при продаже (%) */
  maxSellLossPct: number | null;
  /** Макс. убыток при покупке (%) */
  maxBuyLossPct: number | null;
  /** Макс. проскальзывание (%) */
  maxSlippagePct: number | null;
  
  // === Order Management ===
  /** Интервал корректировки ордера (ms) */
  orderAdjustTime: number;
  /** Интервал проверки статуса ордера (ms) */
  orderPollTime: number;
  /** Среднее проскальзывание для paper trading (%) */
  avgSlippagePct: number;
  
  // === Position Management ===
  /** Использовать предыдущие сделки для stop-order triggers */
  usePrevTrades: boolean;
  /** Мин. количество предыдущих сделок */
  minPrevTrades: number;
}

/**
 * Состояние позиции
 */
export interface ZenbotPosition {
  id: string;
  direction: "LONG" | "SHORT" | null;
  entryPrice: number;
  size: number;
  openTime: Date;
  trailingStop: TrailingStopManager | null;
  stopLoss: number | null;
  takeProfit: number | null;
  highWaterMark: number;
  lowWaterMark: number;
}

/**
 * Торговля
 */
export interface ZenbotTrade {
  id: string;
  type: "buy" | "sell";
  price: number;
  size: number;
  time: Date;
  reason: string;
  pnl?: number;
  pnlPct?: number;
}

/**
 * Состояние аккаунта
 */
export interface ZenbotAccount {
  balance: number;        // Валюта
  asset: number;          // Актив
  deposit: number;        // Начальный депозит
  profit: number;         // Текущая прибыль
  profitPct: number;      // % прибыли
  vsBuyHold: number;      // % vs buy/hold
  trades: ZenbotTrade[];
}

/**
 * Результат анализа
 */
export interface ZenbotAnalysisResult {
  timestamp: Date;
  price: number;
  signal: StrategySignal | null;
  position: ZenbotPosition | null;
  account: ZenbotAccount;
  shouldTrade: boolean;
  tradeReason?: string;
  trailingStopStatus?: TrailingStopResult;
  riskCheck?: RiskCheckResult;
}

// ==================== DEFAULT CONFIG ====================

/**
 * Конфигурация по умолчанию (Zenbot defaults)
 */
export const ZENBOT_DEFAULT_CONFIG: ZenbotEngineConfig = {
  mode: "paper",
  symbol: "BTCUSDT",
  timeframe: "2m",
  strategyId: "zenbot-trend-ema",
  orderType: "maker",
  buyPct: 100,
  sellPct: 100,
  deposit: 1000,
  markdownBuyPct: 0,
  markupSellPct: 0,
  sellStopPct: null,
  buyStopPct: null,
  profitStopEnablePct: 10,
  profitStopPct: 4,
  maxSellLossPct: null,
  maxBuyLossPct: null,
  maxSlippagePct: null,
  orderAdjustTime: 5000,
  orderPollTime: 5000,
  avgSlippagePct: 0.1,
  usePrevTrades: false,
  minPrevTrades: 0,
};

// ==================== ZENBOT ENGINE ====================

/**
 * Zenbot Trading Engine
 * 
 * Интегрированный движок для автоматической торговли.
 */
export class ZenbotTradingEngine {
  private config: ZenbotEngineConfig;
  private strategy: IStrategy | null = null;
  private position: ZenbotPosition | null = null;
  private account: ZenbotAccount;
  private riskManager: RiskManager;
  private candles: Candle[] = [];
  private lastPrice: number = 0;
  private tradeId: number = 0;
  private buyHoldStart: number = 0;
  
  // Callbacks
  private onTradeCallback?: (trade: ZenbotTrade) => void;
  private onSignalCallback?: (signal: StrategySignal) => void;
  private onPositionChangeCallback?: (position: ZenbotPosition | null) => void;

  constructor(config: Partial<ZenbotEngineConfig> = {}) {
    this.config = { ...ZENBOT_DEFAULT_CONFIG, ...config };
    
    // Initialize account
    this.account = {
      balance: this.config.deposit,
      asset: 0,
      deposit: this.config.deposit,
      profit: 0,
      profitPct: 0,
      vsBuyHold: 0,
      trades: [],
    };
    
    // Initialize risk manager
    const riskConfig: RiskManagerConfig = {
      maxSellLossPct: this.config.maxSellLossPct,
      maxBuyLossPct: this.config.maxBuyLossPct,
      maxSlippagePct: this.config.maxSlippagePct,
      tradePct: this.config.buyPct,
    };
    this.riskManager = new RiskManager(riskConfig);
    
    // Load strategy
    this.loadStrategy();
  }

  // ==================== INITIALIZATION ====================

  private loadStrategy(): void {
    const strategyManager = getStrategyManager();
    this.strategy = strategyManager.getStrategy(this.config.strategyId) || null;
    
    if (this.strategy && this.config.strategyParams) {
      this.strategy.setParameters(this.config.strategyParams);
    }
  }

  /**
   * Установить стратегию
   */
  setStrategy(strategyId: string, params?: Record<string, number | boolean | string>): void {
    this.config.strategyId = strategyId;
    this.config.strategyParams = params;
    this.loadStrategy();
  }

  /**
   * Установить callbacks
   */
  setCallbacks(callbacks: {
    onTrade?: (trade: ZenbotTrade) => void;
    onSignal?: (signal: StrategySignal) => void;
    onPositionChange?: (position: ZenbotPosition | null) => void;
  }): void {
    this.onTradeCallback = callbacks.onTrade;
    this.onSignalCallback = callbacks.onSignal;
    this.onPositionChangeCallback = callbacks.onPositionChange;
  }

  // ==================== DATA MANAGEMENT ====================

  /**
   * Добавить свечу и выполнить анализ
   */
  async addCandle(candle: Candle): Promise<ZenbotAnalysisResult> {
    this.candles.push(candle);
    this.lastPrice = candle.close;
    
    // Initialize buy/hold comparison
    if (this.buyHoldStart === 0) {
      this.buyHoldStart = candle.close;
    }
    
    // Update buy/hold comparison
    if (this.buyHoldStart > 0) {
      const buyHoldValue = (this.config.deposit / this.buyHoldStart) * candle.close;
      this.account.vsBuyHold = ((this.getTotalValue(candle.close) - buyHoldValue) / buyHoldValue) * 100;
    }
    
    return this.analyze();
  }

  /**
   * Добавить несколько свечей
   */
  async addCandles(candles: Candle[]): Promise<ZenbotAnalysisResult[]> {
    const results: ZenbotAnalysisResult[] = [];
    for (const candle of candles) {
      const result = await this.addCandle(candle);
      results.push(result);
    }
    return results;
  }

  /**
   * Обновить цену (для real-time)
   */
  async updatePrice(price: number): Promise<ZenbotAnalysisResult | null> {
    if (this.candles.length === 0) return null;
    
    this.lastPrice = price;
    
    // Check trailing stop if in position
    if (this.position && this.position.trailingStop) {
      const trailingResult = this.position.trailingStop.check(price);
      
      if (trailingResult.shouldClose) {
        return this.closePosition(price, trailingResult.reason);
      }
    }
    
    return null;
  }

  // ==================== ANALYSIS ====================

  /**
   * Выполнить анализ
   */
  private async analyze(): Promise<ZenbotAnalysisResult> {
    const timestamp = new Date();
    const price = this.lastPrice;
    
    // Get signal from strategy
    let signal: StrategySignal | null = null;
    if (this.strategy && this.candles.length >= this.strategy.getConfig().minCandlesRequired) {
      const indicators = this.strategy.populateIndicators(this.candles);
      
      if (this.position) {
        signal = this.strategy.populateExitSignal(this.candles, indicators, price);
      } else {
        signal = this.strategy.populateEntrySignal(this.candles, indicators, price);
      }
      
      if (signal) {
        signal.symbol = this.config.symbol;
        this.onSignalCallback?.(signal);
      }
    }
    
    // Determine if we should trade
    let shouldTrade = false;
    let tradeReason = "";
    let riskCheck: RiskCheckResult | undefined;
    let trailingStopStatus: TrailingStopResult | undefined;
    
    // Check trailing stop first
    if (this.position?.trailingStop) {
      trailingStopStatus = this.position.trailingStop.check(price);
      
      if (trailingStopStatus.shouldClose) {
        shouldTrade = true;
        tradeReason = trailingStopStatus.reason;
      }
    }
    
    // Process signal
    if (!shouldTrade && signal && this.config.mode !== "watch") {
      const tradeType = this.getTradeType(signal.type);
      
      if (tradeType) {
        // Risk check
        riskCheck = this.performRiskCheck(tradeType, price, signal);
        
        if (riskCheck.allowed) {
          shouldTrade = true;
          tradeReason = signal.reason;
        }
      }
    }
    
    // Execute trade
    if (shouldTrade) {
      await this.executeTrade(signal, price, tradeReason);
    }
    
    // Update account metrics
    this.updateAccountMetrics(price);
    
    return {
      timestamp,
      price,
      signal,
      position: this.position,
      account: { ...this.account },
      shouldTrade,
      tradeReason,
      trailingStopStatus,
      riskCheck,
    };
  }

  // ==================== TRADING ====================

  private getTradeType(signalType: SignalType): "buy" | "sell" | null {
    if (!this.position) {
      if (signalType === "LONG") return "buy";
      if (signalType === "SHORT") return "sell";
    } else {
      if (this.position.direction === "LONG" && signalType === "EXIT_LONG") return "sell";
      if (this.position.direction === "SHORT" && signalType === "EXIT_SHORT") return "buy";
    }
    return null;
  }

  private performRiskCheck(tradeType: "buy" | "sell", price: number, signal: StrategySignal | null): RiskCheckResult {
    const ctx: RiskContext = {
      currentPrice: price,
      proposedPrice: price,
      proposedSize: this.calculatePositionSize(tradeType, price),
      direction: tradeType,
      balance: {
        asset: this.account.asset,
        currency: this.account.balance,
        deposit: this.account.deposit,
      },
      trades: this.account.trades.map(t => ({
        type: t.type,
        price: t.price,
        size: t.size,
        time: t.time.getTime(),
      })),
    };
    
    return this.riskManager.checkRisk(ctx);
  }

  private calculatePositionSize(tradeType: "buy" | "sell", price: number): number {
    if (tradeType === "buy") {
      const amount = this.account.balance * (this.config.buyPct / 100);
      return amount / price;
    } else {
      return this.account.asset * (this.config.sellPct / 100);
    }
  }

  private async executeTrade(signal: StrategySignal | null, price: number, reason: string): Promise<void> {
    if (this.config.mode === "watch") return;
    
    const tradeType = signal ? this.getTradeType(signal.type) : 
      (this.position?.direction === "LONG" ? "sell" : "buy");
    
    if (!tradeType) return;
    
    // Apply slippage for paper trading
    let executionPrice = price;
    if (this.config.mode === "paper") {
      const slippage = this.config.avgSlippagePct / 100;
      executionPrice = tradeType === "buy" 
        ? price * (1 + slippage) 
        : price * (1 - slippage);
    }
    
    // Apply markdown/markup for maker orders
    if (this.config.orderType === "maker") {
      if (tradeType === "buy") {
        executionPrice = executionPrice * (1 - this.config.markdownBuyPct / 100);
      } else {
        executionPrice = executionPrice * (1 + this.config.markupSellPct / 100);
      }
    }
    
    // Execute
    if (tradeType === "buy") {
      this.executeBuy(executionPrice, reason, signal);
    } else {
      this.executeSell(executionPrice, reason, signal);
    }
  }

  private executeBuy(price: number, reason: string, signal: StrategySignal | null): void {
    const size = this.calculatePositionSize("buy", price);
    const cost = size * price;
    
    if (cost > this.account.balance) return;
    
    // Update account
    this.account.balance -= cost;
    this.account.asset += size;
    
    // Create position
    this.position = {
      id: `pos_${Date.now()}`,
      direction: "LONG",
      entryPrice: price,
      size,
      openTime: new Date(),
      trailingStop: createTrailingStop(
        price,
        "LONG",
        this.config.profitStopEnablePct,
        this.config.profitStopPct
      ),
      stopLoss: signal?.suggestedStopLoss || null,
      takeProfit: signal?.suggestedTakeProfits?.[0]?.price || null,
      highWaterMark: price,
      lowWaterMark: price,
    };
    
    // Record trade
    const trade: ZenbotTrade = {
      id: `trade_${++this.tradeId}`,
      type: "buy",
      price,
      size,
      time: new Date(),
      reason,
    };
    this.account.trades.push(trade);
    
    this.onTradeCallback?.(trade);
    this.onPositionChangeCallback?.(this.position);
  }

  private executeSell(price: number, reason: string, signal: StrategySignal | null): void {
    if (!this.position) return;
    
    const size = this.calculatePositionSize("sell", price);
    const revenue = size * price;
    
    // Calculate PnL
    const pnl = (price - this.position.entryPrice) * size;
    const pnlPct = ((price - this.position.entryPrice) / this.position.entryPrice) * 100;
    
    // Update account
    this.account.balance += revenue;
    this.account.asset -= size;
    
    // Record trade
    const trade: ZenbotTrade = {
      id: `trade_${++this.tradeId}`,
      type: "sell",
      price,
      size,
      time: new Date(),
      reason,
      pnl,
      pnlPct,
    };
    this.account.trades.push(trade);
    
    // Close position
    this.position = null;
    
    this.onTradeCallback?.(trade);
    this.onPositionChangeCallback?.(null);
  }

  private async closePosition(price: number, reason: string): Promise<ZenbotAnalysisResult> {
    if (!this.position) {
      return this.createEmptyResult(price);
    }
    
    // Execute closing trade
    const tradeType = this.position.direction === "LONG" ? "sell" : "buy";
    
    if (tradeType === "sell") {
      this.executeSell(price, reason, null);
    } else {
      this.executeBuy(price, reason, null);
    }
    
    return this.createEmptyResult(price);
  }

  private createEmptyResult(price: number): ZenbotAnalysisResult {
    return {
      timestamp: new Date(),
      price,
      signal: null,
      position: this.position,
      account: { ...this.account },
      shouldTrade: false,
    };
  }

  // ==================== METRICS ====================

  private getTotalValue(price: number): number {
    return this.account.balance + (this.account.asset * price);
  }

  private updateAccountMetrics(price: number): void {
    const totalValue = this.getTotalValue(price);
    this.account.profit = totalValue - this.account.deposit;
    this.account.profitPct = (this.account.profit / this.account.deposit) * 100;
  }

  // ==================== GETTERS ====================

  getConfig(): ZenbotEngineConfig {
    return { ...this.config };
  }

  getPosition(): ZenbotPosition | null {
    return this.position ? { ...this.position } : null;
  }

  getAccount(): ZenbotAccount {
    return { ...this.account };
  }

  getCandles(): Candle[] {
    return [...this.candles];
  }

  getLastPrice(): number {
    return this.lastPrice;
  }

  getStats(): {
    totalTrades: number;
    winTrades: number;
    lossTrades: number;
    winRate: number;
    avgPnl: number;
    totalPnl: number;
  } {
    const trades = this.account.trades.filter(t => t.pnl !== undefined);
    const winTrades = trades.filter(t => (t.pnl || 0) > 0);
    const lossTrades = trades.filter(t => (t.pnl || 0) < 0);
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    return {
      totalTrades: trades.length,
      winTrades: winTrades.length,
      lossTrades: lossTrades.length,
      winRate: trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0,
      avgPnl: trades.length > 0 ? totalPnl / trades.length : 0,
      totalPnl,
    };
  }

  // ==================== RESET ====================

  reset(): void {
    this.candles = [];
    this.position = null;
    this.lastPrice = 0;
    this.buyHoldStart = 0;
    this.tradeId = 0;
    
    this.account = {
      balance: this.config.deposit,
      asset: 0,
      deposit: this.config.deposit,
      profit: 0,
      profitPct: 0,
      vsBuyHold: 0,
      trades: [],
    };
    
    if (this.strategy) {
      this.strategy.reset();
    }
  }
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Создать Zenbot Engine
 */
export function createZenbotEngine(config: Partial<ZenbotEngineConfig> = {}): ZenbotTradingEngine {
  return new ZenbotTradingEngine(config);
}

/**
 * Создать Zenbot Engine для paper trading
 */
export function createPaperTradingEngine(
  symbol: string,
  strategyId: string,
  options: Partial<ZenbotEngineConfig> = {}
): ZenbotTradingEngine {
  return new ZenbotTradingEngine({
    mode: "paper",
    symbol,
    strategyId,
    ...options,
  });
}

/**
 * Создать Zenbot Engine для live trading
 */
export function createLiveTradingEngine(
  symbol: string,
  strategyId: string,
  options: Partial<ZenbotEngineConfig> = {}
): ZenbotTradingEngine {
  return new ZenbotTradingEngine({
    mode: "live",
    symbol,
    strategyId,
    ...options,
  });
}

// ==================== PRESETS ====================

/**
 * Предустановленные конфигурации Zenbot
 */
export const ZENBOT_PRESETS = {
  /** Консервативная торговля */
  conservative: {
    buyPct: 50,
    sellPct: 100,
    profitStopEnablePct: 5,
    profitStopPct: 2,
    maxSellLossPct: 2,
    maxSlippagePct: 0.5,
    orderType: "maker" as OrderType,
  },
  
  /** Умеренная торговля */
  moderate: {
    buyPct: 75,
    sellPct: 100,
    profitStopEnablePct: 8,
    profitStopPct: 3,
    maxSellLossPct: 5,
    maxSlippagePct: 1,
    orderType: "maker" as OrderType,
  },
  
  /** Агрессивная торговля */
  aggressive: {
    buyPct: 100,
    sellPct: 100,
    profitStopEnablePct: 10,
    profitStopPct: 4,
    maxSellLossPct: null,
    maxSlippagePct: 2,
    orderType: "taker" as OrderType,
  },
  
  /** Zenbot default */
  zenbot: {
    buyPct: 100,
    sellPct: 100,
    profitStopEnablePct: 10,
    profitStopPct: 4,
    maxSellLossPct: null,
    maxSlippagePct: null,
    orderType: "maker" as OrderType,
  },
  
  /** Scalping */
  scalping: {
    buyPct: 100,
    sellPct: 100,
    profitStopEnablePct: 2,
    profitStopPct: 1,
    maxSellLossPct: 1,
    maxSlippagePct: 0.5,
    orderType: "taker" as OrderType,
  },
};
