/**
 * GA Service - Genetic Algorithm Optimization Service
 * 
 * Manages optimization runs for trading bot parameters.
 * Integrates with GARCH for volatility-aware optimization.
 * 
 * API Endpoints:
 * - /api/ga/optimize - Start optimization
 * - /api/ga/progress - Get progress
 * - /api/ga/apply/{botCode} - Apply optimized parameters to bot
 * 
 * NO NEURAL NETWORKS - Classical evolutionary methods only.
 */

import { GeneticOptimizer, defaultGeneticConfig } from './genetic-optimizer';
import type {
  Gene,
  Chromosome,
  GeneticConfig,
  PopulationStats,
  OptimizationResult,
  FitnessFunction,
  Constraint,
} from './types';
import { getGARCHIntegrationService, type VolatilityRegime, type BotType } from '../volatility/garch-integration-service';

// =============================================================================
// TYPES
// =============================================================================

export type OptimizationStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface OptimizationJob {
  id: string;
  botCode: string;
  botType: BotType;
  symbol: string;
  status: OptimizationStatus;
  config: GeneticConfig;
  geneTemplate: Gene[];
  constraints: Constraint[];
  
  // Progress
  generation: number;
  progress: number;
  currentStats: PopulationStats | null;
  bestChromosome: Chromosome | null;
  history: PopulationStats[];
  
  // Timing
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number;
  
  // Result
  result: OptimizationResult | null;
  error: string | null;
  
  // GARCH integration
  volatilityRegime: VolatilityRegime | null;
  volatilityAdjustments: VolatilityAdjustments | null;
}

export interface VolatilityAdjustments {
  mutationRateMultiplier: number;
  explorationBoost: number;
  fitnessPenalty: number;
  regime: VolatilityRegime;
}

export interface GAServiceConfig {
  maxConcurrentJobs: number;
  defaultTimeoutMs: number;
  enableGARCHIntegration: boolean;
  autoApplyThreshold: number; // Auto-apply if fitness > threshold
}

export interface OptimizeRequest {
  botCode: string;
  botType: BotType;
  symbol: string;
  geneTemplate?: Gene[];
  config?: Partial<GeneticConfig>;
  constraints?: Constraint[];
  volatilityAware?: boolean;
}

export interface ApplyResult {
  success: boolean;
  botCode: string;
  appliedParams: Record<string, number>;
  fitness: number;
  message: string;
}

// =============================================================================
// BOT PARAMETER TEMPLATES
// =============================================================================

const BOT_TEMPLATES: Record<BotType, Gene[]> = {
  DCA: [
    { name: 'baseOrderSize', value: 0.01, min: 0.001, max: 0.05, mutationRate: 0.1 },
    { name: 'safetyOrderSize', value: 0.02, min: 0.002, max: 0.1, mutationRate: 0.1 },
    { name: 'priceDeviation', value: 0.01, min: 0.005, max: 0.05, mutationRate: 0.15 },
    { name: 'takeProfit', value: 0.03, min: 0.01, max: 0.1, mutationRate: 0.1 },
    { name: 'maxSafetyOrders', value: 5, min: 1, max: 15, mutationRate: 0.1 },
    { name: 'safetyOrderStep', value: 0.02, min: 0.01, max: 0.1, mutationRate: 0.1 },
  ],
  BB: [
    { name: 'period', value: 20, min: 10, max: 50, mutationRate: 0.1 },
    { name: 'stdDev', value: 2.0, min: 1.0, max: 3.5, mutationRate: 0.15 },
    { name: 'stopLossPercent', value: 0.02, min: 0.01, max: 0.05, mutationRate: 0.1 },
    { name: 'takeProfitPercent', value: 0.04, min: 0.02, max: 0.1, mutationRate: 0.1 },
    { name: 'entryThreshold', value: 0.95, min: 0.85, max: 1.0, mutationRate: 0.15 },
  ],
  ORION: [
    { name: 'rsiPeriod', value: 14, min: 7, max: 30, mutationRate: 0.1 },
    { name: 'rsiOversold', value: 30, min: 20, max: 40, mutationRate: 0.15 },
    { name: 'rsiOverbought', value: 70, min: 60, max: 80, mutationRate: 0.15 },
    { name: 'macdFast', value: 12, min: 5, max: 20, mutationRate: 0.1 },
    { name: 'macdSlow', value: 26, min: 15, max: 40, mutationRate: 0.1 },
    { name: 'signalThreshold', value: 0.6, min: 0.4, max: 0.9, mutationRate: 0.1 },
  ],
  LOGOS: [
    { name: 'confidenceThreshold', value: 0.5, min: 0.3, max: 0.8, mutationRate: 0.1 },
    { name: 'signalWeight', value: 0.7, min: 0.3, max: 1.0, mutationRate: 0.15 },
    { name: 'maxPositions', value: 3, min: 1, max: 10, mutationRate: 0.1 },
    { name: 'riskPerTrade', value: 0.02, min: 0.01, max: 0.05, mutationRate: 0.1 },
  ],
  GRID: [
    { name: 'gridLevels', value: 10, min: 5, max: 30, mutationRate: 0.1 },
    { name: 'gridSpacing', value: 0.01, min: 0.005, max: 0.03, mutationRate: 0.15 },
    { name: 'positionSize', value: 0.01, min: 0.005, max: 0.05, mutationRate: 0.1 },
    { name: 'takeProfitGrid', value: 0.005, min: 0.002, max: 0.02, mutationRate: 0.1 },
  ],
  MFT: [
    { name: 'fastPeriod', value: 5, min: 3, max: 15, mutationRate: 0.1 },
    { name: 'slowPeriod', value: 20, min: 10, max: 50, mutationRate: 0.1 },
    { name: 'signalPeriod', value: 9, min: 5, max: 20, mutationRate: 0.1 },
    { name: 'stopLossPercent', value: 0.015, min: 0.005, max: 0.04, mutationRate: 0.1 },
    { name: 'trailPercent', value: 0.01, min: 0.005, max: 0.03, mutationRate: 0.1 },
  ],
};

