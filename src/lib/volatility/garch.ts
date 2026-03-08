/**
 * VOLATILITY FORECASTING - GARCH Models
 *
 * GARCH (Generalized Autoregressive Conditional Heteroskedasticity)
 * family models for volatility forecasting.
 * 
 * NO NEURAL NETWORKS - Classical econometric methods only.
 */

// =============================================================================
// TYPES
// =============================================================================

export type GARCHType = 'GARCH' | 'GJR-GARCH' | 'EGARCH';

export interface GARCHParams {
  omega: number;  // Constant
  alpha: number;  // ARCH coefficient
  beta: number;   // GARCH coefficient
  gamma?: number; // Asymmetry (GJR-GARCH, EGARCH)
}

export interface GARCHConfig {
  type: GARCHType;
  p: number;      // ARCH order
  q: number;      // GARCH order
  maxIterations: number;
  tolerance: number;
}

export interface GARCHResult {
  params: GARCHParams;
  conditionalVolatility: number[];
  forecast: number[];
  logLikelihood: number;
  aic: number;
  bic: number;
  converged: boolean;
}

// =============================================================================
// GARCH BASE CLASS
// =============================================================================

export abstract class GARCHModel {
  protected config: GARCHConfig;
  protected params: GARCHParams;
  protected returns: number[] = [];
  protected conditionalVolatility: number[] = [];
  protected lastVariance: number = 0;

  constructor(config: Partial<GARCHConfig> = {}) {
    this.config = {
      type: 'GARCH',
      p: 1,
      q: 1,
      maxIterations: 100,
      tolerance: 1e-6,
      ...config,
    };
    this.params = { omega: 0.1, alpha: 0.1, beta: 0.8 };
  }

  /**
   * Fit model to returns data
   */
  public fit(returns: number[]): GARCHResult {
    this.returns = returns;
    const result = this.estimate();
    return result;
  }

  /**
   * Forecast volatility for n steps ahead
   */
  public abstract forecast(steps: number): number[];

  /**
   * Update with new return value
   */
  public abstract update(newReturn: number): number;

  /**
   * Get current volatility estimate
   */
  public getCurrentVolatility(): number {
    return Math.sqrt(this.lastVariance);
  }

  /**
   * Get conditional volatility series
   */
  public getConditionalVolatility(): number[] {
    return this.conditionalVolatility.map(v => Math.sqrt(v));
  }

  /**
   * Calculate log-likelihood
   */
  protected logLikelihood(): number {
    let ll = 0;
    for (let i = 0; i < this.returns.length; i++) {
      const variance = this.conditionalVolatility[i];
      if (variance > 0) {
        ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(variance) + 
                      Math.pow(this.returns[i], 2) / variance);
      }
    }
    return ll;
  }

  /**
   * Estimate parameters using MLE
   */
  protected abstract estimate(): GARCHResult;
}

// =============================================================================
// GARCH(1,1) MODEL
// =============================================================================

class GARCH extends GARCHModel {
  constructor(config: Partial<GARCHConfig> = {}) {
    super({ ...config, type: 'GARCH' });
  }

  protected estimate(): GARCHResult {
    // Initialize with sample variance
    const sampleVar = this.sampleVariance(this.returns);
    this.params.omega = sampleVar * 0.1;
    this.params.alpha = 0.1;
    this.params.beta = 0.8;

    // Iterative estimation
    let converged = false;
    let iteration = 0;
    let prevLL = -Infinity;

    while (iteration < this.config.maxIterations && !converged) {
      // Calculate conditional variances
      this.calculateConditionalVariance();

      // Calculate log-likelihood
      const ll = this.logLikelihood();

      // Check convergence
      if (Math.abs(ll - prevLL) < this.config.tolerance) {
        converged = true;
        break;
      }
      prevLL = ll;

      // Update parameters using gradient-based optimization
      this.updateParameters();

      iteration++;
    }

    const ll = this.logLikelihood();
    const n = this.returns.length;
    const k = 3; // Number of parameters

    return {
      params: { ...this.params },
      conditionalVolatility: this.conditionalVolatility.map(v => Math.sqrt(v)),
      forecast: this.forecast(10),
      logLikelihood: ll,
      aic: -2 * ll + 2 * k,
      bic: -2 * ll + k * Math.log(n),
      converged,
    };
  }

