/**
 * ML Service Client for Vision Bot
 * 
 * Production-ready client for Python ML microservice (port 3006)
 * Provides price prediction, signal classification, and regime detection.
 * 
 * ML Service Endpoints:
 * - GET /health - Health check
 * - POST /predict/price - Price prediction
 * - POST /predict/regime - Market regime detection
 */

import type { MarketData, ForecastProbabilities } from './types';

// ML Service configuration
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:3006';
const ML_SERVICE_TIMEOUT = 30000; // 30 seconds
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute health check interval

// =====================================================
// TYPES
// =====================================================

export interface MLPredictionRequest {
  features: number[][][];  // [samples, sequence_length, features]
  returnConfidence?: boolean;
}

export interface MLPredictionResponse {
  predictions: number[][];  // [samples, horizons]
  confidence_intervals?: {
    std: number[][];
    lower: number[][];
    upper: number[][];
  };
}

export interface SignalClassificationRequest {
  features: number[][];  // [samples, features]
}

export interface SignalClassificationResponse {
  signals: Array<{
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    probabilities: {
      BUY: number;
      SELL: number;
      HOLD: number;
    };
  }>;
}

export interface RegimeDetectionRequest {
  observations: number[][];  // [samples, features] - returns, volatility, volume
}

export interface RegimeDetectionResponse {
  regime: 'BULL' | 'BEAR' | 'SIDEWAYS';
  regime_id: number;
  confidence: number;
  probabilities: {
    BULL: number;
    BEAR: number;
    SIDEWAYS: number;
  };
  transition_matrix?: number[][];
}

export interface TrainingRequest {
  model_type: 'price_predictor' | 'signal_classifier' | 'regime_detector';
  X: number[][][] | number[][];
  y?: number[];
  epochs?: number;
  batch_size?: number;
}

export interface TrainingResponse {
  status: 'trained' | 'failed';
  model_type: string;
  history?: {
    loss: number[];
    val_loss?: number[];
    epochs_trained: number;
  };
}

export interface ModelInfo {
  name: string;
  is_trained: boolean;
  metrics: Record<string, unknown> | null;
}

export interface MLServiceHealth {
  status: 'healthy' | 'unhealthy';
  service: string;
  models_loaded: Record<string, boolean>;
}

// =====================================================
// FEATURE ENGINEERING
// =====================================================

export interface MarketFeatures {
  // Price features
  returns_1h: number;
  returns_4h: number;
  returns_24h: number;
  
  // Volatility features
  volatility_1h: number;
  volatility_24h: number;
  atr_percent: number;
  
  // Trend features
  ema_cross: number;  // EMA12 vs EMA26
  trend_strength: number;
  adx: number;
  
  // Momentum features
  rsi: number;
  rsi_signal: number;  // -1, 0, 1
  macd: number;
  macd_signal: number;
  macd_histogram: number;
  
  // Volume features
  volume_ratio: number;
  volume_trend: number;
  obv_trend: number;
  
  // Bollinger Bands
  bb_percent: number;
  bb_width: number;
  bb_squeeze: boolean;
  
  // Market context
  funding_rate?: number;
  open_interest_change?: number;
}

/**
 * Extract features from market data for ML models
 */
export function extractFeatures(data: MarketData[]): MarketFeatures {
  if (data.length < 50) {
    return getDefaultFeatures();
  }
  
  const closes = data.map(d => d.close);
  const volumes = data.map(d => d.volume);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  
  const currentPrice = closes[closes.length - 1];
  
  // Returns
  const returns_1h = calculateReturn(closes, 1);
  const returns_4h = calculateReturn(closes, 4);
  const returns_24h = calculateReturn(closes, 24);
  
  // Volatility
  const volatility_1h = calculateVolatility(closes, 1);
  const volatility_24h = calculateVolatility(closes, 24);
  const atr = calculateATR(highs, lows, closes, 14);
  const atr_percent = atr / currentPrice;
  
  // Trend
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const ema_cross = ema12 > ema26 ? 1 : ema12 < ema26 ? -1 : 0;
  const trend_strength = (ema12 - ema26) / ema26;
  const adx = calculateADX(highs, lows, closes, 14);
  
  // Momentum
  const rsi = calculateRSI(closes, 14);
  const rsi_signal = rsi < 30 ? 1 : rsi > 70 ? -1 : 0;
  const macd = calculateMACD(closes);
  
  // Volume
  const currentVolume = volumes[volumes.length - 1];
  const avgVolume = volumes.slice(-24).reduce((a, b) => a + b, 0) / 24;
  const volume_ratio = currentVolume / avgVolume;
  const volume_trend = calculateTrend(volumes.slice(-24));
  const obv = calculateOBV(closes, volumes);
  const obv_trend = calculateTrend(obv.slice(-24));
  
  // Bollinger
  const bb = calculateBollingerBands(closes, 20);
  const bb_percent = (currentPrice - bb.lower) / (bb.upper - bb.lower);
  const bb_width = (bb.upper - bb.lower) / bb.middle;
  const bb_squeeze = bb_width < 0.04;
  
  return {
    returns_1h,
    returns_4h,
    returns_24h,
    volatility_1h,
    volatility_24h,
    atr_percent,
    ema_cross,
    trend_strength,
    adx,
    rsi,
    rsi_signal,
    macd: macd.macd,
    macd_signal: macd.signal,
    macd_histogram: macd.histogram,
    volume_ratio,
    volume_trend,
    obv_trend,
    bb_percent,
    bb_width,
    bb_squeeze,
  };
}

