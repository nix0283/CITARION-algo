/**
 * Order Reconciler
 * 
 * Detects and handles "ghost orders" - orders that exist on the exchange 
 * but not in local state due to network timeouts during order placement.
 * 
 * Key Features:
 * - Fetches all open orders from exchange
 * - Compares with local database orders
 * - Identifies orphaned orders (on exchange, not local)
 * - Identifies missing orders (local, not on exchange)
 * - Logs discrepancies to SystemLog
 * - Optionally syncs or closes orphaned orders
 * 
 * Safety: By default, orphaned orders are LOGGED ONLY.
 *         autoCloseOrphans must be explicitly enabled.
 */

import { db } from "@/lib/db";
import { 
  createExchangeClient, 
  type ExchangeId, 
  type AllExchangeId,
  type OpenOrder,
  type MarketType,
} from "@/lib/exchange";
import { decryptApiKey } from "@/lib/encryption";
import { notifyTelegram, notifyUI } from "@/lib/notification-service";
import type {
  ExchangeOrder,
  LocalOrder,
  MatchedOrder,
  OrderDiscrepancy,
  ReconciliationResult,
  BulkReconciliationResult,
  ReconciliationConfig,
  ReconciliationAction,
  DEFAULT_RECONCILIATION_CONFIG,
} from "./types";

export class OrderReconciler {
  private config: ReconciliationConfig;
  private eventCallbacks: Array<(event: { type: string; timestamp: Date; data: Record<string, unknown> }) => void> = [];

  constructor(config: Partial<ReconciliationConfig> = {}) {
    this.config = {
      autoCloseOrphans: config.autoCloseOrphans ?? false,
      notifyOnDiscrepancy: config.notifyOnDiscrepancy ?? true,
      reconciliationInterval: config.reconciliationInterval ?? 5 * 60 * 1000,
      maxOrderAge: config.maxOrderAge,
      includeDemoAccounts: config.includeDemoAccounts ?? false,
      symbols: config.symbols,
      orphanHandling: config.orphanHandling ?? 'log_only',
      missingHandling: config.missingHandling ?? 'mark_closed',
      notificationThreshold: config.notificationThreshold ?? 'medium',
      maxConcurrent: config.maxConcurrent ?? 3,
      apiTimeout: config.apiTimeout ?? 30000,
    };
  }

