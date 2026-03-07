/**
 * Copy Trading Profit Sharing Module
 * 
 * Механизм распределения прибыли между мастер-трейдерами и подписчиками.
 * Поддерживает различные модели распределения:
 * - Fixed percentage от прибыли
 * - Tiered profit sharing (чем больше прибыль - тем больше %)
 * - Performance-based sharing
 */

import { db } from "@/lib/db";

// ==================== TYPES ====================

export interface ProfitShareConfig {
  /** Тип распределения прибыли */
  shareType: "FIXED" | "TIERED" | "PERFORMANCE";
  
  /** Фиксированный процент для FIXED типа */
  fixedPercent?: number;
  
  /** Tiered конфигурация */
  tiers?: ProfitShareTier[];
  
  /** Минимальная прибыль для распределения (USDT) */
  minProfitThreshold: number;
  
  /** Период расчёта (дни) */
  calculationPeriodDays: number;
  
  /** Автоматическое распределение */
  autoDistribute: boolean;
}

export interface ProfitShareTier {
  minProfit: number;     // Минимальная прибыль для этого tier
  maxProfit: number;     // Максимальная прибыль для этого tier
  sharePercent: number;  // % прибыли мастер-трейдеру
}

export interface ProfitShareRecord {
  id: string;
  masterId: string;
  followerId: string;
  tradeId: string;
  positionId: string;
  
  // Детали сделки
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  
  // Финансовые результаты
  followerPnl: number;           // PnL подписчика
  followerPnlPercent: number;    // PnL подписчика в %
  
  // Распределение прибыли
  shareType: "FIXED" | "TIERED" | "PERFORMANCE";
  masterSharePercent: number;    // % мастеру
  masterShareAmount: number;     // Сумма мастеру (USDT)
  followerNetPnl: number;        // Чистый PnL подписчика
  
  // Временные метки
  tradeOpenedAt: Date;
  tradeClosedAt: Date;
  distributedAt?: Date;
  distributed: boolean;
  
  // Статус
  status: "PENDING" | "DISTRIBUTED" | "FAILED" | "SKIPPED";
  error?: string;
}

export interface MasterTraderStats {
  masterId: string;
  totalFollowers: number;
  activeFollowers: number;
  totalAUM: number;              // Assets Under Management
  totalTrades: number;
  totalProfitGenerated: number;  // Общая прибыль для подписчиков
  totalShareEarned: number;      // Заработано на profit sharing
  avgFollowerPnlPercent: number;
  winRate: number;
  avgTradeDuration: number;
}

export interface FollowerStats {
  followerId: string;
  followingMasterId: string;
  copyRatio: number;             // % от размера сделки мастера
  totalCopiedTrades: number;
  totalPnl: number;
  totalSharePaid: number;        // Уплачено мастеру
  winRate: number;
  startDate: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_CONFIG: ProfitShareConfig = {
  shareType: "FIXED",
  fixedPercent: 10,              // 10% от прибыли мастеру
  minProfitThreshold: 10,        // Минимум $10 прибыли
  calculationPeriodDays: 30,
  autoDistribute: true,
};

const DEFAULT_TIERS: ProfitShareTier[] = [
  { minProfit: 0, maxProfit: 100, sharePercent: 10 },
  { minProfit: 100, maxProfit: 500, sharePercent: 12 },
  { minProfit: 500, maxProfit: 2000, sharePercent: 15 },
  { minProfit: 2000, maxProfit: Infinity, sharePercent: 20 },
];

// ==================== PROFIT SHARING ENGINE ====================

export class ProfitSharingEngine {
  private config: ProfitShareConfig;

  constructor(config: Partial<ProfitShareConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!this.config.tiers) {
      this.config.tiers = DEFAULT_TIERS;
    }
  }

