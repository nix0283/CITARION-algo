/**
 * Paper Trading Persistence Layer
 * 
 * Сохранение и восстановление состояния виртуальных счетов в базу данных.
 * Автоматическое сохранение каждые N минут для предотвращения потери данных.
 * 
 * Поддерживает два режима:
 * 1. PaperTradingAccount (одна таблица, JSON для позиций/сделок)
 * 2. PaperAccount + PaperPosition + PaperTrade (отдельные таблицы)
 */

import { db } from "@/lib/db";
import {
  PaperAccount,
  PaperPosition,
  PaperTrade,
  PaperEquityPoint,
  PaperTradingConfig,
  PaperTradingMetrics,
} from "./types";

// ==================== INTERFACES ====================

export interface SlippageRecord {
  timestamp: Date;
  symbol: string;
  side: "buy" | "sell";
  requestedPrice: number;
  executedPrice: number;
  slippage: number;
  slippagePercent: number;
  size: number;
}

export interface PersistenceConfig {
  autoSaveIntervalMs: number;  // Интервал автосохранения (по умолчанию 5 минут)
  maxEquityCurvePoints: number; // Максимум точек эквити для сохранения
  maxSlippageRecords: number;   // Максимум записей о slippage
  useSeparateTables: boolean;   // Использовать отдельные таблицы (PaperAccount, PaperPosition, PaperTrade)
}

const DEFAULT_CONFIG: PersistenceConfig = {
  autoSaveIntervalMs: 5 * 60 * 1000, // 5 минут
  maxEquityCurvePoints: 1000,
  maxSlippageRecords: 1000,
  useSeparateTables: true, // По умолчанию используем новые отдельные таблицы
};

// ==================== PERSISTENCE CLASS ====================

export class PaperTradingPersistence {
  private config: PersistenceConfig;
  private saveTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingSaves: Set<string> = new Set();
  private isSaving: boolean = false;

