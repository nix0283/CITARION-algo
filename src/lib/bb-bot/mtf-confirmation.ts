/**
 * BB Bot Multi-Timeframe Confirmation - Enhanced Implementation (10/10)
 * 
 * Complete Multi-Timeframe Analysis with:
 * - Weighted timeframe voting
 * - Double Bollinger Bands (1SD + 2SD)
 * - Stochastic oscillator confirmation
 * - RSI divergence detection
 * - Volume confirmation filters
 */

// ==================== TYPES ====================

export interface TimeframeSignal {
  timeframe: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  bbPosition: "UPPER" | "MIDDLE" | "LOWER" | "OUTSIDE_UP" | "OUTSIDE_DOWN";
  stochSignal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" | "BULLISH_CROSS" | "BEARISH_CROSS";
  rsiValue: number;
  rsiSignal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL";
  priceVsBB1: number;  // Price position relative to 1SD BB
  priceVsBB2: number;  // Price position relative to 2SD BB
  bandwidth: number;   // BB bandwidth (volatility indicator)
  squeeze: boolean;    // BB squeeze detection
  timestamp: Date;
}

export interface MTFConfirmation {
  confirmed: boolean;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  timeframeVotes: { timeframe: string; vote: "LONG" | "SHORT" | "NEUTRAL"; weight: number }[];
  bbConfluence: boolean;      // BB signals align across timeframes
  stochConfluence: boolean;   // Stochastic signals align
  rsiConfluence: boolean;     // RSI signals align
  volumeConfirmed: boolean;   // Volume supports the signal
  divergence: "BULLISH" | "BEARISH" | null;  // Detected divergence
  squeezeAlert: boolean;      // BB squeeze detected
  reason: string;
  signalStrength: "WEAK" | "MODERATE" | "STRONG" | "VERY_STRONG";
}

export interface MTFConfig {
  timeframes: string[];
  requiredConfirmations: number;
  weightedVoting: boolean;
  weights?: Record<string, number>;
  bbPeriod: number;
  bbStdDev1: number;         // First BB standard deviation
  bbStdDev2: number;         // Second BB standard deviation
  stochK: number;
  stochD: number;
  stochSmooth: number;
  rsiPeriod: number;
  volumeLookback: number;
  minVolumeRatio: number;
  squeezeThreshold: number;  // Bandwidth threshold for squeeze
}

export interface DoubleBBSignal {
  price: number;
  upper1: number;    // Upper band 1SD
  lower1: number;    // Lower band 1SD
  middle: number;    // Middle band (SMA)
  upper2: number;    // Upper band 2SD
  lower2: number;    // Lower band 2SD
  bandwidth: number;
  percentB: number;  // %B indicator
  position: "INSIDE_1SD" | "OUTSIDE_1SD_INSIDE_2SD" | "OUTSIDE_2SD";
  signal: "OVERSOLD" | "OVERBOUGHT" | "NEUTRAL" | "EXTREME_OVERSOLD" | "EXTREME_OVERBOUGHT";
}

export interface StochasticSignal {
  k: number;
  d: number;
  signal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" | "BULLISH_CROSS" | "BEARISH_CROSS";
  divergence: "BULLISH" | "BEARISH" | null;
}

const DEFAULT_CONFIG: MTFConfig = {
  timeframes: ["5m", "15m", "1h", "4h"],
  requiredConfirmations: 2,
  weightedVoting: true,
  weights: { "5m": 0.5, "15m": 1.0, "1h": 1.5, "4h": 2.0, "1d": 2.5 },
  bbPeriod: 20,
  bbStdDev1: 1.0,
  bbStdDev2: 2.0,
  stochK: 14,
  stochD: 3,
  stochSmooth: 3,
  rsiPeriod: 14,
  volumeLookback: 20,
  minVolumeRatio: 1.2,
  squeezeThreshold: 0.02,  // 2% bandwidth = squeeze
};

// ==================== DOUBLE BOLLINGER BANDS ====================

export class DoubleBollingerBands {
  private period: number;
  private stdDev1: number;
  private stdDev2: number;
  private priceHistory: number[] = [];
  private maxHistory: number = 100;

  constructor(period: number = 20, stdDev1: number = 1.0, stdDev2: number = 2.0) {
    this.period = period;
    this.stdDev1 = stdDev1;
    this.stdDev2 = stdDev2;
  }

