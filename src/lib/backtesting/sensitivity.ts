/**
 * Parameter Sensitivity Analysis
 * 
 * Анализ чувствительности параметров стратегии.
 * Определяет, как изменения параметров влияют на результат.
 */

import { BacktestEngine } from "./engine";
import { BacktestResult, BacktestConfig } from "./types";

// ==================== TYPES ====================

export interface SensitivityParameter {
  name: string;
  baseValue: number;
  minValue: number;
  maxValue: number;
  steps: number;  // Number of steps between min and max
}

export interface SensitivityResult {
  parameter: string;
  baseValue: number;
  values: number[];
  results: SensitivityPoint[];
  impact: number;  // Impact score (0-100)
  optimalValue: number;
  optimalResult: BacktestResult | null;
  stability: "STABLE" | "MODERATE" | "SENSITIVE" | "HIGHLY_SENSITIVE";
  recommendation: string;
}

export interface SensitivityPoint {
  value: number;
  pnl: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  tradesCount: number;
}

export interface SensitivityAnalysisResult {
  parameters: SensitivityResult[];
  summary: {
    mostSensitiveParameter: string;
    leastSensitiveParameter: string;
    stableParameters: string[];
    sensitiveParameters: string[];
  };
  recommendations: string[];
}

export interface SensitivityConfig {
  candles: any[];
  baseConfig: BacktestConfig;
  parameters: SensitivityParameter[];
  objective: "pnl" | "sharpe" | "winRate" | "profitFactor";
}

// ==================== SENSITIVITY ANALYZER ====================

export class SensitivityAnalyzer {
  /**
   * Analyze parameter sensitivity
   */
  async analyze(config: SensitivityConfig): Promise<SensitivityAnalysisResult> {
    const results: SensitivityResult[] = [];
    
    for (const param of config.parameters) {
      const result = await this.analyzeParameter(config, param);
      results.push(result);
    }

    // Sort by impact
    results.sort((a, b) => b.impact - a.impact);

    // Generate summary
    const stableParameters = results
      .filter(r => r.stability === "STABLE" || r.stability === "MODERATE")
      .map(r => r.parameter);
    
    const sensitiveParameters = results
      .filter(r => r.stability === "SENSITIVE" || r.stability === "HIGHLY_SENSITIVE")
      .map(r => r.parameter);

    return {
      parameters: results,
      summary: {
        mostSensitiveParameter: results[0]?.parameter || "",
        leastSensitiveParameter: results[results.length - 1]?.parameter || "",
        stableParameters,
        sensitiveParameters,
      },
      recommendations: this.generateRecommendations(results),
    };
  }

  /**
   * Analyze single parameter sensitivity
   */
  private async analyzeParameter(
    config: SensitivityConfig,
    param: SensitivityParameter
  ): Promise<SensitivityResult> {
    const stepSize = (param.maxValue - param.minValue) / param.steps;
    const values: number[] = [];
    const points: SensitivityPoint[] = [];

    // Run backtest for each parameter value
    for (let i = 0; i <= param.steps; i++) {
      const value = param.minValue + i * stepSize;
      values.push(value);

      const modifiedConfig = this.applyParameterValue(config.baseConfig, param.name, value);
      const engine = new BacktestEngine(modifiedConfig);
      const result = await engine.run(config.candles);

      points.push({
        value,
        pnl: result.metrics.totalPnl,
        winRate: result.metrics.winRate,
        sharpeRatio: result.metrics.sharpeRatio,
        maxDrawdown: result.metrics.maxDrawdownPercent,
        profitFactor: result.metrics.profitFactor,
        tradesCount: result.metrics.totalTrades,
      });
    }

    // Calculate impact
    const impact = this.calculateImpact(points, config.objective);

    // Find optimal value
    const optimalPoint = this.findOptimalPoint(points, config.objective);

    // Determine stability
    const stability = this.determineStability(points, config.objective);

    // Generate recommendation
    const recommendation = this.generateRecommendation(param, points, optimalPoint, stability);

    return {
      parameter: param.name,
      baseValue: param.baseValue,
      values,
      results: points,
      impact,
      optimalValue: optimalPoint.value,
      optimalResult: null, // Would need to re-run to get full result
      stability,
      recommendation,
    };
  }

