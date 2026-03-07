/**
 * Position Reconciliation System
 * Ensures consistency between internal state and exchange positions
 * Audit Fix: P2.28 - Implement Position Reconciliation System
 */

export interface InternalPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  leverage: number;
  margin: number;
  liquidationPrice?: number;
  botId?: string;
  strategy?: string;
  openedAt: number;
  updatedAt: number;
}

export interface ExchangePosition {
  symbol: string;
  side: 'long' | 'short' | 'none';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  margin: number;
  liquidationPrice?: number;
  positionId?: string;
}

export interface ReconciliationResult {
  timestamp: number;
  matched: Array<{
    internalId: string;
    symbol: string;
    sizeDiff: number;
    pnlDiff: number;
  }>;
  missing: Array<{
    type: 'internal_only' | 'exchange_only';
    position: InternalPosition | ExchangePosition;
  }>;
  sizeDiscrepancies: Array<{
    internalId: string;
    symbol: string;
    internalSize: number;
    exchangeSize: number;
    diff: number;
    diffPercent: number;
  }>;
  pnlDiscrepancies: Array<{
    internalId: string;
    symbol: string;
    internalPnl: number;
    exchangePnl: number;
    diff: number;
  }>;
  summary: {
    totalPositions: number;
    matchedCount: number;
    discrepancyCount: number;
    missingCount: number;
    healthScore: number; // 0-100
  };
  actions: ReconciliationAction[];
}

export interface ReconciliationAction {
  id: string;
  type: 'sync_size' | 'sync_pnl' | 'create_internal' | 'create_exchange' | 'close_position' | 'alert';
  symbol: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  autoRecoverable: boolean;
  status: 'pending' | 'executed' | 'failed';
  details: Record<string, unknown>;
}

export interface ReconciliationConfig {
  tolerancePercent: number; // Tolerance for size differences (default: 1%)
  pnlTolerance: number; // Tolerance for PnL differences in base currency
  syncInterval: number; // How often to sync (default: 5 minutes)
  autoRecover: boolean; // Automatically recover from discrepancies
  alertThreshold: number; // Alert when discrepancy exceeds this percentage
  maxDiscrepancyAge: number; // Max age of discrepancy before alert
}

const DEFAULT_CONFIG: ReconciliationConfig = {
  tolerancePercent: 1, // 1%
  pnlTolerance: 100, // $100
  syncInterval: 300000, // 5 minutes
  autoRecover: false,
  alertThreshold: 5, // 5%
  maxDiscrepancyAge: 600000, // 10 minutes
};

export class PositionReconciliation {
  private config: ReconciliationConfig;
  private internalPositions: Map<string, InternalPosition> = new Map();
  private exchangePositions: Map<string, ExchangePosition> = new Map();
  private lastReconciliation: ReconciliationResult | null = null;
  private syncInterval?: NodeJS.Timeout;
  private pendingActions: Map<string, ReconciliationAction> = new Map();
  private handlers: {
    onDiscrepancy: ((result: ReconciliationResult) => void)[];
    onAction: ((action: ReconciliationAction) => void)[];
    onAlert: ((message: string, severity: string) => void)[];
  } = { onDiscrepancy: [], onAction: [], onAlert: [] };

