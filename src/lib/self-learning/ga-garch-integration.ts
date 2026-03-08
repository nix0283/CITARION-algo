/**
 * GA GARCH Integration
 * 
 * Integrates GARCH volatility analysis into genetic algorithm optimization.
 * Provides volatility-aware parameter optimization for trading bots.
 * 
 * Features:
 * - Dynamic mutation rates based on volatility regime
 * - Fitness penalization for unstable market conditions
 * - Exploration boost during high volatility
 * - Regime-specific parameter constraints
 * 
 * NO NEURAL NETWORKS - Classical evolutionary methods only.
 */

import {
  getGARCHIntegrationService,
  type VolatilityRegime,
  type BotType,
  type VolatilityContext,
} from '../volatility/garch-integration-service';
import type { Gene, GeneticConfig, Constraint } from './types';

// =============================================================================
// TYPES
// =============================================================================

export interface GAGarchConfig {
  /** Enable GARCH-based mutation adjustment */
  enableMutationAdjustment: boolean;
  
  /** Enable fitness penalty for high volatility */
  enableFitnessPenalty: boolean;
  
  /** Enable exploration boost in high volatility */
  enableExplorationBoost: boolean;
  
  /** Enable regime-specific constraints */
  enableRegimeConstraints: boolean;
  
  /** Minimum fitness threshold to apply params in extreme volatility */
  extremeVolMinFitness: number;
  
  /** Maximum allowed position size multiplier in extreme volatility */
  extremeVolMaxPositionMult: number;
}

export interface VolatilityAwareConfig {
  geneticConfig: GeneticConfig;
  constraints: Constraint[];
  fitnessMultiplier: number;
  explorationBoost: number;
  regimeInfo: {
    regime: VolatilityRegime;
    score: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  adjustments: VolatilityAdjustments;
}

export interface VolatilityAdjustments {
  mutationRateMultiplier: number;
  crossoverRateMultiplier: number;
  fitnessPenalty: number;
  explorationBoost: number;
  diversificationBonus: number;
  minFitnessThreshold: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_GA_GARCH_CONFIG: GAGarchConfig = {
  enableMutationAdjustment: true,
  enableFitnessPenalty: true,
  enableExplorationBoost: true,
  enableRegimeConstraints: true,
  extremeVolMinFitness: 0.7,
  extremeVolMaxPositionMult: 0.5,
};

// =============================================================================
// VOLATILITY ADJUSTMENTS BY REGIME
// =============================================================================

const VOLATILITY_ADJUSTMENTS: Record<VolatilityRegime, VolatilityAdjustments> = {
  low: {
    mutationRateMultiplier: 0.8,      // Less exploration, more exploitation
    crossoverRateMultiplier: 1.0,
    fitnessPenalty: 0,
    explorationBoost: 0,
    diversificationBonus: 0.1,        // Reward stability
    minFitnessThreshold: 0.5,
  },
  normal: {
    mutationRateMultiplier: 1.0,      // Standard settings
    crossoverRateMultiplier: 1.0,
    fitnessPenalty: 0,
    explorationBoost: 0,
    diversificationBonus: 0,
    minFitnessThreshold: 0.5,
  },
  high: {
    mutationRateMultiplier: 1.3,      // More exploration for robustness
    crossoverRateMultiplier: 1.1,
    fitnessPenalty: 0.05,             // Slight penalty for instability
    explorationBoost: 0.15,           // Boost exploration
    diversificationBonus: 0.05,       // Reward diverse solutions
    minFitnessThreshold: 0.6,
  },
  extreme: {
    mutationRateMultiplier: 1.5,      // Maximum exploration
    crossoverRateMultiplier: 1.2,
    fitnessPenalty: 0.1,              // Significant penalty
    explorationBoost: 0.25,           // Strong exploration boost
    diversificationBonus: 0.1,        // Strongly reward diversity
    minFitnessThreshold: 0.7,         // Higher threshold for acceptance
  },
};

// Bot-specific volatility multipliers
const BOT_VOLATILITY_MULTIPLIERS: Record<BotType, {
  mutationAdjustment: number;
  fitnessAdjustment: number;
  explorationAdjustment: number;
}> = {
  DCA: {
    mutationAdjustment: 0.9,   // DCA benefits from stability
    fitnessAdjustment: 0.95,
    explorationAdjustment: 0.8,
  },
  BB: {
    mutationAdjustment: 1.0,   // BB uses volatility natively
    fitnessAdjustment: 1.0,
    explorationAdjustment: 1.0,
  },
  ORION: {
    mutationAdjustment: 1.1,   // ORION needs more exploration
    fitnessAdjustment: 0.9,
    explorationAdjustment: 1.2,
  },
  LOGOS: {
    mutationAdjustment: 1.0,   // Meta bot, balanced
    fitnessAdjustment: 1.0,
    explorationAdjustment: 1.0,
  },
  GRID: {
    mutationAdjustment: 0.85,  // Grid needs stability
    fitnessAdjustment: 0.9,
    explorationAdjustment: 0.7,
  },
  MFT: {
    mutationAdjustment: 1.0,
    fitnessAdjustment: 0.95,
    explorationAdjustment: 1.1,
  },
};

// =============================================================================
// GA GARCH INTEGRATION SERVICE
// =============================================================================

class GAGarchIntegration {
  private config: GAGarchConfig;

