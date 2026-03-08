/**
 * AI-Enhanced Backtesting Module
 * 
 * Based on Profitmaker's AI-driven backtesting roadmap ideas.
 * Provides AI-powered strategy optimization and analysis.
 */

import ZAI from 'z-ai-web-dev-sdk';

// ==================== Types ====================

export interface AIBacktestConfig {
  strategyName: string;
  symbol: string;
  timeframe: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  optimizationTarget: 'sharpe' | 'return' | 'winRate' | 'custom';
  customObjective?: string;
  maxIterations: number;
  populationSize: number;
  mutationRate: number;
  crossoverRate: number;
}

export interface StrategyParameter {
  name: string;
  type: 'number' | 'integer' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  current: number | boolean | string;
}

export interface OptimizationResult {
  bestParameters: Record<string, unknown>;
  bestScore: number;
  iterations: number;
  improvements: OptimizationIteration[];
  analysis: AIAnalysis;
}

export interface OptimizationIteration {
  iteration: number;
  parameters: Record<string, unknown>;
  score: number;
  metrics: Record<string, number>;
}

export interface AIAnalysis {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  marketConditions: MarketConditionAnalysis[];
  riskAssessment: string;
}

export interface MarketConditionAnalysis {
  condition: 'trending' | 'ranging' | 'volatile' | 'calm';
  performance: number;
  trades: number;
  recommendation: string;
}

export interface BacktestResult {
  trades: TradeResult[];
  equityCurve: EquityPoint[];
  metrics: Record<string, number>;
  parameters: Record<string, unknown>;
}

export interface TradeResult {
  entryTime: number;
  exitTime: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  amount: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  signal: string;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
}

// ==================== AI Strategy Optimizer ====================

/**
 * AI-powered strategy parameter optimization
 */
export class AIStrategyOptimizer {
  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

  /**
   * Initialize AI client
   */
  async initialize(): Promise<void> {
    this.zai = await ZAI.create();
  }

  /**
   * Optimize strategy parameters using AI-guided genetic algorithm
   */
  async optimizeStrategy(
    config: AIBacktestConfig,
    parameters: StrategyParameter[],
    backtestFn: (params: Record<string, unknown>) => Promise<BacktestResult>
  ): Promise<OptimizationResult> {
    if (!this.zai) {
      await this.initialize();
    }

    const iterations: OptimizationIteration[] = [];
    let bestResult: BacktestResult | null = null;
    let bestParams: Record<string, unknown> = {};
    let bestScore = -Infinity;

    // Initialize population
    const population = this.initializePopulation(parameters, config.populationSize);

    for (let gen = 0; gen < config.maxIterations; gen++) {
      // Evaluate each individual
      const evaluated = await Promise.all(
        population.map(async (individual) => {
          const result = await backtestFn(individual);
          const score = this.calculateScore(result, config);
          return { individual, result, score };
        })
      );

      // Sort by score
      evaluated.sort((a, b) => b.score - a.score);

      // Track best
      if (evaluated[0].score > bestScore) {
        bestScore = evaluated[0].score;
        bestParams = evaluated[0].individual;
        bestResult = evaluated[0].result;
      }

      // Record iteration
      iterations.push({
        iteration: gen + 1,
        parameters: evaluated[0].individual,
        score: evaluated[0].score,
        metrics: evaluated[0].result.metrics,
      });

      // Log progress
      if (gen % 10 === 0) {
        console.log(`Generation ${gen + 1}: Best score = ${bestScore.toFixed(4)}`);
      }

      // AI-guided selection
      const selected = await this.aiSelect(evaluated, config.populationSize / 2);

      // Create next generation
      const newPopulation = await this.createNextGeneration(
        selected,
        parameters,
        config.populationSize,
        config.mutationRate,
        config.crossoverRate
      );

      population.length = 0;
      population.push(...newPopulation);
    }

    // Generate AI analysis
    const analysis = await this.generateAnalysis(bestResult!, bestParams, iterations);

    return {
      bestParameters: bestParams,
      bestScore,
      iterations: config.maxIterations,
      improvements: iterations,
      analysis,
    };
  }

