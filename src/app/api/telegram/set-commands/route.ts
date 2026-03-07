/**
 * Set Telegram Bot Commands
 * Registers bot commands in Telegram for a better user experience
 * Commands will appear in the bot's menu when users type /
 * 
 * Endpoint: POST /api/telegram/set-commands
 */

import { NextRequest, NextResponse } from "next/server";

interface BotCommand {
  command: string;
  description: string;
}

interface TelegramResponse {
  ok: boolean;
  result: boolean;
  description?: string;
}

// Default bot commands for CITARION
const BOT_COMMANDS: BotCommand[] = [
  {
    command: "start",
    description: "🚀 Start the bot and see welcome message",
  },
  {
    command: "help",
    description: "📚 Display help and supported signal formats",
  },
  {
    command: "balance",
    description: "💰 Check account balance",
  },
  {
    command: "positions",
    description: "📊 View open positions",
  },
  {
    command: "status",
    description: "🤖 Bot status and configuration",
  },
  {
    command: "trades",
    description: "📈 Show trade history",
  },
  {
    command: "config",
    description: "⚙️ Bot configuration settings",
  },
  {
    command: "stop",
    description: "⏹️ Stop auto-trading",
  },
  {
    command: "menu",
    description: "📋 Quick menu",
  },
  {
    command: "ping",
    description: "🏓 Check bot responsiveness",
  },
];

/**
 * Set bot commands in Telegram
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
    
    // Parse request body for custom commands
    const body = await request.json().catch(() => ({}));
    const commands: BotCommand[] = body.commands || BOT_COMMANDS;
    
    // Validate commands
    if (!Array.isArray(commands) || commands.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: "No commands provided" 
        },
        { status: 400 }
      );
    }
    
    // Validate each command
    for (const cmd of commands) {
      if (!cmd.command || !cmd.description) {
        return NextResponse.json(
          { 
            success: false, 
            error: "Each command must have 'command' and 'description' fields" 
          },
          { status: 400 }
        );
      }
      
      // Command must be lowercase, start with letter, contain only letters, digits, underscores
      if (!/^[a-z][a-z0-9_]*$/i.test(cmd.command)) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Invalid command name: "${cmd.command}". Must start with a letter and contain only letters, digits, and underscores.` 
          },
          { status: 400 }
        );
      }
      
      // Description must be 3-256 characters
      if (cmd.description.length < 3 || cmd.description.length > 256) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Invalid description for command "${cmd.command}". Must be 3-256 characters.` 
          },
          { status: 400 }
        );
      }
    }
    
    // Build Telegram API URL
    const apiUrl = `https://api.telegram.org/bot${botToken}/setMyCommands`;
    
    // Register commands with Telegram
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commands }),
    });
    
    const data: TelegramResponse = await response.json();
    
    if (!data.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.description || "Failed to set commands",
          telegramResponse: data,
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: "Bot commands registered successfully!",
      commandsCount: commands.length,
      commands: commands,
    });
    
  } catch (error) {
    console.error("Set commands error:", error);
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
 * Get current bot commands
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
    
    // Get current commands from Telegram
    const apiUrl = `https://api.telegram.org/bot${botToken}/getMyCommands`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (!data.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.description || "Failed to get commands",
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      commands: data.result || [],
      defaultMessage: "Default commands that will be set:",
      defaultCommands: BOT_COMMANDS,
    });
    
  } catch (error) {
    console.error("Get commands error:", error);
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
 * Delete all bot commands
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
    
    // Delete all commands by setting empty array
    const apiUrl = `https://api.telegram.org/bot${botToken}/setMyCommands`;
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commands: [] }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.description || "Failed to delete commands",
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: "All bot commands deleted successfully",
    });
    
  } catch (error) {
    console.error("Delete commands error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
