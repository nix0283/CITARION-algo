/**
 * Bot Visual Builder Foundation
 * 
 * Based on Profitmaker's Bot Framework roadmap ideas.
 * Provides visual constructor for trading bots and strategies.
 */

// ==================== Types ====================

export interface BotNode {
  id: string;
  type: BotNodeType;
  label: string;
  category: NodeCategory;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

export type BotNodeType =
  | 'indicator'
  | 'signal'
  | 'condition'
  | 'action'
  | 'risk'
  | 'data'
  | 'logic'
  | 'math';

export type NodeCategory =
  | 'indicators'
  | 'signals'
  | 'conditions'
  | 'actions'
  | 'risk_management'
  | 'data_sources'
  | 'logic'
  | 'math';

export interface PortDefinition {
  id: string;
  name: string;
  type: 'number' | 'boolean' | 'series' | 'signal' | 'any';
  required: boolean;
  description?: string;
}

export interface BotConnection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface BotDefinition {
  id: string;
  name: string;
  description: string;
  nodes: BotNode[];
  connections: BotConnection[];
  variables: BotVariable[];
  createdAt: number;
  updatedAt: number;
}

export interface BotVariable {
  name: string;
  type: 'number' | 'string' | 'boolean';
  defaultValue: unknown;
  description?: string;
}

export interface CompiledBot {
  id: string;
  entryFunction: string;
  code: string;
  dependencies: string[];
  variables: Record<string, unknown>;
}

// ==================== Node Registry ====================

/**
 * Registry of available node types
 */
export class NodeRegistry {
  private nodes: Map<string, NodeRegistration> = new Map();

  constructor() {
    this.registerBuiltins();
  }

  /**
   * Register a node type
   */
  register(registration: NodeRegistration): void {
    this.nodes.set(registration.type, registration);
  }

  /**
   * Get node registration
   */
  get(type: string): NodeRegistration | undefined {
    return this.nodes.get(type);
  }

  /**
   * Get all nodes by category
   */
  getByCategory(category: NodeCategory): NodeRegistration[] {
    return Array.from(this.nodes.values()).filter(n => n.category === category);
  }

