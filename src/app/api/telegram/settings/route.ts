/**
 * Telegram Settings API Endpoint
 *
 * GET /api/telegram/settings - Get notification settings
 * POST /api/telegram/settings - Update settings or save chat ID
 */

import { NextRequest, NextResponse } from 'next/server';

interface TelegramSettings {
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  notifyOnSL: boolean;
  notifyOnTP: boolean;
  notifyOnSignal: boolean;
  notifyOnExternal: boolean;
}

const DEFAULT_SETTINGS: TelegramSettings = {
  notifyOnEntry: true,
  notifyOnExit: true,
  notifyOnSL: true,
  notifyOnTP: true,
  notifyOnSignal: true,
  notifyOnExternal: true,
};

// In-memory settings cache (in production, use database or Redis)
let cachedSettings: TelegramSettings = { ...DEFAULT_SETTINGS };
let cachedChatId: string = '';

export async function GET() {
  return NextResponse.json({
    success: true,
    settings: cachedSettings,
    chatId: cachedChatId,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle chatId update
    if (body.chatId) {
      cachedChatId = body.chatId;

      return NextResponse.json({
        success: true,
        message: 'Chat ID saved',
        chatId: body.chatId,
      });
    }

    // Handle settings update
    if (body.settings) {
      cachedSettings = { ...DEFAULT_SETTINGS, ...body.settings };

      return NextResponse.json({
        success: true,
        message: 'Settings saved',
        settings: cachedSettings,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'No data provided',
    }, { status: 400 });
  } catch (error) {
    console.error('Failed to save Telegram settings:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to save settings',
    }, { status: 500 });
  }
}
