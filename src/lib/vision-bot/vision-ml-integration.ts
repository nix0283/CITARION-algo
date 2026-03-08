/**
 * Vision Bot Enhanced - ML Integration with Real Data
 * 
 * Production-ready Vision Bot that uses:
 * - Real market data from exchanges (not synthetic)
 * - ML Service for predictions (Python microservice)
 * - Feature engineering for ML models
 * - Model persistence and training data collection
 */

import type {
  VisionBotConfig,
  VisionBotStatus,
  MarketForecast,
  ForecastSignal,
  MarketData,
} from './types';
import { getRealDataProvider, validateMarketData } from './real-data-provider';
import {
  getMLServiceClient,
  extractFeatures,
  featuresToArray,
  prepareSequenceData,
  type MarketFeatures,
  type MLServiceHealth,
  type RegimeDetectionResponse,
  type SignalClassificationResponse,
} from './ml-service-client';
import { ForecastService, MarketAnalyzer } from './forecast-service';
import { db } from '@/lib/db';

// =====================================================
// TYPES
// =====================================================

export interface EnhancedForecast {
  // Basic forecast
  signal: ForecastSignal;
  confidence: number;
  direction: 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION';
  
  // Probabilities
  probabilities: {
    upward: number;
    downward: number;
    consolidation: number;
  };
  
  // ML predictions
  mlSignal?: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
  };
  
  mlRegime?: {
    regime: 'BULL' | 'BEAR' | 'SIDEWAYS';
    confidence: number;
  };
  
  mlPricePrediction?: {
    predictedChange: number;
    confidence: number;
  };
  
  // Features used
  features: MarketFeatures;
  
  // Metadata
  symbol: string;
  timestamp: Date;
  dataPoints: number;
  exchange: string;
  mlServiceAvailable: boolean;
}

export interface TrainingDataRecord {
  id: string;
  symbol: string;
  timestamp: Date;
  features: number[];
  signal: ForecastSignal;
  confidence: number;
  actualOutcome?: number;  // Actual price change after 24h
  wasCorrect?: boolean;
  feedbackReceived: boolean;
}

export interface VisionMLConfig {
  useRealData: boolean;
  useMLService: boolean;
  collectTrainingData: boolean;
  minDataPoints: number;
  forecastIntervalMs: number;
  feedbackDelayMs: number;  // Time to wait for actual outcome
}

// =====================================================
// DEFAULT CONFIG
// =====================================================

const DEFAULT_VISION_ML_CONFIG: VisionMLConfig = {
  useRealData: true,
  useMLService: true,
  collectTrainingData: true,
  minDataPoints: 50,
  forecastIntervalMs: 60 * 60 * 1000,  // 1 hour
  feedbackDelayMs: 24 * 60 * 60 * 1000,  // 24 hours
};

// =====================================================
// ENHANCED VISION BOT WORKER
// =====================================================

export class EnhancedVisionBotWorker {
  private id: string;
  private config: VisionBotConfig;
  private mlConfig: VisionMLConfig;
  private status: VisionBotStatus;
  private dataProvider = getRealDataProvider();
  private mlClient = getMLServiceClient();
  private forecastService: ForecastService;
  private legacyAnalyzer: MarketAnalyzer;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private mlHealthy = false;
  private lastHealthCheck: Date | null = null;
  
  constructor(
    config: VisionBotConfig,
    mlConfig: Partial<VisionMLConfig> = {}
  ) {
    this.id = config.id;
    this.config = config;
    this.mlConfig = { ...DEFAULT_VISION_ML_CONFIG, ...mlConfig };
    this.forecastService = new ForecastService();
    this.legacyAnalyzer = new MarketAnalyzer(config);
    
    this.status = {
      id: this.id,
      isRunning: false,
      currentSignal: 'NEUTRAL',
      equity: config.initialCapital,
      trades: [],
      totalReturn: 0,
      winRate: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
    };
  }
  
  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    console.log(`[Vision ${this.id}] Initializing...`);
    
    // Check ML service health
    await this.checkMLHealth();
    