  protected calculateConditionalVariance(): void {
    this.conditionalVolatility = [];
    const variance0 = this.sampleVariance(this.returns);

    for (let i = 0; i < this.returns.length; i++) {
      let variance: number;

      if (i === 0) {
        variance = variance0;
      } else {
        const prevVariance = this.conditionalVolatility[i - 1];
        const prevReturn = this.returns[i - 1];
        variance = this.params.omega + 
                   this.params.alpha * Math.pow(prevReturn, 2) +
                   this.params.beta * prevVariance;
      }

      // Ensure positive variance
      variance = Math.max(variance, 1e-10);
      this.conditionalVolatility.push(variance);
      this.lastVariance = variance;
    }
  }

  protected updateParameters(): void {
    const learningRate = 0.01;
    const { omega, alpha, beta } = this.params;

    // Numerical gradient approximation
    const eps = 1e-5;

    // Gradient for omega
    this.params.omega += learningRate * this.numericalGradient('omega', eps);
    this.params.alpha += learningRate * this.numericalGradient('alpha', eps);
    this.params.beta += learningRate * this.numericalGradient('beta', eps);

    // Constraints: all parameters positive, alpha + beta < 1
    this.params.omega = Math.max(1e-6, this.params.omega);
    this.params.alpha = Math.max(0.001, Math.min(0.5, this.params.alpha));
    this.params.beta = Math.max(0.001, Math.min(0.99, this.params.beta));
    
    if (this.params.alpha + this.params.beta >= 0.999) {
      const sum = this.params.alpha + this.params.beta;
      this.params.alpha *= 0.999 / sum;
      this.params.beta *= 0.999 / sum;
    }
  }

  private numericalGradient(param: string, eps: number): number {
    const originalValue = this.params[param as keyof GARCHParams];
    if (originalValue === undefined) return 0;
    
    // Forward
    (this.params as unknown as Record<string, number>)[param] = originalValue + eps;
    this.calculateConditionalVariance();
    const llForward = this.logLikelihood();

    // Backward
    (this.params as unknown as Record<string, number>)[param] = originalValue - eps;
    this.calculateConditionalVariance();
    const llBackward = this.logLikelihood();

    // Restore
    (this.params as unknown as Record<string, number>)[param] = originalValue;

    return (llForward - llBackward) / (2 * eps);
  }

  public forecast(steps: number): number[] {
    const forecasts: number[] = [];
    let variance = this.lastVariance;

    for (let i = 0; i < steps; i++) {
      variance = this.params.omega + 
                 (this.params.alpha + this.params.beta) * variance;
      forecasts.push(Math.sqrt(variance));
    }

    return forecasts;
  }

  public update(newReturn: number): number {
    this.returns.push(newReturn);
    
    this.lastVariance = this.params.omega + 
                        this.params.alpha * Math.pow(newReturn, 2) +
                        this.params.beta * this.lastVariance;
    
    this.lastVariance = Math.max(this.lastVariance, 1e-10);
    this.conditionalVolatility.push(this.lastVariance);

    return Math.sqrt(this.lastVariance);
  }

  private sampleVariance(data: number[]): number {
    if (data.length < 2) return 0.01;
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    return data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (data.length - 1);
  }
}

// =============================================================================
// GJR-GARCH MODEL
// =============================================================================

class GJRGARCH extends GARCHModel {
  constructor(config: Partial<GARCHConfig> = {}) {
    super({ ...config, type: 'GJR-GARCH' });
    this.params.gamma = 0.1;
  }