  /**
   * Apply parameter value to config
   */
  private applyParameterValue(
    config: BacktestConfig,
    paramName: string,
    value: number
  ): BacktestConfig {
    const modified = { ...config };
    
    // Apply to strategy parameters
    if (modified.strategyParameters) {
      modified.strategyParameters = {
        ...modified.strategyParameters,
        [paramName]: value,
      };
    }

    // Apply to tactics
    if (paramName === "tpPercent" && modified.tacticsSet.takeProfit) {
      modified.tacticsSet = {
        ...modified.tacticsSet,
        takeProfit: {
          ...modified.tacticsSet.takeProfit,
          tpPercent: value,
        },
      };
    }

    if (paramName === "slPercent" && modified.tacticsSet.stopLoss) {
      modified.tacticsSet = {
        ...modified.tacticsSet,
        stopLoss: {
          ...modified.tacticsSet.stopLoss,
          slPercent: value,
        },
      };
    }

    if (paramName === "positionSize" && modified.tacticsSet.entry) {
      modified.tacticsSet = {
        ...modified.tacticsSet,
        entry: {
          ...modified.tacticsSet.entry,
          positionSizeValue: value,
        },
      };
    }

    return modified;
  }

  /**
   * Calculate impact score
   */
  private calculateImpact(points: SensitivityPoint[], objective: string): number {
    if (points.length < 2) return 0;

    const objectiveKey = this.getObjectiveKey(objective);
    const values = points.map(p => p[objectiveKey] as number);
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // Impact is based on relative range
    const baseValue = values[Math.floor(values.length / 2)];
    if (baseValue === 0) return range > 0 ? 100 : 0;

    const relativeRange = (range / Math.abs(baseValue)) * 100;
    
    // Normalize to 0-100
    return Math.min(100, relativeRange);
  }

  /**
   * Find optimal point
   */
  private findOptimalPoint(points: SensitivityPoint[], objective: string): SensitivityPoint {
    const objectiveKey = this.getObjectiveKey(objective);
    
    // For maxDrawdown, we want minimum
    if (objective === "maxDrawdown") {
      return points.reduce((best, p) => 
        (p[objectiveKey] as number) < (best[objectiveKey] as number) ? p : best
      );
    }

    // For others, we want maximum
    return points.reduce((best, p) => 
      (p[objectiveKey] as number) > (best[objectiveKey] as number) ? p : best
    );
  }

  /**
   * Determine parameter stability
   */
  private determineStability(
    points: SensitivityPoint[],
    objective: string
  ): "STABLE" | "MODERATE" | "SENSITIVE" | "HIGHLY_SENSITIVE" {
    const impact = this.calculateImpact(points, objective);

    if (impact < 10) return "STABLE";
    if (impact < 25) return "MODERATE";
    if (impact < 50) return "SENSITIVE";
    return "HIGHLY_SENSITIVE";
  }

  /**
   * Generate recommendation for parameter
   */
  private generateRecommendation(
    param: SensitivityParameter,
    points: SensitivityPoint[],
    optimal: SensitivityPoint,
    stability: string
  ): string {
    const direction = optimal.value > param.baseValue ? "increase" : 
                      optimal.value < param.baseValue ? "decrease" : "keep";

    if (stability === "STABLE") {
      return `${param.name} is stable. Current value of ${param.baseValue} is acceptable. Consider adjusting other parameters.`;
    }

    if (stability === "HIGHLY_SENSITIVE") {
      return `${param.name} is highly sensitive. ${direction === 'keep' ? 'Current value is optimal.' : `Consider ${direction} to ${optimal.value.toFixed(2)}.`}`;
    }

    return `${param.name} has ${stability.toLowerCase()} sensitivity. Optimal value is ${optimal.value.toFixed(2)}.`;
  }

  /**
   * Generate overall recommendations
   */
  private generateRecommendations(results: SensitivityResult[]): string[] {
    const recommendations: string[] = [];

    // Group by stability
    const sensitive = results.filter(r => r.stability === "SENSITIVE" || r.stability === "HIGHLY_SENSITIVE");
    
    for (const r of sensitive) {
      recommendations.push(r.recommendation);
    }

    // Check for interactions
    if (sensitive.length > 3) {
      recommendations.push("Multiple parameters are sensitive. Consider using walk-forward optimization to avoid overfitting.");
    }

    // Add general recommendation
    const stableCount = results.filter(r => r.stability === "STABLE").length;
    if (stableCount > results.length / 2) {
      recommendations.push("Most parameters are stable, indicating a robust strategy configuration.");
    }

    return recommendations;
  }

  /**
   * Get objective key for accessing SensitivityPoint
   */
  private getObjectiveKey(objective: string): keyof SensitivityPoint {
    const mapping: Record<string, keyof SensitivityPoint> = {
      pnl: "pnl",
      sharpe: "sharpeRatio",
      winRate: "winRate",
      profitFactor: "profitFactor",
    };
    return mapping[objective] || "pnl";
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Quick sensitivity analysis
 */
export async function analyzeSensitivity(
  candles: any[],
  baseConfig: BacktestConfig,
  parameters: SensitivityParameter[],
  objective: "pnl" | "sharpe" | "winRate" | "profitFactor" = "sharpe"
): Promise<SensitivityAnalysisResult> {
  const analyzer = new SensitivityAnalyzer();
  return analyzer.analyze({
    candles,
    baseConfig,
    parameters,
    objective,
  });
}
