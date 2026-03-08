/**
 * LOGOS BOT ENHANCEMENT - Trade Journal & Pattern Detection
 *
 * Extended functionality for the LOGOS meta bot:
 * - Trade Journal: Record and analyze all trades
 * - Pattern Detection: Detect recurring patterns in market data
 * 
 * NO NEURAL NETWORKS - Classical pattern recognition methods only.
 */

// =============================================================================
// TRADE JOURNAL TYPES
// =============================================================================

export interface JournalEntry {
  id: string;
  timestamp: number;
  
  // Trade details
  symbol: string;
  exchange: string;
  botCode: string;
  side: 'LONG' | 'SHORT';
  
  // Entry
  entryPrice: number;
  entryTime: number;
  entryReason: string;
  entrySignalId: string;
  
  // Exit
  exitPrice?: number;
  exitTime?: number;
  exitReason?: string;
  
  // Position
  size: number;
  leverage: number;
  
  // Risk
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  riskPercent: number;
  
  // Outcome
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  pnl?: number;
  pnlPercent?: number;
  fees?: number;
  holdingTime?: number;
  
  // Market context
  marketRegime?: 'trending' | 'ranging' | 'volatile';
  volatility?: number;
  volume?: number;
  
  // Analysis
  tags: string[];
  notes: string;
  rating: 1 | 2 | 3 | 4 | 5;
  
  // Lessons learned
  lessonLearned?: string;
  mistake?: string;
  goodDecision?: string;
}

export interface JournalStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  
  totalPnL: number;
  totalFees: number;
  netPnL: number;
  
  avgHoldingTime: number;
  avgRiskPercent: number;
  avgRRRatio: number;
  
  bestTrade: JournalEntry | null;
  worstTrade: JournalEntry | null;
  
  byBot: Map<string, BotJournalStats>;
  bySymbol: Map<string, SymbolJournalStats>;
  byDayOfWeek: Map<number, number>; // 0-6 -> win rate
  byHour: Map<number, number>; // 0-23 -> win rate
}

export interface BotJournalStats {
  botCode: string;
  trades: number;
  winRate: number;
  avgPnL: number;
  totalPnL: number;
  avgHoldingTime: number;
  sharpeRatio: number;
}

export interface SymbolJournalStats {
  symbol: string;
  trades: number;
  winRate: number;
  avgPnL: number;
  totalPnL: number;
  avgVolatility: number;
}

// =============================================================================
// PATTERN DETECTION TYPES
// =============================================================================

export type PatternType = 
  | 'DOUBLE_TOP'
  | 'DOUBLE_BOTTOM'
  | 'HEAD_SHOULDERS'
  | 'HEAD_SHOULDERS_INVERSE'
  | 'TRIANGLE_ASCENDING'
  | 'TRIANGLE_DESCENDING'
  | 'TRIANGLE_SYMMETRICAL'
  | 'FLAG_BULLISH'
  | 'FLAG_BEARISH'
  | 'WEDGE_RISING'
  | 'WEDGE_FALLING'
  | 'CHANNEL_UP'
  | 'CHANNEL_DOWN'
  | 'SUPPORT_RESISTANCE'
  | 'TREND_LINE_BREAK'
  | 'INSIDE_BAR'
  | 'OUTSIDE_BAR'
  | 'PIN_BAR'
  | 'ENGULFING'
  | 'MORNING_STAR'
  | 'EVENING_STAR'
  | 'THREE_WHITE_SOLDIERS'
  | 'THREE_BLACK_CROWS';

export interface DetectedPattern {
  id: string;
  type: PatternType;
  symbol: string;
  exchange: string;
  timeframe: string;
  
  // Detection details
  detectedAt: number;
  startIdx: number;
  endIdx: number;
  confidence: number;
  
  // Pattern geometry
  keyLevels: number[];
  breakoutLevel?: number;
  targetLevel?: number;
  stopLevel?: number;
  
  // Expected direction
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  
  // Outcome (if pattern completed)
  completed: boolean;
  outcome?: 'SUCCESS' | 'FAILURE' | 'PENDING';
  completionTime?: number;
  
  // Historical performance
  historicalWinRate?: number;
  historicalAvgMove?: number;
}