  protected estimate(): GARCHResult {
    const sampleVar = this.sampleVariance(this.returns);
    this.params.omega = sampleVar * 0.1;
    this.params.alpha = 0.05;
    this.params.beta = 0.8;
    this.params.gamma = 0.1;

    let converged = false;
    let iteration = 0;
    let prevLL = -Infinity;

    while (iteration < this.config.maxIterations && !converged) {
      this.calculateConditionalVariance();
      const ll = this.logLikelihood();

      if (Math.abs(ll - prevLL) < this.config.tolerance) {
        converged = true;
        break;
      }
      prevLL = ll;
      this.updateParameters();
      iteration++;
    }

    const ll = this.logLikelihood();
    const n = this.returns.length;
    const k = 4;

    return {
      params: { ...this.params },
      conditionalVolatility: this.conditionalVolatility.map(v => Math.sqrt(v)),
      forecast: this.forecast(10),
      logLikelihood: ll,
      aic: -2 * ll + 2 * k,
      bic: -2 * ll + k * Math.log(n),
      converged,
    };
  }

  protected calculateConditionalVariance(): void {
    this.conditionalVolatility = [];
    const variance0 = this.sampleVariance(this.returns);

    for (let i = 0; i < this.returns.length; i++) {
      let variance: number;

      if (i === 0) {
        variance = variance0;
      } else {
        const prevVariance = this.conditionalVolatility[i - 1];
        const prevReturn = this.returns[i - 1];
        const indicator = prevReturn < 0 ? 1 : 0; // Asymmetry for negative returns
        
        variance = this.params.omega + 
                   this.params.alpha * Math.pow(prevReturn, 2) +
                   (this.params.gamma || 0) * Math.pow(prevReturn, 2) * indicator +
                   this.params.beta * prevVariance;
      }

      variance = Math.max(variance, 1e-10);
      this.conditionalVolatility.push(variance);
      this.lastVariance = variance;
    }
  }

  protected updateParameters(): void {
    const learningRate = 0.005;
    const eps = 1e-5;

    this.params.omega += learningRate * this.numericalGradient('omega', eps);
    this.params.alpha += learningRate * this.numericalGradient('alpha', eps);
    this.params.beta += learningRate * this.numericalGradient('beta', eps);
    if (this.params.gamma !== undefined) {
      this.params.gamma += learningRate * this.numericalGradient('gamma', eps);
    }

    // Constraints
    this.params.omega = Math.max(1e-6, this.params.omega);
    this.params.alpha = Math.max(0.001, Math.min(0.5, this.params.alpha));
    this.params.beta = Math.max(0.001, Math.min(0.99, this.params.beta));
    if (this.params.gamma !== undefined) {
      this.params.gamma = Math.max(0, Math.min(0.5, this.params.gamma));
    }

    // Persistence constraint
    const persistence = this.params.alpha + this.params.beta + 
                        (this.params.gamma || 0) / 2;
    if (persistence >= 0.999) {
      const scale = 0.999 / persistence;
      this.params.alpha *= scale;
      this.params.beta *= scale;
      if (this.params.gamma !== undefined) {
        this.params.gamma *= scale;
      }
    }
  }

  private numericalGradient(param: string, eps: number): number {
    const originalValue = (this.params as unknown as Record<string, number>)[param];
    if (originalValue === undefined) return 0;
    
    (this.params as unknown as Record<string, number>)[param] = originalValue + eps;
    this.calculateConditionalVariance();
    const llForward = this.logLikelihood();

    (this.params as unknown as Record<string, number>)[param] = originalValue - eps;
    this.calculateConditionalVariance();
    const llBackward = this.logLikelihood();

    (this.params as unknown as Record<string, number>)[param] = originalValue;

    return (llForward - llBackward) / (2 * eps);
  }

  public forecast(steps: number): number[] {
    const forecasts: number[] = [];
    let variance = this.lastVariance;

    for (let i = 0; i < steps; i++) {
      // Long-run variance under GJR-GARCH
      const persistence = this.params.alpha + this.params.beta + 
                          (this.params.gamma || 0) / 2;
      variance = this.params.omega + persistence * variance;
      forecasts.push(Math.sqrt(variance));
    }

    return forecasts;
  }

