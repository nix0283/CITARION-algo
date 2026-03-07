/**
 * DCA Entry Filter
 * 
 * Signal filter for DCA (Dollar Cost Averaging) strategies.
 * Evaluates entry signals for DCA positions based on price drops, RSI, and ATR.
 */

// ==================== TYPES ====================

export interface DCASignal {
  symbol: string;
  currentPrice: number;
  avgEntryPrice: number;
  currentLevel: number;       // Current DCA level (0 = initial)
  maxLevels: number;
  
  // Position info
  totalInvested: number;
  totalAmount: number;
  unrealizedPnl: number;
  
  // Market context
  rsi: number;
  atr: number;
  priceDropPercent: number;   // From initial entry
}

export interface DCAFilterResult {
  approved: boolean;
  confidence: number;
  level: number;              // Recommended DCA level
  amount: number;             // Recommended amount multiplier
  reasons: string[];
  avgEntryAdjustment: number; // New avg entry after DCA
}

export interface DCAFilterConfig {
  // Price drop thresholds per level (percentage)
  levelDropThresholds: number[];
  
  // RSI thresholds
  rsiOversold: number;
  rsiSeverelyOversold: number;
  
  // Amount multipliers per level
  amountMultipliers: number[];
  
  // ATR-based adjustments
  atrMultiplierThreshold: number;
  
  // Minimum thresholds
  minConfidence: number;
  
  // Base amount for calculations
  baseAmount: number;
  
  // Margin check
  requireMarginCheck: boolean;
  minMarginPercent: number;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_DCA_FILTER_CONFIG: DCAFilterConfig = {
  // Price must drop this much from previous level to trigger next DCA
  levelDropThresholds: [3, 5, 7, 10, 15, 20, 25, 30, 35, 40],
  
  // RSI thresholds
  rsiOversold: 30,
  rsiSeverelyOversold: 20,
  
  // Amount multipliers (1.5x base per level is common)
  amountMultipliers: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5],
  
  // ATR threshold for volatility consideration
  atrMultiplierThreshold: 2,
  
  // Minimum confidence to approve DCA
  minConfidence: 0.5,
  
  // Base amount for DCA
  baseAmount: 100,
  
  // Margin requirements
  requireMarginCheck: true,
  minMarginPercent: 10,
};

// ==================== DCA ENTRY FILTER CLASS ====================

export class DCAEntryFilter {
  private config: DCAFilterConfig;
  private positionHistory: Map<string, DCASignal[]> = new Map();

  constructor(config: Partial<DCAFilterConfig> = {}) {
    this.config = { ...DEFAULT_DCA_FILTER_CONFIG, ...config };
  }

  /**
   * Evaluate a DCA signal and return filter result
   */
  async evaluate(signal: DCASignal): Promise<DCAFilterResult> {
    const reasons: string[] = [];
    let confidence = 0.5;
    let approved = false;
    let level = signal.currentLevel;
    let amount = this.calculateAmount(signal);
    let avgEntryAdjustment = 0;

    // Store signal for history tracking
    this.storeSignal(signal);

    // Check if within max levels
    if (signal.currentLevel >= signal.maxLevels) {
      return {
        approved: false,
        confidence: 0,
        level: signal.currentLevel,
        amount: 0,
        reasons: ['Maximum DCA levels reached'],
        avgEntryAdjustment: 0,
      };
    }

    // Check price drop requirement
    const priceDropResult = this.checkPriceDrop(signal);
    reasons.push(...priceDropResult.reasons);
    
    // Check RSI conditions
    const rsiResult = this.checkRSI(signal);
    reasons.push(...rsiResult.reasons);
    confidence = Math.max(confidence, rsiResult.confidence);

    // Calculate optimal level
    level = this.calculateOptimalLevel(signal);
    
    // Calculate amount based on level
    amount = this.calculateAmount(signal);
    
    // Calculate new average entry
    avgEntryAdjustment = this.calculateAvgEntryAdjustment(signal, amount);

    // Determine if DCA should be approved
    approved = this.shouldApproveDCA(signal, priceDropResult, rsiResult);

    // Add ATR-based volatility considerations
    const atrResult = this.checkATR(signal);
    reasons.push(...atrResult.reasons);
    if (atrResult.adjusted) {
      amount = amount * atrResult.amountMultiplier;
      reasons.push(`ATR adjustment: amount multiplied by ${atrResult.amountMultiplier.toFixed(2)}`);
    }

    // Final confidence calculation
    confidence = this.calculateFinalConfidence(signal, priceDropResult, rsiResult, atrResult);

    // Generate final reason
    if (approved) {
      reasons.push(`DCA Level ${level + 1} approved with ${(confidence * 100).toFixed(1)}% confidence`);
    } else {
      reasons.push(`DCA not approved: insufficient conditions`);
    }

    return {
      approved,
      confidence,
      level: level + 1, // Return next level
      amount,
      reasons,
      avgEntryAdjustment,
    };
  }