  constructor(config: Partial<ReconciliationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start periodic reconciliation
   */
  startPeriodicSync(): void {
    if (this.syncInterval) {
      console.warn('[Reconciliation] Already running');
      return;
    }

    this.syncInterval = setInterval(() => {
      this.reconcile();
    }, this.config.syncInterval);

    console.log(`[Reconciliation] Started periodic sync every ${this.config.syncInterval}ms`);
  }

  /**
   * Stop periodic reconciliation
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      console.log('[Reconciliation] Stopped periodic sync');
    }
  }

  /**
   * Update internal position
   */
  updateInternalPosition(position: InternalPosition): void {
    position.updatedAt = Date.now();
    this.internalPositions.set(position.id, position);
  }

  /**
   * Remove internal position
   */
  removeInternalPosition(positionId: string): void {
    this.internalPositions.delete(positionId);
  }

  /**
   * Update exchange position
   */
  updateExchangePosition(symbol: string, position: ExchangePosition): void {
    this.exchangePositions.set(symbol, position);
  }

  /**
   * Clear exchange positions (for fresh fetch)
   */
  clearExchangePositions(): void {
    this.exchangePositions.clear();
  }

  /**
   * Perform reconciliation
   */
  reconcile(): ReconciliationResult {
    const timestamp = Date.now();
    const result: ReconciliationResult = {
      timestamp,
      matched: [],
      missing: [],
      sizeDiscrepancies: [],
      pnlDiscrepancies: [],
      summary: {
        totalPositions: this.internalPositions.size,
        matchedCount: 0,
        discrepancyCount: 0,
        missingCount: 0,
        healthScore: 100,
      },
      actions: [],
    };

    // Build lookup by symbol
    const internalBySymbol = new Map<string, InternalPosition[]>();
    for (const pos of this.internalPositions.values()) {
      const existing = internalBySymbol.get(pos.symbol) || [];
      existing.push(pos);
      internalBySymbol.set(pos.symbol, existing);
    }

    // Check exchange positions against internal
    const processedSymbols = new Set<string>();

    for (const [symbol, exchangePos] of this.exchangePositions) {
      processedSymbols.add(symbol);
      const internalPositions = internalBySymbol.get(symbol) || [];

      if (internalPositions.length === 0) {
        // Position exists on exchange but not internally
        if (exchangePos.size > 0) {
          result.missing.push({
            type: 'exchange_only',
            position: exchangePos,
          });
          
          result.actions.push(this.createAction(
            'create_internal',
            symbol,
            `Create internal record for exchange position: ${exchangePos.side} ${exchangePos.size} ${symbol}`,
            'high',
            { exchangePosition: exchangePos }
          ));
        }
        continue;
      }

      // Aggregate internal positions for this symbol
      const aggregatedInternal = this.aggregatePositions(internalPositions);
      
      // Compare sizes
      const sizeDiff = Math.abs(aggregatedInternal.size - exchangePos.size);
      const sizeDiffPercent = exchangePos.size > 0 
        ? (sizeDiff / exchangePos.size) * 100 
        : 0;

      if (sizeDiffPercent > this.config.tolerancePercent) {
        result.sizeDiscrepancies.push({
          internalId: aggregatedInternal.id,
          symbol,
          internalSize: aggregatedInternal.size,
          exchangeSize: exchangePos.size,
          diff: sizeDiff,
          diffPercent: sizeDiffPercent,
        });

        if (sizeDiffPercent > this.config.alertThreshold) {
          result.actions.push(this.createAction(
            'alert',
            symbol,
            `Critical size discrepancy: ${sizeDiffPercent.toFixed(2)}%`,
            'critical',
            { internalSize: aggregatedInternal.size, exchangeSize: exchangePos.size }
          ));
        } else {
          result.actions.push(this.createAction(
            'sync_size',
            symbol,
            `Sync size discrepancy: internal ${aggregatedInternal.size} vs exchange ${exchangePos.size}`,
            'medium',
            { internalSize: aggregatedInternal.size, exchangeSize: exchangePos.size }
          ));
        }
      }

      // Compare PnL
      const pnlDiff = Math.abs(aggregatedInternal.unrealizedPnl - exchangePos.unrealizedPnl);
      if (pnlDiff > this.config.pnlTolerance) {
        result.pnlDiscrepancies.push({
          internalId: aggregatedInternal.id,
          symbol,
          internalPnl: aggregatedInternal.unrealizedPnl,
          exchangePnl: exchangePos.unrealizedPnl,
          diff: pnlDiff,
        });

        result.actions.push(this.createAction(
          'sync_pnl',
          symbol,
          `Sync PnL discrepancy: internal ${aggregatedInternal.unrealizedPnl} vs exchange ${exchangePos.unrealizedPnl}`,
          'medium',
          { internalPnl: aggregatedInternal.unrealizedPnl, exchangePnl: exchangePos.unrealizedPnl }
        ));
      }

      // Matched position
      if (sizeDiffPercent <= this.config.tolerancePercent && pnlDiff <= this.config.pnlTolerance) {
        result.matched.push({
          internalId: aggregatedInternal.id,
          symbol,
          sizeDiff,
          pnlDiff,
        });
        result.summary.matchedCount++;
      }
    }

    // Check for internal positions not on exchange
    for (const [symbol, positions] of internalBySymbol) {
      if (!processedSymbols.has(symbol)) {
        for (const pos of positions) {
          result.missing.push({
            type: 'internal_only',
            position: pos,
          });
          
          result.actions.push(this.createAction(
            'create_exchange',
            symbol,
            `Internal position not found on exchange: ${pos.side} ${pos.size} ${symbol}`,
            'critical',
            { internalPosition: pos }
          ));
        }
      }
    }

    // Calculate summary
    result.summary.discrepancyCount = result.sizeDiscrepancies.length + result.pnlDiscrepancies.length;
    result.summary.missingCount = result.missing.length;
    result.summary.healthScore = this.calculateHealthScore(result);

    // Store result
    this.lastReconciliation = result;

    // Trigger handlers
    if (result.summary.discrepancyCount > 0 || result.summary.missingCount > 0) {
      this.handlers.onDiscrepancy.forEach(h => h(result));
    }

    // Auto-recover if enabled
    if (this.config.autoRecover) {
      this.executeAutoRecovery(result);
    }

    console.log(`[Reconciliation] Complete. Health: ${result.summary.healthScore}%, Matched: ${result.summary.matchedCount}, Discrepancies: ${result.summary.discrepancyCount}`);

    return result;
  }

  /**
   * Aggregate multiple positions for the same symbol
   */
  private aggregatePositions(positions: InternalPosition[]): InternalPosition & { id: string } {
    if (positions.length === 0) {
      throw new Error('No positions to aggregate');
    }

    if (positions.length === 1) {
      return { ...positions[0], id: positions[0].id };
    }

    // Aggregate net position
    let netSize = 0;
    let totalValue = 0;
    let totalPnl = 0;
    let totalMargin = 0;

    for (const pos of positions) {
      const signedSize = pos.side === 'long' ? pos.size : -pos.size;
      netSize += signedSize;
      totalValue += pos.size * pos.entryPrice;
      totalPnl += pos.unrealizedPnl;
      totalMargin += pos.margin;
    }

    const side = netSize >= 0 ? 'long' : 'short';
    const size = Math.abs(netSize);
    const avgEntryPrice = size > 0 ? totalValue / positions.reduce((s, p) => s + p.size, 0) : 0;

    return {
      id: positions.map(p => p.id).join(','),
      symbol: positions[0].symbol,
      side,
      size,
      entryPrice: avgEntryPrice,
      currentPrice: positions[0].currentPrice,
      unrealizedPnl: totalPnl,
      leverage: positions[0].leverage,
      margin: totalMargin,
      openedAt: Math.min(...positions.map(p => p.openedAt)),
      updatedAt: Date.now(),
    };
  }

  /**
   * Calculate health score
   */
  private calculateHealthScore(result: ReconciliationResult): number {
    const total = result.summary.totalPositions;
    if (total === 0) return 100;

    const matchedWeight = 0.5;
    const discrepancyWeight = 0.3;
    const missingWeight = 0.2;

    const matchedScore = (result.summary.matchedCount / total) * 100;
    const discrepancyScore = Math.max(0, 100 - result.summary.discrepancyCount * 10);
    const missingScore = Math.max(0, 100 - result.summary.missingCount * 20);

    return Math.round(
      matchedScore * matchedWeight +
      discrepancyScore * discrepancyWeight +
      missingScore * missingWeight
    );
  }

  /**
   * Create reconciliation action
   */
  private createAction(
    type: ReconciliationAction['type'],
    symbol: string,
    description: string,
    priority: ReconciliationAction['priority'],
    details: Record<string, unknown>
  ): ReconciliationAction {
    const action: ReconciliationAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      symbol,
      description,
      priority,
      autoRecoverable: ['sync_size', 'sync_pnl', 'create_internal'].includes(type),
      status: 'pending',
      details,
    };

    this.pendingActions.set(action.id, action);
    return action;
  }

