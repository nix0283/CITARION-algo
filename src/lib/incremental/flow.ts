/**
 * DAG Flow System for Signal Engine
 *
 * Build complex trading strategies using directed acyclic graph (DAG) execution.
 * Compose multiple indicators and logical conditions with automatic dependency resolution.
 */

import {
  GraphExec,
  OpRegistry,
  type FlowNode,
  type FlowGraph,
} from '@junduck/trading-indi';

import type { IncrementalBar, IndicatorSignal } from './types';

// ==================== FLOW BUILDER ====================

/**
 * Builder for creating indicator flow graphs
 */
export class IndicatorFlowBuilder {
  private graph: GraphExec;
  private outputNodes: string[] = [];

  constructor(name: string = 'indicator-flow') {
    // Register all default operators
    OpRegistry.registerDefaults();
    this.graph = new GraphExec(name);
  }

  /**
   * Add input node for price data
   */
  addInput(name: string): this {
    this.graph.addNode(name, 'Const', []);
    return this;
  }

  /**
   * Add bar input node
   */
  addBarInput(): this {
    this.graph.addNode('bar', 'Input', []);
    return this;
  }

  /**
   * Add RSI indicator
   */
  addRSI(input: string, period: number = 14): this {
    this.graph.addNode('rsi', 'RSI', [input], { period });
    return this;
  }

  /**
   * Add EMA indicator
   */
  addEMA(input: string, period: number, outputName?: string): this {
    const name = outputName ?? `ema${period}`;
    this.graph.addNode(name, 'EMA', [input], { period });
    return this;
  }

  /**
   * Add MACD indicator
   */
  addMACD(input: string, fast = 12, slow = 26, signal = 9): this {
    this.graph.addNode('macd_result', 'MACD', [input], {
      period_fast: fast,
      period_slow: slow,
      period_signal: signal,
    });
    return this;
  }

  /**
   * Add ATR indicator
   */
  addATR(input: string, period: number = 14): this {
    this.graph.addNode('atr', 'ATR', [input], { period });
    return this;
  }

  /**
   * Add Bollinger Bands
   */
  addBBANDS(input: string, period: number = 20, stddev: number = 2): this {
    this.graph.addNode('bbands', 'BBANDS', [input], { period, stddev });
    return this;
  }

  /**
   * Add ADX indicator
   */
  addADX(input: string, period: number = 14): this {
    this.graph.addNode('adx', 'ADX', [input], { period });
    return this;
  }

  /**
   * Add Stochastic indicator
   */
  addStochastic(input: string, kPeriod = 14, dPeriod = 3, smoothK = 3): this {
    this.graph.addNode('stoch', 'STOCH', [input], {
      k_period: kPeriod,
      d_period: dPeriod,
      k_slowing: smoothK,
    });
    return this;
  }

  /**
   * Add comparison (less than)
   */
  addLT(left: string, right: string | number, outputName: string): this {
    this.graph.addNode(outputName, 'LT', [left, right]);
    return this;
  }

  /**
   * Add comparison (greater than)
   */
  addGT(left: string, right: string | number, outputName: string): this {
    this.graph.addNode(outputName, 'GT', [left, right]);
    return this;
  }

  /**
   * Add AND condition
   */
  addAnd(inputs: string[], outputName: string): this {
    this.graph.addNode(outputName, 'And', inputs);
    return this;
  }

  /**
   * Add OR condition
   */
  addOr(inputs: string[], outputName: string): this {
    this.graph.addNode(outputName, 'Or', inputs);
    return this;
  }

  /**
   * Mark node as output
   */
  addOutput(nodeName: string): this {
    this.outputNodes.push(nodeName);
    return this;
  }

  /**
   * Build and return the graph
   */
  build(): GraphExec {
    return this.graph;
  }

  /**
   * Export graph schema for serialization
   */
  exportSchema(): FlowGraph {
    return this.graph.exportSchema();
  }
}

// ==================== PRE-BUILT STRATEGIES ====================

/**
 * RSI Oversold/Overbought Strategy
 */
export function createRSIStrategy(period = 14): GraphExec {
  OpRegistry.registerDefaults();
  const graph = new GraphExec('rsi-strategy');

  // Input
  graph.addNode('bar', 'Input', []);

  // RSI
  graph.addNode('rsi', 'RSI', ['bar'], { period });

  // Conditions
  graph.addNode('oversold', 'LT', ['rsi', 30]);
  graph.addNode('overbought', 'GT', ['rsi', 70]);

  return graph;
}

/**
 * MACD Crossover Strategy
 */
