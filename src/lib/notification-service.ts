/**
 * Notification Service
 * 
 * Централизованный сервис уведомлений для:
 * - Telegram Bot
 * - UI WebSocket (real-time)
 * - Push notifications (future)
 * 
 * Все события торгового бота проходят через этот сервис
 */

import { sendMessage } from "@/lib/telegram-bot";

// ==================== TYPES ====================

export type NotificationType =
  | "SIGNAL_RECEIVED"
  | "SIGNAL_PARSED"
  | "ORDER_OPENED"
  | "ORDER_FILLED"
  | "ORDER_PARTIAL"
  | "ORDER_REJECTED"
  | "TP_HIT"
  | "TP_PARTIAL"
  | "SL_HIT"
  | "POSITION_OPENED"
  | "POSITION_CLOSED"
  | "POSITION_UPDATED"
  | "LIQUIDATION_WARNING"
  | "BALANCE_LOW"
  | "SYSTEM_ERROR"
  | "EXTERNAL_POSITION_DETECTED"
  | "EXTERNAL_POSITION_ADOPTED"
  | "EXTERNAL_POSITION_IGNORED"
  | "ESCORT_REQUEST"
  | "ESCORT_STARTED"
  | "ESCORT_DECLINED"
  | "TRACKING_REQUEST";

export interface NotificationEvent {
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: Date;
  priority?: "low" | "normal" | "high" | "critical";
}

export interface NotificationSubscriber {
  id: string;
  callback: (event: NotificationEvent) => void | Promise<void>;
  filter?: (event: NotificationEvent) => boolean;
}

// ==================== SUBSCRIBERS MANAGEMENT ====================

const subscribers: Map<string, NotificationSubscriber> = new Map();
const telegramChatIds: Set<number> = new Set();

/**
 * Подписаться на уведомления
 */
export function subscribeToNotifications(
  id: string,
  callback: (event: NotificationEvent) => void | Promise<void>,
  filter?: (event: NotificationEvent) => boolean
): () => void {
  subscribers.set(id, { id, callback, filter });
  
  // Return unsubscribe function
  return () => {
    subscribers.delete(id);
  };
}

/**
 * Подписать Telegram чат на уведомления
 */
export function subscribeTelegramChat(chatId: number): void {
  telegramChatIds.add(chatId);
}

/**
 * Отписать Telegram чат
 */
export function unsubscribeTelegramChat(chatId: number): void {
  telegramChatIds.delete(chatId);
}

/**
 * Получить подписанные чаты
 */
export function getSubscribedChats(): number[] {
  return Array.from(telegramChatIds);
}

// ==================== NOTIFICATION FUNCTIONS ====================

/**
 * Отправить уведомление в Telegram
 */
export async function notifyTelegram(event: NotificationEvent): Promise<void> {
  if (telegramChatIds.size === 0) {
    // Если нет подписанных чатов, пробуем отправить в default чат
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;
    if (defaultChatId) {
      telegramChatIds.add(parseInt(defaultChatId));
    }
  }
  
  if (telegramChatIds.size === 0) {
    console.log("[NotificationService] No Telegram chats subscribed");
    return;
  }
  
  const emoji = getEventEmoji(event.type);
  const text = `${emoji} *${escapeMarkdown(event.title)}*\n\n${escapeMarkdown(event.message)}`;
  
  const promises = Array.from(telegramChatIds).map(async (chatId) => {
    try {
      await sendMessage(chatId, text, { parse_mode: "Markdown" });
    } catch (error) {
      console.error(`[NotificationService] Failed to send to chat ${chatId}:`, error);
    }
  });
  
  await Promise.allSettled(promises);
}

/**
 * Отправить уведомление в UI (через WebSocket/event emitter)
 */
export async function notifyUI(event: NotificationEvent): Promise<void> {
  // Уведомляем всех подписчиков
  const promises = Array.from(subscribers.values()).map(async (subscriber) => {
    try {
      // Применяем фильтр если есть
      if (subscriber.filter && !subscriber.filter(event)) {
        return;
      }
      
      await subscriber.callback(event);
    } catch (error) {
      console.error(`[NotificationService] Subscriber ${subscriber.id} error:`, error);
    }
  });
  
  await Promise.allSettled(promises);
  
  // Также сохраняем в базу для истории
  await saveNotificationToHistory(event);
}

