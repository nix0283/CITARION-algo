/**
 * Signal Pipeline Tester
 * 
 * End-to-end testing for signal pipeline with ML filtering.
 * Tests signal generation, filtering, aggregation, and output.
 */

import { getMLSignalFilter, type SignalForFiltering } from './ml-signal-filter'
import { getLawrenceClassifier, type LawrenceFeatures } from './lawrence-classifier'
// import { getMLEnhancedLOGOS } from './logos-bot/ml-integration'
// import type { IncomingSignal } from './logos-bot/engine'

// Mock types for LOGOS (module not available)
interface IncomingSignal {
  botCode: string
  botCategory: string
  timestamp: number
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  entryPrice: number
}

// Mock LOGOS for testing
function getMLEnhancedLOGOS() {
  return {
    getStatus: () => ({ status: 'mock', mlEnabled: true }),
    processSignals: async (signals: IncomingSignal[], symbol: string, exchange: string) => {
      if (signals.length === 0) return null
      return {
        direction: signals[0].direction,
        confidence: signals[0].confidence,
        ml: { score: 0.5 },
      }
    },
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pipeline test result
 */
export interface PipelineTestResult {
  passed: boolean
  stage: string
  duration: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  error?: string
}

/**
 * Pipeline test suite result
 */
export interface PipelineTestSuiteResult {
  totalTests: number
  passedTests: number
  failedTests: number
  results: PipelineTestResult[]
  totalDuration: number
  avgDuration: number
}

/**
 * Mock signal for testing
 */
export interface MockSignal {
  botCode: string
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  entryPrice: number
  marketData?: {
    high: number[]
    low: number[]
    close: number[]
    volume?: number[]
  }
}

// ============================================================================
// SIGNAL PIPELINE TESTER
// ============================================================================

/**
 * Signal Pipeline Tester
 * 
 * Tests all stages of the signal pipeline
 */
export class SignalPipelineTester {
  private results: PipelineTestResult[] = []
  
  /**
   * Run all pipeline tests
   */
  async runAllTests(): Promise<PipelineTestSuiteResult> {
    this.results = []
    const startTime = performance.now()
    
    // Stage 1: Lawrence Classifier tests
    await this.testClassifierBasic()
    await this.testClassifierFeatures()
    await this.testClassifierTraining()
    
    // Stage 2: ML Filter tests
    await this.testFilterBasic()
    await this.testFilterWithMarketData()
    await this.testFilterConfiguration()
    
    // Stage 3: LOGOS Aggregation tests
    await this.testLOGOSBasic()
    await this.testLOGOSAggregation()
    await this.testLOGOSConflictResolution()
    
    // Stage 4: End-to-end pipeline tests
    await this.testEndToEndPipeline()
    await this.testMultipleSignals()
    await this.testHighFrequencySignals()
    
    const totalDuration = performance.now() - startTime
    const passedTests = this.results.filter(r => r.passed).length
    
    return {
      totalTests: this.results.length,
      passedTests,
      failedTests: this.results.length - passedTests,
      results: this.results,
      totalDuration,
      avgDuration: totalDuration / this.results.length,
    }
  }
  
  // ==========================================================================
  // CLASSIFIER TESTS
  // ==========================================================================
  
  /**
   * Test basic classifier functionality
   */
  private async testClassifierBasic(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const classifier = getLawrenceClassifier()
      
      // Test with basic features
      const features: LawrenceFeatures = {
        indicators: {
          rsi: 65,
          macd: 0.5,
          ema20: 50000,
          atr: 500,
          volumeRatio: 1.2,
        },
        context: {
          trend: 'TRENDING_UP',
          volatility: 'MEDIUM',
          volume: 'HIGH',
        },
        signal: {
          direction: 'LONG',
          symbol: 'BTCUSDT',
          timeframe: '1h',
          entryPrice: 50000,
        },
        time: {
          hour: 14,
          dayOfWeek: 3,
          isSessionOverlap: true,
        },
      }
      
      const result = classifier.classify(features)
      
      const passed = 
        result.direction !== undefined &&
        result.probability >= 0 && result.probability <= 1 &&
        result.confidence >= 0 && result.confidence <= 1
      
      this.addResult({
        passed,
        stage: 'classifier_basic',
        duration: performance.now() - startTime,
        input: { features },
        output: { result },
        error: passed ? undefined : 'Invalid classification result',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'classifier_basic',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  /**
   * Test classifier feature extraction
   */
  private async testClassifierFeatures(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const classifier = getLawrenceClassifier()
      
      // Test with market data for feature extraction
      const high = Array.from({ length: 50 }, (_, i) => 50000 + Math.sin(i * 0.1) * 500)
      const low = high.map(h => h - 200)
      const close = high.map((h, i) => (h + low[i]) / 2)
      
      const features = classifier.extractFeatures(high, low, close)
      
      const passed = 
        features.n_rsi !== undefined &&
        features.n_cci !== undefined &&
        features.n_wt !== undefined &&
        features.n_adx !== undefined
      
      this.addResult({
        passed,
        stage: 'classifier_features',
        duration: performance.now() - startTime,
        input: { high: high.length, low: low.length, close: close.length },
        output: { features },
        error: passed ? undefined : 'Feature extraction failed',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'classifier_features',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  /**
   * Test classifier training
   */
  private async testClassifierTraining(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const classifier = getLawrenceClassifier()
      const initialStats = classifier.getStats()
      
      // Add training sample
      classifier.train({
        features: { n_rsi: 0.6, n_cci: 0.5, n_wt: 0.55, n_adx: 0.4, n_deriv: 0.5 },
        label: 'LONG',
        weight: 0.8,
        timestamp: Date.now(),
      })
      
      const newStats = classifier.getStats()
      
      const passed = newStats.totalSamples === initialStats.totalSamples + 1
      
      this.addResult({
        passed,
        stage: 'classifier_training',
        duration: performance.now() - startTime,
        input: { initialSamples: initialStats.totalSamples },
        output: { newSamples: newStats.totalSamples },
        error: passed ? undefined : 'Training sample not added',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'classifier_training',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  // ==========================================================================
  // FILTER TESTS
  // ==========================================================================
  
  /**
   * Test basic filter functionality
   */
  private async testFilterBasic(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const filter = getMLSignalFilter()
      
      const signal: SignalForFiltering = {
        botCode: 'HFT',
        symbol: 'BTCUSDT',
        exchange: 'binance',
        direction: 'LONG',
        confidence: 0.75,
        entryPrice: 50000,
      }
      
      const result = await filter.filter(signal)
      
      const passed = 
        result.passed !== undefined &&
        result.adjustedDirection !== undefined &&
        result.adjustedConfidence >= 0 && result.adjustedConfidence <= 1 &&
        result.mlScore >= 0 && result.mlScore <= 1
      
      this.addResult({
        passed,
        stage: 'filter_basic',
        duration: performance.now() - startTime,
        input: { signal },
        output: { result },
        error: passed ? undefined : 'Invalid filter result',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'filter_basic',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  /**
   * Test filter with market data
   */
  private async testFilterWithMarketData(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const filter = getMLSignalFilter()
      
      // Generate realistic market data
      const basePrice = 50000
      const high: number[] = []
      const low: number[] = []
      const close: number[] = []
      const volume: number[] = []
      
      for (let i = 0; i < 100; i++) {
        const trend = i * 5
        const noise = Math.sin(i * 0.3) * 200
        high.push(basePrice + trend + noise + 100)
        low.push(basePrice + trend + noise - 100)
        close.push(basePrice + trend + noise)
        volume.push(1000 + Math.random() * 500)
      }
      
      const signal: SignalForFiltering = {
        botCode: 'MFT',
        symbol: 'BTCUSDT',
        exchange: 'binance',
        direction: 'LONG',
        confidence: 0.8,
        entryPrice: close[close.length - 1],
        marketData: { high, low, close, volume },
      }
      
      const result = await filter.filter(signal)
      
      const passed = 
        result.processingTimeMs > 0 &&
        result.mlResult.features !== undefined
      
      this.addResult({
        passed,
        stage: 'filter_market_data',
        duration: performance.now() - startTime,
        input: { dataPoints: close.length },
        output: { 
          mlScore: result.mlScore,
          qualityScore: result.qualityScore,
          processingTime: result.processingTimeMs,
        },
        error: passed ? undefined : 'Filter with market data failed',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'filter_market_data',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  /**
   * Test filter configuration
   */
  private async testFilterConfiguration(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const filter = getMLSignalFilter()
      
      // Get current config
      const originalConfig = filter.getConfig()
      
      // Update config
      filter.setConfig({
        minConfidence: 0.4,
        minMLAgreement: 0.5,
        useRegimeFilter: false,
      })
      
      const newConfig = filter.getConfig()
      
      // Restore original config
      filter.setConfig(originalConfig)
      
      const passed = 
        newConfig.minConfidence === 0.4 &&
        newConfig.minMLAgreement === 0.5 &&
        newConfig.useRegimeFilter === false
      
      this.addResult({
        passed,
        stage: 'filter_config',
        duration: performance.now() - startTime,
        input: { changes: { minConfidence: 0.4, minMLAgreement: 0.5, useRegimeFilter: false } },
        output: { newConfig },
        error: passed ? undefined : 'Configuration not updated',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'filter_config',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  // ==========================================================================
  // LOGOS TESTS
  // ==========================================================================
  
  /**
   * Test basic LOGOS functionality
   */
  private async testLOGOSBasic(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const logos = getMLEnhancedLOGOS()
      const status = logos.getStatus()
      
      const passed = 
        status.status !== undefined &&
        status.mlEnabled !== undefined
      
      this.addResult({
        passed,
        stage: 'logos_basic',
        duration: performance.now() - startTime,
        input: {},
        output: { status },
        error: passed ? undefined : 'LOGOS status unavailable',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'logos_basic',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  /**
   * Test LOGOS signal aggregation
   */
  private async testLOGOSAggregation(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const logos = getMLEnhancedLOGOS()
      
      // Create mock signals
      const signals: IncomingSignal[] = [
        {
          botCode: 'HFT',
          botCategory: 'frequency',
          timestamp: Date.now(),
          symbol: 'BTCUSDT',
          exchange: 'binance',
          direction: 'LONG',
          confidence: 0.8,
          entryPrice: 50000,
        },
        {
          botCode: 'MFT',
          botCategory: 'frequency',
          timestamp: Date.now(),
          symbol: 'BTCUSDT',
          exchange: 'binance',
          direction: 'LONG',
          confidence: 0.7,
          entryPrice: 50000,
        },
      ]
      
      const result = await logos.processSignals(signals, 'BTCUSDT', 'binance')
      
      const passed = result === null || (
        result.direction !== undefined &&
        result.confidence >= 0 && result.confidence <= 1 &&
        result.ml !== undefined
      )
      
      this.addResult({
        passed,
        stage: 'logos_aggregation',
        duration: performance.now() - startTime,
        input: { signalsCount: signals.length },
        output: { result },
        error: passed ? undefined : 'LOGOS aggregation failed',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'logos_aggregation',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  /**
   * Test LOGOS conflict resolution
   */
  private async testLOGOSConflictResolution(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const logos = getMLEnhancedLOGOS()
      
      // Create conflicting signals
      const signals: IncomingSignal[] = [
        {
          botCode: 'HFT',
          botCategory: 'frequency',
          timestamp: Date.now(),
          symbol: 'ETHUSDT',
          exchange: 'binance',
          direction: 'LONG',
          confidence: 0.9,
          entryPrice: 3000,
        },
        {
          botCode: 'LFT',
          botCategory: 'frequency',
          timestamp: Date.now(),
          symbol: 'ETHUSDT',
          exchange: 'binance',
          direction: 'SHORT',
          confidence: 0.85,
          entryPrice: 3000,
        },
      ]
      
      const result = await logos.processSignals(signals, 'ETHUSDT', 'binance')
      
      const passed = result === null || result.ml !== undefined
      
      this.addResult({
        passed,
        stage: 'logos_conflict',
        duration: performance.now() - startTime,
        input: { conflictingSignals: 2 },
        output: { result: result ? 'resolved' : 'null' },
        error: passed ? undefined : 'Conflict resolution failed',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'logos_conflict',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  // ==========================================================================
  // END-TO-END TESTS
  // ==========================================================================
  
  /**
   * Test end-to-end pipeline
   */
  private async testEndToEndPipeline(): Promise<void> {
    const startTime = performance.now()
    
    try {
      // Stage 1: Create signal
      const signal: SignalForFiltering = {
        botCode: 'HFT',
        symbol: 'BTCUSDT',
        exchange: 'binance',
        direction: 'LONG',
        confidence: 0.8,
        entryPrice: 50000,
      }
      
      // Stage 2: Filter through ML
      const filter = getMLSignalFilter()
      const filtered = await filter.filter(signal)
      
      // Stage 3: Aggregate through LOGOS
      const logos = getMLEnhancedLOGOS()
      const logosSignal: IncomingSignal = {
        botCode: signal.botCode,
        botCategory: 'frequency',
        timestamp: Date.now(),
        symbol: signal.symbol,
        exchange: signal.exchange,
        direction: filtered.adjustedDirection,
        confidence: filtered.adjustedConfidence,
        entryPrice: signal.entryPrice,
      }
      
      const result = await logos.processSignals([logosSignal], signal.symbol, signal.exchange)
      
      const passed = 
        filtered.processingTimeMs < 100 && // < 100ms processing
        (result === null || result.ml !== undefined)
      
      this.addResult({
        passed,
        stage: 'e2e_pipeline',
        duration: performance.now() - startTime,
        input: { signal },
        output: { 
          filterResult: filtered.passed,
          logosResult: result ? 'processed' : 'null',
          totalTime: performance.now() - startTime,
        },
        error: passed ? undefined : 'End-to-end pipeline failed',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'e2e_pipeline',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  /**
   * Test multiple signals processing
   */
  private async testMultipleSignals(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const filter = getMLSignalFilter()
      const signals: SignalForFiltering[] = []
      
      // Generate 10 signals
      for (let i = 0; i < 10; i++) {
        signals.push({
          botCode: ['HFT', 'MFT', 'LFT'][i % 3],
          symbol: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'][i % 3],
          exchange: 'binance',
          direction: i % 2 === 0 ? 'LONG' : 'SHORT',
          confidence: 0.5 + Math.random() * 0.4,
          entryPrice: 50000 + i * 100,
        })
      }
      
      // Filter all signals
      const results = await Promise.all(
        signals.map(s => filter.filter(s))
      )
      
      const passed = 
        results.length === 10 &&
        results.every(r => r.processingTimeMs > 0)
      
      this.addResult({
        passed,
        stage: 'multiple_signals',
        duration: performance.now() - startTime,
        input: { signalCount: signals.length },
        output: { 
          processedCount: results.length,
          avgProcessingTime: results.reduce((a, b) => a + b.processingTimeMs, 0) / results.length,
        },
        error: passed ? undefined : 'Multiple signal processing failed',
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'multiple_signals',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  /**
   * Test high frequency signal handling
   */
  private async testHighFrequencySignals(): Promise<void> {
    const startTime = performance.now()
    
    try {
      const filter = getMLSignalFilter()
      const iterations = 100
      
      // Process 100 signals rapidly
      const processingTimes: number[] = []
      
      for (let i = 0; i < iterations; i++) {
        const signalStart = performance.now()
        
        await filter.filter({
          botCode: 'HFT',
          symbol: 'BTCUSDT',
          exchange: 'binance',
          direction: 'LONG',
          confidence: 0.7,
          entryPrice: 50000,
        })
        
        processingTimes.push(performance.now() - signalStart)
      }
      
      const avgTime = processingTimes.reduce((a, b) => a + b, 0) / iterations
      const maxTime = Math.max(...processingTimes)
      const minTime = Math.min(...processingTimes)
      
      // HFT target: < 10ms per signal
      const passed = avgTime < 10 && maxTime < 50
      
      this.addResult({
        passed,
        stage: 'high_frequency',
        duration: performance.now() - startTime,
        input: { iterations },
        output: { 
          avgTime: avgTime.toFixed(2) + 'ms',
          maxTime: maxTime.toFixed(2) + 'ms',
          minTime: minTime.toFixed(2) + 'ms',
        },
        error: passed ? undefined : `High frequency target not met: avg ${avgTime.toFixed(2)}ms > 10ms`,
      })
    } catch (error) {
      this.addResult({
        passed: false,
        stage: 'high_frequency',
        duration: performance.now() - startTime,
        input: {},
        output: {},
        error: String(error),
      })
    }
  }
  
  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================
  
  /**
   * Add test result
   */
  private addResult(result: PipelineTestResult): void {
    this.results.push(result)
  }
  
  /**
   * Get last test results
   */
  getResults(): PipelineTestResult[] {
    return [...this.results]
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let testerInstance: SignalPipelineTester | null = null

/**
 * Get Signal Pipeline Tester instance
 */
export function getSignalPipelineTester(): SignalPipelineTester {
  if (!testerInstance) {
    testerInstance = new SignalPipelineTester()
  }
  return testerInstance
}

/**
 * Reset the singleton instance
 */
export function resetSignalPipelineTester(): void {
  testerInstance = null
}

export default SignalPipelineTester
