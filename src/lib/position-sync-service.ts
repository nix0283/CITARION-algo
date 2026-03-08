/**
 * Position Sync Service
 * 
 * Синхронизация позиций с биржей:
 * - Обнаружение новых позиций, открытых вручную на бирже
 * - Отправка уведомлений с запросом на сопровождение
 * - Обработка подтверждений/отклонений
 * - Сопровождение внешних позиций (SL, TP, Trailing)
 */

import { db } from "@/lib/db";
import { createExchangeClient } from "@/lib/exchange";
import { type ExchangeId } from "@/lib/exchange/types";
import { notifyTelegram, notifyUI, type NotificationEvent } from "@/lib/notification-service";

// ==================== TYPES ====================

export interface ExchangePosition {
  symbol: string;
  direction: "LONG" | "SHORT";
  size: number;           // Position size in contracts/coins
  entryPrice: number;     // Average entry price
  markPrice?: number;     // Current mark price
  unrealizedPnl: number;  // Unrealized PnL
  leverage: number;
  marginMode?: "ISOLATED" | "CROSS";
  liquidationPrice?: number;
  positionId?: string;    // Exchange position ID
  updatedAt: Date;
}

export interface PositionSyncResult {
  newPositions: ExchangePosition[];
  closedPositions: string[];
  updatedPositions: string[];
  errors: string[];
}

export interface EscortRequest {
  positionId: string;
  accountId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  size: number;
  leverage: number;
  exchangePositionId?: string;
  exchangeName: string;
}

// ==================== SYNC POSITIONS FROM EXCHANGE ====================

/**
 * Синхронизировать позиции с конкретного аккаунта биржи
 */