export interface PatternPerformance {
  type: PatternType;
  totalOccurrences: number;
  successfulOccurrences: number;
  winRate: number;
  avgMovePercent: number;
  avgTimeToComplete: number;
  falseBreakoutRate: number;
  bestMarket: 'trending' | 'ranging' | 'volatile';
}

// =============================================================================
// TRADE JOURNAL
// =============================================================================

export class TradeJournal {
  private entries: Map<string, JournalEntry> = new Map();
  private openTrades: Map<string, string> = new Map(); // symbol_tradeId -> entryId
  private stats: JournalStats;
  private maxEntries: number = 10000;

  constructor() {
    this.stats = this.initializeStats();
  }

  /**
   * Open a new trade entry
   */
  public openTrade(
    symbol: string,
    exchange: string,
    botCode: string,
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    size: number,
    leverage: number,
    stopLoss: number,
    takeProfit: number,
    entryReason: string,
    signalId: string,
    context?: {
      marketRegime?: 'trending' | 'ranging' | 'volatile';
      volatility?: number;
      volume?: number;
    }
  ): JournalEntry {
    const id = `journal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const riskRewardRatio = side === 'LONG'
      ? (takeProfit - entryPrice) / (entryPrice - stopLoss)
      : (entryPrice - takeProfit) / (stopLoss - entryPrice);
    
    const riskPercent = Math.abs(entryPrice - stopLoss) / entryPrice * 100;

    const entry: JournalEntry = {
      id,
      timestamp: Date.now(),
      symbol,
      exchange,
      botCode,
      side,
      entryPrice,
      entryTime: Date.now(),
      entryReason,
      entrySignalId: signalId,
      size,
      leverage,
      stopLoss,
      takeProfit,
      riskRewardRatio,
      riskPercent,
      status: 'OPEN',
      tags: [],
      notes: '',
      rating: 3,
      marketRegime: context?.marketRegime,
      volatility: context?.volatility,
      volume: context?.volume,
    };

    this.entries.set(id, entry);
    this.openTrades.set(`${symbol}_${entryTime}`, id);

    this.stats.totalTrades++;
    this.stats.openTrades++;

    return entry;
  }

  /**
   * Close a trade entry
   */
  public closeTrade(
    entryId: string,
    exitPrice: number,
    exitReason: string,
    fees: number = 0
  ): JournalEntry | null {
    const entry = this.entries.get(entryId);
    if (!entry || entry.status !== 'OPEN') return null;

    entry.exitPrice = exitPrice;
    entry.exitTime = Date.now();
    entry.exitReason = exitReason;
    entry.status = 'CLOSED';
    entry.fees = fees;
    entry.holdingTime = entry.exitTime - entry.entryTime;

    // Calculate PnL
    const direction = entry.side === 'LONG' ? 1 : -1;
    const priceChange = exitPrice - entry.entryPrice;
    entry.pnlPercent = direction * (priceChange / entry.entryPrice) * 100;
    entry.pnl = entry.pnlPercent / 100 * entry.size * entry.entryPrice;

    // Update stats
    this.stats.openTrades--;
    this.stats.closedTrades++;
    this.updateStats(entry);

    // Remove from open trades
    this.openTrades.delete(`${entry.symbol}_${entry.entryTime}`);

    return entry;
  }

  /**
   * Add notes and tags to entry
   */
  public annotateEntry(
    entryId: string,
    notes?: string,
    tags?: string[],
    rating?: 1 | 2 | 3 | 4 | 5,
    lesson?: string,
    mistake?: string,
    goodDecision?: string
  ): void {
    const entry = this.entries.get(entryId);
    if (!entry) return;

    if (notes) entry.notes = notes;
    if (tags) entry.tags = [...entry.tags, ...tags];
    if (rating) entry.rating = rating;
    if (lesson) entry.lessonLearned = lesson;
    if (mistake) entry.mistake = mistake;
    if (goodDecision) entry.goodDecision = goodDecision;
  }

  /**
   * Get entry by ID
   */
  public getEntry(id: string): JournalEntry | null {
    return this.entries.get(id) || null;
  }

  /**
   * Get entries by filters
   */
  public getEntries(filters?: {
    symbol?: string;
    botCode?: string;
    status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
    side?: 'LONG' | 'SHORT';
    from?: number;
    to?: number;
    minPnL?: number;
    maxPnL?: number;
  }): JournalEntry[] {
    let entries = Array.from(this.entries.values());

    if (filters) {
      if (filters.symbol) entries = entries.filter(e => e.symbol === filters.symbol);
      if (filters.botCode) entries = entries.filter(e => e.botCode === filters.botCode);
      if (filters.status) entries = entries.filter(e => e.status === filters.status);
      if (filters.side) entries = entries.filter(e => e.side === filters.side);
      if (filters.from) entries = entries.filter(e => e.timestamp >= filters.from);
      if (filters.to) entries = entries.filter(e => e.timestamp <= filters.to);
      if (filters.minPnL !== undefined) entries = entries.filter(e => (e.pnl || 0) >= filters.minPnL);
      if (filters.maxPnL !== undefined) entries = entries.filter(e => (e.pnl || 0) <= filters.maxPnL);
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get open trades
   */
  public getOpenTrades(): JournalEntry[] {
    return this.getEntries({ status: 'OPEN' });
  }

  /**
   * Get statistics
   */
  public getStats(): JournalStats {
    return { ...this.stats };
  }

  /**
   * Analyze trading performance
   */
  public analyzePerformance(): {
    bestTimes: { day: number; hour: number }[];
    worstTimes: { day: number; hour: number }[];
    bestSymbols: string[];
    worstSymbols: string[];
    commonMistakes: string[];
    successfulPatterns: string[];
  } {
    const closedEntries = this.getEntries({ status: 'CLOSED' });

    // Best/worst times
    const dayHourWinRates = new Map<string, { wins: number; total: number }>();
    for (const entry of closedEntries) {
      const date = new Date(entry.entryTime);
      const key = `${date.getDay()}_${date.getHours()}`;
      const current = dayHourWinRates.get(key) || { wins: 0, total: 0 };
      current.total++;
      if ((entry.pnl || 0) > 0) current.wins++;
      dayHourWinRates.set(key, current);
    }

    const timeWinRates = Array.from(dayHourWinRates.entries())
      .map(([key, data]) => ({
        day: parseInt(key.split('_')[0]),
        hour: parseInt(key.split('_')[1]),
        winRate: data.total > 0 ? data.wins / data.total : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate);

    const bestTimes = timeWinRates.slice(0, 3);
    const worstTimes = timeWinRates.slice(-3).reverse();

    // Best/worst symbols
    const symbolPerformance = new Map<string, { wins: number; total: number; pnl: number }>();
    for (const entry of closedEntries) {
      const current = symbolPerformance.get(entry.symbol) || { wins: 0, total: 0, pnl: 0 };
      current.total++;
      current.pnl += entry.pnl || 0;
      if ((entry.pnl || 0) > 0) current.wins++;
      symbolPerformance.set(entry.symbol, current);
    }

    const sortedSymbols = Array.from(symbolPerformance.entries())
      .sort((a, b) => b[1].pnl - a[1].pnl);

    const bestSymbols = sortedSymbols.slice(0, 5).map(([s]) => s);
    const worstSymbols = sortedSymbols.slice(-5).reverse().map(([s]) => s);

    // Common mistakes
    const mistakes = closedEntries
      .filter(e => e.mistake)
      .map(e => e.mistake!);
    
    const mistakeCounts = new Map<string, number>();
    for (const mistake of mistakes) {
      mistakeCounts.set(mistake, (mistakeCounts.get(mistake) || 0) + 1);
    }
    
    const commonMistakes = Array.from(mistakeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([m]) => m);

    // Successful patterns
    const patterns = closedEntries
      .filter(e => e.pnl && e.pnl > 0 && e.tags.length > 0)
      .flatMap(e => e.tags);
    
    const patternCounts = new Map<string, number>();
    for (const pattern of patterns) {
      patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
    }
    
    const successfulPatterns = Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p]) => p);

    return { bestTimes, worstTimes, bestSymbols, worstSymbols, commonMistakes, successfulPatterns };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private initializeStats(): JournalStats {
    return {
      totalTrades: 0,
      openTrades: 0,
      closedTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      totalPnL: 0,
      totalFees: 0,
      netPnL: 0,
      avgHoldingTime: 0,
      avgRiskPercent: 0,
      avgRRRatio: 0,
      bestTrade: null,
      worstTrade: null,
      byBot: new Map(),
      bySymbol: new Map(),
      byDayOfWeek: new Map(),
      byHour: new Map(),
    };
  }

  private updateStats(entry: JournalEntry): void {
    if (entry.status !== 'CLOSED' || entry.pnl === undefined) return;

    const pnl = entry.pnl;

    // Update totals
    this.stats.totalPnL += pnl;
    this.stats.totalFees += entry.fees || 0;
    this.stats.netPnL = this.stats.totalPnL - this.stats.totalFees;

    // Update win/loss
    const wins = Math.round(this.stats.winRate * (this.stats.closedTrades - 1));
    if (pnl > 0) {
      this.stats.winRate = (wins + 1) / this.stats.closedTrades;
      this.stats.avgWin = (this.stats.avgWin * wins + pnl) / (wins + 1);
    } else {
      const losses = this.stats.closedTrades - wins;
      this.stats.avgLoss = (this.stats.avgLoss * (losses - 1) + pnl) / losses;
    }

    // Profit factor
    const totalWins = this.stats.avgWin * wins;
    const totalLosses = Math.abs(this.stats.avgLoss * (this.stats.closedTrades - wins));
    this.stats.profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    // Average holding time
    this.stats.avgHoldingTime = 
      (this.stats.avgHoldingTime * (this.stats.closedTrades - 1) + (entry.holdingTime || 0)) 
      / this.stats.closedTrades;

    // Average risk
    this.stats.avgRiskPercent = 
      (this.stats.avgRiskPercent * (this.stats.closedTrades - 1) + entry.riskPercent) 
      / this.stats.closedTrades;

    // Average R:R
    this.stats.avgRRRatio = 
      (this.stats.avgRRRatio * (this.stats.closedTrades - 1) + entry.riskRewardRatio) 
      / this.stats.closedTrades;

    // Best/worst trade
    if (!this.stats.bestTrade || pnl > (this.stats.bestTrade.pnl || 0)) {
      this.stats.bestTrade = entry;
    }
    if (!this.stats.worstTrade || pnl < (this.stats.worstTrade.pnl || 0)) {
      this.stats.worstTrade = entry;
    }

    // By bot
    const botStats = this.stats.byBot.get(entry.botCode) || {
      botCode: entry.botCode,
      trades: 0,
      winRate: 0,
      avgPnL: 0,
      totalPnL: 0,
      avgHoldingTime: 0,
      sharpeRatio: 0,
    };
    botStats.trades++;
    botStats.totalPnL += pnl;
    botStats.avgPnL = (botStats.avgPnL * (botStats.trades - 1) + pnl) / botStats.trades;
    this.stats.byBot.set(entry.botCode, botStats);

    // By symbol
    const symbolStats = this.stats.bySymbol.get(entry.symbol) || {
      symbol: entry.symbol,
      trades: 0,
      winRate: 0,
      avgPnL: 0,
      totalPnL: 0,
      avgVolatility: 0,
    };
    symbolStats.trades++;
    symbolStats.totalPnL += pnl;
    symbolStats.avgPnL = (symbolStats.avgPnL * (symbolStats.trades - 1) + pnl) / symbolStats.trades;
    this.stats.bySymbol.set(entry.symbol, symbolStats);

    // By time
    const date = new Date(entry.entryTime);
    const dayOfWeek = date.getDay();
    const hour = date.getHours();
    
    this.stats.byDayOfWeek.set(dayOfWeek, 
      (this.stats.byDayOfWeek.get(dayOfWeek) || 0) + (pnl > 0 ? 1 : 0));
    this.stats.byHour.set(hour, 
      (this.stats.byHour.get(hour) || 0) + (pnl > 0 ? 1 : 0));
  }
}

// =============================================================================
// PATTERN DETECTOR
// =============================================================================

export class PatternDetector {
  private patterns: Map<string, DetectedPattern[]> = new Map();
  private performance: Map<PatternType, PatternPerformance> = new Map();
  private minPatternLength = 5;
  private maxPatternLength = 100;

  constructor() {
    this.initializePerformance();
  }

  /**
   * Detect patterns in OHLCV data
   */
  public detect(
    symbol: string,
    exchange: string,
    timeframe: string,
    opens: number[],
    highs: number[],
    lows: number[],
    closes: number[],
    volumes?: number[]
  ): DetectedPattern[] {
    const detected: DetectedPattern[] = [];
    const n = closes.length;

    if (n < this.minPatternLength) return detected;

    // Candlestick patterns (require last 3 candles)
    const candlePatterns = this.detectCandlestickPatterns(
      symbol, exchange, timeframe,
      opens.slice(-4), highs.slice(-4), lows.slice(-4), closes.slice(-4)
    );
    detected.push(...candlePatterns);

    // Chart patterns (require more data)
    if (n >= 20) {
      const chartPatterns = this.detectChartPatterns(
        symbol, exchange, timeframe,
        opens, highs, lows, closes, volumes
      );
      detected.push(...chartPatterns);
    }

    // Store detected patterns
    const key = `${exchange}_${symbol}_${timeframe}`;
    const existing = this.patterns.get(key) || [];
    this.patterns.set(key, [...existing, ...detected]);

    return detected;
  }

  /**
   * Detect candlestick patterns
   */
  private detectCandlestickPatterns(
    symbol: string,
    exchange: string,
    timeframe: string,
    opens: number[],
    highs: number[],
    lows: number[],
    closes: number[]
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const n = closes.length;

    if (n < 3) return patterns;

    const o1 = opens[n - 3], h1 = highs[n - 3], l1 = lows[n - 3], c1 = closes[n - 3];
    const o2 = opens[n - 2], h2 = highs[n - 2], l2 = lows[n - 2], c2 = closes[n - 2];
    const o3 = opens[n - 1], h3 = highs[n - 1], l3 = lows[n - 1], c3 = closes[n - 1];

    const body1 = Math.abs(c1 - o1), range1 = h1 - l1;
    const body2 = Math.abs(c2 - o2), range2 = h2 - l2;
    const body3 = Math.abs(c3 - o3), range3 = h3 - l3;

    // Pin Bar (hammer/hanging man)
    const lowerWick3 = Math.min(o3, c3) - l3;
    const upperWick3 = h3 - Math.max(o3, c3);
    
    if (body3 < range3 * 0.3 && lowerWick3 > body3 * 2 && upperWick3 < body3) {
      patterns.push(this.createPattern(
        'PIN_BAR', symbol, exchange, timeframe,
        n - 1, n, [l3, Math.max(o3, c3)], 'BULLISH', 0.7
      ));
    } else if (body3 < range3 * 0.3 && upperWick3 > body3 * 2 && lowerWick3 < body3) {
      patterns.push(this.createPattern(
        'PIN_BAR', symbol, exchange, timeframe,
        n - 1, n, [Math.min(o3, c3), h3], 'BEARISH', 0.7
      ));
    }

    // Engulfing
    if (c1 < o1 && c2 > o2 && c2 > o1 && o2 < c1) {
      patterns.push(this.createPattern(
        'ENGULFING', symbol, exchange, timeframe,
        n - 2, n, [l2, h2], 'BULLISH', 0.75
      ));
    } else if (c1 > o1 && c2 < o2 && c2 < o1 && o2 > c1) {
      patterns.push(this.createPattern(
        'ENGULFING', symbol, exchange, timeframe,
        n - 2, n, [l2, h2], 'BEARISH', 0.75
      ));
    }

    // Inside Bar
    if (h2 < h1 && l2 > l1) {
      patterns.push(this.createPattern(
        'INSIDE_BAR', symbol, exchange, timeframe,
        n - 2, n, [h1, l1], 'NEUTRAL', 0.6
      ));
    }

    // Outside Bar
    if (h2 > h1 && l2 < l1) {
      patterns.push(this.createPattern(
        'OUTSIDE_BAR', symbol, exchange, timeframe,
        n - 2, n, [h2, l2], c2 > c1 ? 'BULLISH' : 'BEARISH', 0.65
      ));
    }

    // Morning Star (bullish reversal)
    if (n >= 3 && c1 < o1 && body2 < range2 * 0.3 && c3 > o3 && c3 > (o1 + c1) / 2) {
      patterns.push(this.createPattern(
        'MORNING_STAR', symbol, exchange, timeframe,
        n - 3, n, [l3, h3], 'BULLISH', 0.8
      ));
    }

    // Evening Star (bearish reversal)
    if (n >= 3 && c1 > o1 && body2 < range2 * 0.3 && c3 < o3 && c3 < (o1 + c1) / 2) {
      patterns.push(this.createPattern(
        'EVENING_STAR', symbol, exchange, timeframe,
        n - 3, n, [h3, l3], 'BEARISH', 0.8
      ));
    }

    // Three White Soldiers
    if (n >= 3 && c1 > o1 && c2 > o2 && c3 > o3 && 
        c2 > c1 && c3 > c2 && o2 > o1 && o3 > o2) {
      patterns.push(this.createPattern(
        'THREE_WHITE_SOLDIERS', symbol, exchange, timeframe,
        n - 3, n, [l3, h3], 'BULLISH', 0.85
      ));
    }

    // Three Black Crows
    if (n >= 3 && c1 < o1 && c2 < o2 && c3 < o3 && 
        c2 < c1 && c3 < c2 && o2 < o1 && o3 < o2) {
      patterns.push(this.createPattern(
        'THREE_BLACK_CROWS', symbol, exchange, timeframe,
        n - 3, n, [h3, l3], 'BEARISH', 0.85
      ));
    }

    return patterns;
  }

  /**
   * Detect chart patterns
   */
  private detectChartPatterns(
    symbol: string,
    exchange: string,
    timeframe: string,
    opens: number[],
    highs: number[],
    lows: number[],
    closes: number[],
    volumes?: number[]
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const n = closes.length;

    // Find local extrema
    const peaks: number[] = [];
    const troughs: number[] = [];

    for (let i = 2; i < n - 2; i++) {
      if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
          highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
        peaks.push(i);
      }
      if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
          lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
        troughs.push(i);
      }
    }

    // Double Top
    if (peaks.length >= 2) {
      const lastTwoPeaks = peaks.slice(-2);
      const p1 = highs[lastTwoPeaks[0]];
      const p2 = highs[lastTwoPeaks[1]];
      const tolerance = p1 * 0.02;

      if (Math.abs(p1 - p2) < tolerance && p2 > closes[n - 1]) {
        const neckline = Math.min(lows[lastTwoPeaks[0]], lows[lastTwoPeaks[1]]);
        patterns.push(this.createPattern(
          'DOUBLE_TOP', symbol, exchange, timeframe,
          lastTwoPeaks[0], n, [p1, p2, neckline], 'BEARISH', 0.75,
          neckline, neckline - (p1 - neckline), neckline
        ));
      }
    }

    // Double Bottom
    if (troughs.length >= 2) {
      const lastTwoTroughs = troughs.slice(-2);
      const t1 = lows[lastTwoTroughs[0]];
      const t2 = lows[lastTwoTroughs[1]];
      const tolerance = t1 * 0.02;

      if (Math.abs(t1 - t2) < tolerance && t2 < closes[n - 1]) {
        const neckline = Math.max(highs[lastTwoTroughs[0]], highs[lastTwoTroughs[1]]);
        patterns.push(this.createPattern(
          'DOUBLE_BOTTOM', symbol, exchange, timeframe,
          lastTwoTroughs[0], n, [t1, t2, neckline], 'BULLISH', 0.75,
          neckline, neckline + (neckline - t1), neckline
        ));
      }
    }

    // Head and Shoulders
    if (peaks.length >= 3) {
      const lastThreePeaks = peaks.slice(-3);
      const leftShoulder = highs[lastThreePeaks[0]];
      const head = highs[lastThreePeaks[1]];
      const rightShoulder = highs[lastThreePeaks[2]];

      if (head > leftShoulder && head > rightShoulder) {
        const shoulderTolerance = leftShoulder * 0.03;
        if (Math.abs(leftShoulder - rightShoulder) < shoulderTolerance) {
          const neckline = Math.min(lows[lastThreePeaks[0]], lows[lastThreePeaks[2]]);
          patterns.push(this.createPattern(
            'HEAD_SHOULDERS', symbol, exchange, timeframe,
            lastThreePeaks[0], n, [leftShoulder, head, rightShoulder, neckline], 'BEARISH', 0.8,
            neckline, neckline - (head - neckline), neckline
          ));
        }
      }
    }

    // Inverse Head and Shoulders
    if (troughs.length >= 3) {
      const lastThreeTroughs = troughs.slice(-3);
      const leftShoulder = lows[lastThreeTroughs[0]];
      const head = lows[lastThreeTroughs[1]];
      const rightShoulder = lows[lastThreeTroughs[2]];

      if (head < leftShoulder && head < rightShoulder) {
        const shoulderTolerance = leftShoulder * 0.03;
        if (Math.abs(leftShoulder - rightShoulder) < shoulderTolerance) {
          const neckline = Math.max(highs[lastThreeTroughs[0]], highs[lastThreeTroughs[2]]);
          patterns.push(this.createPattern(
            'HEAD_SHOULDERS_INVERSE', symbol, exchange, timeframe,
            lastThreeTroughs[0], n, [leftShoulder, head, rightShoulder, neckline], 'BULLISH', 0.8,
            neckline, neckline + (neckline - head), neckline
          ));
        }
      }
    }

    // Triangle patterns
    if (peaks.length >= 2 && troughs.length >= 2) {
      const recentPeaks = peaks.slice(-3);
      const recentTroughs = troughs.slice(-3);

      // Descending peaks
      const peaksDescending = recentPeaks.every((p, i) => 
        i === 0 || highs[p] < highs[recentPeaks[i - 1]]);
      
      // Ascending troughs
      const troughsAscending = recentTroughs.every((t, i) => 
        i === 0 || lows[t] > lows[recentTroughs[i - 1]]);

      if (peaksDescending && troughsAscending) {
        // Symmetrical triangle
        patterns.push(this.createPattern(
          'TRIANGLE_SYMMETRICAL', symbol, exchange, timeframe,
          Math.min(recentPeaks[0], recentTroughs[0]), n,
          [highs[recentPeaks[0]], lows[recentTroughs[0]]],
          'NEUTRAL', 0.65
        ));
      } else if (troughsAscending && !peaksDescending) {
        // Ascending triangle (bullish)
        const resistance = highs[recentPeaks[recentPeaks.length - 1]];
        patterns.push(this.createPattern(
          'TRIANGLE_ASCENDING', symbol, exchange, timeframe,
          Math.min(recentPeaks[0], recentTroughs[0]), n,
          [resistance, lows[recentTroughs[0]]],
          'BULLISH', 0.7,
          resistance, resistance * 1.03, lows[recentTroughs[recentTroughs.length - 1]]
        ));
      } else if (peaksDescending && !troughsAscending) {
        // Descending triangle (bearish)
        const support = lows[recentTroughs[recentTroughs.length - 1]];
        patterns.push(this.createPattern(
          'TRIANGLE_DESCENDING', symbol, exchange, timeframe,
          Math.min(recentPeaks[0], recentTroughs[0]), n,
          [highs[recentPeaks[0]], support],
          'BEARISH', 0.7,
          support, support * 0.97, highs[recentPeaks[recentPeaks.length - 1]]
        ));
      }
    }

    // Support/Resistance
    const levels = this.findSupportResistance(highs, lows, closes);
    for (const level of levels) {
      patterns.push(this.createPattern(
        'SUPPORT_RESISTANCE', symbol, exchange, timeframe,
        level.startIdx, n, level.prices,
        level.type, 0.6
      ));
    }

    return patterns;
  }

  /**
   * Find support and resistance levels
   */
  private findSupportResistance(
    highs: number[],
    lows: number[],
    closes: number[]
  ): Array<{ type: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; startIdx: number; prices: number[] }> {
    const levels: Array<{ type: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; startIdx: number; prices: number[] }> = [];
    const n = closes.length;
    const lookback = 20;
    const tolerance = 0.005;

    // Find price levels that have been tested multiple times
    const priceLevels: Map<number, number> = new Map();

    for (let i = Math.max(0, n - lookback); i < n; i++) {
      // Round to nearest 0.5%
      const roundedH = Math.round(highs[i] * 200) / 200;
      const roundedL = Math.round(lows[i] * 200) / 200;
      
      priceLevels.set(roundedH, (priceLevels.get(roundedH) || 0) + 1);
      priceLevels.set(roundedL, (priceLevels.get(roundedL) || 0) + 1);
    }

    // Find levels with multiple touches
    for (const [level, count] of priceLevels) {
      if (count >= 3) {
        const currentPrice = closes[n - 1];
        const type = level > currentPrice ? 'BEARISH' : level < currentPrice ? 'BULLISH' : 'NEUTRAL';
        
        levels.push({
          type,
          startIdx: n - lookback,
          prices: [level],
        });
      }
    }

    return levels.slice(0, 5); // Top 5 levels
  }

  /**
   * Create a detected pattern object
   */
  private createPattern(
    type: PatternType,
    symbol: string,
    exchange: string,
    timeframe: string,
    startIdx: number,
    endIdx: number,
    keyLevels: number[],
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    confidence: number,
    breakoutLevel?: number,
    targetLevel?: number,
    stopLevel?: number
  ): DetectedPattern {
    const perf = this.performance.get(type);
    
    return {
      id: `pattern-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type,
      symbol,
      exchange,
      timeframe,
      detectedAt: Date.now(),
      startIdx,
      endIdx,
      confidence,
      keyLevels,
      breakoutLevel,
      targetLevel,
      stopLevel,
      direction,
      completed: false,
      historicalWinRate: perf?.winRate,
      historicalAvgMove: perf?.avgMovePercent,
    };
  }

  /**
   * Update pattern with outcome
   */
  public updatePatternOutcome(
    patternId: string,
    outcome: 'SUCCESS' | 'FAILURE'
  ): void {
    for (const [key, patterns] of this.patterns) {
      const pattern = patterns.find(p => p.id === patternId);
      if (pattern) {
        pattern.completed = true;
        pattern.outcome = outcome;
        pattern.completionTime = Date.now();

        // Update performance stats
        const perf = this.performance.get(pattern.type)!;
        perf.totalOccurrences++;
        if (outcome === 'SUCCESS') {
          perf.successfulOccurrences++;
        }
        perf.winRate = perf.successfulOccurrences / perf.totalOccurrences;

        break;
      }
    }
  }

  /**
   * Get active patterns
   */
  public getActivePatterns(symbol?: string, exchange?: string): DetectedPattern[] {
    const allPatterns: DetectedPattern[] = [];
    
    for (const [key, patterns] of this.patterns) {
      for (const pattern of patterns) {
        if (!pattern.completed) {
          if (symbol && pattern.symbol !== symbol) continue;
          if (exchange && pattern.exchange !== exchange) continue;
          allPatterns.push(pattern);
        }
      }
    }

    return allPatterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get pattern performance stats
   */
  public getPatternPerformance(): Map<PatternType, PatternPerformance> {
    return new Map(this.performance);
  }

  /**
   * Initialize performance tracking
   */
  private initializePerformance(): void {
    const patternTypes: PatternType[] = [
      'DOUBLE_TOP', 'DOUBLE_BOTTOM', 'HEAD_SHOULDERS', 'HEAD_SHOULDERS_INVERSE',
      'TRIANGLE_ASCENDING', 'TRIANGLE_DESCENDING', 'TRIANGLE_SYMMETRICAL',
      'FLAG_BULLISH', 'FLAG_BEARISH', 'WEDGE_RISING', 'WEDGE_FALLING',
      'CHANNEL_UP', 'CHANNEL_DOWN', 'SUPPORT_RESISTANCE', 'TREND_LINE_BREAK',
      'INSIDE_BAR', 'OUTSIDE_BAR', 'PIN_BAR', 'ENGULFING',
      'MORNING_STAR', 'EVENING_STAR', 'THREE_WHITE_SOLDIERS', 'THREE_BLACK_CROWS',
    ];

    for (const type of patternTypes) {
      this.performance.set(type, {
        type,
        totalOccurrences: 0,
        successfulOccurrences: 0,
        winRate: 0.5,
        avgMovePercent: 0,
        avgTimeToComplete: 0,
        falseBreakoutRate: 0,
        bestMarket: 'ranging',
      });
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { TradeJournal, PatternDetector };