  /**
   * AI-guided parameter suggestion
   */
  async suggestParameterImprovements(
    currentParams: Record<string, unknown>,
    historicalResults: OptimizationIteration[]
  ): Promise<Record<string, unknown>> {
    if (!this.zai) {
      await this.initialize();
    }

    const prompt = `
Analyze the following optimization history and suggest improved parameters:

Current best parameters: ${JSON.stringify(currentParams, null, 2)}

Recent optimization history:
${JSON.stringify(historicalResults.slice(-10), null, 2)}

Based on the trends, suggest improved parameter values that might yield better results.
Return ONLY a JSON object with the suggested parameter values, no other text.
`;

    try {
      const completion = await this.zai!.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a quantitative trading strategy optimizer. Analyze patterns and suggest parameter improvements.' },
          { role: 'user', content: prompt },
        ],
      });

      const response = completion.choices[0]?.message?.content || '';
      
      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('AI suggestion failed:', error);
    }

    return currentParams;
  }

  // ==================== Private Methods ====================

  private initializePopulation(
    parameters: StrategyParameter[],
    size: number
  ): Record<string, unknown>[] {
    const population: Record<string, unknown>[] = [];

    for (let i = 0; i < size; i++) {
      const individual: Record<string, unknown> = {};

      for (const param of parameters) {
        individual[param.name] = this.randomParameterValue(param);
      }

      population.push(individual);
    }

    return population;
  }

  private randomParameterValue(param: StrategyParameter): unknown {
    switch (param.type) {
      case 'number':
        const min = param.min ?? 0;
        const max = param.max ?? 100;
        return min + Math.random() * (max - min);
      
      case 'integer':
        const intMin = param.min ?? 0;
        const intMax = param.max ?? 100;
        return Math.floor(intMin + Math.random() * (intMax - intMin + 1));
      
      case 'boolean':
        return Math.random() > 0.5;
      
      case 'select':
        const options = param.options ?? [''];
        return options[Math.floor(Math.random() * options.length)];
      
      default:
        return param.current;
    }
  }

  private calculateScore(result: BacktestResult, config: AIBacktestConfig): number {
    const metrics = result.metrics;

    switch (config.optimizationTarget) {
      case 'sharpe':
        return metrics.sharpeRatio || 0;
      
      case 'return':
        return metrics.totalReturnPercent || 0;
      
      case 'winRate':
        return metrics.winRate || 0;
      
      case 'custom':
        // Custom objective would be evaluated differently
        return (metrics.totalReturnPercent || 0) * (metrics.sharpeRatio || 1);
      
      default:
        return metrics.sharpeRatio || 0;
    }
  }

  private async aiSelect(
    evaluated: Array<{ individual: Record<string, unknown>; result: BacktestResult; score: number }>,
    count: number
  ): Promise<Record<string, unknown>[]> {
    // Select top performers + some diversity
    const selected: Record<string, unknown>[] = [];

    // Elite selection (top 30%)
    const eliteCount = Math.floor(count * 0.3);
    for (let i = 0; i < eliteCount && i < evaluated.length; i++) {
      selected.push(evaluated[i].individual);
    }

    // Tournament selection for remaining
    while (selected.length < count) {
      const tournament = this.tournamentSelect(evaluated, 3);
      selected.push(tournament);
    }

    return selected;
  }

  private tournamentSelect(
    population: Array<{ individual: Record<string, unknown>; score: number }>,
    tournamentSize: number
  ): Record<string, unknown> {
    let best = null;

    for (let i = 0; i < tournamentSize; i++) {
      const idx = Math.floor(Math.random() * population.length);
      const contestant = population[idx];

      if (!best || contestant.score > best.score) {
        best = contestant;
      }
    }

    return best!.individual;
  }

  private async createNextGeneration(
    selected: Record<string, unknown>[],
    parameters: StrategyParameter[],
    populationSize: number,
    mutationRate: number,
    crossoverRate: number
  ): Promise<Record<string, unknown>[]> {
    const nextGen: Record<string, unknown>[] = [];

    // Elitism: keep top performers
    nextGen.push(...selected.slice(0, Math.floor(populationSize * 0.1)));

    // Create offspring through crossover and mutation
    while (nextGen.length < populationSize) {
      const parent1 = selected[Math.floor(Math.random() * selected.length)];
      const parent2 = selected[Math.floor(Math.random() * selected.length)];

      let child: Record<string, unknown>;

      if (Math.random() < crossoverRate) {
        child = this.crossover(parent1, parent2);
      } else {
        child = { ...parent1 };
      }

      if (Math.random() < mutationRate) {
        child = this.mutate(child, parameters);
      }

      nextGen.push(child);
    }

    return nextGen;
  }

  private crossover(
    parent1: Record<string, unknown>,
    parent2: Record<string, unknown>
  ): Record<string, unknown> {
    const child: Record<string, unknown> = {};

    for (const key of Object.keys(parent1)) {
      child[key] = Math.random() > 0.5 ? parent1[key] : parent2[key];
    }

    return child;
  }

  private mutate(
    individual: Record<string, unknown>,
    parameters: StrategyParameter[]
  ): Record<string, unknown> {
    const mutated = { ...individual };

    // Select random parameter to mutate
    const param = parameters[Math.floor(Math.random() * parameters.length)];
    
    if (param.type === 'number' || param.type === 'integer') {
      const current = individual[param.name] as number;
      const range = ((param.max ?? 100) - (param.min ?? 0)) * 0.1;
      mutated[param.name] = current + (Math.random() * 2 - 1) * range;
      
      // Clamp to bounds
      if (param.min !== undefined) {
        mutated[param.name] = Math.max(param.min, mutated[param.name] as number);
      }
      if (param.max !== undefined) {
        mutated[param.name] = Math.min(param.max, mutated[param.name] as number);
      }
    } else if (param.type === 'boolean') {
      mutated[param.name] = !individual[param.name];
    } else if (param.type === 'select' && param.options) {
      mutated[param.name] = param.options[Math.floor(Math.random() * param.options.length)];
    }

    return mutated;
  }

  private async generateAnalysis(
    result: BacktestResult,
    params: Record<string, unknown>,
    iterations: OptimizationIteration[]
  ): Promise<AIAnalysis> {
    if (!this.zai) {
      await this.initialize();
    }

    const prompt = `
Analyze this trading strategy optimization result:

Parameters: ${JSON.stringify(params, null, 2)}

Performance Metrics:
- Total Return: ${result.metrics.totalReturnPercent?.toFixed(2)}%
- Sharpe Ratio: ${result.metrics.sharpeRatio?.toFixed(2)}
- Win Rate: ${result.metrics.winRate?.toFixed(1)}%
- Max Drawdown: ${result.metrics.maxDrawdownPercent?.toFixed(2)}%
- Total Trades: ${result.metrics.totalTrades}
- Profit Factor: ${result.metrics.profitFactor?.toFixed(2)}

Number of trades: ${result.trades.length}

Provide analysis in this JSON format:
{
  "strengths": ["strength1", "strength2", ...],
  "weaknesses": ["weakness1", "weakness2", ...],
  "suggestions": ["suggestion1", "suggestion2", ...],
  "marketConditions": [
    {"condition": "trending|ranging|volatile|calm", "performance": 0-100, "trades": number, "recommendation": "text"}
  ],
  "riskAssessment": "text"
}

Return ONLY the JSON, no other text.
`;

    try {
      const completion = await this.zai!.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a quantitative trading strategy analyst. Provide detailed, actionable insights.' },
          { role: 'user', content: prompt },
        ],
      });

      const response = completion.choices[0]?.message?.content || '';
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
    }

    // Default analysis
    return {
      strengths: ['Optimization completed successfully'],
      weaknesses: [],
      suggestions: ['Consider running additional optimization cycles'],
      marketConditions: [],
      riskAssessment: 'Standard risk profile',
    };
  }
}

