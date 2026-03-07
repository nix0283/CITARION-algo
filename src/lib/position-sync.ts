/**
 * Position Sync Service
 * 
 * Синхронизация позиций с биржей:
 * - Детекция новых позиций, открытых вручную на бирже
 * - Запрос на сопровождение через Telegram/UI
 * - Добавление позиций для сопровождения (SL, TP, Trailing Stop)
 */

import { db } from "@/lib/db";
import { createExchangeClient, type BaseExchangeClient } from "@/lib/exchange";
import { notifyTelegram, notifyUI } from "@/lib/notification-service";
import { getDefaultUserId } from "@/lib/default-user";

// ==================== TYPES ====================

export interface ExchangePosition {
  symbol: string;
  direction: "LONG" | "SHORT"; // Changed from 'side' to 'direction' for consistency
  size: number;
  entryPrice: number;
  markPrice?: number;
  unrealizedPnl: number;
  leverage: number;
  marginMode?: "ISOLATED" | "CROSS";
  liquidationPrice?: number;
  positionId?: string;
  updatedAt?: Date;
}

export interface PositionSyncResult {
  newPositions: ExchangePosition[];
  closedPositions: string[];
  updatedPositions: ExchangePosition[];
  errors: string[];
}

export interface TrackingRequest {
  id: string;
  accountId: string;
  position: ExchangePosition;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  createdAt: Date;
  expiresAt: Date;
  telegramMessageId?: number;
  telegramChatId?: number;
}

// Helper type for internal use
interface BalanceInfo {
  asset: string;
  available: number;
}

// ==================== POSITION SYNC SERVICE ====================

class PositionSyncService {
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private pendingRequests: Map<string, TrackingRequest> = new Map();
  
  /**
   * Запустить синхронизацию для аккаунта
   */
  startSync(accountId: string, intervalMs: number = 30000): void {
    if (this.syncIntervals.has(accountId)) {
      console.log(`[PositionSync] Already syncing account ${accountId}`);
      return;
    }
    
    console.log(`[PositionSync] Starting sync for account ${accountId}`);
    
    // Первый запуск сразу
    this.syncAccount(accountId).catch(console.error);
    
    // Периодический запуск
    const interval = setInterval(async () => {
      try {
        await this.syncAccount(accountId);
      } catch (error) {
        console.error(`[PositionSync] Error syncing account ${accountId}:`, error);
      }
    }, intervalMs);
    
    this.syncIntervals.set(accountId, interval);
  }
  
  /**
   * Остановить синхронизацию для аккаунта
   */
  stopSync(accountId: string): void {
    const interval = this.syncIntervals.get(accountId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(accountId);
      console.log(`[PositionSync] Stopped sync for account ${accountId}`);
    }
  }
  