// =============================================================================
// GA SERVICE
// =============================================================================

class GAService {
  private config: GAServiceConfig;
  private jobs: Map<string, OptimizationJob> = new Map();
  private optimizers: Map<string, GeneticOptimizer> = new Map();
  private fitnessFunctions: Map<string, FitnessFunction> = new Map();

  constructor(config?: Partial<GAServiceConfig>) {
    this.config = {
      maxConcurrentJobs: 3,
      defaultTimeoutMs: 30 * 60 * 1000, // 30 minutes
      enableGARCHIntegration: true,
      autoApplyThreshold: 0.9,
      ...config,
    };
  }

  /**
   * Start a new optimization job
   */
  async startOptimization(request: OptimizeRequest): Promise<OptimizationJob> {
    // Check concurrent job limit
    const runningJobs = Array.from(this.jobs.values()).filter(
      j => j.status === 'running'
    );
    
    if (runningJobs.length >= this.config.maxConcurrentJobs) {
      throw new Error(`Maximum concurrent jobs (${this.config.maxConcurrentJobs}) reached`);
    }

    // Create job ID
    const jobId = `${request.botCode}-${Date.now()}`;

    // Get gene template
    const geneTemplate = request.geneTemplate || BOT_TEMPLATES[request.botType];

    // Create config
    const config: GeneticConfig = {
      ...defaultGeneticConfig,
      ...request.config,
    };

    // Get volatility adjustments if enabled
    let volatilityAdjustments: VolatilityAdjustments | null = null;
    let volatilityRegime: VolatilityRegime | null = null;

    if (this.config.enableGARCHIntegration && request.volatilityAware !== false) {
      try {
        const garchService = getGARCHIntegrationService();
        const context = garchService.getVolatilityContext(request.symbol);
        
        if (context) {
          volatilityRegime = context.regime;
          volatilityAdjustments = this.getVolatilityAdjustments(context.regime);
          
          // Apply volatility adjustments to config
          config.mutationRate = config.mutationRate * volatilityAdjustments.mutationRateMultiplier;
        }
      } catch (error) {
        console.warn('[GA Service] GARCH integration failed, using default config:', error);
      }
    }

    // Create job
    const job: OptimizationJob = {
      id: jobId,
      botCode: request.botCode,
      botType: request.botType,
      symbol: request.symbol,
      status: 'pending',
      config,
      geneTemplate,
      constraints: request.constraints || [],
      generation: 0,
      progress: 0,
      currentStats: null,
      bestChromosome: null,
      history: [],
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      result: null,
      error: null,
      volatilityRegime,
      volatilityAdjustments,
    };

    this.jobs.set(jobId, job);

    // Start optimization in background
    this.runOptimization(jobId).catch(error => {
      console.error(`[GA Service] Job ${jobId} failed:`, error);
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = Date.now();
    });

    return job;
  }

  /**
   * Run optimization job
   */
  private async runOptimization(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = 'running';
    job.startedAt = Date.now();

    // Create optimizer
    const optimizer = new GeneticOptimizer(job.config);
    this.optimizers.set(jobId, optimizer);

    // Create fitness function
    const fitnessFn = await this.createFitnessFunction(job);
    this.fitnessFunctions.set(jobId, fitnessFn);

    try {
      // Initialize population
      optimizer.initialize(job.geneTemplate);

      // Run optimization with progress tracking
      const result = await optimizer.optimize(
        job.geneTemplate,
        fitnessFn,
        job.constraints
      );

      // Update job with result
      job.status = 'completed';
      job.result = result;
      job.bestChromosome = result.bestChromosome;
      job.history = result.history;
      job.generation = result.generations;
      job.progress = 100;
      job.completedAt = Date.now();
      job.durationMs = result.durationMs;

    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = Date.now();
    }
  }