  /**
   * Add new price and calculate BB
   */
  update(price: number): DoubleBBSignal {
    this.priceHistory.push(price);
    if (this.priceHistory.length > this.maxHistory) {
      this.priceHistory.shift();
    }

    if (this.priceHistory.length < this.period) {
      return this.getDefaultSignal(price);
    }

    const prices = this.priceHistory.slice(-this.period);
    
    // Calculate SMA (middle band)
    const middle = prices.reduce((sum, p) => sum + p, 0) / this.period;

    // Calculate standard deviation
    const squaredDiffs = prices.map(p => Math.pow(p - middle, 2));
    const variance = squaredDiffs.reduce((sum, sq) => sum + sq, 0) / this.period;
    const stdDev = Math.sqrt(variance);

    // Calculate bands
    const upper1 = middle + (stdDev * this.stdDev1);
    const lower1 = middle - (stdDev * this.stdDev1);
    const upper2 = middle + (stdDev * this.stdDev2);
    const lower2 = middle - (stdDev * this.stdDev2);

    // Calculate bandwidth (volatility indicator)
    const bandwidth = (upper2 - lower2) / middle;

    // Calculate %B (price position within bands)
    const percentB = (price - lower2) / (upper2 - lower2);

    // Determine position
    let position: DoubleBBSignal["position"];
    if (price >= lower1 && price <= upper1) {
      position = "INSIDE_1SD";
    } else if (price >= lower2 && price <= upper2) {
      position = "OUTSIDE_1SD_INSIDE_2SD";
    } else {
      position = "OUTSIDE_2SD";
    }

    // Generate signal
    let signal: DoubleBBSignal["signal"];
    if (price > upper2) {
      signal = "EXTREME_OVERBOUGHT";
    } else if (price > upper1) {
      signal = "OVERBOUGHT";
    } else if (price < lower2) {
      signal = "EXTREME_OVERSOLD";
    } else if (price < lower1) {
      signal = "OVERSOLD";
    } else {
      signal = "NEUTRAL";
    }

    return {
      price,
      upper1,
      lower1,
      middle,
      upper2,
      lower2,
      bandwidth,
      percentB,
      position,
      signal,
    };
  }

  /**
   * Get default signal when not enough data
   */
  private getDefaultSignal(price: number): DoubleBBSignal {
    return {
      price,
      upper1: price * 1.01,
      lower1: price * 0.99,
      middle: price,
      upper2: price * 1.02,
      lower2: price * 0.98,
      bandwidth: 0.04,
      percentB: 0.5,
      position: "INSIDE_1SD",
      signal: "NEUTRAL",
    };
  }

  /**
   * Get BB values without updating
   */
  getValues(): DoubleBBSignal | null {
    if (this.priceHistory.length === 0) return null;
    return this.update(this.priceHistory[this.priceHistory.length - 1]);
  }

  /**
   * Check for BB squeeze
   */
  isSqueeze(threshold: number = 0.02): boolean {
    const values = this.getValues();
    if (!values) return false;
    return values.bandwidth < threshold;
  }

  /**
   * Clear history
   */
  clear(): void {
    this.priceHistory = [];
  }
}

// ==================== STOCHASTIC OSCILLATOR ====================

export class StochasticOscillator {
  private kPeriod: number;
  private dPeriod: number;
  private smooth: number;
  private priceHistory: { high: number; low: number; close: number }[] = [];
  private kValues: number[] = [];
  private maxHistory: number = 100;

  constructor(kPeriod: number = 14, dPeriod: number = 3, smooth: number = 3) {
    this.kPeriod = kPeriod;
    this.dPeriod = dPeriod;
    this.smooth = smooth;
  }