  constructor(config?: Partial<PersistenceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==================== SAVE METHODS (NEW TABLES) ====================

  /**
   * Сохранить состояние счёта в базу данных (новые таблицы)
   */
  async saveAccount(account: PaperAccount): Promise<void> {
    if (this.config.useSeparateTables) {
      return this.saveAccountV2(account);
    }
    return this.saveAccountV1(account);
  }

  /**
   * Сохранить счёт в новую таблицу PaperAccount с отдельными таблицами для позиций и сделок
   */
  private async saveAccountV2(account: PaperAccount): Promise<void> {
    try {
      const positions = this.serializePositions(account.positions);
      const equityCurve = this.serializeEquityCurve(
        account.equityCurve.slice(-this.config.maxEquityCurvePoints)
      );
      const metrics = account.metrics ? JSON.stringify(account.metrics) : null;

      // Рассчитываем marginUsed
      const marginUsed = account.positions
        .filter(p => p.status === "OPEN")
        .reduce((sum, p) => sum + p.margin, 0);

      await db.paperAccount.upsert({
        where: { id: account.id },
        update: {
          balance: account.balance,
          equity: account.equity,
          availableMargin: account.availableMargin,
          marginUsed,
          currentDrawdown: account.currentDrawdown,
          maxDrawdown: account.maxDrawdown,
          status: account.status,
          positions,
          equityCurve,
          metrics,
          updatedAt: new Date(),
        },
        create: {
          id: account.id,
          userId: account.config.userId,
          initialBalance: account.initialBalance,
          balance: account.balance,
          equity: account.equity,
          availableMargin: account.availableMargin,
          marginUsed,
          currentDrawdown: account.currentDrawdown,
          maxDrawdown: account.maxDrawdown,
          status: account.status,
          positions,
          equityCurve,
          metrics,
        },
      });

      // Сохраняем позиции в отдельную таблицу
      for (const position of account.positions) {
        await this.savePositionV2(account.id, position);
      }

      console.log(`[PaperTrading] Account ${account.id} saved to database (V2)`);
    } catch (error) {
      console.error(`[PaperTrading] Failed to save account ${account.id}:`, error);
      throw error;
    }
  }

  /**
   * Сохранить позицию в отдельную таблицу PaperPosition
   */
  private async savePositionV2(accountId: string, position: PaperPosition): Promise<void> {
    try {
      const takeProfit = position.takeProfitTargets.length > 0
        ? JSON.stringify(position.takeProfitTargets)
        : null;
      
      const trailingStop = position.tacticsState.trailingState
        ? JSON.stringify(position.tacticsState.trailingState)
        : null;

      await db.paperPosition.upsert({
        where: { id: position.id },
        update: {
          symbol: position.symbol,
          direction: position.direction,
          totalSize: position.totalSize,
          entryPrice: position.avgEntryPrice,
          currentPrice: position.currentPrice,
          unrealizedPnl: position.unrealizedPnl,
          stopLoss: position.stopLoss,
          takeProfit,
          leverage: position.leverage,
          marginUsed: position.margin,
          liquidationPrice: position.liquidationPrice,
          status: position.status,
          trailingStop,
          totalFundingPaid: 0, // TODO: track funding
          closedAt: position.closedAt,
        },
        create: {
          id: position.id,
          accountId,
          symbol: position.symbol,
          direction: position.direction,
          totalSize: position.totalSize,
          entryPrice: position.avgEntryPrice,
          currentPrice: position.currentPrice,
          unrealizedPnl: position.unrealizedPnl,
          stopLoss: position.stopLoss,
          takeProfit,
          leverage: position.leverage,
          marginUsed: position.margin,
          liquidationPrice: position.liquidationPrice,
          status: position.status,
          trailingStop,
          totalFundingPaid: 0,
          openedAt: position.openedAt,
          closedAt: position.closedAt,
        },
      });
    } catch (error) {
      console.error(`[PaperTrading] Failed to save position ${position.id}:`, error);
    }
  }

  /**
   * Сохранить сделку в отдельную таблицу PaperTrade
   */
  async saveTrade(trade: {
    accountId: string;
    positionId?: string;
    symbol: string;
    direction: string;
    side: string;
    size: number;
    price: number;
    pnl?: number;
    fee: number;
    reason?: string;
  }): Promise<void> {
    try {
      await db.paperTrade.create({
        data: {
          accountId: trade.accountId,
          positionId: trade.positionId,
          symbol: trade.symbol,
          direction: trade.direction,
          side: trade.side,
          size: trade.size,
          price: trade.price,
          pnl: trade.pnl,
          fee: trade.fee,
          reason: trade.reason,
        },
      });

      console.log(`[PaperTrading] Trade saved: ${trade.symbol} ${trade.side} ${trade.size}`);
    } catch (error) {
      console.error(`[PaperTrading] Failed to save trade:`, error);
      throw error;
    }
  }

  // ==================== SAVE METHODS (LEGACY TABLE) ====================

  /**
   * Сохранить счёт в старую таблицу PaperTradingAccount
   */
  private async saveAccountV1(account: PaperAccount): Promise<void> {
    try {
      const positions = this.serializePositions(account.positions);
      const tradeHistory = this.serializeTrades(account.tradeHistory);
      const equityCurve = this.serializeEquityCurve(
        account.equityCurve.slice(-this.config.maxEquityCurvePoints)
      );
      const metrics = account.metrics ? JSON.stringify(account.metrics) : null;
      const config = JSON.stringify(account.config);

      await db.paperTradingAccount.upsert({
        where: { id: account.id },
        update: {
          balance: account.balance,
          equity: account.equity,
          availableMargin: account.availableMargin,
          maxEquity: account.maxEquity,
          totalPnl: account.totalPnl,
          totalPnlPercent: account.totalPnlPercent,
          realizedPnl: account.realizedPnl,
          unrealizedPnl: account.unrealizedPnl,
          maxDrawdown: account.maxDrawdown,
          currentDrawdown: account.currentDrawdown,
          status: account.status,
          startedAt: account.startedAt,
          stoppedAt: account.stoppedAt,
          positions,
          tradeHistory,
          equityCurve,
          metrics,
          config,
          lastUpdate: new Date(),
        },
        create: {
          id: account.id,
          userId: account.config.userId,
          name: account.name || account.id,
          initialBalance: account.initialBalance,
          balance: account.balance,
          equity: account.equity,
          availableMargin: account.availableMargin,
          maxEquity: account.maxEquity,
          totalPnl: account.totalPnl,
          totalPnlPercent: account.totalPnlPercent,
          realizedPnl: account.realizedPnl,
          unrealizedPnl: account.unrealizedPnl,
          maxDrawdown: account.maxDrawdown,
          currentDrawdown: account.currentDrawdown,
          status: account.status,
          startedAt: account.startedAt,
          stoppedAt: account.stoppedAt,
          positions,
          tradeHistory,
          equityCurve,
          metrics,
          config,
        },
      });

      console.log(`[PaperTrading] Account ${account.id} saved to database (V1)`);
    } catch (error) {
      console.error(`[PaperTrading] Failed to save account ${account.id}:`, error);
      throw error;
    }
  }

  /**
   * Сохранить несколько счетов
   */
  async saveAllAccounts(accounts: PaperAccount[]): Promise<void> {
    if (this.isSaving) {
      // Если уже идёт сохранение, отмечаем что нужны повторные сохранения
      accounts.forEach(acc => this.pendingSaves.add(acc.id));
      return;
    }

    this.isSaving = true;
    try {
      await Promise.all(accounts.map(acc => this.saveAccount(acc)));
    } finally {
      this.isSaving = false;

      // Если были отложенные сохранения, выполняем их
      if (this.pendingSaves.size > 0) {
        this.pendingSaves.clear();
        await this.saveAllAccounts(accounts);
      }
    }
  }

  /**
   * Сохранить записи о slippage
   */
  async saveSlippageLog(
    accountId: string,
    slippageLog: SlippageRecord[]
  ): Promise<void> {
    try {
      const recentSlippage = slippageLog.slice(-this.config.maxSlippageRecords);
      await db.paperTradingAccount.update({
        where: { id: accountId },
        data: {
          slippageLog: JSON.stringify(recentSlippage),
        },
      });
    } catch (error) {
      console.error(`[PaperTrading] Failed to save slippage log:`, error);
    }
  }

  // ==================== LOAD METHODS ====================

  /**
   * Загрузить счёт из базы данных
   */
  async loadAccount(accountId: string): Promise<PaperAccount | null> {
    if (this.config.useSeparateTables) {
      return this.loadAccountV2(accountId);
    }
    return this.loadAccountV1(accountId);
  }

  /**
   * Загрузить счёт из новых таблиц
   */
  private async loadAccountV2(accountId: string): Promise<PaperAccount | null> {
    try {
      const dbAccount = await db.paperAccount.findUnique({
        where: { id: accountId },
        include: {
          paperPositions: true,
          paperTrades: {
            orderBy: { timestamp: 'desc' },
            take: 1000,
          },
        },
      });

      if (!dbAccount) {
        return null;
      }

      return this.deserializeAccountV2(dbAccount);
    } catch (error) {
      console.error(`[PaperTrading] Failed to load account ${accountId}:`, error);
      return null;
    }
  }

  /**
   * Загрузить счёт из старой таблицы
   */
  private async loadAccountV1(accountId: string): Promise<PaperAccount | null> {
    try {
      const dbAccount = await db.paperTradingAccount.findUnique({
        where: { id: accountId },
      });

      if (!dbAccount) {
        return null;
      }

      return this.deserializeAccount(dbAccount);
    } catch (error) {
      console.error(`[PaperTrading] Failed to load account ${accountId}:`, error);
      return null;
    }
  }

  /**
   * Загрузить все счета пользователя
   */
  async loadUserAccounts(userId: string): Promise<PaperAccount[]> {
    try {
      if (this.config.useSeparateTables) {
        const dbAccounts = await db.paperAccount.findMany({
          where: { userId },
          include: {
            paperPositions: true,
            paperTrades: {
              orderBy: { timestamp: 'desc' },
              take: 1000,
            },
          },
        });

        return dbAccounts
          .map(acc => this.deserializeAccountV2(acc))
          .filter((acc): acc is PaperAccount => acc !== null);
      } else {
        const dbAccounts = await db.paperTradingAccount.findMany({
          where: { userId },
        });

        return dbAccounts
          .map(acc => this.deserializeAccount(acc))
          .filter((acc): acc is PaperAccount => acc !== null);
      }
    } catch (error) {
      console.error(`[PaperTrading] Failed to load user accounts:`, error);
      return [];
    }
  }

  /**
   * Загрузить все активные счета
   */
  async loadActiveAccounts(): Promise<PaperAccount[]> {
    try {
      if (this.config.useSeparateTables) {
        const dbAccounts = await db.paperAccount.findMany({
          where: {
            status: { in: ["RUNNING", "PAUSED", "ACTIVE"] },
          },
          include: {
            paperPositions: true,
            paperTrades: {
              orderBy: { timestamp: 'desc' },
              take: 1000,
            },
          },
        });

        return dbAccounts
          .map(acc => this.deserializeAccountV2(acc))
          .filter((acc): acc is PaperAccount => acc !== null);
      } else {
        const dbAccounts = await db.paperTradingAccount.findMany({
          where: {
            status: { in: ["RUNNING", "PAUSED"] },
          },
        });

        return dbAccounts
          .map(acc => this.deserializeAccount(acc))
          .filter((acc): acc is PaperAccount => acc !== null);
      }
    } catch (error) {
      console.error(`[PaperTrading] Failed to load active accounts:`, error);
      return [];
    }
  }

  /**
   * Загрузить все аккаунты (алиас для loadActiveAccounts)
   */
  async loadAllAccounts(): Promise<PaperAccount[]> {
    return this.loadActiveAccounts();
  }

  /**
   * Загрузить slippage log
   */
  async loadSlippageLog(accountId: string): Promise<SlippageRecord[]> {
    try {
      const dbAccount = await db.paperTradingAccount.findUnique({
        where: { id: accountId },
        select: { slippageLog: true },
      });

      if (!dbAccount?.slippageLog) {
        return [];
      }

      return JSON.parse(dbAccount.slippageLog);
    } catch (error) {
      console.error(`[PaperTrading] Failed to load slippage log:`, error);
      return [];
    }
  }

  // ==================== DELETE METHODS ====================

  /**
   * Удалить счёт из базы данных
   */
  async deleteAccount(accountId: string): Promise<void> {
    try {
      if (this.config.useSeparateTables) {
        // Каскадное удаление позиций и сделок настроено в схеме
        await db.paperAccount.delete({
          where: { id: accountId },
        });
      } else {
        await db.paperTradingAccount.delete({
          where: { id: accountId },
        });
      }
      console.log(`[PaperTrading] Account ${accountId} deleted from database`);
    } catch (error) {
      console.error(`[PaperTrading] Failed to delete account ${accountId}:`, error);
    }
  }

  // ==================== AUTO-SAVE ====================

  /**
   * Запустить автосохранение для счёта
   */
  startAutoSave(accountId: string, getAccount: () => PaperAccount | undefined): void {
    // Остановить существующий таймер если есть
    this.stopAutoSave(accountId);

    const timer = setInterval(async () => {
      const account = getAccount();
      if (account) {
        await this.saveAccount(account);
      }
    }, this.config.autoSaveIntervalMs);

    this.saveTimers.set(accountId, timer);
    console.log(`[PaperTrading] Auto-save started for account ${accountId} (interval: ${this.config.autoSaveIntervalMs / 1000}s)`);
  }

  /**
   * Остановить автосохранение
   */
  stopAutoSave(accountId: string): void {
    const timer = this.saveTimers.get(accountId);
    if (timer) {
      clearInterval(timer);
      this.saveTimers.delete(accountId);
      console.log(`[PaperTrading] Auto-save stopped for account ${accountId}`);
    }
  }

  /**
   * Остановить все автосохранения
   */
  stopAllAutoSaves(): void {
    for (const [accountId, timer] of this.saveTimers) {
      clearInterval(timer);
      console.log(`[PaperTrading] Auto-save stopped for account ${accountId}`);
    }
    this.saveTimers.clear();
  }

  // ==================== SERIALIZATION ====================

  private serializePositions(positions: PaperPosition[]): string {
    return JSON.stringify(positions, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
  }

  private serializeTrades(trades: PaperTrade[]): string {
    return JSON.stringify(trades, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
  }

  private serializeEquityCurve(equityCurve: PaperEquityPoint[]): string {
    return JSON.stringify(equityCurve, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
  }

  private deserializeAccount(dbAccount: any): PaperAccount | null {
    try {
      const config: PaperTradingConfig = JSON.parse(dbAccount.config);
      const positions: PaperPosition[] = this.parseWithDates(dbAccount.positions);
      const tradeHistory: PaperTrade[] = this.parseWithDates(dbAccount.tradeHistory);
      const equityCurve: PaperEquityPoint[] = this.parseWithDates(dbAccount.equityCurve);
      const metrics: PaperTradingMetrics | undefined = dbAccount.metrics
        ? JSON.parse(dbAccount.metrics)
        : undefined;

      return {
        id: dbAccount.id,
        name: dbAccount.name,
        config,
        initialBalance: dbAccount.initialBalance,
        balance: dbAccount.balance,
        equity: dbAccount.equity,
        availableMargin: dbAccount.availableMargin,
        maxEquity: dbAccount.maxEquity,
        positions,
        tradeHistory,
        equityCurve,
        totalPnl: dbAccount.totalPnl,
        totalPnlPercent: dbAccount.totalPnlPercent,
        realizedPnl: dbAccount.realizedPnl,
        unrealizedPnl: dbAccount.unrealizedPnl,
        maxDrawdown: dbAccount.maxDrawdown,
        currentDrawdown: dbAccount.currentDrawdown,
        status: dbAccount.status,
        startedAt: dbAccount.startedAt,
        stoppedAt: dbAccount.stoppedAt,
        lastUpdate: dbAccount.lastUpdate,
        metrics,
      };
    } catch (error) {
      console.error(`[PaperTrading] Failed to deserialize account:`, error);
      return null;
    }
  }

  private deserializeAccountV2(dbAccount: any): PaperAccount | null {
    try {
      // Десериализуем позиции из JSON (основное хранилище)
      const positions: PaperPosition[] = dbAccount.positions
        ? this.parseWithDates(dbAccount.positions)
        : [];
      
      // Также десериализуем из отдельных таблиц если есть
      if (dbAccount.paperPositions && dbAccount.paperPositions.length > 0) {
        for (const dbPos of dbAccount.paperPositions) {
          const existingPos = positions.find(p => p.id === dbPos.id);
          if (!existingPos && dbPos.status === "OPEN") {
            // Восстанавливаем позицию из отдельной таблицы
            positions.push(this.positionFromDB(dbPos));
          }
        }
      }

      // Десериализуем сделки
      const tradeHistory: PaperTrade[] = dbAccount.paperTrades
        ? dbAccount.paperTrades.map((t: any) => this.tradeFromDB(t))
        : [];

      // Десериализуем кривую эквити
      const equityCurve: PaperEquityPoint[] = dbAccount.equityCurve
        ? this.parseWithDates(dbAccount.equityCurve)
        : [];

      // Десериализуем метрики
      const metrics: PaperTradingMetrics | undefined = dbAccount.metrics
        ? JSON.parse(dbAccount.metrics)
        : undefined;

      // Создаём конфигурацию (используем значения по умолчанию если не заданы)
      const config: PaperTradingConfig = {
        id: dbAccount.id,
        name: dbAccount.name || dbAccount.id,
        initialBalance: dbAccount.initialBalance,
        currency: "USDT",
        exchange: "binance",
        symbols: [],
        timeframe: "1h",
        strategyId: "default",
        tacticsSets: [],
        maxRiskPerTrade: 2,
        maxDrawdown: 20,
        maxOpenPositions: 5,
        maxLeverage: 10,
        feePercent: 0.1,
        slippagePercent: 0.05,
        autoTrading: true,
        checkInterval: 60000,
        notifications: {
          onEntry: true,
          onExit: true,
          onError: true,
          onMaxDrawdown: true,
        },
        userId: dbAccount.userId,
      };

      return {
        id: dbAccount.id,
        name: dbAccount.id,
        config,
        initialBalance: dbAccount.initialBalance,
        balance: dbAccount.balance,
        equity: dbAccount.equity,
        availableMargin: dbAccount.availableMargin,
        maxEquity: dbAccount.equity, // TODO: track in DB
        positions,
        tradeHistory,
        equityCurve,
        totalPnl: dbAccount.equity - dbAccount.initialBalance,
        totalPnlPercent: ((dbAccount.equity - dbAccount.initialBalance) / dbAccount.initialBalance) * 100,
        realizedPnl: 0, // TODO: calculate from trades
        unrealizedPnl: positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
        maxDrawdown: dbAccount.maxDrawdown,
        currentDrawdown: dbAccount.currentDrawdown,
        status: dbAccount.status,
        startedAt: dbAccount.createdAt,
        stoppedAt: undefined,
        lastUpdate: dbAccount.updatedAt,
        metrics,
      };
    } catch (error) {
      console.error(`[PaperTrading] Failed to deserialize account V2:`, error);
      return null;
    }
  }

  private positionFromDB(dbPos: any): PaperPosition {
    return {
      id: dbPos.id,
      symbol: dbPos.symbol,
      direction: dbPos.direction as "LONG" | "SHORT",
      status: dbPos.status as "OPEN" | "CLOSED",
      avgEntryPrice: dbPos.entryPrice,
      entries: [{
        index: 1,
        price: dbPos.entryPrice,
        size: dbPos.totalSize,
        fee: 0,
        timestamp: dbPos.openedAt,
        orderType: "MARKET" as const,
      }],
      totalSize: dbPos.totalSize,
      openedAt: dbPos.openedAt,
      exits: [],
      currentPrice: dbPos.currentPrice,
      stopLoss: dbPos.stopLoss || undefined,
      takeProfitTargets: dbPos.takeProfit ? JSON.parse(dbPos.takeProfit) : [],
      unrealizedPnl: dbPos.unrealizedPnl,
      unrealizedPnlPercent: dbPos.marginUsed > 0 ? (dbPos.unrealizedPnl / dbPos.marginUsed) * 100 : 0,
      realizedPnl: 0,
      totalFees: 0,
      leverage: dbPos.leverage,
      marginMode: "isolated" as const,
      margin: dbPos.marginUsed,
      liquidationPrice: dbPos.liquidationPrice || undefined,
      tacticsState: {
        positionId: dbPos.id,
        tacticsSetId: "",
        entryStatus: "COMPLETED",
        executedEntries: [],
        executedTPs: [],
        stopLossHistory: [],
        updatedAt: new Date(),
        trailingState: dbPos.trailingStop ? JSON.parse(dbPos.trailingStop) : undefined,
      },
    };
  }

  private tradeFromDB(dbTrade: any): PaperTrade {
    return {
      id: dbTrade.id,
      positionId: dbTrade.positionId || "",
      symbol: dbTrade.symbol,
      direction: dbTrade.direction as "LONG" | "SHORT",
      avgEntryPrice: 0, // TODO: get from position
      totalSize: dbTrade.size,
      openedAt: dbTrade.timestamp,
      avgExitPrice: dbTrade.price,
      closedAt: dbTrade.timestamp,
      closeReason: "MANUAL" as const, // TODO: map from reason
      pnl: dbTrade.pnl || 0,
      pnlPercent: 0,
      fees: dbTrade.fee,
      netPnl: (dbTrade.pnl || 0) - dbTrade.fee,
      durationMinutes: 0,
      tacticsSetId: "",
    };
  }

  private parseWithDates(json: string): any[] {
    return JSON.parse(json, (key, value) => {
      // Пытаемся преобразовать строки в даты для известных полей
      const dateFields = [
        "timestamp",
        "openedAt",
        "closedAt",
        "createdAt",
        "updatedAt",
        "filledAt",
        "expiresAt",
        "lastUpdate",
      ];

      if (typeof value === "string" && dateFields.includes(key)) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
      return value;
    });
  }
}

// ==================== SINGLETON INSTANCE ====================

let persistenceInstance: PaperTradingPersistence | null = null;

export function getPaperTradingPersistence(
  config?: Partial<PersistenceConfig>
): PaperTradingPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new PaperTradingPersistence(config);
  }
  return persistenceInstance;
}