  /**
   * Get all registered nodes
   */
  getAll(): NodeRegistration[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Create node instance
   */
  createNode(type: string, position: { x: number; y: number }): BotNode | null {
    const registration = this.nodes.get(type);
    if (!registration) return null;

    return {
      id: this.generateId(),
      type: registration.type,
      label: registration.label,
      category: registration.category,
      config: registration.defaultConfig || {},
      position,
      inputs: [...registration.inputs],
      outputs: [...registration.outputs],
    };
  }

  private generateId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private registerBuiltins(): void {
    // === Indicators ===
    this.register({
      type: 'indicator',
      label: 'RSI',
      category: 'indicators',
      inputs: [
        { id: 'data', name: 'Data', type: 'series', required: true },
      ],
      outputs: [
        { id: 'value', name: 'RSI Value', type: 'series', required: true },
      ],
      defaultConfig: {
        period: 14,
        source: 'close',
      },
      configSchema: {
        period: { type: 'number', min: 1, max: 200, default: 14 },
        source: { type: 'select', options: ['close', 'open', 'high', 'low'], default: 'close' },
      },
      compile: (node, inputs, outputs) => {
        return `const rsi_${node.id} = calculateRSI(${inputs.data}, ${node.config.period});`;
      },
    });

    this.register({
      type: 'indicator',
      label: 'EMA',
      category: 'indicators',
      inputs: [
        { id: 'data', name: 'Data', type: 'series', required: true },
      ],
      outputs: [
        { id: 'value', name: 'EMA Value', type: 'series', required: true },
      ],
      defaultConfig: {
        period: 20,
        source: 'close',
      },
      configSchema: {
        period: { type: 'number', min: 1, max: 500, default: 20 },
      },
      compile: (node, inputs, outputs) => {
        return `const ema_${node.id} = calculateEMA(${inputs.data}, ${node.config.period});`;
      },
    });

    this.register({
      type: 'indicator',
      label: 'MACD',
      category: 'indicators',
      inputs: [
        { id: 'data', name: 'Data', type: 'series', required: true },
      ],
      outputs: [
        { id: 'macd', name: 'MACD', type: 'series', required: true },
        { id: 'signal', name: 'Signal', type: 'series', required: true },
        { id: 'histogram', name: 'Histogram', type: 'series', required: true },
      ],
      defaultConfig: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },
      compile: (node, inputs, outputs) => {
        return `const { macd: macd_${node.id}, signal: signal_${node.id}, histogram: histogram_${node.id} } = calculateMACD(${inputs.data}, ${node.config.fastPeriod}, ${node.config.slowPeriod}, ${node.config.signalPeriod});`;
      },
    });

    // === Signals ===
    this.register({
      type: 'signal',
      label: 'Crossover',
      category: 'signals',
      inputs: [
        { id: 'fast', name: 'Fast Line', type: 'series', required: true },
        { id: 'slow', name: 'Slow Line', type: 'series', required: true },
      ],
      outputs: [
        { id: 'crossUp', name: 'Cross Up', type: 'signal', required: true },
        { id: 'crossDown', name: 'Cross Down', type: 'signal', required: true },
      ],
      defaultConfig: {},
      compile: (node, inputs, outputs) => {
        return `const crossUp_${node.id} = crossover(${inputs.fast}, ${inputs.slow});\nconst crossDown_${node.id} = crossunder(${inputs.fast}, ${inputs.slow});`;
      },
    });

    this.register({
      type: 'signal',
      label: 'Threshold',
      category: 'signals',
      inputs: [
        { id: 'value', name: 'Value', type: 'series', required: true },
      ],
      outputs: [
        { id: 'above', name: 'Above', type: 'signal', required: true },
        { id: 'below', name: 'Below', type: 'signal', required: true },
      ],
      defaultConfig: {
        threshold: 70,
      },
      configSchema: {
        threshold: { type: 'number', default: 70 },
      },
      compile: (node, inputs, outputs) => {
        return `const above_${node.id} = ${inputs.value} > ${node.config.threshold};\nconst below_${node.id} = ${inputs.value} < ${node.config.threshold};`;
      },
    });

    // === Conditions ===
    this.register({
      type: 'condition',
      label: 'AND',
      category: 'conditions',
      inputs: [
        { id: 'a', name: 'Input A', type: 'boolean', required: true },
        { id: 'b', name: 'Input B', type: 'boolean', required: true },
      ],
      outputs: [
        { id: 'result', name: 'Result', type: 'boolean', required: true },
      ],
      defaultConfig: {},
      compile: (node, inputs, outputs) => {
        return `const and_${node.id} = ${inputs.a} && ${inputs.b};`;
      },
    });

    this.register({
      type: 'condition',
      label: 'OR',
      category: 'conditions',
      inputs: [
        { id: 'a', name: 'Input A', type: 'boolean', required: true },
        { id: 'b', name: 'Input B', type: 'boolean', required: true },
      ],
      outputs: [
        { id: 'result', name: 'Result', type: 'boolean', required: true },
      ],
      defaultConfig: {},
      compile: (node, inputs, outputs) => {
        return `const or_${node.id} = ${inputs.a} || ${inputs.b};`;
      },
    });

    // === Actions ===
    this.register({
      type: 'action',
      label: 'Buy',
      category: 'actions',
      inputs: [
        { id: 'signal', name: 'Signal', type: 'signal', required: true },
        { id: 'amount', name: 'Amount', type: 'number', required: false },
      ],
      outputs: [
        { id: 'executed', name: 'Executed', type: 'boolean', required: true },
      ],
      defaultConfig: {
        symbol: 'BTCUSDT',
        orderType: 'market',
        amountType: 'percentage',
        amountValue: 10,
      },
      configSchema: {
        symbol: { type: 'string', default: 'BTCUSDT' },
        orderType: { type: 'select', options: ['market', 'limit'], default: 'market' },
        amountType: { type: 'select', options: ['percentage', 'fixed'], default: 'percentage' },
        amountValue: { type: 'number', min: 0, max: 100, default: 10 },
      },
      compile: (node, inputs, outputs) => {
        return `if (${inputs.signal}) { await executeBuy({ symbol: '${node.config.symbol}', type: '${node.config.orderType}', ${node.config.amountType === 'percentage' ? `percentage: ${node.config.amountValue}` : `amount: ${node.config.amountValue}`} }); }`;
      },
    });

    this.register({
      type: 'action',
      label: 'Sell',
      category: 'actions',
      inputs: [
        { id: 'signal', name: 'Signal', type: 'signal', required: true },
        { id: 'amount', name: 'Amount', type: 'number', required: false },
      ],
      outputs: [
        { id: 'executed', name: 'Executed', type: 'boolean', required: true },
      ],
      defaultConfig: {
        symbol: 'BTCUSDT',
        orderType: 'market',
        amountType: 'percentage',
        amountValue: 100,
      },
      compile: (node, inputs, outputs) => {
        return `if (${inputs.signal}) { await executeSell({ symbol: '${node.config.symbol}', type: '${node.config.orderType}', ${node.config.amountType === 'percentage' ? `percentage: ${node.config.amountValue}` : `amount: ${node.config.amountValue}`} }); }`;
      },
    });

    // === Risk Management ===
    this.register({
      type: 'risk',
      label: 'Stop Loss',
      category: 'risk_management',
      inputs: [
        { id: 'entry', name: 'Entry Price', type: 'number', required: true },
      ],
      outputs: [
        { id: 'triggered', name: 'Triggered', type: 'signal', required: true },
      ],
      defaultConfig: {
        percentage: 5,
        trailing: false,
        trailOffset: 2,
      },
      configSchema: {
        percentage: { type: 'number', min: 0.1, max: 50, default: 5 },
        trailing: { type: 'boolean', default: false },
        trailOffset: { type: 'number', min: 0.1, max: 20, default: 2 },
      },
      compile: (node, inputs, outputs) => {
        return `const stopLoss_${node.id} = checkStopLoss(${inputs.entry}, ${node.config.percentage}, ${node.config.trailing}, ${node.config.trailOffset});`;
      },
    });

    this.register({
      type: 'risk',
      label: 'Take Profit',
      category: 'risk_management',
      inputs: [
        { id: 'entry', name: 'Entry Price', type: 'number', required: true },
      ],
      outputs: [
        { id: 'triggered', name: 'Triggered', type: 'signal', required: true },
      ],
      defaultConfig: {
        percentage: 10,
        trailing: false,
        trailOffset: 3,
      },
      compile: (node, inputs, outputs) => {
        return `const takeProfit_${node.id} = checkTakeProfit(${inputs.entry}, ${node.config.percentage}, ${node.config.trailing}, ${node.config.trailOffset});`;
      },
    });

    // === Data Sources ===
    this.register({
      type: 'data',
      label: 'OHLCV',
      category: 'data_sources',
      inputs: [],
      outputs: [
        { id: 'open', name: 'Open', type: 'series', required: true },
        { id: 'high', name: 'High', type: 'series', required: true },
        { id: 'low', name: 'Low', type: 'series', required: true },
        { id: 'close', name: 'Close', type: 'series', required: true },
        { id: 'volume', name: 'Volume', type: 'series', required: true },
      ],
      defaultConfig: {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        limit: 500,
      },
      configSchema: {
        exchange: { type: 'select', options: ['binance', 'bybit', 'okx', 'bitget', 'bingx'], default: 'binance' },
        symbol: { type: 'string', default: 'BTCUSDT' },
        timeframe: { type: 'select', options: ['1m', '5m', '15m', '1h', '4h', '1d'], default: '1h' },
        limit: { type: 'number', min: 100, max: 5000, default: 500 },
      },
      compile: (node, inputs, outputs) => {
        return `const ohlcv_${node.id} = await fetchOHLCV('${node.config.exchange}', '${node.config.symbol}', '${node.config.timeframe}', ${node.config.limit});`;
      },
    });

    // === Math ===
    this.register({
      type: 'math',
      label: 'Add',
      category: 'math',
      inputs: [
        { id: 'a', name: 'Input A', type: 'number', required: true },
        { id: 'b', name: 'Input B', type: 'number', required: true },
      ],
      outputs: [
        { id: 'result', name: 'Result', type: 'number', required: true },
      ],
      defaultConfig: {},
      compile: (node, inputs, outputs) => {
        return `const add_${node.id} = ${inputs.a} + ${inputs.b};`;
      },
    });

    this.register({
      type: 'math',
      label: 'Multiply',
      category: 'math',
      inputs: [
        { id: 'a', name: 'Input A', type: 'number', required: true },
        { id: 'b', name: 'Input B', type: 'number', required: true },
      ],
      outputs: [
        { id: 'result', name: 'Result', type: 'number', required: true },
      ],
      defaultConfig: {},
      compile: (node, inputs, outputs) => {
        return `const mul_${node.id} = ${inputs.a} * ${inputs.b};`;
      },
    });
  }
}

export interface NodeRegistration {
  type: string;
  label: string;
  category: NodeCategory;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  defaultConfig: Record<string, unknown>;
  configSchema?: Record<string, ConfigFieldSchema>;
  compile: (node: BotNode, inputs: Record<string, string>, outputs: Record<string, string>) => string;
}

export interface ConfigFieldSchema {
  type: 'number' | 'string' | 'boolean' | 'select';
  min?: number;
  max?: number;
  options?: string[];
  default: unknown;
}

// ==================== Bot Compiler ====================

/**
 * Compiles visual bot definition to executable code
 */
export class BotCompiler {
  constructor(private registry: NodeRegistry) {}