/**
 * Convert features to array for ML model input
 */
export function featuresToArray(features: MarketFeatures): number[] {
  return [
    features.returns_1h,
    features.returns_4h,
    features.returns_24h,
    features.volatility_1h,
    features.volatility_24h,
    features.atr_percent,
    features.ema_cross,
    features.trend_strength,
    features.adx,
    features.rsi,
    features.rsi_signal,
    features.macd,
    features.macd_signal,
    features.macd_histogram,
    features.volume_ratio,
    features.volume_trend,
    features.obv_trend,
    features.bb_percent,
    features.bb_width,
    features.funding_rate || 0,
    features.open_interest_change || 0,
  ];
}

/**
 * Prepare sequence data for LSTM model
 */
export function prepareSequenceData(
  data: MarketData[],
  sequenceLength: number = 60
): number[][][] {
  if (data.length < sequenceLength) {
    return [];
  }
  
  const sequences: number[][][] = [];
  
  for (let i = sequenceLength; i <= data.length; i++) {
    const window = data.slice(i - sequenceLength, i);
    const sequence: number[][] = window.map(d => [
      // Normalize features
      (d.close - d.open) / d.open,  // body ratio
      (d.high - d.low) / d.close,   // range ratio
      (d.close - d.open) / (d.high - d.low + 0.0001),  // close position
      d.volume,  // volume
      (d.high - Math.max(d.open, d.close)) / (d.high - d.low + 0.0001),  // upper wick
      (Math.min(d.open, d.close) - d.low) / (d.high - d.low + 0.0001),  // lower wick
    ]);
    sequences.push(sequence);
  }
  
  return sequences;
}

// =====================================================
// ML SERVICE CLIENT
// =====================================================

export class MLServiceClient {
  private baseUrl: string;
  private timeout: number;
  private retryCount: number = 3;
  private isHealthy: boolean = false;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || ML_SERVICE_URL;
    this.timeout = ML_SERVICE_TIMEOUT;
    