  /**
   * Add event callback
   */
  onEvent(callback: (event: { type: string; timestamp: Date; data: Record<string, unknown> }) => void): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Emit event to all callbacks
   */
  private emitEvent(type: string, data: Record<string, unknown>): void {
    const event = { type, timestamp: new Date(), data };
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("[OrderReconciler] Event callback error:", error);
      }
    }
  }

  /**
   * Reconcile orders for a single account
   */
  async reconcileAccount(accountId: string): Promise<ReconciliationResult> {
    const startTime = Date.now();
    
    // Initialize result
    const result: ReconciliationResult = {
      timestamp: new Date(),
      exchange: 'binance' as AllExchangeId, // Will be updated
      account: '',
      accountId,
      exchangeOrdersCount: 0,
      localOrdersCount: 0,
      orphanedOrders: [],
      missingOrders: [],
      matchedOrders: [],
      actions: [],
      summary: {
        totalDiscrepancies: 0,
        criticalDiscrepancies: 0,
        orphansClosed: 0,
        orphansSynced: 0,
        errors: 0,
      },
      durationMs: 0,
      success: false,
    };

    try {
      // Get account from database
      const account = await db.account.findUnique({
        where: { id: accountId },
      });

      if (!account) {
        result.error = `Account ${accountId} not found`;
        await this.logReconciliationError(result);
        return result;
      }

      result.exchange = account.exchangeId as AllExchangeId;
      result.account = account.exchangeName || account.exchangeId;

      // Skip demo accounts if not included
      if (account.accountType === "DEMO" && !this.config.includeDemoAccounts) {
        result.success = true;
        result.error = "Demo account skipped";
        return result;
      }

      // Check for API credentials
      if (!account.apiKey || !account.apiSecret) {
        result.error = "Account has no API credentials";
        await this.logReconciliationError(result);
        return result;
      }

      this.emitEvent('account_started', { accountId, exchange: result.exchange });

      // Decrypt credentials
      const decryptedApiKey = decryptApiKey(account.apiKey);
      const decryptedApiSecret = decryptApiKey(account.apiSecret);

      // Create exchange client
      const client = createExchangeClient(account.exchangeId as ExchangeId, {
        credentials: {
          apiKey: decryptedApiKey,
          apiSecret: decryptedApiSecret,
          passphrase: account.apiPassphrase || undefined,
        },
        marketType: account.exchangeType as MarketType,
        tradingMode: account.isTestnet ? "TESTNET" : "LIVE",
      });

      // Fetch open orders from exchange
      let exchangeOrders: OpenOrder[] = [];
      try {
        exchangeOrders = await client.getOpenOrders();
        result.exchangeOrdersCount = exchangeOrders.length;
      } catch (apiError) {
        result.error = `Failed to fetch exchange orders: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`;
        await this.logReconciliationError(result);
        return result;
      }

      // Fetch local orders from database
      // For grid bots, we need to check GridOrder model
      // For DCA bots, we check DcaOrder model
      // For regular trades, we check Trade model
      const localGridOrders = await db.gridOrder.findMany({
        where: {
          gridBot: { accountId: account.id },
          status: { in: ['OPEN', 'PENDING'] },
        },
        include: { gridBot: true },
      });

      const localDcaOrders = await db.dcaOrder.findMany({
        where: {
          dcaBot: { accountId: account.id },
          status: { in: ['OPEN', 'PENDING'] },
        },
        include: { dcaBot: true },
      });

      // Convert to LocalOrder format
      const localOrders: LocalOrder[] = [
        ...localGridOrders.map(o => ({
          id: o.id,
          exchangeOrderId: o.exchangeOrderId,
          clientOrderId: null,
          symbol: o.gridBot.symbol,
          side: o.side.toLowerCase() as 'buy' | 'sell',
          type: 'limit' as const,
          status: o.status.toLowerCase() as 'open' | 'pending',
          price: o.price,
          quantity: o.amount,
          filledQuantity: o.filled,
          remainingQuantity: o.amount - o.filled,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          accountId: account.id,
          botId: o.gridBotId,
          isDemo: false,
        })),
        ...localDcaOrders.map(o => ({
          id: o.id,
          exchangeOrderId: o.exchangeOrderId,
          clientOrderId: null,
          symbol: o.dcaBot.symbol,
          side: o.side.toLowerCase() as 'buy' | 'sell',
          type: o.orderType.toLowerCase() as 'market' | 'limit',
          status: o.status.toLowerCase() as 'open' | 'pending',
          price: o.price,
          quantity: o.quantity,
          filledQuantity: o.filled,
          remainingQuantity: o.quantity - o.filled,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          accountId: account.id,
          botId: o.dcaBotId,
          isDemo: false,
        })),
      ];

      result.localOrdersCount = localOrders.length;

      // Convert exchange orders to our format
      const exchangeOrdersFormatted: ExchangeOrder[] = exchangeOrders.map(o => ({
        id: o.id,
        clientOrderId: o.clientOrderId,
        exchange: result.exchange,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        status: o.status,
        price: o.price,
        averagePrice: o.avgPrice,
        quantity: o.quantity,
        filledQuantity: o.filledQuantity,
        remainingQuantity: o.remainingQuantity,
        stopPrice: o.stopLossPrice,
        leverage: undefined,
        positionSide: o.positionSide,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        isDemo: o.isDemo,
      }));

      // Find orphaned orders (on exchange, not local)
      for (const exOrder of exchangeOrdersFormatted) {
        const matched = this.findMatchingLocalOrder(exOrder, localOrders);
        
        if (!matched) {
          // This is an orphaned order!
          result.orphanedOrders.push(exOrder);
          this.emitEvent('orphan_found', {
            orderId: exOrder.id,
            symbol: exOrder.symbol,
            exchange: exOrder.exchange,
            accountId,
          });
        } else {
          // Check for discrepancies
          const discrepancies = this.findDiscrepancies(exOrder, matched);
          result.matchedOrders.push({
            exchangeOrder: exOrder,
            localOrder: matched,
            matchType: 'exchange_id',
            discrepancies,
          });
          
          if (discrepancies.length > 0) {
            result.summary.totalDiscrepancies += discrepancies.length;
            result.summary.criticalDiscrepancies += discrepancies.filter(d => d.severity === 'high').length;
          }
        }
      }

      // Find missing orders (local, not on exchange)
      for (const localOrder of localOrders) {
        const matched = exchangeOrdersFormatted.find(
          ex => ex.id === localOrder.exchangeOrderId || 
                (ex.clientOrderId && ex.clientOrderId === localOrder.clientOrderId)
        );
        
        if (!matched) {
          result.missingOrders.push(localOrder);
          this.emitEvent('missing_found', {
            orderId: localOrder.id,
            symbol: localOrder.symbol,
            accountId,
          });
        }
      }

      // Handle orphaned orders
      for (const orphan of result.orphanedOrders) {
        const action = await this.handleOrphanedOrder(orphan, account.id, client);
        result.actions.push(action);
        
        if (action.type === 'close_orphan' && action.success) {
          result.summary.orphansClosed++;
        } else if (action.type === 'sync_local' && action.success) {
          result.summary.orphansSynced++;
        } else if (!action.success) {
          result.summary.errors++;
        }
      }

      // Handle missing orders
      for (const missing of result.missingOrders) {
        const action = await this.handleMissingOrder(missing, account.id);
        result.actions.push(action);
        
        if (!action.success) {
          result.summary.errors++;
        }
      }

      // Send notification if discrepancies found
      if (this.config.notifyOnDiscrepancy && 
          (result.orphanedOrders.length > 0 || result.missingOrders.length > 0)) {
        await this.sendDiscrepancyNotification(result);
      }

      // Log to SystemLog
      await this.logReconciliationResult(result);

      result.success = true;
      this.emitEvent('account_completed', { 
        accountId, 
        orphanedCount: result.orphanedOrders.length,
        missingCount: result.missingOrders.length,
      });

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.summary.errors++;
      await this.logReconciliationError(result);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Reconcile all accounts
   */
  async reconcileAllAccounts(): Promise<BulkReconciliationResult> {
    const startTime = Date.now();
    
    this.emitEvent('started', { timestamp: startTime });

    // Get all accounts with API credentials
    const whereClause: {
      isActive: boolean;
      apiKey: { not: null };
      apiSecret: { not: null };
      accountType?: string;
    } = {
      isActive: true,
      apiKey: { not: null },
      apiSecret: { not: null },
    };

    if (!this.config.includeDemoAccounts) {
      whereClause.accountType = "REAL";
    }

    const accounts = await db.account.findMany({
      where: whereClause,
    });

    const results: ReconciliationResult[] = [];
    let successfulAccounts = 0;
    let failedAccounts = 0;

    // Process accounts with concurrency limit
    const batches = this.chunkArray(accounts, this.config.maxConcurrent);
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(account => this.reconcileAccount(account.id))
      );
      
      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          successfulAccounts++;
        } else {
          failedAccounts++;
        }
      }
    }

    const summary = {
      totalOrphanedOrders: results.reduce((sum, r) => sum + r.orphanedOrders.length, 0),
      totalMissingOrders: results.reduce((sum, r) => sum + r.missingOrders.length, 0),
      totalMatchedOrders: results.reduce((sum, r) => sum + r.matchedOrders.length, 0),
      totalActions: results.reduce((sum, r) => sum + r.actions.length, 0),
      criticalIssues: results.reduce((sum, r) => sum + r.summary.criticalDiscrepancies, 0),
    };

    this.emitEvent('completed', { 
      duration: Date.now() - startTime,
      ...summary 
    });

    return {
      timestamp: new Date(),
      totalAccounts: accounts.length,
      successfulAccounts,
      failedAccounts,
      results,
      summary,
    };
  }

  /**
   * Find matching local order for an exchange order
   */
  private findMatchingLocalOrder(
    exchangeOrder: ExchangeOrder, 
    localOrders: LocalOrder[]
  ): LocalOrder | null {
    // Try to match by exchange order ID
    const byExchangeId = localOrders.find(
      lo => lo.exchangeOrderId === exchangeOrder.id
    );
    if (byExchangeId) return byExchangeId;

    // Try to match by client order ID
    if (exchangeOrder.clientOrderId) {
      const byClientId = localOrders.find(
        lo => lo.clientOrderId === exchangeOrder.clientOrderId
      );
      if (byClientId) return byClientId;
    }

    // Try to match by symbol, side, price (approximate match for limit orders)
    const bySymbolSidePrice = localOrders.find(lo => 
      lo.symbol === exchangeOrder.symbol &&
      lo.side === exchangeOrder.side &&
      Math.abs((lo.price || 0) - exchangeOrder.price) < 0.01 * exchangeOrder.price &&
      lo.status === 'open'
    );
    
    return bySymbolSidePrice || null;
  }

  /**
   * Find discrepancies between exchange and local order
   */
  private findDiscrepancies(
    exchangeOrder: ExchangeOrder, 
    localOrder: LocalOrder
  ): OrderDiscrepancy[] {
    const discrepancies: OrderDiscrepancy[] = [];

    // Check quantity
    if (Math.abs(localOrder.quantity - exchangeOrder.quantity) > 0.0001) {
      discrepancies.push({
        field: 'quantity',
        exchangeValue: exchangeOrder.quantity,
        localValue: localOrder.quantity,
        severity: 'medium',
        description: `Quantity mismatch: exchange ${exchangeOrder.quantity} vs local ${localOrder.quantity}`,
      });
    }

    // Check filled quantity
    if (Math.abs(localOrder.filledQuantity - exchangeOrder.filledQuantity) > 0.0001) {
      discrepancies.push({
        field: 'filledQuantity',
        exchangeValue: exchangeOrder.filledQuantity,
        localValue: localOrder.filledQuantity,
        severity: 'high',
        description: `Fill mismatch: exchange ${exchangeOrder.filledQuantity} vs local ${localOrder.filledQuantity}`,
      });
    }

    // Check status
    const localStatusNormalized = localOrder.status.toLowerCase();
    const exchangeStatusNormalized = exchangeOrder.status.toLowerCase();
    if (localStatusNormalized !== exchangeStatusNormalized) {
      discrepancies.push({
        field: 'status',
        exchangeValue: exchangeOrder.status,
        localValue: localOrder.status,
        severity: 'high',
        description: `Status mismatch: exchange ${exchangeOrder.status} vs local ${localOrder.status}`,
      });
    }

    // Check price for limit orders
    if (exchangeOrder.type === 'limit' && localOrder.price && exchangeOrder.price) {
      if (Math.abs(localOrder.price - exchangeOrder.price) > 0.01) {
        discrepancies.push({
          field: 'price',
          exchangeValue: exchangeOrder.price,
          localValue: localOrder.price,
          severity: 'medium',
          description: `Price mismatch: exchange ${exchangeOrder.price} vs local ${localOrder.price}`,
        });
      }
    }

    return discrepancies;
  }

  /**
   * Handle an orphaned order
   */
  private async handleOrphanedOrder(
    orphan: ExchangeOrder, 
    accountId: string,
    client: ReturnType<typeof createExchangeClient>
  ): Promise<ReconciliationAction> {
    const action: ReconciliationAction = {
      type: 'log_only',
      orderId: orphan.id,
      exchange: orphan.exchange,
      symbol: orphan.symbol,
      description: `Orphaned order found: ${orphan.symbol} ${orphan.side} ${orphan.quantity} @ ${orphan.price}`,
      timestamp: new Date(),
      success: true,
    };

    try {
      switch (this.config.orphanHandling) {
        case 'close_immediately':
          // Danger: This will cancel the order on the exchange
          if (this.config.autoCloseOrphans) {
            await client.cancelOrder({
              symbol: orphan.symbol,
              orderId: orphan.id,
            });
            action.type = 'close_orphan';
            action.description = `Closed orphaned order: ${orphan.id}`;
          }
          break;

        case 'sync_to_local':
          // Create a local record of the orphaned order
          await db.systemLog.create({
            data: {
              level: 'WARNING',
              category: 'RECONCILIATION',
              message: `Orphaned order synced: ${orphan.symbol} ${orphan.side}`,
              details: JSON.stringify({
                type: 'ORPHAN_SYNCED',
                accountId,
                exchangeOrder: orphan,
              }),
            },
          });
          action.type = 'sync_local';
          action.description = `Synced orphan to local logs: ${orphan.id}`;
          break;

        case 'log_only':
        default:
          // Just log it
          await db.systemLog.create({
            data: {
              level: 'WARNING',
              category: 'RECONCILIATION',
              message: `Orphaned order detected: ${orphan.symbol} ${orphan.side}`,
              details: JSON.stringify({
                type: 'ORPHAN_DETECTED',
                accountId,
                exchangeOrder: orphan,
                recommendation: 'Manual review required - order exists on exchange but not in local database',
              }),
            },
          });
          break;
      }

      this.emitEvent('action_taken', {
        actionType: action.type,
        orderId: orphan.id,
        success: true,
      });

    } catch (error) {
      action.success = false;
      action.error = error instanceof Error ? error.message : 'Unknown error';
      action.type = 'error';

      await db.systemLog.create({
        data: {
          level: 'ERROR',
          category: 'RECONCILIATION',
          message: `Failed to handle orphaned order: ${orphan.id}`,
          details: JSON.stringify({
            error: action.error,
            exchangeOrder: orphan,
          }),
        },
      });
    }

    return action;
  }

  /**
   * Handle a missing order (local, not on exchange)
   */
  private async handleMissingOrder(
    missing: LocalOrder, 
    accountId: string
  ): Promise<ReconciliationAction> {
    const action: ReconciliationAction = {
      type: 'log_only',
      orderId: missing.id,
      exchange: 'unknown' as AllExchangeId,
      symbol: missing.symbol,
      description: `Missing order: ${missing.symbol} ${missing.side} ${missing.quantity}`,
      timestamp: new Date(),
      success: true,
    };

    try {
      switch (this.config.missingHandling) {
        case 'mark_closed':
          // Update the local order status
          if (missing.botId?.startsWith('grid')) {
            await db.gridOrder.update({
              where: { id: missing.id },
              data: { 
                status: 'CANCELLED',
              },
            });
          } else if (missing.botId?.startsWith('dca')) {
            await db.dcaOrder.update({
              where: { id: missing.id },
              data: { 
                status: 'CANCELLED',
              },
            });
          }
          
          await db.systemLog.create({
            data: {
              level: 'WARNING',
              category: 'RECONCILIATION',
              message: `Missing order marked closed: ${missing.symbol} ${missing.side}`,
              details: JSON.stringify({
                type: 'MISSING_ORDER_CLOSED',
                accountId,
                localOrder: missing,
              }),
            },
          });
          action.description = `Marked missing order as cancelled: ${missing.id}`;
          break;

        case 'log_only':
        default:
          await db.systemLog.create({
            data: {
              level: 'WARNING',
              category: 'RECONCILIATION',
              message: `Missing order detected: ${missing.symbol} ${missing.side}`,
              details: JSON.stringify({
                type: 'MISSING_ORDER',
                accountId,
                localOrder: missing,
                recommendation: 'Order exists locally but not on exchange - may have been filled or cancelled externally',
              }),
            },
          });
          break;
      }

      this.emitEvent('action_taken', {
        actionType: action.type,
        orderId: missing.id,
        success: true,
      });

    } catch (error) {
      action.success = false;
      action.error = error instanceof Error ? error.message : 'Unknown error';
      action.type = 'error';
    }

    return action;
  }

  /**
   * Send notification for discrepancies
   */
  private async sendDiscrepancyNotification(result: ReconciliationResult): Promise<void> {
    const orphanCount = result.orphanedOrders.length;
    const missingCount = result.missingOrders.length;
    
    if (orphanCount === 0 && missingCount === 0) return;

    const level = result.summary.criticalDiscrepancies > 0 ? '🚨' : '⚠️';
    let message = `${level} *Order Reconciliation Alert*\n\n`;
    message += `📍 *Exchange:* ${result.exchange}\n`;
    message += `📊 *Account:* ${result.account}\n\n`;

    if (orphanCount > 0) {
      message += `👻 *Orphaned Orders:* ${orphanCount}\n`;
      for (const orphan of result.orphanedOrders.slice(0, 5)) {
        message += `  • ${orphan.symbol} ${orphan.side} ${orphan.quantity} @ ${orphan.price}\n`;
      }
      if (orphanCount > 5) {
        message += `  ... and ${orphanCount - 5} more\n`;
      }
      message += '\n';
    }

    if (missingCount > 0) {
      message += `❓ *Missing Orders:* ${missingCount}\n`;
      for (const missing of result.missingOrders.slice(0, 5)) {
        message += `  • ${missing.symbol} ${missing.side} ${missing.quantity}\n`;
      }
      if (missingCount > 5) {
        message += `  ... and ${missingCount - 5} more\n`;
      }
    }

    // Send to Telegram
    try {
      await notifyTelegram({
        type: 'RECONCILIATION_ALERT',
        title: `${level} Order Reconciliation Alert`,
        message,
        data: { 
          accountId: result.accountId,
          orphanedCount: orphanCount,
          missingCount: missingCount,
        },
      });
    } catch (error) {
      console.error("[OrderReconciler] Failed to send Telegram notification:", error);
    }

    // Send to UI
    try {
      await notifyUI({
        type: 'RECONCILIATION_ALERT',
        title: 'Order Reconciliation Complete',
        message: `Found ${orphanCount} orphaned and ${missingCount} missing orders`,
        data: { result },
      });
    } catch (error) {
      console.error("[OrderReconciler] Failed to send UI notification:", error);
    }
  }

  /**
   * Log reconciliation result to SystemLog
   */
  private async logReconciliationResult(result: ReconciliationResult): Promise<void> {
    try {
      await db.systemLog.create({
        data: {
          level: result.orphanedOrders.length > 0 || result.missingOrders.length > 0 ? 'WARNING' : 'INFO',
          category: 'RECONCILIATION',
          message: `Order reconciliation completed for ${result.exchange}:${result.account}`,
          details: JSON.stringify({
            type: 'RECONCILIATION_RESULT',
            accountId: result.accountId,
            exchange: result.exchange,
            account: result.account,
            exchangeOrdersCount: result.exchangeOrdersCount,
            localOrdersCount: result.localOrdersCount,
            orphanedCount: result.orphanedOrders.length,
            missingCount: result.missingOrders.length,
            matchedCount: result.matchedOrders.length,
            summary: result.summary,
            durationMs: result.durationMs,
            orphanedOrders: result.orphanedOrders.map(o => ({
              id: o.id,
              symbol: o.symbol,
              side: o.side,
              quantity: o.quantity,
              price: o.price,
            })),
            missingOrders: result.missingOrders.map(o => ({
              id: o.id,
              symbol: o.symbol,
              side: o.side,
              quantity: o.quantity,
            })),
          }),
        },
      });
    } catch (error) {
      console.error("[OrderReconciler] Failed to log result:", error);
    }
  }

  /**
   * Log reconciliation error to SystemLog
   */
  private async logReconciliationError(result: ReconciliationResult): Promise<void> {
    try {
      await db.systemLog.create({
        data: {
          level: 'ERROR',
          category: 'RECONCILIATION',
          message: `Order reconciliation failed for ${result.exchange}:${result.account}`,
          details: JSON.stringify({
            type: 'RECONCILIATION_ERROR',
            accountId: result.accountId,
            exchange: result.exchange,
            error: result.error,
          }),
        },
      });
    } catch (error) {
      console.error("[OrderReconciler] Failed to log error:", error);
    }
  }

  /**
   * Utility: Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get current configuration
   */
  getConfig(): ReconciliationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ReconciliationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
