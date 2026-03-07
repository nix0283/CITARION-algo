/**
 * BB Bot Multi-Timeframe Confirmation
 */

export interface TimeframeSignal {
  timeframe: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  bbPosition: "UPPER" | "MIDDLE" | "LOWER" | "OUTSIDE";
  stochSignal: "OVERBOUGHT" | "OVERSOLD" | "NEUTRAL";
  timestamp: Date;
}

export interface MTFConfirmation {
  confirmed: boolean;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  timeframeVotes: { timeframe: string; vote: "LONG" | "SHORT" | "NEUTRAL"; weight: number }[];
  reason: string;
}

export interface MTFConfig {
  timeframes: string[];
  requiredConfirmations: number;
  weightedVoting: boolean;
  weights?: Record<string, number>;
}

const DEFAULT_CONFIG: MTFConfig = {
  timeframes: ["15m", "1h", "4h"],
  requiredConfirmations: 2,
  weightedVoting: true,
  weights: { "5m": 0.5, "15m": 1.0, "1h": 1.5, "4h": 2.0, "1d": 2.5 },
};

export class MultiTimeframeConfirmation {
  private config: MTFConfig;
  private signals: Map<string, TimeframeSignal> = new Map();

  constructor(config: Partial<MTFConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  updateSignal(timeframe: string, signal: Omit<TimeframeSignal, "timeframe">): void {
    this.signals.set(timeframe, { ...signal, timeframe });
  }

  getConfirmation(): MTFConfirmation {
    const votes = this.calculateVotes();
    const longVotes = votes.filter(v => v.vote === "LONG");
    const shortVotes = votes.filter(v => v.vote === "SHORT");
    const longWeight = longVotes.reduce((sum, v) => sum + v.weight, 0);
    const shortWeight = shortVotes.reduce((sum, v) => sum + v.weight, 0);

    let confirmed = false;
    let direction: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    let confidence = 0;
    const reasons: string[] = [];

    if (longVotes.length >= this.config.requiredConfirmations && longWeight > shortWeight) {
      confirmed = true;
      direction = "LONG";
      confidence = longWeight / this.getTotalWeight();
      reasons.push(`${longVotes.length} timeframes confirm LONG`);
    } else if (shortVotes.length >= this.config.requiredConfirmations && shortWeight > longWeight) {
      confirmed = true;
      direction = "SHORT";
      confidence = shortWeight / this.getTotalWeight();
      reasons.push(`${shortVotes.length} timeframes confirm SHORT`);
    } else {
      reasons.push("Insufficient confirmation");
      if (longWeight > shortWeight) { direction = "LONG"; confidence = longWeight / this.getTotalWeight() * 0.5; }
      else if (shortWeight > longWeight) { direction = "SHORT"; confidence = shortWeight / this.getTotalWeight() * 0.5; }
    }

    return { confirmed, direction, confidence, timeframeVotes: votes, reason: reasons.join(". ") };
  }

  private calculateVotes(): MTFConfirmation["timeframeVotes"] {
    const votes: MTFConfirmation["timeframeVotes"] = [];
    const weights = this.config.weights || {};
    for (const [tf, signal] of this.signals) {
      if (!this.config.timeframes.includes(tf)) continue;
      const weight = this.config.weightedVoting ? (weights[tf] || 1) * signal.confidence : signal.confidence;
      votes.push({ timeframe: tf, vote: signal.direction, weight: signal.direction !== "NEUTRAL" ? weight : 0 });
    }
    return votes;
  }

  private getTotalWeight(): number {
    const weights = this.config.weights || {};
    return this.config.timeframes.reduce((sum, tf) => sum + (weights[tf] || 1), 0);
  }

  getSignal(timeframe: string): TimeframeSignal | undefined { return this.signals.get(timeframe); }
  clear(): void { this.signals.clear(); }
}

export interface VolumeConfig { enabled: boolean; minVolumeRatio: number; lookbackPeriod: number; }
const DEFAULT_VOLUME_CONFIG: VolumeConfig = { enabled: true, minVolumeRatio: 1.5, lookbackPeriod: 20 };

export class VolumeConfirmationFilter {
  private config: VolumeConfig;
  constructor(config: Partial<VolumeConfig> = {}) { this.config = { ...DEFAULT_VOLUME_CONFIG, ...config }; }
  check(currentVolume: number, volumes: number[]): { confirmed: boolean; ratio: number } {
    if (!this.config.enabled) return { confirmed: true, ratio: 1 };
    const relevantVolumes = volumes.slice(-this.config.lookbackPeriod);
    const avgVolume = relevantVolumes.reduce((a, b) => a + b, 0) / relevantVolumes.length;
    const ratio = currentVolume / avgVolume;
    return { confirmed: ratio >= this.config.minVolumeRatio, ratio };
  }
}

export interface DivergenceSignal { detected: boolean; type: "BULLISH" | "BEARISH" | null; strength: number; price: number; indicatorValue: number; }

export class DivergenceDetector {
  private priceHistory: number[] = [];
  private indicatorHistory: number[] = [];
  private maxHistory: number = 50;

  addDataPoint(price: number, indicatorValue: number): void {
    this.priceHistory.push(price);
    this.indicatorHistory.push(indicatorValue);
    if (this.priceHistory.length > this.maxHistory) { this.priceHistory.shift(); this.indicatorHistory.shift(); }
  }

  detect(lookback: number = 10): DivergenceSignal {
    if (this.priceHistory.length < lookback) return { detected: false, type: null, strength: 0, price: 0, indicatorValue: 0 };
    const recentPrices = this.priceHistory.slice(-lookback);
    const recentIndicators = this.indicatorHistory.slice(-lookback);
    const half = Math.floor(lookback / 2);

    const priceLow1 = Math.min(...recentPrices.slice(0, half));
    const priceLow2 = Math.min(...recentPrices.slice(half));
    const indLow1 = Math.min(...recentIndicators.slice(0, half));
    const indLow2 = Math.min(...recentIndicators.slice(half));

    if (priceLow2 < priceLow1 && indLow2 > indLow1) {
      return { detected: true, type: "BULLISH", strength: Math.abs(indLow2 - indLow1) / Math.abs(priceLow2 - priceLow1), price: recentPrices[recentPrices.length - 1], indicatorValue: recentIndicators[recentIndicators.length - 1] };
    }

    const priceHigh1 = Math.max(...recentPrices.slice(0, half));
    const priceHigh2 = Math.max(...recentPrices.slice(half));
    const indHigh1 = Math.max(...recentIndicators.slice(0, half));
    const indHigh2 = Math.max(...recentIndicators.slice(half));

    if (priceHigh2 > priceHigh1 && indHigh2 < indHigh1) {
      return { detected: true, type: "BEARISH", strength: Math.abs(indHigh2 - indHigh1) / Math.abs(priceHigh2 - priceHigh1), price: recentPrices[recentPrices.length - 1], indicatorValue: recentIndicators[recentIndicators.length - 1] };
    }

    return { detected: false, type: null, strength: 0, price: 0, indicatorValue: 0 };
  }

  clear(): void { this.priceHistory = []; this.indicatorHistory = []; }
}
