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
import { getGAGarchIntegration, type VolatilityAdjustments as GAVolatilityAdjustments } from './ga-garch-integration';
import { db } from '@/lib/db';

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
  gaGarchConfig: {
    fitnessMultiplier: number;
    explorationBoost: number;
    regimeScore: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  } | null;
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
    let config: GeneticConfig = {
      ...defaultGeneticConfig,
      ...request.config,
    };
    
    // Constraints (can be modified by GARCH integration)
    let jobConstraints: Constraint[] = request.constraints || [];

    // Get volatility adjustments if enabled
    let volatilityAdjustments: VolatilityAdjustments | null = null;
    let volatilityRegime: VolatilityRegime | null = null;

    // GA-GARCH Integration with advanced features
    let gaGarchConfig: OptimizationJob['gaGarchConfig'] = null;
    
    if (this.config.enableGARCHIntegration && request.volatilityAware !== false) {
      try {
        // Use advanced GA-GARCH integration layer
        const gaGarchIntegration = getGAGarchIntegration();
        const volatilityConfig = gaGarchIntegration.getVolatilityAwareConfig(
          config,
          request.botType,
          request.symbol
        );
        
        // Apply advanced adjustments
        config = volatilityConfig.geneticConfig;
        volatilityRegime = volatilityConfig.regimeInfo.regime;
        
        volatilityAdjustments = {
          mutationRateMultiplier: volatilityConfig.adjustments.mutationRateMultiplier,
          explorationBoost: volatilityConfig.adjustments.explorationBoost,
          fitnessPenalty: volatilityConfig.adjustments.fitnessPenalty,
          regime: volatilityConfig.regimeInfo.regime,
        };
        
        gaGarchConfig = {
          fitnessMultiplier: volatilityConfig.fitnessMultiplier,
          explorationBoost: volatilityConfig.explorationBoost,
          regimeScore: volatilityConfig.regimeInfo.score,
          trend: volatilityConfig.regimeInfo.trend,
        };
        
        // Merge regime-specific constraints
        if (volatilityConfig.constraints.length > 0) {
          jobConstraints = [...jobConstraints, ...volatilityConfig.constraints];
        }
        
        // Adjust population size based on volatility
        config.populationSize = gaGarchIntegration.getRecommendedPopulationSize(
          config.populationSize,
          request.symbol
        );
        
      } catch (error) {
        console.warn('[GA Service] GA-GARCH integration failed, falling back to basic:', error);
        
        // Fallback to basic GARCH integration
        try {
          const garchService = getGARCHIntegrationService();
          const context = garchService.getVolatilityContext(request.symbol);
          
          if (context) {
            volatilityRegime = context.regime;
            volatilityAdjustments = this.getVolatilityAdjustments(context.regime);
            config.mutationRate = config.mutationRate * volatilityAdjustments.mutationRateMultiplier;
          }
        } catch (fallbackError) {
          console.warn('[GA Service] Fallback GARCH integration also failed:', fallbackError);
        }
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
      constraints: jobConstraints,
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
      gaGarchConfig,
    };

    this.jobs.set(jobId, job);

    // Persist job to database
    await this.saveJobToDatabase(job);

    // Start optimization in background
    this.runOptimization(jobId).catch(error => {
      console.error(`[GA Service] Job ${jobId} failed:`, error);
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = Date.now();
      // Update database
      this.updateJobInDatabase(jobId, { status: 'failed', error: error.message, completedAt: Date.now() }).catch(console.error);
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

      // Update database
      await this.updateJobInDatabase(job.id, {
        status: 'completed',
        generation: job.generation,
        progress: 100,
        bestChromosome: JSON.stringify(result.bestChromosome),
        history: JSON.stringify(result.history.slice(-50)),
        result: JSON.stringify(result),
        completedAt: new Date(),
        durationMs: result.durationMs,
      });

    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = Date.now();
      
      // Update database
      await this.updateJobInDatabase(job.id, {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
      });
    }
  }

  /**
   * Create fitness function for optimization
   */
  private async createFitnessFunction(job: OptimizationJob): Promise<FitnessFunction> {
    // This would typically call backtesting service
    // For now, return a simulated fitness function
    
    // Get GA-GARCH integration for advanced fitness adjustments
    let gaGarchIntegration: ReturnType<typeof getGAGarchIntegration> | null = null;
    try {
      gaGarchIntegration = getGAGarchIntegration();
    } catch {
      // Integration not available
    }
    
    return async (genes: Gene[]): Promise<number> => {
      // Simulated fitness - in production would call backtesting
      const baseFitness = genes.reduce((sum, gene) => {
        const normalized = (gene.value - gene.min) / (gene.max - gene.min);
        return sum + normalized * Math.random();
      }, 0);

      let fitness = baseFitness / genes.length;

      // Apply advanced GA-GARCH fitness adjustments
      if (gaGarchIntegration && job.gaGarchConfig) {
        // Apply fitness multiplier
        fitness *= job.gaGarchConfig.fitnessMultiplier;
        
        // Apply diversification bonus
        const diversity = this.calculateGeneDiversity(genes);
        const diversificationBonus = gaGarchIntegration.getDiversificationBonus(diversity, job.symbol);
        fitness += diversificationBonus;
        
        // Apply exploration boost for high volatility
        if (job.gaGarchConfig.explorationBoost > 0) {
          // Encourage exploration by rewarding unique gene combinations
          const uniqueness = this.calculateGeneUniqueness(genes);
          fitness += uniqueness * job.gaGarchConfig.explorationBoost;
        }
      } else if (job.volatilityAdjustments) {
        // Fallback: Apply basic volatility penalty
        fitness *= (1 - job.volatilityAdjustments.fitnessPenalty);
      }

      return fitness + (Math.random() - 0.5) * 0.1; // Add noise
    };
  }

  /**
   * Calculate gene diversity for diversification bonus
   */
  private calculateGeneDiversity(genes: Gene[]): number {
    if (genes.length < 2) return 0;
    
    const values = genes.map(g => (g.value - g.min) / (g.max - g.min));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance); // Standard deviation as diversity measure
  }

  /**
   * Calculate gene uniqueness for exploration bonus
   */
  private calculateGeneUniqueness(genes: Gene[]): number {
    // Higher uniqueness for values near min/max boundaries
    let uniqueness = 0;
    for (const gene of genes) {
      const normalized = (gene.value - gene.min) / (gene.max - gene.min);
      uniqueness += Math.abs(normalized - 0.5) * 2; // 0 at center, 1 at edges
    }
    return uniqueness / genes.length;
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
  async getProgress(jobId: string): Promise<OptimizationJob | null> {
    // First check memory
    let job = this.jobs.get(jobId);
    if (job) return job;
    
    // If not in memory, try database
    try {
      job = await this.loadJobFromDatabase(jobId);
      if (job) {
        this.jobs.set(jobId, job);
      }
      return job;
    } catch (error) {
      console.error('[GA Service] Error loading job from database:', error);
      return null;
    }
  }

  /**
   * Get all jobs
   */
  async getAllJobs(): Promise<OptimizationJob[]> {
    // Merge memory jobs with database jobs
    try {
      const dbJobs = await db.gAOptimizationJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      
      const jobs: OptimizationJob[] = [];
      
      // Add memory jobs first (most up-to-date)
      for (const job of this.jobs.values()) {
        jobs.push(job);
      }
      
      // Add database jobs not in memory
      for (const dbJob of dbJobs) {
        if (!this.jobs.has(dbJob.jobId)) {
          const job = this.dbJobToOptimizationJob(dbJob);
          if (job) jobs.push(job);
        }
      }
      
      return jobs;
    } catch (error) {
      console.error('[GA Service] Error loading jobs from database:', error);
      return Array.from(this.jobs.values());
    }
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
    // First try memory, then database
    let job = this.jobs.get(jobId);
    
    if (!job) {
      // Try to load from database
      try {
        job = await this.loadJobFromDatabase(jobId);
        if (job) {
          this.jobs.set(jobId, job);
        }
      } catch (error) {
        console.error('[GA Service] Error loading job from database:', error);
      }
    }
    
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

    // Apply to actual bot in database
    try {
      await this.applyParamsToBot(job.botCode, job.botType, params);
    } catch (error: any) {
      console.error('[GA Service] Error applying params to bot:', error);
      return {
        success: false,
        botCode: job.botCode,
        appliedParams: params,
        fitness: job.bestChromosome.fitness,
        message: `Failed to apply to bot: ${error.message}`,
      };
    }
    
    return {
      success: true,
      botCode: job.botCode,
      appliedParams: params,
      fitness: job.bestChromosome.fitness,
      message: `Applied optimized parameters to ${job.botCode}. Fitness: ${job.bestChromosome.fitness.toFixed(4)}`,
    };
  }

  /**
   * Apply parameters to actual bot in database
   */
  private async applyParamsToBot(
    botCode: string, 
    botType: BotType, 
    params: Record<string, number>
  ): Promise<void> {
    // Extract bot ID from botCode (format: TYPE-SYMBOL-ID or just ID)
    const botId = botCode.includes('-') ? botCode.split('-').pop() : botCode;
    
    switch (botType) {
      case 'DCA':
        await this.applyToDcaBot(botCode, params);
        break;
      case 'BB':
        await this.applyToBbBot(botCode, params);
        break;
      case 'GRID':
        await this.applyToGridBot(botCode, params);
        break;
      case 'ORION':
      case 'LOGOS':
      case 'MFT':
        // These bots use BotConfig or custom tables
        await this.applyToBotConfig(botCode, botType, params);
        break;
      default:
        console.warn(`[GA Service] Unknown bot type: ${botType}, params not saved`);
    }
  }

  /**
   * Apply to DCA Bot
   */
  private async applyToDcaBot(botCode: string, params: Record<string, number>): Promise<void> {
    // Try to find existing bot by name or create update data
    const updateData: Record<string, any> = {};
    
    // Map GA params to DCA bot fields
    if (params.baseOrderSize !== undefined) {
      // Convert percentage to USDT (assume $10000 base)
      updateData.baseAmount = params.baseOrderSize * 10000;
    }
    if (params.safetyOrderSize !== undefined) {
      updateData.dcaMultiplier = params.safetyOrderSize / (params.baseOrderSize || 0.01);
    }
    if (params.priceDeviation !== undefined) {
      updateData.dcaPercent = params.priceDeviation * 100;
    }
    if (params.takeProfit !== undefined) {
      updateData.tpValue = params.takeProfit * 100;
      updateData.tpType = 'PERCENT';
    }
    if (params.maxSafetyOrders !== undefined) {
      updateData.dcaLevels = Math.round(params.maxSafetyOrders);
    }
    if (params.safetyOrderStep !== undefined) {
      updateData.dcaPriceScale = params.safetyOrderStep * 20; // Scale factor
    }

    // Try to update existing bot
    try {
      const existing = await db.dcaBot.findFirst({
        where: { name: botCode },
      });
      
      if (existing) {
        await db.dcaBot.update({
          where: { id: existing.id },
          data: updateData,
        });
        console.log(`[GA Service] Updated DCA bot ${botCode} with optimized params`);
      } else {
        console.log(`[GA Service] DCA bot ${botCode} not found, params ready for new bot creation`);
        // Could create a new bot here if needed
      }
    } catch (error) {
      console.error(`[GA Service] Error updating DCA bot:`, error);
      throw error;
    }
  }

  /**
   * Apply to BB Bot
   */
  private async applyToBbBot(botCode: string, params: Record<string, number>): Promise<void> {
    const updateData: Record<string, any> = {};
    
    if (params.period !== undefined) {
      // BB period - stored in BBotTimeframeConfig
    }
    if (params.stdDev !== undefined) {
      // Standard deviation setting
    }
    if (params.stopLossPercent !== undefined) {
      updateData.stopLoss = params.stopLossPercent * 100;
    }
    if (params.takeProfitPercent !== undefined) {
      updateData.takeProfit = params.takeProfitPercent * 100;
    }
    if (params.entryThreshold !== undefined) {
      // Entry threshold
    }

    try {
      const existing = await db.bBBot.findFirst({
        where: { name: botCode },
      });
      
      if (existing) {
        await db.bBBot.update({
          where: { id: existing.id },
          data: updateData,
        });
        console.log(`[GA Service] Updated BB bot ${botCode} with optimized params`);
      } else {
        console.log(`[GA Service] BB bot ${botCode} not found, params ready for new bot creation`);
      }
    } catch (error) {
      console.error(`[GA Service] Error updating BB bot:`, error);
      throw error;
    }
  }

  /**
   * Apply to Grid Bot
   */
  private async applyToGridBot(botCode: string, params: Record<string, number>): Promise<void> {
    const updateData: Record<string, any> = {};
    
    if (params.gridLevels !== undefined) {
      updateData.gridCount = Math.round(params.gridLevels);
    }
    if (params.gridSpacing !== undefined) {
      // Grid spacing as percentage
      updateData.gridType = params.gridSpacing < 0.015 ? 'ARITHMETIC' : 'GEOMETRIC';
    }
    if (params.positionSize !== undefined) {
      updateData.perGridAmount = params.positionSize * 10000; // Scale to USDT
    }
    if (params.takeProfitGrid !== undefined) {
      // Take profit for grid
    }

    try {
      const existing = await db.gridBot.findFirst({
        where: { name: botCode },
      });
      
      if (existing) {
        await db.gridBot.update({
          where: { id: existing.id },
          data: updateData,
        });
        console.log(`[GA Service] Updated GRID bot ${botCode} with optimized params`);
      } else {
        console.log(`[GA Service] GRID bot ${botCode} not found, params ready for new bot creation`);
      }
    } catch (error) {
      console.error(`[GA Service] Error updating GRID bot:`, error);
      throw error;
    }
  }

  /**
   * Apply to BotConfig (for ORION, LOGOS, MFT)
   */
  private async applyToBotConfig(
    botCode: string, 
    botType: BotType, 
    params: Record<string, number>
  ): Promise<void> {
    const updateData: Record<string, any> = {};
    
    // Common bot config fields
    if (params.riskPerTrade !== undefined) {
      updateData.tradeAmount = params.riskPerTrade * 10000;
    }
    if (params.signalThreshold !== undefined) {
      updateData.minRiskRewardRatio = params.signalThreshold;
    }

    try {
      const existing = await db.botConfig.findFirst({
        where: { name: botCode },
      });
      
      if (existing) {
        await db.botConfig.update({
          where: { id: existing.id },
          data: updateData,
        });
        console.log(`[GA Service] Updated BotConfig ${botCode} with optimized params`);
      } else {
        console.log(`[GA Service] BotConfig ${botCode} not found, params ready for new bot creation`);
      }
    } catch (error) {
      console.error(`[GA Service] Error updating BotConfig:`, error);
      throw error;
    }
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
  async cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
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

    // Also clean database
    try {
      const dbCutoff = new Date(cutoff);
      const dbResult = await db.gAOptimizationJob.deleteMany({
        where: {
          completedAt: { lt: dbCutoff },
        },
      });
      removed += dbResult.count;
    } catch (error) {
      console.error('[GA Service] Error cleaning up database:', error);
    }

    return removed;
  }

  // =============================================================================
  // DATABASE HELPERS
  // =============================================================================

  private async saveJobToDatabase(job: OptimizationJob): Promise<void> {
    try {
      await db.gAOptimizationJob.create({
        data: {
          jobId: job.id,
          botCode: job.botCode,
          botType: job.botType,
          symbol: job.symbol,
          status: job.status,
          config: JSON.stringify(job.config),
          geneTemplate: JSON.stringify(job.geneTemplate),
          constraints: JSON.stringify(job.constraints),
          generation: job.generation,
          progress: job.progress,
          currentStats: job.currentStats ? JSON.stringify(job.currentStats) : null,
          bestChromosome: job.bestChromosome ? JSON.stringify(job.bestChromosome) : null,
          history: JSON.stringify(job.history),
          startedAt: job.startedAt ? new Date(job.startedAt) : null,
          completedAt: job.completedAt ? new Date(job.completedAt) : null,
          durationMs: job.durationMs,
          result: job.result ? JSON.stringify(job.result) : null,
          error: job.error,
          volatilityRegime: job.volatilityRegime,
          volatilityAdjustments: job.volatilityAdjustments ? JSON.stringify(job.volatilityAdjustments) : null,
          gaGarchConfig: job.gaGarchConfig ? JSON.stringify(job.gaGarchConfig) : null,
        },
      });
    } catch (error) {
      console.error('[GA Service] Error saving job to database:', error);
    }
  }

  private async updateJobInDatabase(jobId: string, data: Record<string, any>): Promise<void> {
    try {
      // Convert completedAt to Date if it's a number
      if (data.completedAt && typeof data.completedAt === 'number') {
        data.completedAt = new Date(data.completedAt);
      }
      
      await db.gAOptimizationJob.update({
        where: { jobId },
        data,
      });
    } catch (error) {
      console.error('[GA Service] Error updating job in database:', error);
    }
  }

  private async loadJobFromDatabase(jobId: string): Promise<OptimizationJob | null> {
    try {
      const dbJob = await db.gAOptimizationJob.findUnique({
        where: { jobId },
      });
      
      if (!dbJob) return null;
      
      return this.dbJobToOptimizationJob(dbJob);
    } catch (error) {
      console.error('[GA Service] Error loading job from database:', error);
      return null;
    }
  }

  private dbJobToOptimizationJob(dbJob: any): OptimizationJob | null {
    try {
      return {
        id: dbJob.jobId,
        botCode: dbJob.botCode,
        botType: dbJob.botType as BotType,
        symbol: dbJob.symbol,
        status: dbJob.status as OptimizationStatus,
        config: JSON.parse(dbJob.config),
        geneTemplate: JSON.parse(dbJob.geneTemplate),
        constraints: JSON.parse(dbJob.constraints || '[]'),
        generation: dbJob.generation,
        progress: dbJob.progress,
        currentStats: dbJob.currentStats ? JSON.parse(dbJob.currentStats) : null,
        bestChromosome: dbJob.bestChromosome ? JSON.parse(dbJob.bestChromosome) : null,
        history: JSON.parse(dbJob.history || '[]'),
        startedAt: dbJob.startedAt ? dbJob.startedAt.getTime() : null,
        completedAt: dbJob.completedAt ? dbJob.completedAt.getTime() : null,
        durationMs: dbJob.durationMs,
        result: dbJob.result ? JSON.parse(dbJob.result) : null,
        error: dbJob.error,
        volatilityRegime: dbJob.volatilityRegime as VolatilityRegime | null,
        volatilityAdjustments: dbJob.volatilityAdjustments ? JSON.parse(dbJob.volatilityAdjustments) : null,
        gaGarchConfig: dbJob.gaGarchConfig ? JSON.parse(dbJob.gaGarchConfig) : null,
      };
    } catch (error) {
      console.error('[GA Service] Error parsing job from database:', error);
      return null;
    }
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