    // Pre-fetch data for configured symbols
    if (this.mlConfig.useRealData) {
      const symbols = this.config.cryptoSymbols.slice(0, 3);
      console.log(`[Vision ${this.id}] Pre-fetching data for ${symbols.join(', ')}...`);
      
      for (const symbol of symbols) {
        try {
          const result = await this.dataProvider.fetchMarketData(
            symbol,
            this.config.timeframe,
            this.config.lookbackDays
          );
          console.log(`[Vision ${this.id}] Fetched ${result.data.length} candles for ${symbol} from ${result.exchange}`);
        } catch (error) {
          console.error(`[Vision ${this.id}] Failed to fetch data for ${symbol}:`, error);
        }
      }
    }
    
    console.log(`[Vision ${this.id}] Initialization complete. ML Service: ${this.mlHealthy ? 'Available' : 'Unavailable'}`);
  }
  
  /**
   * Check ML service health
   */
  async checkMLHealth(): Promise<boolean> {
    try {
      const health = await this.mlClient.healthCheck();
      this.mlHealthy = health.status === 'healthy';
      this.lastHealthCheck = new Date();
      
      if (this.mlHealthy) {
        console.log(`[Vision ${this.id}] ML Service healthy:`, health.models_loaded);
      } else {
        console.warn(`[Vision ${this.id}] ML Service unhealthy`);
      }
      
      return this.mlHealthy;
    } catch (error) {
      console.warn(`[Vision ${this.id}] ML Service check failed:`, error);
      this.mlHealthy = false;
      return false;
    }
  }
  
  /**
   * Run enhanced forecast cycle
   */
  async runForecast(): Promise<EnhancedForecast | null> {
    const symbol = this.config.cryptoSymbols[0];
    console.log(`[Vision ${this.id}] Running forecast for ${symbol}...`);
    
    try {
      // Fetch real market data
      let marketData: MarketData[];
      let exchange = 'binance';
      
      if (this.mlConfig.useRealData) {
        const result = await this.dataProvider.fetchMarketData(
          symbol,
          this.config.timeframe,
          this.config.lookbackDays
        );
        marketData = result.data;
        exchange = result.exchange;
      } else {
        // Fallback to legacy synthetic data
        marketData = this.generateSyntheticData(30);
      }
      
      // Validate data
      const validation = validateMarketData(marketData);
      if (!validation.valid) {
        console.warn(`[Vision ${this.id}] Data validation issues:`, validation.issues);
      }
      
      if (marketData.length < this.mlConfig.minDataPoints) {
        console.error(`[Vision ${this.id}] Insufficient data: ${marketData.length} < ${this.mlConfig.minDataPoints}`);
        return null;
      }
      
      // Extract features
      const features = extractFeatures(marketData);
      
      // Generate base forecast using legacy method
      this.legacyAnalyzer.addData(symbol, marketData);
      const baseForecast = this.legacyAnalyzer.generateForecast(symbol);
      
      // Initialize enhanced forecast
      const enhancedForecast: EnhancedForecast = {
        signal: baseForecast.signal,
        confidence: baseForecast.confidence,
        direction: this.getDirection(baseForecast.probabilities),
        probabilities: baseForecast.probabilities,
        features,
        symbol,
        timestamp: new Date(),
        dataPoints: marketData.length,
        exchange,
        mlServiceAvailable: this.mlHealthy,
      };
      
      // Get ML predictions if service is available
      if (this.mlHealthy && this.mlConfig.useMLService) {
        try {
          // Signal classification
          const featureArray = featuresToArray(features);
          const signalResult = await this.mlClient.classifySignal({
            features: [featureArray],
          });
          
          if (signalResult.signals.length > 0) {
            enhancedForecast.mlSignal = {
              signal: signalResult.signals[0].signal,
              confidence: signalResult.signals[0].confidence,
            };
          }
          
          // Regime detection
          const regimeFeatures = [
            features.returns_24h,
            features.volatility_24h,
            features.volume_trend,
          ];
          const regimeResult = await this.mlClient.detectRegime({
            observations: [regimeFeatures],
          });
          
          enhancedForecast.mlRegime = {
            regime: regimeResult.regime,
            confidence: regimeResult.confidence,
          };
          
          // Price prediction
          const sequences = prepareSequenceData(marketData.slice(-60), 60);
          if (sequences.length > 0) {
            const priceResult = await this.mlClient.predictPrice({
              features: [sequences[sequences.length - 1]],
              returnConfidence: true,
            });
            
            if (priceResult.predictions.length > 0) {
              enhancedForecast.mlPricePrediction = {
                predictedChange: priceResult.predictions[0][0],
                confidence: priceResult.confidence_intervals 
                  ? 1 - priceResult.confidence_intervals.std[0][0] 
                  : 0.5,
              };
            }
          }
          
          // Combine predictions
          enhancedForecast.signal = this.combinePredictions(
            baseForecast.signal,
            enhancedForecast.mlSignal,
            enhancedForecast.mlRegime
          );
          
          enhancedForecast.confidence = this.adjustConfidence(
            baseForecast.confidence,
            enhancedForecast.mlSignal,
            enhancedForecast.mlRegime
          );
          
        } catch (error) {
          console.error(`[Vision ${this.id}] ML prediction failed:`, error);
          enhancedForecast.mlServiceAvailable = false;
        }
      }
      
      // Collect training data
      if (this.mlConfig.collectTrainingData) {
        await this.recordTrainingData(symbol, features, enhancedForecast);
      }
      
      // Update status
      this.status.currentSignal = enhancedForecast.signal;
      this.status.lastForecastTime = new Date();
      
      console.log(`[Vision ${this.id}] Forecast: ${enhancedForecast.signal} (${(enhancedForecast.confidence * 100).toFixed(0)}% confidence)`);
      if (enhancedForecast.mlRegime) {
        console.log(`[Vision ${this.id}] ML Regime: ${enhancedForecast.mlRegime.regime} (${(enhancedForecast.mlRegime.confidence * 100).toFixed(0)}%)`);
      }
      
      return enhancedForecast;
      
    } catch (error) {
      console.error(`[Vision ${this.id}] Forecast failed:`, error);
      return null;
    }
  }
  
  /**
   * Start the bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[Vision ${this.id}] Already running`);
      return;
    }
    
    await this.initialize();
    this.isRunning = true;
    this.status.isRunning = true;
    
    // Run initial forecast
    await this.runForecast();
    
    // Set up interval for regular forecasts
    this.intervalId = setInterval(
      () => this.runForecast(),
      this.mlConfig.forecastIntervalMs
    );
    
    console.log(`[Vision ${this.id}] Started with ${this.mlConfig.forecastIntervalMs / 60000}min interval`);
  }
  
  /**
   * Stop the bot
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    this.status.isRunning = false;
    
    console.log(`[Vision ${this.id}] Stopped`);
  }
  
  /**
   * Get current status
   */
  getStatus(): VisionBotStatus {
    return { ...this.status };
  }
  
  /**
   * Get ML health status
   */
  getMLStatus(): { healthy: boolean; lastCheck: Date | null } {
    return {
      healthy: this.mlHealthy,
      lastCheck: this.lastHealthCheck,
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<VisionBotConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart if interval changed
    if (newConfig.forecastIntervalMinutes && this.isRunning) {
      this.stop();
      this.start();
    }
  }
  
  // =====================================================
  // PRIVATE METHODS
  // =====================================================
  
  private getDirection(probs: { upward: number; downward: number; consolidation: number }): 'UPWARD' | 'DOWNWARD' | 'CONSOLIDATION' {
    if (probs.upward > probs.downward && probs.upward > probs.consolidation) {
      return 'UPWARD';
    }
    if (probs.downward > probs.upward && probs.downward > probs.consolidation) {
      return 'DOWNWARD';
    }
    return 'CONSOLIDATION';
  }
  
  private combinePredictions(
    baseSignal: ForecastSignal,
    mlSignal?: { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number },
    mlRegime?: { regime: 'BULL' | 'BEAR' | 'SIDEWAYS'; confidence: number }
  ): ForecastSignal {
    if (!mlSignal || !mlRegime) {
      return baseSignal;
    }
    
    // Weight signals
    const baseWeight = 0.3;
    const mlSignalWeight = 0.4;
    const mlRegimeWeight = 0.3;
    
    // Convert to numeric scores
    const baseScore = baseSignal === 'LONG' ? 1 : baseSignal === 'SHORT' ? -1 : 0;
    const mlScore = mlSignal.signal === 'BUY' ? 1 : mlSignal.signal === 'SELL' ? -1 : 0;
    const regimeScore = mlRegime.regime === 'BULL' ? 1 : mlRegime.regime === 'BEAR' ? -1 : 0;
    
    // Weighted combination
    const combined = 
      baseScore * baseWeight +
      mlScore * mlSignalWeight * mlSignal.confidence +
      regimeScore * mlRegimeWeight * mlRegime.confidence;
    
    // Convert back to signal
    if (combined > 0.3) return 'LONG';
    if (combined < -0.3) return 'SHORT';
    return 'NEUTRAL';
  }
  
  private adjustConfidence(
    baseConfidence: number,
    mlSignal?: { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number },
    mlRegime?: { regime: 'BULL' | 'BEAR' | 'SIDEWAYS'; confidence: number }
  ): number {
    if (!mlSignal || !mlRegime) {
      return baseConfidence;
    }
    
    // Adjust confidence based on ML agreement
    const mlAgreement = (mlSignal.confidence + mlRegime.confidence) / 2;
    
    // Weighted average
    return baseConfidence * 0.4 + mlAgreement * 0.6;
  }
  
  private async recordTrainingData(
    symbol: string,
    features: MarketFeatures,
    forecast: EnhancedForecast
  ): Promise<void> {
    try {
      const featureArray = featuresToArray(features);
      
      // Store in database for later training
      await db.visionTrainingData.create({
        data: {
          id: `${symbol}-${Date.now()}`,
          symbol,
          timestamp: new Date(),
          features: JSON.stringify(featureArray),
          signal: forecast.signal,
          confidence: forecast.confidence,
          actualOutcome: null,
          wasCorrect: null,
          feedbackReceived: false,
        },
      });
    } catch (error) {
      // Log but don't fail
      console.warn(`[Vision ${this.id}] Failed to record training data:`, error);
    }
  }
  
  private generateSyntheticData(days: number): MarketData[] {
    // Legacy fallback for when real data is not available
    const data: MarketData[] = [];
    const hours = days * 24;
    let price = 50000;
    const now = new Date();
    
    for (let i = hours; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      const volatility = 0.02;
      
      const change = (Math.random() - 0.5) * 2 * volatility * price;
      price = Math.max(price + change, 1);
      
      const high = price * (1 + Math.random() * volatility * 0.5);
      const low = price * (1 - Math.random() * volatility * 0.5);
      const open = low + Math.random() * (high - low);
      const close = low + Math.random() * (high - low);
      const volume = 1000 + Math.random() * 9000;
      
      data.push({
        symbol: 'SYNTHETIC',
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      });
    }
    
    return data;
  }
}