/**
 * Отправить уведомление везде (Telegram + UI)
 */
export async function notifyAll(event: NotificationEvent): Promise<void> {
  await Promise.all([
    notifyTelegram(event),
    notifyUI(event),
  ]);
}

// ==================== SPECIALIZED NOTIFICATIONS ====================

/**
 * Уведомление о новом сигнале
 */
export async function notifySignalReceived(
  signalId: number,
  symbol: string,
  direction: string,
  source: string,
  isDemo: boolean = true
): Promise<void> {
  const modeLabel = isDemo ? "[DEMO] " : "";
  const directionEmoji = direction === "LONG" ? "🟢" : "🔴";
  
  await notifyAll({
    type: "SIGNAL_RECEIVED",
    title: `${modeLabel}📡 New Signal #${signalId}`,
    message: `${directionEmoji} ${symbol} ${direction}\nSource: ${source}`,
    data: { signalId, symbol, direction, source, isDemo },
    priority: "normal",
  });
}

/**
 * Уведомление об открытии позиции
 */
export async function notifyPositionOpened(
  signalId: number,
  symbol: string,
  direction: string,
  entryPrice: number,
  leverage: number,
  amount: number,
  isDemo: boolean = true
): Promise<void> {
  const modeLabel = isDemo ? "[DEMO] " : "";
  const directionEmoji = direction === "LONG" ? "🟢" : "🔴";
  
  await notifyAll({
    type: "POSITION_OPENED",
    title: `${modeLabel}✅ Position Opened`,
    message: `#${signalId} ${directionEmoji} ${symbol} ${direction}\nEntry: $${entryPrice.toLocaleString()}\nSize: ${amount.toFixed(6)}\nLeverage: ${leverage}x`,
    data: { signalId, symbol, direction, entryPrice, leverage, amount, isDemo },
    priority: "normal",
  });
}

/**
 * Уведомление об исполнении ордера
 */
export async function notifyOrderFilled(
  signalId: number,
  symbol: string,
  direction: string,
  entryPrice: number,
  fillPercentage: number,
  isDemo: boolean = true
): Promise<void> {
  const modeLabel = isDemo ? "[DEMO] " : "";
  const directionEmoji = direction === "LONG" ? "🟢" : "🔴";
  const fillText = fillPercentage >= 100 ? "fully filled" : `filled ${fillPercentage.toFixed(0)}%`;
  
  await notifyAll({
    type: fillPercentage >= 100 ? "ORDER_FILLED" : "ORDER_PARTIAL",
    title: `${modeLabel}📋 Order ${fillText}`,
    message: `#${signalId} ${directionEmoji} ${symbol} ${direction}\nEntry: $${entryPrice.toLocaleString()}\nFill: ${fillPercentage.toFixed(0)}%`,
    data: { signalId, symbol, direction, entryPrice, fillPercentage, isDemo },
    priority: "normal",
  });
}

/**
 * Уведомление о Take Profit
 */
export async function notifyTakeProfit(
  signalId: number,
  symbol: string,
  direction: string,
  tpIndex: number,
  tpPrice: number,
  pnl: number,
  percentage: number,
  isDemo: boolean = true
): Promise<void> {
  const modeLabel = isDemo ? "[DEMO] " : "";
  const directionEmoji = direction === "LONG" ? "🟢" : "🔴";
  const pnlSign = pnl >= 0 ? "+" : "";
  const fullText = percentage >= 100 ? "" : ` (${percentage}%)`;
  
  await notifyAll({
    type: percentage >= 100 ? "TP_HIT" : "TP_PARTIAL",
    title: `${modeLabel}🎯 Take Profit ${tpIndex}${fullText}`,
    message: `#${signalId} ${directionEmoji} ${symbol} ${direction}\nTP${tpIndex}: $${tpPrice.toLocaleString()}\nPnL: ${pnlSign}$${pnl.toFixed(2)}`,
    data: { signalId, symbol, direction, tpIndex, tpPrice, pnl, percentage, isDemo },
    priority: "high",
  });
}