  constructor(config?: Partial<GAGarchConfig>) {
    this.config = { ...DEFAULT_GA_GARCH_CONFIG, ...config };
  }

  /**
   * Get volatility-aware configuration for optimization
   */
  getVolatilityAwareConfig(
    baseConfig: GeneticConfig,
    botType: BotType,
    symbol: string
  ): VolatilityAwareConfig {
    // Get GARCH context
    const garchService = getGARCHIntegrationService();
    const context = garchService.getVolatilityContext(symbol);
    
    // Default adjustments if no volatility data
    const defaultAdjustments: VolatilityAdjustments = VOLATILITY_ADJUSTMENTS['normal'];
    const defaultRegimeInfo = {
      regime: 'normal' as VolatilityRegime,
      score: 0.5,
      trend: 'stable' as const,
    };
    
    if (!context) {
      return {
        geneticConfig: baseConfig,
        constraints: [],
        fitnessMultiplier: 1.0,
        explorationBoost: 0,
        regimeInfo: defaultRegimeInfo,
        adjustments: defaultAdjustments,
      };
    }
    
    // Get regime-specific adjustments
    const baseAdjustments = VOLATILITY_ADJUSTMENTS[context.regime];
    const botMultipliers = BOT_VOLATILITY_MULTIPLIERS[botType];
    
    // Apply bot-specific multipliers
    const adjustments: VolatilityAdjustments = {
      mutationRateMultiplier: baseAdjustments.mutationRateMultiplier * botMultipliers.mutationAdjustment,
      crossoverRateMultiplier: baseAdjustments.crossoverRateMultiplier,
      fitnessPenalty: baseAdjustments.fitnessPenalty * botMultipliers.fitnessAdjustment,
      explorationBoost: baseAdjustments.explorationBoost * botMultipliers.explorationAdjustment,
      diversificationBonus: baseAdjustments.diversificationBonus,
      minFitnessThreshold: baseAdjustments.minFitnessThreshold,
    };
    
    // Adjust genetic config
    const adjustedConfig: GeneticConfig = { ...baseConfig };
    
    if (this.config.enableMutationAdjustment) {
      adjustedConfig.mutationRate = baseConfig.mutationRate * adjustments.mutationRateMultiplier;
      // Cap mutation rate at 0.5
      adjustedConfig.mutationRate = Math.min(adjustedConfig.mutationRate, 0.5);
    }
    
    // Adjust crossover rate
    adjustedConfig.crossoverRate = Math.min(
      baseConfig.crossoverRate * adjustments.crossoverRateMultiplier,
      1.0
    );
    
    // In extreme volatility, increase early stopping patience
    if (context.regime === 'extreme') {
      adjustedConfig.earlyStoppingPatience = Math.round(baseConfig.earlyStoppingPatience * 1.5);
    }
    
    // Create regime-specific constraints
    const constraints: Constraint[] = [];
    
    if (this.config.enableRegimeConstraints && context.regime === 'extreme') {
      // Add constraint for maximum position size
      constraints.push({
        type: 'custom',
        parameters: ['positionSize', 'riskPerTrade'],
        check: (genes: Gene[]) => {
          const posSize = genes.find(g => g.name === 'positionSize' || g.name === 'riskPerTrade');
          if (posSize) {
            const maxAllowed = posSize.max * this.config.extremeVolMaxPositionMult;
            return posSize.value <= maxAllowed;
          }
          return true;
        },
      });
    }
    
    return {
      geneticConfig: adjustedConfig,
      constraints,
      fitnessMultiplier: 1 - adjustments.fitnessPenalty,
      explorationBoost: adjustments.explorationBoost,
      regimeInfo: {
        regime: context.regime,
        score: context.regimeScore,
        trend: context.trend,
      },
      adjustments,
    };
  }