  /**
   * Рассчитать распределение прибыли для закрытой сделки
   */
  calculateShare(
    followerPnl: number,
    followerId: string,
    masterId: string
  ): {
    masterSharePercent: number;
    masterShareAmount: number;
    followerNetPnl: number;
    shouldDistribute: boolean;
  } {
    // Проверяем минимальный порог прибыли
    if (followerPnl < this.config.minProfitThreshold) {
      return {
        masterSharePercent: 0,
        masterShareAmount: 0,
        followerNetPnl: followerPnl,
        shouldDistribute: false,
      };
    }

    // Убытки не распределяются
    if (followerPnl <= 0) {
      return {
        masterSharePercent: 0,
        masterShareAmount: 0,
        followerNetPnl: followerPnl,
        shouldDistribute: false,
      };
    }

    // Рассчитываем % в зависимости от типа
    let masterSharePercent: number;

    switch (this.config.shareType) {
      case "FIXED":
        masterSharePercent = this.config.fixedPercent || 10;
        break;

      case "TIERED":
        masterSharePercent = this.calculateTieredPercent(followerPnl);
        break;

      case "PERFORMANCE":
        masterSharePercent = this.calculatePerformancePercent(followerPnl);
        break;

      default:
        masterSharePercent = 10;
    }

    const masterShareAmount = followerPnl * (masterSharePercent / 100);
    const followerNetPnl = followerPnl - masterShareAmount;

    return {
      masterSharePercent,
      masterShareAmount,
      followerNetPnl,
      shouldDistribute: true,
    };
  }

  /**
   * Расчёт tiered процента
   */
  private calculateTieredPercent(profit: number): number {
    const tiers = this.config.tiers || DEFAULT_TIERS;
    
    for (const tier of tiers) {
      if (profit >= tier.minProfit && profit < tier.maxProfit) {
        return tier.sharePercent;
      }
    }
    
    // Возвращаем последний tier для очень больших прибылей
    return tiers[tiers.length - 1]?.sharePercent || 10;
  }

  /**
   * Расчёт performance-based процента
   * Чем выше доходность, тем больше % мастеру
   */
  private calculatePerformancePercent(profit: number): number {
    // Базовый процент 8%, плюс 0.5% за каждые 5% доходности
    const basePercent = 8;
    const performanceBonus = Math.floor(profit / 100) * 0.5;
    return Math.min(basePercent + performanceBonus, 25); // Максимум 25%
  }