/**
 * Уведомление о Stop Loss
 */
export async function notifyStopLoss(
  signalId: number,
  symbol: string,
  direction: string,
  slPrice: number,
  pnl: number,
  isDemo: boolean = true
): Promise<void> {
  const modeLabel = isDemo ? "[DEMO] " : "";
  const directionEmoji = direction === "LONG" ? "🔴" : "🟢";
  const pnlSign = pnl >= 0 ? "+" : "";
  
  await notifyAll({
    type: "SL_HIT",
    title: `${modeLabel}🛑 Stop Loss Triggered`,
    message: `#${signalId} ${directionEmoji} ${symbol} ${direction}\nSL: $${slPrice.toLocaleString()}\nPnL: ${pnlSign}$${pnl.toFixed(2)}`,
    data: { signalId, symbol, direction, slPrice, pnl, isDemo },
    priority: "high",
  });
}

/**
 * Уведомление о закрытии позиции
 */
export async function notifyPositionClosed(
  signalId: number,
  symbol: string,
  direction: string,
  exitPrice: number,
  pnl: number,
  reason: string,
  isDemo: boolean = true
): Promise<void> {
  const modeLabel = isDemo ? "[DEMO] " : "";
  const pnlSign = pnl >= 0 ? "+" : "";
  const pnlEmoji = pnl >= 0 ? "📈" : "📉";
  
  await notifyAll({
    type: "POSITION_CLOSED",
    title: `${modeLabel}🚪 Position Closed`,
    message: `#${signalId} ${symbol} ${direction}\nExit: $${exitPrice.toLocaleString()}\n${pnlEmoji} PnL: ${pnlSign}$${pnl.toFixed(2)}\nReason: ${reason}`,
    data: { signalId, symbol, direction, exitPrice, pnl, reason, isDemo },
    priority: "normal",
  });
}

/**
 * Уведомление об ошибке
 */
export async function notifyError(
  title: string,
  message: string,
  error?: Error
): Promise<void> {
  await notifyAll({
    type: "SYSTEM_ERROR",
    title: `❌ ${title}`,
    message: error ? `${message}\n\nError: ${error.message}` : message,
    data: { error: error?.message, stack: error?.stack },
    priority: "critical",
  });
}

/**
 * Уведомление об обнаружении внешней позиции
 */
export async function notifyExternalPositionDetected(
  externalPositionId: string,
  symbol: string,
  direction: string,
  exchangeName: string,
  exchangeType: string,
  entryPrice: number,
  amount: number,
  amountUsd: number,
  leverage: number,
  unrealizedPnl?: number,
  options?: {
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
  }
): Promise<{ success: boolean; messageId?: number }> {
  const directionEmoji = direction === "LONG" ? "🟢" : "🔴";
  const marketType = exchangeType === "spot" ? "SPOT" : "FUTURES";
  const pnlText = unrealizedPnl 
    ? `\nPnL: ${unrealizedPnl >= 0 ? "+" : ""}$${unrealizedPnl.toFixed(2)}`
    : "";

  const message = 
    `🔍 *Обнаружена внешняя позиция*\n\n` +
    `${directionEmoji} *${symbol}* ${direction}\n` +
    `Exchange: ${exchangeName} (${marketType})\n` +
    `Entry: $${entryPrice.toLocaleString()}\n` +
    `Amount: ${amount.toFixed(6)} ($${amountUsd.toFixed(2)})\n` +
    `Leverage: ${leverage}x${pnlText}\n\n` +
    `📋 Сопровождать позицию?`;

  // Отправляем в UI
  await notifyUI({
    type: "EXTERNAL_POSITION_DETECTED",
    title: "🔍 External Position Detected",
    message: `${symbol} ${direction} on ${exchangeName}\nEntry: $${entryPrice.toLocaleString()}`,
    data: {
      externalPositionId,
      symbol,
      direction,
      exchangeName,
      requiresAction: true,
    },
    priority: "high",
  });

  // Отправляем в Telegram
  if (telegramChatIds.size === 0) {
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;
    if (defaultChatId) {
      telegramChatIds.add(parseInt(defaultChatId));
    }
  }

  if (telegramChatIds.size === 0) {
    return { success: false };
  }

  const chatIds = Array.from(telegramChatIds);
  let lastMessageId: number | undefined;

  for (const chatId of chatIds) {
    try {
      const apiUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      };

      if (options?.inlineKeyboard) {
        body.reply_markup = { inline_keyboard: options.inlineKeyboard };
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.ok) {
        lastMessageId = data.result.message_id;
      }
    } catch (error) {
      console.error(`[NotificationService] Failed to send to chat:`, error);
    }
  }

  return { success: true, messageId: lastMessageId };
}