    // Start periodic health checks
    this.startHealthMonitoring();
  }
  
  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    // Initial health check
    this.healthCheck().then(healthy => {
      this.isHealthy = healthy;
    });
    
    // Periodic checks
    this.healthCheckInterval = setInterval(async () => {
      try {
        this.isHealthy = await this.healthCheck();
        this.lastHealthCheck = new Date();
      } catch {
        this.isHealthy = false;
      }
    }, HEALTH_CHECK_INTERVAL);
  }
  
  /**
   * Check if ML service is healthy
   */
  isServiceHealthy(): boolean {
    return this.isHealthy;
  }
  
  /**
   * Get last health check time
   */
  getLastHealthCheck(): Date | null {
    return this.lastHealthCheck;
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
  
  /**
   * Check ML service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/health`, {
        method: 'GET',
      }, 5000); // 5 second timeout for health check
      
      if (!response.ok) {
        this.isHealthy = false;
        return false;
      }
      
      const data = await response.json();
      this.isHealthy = data.status === 'healthy';
      this.lastHealthCheck = new Date();
      return this.isHealthy;
    } catch (error) {
      console.error('[ML Service] Health check failed:', error);
      this.isHealthy = false;
      return false;
    }
  }
  
  /**
   * Get detailed health status
   */
  async getHealthStatus(): Promise<MLServiceHealth> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/health`, {
        method: 'GET',
      }, 5000);
      
      if (!response.ok) {
        return {
          status: 'unhealthy',
          service: 'ml-service',
          models_loaded: {},
        };
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ML Service] Health status check failed:', error);
      return {
        status: 'unhealthy',
        service: 'ml-service',
        models_loaded: {},
      };
    }
  }
  
  /**
   * Predict price changes (24h forecast)
   * Uses LSTM model for multi-step predictions
   */
  async predictPrice(request: MLPredictionRequest): Promise<MLPredictionResponse> {
    // Check if service is healthy
    if (!this.isHealthy) {
      // Try health check once
      const healthy = await this.healthCheck();
      if (!healthy) {
        throw new Error('ML Service unavailable - using fallback mode');
      }
    }
    
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/predict/price`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }
      );
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Price prediction failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ML Service] Price prediction failed:', error);
      throw error;
    }
  }
  
  /**
   * Classify trading signal (BUY/SELL/HOLD)
   */
  async classifySignal(request: SignalClassificationRequest): Promise<SignalClassificationResponse> {
    if (!this.isHealthy) {
      const healthy = await this.healthCheck();
      if (!healthy) {
        throw new Error('ML Service unavailable - using fallback mode');
      }
    }
    
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/predict/signal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }
      );
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Signal classification failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ML Service] Signal classification failed:', error);
      throw error;
    }
  }
  
  /**
   * Detect market regime (BULL/BEAR/SIDEWAYS)
   * Uses Hidden Markov Model for regime detection
   */
  async detectRegime(request: RegimeDetectionRequest): Promise<RegimeDetectionResponse> {
    if (!this.isHealthy) {
      const healthy = await this.healthCheck();
      if (!healthy) {
        throw new Error('ML Service unavailable - using fallback mode');
      }
    }
    
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/predict/regime`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }
      );
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Regime detection failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ML Service] Regime detection failed:', error);
      throw error;
    }
  }
  
  /**
   * Train a model
   */
  async trainModel(request: TrainingRequest): Promise<TrainingResponse> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/train`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
        300000  // 5 minutes for training
      );
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Training failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ML Service] Training failed:', error);
      throw error;
    }
  }
  
  /**
   * Get list of models
   */
  async getModels(): Promise<{ models: ModelInfo[] }> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/models`,
        { method: 'GET' }
      );
      
      if (!response.ok) {
        throw new Error('Failed to get models');
      }
      
      return await response.json();
    } catch (error) {
      console.error('[ML Service] Get models failed:', error);
      return { models: [] };
    }
  }
  
  /**
   * Fetch with timeout and retry
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number = this.timeout
  ): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.retryCount - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    
    throw lastError || new Error('Fetch failed');
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getDefaultFeatures(): MarketFeatures {
  return {
    returns_1h: 0,
    returns_4h: 0,
    returns_24h: 0,
    volatility_1h: 0,
    volatility_24h: 0,
    atr_percent: 0,
    ema_cross: 0,
    trend_strength: 0,
    adx: 0,
    rsi: 50,
    rsi_signal: 0,
    macd: 0,
    macd_signal: 0,
    macd_histogram: 0,
    volume_ratio: 1,
    volume_trend: 0,
    obv_trend: 0,
    bb_percent: 0.5,
    bb_width: 0.05,
    bb_squeeze: false,
  };
}

function calculateReturn(prices: number[], lookback: number): number {
  if (prices.length <= lookback) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - lookback];
  return (current - past) / past;
}

function calculateVolatility(prices: number[], lookback: number): number {
  if (prices.length <= lookback) return 0;
  
  const returns: number[] = [];
  for (let i = prices.length - lookback; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
  if (closes.length < period + 1) return 0;
  
  const trValues: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trValues.push(tr);
  }
  
  return trValues.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(prices: number[], span: number): number {
  if (prices.length === 0) return 0;
  
  const multiplier = 2 / (span + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateADX(highs: number[], lows: number[], closes: number[], period: number): number {
  if (closes.length < period * 2) return 0;
  
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trValues: number[] = [];
  
  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    
    trValues.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  
  const smoothPlusDM = plusDM.slice(-period).reduce((a, b) => a + b, 0) / period;
  const smoothMinusDM = minusDM.slice(-period).reduce((a, b) => a + b, 0) / period;
  const smoothTR = trValues.slice(-period).reduce((a, b) => a + b, 0) / period;
  
  const plusDI = (smoothPlusDM / smoothTR) * 100;
  const minusDI = (smoothMinusDM / smoothTR) * 100;
  
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  
  return dx;
}

interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

function calculateMACD(prices: number[]): MACDResult {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  
  // Calculate signal line (9-period EMA of MACD)
  const macdHistory: number[] = [];
  for (let i = 26; i <= prices.length; i++) {
    const e12 = calculateEMA(prices.slice(0, i), 12);
    const e26 = calculateEMA(prices.slice(0, i), 26);
    macdHistory.push(e12 - e26);
  }
  
  const signal = macdHistory.length >= 9 ? calculateEMA(macdHistory, 9) : 0;
  const histogram = macd - signal;
  
  return { macd, signal, histogram };
}

function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;
  
  let upTrend = 0;
  let downTrend = 0;
  
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) upTrend++;
    else if (values[i] < values[i - 1]) downTrend++;
  }
  
  return (upTrend - downTrend) / (values.length - 1);
}

function calculateOBV(closes: number[], volumes: number[]): number[] {
  const obv: number[] = [0];
  
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv.push(obv[i - 1] + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      obv.push(obv[i - 1] - volumes[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  
  return obv;
}

interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
}

function calculateBollingerBands(prices: number[], period: number): BollingerBands {
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  return {
    upper: middle + 2 * std,
    middle,
    lower: middle - 2 * std,
  };
}

// =====================================================
// SINGLETON
// =====================================================

let mlClient: MLServiceClient | null = null;

export function getMLServiceClient(): MLServiceClient {
  if (!mlClient) {
    mlClient = new MLServiceClient();
  }
  return mlClient;
}

export default MLServiceClient;
