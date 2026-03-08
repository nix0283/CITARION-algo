/**
 * Enhanced Signal Filter
 * 
 * Combined signal filter that integrates multiple filter types
 * for comprehensive signal analysis and approval.
 */

import { BBSignalFilter, BBSignal, BBFilterResult, getBBSignalFilter } from './bb-signal-filter';
import { DCAEntryFilter, DCASignal, DCAFilterResult, getDCAEntryFilter } from './dca-entry-filter';

// ==================== TYPES ====================

export type BotType = 'BB' | 'DCA' | 'GRID' | 'SCALP' | 'SWING';

export interface SignalContext {
  symbol: string;
  timestamp: Date;
  marketConditions: {
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    volume: 'LOW' | 'NORMAL' | 'HIGH';
  };
  accountInfo?: {
    availableBalance: number;
    currentExposure: number;
    openPositions: number;
  };
}

export interface EnhancedFilterResult {
  approved: boolean;
  overallConfidence: number;
  botType: BotType;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
  reasons: string[];
  details?: BBFilterResult | DCAFilterResult;
  riskScore: number; // 0-1, lower is safer
  recommendedAction: 'ENTER' | 'WAIT' | 'AVOID';
}

export interface EnhancedFilterConfig {
  // Minimum confidence thresholds per bot type
  minConfidence: Record<BotType, number>;
  
  // Risk score thresholds
  maxRiskScore: number;
  
  // Enable/disable specific filters
  enabledFilters: {
    bb: boolean;
    dca: boolean;
    grid: boolean;
    scalp: boolean;
    swing: boolean;
  };
  
  // Market condition adjustments
  volatilityPenalty: number;
  trendAlignmentBonus: number;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_ENHANCED_FILTER_CONFIG: EnhancedFilterConfig = {
  minConfidence: {
    BB: 0.6,
    DCA: 0.5,
    GRID: 0.65,
    SCALP: 0.7,
    SWING: 0.55,
  },
  maxRiskScore: 0.7,
  enabledFilters: {
    bb: true,
    dca: true,
    grid: true,
    scalp: true,
    swing: true,
  },
  volatilityPenalty: 0.1,
  trendAlignmentBonus: 0.15,
};

// ==================== ENHANCED SIGNAL FILTER CLASS ====================

export class EnhancedSignalFilter {
  private config: EnhancedFilterConfig;
  private bbFilter: BBSignalFilter;
  private dcaFilter: DCAEntryFilter;

  constructor(config: Partial<EnhancedFilterConfig> = {}) {
    this.config = { ...DEFAULT_ENHANCED_FILTER_CONFIG, ...config };
    this.bbFilter = getBBSignalFilter();
    this.dcaFilter = getDCAEntryFilter();
  }

