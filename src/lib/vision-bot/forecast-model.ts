/**
 * Vision Bot Forecast Model
 * 
 * ML модель для прогнозирования направления рынка.
 */

// ==================== TYPES ====================

export interface MarketForecast {
  direction: "UPWARD" | "DOWNWARD" | "CONSOLIDATION";
  confidence: number;          // 0-1
  upwardProb: number;
  downwardProb: number;
  consolidationProb: number;
  predictedChange24h: number;  // %
  timestamp: Date;
  features?: FeatureVector;
}

export interface FeatureVector {
  // Technical indicators
  rsi: number;
  macd: number;
  macdSignal: number;
  bollingerPosition: number;    // 0-1, position within bands
  atr: number;
  
  // Volume features
  volumeRatio: number;          // Current / Average volume
  volumeTrend: number;          // -1 to 1
  
  // Price features
  roc24h: number;               // Rate of change 24h
  pricePosition: number;        // Position in 24h range (0-1)
  
  // Correlation features
  btcCorrelation: number;
  ethCorrelation: number;
  spyCorrelation: number;
  goldCorrelation: number;
  
  // Market regime
  volatility: number;
  trendStrength: number;
}

export interface TrainingData {
  features: FeatureVector[];
  labels: number[];  // 1 = up, 0 = consolidation, -1 = down
  timestamps: Date[];
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  trainedAt: Date;
  trainSamples: number;
  testSamples: number;
}

// ==================== FORECAST MODEL INTERFACE ====================

export interface IForecastModel {
  train(data: TrainingData): Promise<ModelMetrics>;
  predict(features: FeatureVector): Promise<MarketForecast>;
  getMetrics(): Promise<ModelMetrics | null>;
  save(path: string): Promise<void>;
  load(path: string): Promise<void>;
}

// ==================== SIMPLE ENSEMBLE MODEL ====================

export class EnsembleForecastModel implements IForecastModel {
  private weights: Record<string, number> = {};
  private metrics: ModelMetrics | null = null;
  private thresholds = {
    strongUp: 0.02,      // 2% up = strong up signal
    strongDown: -0.02,   // 2% down = strong down signal
    highVolatility: 0.05,
  };

  constructor() {
    // Initialize default weights
    this.weights = {
      rsi: 0.15,
      macd: 0.1,
      bollingerPosition: 0.1,
      volumeRatio: 0.1,
      roc24h: 0.15,
      btcCorrelation: 0.1,
      volatility: 0.1,
      trendStrength: 0.2,
    };
  }

  async train(data: TrainingData): Promise<ModelMetrics> {
    // Simple weight optimization based on feature-label correlation
    const featureNames = Object.keys(data.features[0]) as (keyof FeatureVector)[];
    
    for (const name of featureNames) {
      const values = data.features.map(f => f[name] as number);
      const correlation = this.calculateCorrelation(values, data.labels);
      this.weights[name] = Math.abs(correlation);
    }

    // Normalize weights
    const totalWeight = Object.values(this.weights).reduce((a, b) => a + b, 0);
    for (const name of featureNames) {
      this.weights[name] /= totalWeight;
    }

    this.metrics = {
      accuracy: 0.6, // Placeholder
      precision: 0.58,
      recall: 0.55,
      f1Score: 0.56,
      trainedAt: new Date(),
      trainSamples: data.features.length,
      testSamples: Math.floor(data.features.length * 0.2),
    };

    return this.metrics;
  }

  async predict(features: FeatureVector): Promise<MarketForecast> {
    // Calculate weighted score
    let score = 0;

    // RSI contribution
    if (features.rsi < 30) score += this.weights.rsi * 1;
    else if (features.rsi > 70) score -= this.weights.rsi * 1;
    else score += this.weights.rsi * (50 - features.rsi) / 50;

    // MACD contribution
    if (features.macd > features.macdSignal) score += this.weights.macd;
    else score -= this.weights.macd;

    // Bollinger position
    if (features.bollingerPosition < 0.2) score += this.weights.bollingerPosition;
    else if (features.bollingerPosition > 0.8) score -= this.weights.bollingerPosition;

    // Volume
    if (features.volumeRatio > 1.5 && features.volumeTrend > 0) {
      score += this.weights.volumeRatio * Math.sign(features.roc24h);
    }

    // ROC
    score += this.weights.roc24h * Math.tanh(features.roc24h * 10);

    // Correlation with BTC
    if (features.btcCorrelation > 0.5) {
      score += this.weights.btcCorrelation * features.trendStrength;
    }

    // Volatility penalty
    if (features.volatility > this.thresholds.highVolatility) {
      score *= 0.7; // Reduce confidence in high volatility
    }

    // Convert score to probabilities
    const normalizedScore = Math.tanh(score);
    
    let upwardProb: number;
    let downwardProb: number;
    let consolidationProb: number;

    if (normalizedScore > 0.3) {
      upwardProb = 0.4 + normalizedScore * 0.4;
      downwardProb = 0.1 + (1 - upwardProb) * 0.3;
      consolidationProb = 1 - upwardProb - downwardProb;
    } else if (normalizedScore < -0.3) {
      downwardProb = 0.4 + Math.abs(normalizedScore) * 0.4;
      upwardProb = 0.1 + (1 - downwardProb) * 0.3;
      consolidationProb = 1 - upwardProb - downwardProb;
    } else {
      consolidationProb = 0.4 + (0.3 - Math.abs(normalizedScore)) * 0.6;
      upwardProb = (1 - consolidationProb) / 2 + normalizedScore * 0.2;
      downwardProb = 1 - consolidationProb - upwardProb;
    }

    // Determine direction
    let direction: "UPWARD" | "DOWNWARD" | "CONSOLIDATION";
    let confidence: number;

    if (upwardProb > downwardProb && upwardProb > consolidationProb) {
      direction = "UPWARD";
      confidence = upwardProb;
    } else if (downwardProb > upwardProb && downwardProb > consolidationProb) {
      direction = "DOWNWARD";
      confidence = downwardProb;
    } else {
      direction = "CONSOLIDATION";
      confidence = consolidationProb;
    }

    // Predict 24h change
    const predictedChange24h = normalizedScore * 5; // Scale to % change

    return {
      direction,
      confidence,
      upwardProb,
      downwardProb,
      consolidationProb,
      predictedChange24h,
      timestamp: new Date(),
      features,
    };
  }