  public update(newReturn: number): number {
    this.returns.push(newReturn);
    
    const indicator = newReturn < 0 ? 1 : 0;
    this.lastVariance = this.params.omega + 
                        this.params.alpha * Math.pow(newReturn, 2) +
                        (this.params.gamma || 0) * Math.pow(newReturn, 2) * indicator +
                        this.params.beta * this.lastVariance;
    
    this.lastVariance = Math.max(this.lastVariance, 1e-10);
    this.conditionalVolatility.push(this.lastVariance);

    return Math.sqrt(this.lastVariance);
  }

  private sampleVariance(data: number[]): number {
    if (data.length < 2) return 0.01;
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    return data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (data.length - 1);
  }
}

// =============================================================================
// EGARCH MODEL
// =============================================================================

class EGARCH extends GARCHModel {
  constructor(config: Partial<GARCHConfig> = {}) {
    super({ ...config, type: 'EGARCH' });
    this.params.gamma = 0;
  }

  protected estimate(): GARCHResult {
    this.params.omega = -0.1;
    this.params.alpha = 0.1;
    this.params.beta = 0.9;
    this.params.gamma = 0;

    let converged = false;
    let iteration = 0;
    let prevLL = -Infinity;

    while (iteration < this.config.maxIterations && !converged) {
      this.calculateConditionalVariance();
      const ll = this.logLikelihood();

      if (Math.abs(ll - prevLL) < this.config.tolerance) {
        converged = true;
        break;
      }
      prevLL = ll;
      this.updateParameters();
      iteration++;
    }

    const ll = this.logLikelihood();
    const n = this.returns.length;
    const k = 4;

    return {
      params: { ...this.params },
      conditionalVolatility: this.conditionalVolatility.map(v => Math.sqrt(v)),
      forecast: this.forecast(10),
      logLikelihood: ll,
      aic: -2 * ll + 2 * k,
      bic: -2 * ll + k * Math.log(n),
      converged,
    };
  }

  protected calculateConditionalVariance(): void {
    this.conditionalVolatility = [];
    const variance0 = this.sampleVariance(this.returns);
    let logVariance = Math.log(Math.max(variance0, 1e-10));

    for (let i = 0; i < this.returns.length; i++) {
      if (i > 0) {
        const prevReturn = this.returns[i - 1];
        const stdReturn = prevReturn / Math.sqrt(this.conditionalVolatility[i - 1] || variance0);
        
        // EGARCH: log(σ²) = ω + α(|z| - E|z|) + γz + β*log(σ²₋₁)
        // E|z| ≈ sqrt(2/π) for normal distribution
        logVariance = this.params.omega + 
                      this.params.alpha * (Math.abs(stdReturn) - Math.sqrt(2 / Math.PI)) +
                      (this.params.gamma || 0) * stdReturn +
                      this.params.beta * logVariance;
      }

      const variance = Math.exp(logVariance);
      this.conditionalVolatility.push(variance);
      this.lastVariance = variance;
    }
  }

  protected updateParameters(): void {
    const learningRate = 0.005;
    const eps = 1e-5;

    this.params.omega += learningRate * this.numericalGradient('omega', eps);
    this.params.alpha += learningRate * this.numericalGradient('alpha', eps);
    this.params.beta += learningRate * this.numericalGradient('beta', eps);
    if (this.params.gamma !== undefined) {
      this.params.gamma += learningRate * this.numericalGradient('gamma', eps);
    }

    // Constraints for EGARCH
    this.params.alpha = Math.max(0, Math.min(1, this.params.alpha));
    this.params.beta = Math.max(0, Math.min(0.999, this.params.beta));
  }

  private numericalGradient(param: string, eps: number): number {
    const originalValue = (this.params as unknown as Record<string, number>)[param];
    if (originalValue === undefined) return 0;
    
    (this.params as unknown as Record<string, number>)[param] = originalValue + eps;
    this.calculateConditionalVariance();
    const llForward = this.logLikelihood();

    (this.params as unknown as Record<string, number>)[param] = originalValue - eps;
    this.calculateConditionalVariance();
    const llBackward = this.logLikelihood();

    (this.params as unknown as Record<string, number>)[param] = originalValue;

    return (llForward - llBackward) / (2 * eps);
  }