// =====================================================
// TRAINING DATA FEEDBACK SERVICE
// =====================================================

export class TrainingFeedbackService {
  private dataProvider = getRealDataProvider();
  
  /**
   * Update training data with actual outcomes
   */
  async updateOutcomes(symbol: string): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    // Get records without feedback
    const records = await db.visionTrainingData.findMany({
      where: {
        symbol,
        timestamp: { lte: cutoff },
        feedbackReceived: false,
      },
    });
    
    let updated = 0;
    
    for (const record of records) {
      try {
        // Fetch actual price 24h after the forecast
        const forecastTime = record.timestamp;
        const actualTime = new Date(forecastTime.getTime() + 24 * 60 * 60 * 1000);
        
        // Get price at forecast time and actual time
        const data = await this.dataProvider.fetchMarketData(symbol, '1h', 25);
        
        if (data.data.length < 25) continue;
        
        // Find candles closest to our times
        const forecastCandle = data.data.find(c => 
          Math.abs(c.timestamp.getTime() - forecastTime.getTime()) < 60 * 60 * 1000
        );
        const actualCandle = data.data.find(c =>
          Math.abs(c.timestamp.getTime() - actualTime.getTime()) < 60 * 60 * 1000
        );
        
        if (!forecastCandle || !actualCandle) continue;
        
        // Calculate actual outcome
        const actualOutcome = (actualCandle.close - forecastCandle.close) / forecastCandle.close;
        
        // Determine if forecast was correct
        const signal = record.signal as ForecastSignal;
        let wasCorrect = false;
        
        if (signal === 'LONG' && actualOutcome > 0.005) wasCorrect = true;
        else if (signal === 'SHORT' && actualOutcome < -0.005) wasCorrect = true;
        else if (signal === 'NEUTRAL' && Math.abs(actualOutcome) < 0.01) wasCorrect = true;
        
        // Update record
        await db.visionTrainingData.update({
          where: { id: record.id },
          data: {
            actualOutcome,
            wasCorrect,
            feedbackReceived: true,
          },
        });
        
        updated++;
      } catch (error) {
        console.warn(`[Feedback] Failed to update record ${record.id}:`, error);
      }
    }
    