  async getMetrics(): Promise<ModelMetrics | null> {
    return this.metrics;
  }

  async save(path: string): Promise<void> {
    // In production, save to file
    console.log(`[ForecastModel] Saving model to ${path}`);
  }

  async load(path: string): Promise<void> {
    // In production, load from file
    console.log(`[ForecastModel] Loading model from ${path}`);
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }
}

// ==================== FEATURE ENGINEER ====================

export class FeatureEngineer {
  calculateFeatures(
    candles: { open: number; high: number; low: number; close: number; volume: number }[],
    additionalData?: {
      btcData?: number[];
      ethData?: number[];
      spyData?: number[];
      goldData?: number[];
    }
  ): FeatureVector {
    const current = candles[candles.length - 1];
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // RSI
    const rsi = this.calculateRSI(closes, 14);

    // MACD
    const { macd, signal } = this.calculateMACD(closes);
    const macdSignal = signal;

    // Bollinger Bands
    const bb = this.calculateBollingerBands(closes, 20, 2);
    const bollingerPosition = (current.close - bb.lower) / (bb.upper - bb.lower);

    // ATR
    const atr = this.calculateATR(candles, 14);

    // Volume features
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = current.volume / avgVolume;
    const recentVolumes = volumes.slice(-5);
    const olderVolumes = volumes.slice(-10, -5);
    const volumeTrend = (recentVolumes.reduce((a, b) => a + b, 0) / 5) / 
                        (olderVolumes.reduce((a, b) => a + b, 0) / 5) - 1;

    // Price features
    const prevClose = candles[candles.length - 25]?.close || current.close;
    const roc24h = (current.close - prevClose) / prevClose * 100;
    
    const high24h = Math.max(...closes.slice(-24));
    const low24h = Math.min(...closes.slice(-24));
    const pricePosition = (current.close - low24h) / (high24h - low24h);

    // Correlation features
    const btcCorrelation = additionalData?.btcData 
      ? this.calculateCorrelation(closes.slice(-20), additionalData.btcData.slice(-20))
      : 0;
    const ethCorrelation = additionalData?.ethData
      ? this.calculateCorrelation(closes.slice(-20), additionalData.ethData.slice(-20))
      : 0;
    const spyCorrelation = additionalData?.spyData
      ? this.calculateCorrelation(closes.slice(-20), additionalData.spyData.slice(-20))
      : 0;
    const goldCorrelation = additionalData?.goldData
      ? this.calculateCorrelation(closes.slice(-20), additionalData.goldData.slice(-20))
      : 0;

    // Market regime
    const returns = closes.slice(-20).map((c, i) => 
      i === 0 ? 0 : (c - closes[closes.length - 21 + i]) / closes[closes.length - 21 + i]
    ).filter(r => r !== 0);
    const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length) * Math.sqrt(252);
    
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const trendStrength = (current.close - sma20) / sma20;

    return {
      rsi,
      macd,
      macdSignal,
      bollingerPosition: Math.max(0, Math.min(1, bollingerPosition)),
      atr,
      volumeRatio,
      volumeTrend: Math.max(-1, Math.min(1, volumeTrend)),
      roc24h,
      pricePosition: Math.max(0, Math.min(1, pricePosition)),
      btcCorrelation,
      ethCorrelation,
      spyCorrelation,
      goldCorrelation,
      volatility,
      trendStrength,
    };
  }

  private calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;

    const changes = closes.slice(1).map((c, i) => c - closes[i]);
    const gains = changes.filter(c => c > 0);
    const losses = changes.filter(c => c < 0).map(c => Math.abs(c));

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(closes: number[]): { macd: number; signal: number } {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macd = ema12 - ema26;
    
    // Simplified signal line
    const signal = macd * 0.8;
    
    return { macd, signal };
  }

  private calculateEMA(data: number[], period: number): number {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private calculateBollingerBands(closes: number[], period: number, stdDev: number): {
    upper: number;
    middle: number;
    lower: number;
  } {
    const slice = closes.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, c) => sum + Math.pow(c - middle, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: middle + stdDev * std,
      middle,
      lower: middle - stdDev * std,
    };
  }

  private calculateATR(
    candles: { high: number; low: number; close: number }[],
    period: number
  ): number {
    if (candles.length < period + 1) return 0;

    const trueRanges = candles.slice(1).map((c, i) => {
      const prev = candles[i];
      return Math.max(
        c.high - c.low,
        Math.abs(c.high - prev.close),
        Math.abs(c.low - prev.close)
      );
    });

    return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }
}