  /**
   * Apply fitness penalty based on volatility
   */
  applyFitnessPenalty(
    fitness: number,
    symbol: string,
    botType: BotType
  ): number {
    if (!this.config.enableFitnessPenalty) return fitness;
    
    const garchService = getGARCHIntegrationService();
    const context = garchService.getVolatilityContext(symbol);
    
    if (!context) return fitness;
    
    const adjustments = VOLATILITY_ADJUSTMENTS[context.regime];
    const botMultipliers = BOT_VOLATILITY_MULTIPLIERS[botType];
    
    const penalty = adjustments.fitnessPenalty * botMultipliers.fitnessAdjustment;
    
    return fitness * (1 - penalty);
  }

  /**
   * Get exploration boost for current volatility
   */
  getExplorationBoost(symbol: string, botType: BotType): number {
    if (!this.config.enableExplorationBoost) return 0;
    
    const garchService = getGARCHIntegrationService();
    const context = garchService.getVolatilityContext(symbol);
    
    if (!context) return 0;
    
    const adjustments = VOLATILITY_ADJUSTMENTS[context.regime];
    const botMultipliers = BOT_VOLATILITY_MULTIPLIERS[botType];
    
    return adjustments.explorationBoost * botMultipliers.explorationAdjustment;
  }

  /**
   * Check if parameters are acceptable for current volatility
   */
  areParamsAcceptable(
    params: Record<string, number>,
    symbol: string,
    fitness: number
  ): { acceptable: boolean; reason: string } {
    const garchService = getGARCHIntegrationService();
    const context = garchService.getVolatilityContext(symbol);
    
    if (!context) {
      return { acceptable: true, reason: 'No volatility data available' };
    }
    
    // In extreme volatility, require higher fitness
    if (context.regime === 'extreme') {
      const adjustments = VOLATILITY_ADJUSTMENTS['extreme'];
      
      if (fitness < adjustments.minFitnessThreshold) {
        return {
          acceptable: false,
          reason: `Fitness ${fitness.toFixed(3)} below threshold ${adjustments.minFitnessThreshold} for extreme volatility`,
        };
      }
      
      // Check position size constraints
      const posSize = params['positionSize'] || params['riskPerTrade'] || params['baseOrderSize'];
      if (posSize !== undefined) {
        const maxAllowed = 0.05 * this.config.extremeVolMaxPositionMult; // 2.5% max
        if (posSize > maxAllowed) {
          return {
            acceptable: false,
            reason: `Position size ${posSize} exceeds max ${maxAllowed} for extreme volatility`,
          };
        }
      }
    }
    
    return { acceptable: true, reason: 'Parameters acceptable' };
  }

  /**
   * Get diversification bonus for fitness calculation
   */
  getDiversificationBonus(
    diversity: number,
    symbol: string
  ): number {
    const garchService = getGARCHIntegrationService();
    const context = garchService.getVolatilityContext(symbol);
    
    if (!context) return 0;
    
    const adjustments = VOLATILITY_ADJUSTMENTS[context.regime];
    
    // In high/extreme volatility, reward diversity
    return diversity * adjustments.diversificationBonus;
  }

  /**
   * Get recommended population size for volatility
   */
  getRecommendedPopulationSize(
    baseSize: number,
    symbol: string
  ): number {
    const garchService = getGARCHIntegrationService();
    const context = garchService.getVolatilityContext(symbol);
    
    if (!context) return baseSize;
    
    // In high volatility, larger population for better exploration
    switch (context.regime) {
      case 'low':
        return Math.round(baseSize * 0.8);  // Smaller, more focused
      case 'normal':
        return baseSize;
      case 'high':
        return Math.round(baseSize * 1.2);  // Larger for exploration
      case 'extreme':
        return Math.round(baseSize * 1.5);  // Much larger for robustness
    }
  }

  /**
   * Get volatility context for a symbol
   */
  getVolatilityContext(symbol: string): VolatilityContext | null {
    const garchService = getGARCHIntegrationService();
    return garchService.getVolatilityContext(symbol);
  }

  /**
   * Get current volatility adjustments for a symbol
   */
  getCurrentAdjustments(symbol: string): VolatilityAdjustments {
    const garchService = getGARCHIntegrationService();
    const context = garchService.getVolatilityContext(symbol);
    
    if (!context) return VOLATILITY_ADJUSTMENTS['normal'];
    
    return VOLATILITY_ADJUSTMENTS[context.regime];
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let integrationInstance: GAGarchIntegration | null = null;

export function getGAGarchIntegration(config?: Partial<GAGarchConfig>): GAGarchIntegration {
  if (!integrationInstance) {
    integrationInstance = new GAGarchIntegration(config);
  }
  return integrationInstance;
}

export function resetGAGarchIntegration(): void {
  integrationInstance = null;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  GAGarchIntegration,
  DEFAULT_GA_GARCH_CONFIG,
  VOLATILITY_ADJUSTMENTS,
  BOT_VOLATILITY_MULTIPLIERS,
};