export async function syncPositionsFromAccount(accountId: string): Promise<PositionSyncResult> {
  const result: PositionSyncResult = {
    newPositions: [],
    closedPositions: [],
    updatedPositions: [],
    errors: [],
  };

  try {
    // Получаем аккаунт
    const account = await db.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      result.errors.push(`Account ${accountId} not found`);
      return result;
    }

    // Пропускаем демо аккаунты
    if (account.accountType === "DEMO") {
      return result;
    }

    // Проверяем наличие API ключей
    if (!account.apiKey || !account.apiSecret) {
      result.errors.push(`Account ${accountId} has no API keys`);
      return result;
    }

    // Создаём клиент биржи
    const client = createExchangeClient(account.exchangeId as ExchangeId, {
      credentials: {
        apiKey: account.apiKey,
        apiSecret: account.apiSecret,
        passphrase: account.apiPassphrase || undefined,
        uid: account.apiUid || undefined,
      },
      marketType: account.exchangeType as "spot" | "futures" | "inverse",
      tradingMode: account.isTestnet ? "TESTNET" : "LIVE",
    });

    // Получаем позиции с биржи
    let exchangePositions: ExchangePosition[] = [];
    
    try {
      if (account.exchangeType === "futures") {
        exchangePositions = await client.getFuturesPositions();
      } else if (account.exchangeType === "spot") {
        // Для спота получаем баланс и открытые ордера
        exchangePositions = await client.getSpotPositions();
      }
    } catch (apiError) {
      result.errors.push(`API error for ${account.exchangeId}: ${apiError instanceof Error ? apiError.message : "Unknown error"}`);
      return result;
    }

    // Получаем известные позиции из БД
    const knownPositions = await db.position.findMany({
      where: {
        accountId: account.id,
        status: "OPEN",
      },
    });

    // Фильтруем только позиции с размером > 0
    const activeExchangePositions = exchangePositions.filter(p => Math.abs(p.size) > 0);

    // Находим новые позиции (есть на бирже, нет в БД)
    for (const exPos of activeExchangePositions) {
      const isKnown = knownPositions.some(p => 
        p.symbol === exPos.symbol && 
        p.direction === exPos.direction &&
        (p.exchangePositionId === exPos.positionId || p.source === "PLATFORM")
      );

      if (!isKnown) {
        // Это новая внешняя позиция!
        result.newPositions.push(exPos);

        // Создаём запись в БД со статусом PENDING_CONFIRMATION
        const newPosition = await db.position.create({
          data: {
            accountId: account.id,
            symbol: exPos.symbol,
            direction: exPos.direction,
            totalAmount: Math.abs(exPos.size),
            filledAmount: Math.abs(exPos.size),
            avgEntryPrice: exPos.entryPrice,
            currentPrice: exPos.markPrice || exPos.entryPrice,
            leverage: exPos.leverage,
            unrealizedPnl: exPos.unrealizedPnl,
            source: "EXTERNAL",
            exchangePositionId: exPos.positionId,
            escortEnabled: false,
            escortStatus: "PENDING_CONFIRMATION",
            isDemo: false,
            status: "OPEN",
          },
        });

        // Отправляем уведомление с запросом на сопровождение
        await sendEscortRequest({
          positionId: newPosition.id,
          accountId: account.id,
          symbol: exPos.symbol,
          direction: exPos.direction,
          entryPrice: exPos.entryPrice,
          size: Math.abs(exPos.size),
          leverage: exPos.leverage,
          exchangePositionId: exPos.positionId,
          exchangeName: account.exchangeName || account.exchangeId,
        });
      }
    }

    // Находим закрытые позиции (есть в БД как EXTERNAL, нет на бирже)
    for (const knownPos of knownPositions) {
      if (knownPos.source !== "EXTERNAL") continue;

      const stillExists = activeExchangePositions.some(p => 
        p.symbol === knownPos.symbol && 
        p.direction === knownPos.direction
      );

      if (!stillExists) {
        // Позиция была закрыта на бирже
        await db.position.update({
          where: { id: knownPos.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closeReason: "EXTERNAL_CLOSE",
            escortStatus: knownPos.escortStatus === "ESCORTING" ? "CLOSED_EXTERNALLY" : knownPos.escortStatus,
          },
        });

        result.closedPositions.push(knownPos.id);

        // Уведомление о закрытии
        if (knownPos.escortEnabled) {
          await notifyTelegram({
            type: "POSITION_CLOSED",
            title: "📤 External Position Closed on Exchange",
            message: `${knownPos.symbol} ${knownPos.direction}\nThe position was closed on the exchange`,
            data: { positionId: knownPos.id },
          });
        }
      }
    }

    // Обновляем текущие цены для сопровождаемых позиций
    for (const knownPos of knownPositions) {
      if (knownPos.source !== "EXTERNAL" || !knownPos.escortEnabled) continue;

      const exPos = activeExchangePositions.find(p => 
        p.symbol === knownPos.symbol && 
        p.direction === knownPos.direction
      );

      if (exPos && exPos.markPrice) {
        await db.position.update({
          where: { id: knownPos.id },
          data: {
            currentPrice: exPos.markPrice,
            unrealizedPnl: exPos.unrealizedPnl,
          },
        });

        result.updatedPositions.push(knownPos.id);
      }
    }

    // Обновляем время последней синхронизации
    await db.account.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    });

  } catch (error) {
    result.errors.push(`Sync error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  return result;
}

/**
 * Синхронизировать позиции со всех активных REAL аккаунтов
 */
export async function syncAllAccounts(): Promise<Record<string, PositionSyncResult>> {
  const results: Record<string, PositionSyncResult> = {};

  // Получаем все активные REAL аккаунты с API ключами
  const accounts = await db.account.findMany({
    where: {
      accountType: "REAL",
      isActive: true,
      apiKey: { not: null },
      apiSecret: { not: null },
    },
  });

  for (const account of accounts) {
    const result = await syncPositionsFromAccount(account.id);
    results[account.id] = result;
  }

  return results;
}

// ==================== ESCORT REQUEST ====================

/**
 * Отправить запрос на сопровождение позиции
 */
async function sendEscortRequest(request: EscortRequest): Promise<void> {
  const message = buildEscortRequestMessage(request);

  // Отправляем в Telegram с inline кнопками
  await notifyTelegram({
    type: "ESCORT_REQUEST",
    title: "🔔 New External Position Detected",
    message,
    data: {
      positionId: request.positionId,
      inlineKeyboard: [
        [
          { text: "✅ Yes, Escort", callback_data: `escort_yes_${request.positionId}` },
          { text: "❌ No, Ignore", callback_data: `escort_no_${request.positionId}` },
        ],
        [
          { text: "⚙️ Escort with TP/SL", callback_data: `escort_config_${request.positionId}` },
        ],
      ],
    },
  });

  // Отправляем в UI
  await notifyUI({
    type: "ESCORT_REQUEST",
    title: "🔔 New External Position",
    message,
    data: {
      positionId: request.positionId,
      requiresConfirmation: true,
    },
  });
}

/**
 * Построить сообщение запроса
 */
function buildEscortRequestMessage(request: EscortRequest): string {
  const directionEmoji = request.direction === "LONG" ? "🟢" : "🔴";
  
  return `${directionEmoji} *External Position Detected*\n\n` +
    `📍 *Exchange:* ${request.exchangeName}\n` +
    `💱 *Symbol:* ${request.symbol}\n` +
    `📊 *Direction:* ${request.direction}\n` +
    `💰 *Entry Price:* $${request.entryPrice.toLocaleString()}\n` +
    `📐 *Size:* ${request.size.toFixed(4)}\n` +
    `⚡ *Leverage:* ${request.leverage}x\n\n` +
    `Would you like to escort this position?\n` +
    `(SL, TP, Trailing Stop will be managed)`;
}

// ==================== ESCORT CONFIRMATION ====================

/**
 * Подтвердить сопровождение позиции
 */
export async function confirmEscort(
  positionId: string,
  options?: {
    stopLoss?: number;
    takeProfit?: number;
    trailingStop?: {
      type: "PERCENT" | "FIXED" | "BREAKEVEN";
      value: number;
    };
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const position = await db.position.findUnique({
      where: { id: positionId },
      include: { account: true },
    });

    if (!position) {
      return { success: false, error: "Position not found" };
    }

    if (position.escortStatus !== "PENDING_CONFIRMATION") {
      return { success: false, error: "Position is not pending confirmation" };
    }

    // Обновляем позицию
    const updateData: Record<string, unknown> = {
      escortEnabled: true,
      escortStatus: "ESCORTING",
    };

    if (options?.stopLoss) {
      updateData.stopLoss = options.stopLoss;
    }

    if (options?.takeProfit) {
      updateData.takeProfit = options.takeProfit;
    }

    if (options?.trailingStop) {
      updateData.trailingStop = JSON.stringify({
        type: options.trailingStop.type,
        value: options.trailingStop.value,
        activated: false,
      });
    }

    await db.position.update({
      where: { id: positionId },
      data: updateData,
    });

    // Уведомление о подтверждении
    const directionEmoji = position.direction === "LONG" ? "🟢" : "🔴";
    await notifyTelegram({
      type: "ESCORT_STARTED",
      title: "✅ Position Escort Started",
      message: `${directionEmoji} ${position.symbol} ${position.direction}\n\n` +
        `Position is now being escorted!\n` +
        (options?.stopLoss ? `🛑 Stop Loss: $${options.stopLoss.toLocaleString()}\n` : "") +
        (options?.takeProfit ? `🎯 Take Profit: $${options.takeProfit.toLocaleString()}\n` : "") +
        (options?.trailingStop ? `📍 Trailing: ${options.trailingStop.type} ${options.trailingStop.value}%\n` : ""),
      data: { positionId },
    });

    await notifyUI({
      type: "ESCORT_STARTED",
      title: "✅ Escort Confirmed",
      message: `${position.symbol} ${position.direction} is now being escorted`,
      data: { positionId },
    });

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Отклонить сопровождение позиции
 */
export async function declineEscort(positionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const position = await db.position.findUnique({
      where: { id: positionId },
    });

    if (!position) {
      return { success: false, error: "Position not found" };
    }

    await db.position.update({
      where: { id: positionId },
      data: {
        escortEnabled: false,
        escortStatus: "IGNORED",
      },
    });

    await notifyUI({
      type: "ESCORT_DECLINED",
      title: "❌ Escort Declined",
      message: `${position.symbol} ${position.direction} will be ignored`,
      data: { positionId },
    });

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Обновить параметры сопровождения
 */
export async function updateEscortParams(
  positionId: string,
  params: {
    stopLoss?: number;
    takeProfit?: number;
    trailingStop?: {
      type: "PERCENT" | "FIXED" | "BREAKEVEN";
      value: number;
    };
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const position = await db.position.findUnique({
      where: { id: positionId },
    });

    if (!position) {
      return { success: false, error: "Position not found" };
    }

    if (!position.escortEnabled) {
      return { success: false, error: "Position is not being escorted" };
    }

    const updateData: Record<string, unknown> = {};

    if (params.stopLoss !== undefined) {
      updateData.stopLoss = params.stopLoss;
    }

    if (params.takeProfit !== undefined) {
      updateData.takeProfit = params.takeProfit;
    }

    if (params.trailingStop) {
      updateData.trailingStop = JSON.stringify({
        type: params.trailingStop.type,
        value: params.trailingStop.value,
        activated: position.trailingActivated,
        highestPrice: position.highestPrice,
        lowestPrice: position.lowestPrice,
      });
    }

    await db.position.update({
      where: { id: positionId },
      data: updateData,
    });

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ==================== CLOSE EXTERNAL POSITION ====================

/**
 * Закрыть внешнюю позицию на бирже
 */
export async function closeExternalPosition(
  positionId: string,
  closeReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const position = await db.position.findUnique({
      where: { id: positionId },
      include: { account: true },
    });

    if (!position) {
      return { success: false, error: "Position not found" };
    }

    if (position.source !== "EXTERNAL") {
      return { success: false, error: "Not an external position" };
    }

    // Если есть API ключи, закрываем на бирже
    if (position.account?.apiKey && position.account?.apiSecret) {
      const client = createExchangeClient(position.account.exchangeId as ExchangeId, {
        credentials: {
          apiKey: position.account.apiKey,
          apiSecret: position.account.apiSecret,
          passphrase: position.account.apiPassphrase || undefined,
        },
        marketType: position.account.exchangeType as "spot" | "futures" | "inverse",
        tradingMode: position.account.isTestnet ? "TESTNET" : "LIVE",
      });

      // Закрываем позицию рыночным ордером
      await client.closePosition({
        symbol: position.symbol,
        positionSide: position.direction === "LONG" ? "long" : "short",
        quantity: position.totalAmount,
        market: true,
      });
    }

    // Обновляем статус в БД
    await db.position.update({
      where: { id: positionId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closeReason: closeReason || "MANUAL",
        escortStatus: closeReason === "SL" ? "SL_HIT" : closeReason === "TP" ? "TP_HIT" : "MANUAL_CLOSE",
      },
    });

    // Уведомление
    const directionEmoji = position.direction === "LONG" ? "🟢" : "🔴";
    await notifyTelegram({
      type: "POSITION_CLOSED",
      title: `📤 Position Closed`,
      message: `${directionEmoji} ${position.symbol} ${position.direction}\n` +
        `Reason: ${closeReason || "Manual"}\n` +
        `PnL: ${position.unrealizedPnl >= 0 ? "+" : ""}$${position.unrealizedPnl.toFixed(2)}`,
      data: { positionId },
    });

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// ==================== GET PENDING ESCORT REQUESTS ====================

/**
 * Получить все позиции, ожидающие подтверждения
 */
export async function getPendingEscortRequests(): Promise<{
  id: string;
  symbol: string;
  direction: string;
  avgEntryPrice: number;
  totalAmount: number;
  leverage: number;
  createdAt: Date;
  account: {
    exchangeName: string;
    exchangeType: string;
  };
}[]> {
  const positions = await db.position.findMany({
    where: {
      source: "EXTERNAL",
      escortStatus: "PENDING_CONFIRMATION",
      status: "OPEN",
    },
    include: {
      account: {
        select: {
          exchangeName: true,
          exchangeType: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return positions.map(p => ({
    id: p.id,
    symbol: p.symbol,
    direction: p.direction,
    avgEntryPrice: p.avgEntryPrice,
    totalAmount: p.totalAmount,
    leverage: p.leverage,
    createdAt: p.createdAt,
    account: p.account,
  }));
}

/**
 * Получить все сопровождаемые позиции
 */
export async function getEscortingPositions(): Promise<{
  id: string;
  symbol: string;
  direction: string;
  avgEntryPrice: number;
  currentPrice: number | null;
  totalAmount: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  trailingStop: string | null;
  unrealizedPnl: number | null;
  escortStatus: string | null;
  createdAt: Date;
  account: {
    exchangeName: string;
    exchangeType: string;
  };
}[]> {
  const positions = await db.position.findMany({
    where: {
      source: "EXTERNAL",
      escortEnabled: true,
      escortStatus: "ESCORTING",
      status: "OPEN",
    },
    include: {
      account: {
        select: {
          exchangeName: true,
          exchangeType: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return positions.map(p => ({
    id: p.id,
    symbol: p.symbol,
    direction: p.direction,
    avgEntryPrice: p.avgEntryPrice,
    currentPrice: p.currentPrice,
    totalAmount: p.totalAmount,
    leverage: p.leverage,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    trailingStop: p.trailingStop,
    unrealizedPnl: p.unrealizedPnl,
    escortStatus: p.escortStatus,
    createdAt: p.createdAt,
    account: p.account,
  }));
}