  /**
   * Синхронизировать позиции аккаунта
   */
  async syncAccount(accountId: string): Promise<PositionSyncResult> {
    const result: PositionSyncResult = {
      newPositions: [],
      closedPositions: [],
      updatedPositions: [],
      errors: [],
    };
    
    try {
      // Получаем аккаунт с API ключами
      const account = await db.account.findUnique({
        where: { id: accountId },
        include: { user: true },
      });
      
      if (!account) {
        result.errors.push(`Account ${accountId} not found`);
        return result;
      }
      
      // Проверяем, что это REAL аккаунт с API ключами
      if (account.accountType !== "REAL") {
        result.errors.push(`Account ${accountId} is not a REAL account`);
        return result;
      }
      
      if (!account.apiKey || !account.apiSecret) {
        result.errors.push(`Account ${accountId} has no API credentials`);
        return result;
      }
      
      // Создаём клиент биржи
      const client = createExchangeClient(account.exchangeId as "binance" | "bybit" | "okx" | "bitget" | "kucoin" | "bingx" | "coinbase" | "huobi" | "hyperliquid" | "bitmex" | "blofin" | "aster" | "gate", {
        credentials: {
          apiKey: account.apiKey,
          apiSecret: account.apiSecret,
          passphrase: account.apiPassphrase || undefined,
          uid: account.apiUid || undefined,
        },
        marketType: account.exchangeType as "spot" | "futures" | "inverse",
        testnet: account.isTestnet,
      });
      
      // Получаем позиции с биржи
      const exchangePositions = await this.fetchExchangePositions(client, account.exchangeType);
      
      // Получаем позиции из БД
      const dbPositions = await db.position.findMany({
        where: {
          accountId,
          status: "OPEN",
        },
      });
      
      // Находим новые позиции (есть на бирже, нет в БД)
      for (const exPos of exchangePositions) {
        const existingInDb = dbPositions.find(
          p => p.symbol === exPos.symbol && p.direction === exPos.direction
        );
        
        if (!existingInDb) {
          // Проверяем, не находится ли позиция уже в pending requests
          const pendingKey = `${accountId}-${exPos.symbol}-${exPos.direction}`;
          if (!this.pendingRequests.has(pendingKey)) {
            result.newPositions.push(exPos);
          }
        } else {
          // Позиция уже сопровождается - обновляем данные
          await this.updateTrackedPosition(existingInDb.id, exPos);
          result.updatedPositions.push(exPos);
        }
      }
      
      // Находим закрытые позиции (есть в БД, нет на бирже)
      for (const dbPos of dbPositions) {
        const stillOpen = exchangePositions.find(
          p => p.symbol === dbPos.symbol && p.direction === dbPos.direction
        );
        
        if (!stillOpen) {
          // Позиция закрыта на бирже
          await this.handlePositionClosed(dbPos.id, "EXTERNAL_CLOSE");
          result.closedPositions.push(dbPos.id);
        }
      }
      
      // Отправляем запросы на сопровождение для новых позиций
      for (const newPos of result.newPositions) {
        await this.requestTracking(account, newPos);
      }
      
      return result;
      
    } catch (error) {
      console.error(`[PositionSync] Sync error for account ${accountId}:`, error);
      result.errors.push(error instanceof Error ? error.message : "Unknown error");
      return result;
    }
  }
  
  /**
   * Получить позиции с биржи
   */
  private async fetchExchangePositions(
    client: BaseExchangeClient,
    exchangeType: string
  ): Promise<ExchangePosition[]> {
    const positions: ExchangePosition[] = [];
    
    try {
      if (exchangeType === "futures" || exchangeType === "inverse") {
        // Получаем futures позиции
        const futuresPositions = await client.getFuturesPositions();
        
        for (const pos of futuresPositions) {
          // Пропускаем пустые позиции
          if (!pos.size || pos.size === 0) continue;
          
          positions.push({
            symbol: pos.symbol,
            direction: pos.direction,
            size: pos.size,
            entryPrice: pos.entryPrice,
            markPrice: pos.markPrice,
            unrealizedPnl: pos.unrealizedPnl || 0,
            leverage: pos.leverage || 1,
            marginMode: pos.marginMode,
            liquidationPrice: pos.liquidationPrice,
            positionId: pos.positionId,
            updatedAt: pos.updatedAt,
          });
        }
      } else {
        // Для Spot - получаем баланс и находим открытые позиции
        // Spot "позиции" - это просто наличие монет на балансе
        const accountInfo = await client.getAccountInfo();
        
        for (const balance of accountInfo.balances) {
          if (balance.available > 0 && balance.currency !== "USDT") {
            // Это "позиция" на spot - у нас есть монета
            const symbol = `${balance.currency}USDT`;
            const currentPrice = await this.getCurrentPrice(symbol);
            
            positions.push({
              symbol,
              direction: "LONG", // Spot всегда LONG
              size: balance.available,
              entryPrice: currentPrice, // Примерная цена входа
              markPrice: currentPrice,
              unrealizedPnl: 0, // Неизвестно без цены входа
              leverage: 1,
            });
          }
        }
      }
      
      return positions;
      
    } catch (error) {
      console.error("[PositionSync] Error fetching exchange positions:", error);
      throw error;
    }
  }
  
