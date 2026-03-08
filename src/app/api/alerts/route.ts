/**
 * Alerts API Route
 *
 * Handles alert history, management, and sending new alerts.
 * Supports filtering, pagination, and alert configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  AlertService,
  alertTradeOpened,
  alertTradeClosed,
  alertPrice,
  alertRisk,
  alertBotStatus,
  type AlertType,
  type AlertCategory,
  type AlertPriority,
} from '@/lib/alert-system';
import { telegramNotifier } from '@/lib/alert-system/telegram-notifier';
import { websocketNotifier } from '@/lib/alert-system/websocket-notifier';

// Register notifiers
AlertService.registerNotifier(telegramNotifier);
AlertService.registerNotifier(websocketNotifier);

// =============================================================================
// GET - Retrieve alerts and settings
// =============================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'stats':
        return await getStats(searchParams);

      case 'settings':
        return await getSettings(searchParams);

      case 'price-alerts':
        return await getPriceAlerts(searchParams);

      default:
        return await getAlertHistory(searchParams);
    }
  } catch (error) {
    console.error('[Alerts API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Get alert statistics
 */
async function getStats(searchParams: URLSearchParams) {
  const since = searchParams.get('since')
    ? new Date(searchParams.get('since')!)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stats = await AlertService.getStats(since);

  return NextResponse.json({
    success: true,
    stats,
    period: {
      since: since.toISOString(),
      until: new Date().toISOString(),
    },
  });
}

/**
 * Get alert settings
 */
async function getSettings(searchParams: URLSearchParams) {
  const userId = searchParams.get('userId');

  const settings = await db.alertSettings.findFirst({
    where: { userId: userId || null },
  });

  if (!settings) {
    // Return default settings
    return NextResponse.json({
      success: true,
      settings: {
        telegramEnabled: false,
        websocketEnabled: true,
        webhookEnabled: false,
        emailEnabled: false,
        rateLimitMaxPerMinute: 10,
        rateLimitMaxPerHour: 50,
        rateLimitMaxPerDay: 200,
        enabled: true,
        logAlerts: true,
      },
    });
  }

  return NextResponse.json({
    success: true,
    settings: {
      id: settings.id,
      telegramEnabled: settings.telegramEnabled,
      telegramConfigured: !!(settings.telegramBotToken && settings.telegramChatId),
      websocketEnabled: settings.websocketEnabled,
      webhookEnabled: settings.webhookEnabled,
      webhookUrl: settings.webhookUrl,
      emailEnabled: settings.emailEnabled,
      rateLimitMaxPerMinute: settings.rateLimitMaxPerMinute,
      rateLimitMaxPerHour: settings.rateLimitMaxPerHour,
      rateLimitMaxPerDay: settings.rateLimitMaxPerDay,
      quietHoursEnabled: settings.quietHoursEnabled,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      enabled: settings.enabled,
      logAlerts: settings.logAlerts,
    },
  });
}

/**
 * Get price alerts
 */
async function getPriceAlerts(searchParams: URLSearchParams) {
  const userId = searchParams.get('userId');
  const status = searchParams.get('status') || 'active';

  const alerts = await db.priceAlert.findMany({
    where: {
      userId: userId || undefined,
      status,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    success: true,
    alerts,
  });
}

/**
 * Get alert history
 */
async function getAlertHistory(searchParams: URLSearchParams) {
  const limit = parseInt(searchParams.get('limit') || '100');
  const type = searchParams.get('type') as AlertType | null;
  const category = searchParams.get('category') as AlertCategory | null;
  const symbol = searchParams.get('symbol');
  const userId = searchParams.get('userId');
  const status = searchParams.get('status');
  const since = searchParams.get('since') ? new Date(searchParams.get('since')!) : undefined;

  // Build where clause
  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (category) where.category = category;
  if (symbol) where.symbol = symbol;
  if (userId) where.userId = userId;
  if (status) where.status = status;
  if (since) where.createdAt = { gte: since };

  const alerts = await db.alertRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // Parse JSON fields
  const parsedAlerts = alerts.map((alert) => ({
    ...alert,
    data: alert.data ? JSON.parse(alert.data) : null,
    channels: JSON.parse(alert.channels),
    sentChannels: JSON.parse(alert.sentChannels),
    failedChannels: JSON.parse(alert.failedChannels),
  }));

  return NextResponse.json({
    success: true,
    alerts: parsedAlerts,
    count: parsedAlerts.length,
  });
}

// =============================================================================
// POST - Create/Send alerts and update settings
// =============================================================================

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const body = await request.json();

    switch (action) {
      case 'send':
        return await sendAlert(body);

      case 'trade-open':
        return await sendTradeOpenAlert(body);

      case 'trade-close':
        return await sendTradeCloseAlert(body);

      case 'price':
        return await sendPriceAlert(body);

      case 'risk':
        return await sendRiskAlert(body);

      case 'bot-status':
        return await sendBotStatusAlert(body);

      case 'price-alert-create':
        return await createPriceAlert(body);

      case 'settings':
        return await updateSettings(body);

      case 'test-telegram':
        return await testTelegram(body);

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Alerts API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Send a custom alert
 */
async function sendAlert(body: {
  type: AlertType;
  title: string;
  message: string;
  priority?: AlertPriority;
  data?: Record<string, unknown>;
  channels?: string[];
  source?: string;
  userId?: string;
}) {
  const category = getCategoryFromType(body.type);

  const result = await AlertService.send({
    type: body.type,
    category,
    title: body.title,
    message: body.message,
    priority: body.priority,
    data: body.data,
    channels: body.channels as ('telegram' | 'websocket' | 'webhook' | 'email')[],
    source: body.source,
    userId: body.userId,
  });

  return NextResponse.json({
    success: result.success,
    alertId: result.alertId,
    sentChannels: result.sentChannels,
    failedChannels: result.failedChannels,
    error: result.error,
  });
}

/**
 * Send trade open alert
 */
async function sendTradeOpenAlert(body: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  leverage?: number;
  source?: string;
  sourceId?: string;
  userId?: string;
}) {
  const result = await alertTradeOpened(body);
  return NextResponse.json({
    success: result.success,
    alertId: result.alertId,
    error: result.error,
  });
}

/**
 * Send trade close alert
 */
async function sendTradeCloseAlert(body: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  reason?: string;
  source?: string;
  sourceId?: string;
  userId?: string;
}) {
  const result = await alertTradeClosed(body);
  return NextResponse.json({
    success: result.success,
    alertId: result.alertId,
    error: result.error,
  });
}