    return updated;
  }
  
  /**
   * Get training statistics
   */
  async getStats(symbol?: string): Promise<{
    total: number;
    withFeedback: number;
    accuracy: number;
    bySignal: Record<ForecastSignal, { total: number; correct: number }>;
  }> {
    const where = symbol ? { symbol } : {};
    
    const total = await db.visionTrainingData.count({ where });
    const withFeedback = await db.visionTrainingData.count({
      where: { ...where, feedbackReceived: true },
    });
    
    const correct = await db.visionTrainingData.count({
      where: { ...where, feedbackReceived: true, wasCorrect: true },
    });
    
    // By signal stats
    const bySignal: Record<ForecastSignal, { total: number; correct: number }> = {
      LONG: { total: 0, correct: 0 },
      SHORT: { total: 0, correct: 0 },
      NEUTRAL: { total: 0, correct: 0 },
    };
    
    for (const signal of ['LONG', 'SHORT', 'NEUTRAL'] as ForecastSignal[]) {
      bySignal[signal].total = await db.visionTrainingData.count({
        where: { ...where, signal, feedbackReceived: true },
      });
      bySignal[signal].correct = await db.visionTrainingData.count({
        where: { ...where, signal, feedbackReceived: true, wasCorrect: true },
      });
    }
    
    return {
      total,
      withFeedback,
      accuracy: withFeedback > 0 ? correct / withFeedback : 0,
      bySignal,
    };
  }
  
  /**
   * Export training data for model training
   */
  async exportTrainingData(symbol?: string): Promise<{
    X: number[][];
    y: number[];
  }> {
    const where = {
      ...(symbol ? { symbol } : {}),
      feedbackReceived: true,
    };
    
    const records = await db.visionTrainingData.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });
    
    const X: number[][] = [];
    const y: number[] = [];
    
    for (const record of records) {
      if (record.actualOutcome === null) continue;
      
      X.push(JSON.parse(record.features as string));
      y.push(record.actualOutcome);
    }
    
    return { X, y };
  }
}