  /**
   * Execute auto-recovery actions
   */
  private executeAutoRecovery(result: ReconciliationResult): void {
    for (const action of result.actions) {
      if (!action.autoRecoverable) continue;
      if (action.status !== 'pending') continue;

      switch (action.type) {
        case 'sync_size':
        case 'sync_pnl':
          // Sync internal state with exchange
          this.syncFromExchange(action.symbol);
          action.status = 'executed';
          break;

        case 'create_internal':
          // Create internal position from exchange data
          const exchangePos = action.details.exchangePosition as ExchangePosition;
          if (exchangePos) {
            this.createInternalFromExchange(exchangePos);
            action.status = 'executed';
          }
          break;
      }

      this.handlers.onAction.forEach(h => h(action));
    }
  }

  /**
   * Sync internal position from exchange
   */
  private syncFromExchange(symbol: string): void {
    const exchangePos = this.exchangePositions.get(symbol);
    const internalPositions = Array.from(this.internalPositions.values())
      .filter(p => p.symbol === symbol);

    if (!exchangePos || internalPositions.length === 0) return;

    // Update first matching position
    const pos = internalPositions[0];
    pos.size = exchangePos.size;
    pos.unrealizedPnl = exchangePos.unrealizedPnl;
    pos.currentPrice = exchangePos.markPrice;
    pos.updatedAt = Date.now();

    console.log(`[Reconciliation] Synced ${symbol} from exchange`);
  }