/**
 * Send price alert
 */
async function sendPriceAlert(body: {
  symbol: string;
  type: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'PUMP_DETECTED' | 'DUMP_DETECTED';
  currentPrice: number;
  targetPrice?: number;
  changePercent?: number;
  source?: string;
  userId?: string;
}) {
  const result = await alertPrice(body);
  return NextResponse.json({
    success: result.success,
    alertId: result.alertId,
    error: result.error,
  });
}

/**
 * Send risk alert
 */
async function sendRiskAlert(body: {
  type: 'RISK_WARNING' | 'RISK_CRITICAL';
  message: string;
  drawdown?: number;
  maxDrawdown?: number;
  exposure?: number;
  marginLevel?: number;
  source?: string;
  userId?: string;
}) {
  const result = await alertRisk(body);
  return NextResponse.json({
    success: result.success,
    alertId: result.alertId,
    error: result.error,
  });
}

/**
 * Send bot status alert
 */
async function sendBotStatusAlert(body: {
  botName: string;
  botType: string;
  status: 'BOT_STARTED' | 'BOT_STOPPED' | 'BOT_ERROR';
  error?: string;
  uptime?: number;
  tradesCount?: number;
  sourceId?: string;
  userId?: string;
}) {
  const result = await alertBotStatus(body);
  return NextResponse.json({
    success: result.success,
    alertId: result.alertId,
    error: result.error,
  });
}

/**
 * Create a price alert
 */