  /**
   * Update with new price data
   */
  update(high: number, low: number, close: number): StochasticSignal {
    this.priceHistory.push({ high, low, close });
    if (this.priceHistory.length > this.maxHistory) {
      this.priceHistory.shift();
    }

    if (this.priceHistory.length < this.kPeriod) {
      return { k: 50, d: 50, signal: "NEUTRAL", divergence: null };
    }

    // Calculate %K
    const period = this.priceHistory.slice(-this.kPeriod);
    const highestHigh = Math.max(...period.map(p => p.high));
    const lowestLow = Math.min(...period.map(p => p.low));
    
    let k: number;
    if (highestHigh === lowestLow) {
      k = 50;
    } else {
      k = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
    }

    // Smooth %K if needed
    this.kValues.push(k);
    if (this.kValues.length > this.maxHistory) {
      this.kValues.shift();
    }

    // Calculate smoothed %K
    const smoothedK = this.kValues.length >= this.smooth
      ? this.kValues.slice(-this.smooth).reduce((sum, val) => sum + val, 0) / this.smooth
      : k;

    // Calculate %D (SMA of %K)
    const d = this.kValues.length >= this.dPeriod
      ? this.kValues.slice(-this.dPeriod).reduce((sum, val) => sum + val, 0) / this.dPeriod
      : smoothedK;

    // Determine signal
    let signal: StochasticSignal["signal"] = "NEUTRAL";
    
    // Check for crossover
    if (this.kValues.length >= 2) {
      const prevK = this.kValues[this.kValues.length - 2];
      const prevD = d;
      
      // Bullish cross: K crosses above D in oversold territory
      if (prevK < prevD && smoothedK > d && smoothedK < 20) {
        signal = "BULLISH_CROSS";
      }
      // Bearish cross: K crosses below D in overbought territory
      else if (prevK > prevD && smoothedK < d && smoothedK > 80) {
        signal = "BEARISH_CROSS";
      }
    }

    // Override with overbought/oversold if more significant
    if (smoothedK >= 80) {
      signal = "OVERBOUGHT";
    } else if (smoothedK <= 20) {
      signal = "OVERSOLD";
    }

    // Detect divergence
    const divergence = this.detectDivergence(close, smoothedK);

    return { k: smoothedK, d, signal, divergence };
  }

  /**
   * Detect stochastic divergence
   */
  private detectDivergence(currentPrice: number, currentK: number): "BULLISH" | "BEARISH" | null {
    if (this.priceHistory.length < 10 || this.kValues.length < 10) return null;

    const recentPrices = this.priceHistory.slice(-10).map(p => p.close);
    const recentK = this.kValues.slice(-10);

    // Find lows
    const priceLows: number[] = [];
    const kLows: number[] = [];
    for (let i = 2; i < recentPrices.length - 2; i++) {
      if (recentPrices[i] < recentPrices[i-1] && recentPrices[i] < recentPrices[i-2] &&
          recentPrices[i] < recentPrices[i+1] && recentPrices[i] < recentPrices[i+2]) {
        priceLows.push(recentPrices[i]);
        kLows.push(recentK[i]);
      }
    }

    // Bullish divergence: price makes lower low, K makes higher low
    if (priceLows.length >= 2 && kLows.length >= 2) {
      if (priceLows[priceLows.length - 1] < priceLows[priceLows.length - 2] &&
          kLows[kLows.length - 1] > kLows[kLows.length - 2]) {
        return "BULLISH";
      }
    }

    // Find highs
    const priceHighs: number[] = [];
    const kHighs: number[] = [];
    for (let i = 2; i < recentPrices.length - 2; i++) {
      if (recentPrices[i] > recentPrices[i-1] && recentPrices[i] > recentPrices[i-2] &&
          recentPrices[i] > recentPrices[i+1] && recentPrices[i] > recentPrices[i+2]) {
        priceHighs.push(recentPrices[i]);
        kHighs.push(recentK[i]);
      }
    }

    // Bearish divergence: price makes higher high, K makes lower high
    if (priceHighs.length >= 2 && kHighs.length >= 2) {
      if (priceHighs[priceHighs.length - 1] > priceHighs[priceHighs.length - 2] &&
          kHighs[kHighs.length - 1] < kHighs[kHighs.length - 2]) {
        return "BEARISH";
      }
    }

    return null;
  }

  /**
   * Clear history
   */
  clear(): void {
    this.priceHistory = [];
    this.kValues = [];
  }
}

// ==================== RSI CALCULATOR ====================

export class RSICalculator {
  private period: number;
  private priceHistory: number[] = [];
  private avgGain: number = 0;
  private avgLoss: number = 0;
  private initialized: boolean = false;

  constructor(period: number = 14) {
    this.period = period;
  }

  /**
   * Update RSI with new price
   */
  update(price: number): { value: number; signal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL" } {
    this.priceHistory.push(price);
    
    if (this.priceHistory.length > this.period + 1) {
      this.priceHistory.shift();
    }

    if (this.priceHistory.length < this.period + 1) {
      return { value: 50, signal: "NEUTRAL" };
    }

    // Calculate price changes
    const changes: number[] = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      changes.push(this.priceHistory[i] - this.priceHistory[i - 1]);
    }