  /**
   * Create internal position from exchange data
   */
  private createInternalFromExchange(exchangePos: ExchangePosition): string {
    const id = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const internalPos: InternalPosition = {
      id,
      symbol: exchangePos.symbol,
      side: exchangePos.side as 'long' | 'short',
      size: exchangePos.size,
      entryPrice: exchangePos.entryPrice,
      currentPrice: exchangePos.markPrice,
      unrealizedPnl: exchangePos.unrealizedPnl,
      leverage: exchangePos.leverage,
      margin: exchangePos.margin,
      liquidationPrice: exchangePos.liquidationPrice,
      openedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.internalPositions.set(id, internalPos);
    console.log(`[Reconciliation] Created internal position ${id} for ${exchangePos.symbol}`);

    return id;
  }

  /**
   * Execute a specific action
   */
  async executeAction(actionId: string): Promise<boolean> {
    const action = this.pendingActions.get(actionId);
    if (!action) return false;

    try {
      switch (action.type) {
        case 'close_position':
          // Would call exchange API to close position
          console.log(`[Reconciliation] Closing position for ${action.symbol}`);
          action.status = 'executed';
          break;

        case 'alert':
          this.handlers.onAlert.forEach(h => 
            h(action.description, action.priority)
          );
          action.status = 'executed';
          break;

        default:
          // Other actions handled by auto-recovery
          break;
      }

      this.handlers.onAction.forEach(h => h(action));
      return true;
    } catch (error) {
      action.status = 'failed';
      console.error(`[Reconciliation] Action ${actionId} failed:`, error);
      return false;
    }
  }

  /**
   * Get pending actions
   */
  getPendingActions(): ReconciliationAction[] {
    return Array.from(this.pendingActions.values())
      .filter(a => a.status === 'pending')
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  /**
   * Get last reconciliation result
   */
  getLastReconciliation(): ReconciliationResult | null {
    return this.lastReconciliation;
  }

  /**
   * Get internal position
   */
  getInternalPosition(id: string): InternalPosition | undefined {
    return this.internalPositions.get(id);
  }

  /**
   * Get all internal positions
   */
  getAllInternalPositions(): InternalPosition[] {
    return Array.from(this.internalPositions.values());
  }

  /**
   * Get exchange position
   */
  getExchangePosition(symbol: string): ExchangePosition | undefined {
    return this.exchangePositions.get(symbol);
  }

  /**
   * Register event handlers
   */
  onDiscrepancy(handler: (result: ReconciliationResult) => void): void {
    this.handlers.onDiscrepancy.push(handler);
  }

  onAction(handler: (action: ReconciliationAction) => void): void {
    this.handlers.onAction.push(handler);
  }

  onAlert(handler: (message: string, severity: string) => void): void {
    this.handlers.onAlert.push(handler);
  }

  /**
   * Get configuration
   */
  getConfig(): ReconciliationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ReconciliationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    this.stopPeriodicSync();
    this.internalPositions.clear();
    this.exchangePositions.clear();
    this.pendingActions.clear();
    console.log('[Reconciliation] Shutdown complete');
  }
}

// Singleton
let instance: PositionReconciliation | null = null;

export function getPositionReconciliation(
  config?: Partial<ReconciliationConfig>
): PositionReconciliation {
  if (!instance) {
    instance = new PositionReconciliation(config);
  }
  return instance;
}

export default PositionReconciliation;