  /**
   * Check if price dropped enough for next DCA level
   */
  private checkPriceDrop(signal: DCASignal): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const { priceDropPercent, currentLevel } = signal;

    // Get threshold for next level
    const nextLevel = currentLevel + 1;
    const threshold = this.config.levelDropThresholds[nextLevel - 1] || 
                      this.config.levelDropThresholds[this.config.levelDropThresholds.length - 1];

    const passed = priceDropPercent >= threshold;

    if (passed) {
      reasons.push(`Price drop ${priceDropPercent.toFixed(2)}% meets threshold ${threshold}%`);
    } else {
      reasons.push(`Price drop ${priceDropPercent.toFixed(2)}% below threshold ${threshold}%`);
    }

    return { passed, reasons };
  }

  /**
   * Check RSI conditions for DCA entry
   */
  private checkRSI(signal: DCASignal): { passed: boolean; confidence: number; reasons: string[] } {
    const reasons: string[] = [];
    const { rsi } = signal;
    let confidence = 0.3;

    // RSI oversold conditions
    if (rsi <= this.config.rsiSeverelyOversold) {
      confidence = 0.8;
      reasons.push(`RSI severely oversold (${rsi.toFixed(1)}) - strong DCA signal`);
      return { passed: true, confidence, reasons };
    }

    if (rsi <= this.config.rsiOversold) {
      confidence = 0.65;
      reasons.push(`RSI oversold (${rsi.toFixed(1)}) - good DCA signal`);
      return { passed: true, confidence, reasons };
    }

    if (rsi < 40) {
      confidence = 0.5;
      reasons.push(`RSI approaching oversold (${rsi.toFixed(1)}) - moderate DCA signal`);
      return { passed: true, confidence, reasons };
    }

    if (rsi < 50) {
      confidence = 0.35;
      reasons.push(`RSI neutral (${rsi.toFixed(1)}) - weak DCA signal`);
      return { passed: false, confidence, reasons };
    }

    reasons.push(`RSI not favorable (${rsi.toFixed(1)}) - DCA not recommended`);
    return { passed: false, confidence: 0.2, reasons };
  }

  /**
   * Check ATR for volatility-based adjustments
   */
  private checkATR(signal: DCASignal): { adjusted: boolean; amountMultiplier: number; reasons: string[] } {
    const reasons: string[] = [];
    const { atr, currentPrice, avgEntryPrice } = signal;

    // Calculate ATR as percentage of price
    const atrPercent = (atr / currentPrice) * 100;
    
    // If high volatility, consider increasing DCA amount
    if (atrPercent > this.config.atrMultiplierThreshold) {
      const multiplier = 1 + ((atrPercent - this.config.atrMultiplierThreshold) / 10);
      reasons.push(`High volatility detected (ATR: ${atrPercent.toFixed(2)}%), suggesting larger DCA`);
      return { adjusted: true, amountMultiplier: Math.min(multiplier, 1.5), reasons };
    }

    reasons.push(`Normal volatility (ATR: ${atrPercent.toFixed(2)}%)`);
    return { adjusted: false, amountMultiplier: 1, reasons };
  }

  /**
   * Calculate optimal DCA level based on price drop
   */
  private calculateOptimalLevel(signal: DCASignal): number {
    const { priceDropPercent, currentLevel, maxLevels } = signal;

    // Find the appropriate level based on price drop
    for (let i = 0; i < this.config.levelDropThresholds.length; i++) {
      if (priceDropPercent < this.config.levelDropThresholds[i]) {
        return Math.min(i, currentLevel, maxLevels - 1);
      }
    }

    // If price dropped more than all thresholds, use max level
    return Math.min(this.config.levelDropThresholds.length - 1, currentLevel, maxLevels - 1);
  }

  /**
   * Calculate DCA amount based on level
   */
  private calculateAmount(signal: DCASignal): number {
    const nextLevel = signal.currentLevel + 1;
    const multiplier = this.config.amountMultipliers[nextLevel - 1] || 
                       this.config.amountMultipliers[this.config.amountMultipliers.length - 1];
    
    return this.config.baseAmount * multiplier;
  }

  /**
   * Calculate new average entry after DCA
   */
  private calculateAvgEntryAdjustment(signal: DCASignal, dcaAmount: number): number {
    const { avgEntryPrice, currentPrice, totalInvested, totalAmount } = signal;

    // Calculate new average entry
    const newTotalInvested = totalInvested + dcaAmount;
    const newAmount = totalAmount + (dcaAmount / currentPrice);
    const newAvgEntry = newTotalInvested / newAmount;

    // Return the adjustment (negative means avg entry decreased)
    return newAvgEntry - avgEntryPrice;
  }

  /**
   * Determine if DCA should be approved
   */
  private shouldApproveDCA(
    signal: DCASignal,
    priceDropResult: { passed: boolean },
    rsiResult: { passed: boolean }
  ): boolean {
    // Must have both price drop and RSI confirmation
    if (!priceDropResult.passed) return false;

    // RSI confirmation is preferred but not always required for deeper levels
    if (!rsiResult.passed && signal.currentLevel < 3) return false;

    return true;
  }

  /**
   * Calculate final confidence score
   */
  private calculateFinalConfidence(
    signal: DCASignal,
    priceDropResult: { passed: boolean },
    rsiResult: { passed: boolean; confidence: number },
    atrResult: { adjusted: boolean }
  ): number {
    let confidence = 0.5;

    // Price drop contribution
    if (priceDropResult.passed) {
      confidence += 0.15;
      
      // Bonus for larger drops
      const dropBonus = Math.min(signal.priceDropPercent / 100, 0.15);
      confidence += dropBonus;
    }

    // RSI contribution
    confidence = Math.max(confidence, rsiResult.confidence);

    // ATR adjustment bonus
    if (atrResult.adjusted) {
      confidence += 0.05;
    }

    // Level consideration - deeper levels get slight penalty
    const levelPenalty = signal.currentLevel * 0.03;
    confidence -= levelPenalty;

    // Unrealized PnL consideration
    if (signal.unrealizedPnl < 0) {
      const pnlPercent = Math.abs(signal.unrealizedPnl / signal.totalInvested);
      // If already significant loss, confidence drops
      if (pnlPercent > 0.1) {
        confidence -= 0.1;
      }
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Store signal in history
   */
  private storeSignal(signal: DCASignal): void {
    const history = this.positionHistory.get(signal.symbol) || [];
    history.push(signal);
    
    if (history.length > 50) {
      history.shift();
    }
    
    this.positionHistory.set(signal.symbol, history);
  }

  /**
   * Get position history for a symbol
   */
  getPositionHistory(symbol: string): DCASignal[] {
    return this.positionHistory.get(symbol) || [];
  }

  /**
   * Calculate DCA levels for a position
   */
  calculateDCALevels(
    entryPrice: number,
    baseAmount: number,
    maxLevels: number
  ): Array<{ level: number; triggerPrice: number; amount: number; avgEntryAfter: number }> {
    const levels: Array<{ level: number; triggerPrice: number; amount: number; avgEntryAfter: number }> = [];
    let totalInvested = baseAmount;
    let totalAmount = baseAmount / entryPrice;

    for (let i = 0; i < maxLevels; i++) {
      const threshold = this.config.levelDropThresholds[i] || 
                        this.config.levelDropThresholds[this.config.levelDropThresholds.length - 1];
      
      const triggerPrice = entryPrice * (1 - threshold / 100);
      const multiplier = this.config.amountMultipliers[i] || 
                         this.config.amountMultipliers[this.config.amountMultipliers.length - 1];
      const amount = this.config.baseAmount * multiplier;

      totalInvested += amount;
      totalAmount += amount / triggerPrice;
      const avgEntryAfter = totalInvested / totalAmount;

      levels.push({
        level: i + 1,
        triggerPrice,
        amount,
        avgEntryAfter,
      });
    }

    return levels;
  }

  /**
   * Clear position history
   */
  clearHistory(symbol?: string): void {
    if (symbol) {
      this.positionHistory.delete(symbol);
    } else {
      this.positionHistory.clear();
    }
  }

  /**
   * Update filter configuration
   */
  updateConfig(config: Partial<DCAFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): DCAFilterConfig {
    return { ...this.config };
  }
}

// ==================== FACTORY FUNCTION ====================

let dcaEntryFilterInstance: DCAEntryFilter | null = null;

export function getDCAEntryFilter(config?: Partial<DCAFilterConfig>): DCAEntryFilter {
  if (!dcaEntryFilterInstance) {
    dcaEntryFilterInstance = new DCAEntryFilter(config);
  } else if (config) {
    dcaEntryFilterInstance.updateConfig(config);
  }
  return dcaEntryFilterInstance;
}

export function createDCAEntryFilter(config?: Partial<DCAFilterConfig>): DCAEntryFilter {
  return new DCAEntryFilter(config);
}