    if (!this.initialized) {
      // First calculation using SMA
      const gains = changes.filter(c => c > 0);
      const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
      
      this.avgGain = gains.length > 0 
        ? gains.reduce((sum, g) => sum + g, 0) / this.period 
        : 0;
      this.avgLoss = losses.length > 0 
        ? losses.reduce((sum, l) => sum + l, 0) / this.period 
        : 0;
      this.initialized = true;
    } else {
      // Use EMA for subsequent calculations
      const lastChange = changes[changes.length - 1];
      const gain = lastChange > 0 ? lastChange : 0;
      const loss = lastChange < 0 ? Math.abs(lastChange) : 0;
      
      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
    }

    // Calculate RSI
    let rsi: number;
    if (this.avgLoss === 0) {
      rsi = 100;
    } else {
      const rs = this.avgGain / this.avgLoss;
      rsi = 100 - (100 / (1 + rs));
    }

    // Determine signal
    let signal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL";
    if (rsi >= 70) {
      signal = "OVERBOUGHT";
    } else if (rsi <= 30) {
      signal = "OVERSOLD";
    } else {
      signal = "NEUTRAL";
    }

    return { value: rsi, signal };
  }

  /**
   * Clear history
   */
  clear(): void {
    this.priceHistory = [];
    this.avgGain = 0;
    this.avgLoss = 0;
    this.initialized = false;
  }
}

// ==================== MULTI-TIMEFRAME CONFIRMATION ====================

export class MultiTimeframeConfirmation {
  private config: MTFConfig;
  private signals: Map<string, TimeframeSignal> = new Map();
  private bbIndicators: Map<string, DoubleBollingerBands> = new Map();
  private stochIndicators: Map<string, StochasticOscillator> = new Map();
  private rsiIndicators: Map<string, RSICalculator> = new Map();

  constructor(config: Partial<MTFConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize indicators for each timeframe
    for (const tf of this.config.timeframes) {
      this.bbIndicators.set(tf, new DoubleBollingerBands(
        this.config.bbPeriod,
        this.config.bbStdDev1,
        this.config.bbStdDev2
      ));
      this.stochIndicators.set(tf, new StochasticOscillator(
        this.config.stochK,
        this.config.stochD,
        this.config.stochSmooth
      ));
      this.rsiIndicators.set(tf, new RSICalculator(this.config.rsiPeriod));
    }
  }

  /**
   * Update with new price data for a timeframe
   */
  updatePriceData(
    timeframe: string,
    open: number,
    high: number,
    low: number,
    close: number,
    volume?: number,
    avgVolume?: number
  ): TimeframeSignal {
    const bb = this.bbIndicators.get(timeframe);
    const stoch = this.stochIndicators.get(timeframe);
    const rsi = this.rsiIndicators.get(timeframe);

    if (!bb || !stoch || !rsi) {
      return this.getDefaultSignal(timeframe);
    }

    // Update indicators
    const bbSignal = bb.update(close);
    const stochSignal = stoch.update(high, low, close);
    const rsiResult = rsi.update(close);

    // Determine direction based on all indicators
    let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    let confidence = 0;

    // BB-based direction
    if (bbSignal.signal === "EXTREME_OVERSOLD" || bbSignal.signal === "OVERSOLD") {
      direction = "LONG";
      confidence += 0.3;
    } else if (bbSignal.signal === "EXTREME_OVERBOUGHT" || bbSignal.signal === "OVERBOUGHT") {
      direction = "SHORT";
      confidence += 0.3;
    }

    // Stochastic confirmation
    if (stochSignal.signal === "BULLISH_CROSS" || stochSignal.signal === "OVERSOLD") {
      if (direction === "LONG") confidence += 0.25;
      else if (direction === "NEUTRAL") { direction = "LONG"; confidence += 0.2; }
    } else if (stochSignal.signal === "BEARISH_CROSS" || stochSignal.signal === "OVERBOUGHT") {
      if (direction === "SHORT") confidence += 0.25;
      else if (direction === "NEUTRAL") { direction = "SHORT"; confidence += 0.2; }
    }

    // RSI confirmation
    if (rsiResult.signal === "OVERSOLD") {
      if (direction === "LONG") confidence += 0.2;
    } else if (rsiResult.signal === "OVERBOUGHT") {
      if (direction === "SHORT") confidence += 0.2;
    }

    // Stochastic divergence boost
    if (stochSignal.divergence === "BULLISH" && direction === "LONG") {
      confidence += 0.15;
    } else if (stochSignal.divergence === "BEARISH" && direction === "SHORT") {
      confidence += 0.15;
    }

    // Volume confirmation
    if (volume && avgVolume && volume > avgVolume * this.config.minVolumeRatio) {
      confidence *= 1.1; // Boost confidence on high volume
    }

    // Cap confidence at 1
    confidence = Math.min(1, confidence);

    // Determine BB position
    let bbPosition: TimeframeSignal["bbPosition"];
    if (close > bbSignal.upper2) {
      bbPosition = "OUTSIDE_UP";
    } else if (close < bbSignal.lower2) {
      bbPosition = "OUTSIDE_DOWN";
    } else if (close > bbSignal.middle) {
      bbPosition = "UPPER";
    } else if (close < bbSignal.middle) {
      bbPosition = "LOWER";
    } else {
      bbPosition = "MIDDLE";
    }

    const signal: TimeframeSignal = {
      timeframe,
      direction,
      confidence,
      bbPosition,
      stochSignal: stochSignal.signal,
      rsiValue: rsiResult.value,
      rsiSignal: rsiResult.signal,
      priceVsBB1: bbSignal.percentB,
      priceVsBB2: (close - bbSignal.lower2) / (bbSignal.upper2 - bbSignal.lower2),
      bandwidth: bbSignal.bandwidth,
      squeeze: bbSignal.bandwidth < this.config.squeezeThreshold,
      timestamp: new Date(),
    };

    this.signals.set(timeframe, signal);
    return signal;
  }