  /**
   * Записать распределение прибыли
   */
  async recordShare(
    trade: {
      id: string;
      positionId: string;
      symbol: string;
      direction: string;
      entryPrice: number;
      exitPrice: number;
      positionSize: number;
      pnl: number;
      pnlPercent: number;
      openedAt: Date;
      closedAt: Date;
    },
    followerId: string,
    masterId: string
  ): Promise<ProfitShareRecord> {
    const share = this.calculateShare(trade.pnl, followerId, masterId);

    const record: ProfitShareRecord = {
      id: `ps-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      masterId,
      followerId,
      tradeId: trade.id,
      positionId: trade.positionId,
      symbol: trade.symbol,
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      positionSize: trade.positionSize,
      followerPnl: trade.pnl,
      followerPnlPercent: trade.pnlPercent,
      shareType: this.config.shareType,
      masterSharePercent: share.masterSharePercent,
      masterShareAmount: share.masterShareAmount,
      followerNetPnl: share.followerNetPnl,
      tradeOpenedAt: trade.openedAt,
      tradeClosedAt: trade.closedAt,
      distributed: false,
      status: share.shouldDistribute ? "PENDING" : "SKIPPED",
    };

    return record;
  }

  /**
   * Распределить прибыль мастеру
   */
  async distributeToMaster(record: ProfitShareRecord): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (record.status !== "PENDING") {
      return { success: false, error: "Record is not pending distribution" };
    }

    if (record.masterShareAmount <= 0) {
      return { success: false, error: "No amount to distribute" };
    }

    try {
      // В реальной системе здесь была бы транзакция на бирже или платёжной системе
      // Для DEMO просто записываем в БД

      // Обновляем баланс мастера
      await db.account.update({
        where: { id: record.masterId },
        data: {
          virtualBalance: JSON.stringify({
            // Добавляем баланс (упрощённо)
            lastShareReceived: record.masterShareAmount,
            lastShareDate: new Date(),
          }),
        },
      });

      // Помечаем запись как распределённую
      record.distributed = true;
      record.distributedAt = new Date();
      record.status = "DISTRIBUTED";

      return { success: true };
    } catch (error) {
      record.status = "FAILED";
      record.error = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: record.error };
    }
  }

  /**
   * Получить статистику мастер-трейдера
   */
  async getMasterStats(masterId: string): Promise<MasterTraderStats> {
    // В реальной системе эти данные берутся из БД
    // Здесь возвращаем заглушку
    return {
      masterId,
      totalFollowers: 0,
      activeFollowers: 0,
      totalAUM: 0,
      totalTrades: 0,
      totalProfitGenerated: 0,
      totalShareEarned: 0,
      avgFollowerPnlPercent: 0,
      winRate: 0,
      avgTradeDuration: 0,
    };
  }

  /**
   * Получить статистику подписчика
   */
  async getFollowerStats(followerId: string): Promise<FollowerStats | null> {
    // В реальной системе эти данные берутся из БД
    return null;
  }

  /**
   * Рассчитать суммарное распределение за период
   */
  calculatePeriodDistribution(
    records: ProfitShareRecord[]
  ): {
    totalFollowerPnl: number;
    totalMasterShare: number;
    totalNetPnl: number;
    tradesCount: number;
    profitableTrades: number;
    avgSharePercent: number;
  } {
    const distributed = records.filter(r => r.status === "DISTRIBUTED" || r.status === "PENDING");

    const totalFollowerPnl = distributed.reduce((sum, r) => sum + r.followerPnl, 0);
    const totalMasterShare = distributed.reduce((sum, r) => sum + r.masterShareAmount, 0);
    const totalNetPnl = distributed.reduce((sum, r) => sum + r.followerNetPnl, 0);
    const tradesCount = distributed.length;
    const profitableTrades = distributed.filter(r => r.followerPnl > 0).length;

    const avgSharePercent = tradesCount > 0
      ? distributed.reduce((sum, r) => sum + r.masterSharePercent, 0) / tradesCount
      : 0;

    return {
      totalFollowerPnl,
      totalMasterShare,
      totalNetPnl,
      tradesCount,
      profitableTrades,
      avgSharePercent,
    };
  }

  // ==================== GETTERS/SETTERS ====================

  getConfig(): ProfitShareConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ProfitShareConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ==================== SINGLETON ====================

let engineInstance: ProfitSharingEngine | null = null;

export function getProfitSharingEngine(
  config?: Partial<ProfitShareConfig>
): ProfitSharingEngine {
  if (!engineInstance) {
    engineInstance = new ProfitSharingEngine(config);
  }
  return engineInstance;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Создать конфигурацию profit sharing по профилю риска
 */
export function createProfitShareConfigByRiskProfile(
  profile: "conservative" | "moderate" | "aggressive"
): ProfitShareConfig {
  switch (profile) {
    case "conservative":
      return {
        shareType: "FIXED",
        fixedPercent: 5,
        minProfitThreshold: 20,
        calculationPeriodDays: 30,
        autoDistribute: true,
      };
    case "moderate":
      return {
        shareType: "TIERED",
        tiers: [
          { minProfit: 0, maxProfit: 100, sharePercent: 8 },
          { minProfit: 100, maxProfit: 500, sharePercent: 10 },
          { minProfit: 500, maxProfit: Infinity, sharePercent: 15 },
        ],
        minProfitThreshold: 10,
        calculationPeriodDays: 30,
        autoDistribute: true,
      };
    case "aggressive":
      return {
        shareType: "PERFORMANCE",
        minProfitThreshold: 5,
        calculationPeriodDays: 7,
        autoDistribute: true,
      };
  }
}
