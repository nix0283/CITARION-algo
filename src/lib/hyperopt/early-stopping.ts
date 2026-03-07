/**
 * Hyperopt Early Stopping
 */

export interface EarlyStoppingConfig {
  enabled: boolean;
  patience: number;           // Number of iterations without improvement
  minDelta: number;           // Minimum improvement to reset counter
  minIterations: number;      // Minimum iterations before stopping
  restoreBestWeights: boolean;
}

export interface EarlyStoppingState {
  bestScore: number | null;
  bestIteration: number;
  iterationsWithoutImprovement: number;
  shouldStop: boolean;
  reason?: string;
}

const DEFAULT_CONFIG: EarlyStoppingConfig = {
  enabled: true,
  patience: 50,
  minDelta: 0.001,
  minIterations: 20,
  restoreBestWeights: true,
};

export class EarlyStopping {
  private config: EarlyStoppingConfig;
  private state: EarlyStoppingState;
  private iteration: number;

  constructor(config: Partial<EarlyStoppingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      bestScore: null,
      bestIteration: 0,
      iterationsWithoutImprovement: 0,
      shouldStop: false,
    };
    this.iteration = 0;
  }

  /**
   * Check if should stop based on new score
   */
  check(score: number, direction: "maximize" | "minimize" = "maximize"): {
    shouldStop: boolean;
    improved: boolean;
    reason?: string;
  } {
    this.iteration++;

    if (!this.config.enabled) {
      return { shouldStop: false, improved: false };
    }

    // Check minimum iterations
    if (this.iteration < this.config.minIterations) {
      return { shouldStop: false, improved: false };
    }

    let improved = false;

    if (this.state.bestScore === null) {
      this.state.bestScore = score;
      this.state.bestIteration = this.iteration;
      improved = true;
    } else {
      const isBetter = direction === "maximize"
        ? score > this.state.bestScore + this.config.minDelta
        : score < this.state.bestScore - this.config.minDelta;

      if (isBetter) {
        this.state.bestScore = score;
        this.state.bestIteration = this.iteration;
        this.state.iterationsWithoutImprovement = 0;
        improved = true;
      } else {
        this.state.iterationsWithoutImprovement++;
      }
    }

    // Check if should stop
    if (this.state.iterationsWithoutImprovement >= this.config.patience) {
      this.state.shouldStop = true;
      this.state.reason = `No improvement for ${this.config.patience} iterations. Best: ${this.state.bestScore} at iteration ${this.state.bestIteration}`;
      return { shouldStop: true, improved, reason: this.state.reason };
    }

    return { shouldStop: false, improved };
  }

  /**
   * Get best score
   */
  getBestScore(): number | null {
    return this.state.bestScore;
  }

  /**
   * Get best iteration
   */
  getBestIteration(): number {
    return this.state.bestIteration;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.state = {
      bestScore: null,
      bestIteration: 0,
      iterationsWithoutImprovement: 0,
      shouldStop: false,
    };
    this.iteration = 0;
  }

  /**
   * Get state
   */
  getState(): EarlyStoppingState {
    return { ...this.state };
  }
}