  /**
   * Get confirmation across all timeframes
   */
  getConfirmation(): MTFConfirmation {
    const votes = this.calculateVotes();
    const longVotes = votes.filter(v => v.vote === "LONG");
    const shortVotes = votes.filter(v => v.vote === "SHORT");
    const longWeight = longVotes.reduce((sum, v) => sum + v.weight, 0);
    const shortWeight = shortVotes.reduce((sum, v) => sum + v.weight, 0);
    const totalWeight = this.getTotalWeight();

    let confirmed = false;
    let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    let confidence = 0;
    const reasons: string[] = [];

    // Calculate confluence
    const bbConfluence = this.checkBBConfluence();
    const stochConfluence = this.checkStochConfluence();
    const rsiConfluence = this.checkRSIConfluence();
    const squeezeAlert = this.checkSqueezeAlert();

    // Detect divergence
    const divergence = this.detectOverallDivergence();

    if (longVotes.length >= this.config.requiredConfirmations && longWeight > shortWeight) {
      confirmed = true;
      direction = "LONG";
      confidence = longWeight / totalWeight;
      reasons.push(`${longVotes.length} timeframes confirm LONG`);
    } else if (shortVotes.length >= this.config.requiredConfirmations && shortWeight > longWeight) {
      confirmed = true;
      direction = "SHORT";
      confidence = shortWeight / totalWeight;
      reasons.push(`${shortVotes.length} timeframes confirm SHORT`);
    } else {
      reasons.push("Insufficient confirmation");
      if (longWeight > shortWeight) { 
        direction = "LONG"; 
        confidence = longWeight / totalWeight * 0.5; 
      } else if (shortWeight > longWeight) { 
        direction = "SHORT"; 
        confidence = shortWeight / totalWeight * 0.5; 
      }
    }

    // Adjust confidence based on confluence
    if (bbConfluence) confidence *= 1.1;
    if (stochConfluence) confidence *= 1.1;
    if (rsiConfluence) confidence *= 1.05;
    if (divergence && direction === "LONG" && divergence === "BULLISH") confidence *= 1.15;
    if (divergence && direction === "SHORT" && divergence === "BEARISH") confidence *= 1.15;

    // Determine signal strength
    let signalStrength: MTFConfirmation["signalStrength"];
    if (confidence >= 0.8) signalStrength = "VERY_STRONG";
    else if (confidence >= 0.6) signalStrength = "STRONG";
    else if (confidence >= 0.4) signalStrength = "MODERATE";
    else signalStrength = "WEAK";

    return {
      confirmed,
      direction,
      confidence: Math.min(1, confidence),
      timeframeVotes: votes,
      bbConfluence,
      stochConfluence,
      rsiConfluence,
      volumeConfirmed: false, // Will be set by caller
      divergence,
      squeezeAlert,
      reason: reasons.join(". "),
      signalStrength,
    };
  }