  /**
   * Compile bot definition to executable code
   */
  compile(bot: BotDefinition): CompiledBot {
    const codeParts: string[] = [];
    const dependencies: string[] = [];
    
    // Sort nodes by execution order (topological sort)
    const sortedNodes = this.topologicalSort(bot.nodes, bot.connections);

    // Generate variable mappings
    const portMappings = new Map<string, string>();

    // Compile each node
    for (const node of sortedNodes) {
      const registration = this.registry.get(node.type);
      if (!registration) continue;

      // Build input mappings
      const inputs: Record<string, string> = {};
      for (const input of node.inputs) {
        const connection = bot.connections.find(
          c => c.targetNodeId === node.id && c.targetPortId === input.id
        );
        if (connection) {
          const mappingKey = `${connection.sourceNodeId}:${connection.sourcePortId}`;
          inputs[input.id] = portMappings.get(mappingKey) || 'undefined';
        }
      }

      // Build output mappings
      const outputs: Record<string, string> = {};
      for (const output of node.outputs) {
        outputs[output.id] = `${node.type}_${node.id}_${output.id}`;
        portMappings.set(`${node.id}:${output.id}`, outputs[output.id]);
      }

      // Compile node
      const code = registration.compile(node, inputs, outputs);
      codeParts.push(code);
    }

    // Build complete function
    const code = this.wrapInFunction(codeParts, bot);

    return {
      id: bot.id,
      entryFunction: `execute_${bot.id}`,
      code,
      dependencies,
      variables: bot.variables.reduce((acc, v) => {
        acc[v.name] = v.defaultValue;
        return acc;
      }, {} as Record<string, unknown>),
    };
  }