  public forecast(steps: number): number[] {
    const forecasts: number[] = [];
    let logVariance = Math.log(this.lastVariance);

    for (let i = 0; i < steps; i++) {
      // Long-run log variance
      logVariance = this.params.omega / (1 - this.params.beta) + 
                    this.params.beta * logVariance;
      forecasts.push(Math.sqrt(Math.exp(logVariance)));
    }

    return forecasts;
  }

  public update(newReturn: number): number {
    this.returns.push(newReturn);
    
    const stdReturn = newReturn / Math.sqrt(this.lastVariance);
    const logVariance = Math.log(this.lastVariance);
    
    const newLogVariance = this.params.omega + 
                           this.params.alpha * (Math.abs(stdReturn) - Math.sqrt(2 / Math.PI)) +
                           (this.params.gamma || 0) * stdReturn +
                           this.params.beta * logVariance;
    
    this.lastVariance = Math.exp(newLogVariance);
    this.conditionalVolatility.push(this.lastVariance);

    return Math.sqrt(this.lastVariance);
  }

  private sampleVariance(data: number[]): number {
    if (data.length < 2) return 0.01;
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    return data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (data.length - 1);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

function createGARCHModel(type: GARCHType, config?: Partial<GARCHConfig>): GARCHModel {
  switch (type) {
    case 'GARCH':
      return new GARCH(config);
    case 'GJR-GARCH':
      return new GJRGARCH(config);
    case 'EGARCH':
      return new EGARCH(config);
    default:
      return new GARCH(config);
  }
}

// =============================================================================
// VOLATILITY ANALYZER
// =============================================================================

class VolatilityAnalyzer {
  private models: Map<string, GARCHModel> = new Map();
  private returns: Map<string, number[]> = new Map();

  /**
   * Add price data for a symbol
   */
  public addPriceData(symbol: string, prices: number[]): void {
    const returns = this.calculateReturns(prices);
    this.returns.set(symbol, returns);
  }

  /**
   * Fit GARCH model for symbol
   */
  public fitModel(symbol: string, type: GARCHType = 'GARCH'): GARCHResult | null {
    const returns = this.returns.get(symbol);
    if (!returns || returns.length < 30) return null;

    const model = createGARCHModel(type);
    const result = model.fit(returns);
    this.models.set(symbol, model);

    return result;
  }

  /**
   * Get current volatility for symbol
   */
  public getCurrentVolatility(symbol: string): number | null {
    const model = this.models.get(symbol);
    return model ? model.getCurrentVolatility() : null;
  }

  /**
   * Forecast volatility for symbol
   */
  public forecast(symbol: string, steps: number = 10): number[] | null {
    const model = this.models.get(symbol);
    return model ? model.forecast(steps) : null;
  }

  /**
   * Update with new price
   */
  public update(symbol: string, newPrice: number): number | null {
    const returns = this.returns.get(symbol);
    const model = this.models.get(symbol);
    
    if (!returns || !model) return null;

    const lastPrice = returns[returns.length - 1];
    const newReturn = (newPrice - lastPrice) / lastPrice;
    
    returns.push(newReturn);
    return model.update(newReturn);
  }

  /**
   * Get volatility regime
   */
  public getVolatilityRegime(symbol: string): 'low' | 'normal' | 'high' | 'extreme' {
    const model = this.models.get(symbol);
    const returns = this.returns.get(symbol);
    
    if (!model || !returns) return 'normal';

    const currentVol = model.getCurrentVolatility();
    const avgVol = this.calculateAverageVolatility(returns);
    const ratio = currentVol / avgVol;

    if (ratio < 0.5) return 'low';
    if (ratio < 1.5) return 'normal';
    if (ratio < 2.5) return 'high';
    return 'extreme';
  }

  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
    }
    return returns;
  }

  private calculateAverageVolatility(returns: number[]): number {
    if (returns.length === 0) return 0.01;
    const variance = returns.reduce((sum, r) => sum + r * r, 0) / returns.length;
    return Math.sqrt(variance);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { GARCH, GJRGARCH, EGARCH, createGARCHModel, VolatilityAnalyzer };