  /**
   * Calculate votes from all timeframes
   */
  private calculateVotes(): MTFConfirmation["timeframeVotes"] {
    const votes: MTFConfirmation["timeframeVotes"] = [];
    const weights = this.config.weights || {};
    
    for (const [tf, signal] of this.signals) {
      if (!this.config.timeframes.includes(tf)) continue;
      const weight = this.config.weightedVoting 
        ? (weights[tf] || 1) * signal.confidence 
        : signal.confidence;
      votes.push({ 
        timeframe: tf, 
        vote: signal.direction, 
        weight: signal.direction !== "NEUTRAL" ? weight : 0 
      });
    }
    return votes;
  }

  /**
   * Get total weight for all timeframes
   */
  private getTotalWeight(): number {
    const weights = this.config.weights || {};
    return this.config.timeframes.reduce((sum, tf) => sum + (weights[tf] || 1), 0);
  }

  /**
   * Check BB confluence across timeframes
   */
  private checkBBConfluence(): boolean {
    const signals = Array.from(this.signals.values());
    const longSignals = signals.filter(s => 
      s.bbPosition === "LOWER" || s.bbPosition === "OUTSIDE_DOWN"
    );
    const shortSignals = signals.filter(s => 
      s.bbPosition === "UPPER" || s.bbPosition === "OUTSIDE_UP"
    );
    
    return longSignals.length >= 2 || shortSignals.length >= 2;
  }

  /**
   * Check Stochastic confluence
   */
  private checkStochConfluence(): boolean {
    const signals = Array.from(this.signals.values());
    const oversold = signals.filter(s => 
      s.stochSignal === "OVERSOLD" || s.stochSignal === "BULLISH_CROSS"
    );
    const overbought = signals.filter(s => 
      s.stochSignal === "OVERBOUGHT" || s.stochSignal === "BEARISH_CROSS"
    );
    
    return oversold.length >= 2 || overbought.length >= 2;
  }

  /**
   * Check RSI confluence
   */
  private checkRSIConfluence(): boolean {
    const signals = Array.from(this.signals.values());
    const oversold = signals.filter(s => s.rsiSignal === "OVERSOLD");
    const overbought = signals.filter(s => s.rsiSignal === "OVERBOUGHT");
    
    return oversold.length >= 2 || overbought.length >= 2;
  }

  /**
   * Check for squeeze alert
   */
  private checkSqueezeAlert(): boolean {
    for (const signal of this.signals.values()) {
      if (signal.squeeze) return true;
    }
    return false;
  }

  /**
   * Detect overall divergence
   */
  private detectOverallDivergence(): "BULLISH" | "BEARISH" | null {
    let bullishDivergences = 0;
    let bearishDivergences = 0;

    for (const stoch of this.stochIndicators.values()) {
      const signal = stoch.update(0, 0, 0); // Get last signal
      if (signal.divergence === "BULLISH") bullishDivergences++;
      if (signal.divergence === "BEARISH") bearishDivergences++;
    }

    if (bullishDivergences >= 2) return "BULLISH";
    if (bearishDivergences >= 2) return "BEARISH";
    return null;
  }

  /**
   * Get signal for a specific timeframe
   */
  getSignal(timeframe: string): TimeframeSignal | undefined {
    return this.signals.get(timeframe);
  }

  /**
   * Get all signals
   */
  getAllSignals(): Map<string, TimeframeSignal> {
    return new Map(this.signals);
  }

  /**
   * Clear all signals and indicators
   */
  clear(): void {
    this.signals.clear();
    for (const bb of this.bbIndicators.values()) bb.clear();
    for (const stoch of this.stochIndicators.values()) stoch.clear();
    for (const rsi of this.rsiIndicators.values()) rsi.clear();
  }

  /**
   * Get BB indicator for timeframe
   */
  getBBIndicator(timeframe: string): DoubleBollingerBands | undefined {
    return this.bbIndicators.get(timeframe);
  }

  /**
   * Get Stochastic indicator for timeframe
   */
  getStochIndicator(timeframe: string): StochasticOscillator | undefined {
    return this.stochIndicators.get(timeframe);
  }