  /**
   * Topological sort for execution order
   */
  private topologicalSort(nodes: BotNode[], connections: BotConnection[]): BotNode[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map(nodes.map(n => [n.id, 0]));
    
    // Calculate in-degrees
    for (const conn of connections) {
      inDegree.set(conn.targetNodeId, (inDegree.get(conn.targetNodeId) || 0) + 1);
    }

    // Find nodes with no dependencies
    const queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);
    const sorted: BotNode[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      // Process dependents
      for (const conn of connections) {
        if (conn.sourceNodeId === node.id) {
          const targetId = conn.targetNodeId;
          const newDegree = (inDegree.get(targetId) || 0) - 1;
          inDegree.set(targetId, newDegree);
          
          if (newDegree === 0) {
            queue.push(nodeMap.get(targetId)!);
          }
        }
      }
    }

    return sorted;
  }

  /**
   * Wrap compiled code in function
   */
  private wrapInFunction(codeParts: string[], bot: BotDefinition): string {
    const params = bot.variables.map(v => v.name).join(', ');
    
    return `
// Auto-generated bot: ${bot.name}
// Generated at: ${new Date().toISOString()}

async function execute_${bot.id}(${params}) {
  ${codeParts.join('\n  ')}
}

// Export for use
export { execute_${bot.id} };
`.trim();
  }
}

// ==================== Bot Builder ====================

/**
 * Main bot builder class
 */