export function createMACDStrategy(fast = 12, slow = 26, signal = 9): GraphExec {
  OpRegistry.registerDefaults();
  const graph = new GraphExec('macd-strategy');

  // Input
  graph.addNode('bar', 'Input', []);

  // MACD
  graph.addNode('macd_result', 'MACD', ['bar'], {
    period_fast: fast,
    period_slow: slow,
    period_signal: signal,
  });

  // Extract components
  graph.addNode('macd_line', 'GetField', ['macd_result', 'macd']);
  graph.addNode('signal_line', 'GetField', ['macd_result', 'signal']);

  // Crossover detection would need previous values - simplified here
  graph.addNode('bullish', 'GT', ['macd_line', 'signal_line']);

  return graph;
}

/**
 * EMA Crossover Strategy
 */
export function createEMACrossStrategy(fast = 20, slow = 50): GraphExec {
  OpRegistry.registerDefaults();
  const graph = new GraphExec('ema-cross-strategy');

  // Input
  graph.addNode('bar', 'Input', []);

  // EMAs
  graph.addNode('ema_fast', 'EMA', ['bar'], { period: fast });
  graph.addNode('ema_slow', 'EMA', ['bar'], { period: slow });

  // Crossover
  graph.addNode('bullish', 'GT', ['ema_fast', 'ema_slow']);

  return graph;
}

/**
 * Multi-Indicator Strategy
 * Combines RSI, MACD, and EMA for confluence
 */
export function createMultiIndicatorStrategy(): GraphExec {
  OpRegistry.registerDefaults();
  const graph = new GraphExec('multi-strategy');

  // Input
  graph.addNode('bar', 'Input', []);

  // Indicators
  graph.addNode('rsi', 'RSI', ['bar'], { period: 14 });
  graph.addNode('macd_result', 'MACD', ['bar'], {
    period_fast: 12,
    period_slow: 26,
    period_signal: 9,
  });
  graph.addNode('ema20', 'EMA', ['bar'], { period: 20 });
  graph.addNode('ema50', 'EMA', ['bar'], { period: 50 });

  // MACD components
  graph.addNode('macd_line', 'GetField', ['macd_result', 'macd']);
  graph.addNode('signal_line', 'GetField', ['macd_result', 'signal']);

  // Conditions
  graph.addNode('rsi_oversold', 'LT', ['rsi', 35]);
  graph.addNode('rsi_overbought', 'GT', ['rsi', 65]);
  graph.addNode('macd_bullish', 'GT', ['macd_line', 'signal_line']);
  graph.addNode('macd_bearish', 'LT', ['macd_line', 'signal_line']);
  graph.addNode('ema_bullish', 'GT', ['ema20', 'ema50']);
  graph.addNode('ema_bearish', 'LT', ['ema20', 'ema50']);

  // Combined signals
  graph.addNode('buy_signal', 'And', ['rsi_oversold', 'macd_bullish', 'ema_bullish']);
  graph.addNode('sell_signal', 'And', ['rsi_overbought', 'macd_bearish', 'ema_bearish']);

  return graph;
}

/**
 * Bollinger Band Squeeze Strategy
 */
export function createBollingerSqueezeStrategy(): GraphExec {
  OpRegistry.registerDefaults();
  const graph = new GraphExec('bb-squeeze');

  // Input
  graph.addNode('bar', 'Input', []);

  // Bollinger Bands
  graph.addNode('bbands', 'BBANDS', ['bar'], { period: 20, stddev: 2 });

  // ATR for volatility comparison
  graph.addNode('atr', 'ATR', ['bar'], { period: 14 });

  // Extract BB components
  graph.addNode('bb_upper', 'GetField', ['bbands', 'upper']);
  graph.addNode('bb_lower', 'GetField', ['bbands', 'lower']);
  graph.addNode('bb_middle', 'GetField', ['bbands', 'middle']);

  // Bandwidth calculation
  graph.addNode('bb_range', 'Sub', ['bb_upper', 'bb_lower']);
  graph.addNode('bb_width', 'Div', ['bb_range', 'bb_middle']);

  return graph;
}

// ==================== FLOW EXECUTOR ====================

/**
 * Execute flow graphs with bar data
 */
export class FlowExecutor {
  private graph: GraphExec;
  private previousValues: Map<string, unknown> = new Map();

  constructor(graph: GraphExec) {
    this.graph = graph;
  }

  /**
   * Execute graph with new bar data
   */
  execute(bar: IncrementalBar): Map<string, unknown> {
    // Update bar input
    this.graph.update('bar', bar);

    // Read all outputs
    const results = new Map<string, unknown>();

    // Get all node IDs
    const schema = this.graph.exportSchema();
    for (const node of schema.nodes) {
      try {
        const value = this.graph.read(node.id);
        results.set(node.id, value);
      } catch {
        // Node may not have value yet
      }
    }

    // Store for comparison
    this.previousValues = results;
    return results;
  }