// =====================================================
// SINGLETON MANAGER
// =====================================================

class EnhancedVisionManager {
  private workers: Map<string, EnhancedVisionBotWorker> = new Map();
  private feedbackService: TrainingFeedbackService = new TrainingFeedbackService();
  
  async createBot(
    config: VisionBotConfig,
    mlConfig: Partial<VisionMLConfig> = {}
  ): Promise<EnhancedVisionBotWorker> {
    if (this.workers.has(config.id)) {
      throw new Error(`Vision bot ${config.id} already exists`);
    }
    
    const worker = new EnhancedVisionBotWorker(config, mlConfig);
    this.workers.set(config.id, worker);
    
    return worker;
  }
  
  getBot(id: string): EnhancedVisionBotWorker | undefined {
    return this.workers.get(id);
  }
  
  async startBot(id: string): Promise<void> {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new Error(`Vision bot ${id} not found`);
    }
    
    await worker.start();
  }
  
  stopBot(id: string): void {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new Error(`Vision bot ${id} not found`);
    }
    
    worker.stop();
  }
  
  removeBot(id: string): void {
    const worker = this.workers.get(id);
    if (worker) {
      worker.stop();
      this.workers.delete(id);
    }
  }
  
  getAllStatuses(): VisionBotStatus[] {
    return Array.from(this.workers.values()).map(w => w.getStatus());
  }
  
  stopAll(): void {
    for (const worker of this.workers.values()) {
      worker.stop();
    }
  }
  
  getFeedbackService(): TrainingFeedbackService {
    return this.feedbackService;
  }
}

let enhancedManager: EnhancedVisionManager | null = null;

export function getEnhancedVisionManager(): EnhancedVisionManager {
  if (!enhancedManager) {
    enhancedManager = new EnhancedVisionManager();
  }
  return enhancedManager;
}

export default EnhancedVisionBotWorker;