export class BotBuilder {
  private registry: NodeRegistry;
  private compiler: BotCompiler;
  private bots: Map<string, BotDefinition> = new Map();

  constructor() {
    this.registry = new NodeRegistry();
    this.compiler = new BotCompiler(this.registry);
  }

  /**
   * Create new bot
   */
  createBot(name: string, description: string = ''): BotDefinition {
    const bot: BotDefinition = {
      id: this.generateId(),
      name,
      description,
      nodes: [],
      connections: [],
      variables: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.bots.set(bot.id, bot);
    return bot;
  }

  /**
   * Load existing bot
   */
  loadBot(definition: BotDefinition): void {
    this.bots.set(definition.id, definition);
  }

  /**
   * Add node to bot
   */
  addNode(botId: string, type: string, position: { x: number; y: number }): BotNode | null {
    const bot = this.bots.get(botId);
    if (!bot) return null;

    const node = this.registry.createNode(type, position);
    if (!node) return null;

    bot.nodes.push(node);
    bot.updatedAt = Date.now();

    return node;
  }

  /**
   * Remove node from bot
   */
  removeNode(botId: string, nodeId: string): boolean {
    const bot = this.bots.get(botId);
    if (!bot) return false;

    const index = bot.nodes.findIndex(n => n.id === nodeId);
    if (index === -1) return false;

    bot.nodes.splice(index, 1);
    
    // Remove associated connections
    bot.connections = bot.connections.filter(
      c => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
    );
    
    bot.updatedAt = Date.now();
    return true;
  }

  /**
   * Connect nodes
   */
  connectNodes(
    botId: string,
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string
  ): BotConnection | null {
    const bot = this.bots.get(botId);
    if (!bot) return null;

    // Validate nodes exist
    const sourceNode = bot.nodes.find(n => n.id === sourceNodeId);
    const targetNode = bot.nodes.find(n => n.id === targetNodeId);
    
    if (!sourceNode || !targetNode) return null;

    // Check port compatibility
    const sourcePort = sourceNode.outputs.find(p => p.id === sourcePortId);
    const targetPort = targetNode.inputs.find(p => p.id === targetPortId);
    
    if (!sourcePort || !targetPort) return null;

    // Check type compatibility
    if (!this.areTypesCompatible(sourcePort.type, targetPort.type)) {
      return null;
    }

    // Remove existing connection to target port
    bot.connections = bot.connections.filter(
      c => !(c.targetNodeId === targetNodeId && c.targetPortId === targetPortId)
    );

    const connection: BotConnection = {
      id: this.generateId(),
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
    };

    bot.connections.push(connection);
    bot.updatedAt = Date.now();

    return connection;
  }

  /**
   * Disconnect nodes
   */
  disconnectNodes(botId: string, connectionId: string): boolean {
    const bot = this.bots.get(botId);
    if (!bot) return false;

    const index = bot.connections.findIndex(c => c.id === connectionId);
    if (index === -1) return false;

    bot.connections.splice(index, 1);
    bot.updatedAt = Date.now();
    return true;
  }

  /**
   * Update node configuration
   */
  updateNodeConfig(botId: string, nodeId: string, config: Record<string, unknown>): boolean {
    const bot = this.bots.get(botId);
    if (!bot) return false;

    const node = bot.nodes.find(n => n.id === nodeId);
    if (!node) return false;

    node.config = { ...node.config, ...config };
    bot.updatedAt = Date.now();
    return true;
  }

  /**
   * Compile bot
   */
  compileBot(botId: string): CompiledBot | null {
    const bot = this.bots.get(botId);
    if (!bot) return null;

    return this.compiler.compile(bot);
  }

  /**
   * Get bot
   */
  getBot(botId: string): BotDefinition | undefined {
    return this.bots.get(botId);
  }

  /**
   * Get all bots
   */
  getAllBots(): BotDefinition[] {
    return Array.from(this.bots.values());
  }

  /**
   * Get node registry
   */
  getRegistry(): NodeRegistry {
    return this.registry;
  }

  // ==================== Private Methods ====================

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private areTypesCompatible(sourceType: string, targetType: string): boolean {
    if (sourceType === 'any' || targetType === 'any') return true;
    return sourceType === targetType;
  }
}

// ==================== Exports ====================

export const botBuilder = new BotBuilder();