async function createPriceAlert(body: {
  userId: string;
  symbol: string;
  exchange?: string;
  type: 'ABOVE' | 'BELOW' | 'CROSS_UP' | 'CROSS_DOWN';
  targetPrice: number;
  channels?: string[];
  message?: string;
  expiresAt?: string;
}) {
  const alert = await db.priceAlert.create({
    data: {
      userId: body.userId,
      symbol: body.symbol,
      exchange: body.exchange || 'binance',
      type: body.type,
      targetPrice: body.targetPrice,
      currentPrice: null,
      status: 'active',
      channels: JSON.stringify(body.channels || ['websocket']),
      message: body.message,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  return NextResponse.json({
    success: true,
    alert,
  });
}

/**
 * Update alert settings
 */
async function updateSettings(body: {
  userId?: string;
  telegramEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  websocketEnabled?: boolean;
  webhookEnabled?: boolean;
  webhookUrl?: string;
  webhookHeaders?: string;
  emailEnabled?: boolean;
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  emailSmtpUser?: string;
  emailSmtpPass?: string;
  emailFromAddress?: string;
  emailToAddresses?: string[];
  rateLimitMaxPerMinute?: number;
  rateLimitMaxPerHour?: number;
  rateLimitMaxPerDay?: number;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  quietHoursTimezone?: string;
  enabled?: boolean;
  logAlerts?: boolean;
}) {
  // Upsert settings
  const settings = await db.alertSettings.upsert({
    where: { userId: body.userId || null },
    create: {
      userId: body.userId || null,
      telegramEnabled: body.telegramEnabled ?? false,
      telegramBotToken: body.telegramBotToken,
      telegramChatId: body.telegramChatId,
      websocketEnabled: body.websocketEnabled ?? true,
      webhookEnabled: body.webhookEnabled ?? false,
      webhookUrl: body.webhookUrl,
      webhookHeaders: body.webhookHeaders,
      emailEnabled: body.emailEnabled ?? false,
      emailSmtpHost: body.emailSmtpHost,
      emailSmtpPort: body.emailSmtpPort,
      emailSmtpUser: body.emailSmtpUser,
      emailSmtpPass: body.emailSmtpPass,
      emailFromAddress: body.emailFromAddress,
      emailToAddresses: body.emailToAddresses
        ? JSON.stringify(body.emailToAddresses)
        : null,
      rateLimitMaxPerMinute: body.rateLimitMaxPerMinute ?? 10,
      rateLimitMaxPerHour: body.rateLimitMaxPerHour ?? 50,
      rateLimitMaxPerDay: body.rateLimitMaxPerDay ?? 200,
      quietHoursEnabled: body.quietHoursEnabled ?? false,
      quietHoursStart: body.quietHoursStart,
      quietHoursEnd: body.quietHoursEnd,
      quietHoursTimezone: body.quietHoursTimezone,
      enabled: body.enabled ?? true,
      logAlerts: body.logAlerts ?? true,
    },
    update: {
      telegramEnabled: body.telegramEnabled,
      telegramBotToken: body.telegramBotToken,
      telegramChatId: body.telegramChatId,
      websocketEnabled: body.websocketEnabled,
      webhookEnabled: body.webhookEnabled,
      webhookUrl: body.webhookUrl,
      webhookHeaders: body.webhookHeaders,
      emailEnabled: body.emailEnabled,
      emailSmtpHost: body.emailSmtpHost,
      emailSmtpPort: body.emailSmtpPort,
      emailSmtpUser: body.emailSmtpUser,
      emailSmtpPass: body.emailSmtpPass,
      emailFromAddress: body.emailFromAddress,
      emailToAddresses: body.emailToAddresses
        ? JSON.stringify(body.emailToAddresses)
        : undefined,
      rateLimitMaxPerMinute: body.rateLimitMaxPerMinute,
      rateLimitMaxPerHour: body.rateLimitMaxPerHour,
      rateLimitMaxPerDay: body.rateLimitMaxPerDay,
      quietHoursEnabled: body.quietHoursEnabled,
      quietHoursStart: body.quietHoursStart,
      quietHoursEnd: body.quietHoursEnd,
      quietHoursTimezone: body.quietHoursTimezone,
      enabled: body.enabled,
      logAlerts: body.logAlerts,
    },
  });

  return NextResponse.json({
    success: true,
    settings: {
      id: settings.id,
      telegramEnabled: settings.telegramEnabled,
      websocketEnabled: settings.websocketEnabled,
      webhookEnabled: settings.webhookEnabled,
      emailEnabled: settings.emailEnabled,
      enabled: settings.enabled,
    },
  });
}

/**
 * Test Telegram connection
 */
async function testTelegram(body: {
  botToken?: string;
  chatId?: string;
  userId?: string;
}) {
  // Configure from body or load from settings
  if (body.botToken && body.chatId) {
    telegramNotifier.configure({
      botToken: body.botToken,
      chatId: body.chatId,
      enabled: true,
      parseMode: 'HTML',
    });
  } else {
    await telegramNotifier.loadConfig(body.userId);
  }

  // Test connection
  const connectionTest = await telegramNotifier.testConnection();
  if (!connectionTest.success) {
    return NextResponse.json({
      success: false,
      error: connectionTest.error,
    });
  }

  // Send test message
  const result = await telegramNotifier.send({
    type: 'SYSTEM',
    category: 'SYSTEM',
    alertId: `test-${Date.now()}`,
    title: '🔔 Test Alert',
    message: 'This is a test message from CITARION Alert System.',
    priority: 'normal',
  });

  return NextResponse.json({
    success: result.success,
    botInfo: connectionTest.botInfo,
    error: result.error,
  });
}

// =============================================================================
// DELETE - Delete alerts and price alerts
// =============================================================================

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'price-alert':
        return await deletePriceAlert(searchParams);

      case 'history':
        return await clearHistory(searchParams);

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Alerts API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Delete a price alert
 */
async function deletePriceAlert(searchParams: URLSearchParams) {
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Alert ID required' },
      { status: 400 }
    );
  }

  await db.priceAlert.delete({
    where: { id },
  });

  return NextResponse.json({
    success: true,
    message: 'Price alert deleted',
  });
}

/**
 * Clear alert history
 */
async function clearHistory(searchParams: URLSearchParams) {
  const userId = searchParams.get('userId');
  const before = searchParams.get('before');

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (before) where.createdAt = { lt: new Date(before) };

  const result = await db.alertRecord.deleteMany({
    where,
  });

  return NextResponse.json({
    success: true,
    deleted: result.count,
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getCategoryFromType(type: AlertType): AlertCategory {
  const typeToCategory: Record<AlertType, AlertCategory> = {
    TRADE_OPEN: 'TRADE',
    TRADE_CLOSE: 'TRADE',
    TRADE_TP: 'TRADE',
    TRADE_SL: 'TRADE',
    PRICE_ABOVE: 'PRICE',
    PRICE_BELOW: 'PRICE',
    RISK_WARNING: 'RISK',
    RISK_CRITICAL: 'RISK',
    BOT_STARTED: 'SYSTEM',
    BOT_STOPPED: 'SYSTEM',
    BOT_ERROR: 'SYSTEM',
    PUMP_DETECTED: 'SIGNAL',
    DUMP_DETECTED: 'SIGNAL',
  };

  return typeToCategory[type] || 'SYSTEM';
}