  /**
   * Evaluate a BB signal
   */
  async evaluateBBSignal(signal: BBSignal, context: SignalContext): Promise<EnhancedFilterResult> {
    if (!this.config.enabledFilters.bb) {
      return this.createDisabledResult('BB');
    }

    const bbResult = await this.bbFilter.evaluate(signal);
    const reasons: string[] = [...bbResult.reasons];

    // Apply market condition adjustments
    let adjustedConfidence = bbResult.confidence;
    
    // Volatility adjustment
    if (context.marketConditions.volatility === 'HIGH') {
      adjustedConfidence -= this.config.volatilityPenalty;
      reasons.push('High volatility penalty applied');
    }

    // Trend alignment bonus
    if (
      (bbResult.direction === 'LONG' && context.marketConditions.trend === 'BULLISH') ||
      (bbResult.direction === 'SHORT' && context.marketConditions.trend === 'BEARISH')
    ) {
      adjustedConfidence += this.config.trendAlignmentBonus;
      reasons.push('Trend alignment bonus applied');
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(bbResult, context);

    // Determine recommended action
    const recommendedAction = this.determineAction(adjustedConfidence, riskScore, 'BB');

    // Final approval
    const approved = bbResult.approved && 
                     adjustedConfidence >= this.config.minConfidence.BB &&
                     riskScore <= this.config.maxRiskScore;

    return {
      approved,
      overallConfidence: Math.max(0, Math.min(1, adjustedConfidence)),
      botType: 'BB',
      direction: bbResult.direction,
      reasons,
      details: bbResult,
      riskScore,
      recommendedAction,
    };
  }

  /**
   * Evaluate a DCA signal
   */
  async evaluateDCASignal(signal: DCASignal, context: SignalContext): Promise<EnhancedFilterResult> {
    if (!this.config.enabledFilters.dca) {
      return this.createDisabledResult('DCA');
    }

    const dcaResult = await this.dcaFilter.evaluate(signal);
    const reasons: string[] = [...dcaResult.reasons];

    // Apply market condition adjustments
    let adjustedConfidence = dcaResult.confidence;

    // DCA works better in ranging markets
    if (context.marketConditions.trend !== 'NEUTRAL') {
      adjustedConfidence -= 0.05;
      reasons.push('Trending market - DCA may be less effective');
    }

    // High volatility can be risky for DCA
    if (context.marketConditions.volatility === 'HIGH') {
      adjustedConfidence -= this.config.volatilityPenalty;
      reasons.push('High volatility - increased DCA risk');
    }

    // Calculate risk score
    const riskScore = this.calculateDCARiskScore(dcaResult, signal, context);

    // Determine recommended action
    const recommendedAction = this.determineAction(adjustedConfidence, riskScore, 'DCA');

    // Final approval
    const approved = dcaResult.approved && 
                     adjustedConfidence >= this.config.minConfidence.DCA &&
                     riskScore <= this.config.maxRiskScore;

    return {
      approved,
      overallConfidence: Math.max(0, Math.min(1, adjustedConfidence)),
      botType: 'DCA',
      reasons,
      details: dcaResult,
      riskScore,
      recommendedAction,
    };
  }

  /**
   * Calculate risk score for BB signals
   */
  private calculateRiskScore(result: BBFilterResult, context: SignalContext): number {
    let riskScore = 0.3; // Base risk

    // Higher risk for outer band touches (reversal plays)
    if (result.signalType === 'OUTER_TOUCH') {
      riskScore += 0.15;
    }

    // Higher risk for squeeze breakouts (direction uncertain)
    if (result.signalType === 'SQUEEZE') {
      riskScore += 0.2;
    }

    // High volatility increases risk
    if (context.marketConditions.volatility === 'HIGH') {
      riskScore += 0.2;
    }

    // Low confidence increases risk
    riskScore += (1 - result.confidence) * 0.3;

    // Account exposure risk
    if (context.accountInfo) {
      const exposureRatio = context.accountInfo.currentExposure / context.accountInfo.availableBalance;
      riskScore += exposureRatio * 0.15;
    }

    return Math.max(0, Math.min(1, riskScore));
  }

  /**
   * Calculate risk score for DCA signals
   */
  private calculateDCARiskScore(
    result: DCAFilterResult, 
    signal: DCASignal, 
    context: SignalContext
  ): number {
    let riskScore = 0.25; // Base risk for DCA

    // Higher levels = higher risk
    const levelRisk = (result.level / signal.maxLevels) * 0.3;
    riskScore += levelRisk;

    // Already in loss = higher risk
    if (signal.unrealizedPnl < 0) {
      const lossRatio = Math.abs(signal.unrealizedPnl) / signal.totalInvested;
      riskScore += lossRatio * 0.2;
    }

    // High volatility increases risk
    if (context.marketConditions.volatility === 'HIGH') {
      riskScore += 0.15;
    }

    // Account exposure risk
    if (context.accountInfo) {
      const exposureRatio = context.accountInfo.currentExposure / context.accountInfo.availableBalance;
      riskScore += exposureRatio * 0.1;
    }

    return Math.max(0, Math.min(1, riskScore));
  }

  /**
   * Determine recommended action
   */
  private determineAction(
    confidence: number, 
    riskScore: number, 
    botType: BotType
  ): 'ENTER' | 'WAIT' | 'AVOID' {
    const minConfidence = this.config.minConfidence[botType];

    if (confidence >= minConfidence && riskScore <= this.config.maxRiskScore * 0.6) {
      return 'ENTER';
    }

    if (confidence >= minConfidence * 0.8 && riskScore <= this.config.maxRiskScore) {
      return 'WAIT';
    }

    return 'AVOID';
  }

  /**
   * Create result for disabled filter
   */
  private createDisabledResult(botType: BotType): EnhancedFilterResult {
    return {
      approved: false,
      overallConfidence: 0,
      botType,
      reasons: [`${botType} filter is disabled`],
      riskScore: 1,
      recommendedAction: 'AVOID',
    };
  }

  /**
   * Get filter by bot type
   */
  getFilter(botType: 'BB'): BBSignalFilter;
  getFilter(botType: 'DCA'): DCAEntryFilter;
  getFilter(botType: BotType): BBSignalFilter | DCAEntryFilter | null {
    switch (botType) {
      case 'BB':
        return this.bbFilter;
      case 'DCA':
        return this.dcaFilter;
      default:
        return null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EnhancedFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedFilterConfig {
    return { ...this.config };
  }
}

// ==================== FACTORY FUNCTION ====================

let enhancedSignalFilterInstance: EnhancedSignalFilter | null = null;

export function createEnhancedSignalFilter(config?: Partial<EnhancedFilterConfig>): EnhancedSignalFilter {
  return new EnhancedSignalFilter(config);
}

export function getEnhancedSignalFilter(config?: Partial<EnhancedFilterConfig>): EnhancedSignalFilter {
  if (!enhancedSignalFilterInstance) {
    enhancedSignalFilterInstance = new EnhancedSignalFilter(config);
  } else if (config) {
    enhancedSignalFilterInstance.updateConfig(config);
  }
  return enhancedSignalFilterInstance;
}