// ==================== AI Market Analyzer ====================

/**
 * AI-powered market condition detection and analysis
 */
export class AIMarketAnalyzer {
  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

  async initialize(): Promise<void> {
    this.zai = await ZAI.create();
  }

  /**
   * Analyze current market conditions
   */
  async analyzeMarketConditions(
    ohlcv: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>
  ): Promise<{
    trend: 'bullish' | 'bearish' | 'neutral';
    volatility: 'high' | 'medium' | 'low';
    regime: 'trending' | 'ranging' | 'breakout';
    confidence: number;
    signals: string[];
  }> {
    if (!this.zai) {
      await this.initialize();
    }

    // Calculate basic metrics
    const closes = ohlcv.map(c => c.close);
    const returns = this.calculateReturns(closes);
    const volatility = this.calculateVolatility(returns);
    const trend = this.calculateTrend(closes);

    // AI-enhanced analysis
    const prompt = `
Analyze these market conditions:

Price data (last 20 candles):
${JSON.stringify(ohlcv.slice(-20).map(c => ({
  time: new Date(c.timestamp).toISOString(),
  close: c.close,
  volume: c.volume
})), null, 2)}

Calculated metrics:
- Trend direction: ${trend}
- Volatility: ${volatility}
- Recent returns: ${returns.slice(-5).map(r => (r * 100).toFixed(2)).join(', ')}%

Provide market analysis in this JSON format:
{
  "trend": "bullish|bearish|neutral",
  "volatility": "high|medium|low",
  "regime": "trending|ranging|breakout",
  "confidence": 0-100,
  "signals": ["signal1", "signal2", ...]
}

Return ONLY the JSON.
`;

    try {
      const completion = await this.zai!.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a market analyst specializing in technical analysis.' },
          { role: 'user', content: prompt },
        ],
      });

      const response = completion.choices[0]?.message?.content || '';
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Market analysis failed:', error);
    }

    // Fallback analysis
    return {
      trend,
      volatility,
      regime: trend !== 'neutral' ? 'trending' : 'ranging',
      confidence: 0.5,
      signals: [],
    };
  }

  /**
   * Generate trading signals based on AI analysis
   */
  async generateSignals(
    marketData: Array<Record<string, unknown>>,
    indicators: Record<string, number[]>
  ): Promise<{
    signal: 'buy' | 'sell' | 'hold';
    confidence: number;
    reasons: string[];
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    if (!this.zai) {
      await this.initialize();
    }

    const prompt = `
Based on these indicators and market data:

Indicators:
${Object.entries(indicators).map(([name, values]) => 
  `${name}: ${values.slice(-5).map(v => v.toFixed(2)).join(', ')}`
).join('\n')}

Latest price data:
${JSON.stringify(marketData.slice(-5), null, 2)}

Generate a trading signal. Return JSON:
{
  "signal": "buy|sell|hold",
  "confidence": 0-100,
  "reasons": ["reason1", "reason2"],
  "riskLevel": "low|medium|high"
}
`;

    try {
      const completion = await this.zai!.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a trading signal generator. Be conservative and risk-aware.' },
          { role: 'user', content: prompt },
        ],
      });

      const response = completion.choices[0]?.message?.content || '';
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Signal generation failed:', error);
    }

    return {
      signal: 'hold',
      confidence: 0,
      reasons: ['AI analysis unavailable'],
      riskLevel: 'medium',
    };
  }

  // ==================== Private Methods ====================

  private calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  private calculateVolatility(returns: number[]): 'high' | 'medium' | 'low' {
    if (returns.length < 2) return 'medium';
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const annualized = stdDev * Math.sqrt(252);
    
    if (annualized > 0.5) return 'high';
    if (annualized > 0.2) return 'medium';
    return 'low';
  }

  private calculateTrend(prices: number[]): 'bullish' | 'bearish' | 'neutral' {
    if (prices.length < 20) return 'neutral';
    
    const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentPrice = prices[prices.length - 1];
    
    const diff = (currentPrice - sma20) / sma20;
    
    if (diff > 0.02) return 'bullish';
    if (diff < -0.02) return 'bearish';
    return 'neutral';
  }
}

// ==================== Exports ====================

export const aiStrategyOptimizer = new AIStrategyOptimizer();
export const aiMarketAnalyzer = new AIMarketAnalyzer();