  /**
   * Получить текущую цену символа
   */
  private async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
        { signal: AbortSignal.timeout(5000) }
      );
      
      if (response.ok) {
        const data = await response.json();
        return parseFloat(data.price);
      }
    } catch {
      // Ignore
    }
    
    return 0;
  }
  
  /**
   * Запросить сопровождение позиции
   */
  private async requestTracking(
    account: {
      id: string;
      exchangeName: string;
      exchangeType: string;
      user?: { id: string } | null;
    },
    position: ExchangePosition
  ): Promise<void> {
    const requestId = `${account.id}-${position.symbol}-${position.direction}`;
    
    // Создаём запрос на сопровождение
    const request: TrackingRequest = {
      id: requestId,
      accountId: account.id,
      position,
      status: "PENDING",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 минут на ответ
    };
    
    // Сохраняем в pending
    this.pendingRequests.set(requestId, request);
    
    // Сохраняем в БД
    await db.pendingPositionRequest.create({
      data: {
        id: requestId,
        accountId: account.id,
        exchange: account.exchangeName.toLowerCase(),
        marketType: account.exchangeType.toUpperCase(),
        symbol: position.symbol,
        direction: position.direction,
        size: position.size,
        entryPrice: position.entryPrice,
        currentPrice: position.markPrice || position.entryPrice,
        leverage: position.leverage,
        unrealizedPnl: position.unrealizedPnl,
        stopLoss: null,
        takeProfit: null,
        liquidationPrice: position.liquidationPrice || null,
        status: "PENDING",
        expiresAt: request.expiresAt,
      },
    }).catch(() => {
      // Ignore if already exists
    });
    
    // Формируем сообщение
    const sideEmoji = position.direction === "LONG" ? "🟢" : "🔴";
    const positionType = account.exchangeType === "spot" ? "SPOT" : "FUTURES";
    const pnlStr = position.unrealizedPnl !== 0 
      ? `\nPnL: ${position.unrealizedPnl >= 0 ? "+" : ""}$${position.unrealizedPnl.toFixed(2)}`
      : "";
    
    const message = 
      `🔔 *Новая позиция на бирже*\n\n` +
      `${sideEmoji} ${position.symbol} ${position.direction}\n` +
      `Type: ${positionType}\n` +
      `Exchange: ${account.exchangeName}\n` +
      `Size: ${position.size.toFixed(4)}\n` +
      `Entry: $${position.entryPrice.toLocaleString()}\n` +
      `Leverage: ${position.leverage}x${pnlStr}\n\n` +
      `❓ Сопровождать позицию?\n` +
      `(SL, TP, Trailing Stop)`;
    
    // Отправляем в Telegram
    await notifyTelegram({
      type: "TRACKING_REQUEST",
      title: "🔔 External Position Detected",
      message,
      data: { requestId, position },
      priority: "high",
    });
    
    // Отправляем в UI
    await notifyUI({
      type: "TRACKING_REQUEST",
      title: "🔔 External Position Detected",
      message: `${position.symbol} ${position.direction} - Track this position?`,
      data: { 
        requestId, 
        position,
        account: {
          id: account.id,
          name: account.exchangeName,
          type: account.exchangeType,
        },
      },
      priority: "high",
    });
    
    console.log(`[PositionSync] Tracking request sent for ${position.symbol} ${position.direction}`);
  }
  
  /**
   * Обработать ответ на запрос сопровождения
   */
  async handleTrackingResponse(
    requestId: string,
    response: "ACCEPT" | "DECLINE",
    options?: {
      stopLoss?: number;
      takeProfit?: number;
      trailingStop?: {
        type: "PERCENT" | "FIXED" | "BREAKEVEN";
        value: number;
      };
    }
  ): Promise<{ success: boolean; positionId?: string; error?: string }> {
    try {
      // Получаем запрос
      let request = this.pendingRequests.get(requestId);
      
      // Если нет в памяти, пробуем из БД
      if (!request) {
        const dbRequest = await db.pendingPositionRequest.findUnique({
          where: { id: requestId },
        });
        
        if (!dbRequest) {
          return { success: false, error: "Request not found" };
        }
        
        if (dbRequest.status !== "PENDING") {
          return { success: false, error: `Request already ${dbRequest.status.toLowerCase()}` };
        }
        
        if (dbRequest.expiresAt < new Date()) {
          await db.pendingPositionRequest.update({
            where: { id: requestId },
            data: { status: "EXPIRED" },
          });
          return { success: false, error: "Request expired" };
        }
        
        // Восстанавливаем request
        request = {
          id: dbRequest.id,
          accountId: dbRequest.accountId,
          position: {
            symbol: dbRequest.symbol,
            direction: dbRequest.direction as "LONG" | "SHORT",
            size: dbRequest.size,
            entryPrice: dbRequest.entryPrice,
            markPrice: dbRequest.currentPrice,
            unrealizedPnl: dbRequest.unrealizedPnl,
            leverage: dbRequest.leverage,
            liquidationPrice: dbRequest.liquidationPrice || undefined,
          },
          status: dbRequest.status as "PENDING",
          createdAt: dbRequest.createdAt,
          expiresAt: dbRequest.expiresAt,
        };
      }
      
      if (response === "DECLINE") {
        // Обновляем статус
        await db.pendingPositionRequest.update({
          where: { id: requestId },
          data: { 
            status: "REJECTED",
            respondedAt: new Date(),
          },
        });
        
        this.pendingRequests.delete(requestId);
        
        await notifyTelegram({
          type: "POSITION_UPDATED",
          title: "❌ Position Ignored",
          message: `${request.position.symbol} ${request.position.direction} - tracking declined`,
          priority: "normal",
        });
        
        return { success: true };
      }
      
      // ACCEPT - создаём позицию для сопровождения
      const account = await db.account.findUnique({
        where: { id: request.accountId },
      });
      
      if (!account) {
        return { success: false, error: "Account not found" };
      }
      
      // Создаём позицию в БД
      const newPosition = await db.position.create({
        data: {
          accountId: account.id,
          symbol: request.position.symbol,
          direction: request.position.direction,
          status: "OPEN",
          totalAmount: request.position.size,
          filledAmount: request.position.size,
          avgEntryPrice: request.position.entryPrice,
          currentPrice: request.position.markPrice || request.position.entryPrice,
          leverage: request.position.leverage,
          stopLoss: options?.stopLoss,
          takeProfit: options?.takeProfit,
          trailingStop: options?.trailingStop ? JSON.stringify({
            type: options.trailingStop.type,
            value: options.trailingStop.value,
            activated: false,
          }) : null,
          trailingActivated: false,
          isDemo: false,
        },
      });
      
      // Создаём трейд запись
      const userId = account.userId || await getDefaultUserId();
      await db.trade.create({
        data: {
          accountId: account.id,
          userId,
          symbol: request.position.symbol,
          direction: request.position.direction,
          status: "OPEN",
          entryPrice: request.position.entryPrice,
          entryTime: new Date(),
          amount: request.position.size,
          leverage: request.position.leverage,
          stopLoss: options?.stopLoss,
          takeProfits: options?.takeProfit ? JSON.stringify([{ price: options.takeProfit, percentage: 100 }]) : null,
          signalSource: "EXTERNAL_SYNC",
          isDemo: false,
          positionId: newPosition.id,
        },
      });
      
      // Обновляем запрос
      await db.pendingPositionRequest.update({
        where: { id: requestId },
        data: { 
          status: "ACCEPTED",
          positionId: newPosition.id,
          respondedAt: new Date(),
        },
      });
      
      this.pendingRequests.delete(requestId);
      
      // Уведомление
      const slStr = options?.stopLoss ? `\nSL: $${options.stopLoss.toLocaleString()}` : "";
      const tpStr = options?.takeProfit ? `\nTP: $${options.takeProfit.toLocaleString()}` : "";
      const trailStr = options?.trailingStop 
        ? `\nTrailing: ${options.trailingStop.type} ${options.trailingStop.value}${options.trailingStop.type === "PERCENT" ? "%" : "$"}`
        : "";
      
      await notifyTelegram({
        type: "POSITION_OPENED",
        title: "✅ Position Tracking Started",
        message: 
          `${request.position.symbol} ${request.position.direction}\n` +
          `Entry: $${request.position.entryPrice.toLocaleString()}` +
          `${slStr}${tpStr}${trailStr}`,
        priority: "normal",
      });
      
      await notifyUI({
        type: "POSITION_OPENED",
        title: "✅ Position Tracking Started",
        message: `${request.position.symbol} ${request.position.direction} - now tracking`,
        data: { positionId: newPosition.id },
        priority: "normal",
      });
      
      return { success: true, positionId: newPosition.id };
      
    } catch (error) {
      console.error("[PositionSync] Error handling tracking response:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }
  
  /**
   * Обновить сопровождаемую позицию
   */
  private async updateTrackedPosition(
    positionId: string,
    exchangePosition: ExchangePosition
  ): Promise<void> {
    await db.position.update({
      where: { id: positionId },
      data: {
        currentPrice: exchangePosition.markPrice || exchangePosition.entryPrice,
        unrealizedPnl: exchangePosition.unrealizedPnl,
      },
    });
  }
  
  /**
   * Обработать закрытие позиции на бирже
   */
  private async handlePositionClosed(
    positionId: string,
    reason: string
  ): Promise<void> {
    const position = await db.position.findUnique({
      where: { id: positionId },
    });
    
    if (!position) return;
    
    // Закрываем позицию
    await db.position.update({
      where: { id: positionId },
      data: {
        status: "CLOSED",
        unrealizedPnl: position.unrealizedPnl,
      },
    });
    
    // Обновляем трейд
    await db.trade.updateMany({
      where: { positionId },
      data: {
        status: "CLOSED",
        closeReason: reason,
        exitTime: new Date(),
        exitPrice: position.currentPrice,
        pnl: position.unrealizedPnl,
      },
    });
    
    // Уведомление
    const pnlStr = position.unrealizedPnl >= 0 
      ? `+$${position.unrealizedPnl.toFixed(2)}` 
      : `-$${Math.abs(position.unrealizedPnl).toFixed(2)}`;
    
    await notifyTelegram({
      type: "POSITION_CLOSED",
      title: "📍 Position Closed Externally",
      message: `${position.symbol} ${position.direction}\nPnL: ${pnlStr}`,
      priority: "normal",
    });
    
    await notifyUI({
      type: "POSITION_CLOSED",
      title: "📍 Position Closed on Exchange",
      message: `${position.symbol} ${position.direction} - ${pnlStr}`,
      data: { positionId },
      priority: "normal",
    });
  }
  
  /**
   * Запустить синхронизацию всех REAL аккаунтов
   */
  async syncAllRealAccounts(): Promise<void> {
    const accounts = await db.account.findMany({
      where: {
        accountType: "REAL",
        isActive: true,
        apiKey: { not: null },
        apiSecret: { not: null },
      },
    });
    
    for (const account of accounts) {
      try {
        await this.syncAccount(account.id);
      } catch (error) {
        console.error(`[PositionSync] Error syncing account ${account.id}:`, error);
      }
    }
  }
  
  /**
   * Получить pending запросы
   */
  getPendingRequests(): TrackingRequest[] {
    return Array.from(this.pendingRequests.values());
  }
  
  /**
   * Очистить истёкшие запросы
   */
  async cleanExpiredRequests(): Promise<void> {
    const now = new Date();
    
    for (const [key, request] of this.pendingRequests) {
      if (request.expiresAt < now) {
        await db.pendingPositionRequest.update({
          where: { id: request.id },
          data: { status: "EXPIRED" },
        }).catch(() => {});
        
        this.pendingRequests.delete(key);
      }
    }
  }
}

// Singleton instance
let positionSyncInstance: PositionSyncService | null = null;

export function getPositionSyncService(): PositionSyncService {
  if (!positionSyncInstance) {
    positionSyncInstance = new PositionSyncService();
  }
  return positionSyncInstance;
}

// Экспорт функций для удобства
export const startAccountSync = (accountId: string, intervalMs?: number) => 
  getPositionSyncService().startSync(accountId, intervalMs);

export const stopAccountSync = (accountId: string) => 
  getPositionSyncService().stopSync(accountId);

export const syncAccount = (accountId: string) => 
  getPositionSyncService().syncAccount(accountId);

export const handleTrackingResponse = (
  requestId: string,
  response: "ACCEPT" | "DECLINE",
  options?: {
    stopLoss?: number;
    takeProfit?: number;
    trailingStop?: {
      type: "PERCENT" | "FIXED" | "BREAKEVEN";
      value: number;
    };
  }
) => getPositionSyncService().handleTrackingResponse(requestId, response, options);

export const syncAllRealAccounts = () => 
  getPositionSyncService().syncAllRealAccounts();

export const getPendingTrackingRequests = () => 
  getPositionSyncService().getPendingRequests();