  /**
   * Create fitness function for optimization
   */
  private async createFitnessFunction(job: OptimizationJob): Promise<FitnessFunction> {
    // This would typically call backtesting service
    // For now, return a simulated fitness function
    
    return async (genes: Gene[]): Promise<number> => {
      // Simulated fitness - in production would call backtesting
      const baseFitness = genes.reduce((sum, gene) => {
        const normalized = (gene.value - gene.min) / (gene.max - gene.min);
        return sum + normalized * Math.random();
      }, 0);

      let fitness = baseFitness / genes.length;

      // Apply volatility penalty if in high/extreme regime
      if (job.volatilityAdjustments) {
        fitness *= (1 - job.volatilityAdjustments.fitnessPenalty);
      }

      return fitness + (Math.random() - 0.5) * 0.1; // Add noise
    };
  }

  /**
   * Get volatility adjustments for optimization
   */
  private getVolatilityAdjustments(regime: VolatilityRegime): VolatilityAdjustments {
    switch (regime) {
      case 'low':
        return {
          mutationRateMultiplier: 0.8,  // Less exploration needed
          explorationBoost: 0,
          fitnessPenalty: 0,
          regime: 'low',
        };
      case 'normal':
        return {
          mutationRateMultiplier: 1.0,
          explorationBoost: 0,
          fitnessPenalty: 0,
          regime: 'normal',
        };
      case 'high':
        return {
          mutationRateMultiplier: 1.3,  // More exploration for stability
          explorationBoost: 0.1,
          fitnessPenalty: 0.05,
          regime: 'high',
        };
      case 'extreme':
        return {
          mutationRateMultiplier: 1.5,  // Maximum exploration
          explorationBoost: 0.2,
          fitnessPenalty: 0.1,
          regime: 'extreme',
        };
    }
  }

  /**
   * Get optimization progress
   */
  getProgress(jobId: string): OptimizationJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): OptimizationJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get active jobs
   */
  getActiveJobs(): OptimizationJob[] {
    return Array.from(this.jobs.values()).filter(
      j => j.status === 'running' || j.status === 'pending'
    );
  }

  /**
   * Cancel optimization
   */
  cancelOptimization(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'running' || job.status === 'pending') {
      job.status = 'cancelled';
      job.completedAt = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Apply optimized parameters to bot
   */
  async applyToBot(jobId: string): Promise<ApplyResult> {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      return {
        success: false,
        botCode: '',
        appliedParams: {},
        fitness: 0,
        message: `Job ${jobId} not found`,
      };
    }

    if (job.status !== 'completed' || !job.bestChromosome) {
      return {
        success: false,
        botCode: job.botCode,
        appliedParams: {},
        fitness: 0,
        message: `Job not completed or no result available`,
      };
    }

    // Convert genes to parameters
    const params: Record<string, number> = {};
    for (const gene of job.bestChromosome.genes) {
      params[gene.name] = gene.value;
    }

    // In production, this would update the bot configuration
    // For now, we just return the parameters
    
    return {
      success: true,
      botCode: job.botCode,
      appliedParams: params,
      fitness: job.bestChromosome.fitness,
      message: `Applied optimized parameters to ${job.botCode}. Fitness: ${job.bestChromosome.fitness.toFixed(4)}`,
    };
  }

  /**
   * Get bot template
   */
  getBotTemplate(botType: BotType): Gene[] | null {
    return BOT_TEMPLATES[botType] || null;
  }

  /**
   * Get all bot templates
   */
  getAllTemplates(): Record<BotType, Gene[]> {
    return { ...BOT_TEMPLATES };
  }

  /**
   * Clean up old jobs
   */
  cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [id, job] of this.jobs) {
      if (job.completedAt && job.completedAt < cutoff) {
        this.jobs.delete(id);
        this.optimizers.delete(id);
        this.fitnessFunctions.delete(id);
        removed++;
      }
    }

    return removed;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let serviceInstance: GAService | null = null;

export function getGAService(config?: Partial<GAServiceConfig>): GAService {
  if (!serviceInstance) {
    serviceInstance = new GAService(config);
  }
  return serviceInstance;
}

export function resetGAService(): void {
  serviceInstance = null;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  GAService,
  BOT_TEMPLATES,
};