  /**
   * Get a specific value
   */
  getValue(nodeId: string): unknown {
    return this.graph.read(nodeId);
  }

  /**
   * Check if a condition node is true
   */
  isTrue(nodeId: string): boolean {
    const value = this.graph.read(nodeId);
    return value === true;
  }

  /**
   * Get previous value for comparison
   */
  getPreviousValue(nodeId: string): unknown {
    return this.previousValues.get(nodeId);
  }

  /**
   * Detect crossover: was false, now true
   */
  detectCrossover(nodeId: string): boolean {
    const current = this.graph.read(nodeId);
    const previous = this.previousValues.get(nodeId);
    return previous === false && current === true;
  }

  /**
   * Reset executor
   */
  reset(): void {
    this.previousValues.clear();
  }
}

// ==================== SIGNAL GENERATOR ====================

/**
 * Generate trading signals from flow execution results
 */
export function generateFlowSignals(
  results: Map<string, unknown>,
  previousResults: Map<string, unknown>
): IndicatorSignal[] {
  const signals: IndicatorSignal[] = [];

  // RSI signals
  const rsi = results.get('rsi') as number | undefined;
  const prevRsi = previousResults.get('rsi') as number | undefined;

  if (rsi !== undefined && prevRsi !== undefined) {
    if (rsi <= 30 && prevRsi > 30) {
      signals.push({
        indicator: 'RSI',
        type: 'buy',
        strength: rsi <= 20 ? 'strong' : 'moderate',
        reason: `RSI entered oversold zone (${rsi.toFixed(2)})`,
        value: rsi,
      });
    } else if (rsi >= 70 && prevRsi < 70) {
      signals.push({
        indicator: 'RSI',
        type: 'sell',
        strength: rsi >= 80 ? 'strong' : 'moderate',
        reason: `RSI entered overbought zone (${rsi.toFixed(2)})`,
        value: rsi,
      });
    }
  }

  // MACD signals
  const macdBullish = results.get('macd_bullish') as boolean | undefined;
  const prevMacdBullish = previousResults.get('macd_bullish') as boolean | undefined;

  if (macdBullish !== undefined && prevMacdBullish !== undefined) {
    if (macdBullish && !prevMacdBullish) {
      signals.push({
        indicator: 'MACD',
        type: 'buy',
        strength: 'moderate',
        reason: 'MACD bullish crossover detected',
      });
    } else if (!macdBullish && prevMacdBullish) {
      signals.push({
        indicator: 'MACD',
        type: 'sell',
        strength: 'moderate',
        reason: 'MACD bearish crossover detected',
      });
    }
  }

  // EMA cross signals
  const emaBullish = results.get('ema_bullish') as boolean | undefined;
  const prevEmaBullish = previousResults.get('ema_bullish') as boolean | undefined;

  if (emaBullish !== undefined && prevEmaBullish !== undefined) {
    if (emaBullish && !prevEmaBullish) {
      signals.push({
        indicator: 'EMA',
        type: 'buy',
        strength: 'moderate',
        reason: 'EMA bullish crossover',
      });
    } else if (!emaBullish && prevEmaBullish) {
      signals.push({
        indicator: 'EMA',
        type: 'sell',
        strength: 'moderate',
        reason: 'EMA bearish crossover',
      });
    }
  }

  // Combined signal
  const buySignal = results.get('buy_signal') as boolean | undefined;
  const prevBuySignal = previousResults.get('buy_signal') as boolean | undefined;

  if (buySignal === true && prevBuySignal !== true) {
    signals.push({
      indicator: 'COMBINED',
      type: 'buy',
      strength: 'strong',
      reason: 'Multiple indicators aligned for buy',
    });
  }

  const sellSignal = results.get('sell_signal') as boolean | undefined;
  const prevSellSignal = previousResults.get('sell_signal') as boolean | undefined;

  if (sellSignal === true && prevSellSignal !== true) {
    signals.push({
      indicator: 'COMBINED',
      type: 'sell',
      strength: 'strong',
      reason: 'Multiple indicators aligned for sell',
    });
  }

  return signals;
}

// ==================== FACTORY FUNCTIONS ====================

/**
 * Create a flow builder
 */
export function createFlowBuilder(name?: string): IndicatorFlowBuilder {
  return new IndicatorFlowBuilder(name);
}

/**
 * Create a flow executor
 */
export function createFlowExecutor(graph: GraphExec): FlowExecutor {
  return new FlowExecutor(graph);
}