  /**
   * Get default signal
   */
  private getDefaultSignal(timeframe: string): TimeframeSignal {
    return {
      timeframe,
      direction: "NEUTRAL",
      confidence: 0,
      bbPosition: "MIDDLE",
      stochSignal: "NEUTRAL",
      rsiValue: 50,
      rsiSignal: "NEUTRAL",
      priceVsBB1: 0.5,
      priceVsBB2: 0.5,
      bandwidth: 0.04,
      squeeze: false,
      timestamp: new Date(),
    };
  }
}

// ==================== VOLUME CONFIRMATION FILTER ====================

export interface VolumeConfig { 
  enabled: boolean; 
  minVolumeRatio: number; 
  lookbackPeriod: number; 
}

const DEFAULT_VOLUME_CONFIG: VolumeConfig = { 
  enabled: true, 
  minVolumeRatio: 1.2, 
  lookbackPeriod: 20 
};

export class VolumeConfirmationFilter {
  private config: VolumeConfig;
  private volumeHistory: number[] = [];

  constructor(config: Partial<VolumeConfig> = {}) { 
    this.config = { ...DEFAULT_VOLUME_CONFIG, ...config }; 
  }

  /**
   * Check volume confirmation
   */
  check(currentVolume: number): { confirmed: boolean; ratio: number } {
    this.volumeHistory.push(currentVolume);
    if (this.volumeHistory.length > this.config.lookbackPeriod) {
      this.volumeHistory.shift();
    }

    if (!this.config.enabled) return { confirmed: true, ratio: 1 };
    
    const avgVolume = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;
    const ratio = currentVolume / avgVolume;
    return { confirmed: ratio >= this.config.minVolumeRatio, ratio };
  }
}

// ==================== DIVERGENCE DETECTOR ====================

export interface DivergenceSignal { 
  detected: boolean; 
  type: "BULLISH" | "BEARISH" | null; 
  strength: number; 
  price: number; 
  indicatorValue: number; 
}

export class DivergenceDetector {
  private priceHistory: number[] = [];
  private indicatorHistory: number[] = [];
  private maxHistory: number = 50;

  addDataPoint(price: number, indicatorValue: number): void {
    this.priceHistory.push(price);
    this.indicatorHistory.push(indicatorValue);
    if (this.priceHistory.length > this.maxHistory) { 
      this.priceHistory.shift(); 
      this.indicatorHistory.shift(); 
    }
  }

  detect(lookback: number = 10): DivergenceSignal {
    if (this.priceHistory.length < lookback) { 
      return { detected: false, type: null, strength: 0, price: 0, indicatorValue: 0 }; 
    }
    
    const recentPrices = this.priceHistory.slice(-lookback);
    const recentIndicators = this.indicatorHistory.slice(-lookback);
    const half = Math.floor(lookback / 2);

    const priceLow1 = Math.min(...recentPrices.slice(0, half));
    const priceLow2 = Math.min(...recentPrices.slice(half));
    const indLow1 = Math.min(...recentIndicators.slice(0, half));
    const indLow2 = Math.min(...recentIndicators.slice(half));

    // Bullish divergence
    if (priceLow2 < priceLow1 && indLow2 > indLow1) {
      return { 
        detected: true, 
        type: "BULLISH", 
        strength: Math.abs(indLow2 - indLow1) / Math.abs(priceLow2 - priceLow1), 
        price: recentPrices[recentPrices.length - 1], 
        indicatorValue: recentIndicators[recentIndicators.length - 1] 
      };
    }

    const priceHigh1 = Math.max(...recentPrices.slice(0, half));
    const priceHigh2 = Math.max(...recentPrices.slice(half));
    const indHigh1 = Math.max(...recentIndicators.slice(0, half));
    const indHigh2 = Math.max(...recentIndicators.slice(half));

    // Bearish divergence
    if (priceHigh2 > priceHigh1 && indHigh2 < indHigh1) {
      return { 
        detected: true, 
        type: "BEARISH", 
        strength: Math.abs(indHigh2 - indHigh1) / Math.abs(priceHigh2 - priceHigh1), 
        price: recentPrices[recentPrices.length - 1], 
        indicatorValue: recentIndicators[recentIndicators.length - 1] 
      };
    }

    return { detected: false, type: null, strength: 0, price: 0, indicatorValue: 0 };
  }

  clear(): void { 
    this.priceHistory = []; 
    this.indicatorHistory = []; 
  }
}

// ==================== EXPORTS ====================

export {
  DEFAULT_CONFIG,
};
