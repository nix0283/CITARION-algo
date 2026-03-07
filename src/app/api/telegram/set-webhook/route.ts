/**
 * Set Telegram Webhook Endpoint
 * Registers the webhook URL with Telegram Bot API
 * 
 * Endpoint: POST /api/telegram/set-webhook
 * Body: { webhookUrl?: string, secretToken?: string }
 */

import { NextRequest, NextResponse } from "next/server";

interface SetWebhookRequest {
  webhookUrl?: string;
  secretToken?: string;
  dropPendingUpdates?: boolean;
}

interface TelegramResponse {
  ok: boolean;
  result: boolean;
  description?: string;
}

/**
 * Register webhook with Telegram Bot API
 */
export async function POST(request: NextRequest) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      return NextResponse.json(
        { 
          success: false, 
          error: "TELEGRAM_BOT_TOKEN is not configured in environment variables" 
        },
        { status: 500 }
      );
    }
    
    const body: SetWebhookRequest = await request.json().catch(() => ({}));
    
    // Determine webhook URL
    let webhookUrl = body.webhookUrl;
    
    if (!webhookUrl) {
      // Try to construct webhook URL from request headers
      const host = request.headers.get("host");
      const protocol = request.headers.get("x-forwarded-proto") || "https";
      
      if (host) {
        webhookUrl = `${protocol}://${host}/api/telegram/webhook`;
      }
    }
    
    if (!webhookUrl) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Could not determine webhook URL. Please provide it in the request body." 
        },
        { status: 400 }
      );
    }
    
    // Build Telegram API URL
    const apiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    
    // Prepare webhook configuration
    const webhookConfig: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"],
      drop_pending_updates: body.dropPendingUpdates ?? true,
    };
    
    // Add secret token for additional security
    const secretToken = body.secretToken || process.env.TELEGRAM_SECRET_TOKEN;
    if (secretToken) {
      webhookConfig.secret_token = secretToken;
    }
    
    // Register webhook with Telegram
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookConfig),
    });
    
    const data: TelegramResponse = await response.json();
    
    if (!data.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.description || "Failed to set webhook",
          telegramResponse: data,
        },
        { status: 400 }
      );
    }
    
    // Get webhook info to confirm
    const infoUrl = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
    const infoResponse = await fetch(infoUrl);
    const infoData = await infoResponse.json();
    
    return NextResponse.json({
      success: true,
      message: "Webhook registered successfully!",
      webhook: {
        url: webhookUrl,
        hasCustomCertificate: infoData.result?.has_custom_certificate || false,
        pendingUpdateCount: infoData.result?.pending_update_count || 0,
      },
      telegramResponse: data,
      info: infoData.result,
    });
    
  } catch (error) {
    console.error("Set webhook error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

/**
 * Get current webhook status
 */
export async function GET(request: NextRequest) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      return NextResponse.json(
        { 
          success: false, 
          error: "TELEGRAM_BOT_TOKEN is not configured" 
        },
        { status: 500 }
      );
    }
    
    // Get current webhook info
    const apiUrl = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (!data.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.description || "Failed to get webhook info",
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      webhook: {
        url: data.result?.url || "Not set",
        hasCustomCertificate: data.result?.has_custom_certificate || false,
        pendingUpdateCount: data.result?.pending_update_count || 0,
        lastErrorDate: data.result?.last_error_date || null,
        lastErrorMessage: data.result?.last_error_message || null,
        maxConnections: data.result?.max_connections || 40,
        allowedUpdates: data.result?.allowed_updates || [],
      },
    });
    
  } catch (error) {
    console.error("Get webhook info error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

/**
 * Delete webhook (useful during development)
 */
export async function DELETE(request: NextRequest) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      return NextResponse.json(
        { 
          success: false, 
          error: "TELEGRAM_BOT_TOKEN is not configured" 
        },
        { status: 500 }
      );
    }
    
    const apiUrl = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
    
    const body = await request.json().catch(() => ({}));
    
    const params = new URLSearchParams();
    if (body.dropPendingUpdates) {
      params.append("drop_pending_updates", "true");
    }
    
    const response = await fetch(`${apiUrl}?${params.toString()}`, {
      method: "POST",
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.description || "Failed to delete webhook",
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: "Webhook deleted successfully",
    });
    
  } catch (error) {
    console.error("Delete webhook error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