/**
 * Уведомление о принятии внешней позиции на сопровождение
 */
export async function notifyExternalPositionAdopted(
  symbol: string,
  direction: string,
  positionId: string,
  stopLoss?: number,
  takeProfit?: number
): Promise<void> {
  const directionEmoji = direction === "LONG" ? "🟢" : "🔴";
  
  let message = `${directionEmoji} *${symbol}* ${direction}\nNow tracking with TP/SL`;
  if (stopLoss) message += `\nSL: $${stopLoss.toLocaleString()}`;
  if (takeProfit) message += `\nTP: $${takeProfit.toLocaleString()}`;

  await notifyAll({
    type: "EXTERNAL_POSITION_ADOPTED",
    title: "✅ Position Adopted",
    message,
    data: { positionId, symbol, direction },
    priority: "normal",
  });
}

/**
 * Уведомление об игнорировании внешней позиции
 */
export async function notifyExternalPositionIgnored(
  symbol: string,
  direction: string
): Promise<void> {
  const directionEmoji = direction === "LONG" ? "🟢" : "🔴";
  
  await notifyAll({
    type: "EXTERNAL_POSITION_IGNORED",
    title: "🚫 Position Ignored",
    message: `${directionEmoji} ${symbol} ${direction}\nNot tracking this position`,
    priority: "low",
  });
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Получить эмодзи для типа события
 */
function getEventEmoji(type: NotificationType): string {
  const emojis: Record<NotificationType, string> = {
    SIGNAL_RECEIVED: "📡",
    SIGNAL_PARSED: "📝",
    ORDER_OPENED: "📋",
    ORDER_FILLED: "✅",
    ORDER_PARTIAL: "🔄",
    ORDER_REJECTED: "❌",
    TP_HIT: "🎯",
    TP_PARTIAL: "🎯",
    SL_HIT: "🛑",
    POSITION_OPENED: "✅",
    POSITION_CLOSED: "🚪",
    POSITION_UPDATED: "🔄",
    LIQUIDATION_WARNING: "⚠️",
    BALANCE_LOW: "💰",
    SYSTEM_ERROR: "❌",
    EXTERNAL_POSITION_DETECTED: "🔍",
    EXTERNAL_POSITION_ADOPTED: "✅",
    EXTERNAL_POSITION_IGNORED: "🚫",
    ESCORT_REQUEST: "🔔",
    ESCORT_STARTED: "✅",
    ESCORT_DECLINED: "❌",
    TRACKING_REQUEST: "📍",
  };
  
  return emojis[type] || "📢";
}

/**
 * Экранировать спецсимволы для Markdown
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()`~>#\+\-=|{}.!]/g, "\\$&");
}

/**
 * Сохранить уведомление в историю
 */
async function saveNotificationToHistory(event: NotificationEvent): Promise<void> {
  try {
    // Логируем в консоль для истории
    console.log(`[Notification] [${event.type}] ${event.title}: ${event.message}`);
    
    // Можно добавить сохранение в БД если нужно
    // await db.notification.create({...})
  } catch (error) {
    console.error("[NotificationService] Failed to save history:", error);
  }
}

// ==================== EXPORTS ====================

export type { NotificationEvent as NotificationEventType };
