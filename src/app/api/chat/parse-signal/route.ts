import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseCornixSignal, formatSignal, type ParsedCornixSignal } from "@/lib/signal-parser";

interface ParseRequest {
  message: string;
  saveToDb?: boolean;
}

interface SignalTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  example: string;
  marketType: "SPOT" | "FUTURES";
}

// Cornix-compatible signal templates
const SIGNAL_TEMPLATES: SignalTemplate[] = [
  {
    id: "futures-long",
    name: "FUTURES LONG",
    description: "Фьючерсный сигнал LONG (по умолчанию)",
    marketType: "FUTURES",
    template: `⚡⚡ #BTC/USDT ⚡⚡
Exchanges: Binance Futures
Signal Type: Regular (Long)
Leverage: Isolated (10X)
Entry: 67000
Take-Profit Targets: 1) 68000 2) 69000 3) 70000
Stop Targets: 1) 66000`,
    example: `⚡⚡ #ETH/USDT ⚡⚡
Exchanges: Binance Futures
Leverage: Isolated (5X)
Entry: 3500
TP1: 3600
TP2: 3700
TP3: 3800
Stop: 3400`
  },
  {
    id: "futures-short",
    name: "FUTURES SHORT",
    description: "Фьючерсный сигнал SHORT",
    marketType: "FUTURES",
    template: `#BTC/USDT
SHORT
Entry: 68000
TP: 67000, 66000, 65000
Stop: 69000
Leverage: Cross x10`,
    example: `#ETH/USDT
SHORT
Entry: 3600
TP1: 3500
TP2: 3400
Stop: 3700
Leverage: 10x`
  },
  {
    id: "spot-basic",
    name: "SPOT (Базовый)",
    description: "SPOT сигнал - содержит слово 'spot'",
    marketType: "SPOT",
    template: `#ETH/USDT SPOT
Exchanges: Binance
Buy: 2500
Take-Profit: 2600, 2700, 2800
Stop: 2400`,
    example: `#SOL/USDT spot
Buy: 150
TP1: 160
TP2: 170
TP3: 180
Stop: 140`
  },
  {
    id: "breakout",
    name: "Breakout Signal",
    description: "Breakout сигнал - вход при пробое уровня",
    marketType: "FUTURES",
    template: `#BTC/USDT
Enter above 68000
TP: 70000, 72000
Stop: 66000
Leverage: Isolated 20x`,
    example: `#SOL/USDT
Enter above 150
TP1: 160
TP2: 170
Stop: 140
Leverage: Cross x15`
  },
  {
    id: "entry-zone",
    name: "Entry Zone",
    description: "Сигнал с зоной входа (диапазон цен)",
    marketType: "FUTURES",
    template: `ETH/USDT
Entry Zone: 2500-2600
TP1: 2700
TP2: 2800
TP3: 2900
Stop: 2400
Leverage: 10x`,
    example: `BTC/USDT
Entry Zone: 66000-67000
TP: 68000, 69000, 70000
Stop: 65000
Leverage: Isolated 15x`
  },
  {
    id: "multi-entry",
    name: "Multi-Entry",
    description: "Несколько точек входа",
    marketType: "FUTURES",
    template: `#BTC/USDT
LONG
Entry Targets:
1) 67000
2) 66500
3) 66000
Take-Profit Targets:
1) 68000
2) 69000
3) 70000
Stop: 65000
Leverage: 10x`,
    example: `#ETH/USDT
LONG
Entry: 3500, 3450, 3400
TP1: 3600
TP2: 3700
TP3: 3800
Stop: 3300
Leverage: Isolated 8x`
  },
  {
    id: "full-cornix",
    name: "Полный Cornix формат",
    description: "Полный формат Cornix со всеми параметрами",
    marketType: "FUTURES",
    template: `⚡⚡ #BTC/USDT ⚡⚡
Exchanges: Binance Futures, Bybit USDT
Signal Type: Regular (Long)
Leverage: Isolated (5X)
Entry Zone: 38766.9 - 38800
Take-Profit Targets: 1) 39000 2) 39500 3) 40000
Stop Targets: 1) 38000
Trailing Configuration:
Entry: Percentage (0.5%)
Take-Profit: Percentage (0.5%)
Stop: Moving Target - Trigger: Target (1)`,
    example: `⚡⚡ #ETH/USDT ⚡⚡
Exchanges: Binance Futures
Signal Type: Regular (Long)
Leverage: Isolated (10X)
Entry: 3500
TP1: 3600
TP2: 3700
TP3: 3800
Stop: 3400`
  },
  {
    id: "spot-multi",
    name: "SPOT Multi-Target",
    description: "SPOT сигнал с несколькими TP",
    marketType: "SPOT",
    template: `#SOL/USDT SPOT
Exchanges: Binance, Bybit
Buy: 100
TP1: 110
TP2: 120
TP3: 130
Stop: 90`,
    example: `#BTC/USDT spot
Buy: 65000
TP1: 66000
TP2: 67000
TP3: 68000
Stop: 64000`
  }
];

// Check if message is a template request
function isTemplateRequest(message: string): { isTemplate: boolean; templateId?: string } {
  const lowerMessage = message.toLowerCase().trim();
  
  // Check for "шаблон" or "template" or "help"
  if (/^(шаблон|template|шаблоны|templates|help|помощь|\/help)$/i.test(lowerMessage)) {
    return { isTemplate: true };
  }
  
  // Check for specific template requests
  if (/^(long|лонг|futures?\s*long)$/i.test(lowerMessage)) {
    return { isTemplate: true, templateId: "futures-long" };
  }
  
  if (/^(short|шорт|futures?\s*short)$/i.test(lowerMessage)) {
    return { isTemplate: true, templateId: "futures-short" };
  }
  
  if (/^(spot|спот)$/i.test(lowerMessage)) {
    return { isTemplate: true, templateId: "spot-basic" };
  }
  
  if (/^(breakout|пробой)$/i.test(lowerMessage)) {
    return { isTemplate: true, templateId: "breakout" };
  }
  
  if (/^(zone|зона|entry\s*zone)$/i.test(lowerMessage)) {
    return { isTemplate: true, templateId: "entry-zone" };
  }
  
  if (/^(multi|мульти|multi\s*entry)$/i.test(lowerMessage)) {
    return { isTemplate: true, templateId: "multi-entry" };
  }
  
  if (/^(full|полный|cornix)$/i.test(lowerMessage)) {
    return { isTemplate: true, templateId: "full-cornix" };
  }
  
  return { isTemplate: false };
}

// Format parsed signal for display
function formatSignalResponse(signal: ParsedCornixSignal, savedSignalId?: string): string {
  const directionEmoji = signal.direction === "LONG" ? "🟢📈" : "🔴📉";
  const marketEmoji = signal.marketType === "SPOT" ? "💱" : "⚡";
  
  let response = `✅ **Сигнал распознан!** (Cornix формат)\n\n`;
  response += `${directionEmoji} **${signal.symbol}** ${signal.direction}\n`;
  response += `${marketEmoji} **Рынок:** ${signal.marketType}\n\n`;
  
  // Entry
  if (signal.entryZone) {
    response += `📍 **Entry Zone:** ${signal.entryZone.min.toLocaleString()} - ${signal.entryZone.max.toLocaleString()}\n`;
  } else if (signal.entryPrices.length > 0) {
    if (signal.entryPrices.length === 1) {
      response += `📍 **Вход:** $${signal.entryPrices[0].toLocaleString()}\n`;
    } else {
      response += `📍 **Входы:** ${signal.entryPrices.map(p => `$${p.toLocaleString()}`).join(", ")}\n`;
    }
  }
  
  // Breakout
  if (signal.isBreakout) {
    response += `⏳ **Breakout:** Вход ${signal.breakoutDirection === "above" ? "выше" : "ниже"} уровня\n`;
  }
  
  // Take Profits
  if (signal.takeProfits.length > 0) {
    response += `\n🎯 **Take Profits:**\n`;
    signal.takeProfits.forEach((tp, index) => {
      response += `  TP${index + 1}: $${tp.price.toLocaleString()} (${tp.percentage}%)\n`;
    });
  }
  
  // Stop Loss
  if (signal.stopLoss) {
    response += `\n🛑 **Stop Loss:** $${signal.stopLoss.toLocaleString()}\n`;
  }
  
  // Leverage
  if (signal.marketType === "FUTURES") {
    response += `\n⚡ **Плечо:** ${signal.leverageType} ${signal.leverage}x\n`;
  }
  
  // Exchanges
  if (signal.exchanges.length > 0) {
    response += `\n🏦 **Биржи:** ${signal.exchanges.join(", ")}\n`;
  }
  
  // Signal Type
  if (signal.signalType === "BREAKOUT") {
    response += `\n📊 **Тип:** Breakout Signal\n`;
  }
  
  // Confidence
  response += `\n📊 **Уверенность:** ${Math.round(signal.confidence * 100)}%\n`;
  
  // Warnings
  if (signal.parseWarnings.length > 0) {
    response += `\n⚠️ **Предупреждения:** ${signal.parseWarnings.join("; ")}\n`;
  }
  
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseRequest = await request.json();
    const { message, saveToDb = false } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const lowerMessage = message.toLowerCase().trim();

    // Check for "close all" command
    if (lowerMessage === "close all" || lowerMessage === "закрыть все" || lowerMessage === "закрыть всё") {
      try {
        const closeResponse = await fetch(new URL("/api/trade/close-all", request.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDemo: true }),
        });
        
        const closeData = await closeResponse.json();
        
        if (closeData.success) {
          let responseMsg = `🚫 **ЗАКРЫТИЕ ВСЕХ ПОЗИЦИЙ**\n\n`;
          responseMsg += `✅ Закрыто позиций: **${closeData.closedCount}**\n`;
          responseMsg += `💰 Общий PnL: **$${closeData.totalPnL?.toFixed(2) || '0.00'}**\n\n`;
          
          if (closeData.positions && closeData.positions.length > 0) {
            responseMsg += `📋 **Детали:**\n`;
            const grouped = closeData.positions.reduce((acc: Record<string, number>, p: { exchange: string; pnl: number }) => {
              acc[p.exchange] = (acc[p.exchange] || 0) + 1;
              return acc;
            }, {});
            
            for (const [exchange, count] of Object.entries(grouped)) {
              responseMsg += `• ${exchange}: ${count} поз.\n`;
            }
          }
          
          return NextResponse.json({
            success: true,
            type: "close-all",
            message: responseMsg,
            closedCount: closeData.closedCount,
            totalPnL: closeData.totalPnL,
          });
        } else {
          return NextResponse.json({
            success: false,
            type: "error",
            message: "❌ Ошибка при закрытии позиций",
          });
        }
      } catch (error) {
        console.error("Close all error:", error);
        return NextResponse.json({
          success: false,
          type: "error",
          message: "❌ Ошибка при закрытии позиций",
        });
      }
    }

    // Check for "close <symbol> [direction]" command (e.g., "close btcusdt short", "close ethusdt")
    const closeMatch = lowerMessage.match(/^close\s+([a-z]+)(?:\s+(long|short|лонг|шорт))?$/i);
    if (closeMatch) {
      try {
        const symbol = closeMatch[1].toUpperCase().replace(/[\/\-]/, "");
        const direction = closeMatch[2]?.toLowerCase();
        
        // Get all positions
        const positionsResponse = await fetch(new URL("/api/trade/open?demo=true", request.url));
        const positionsData = await positionsResponse.json();
        
        if (!positionsData.success) {
          return NextResponse.json({
            success: false,
            type: "error",
            message: "❌ Не удалось получить список позиций",
          });
        }
        
        // Filter positions by symbol (and direction if specified)
        const matchingPositions = positionsData.positions.filter((p: { 
          symbol: string; 
          direction: string; 
          id: string;
          account: { exchangeId: string };
        }) => {
          const symbolMatch = p.symbol.toUpperCase() === symbol || 
                              p.symbol.toUpperCase() === symbol + "USDT" ||
                              p.symbol.toUpperCase().startsWith(symbol);
          if (!symbolMatch) return false;
          if (direction) {
            const dirMatch = direction === "long" || direction === "лонг" ? "LONG" : "SHORT";
            return p.direction === dirMatch;
          }
          return true;
        });
        
        if (matchingPositions.length === 0) {
          return NextResponse.json({
            success: false,
            type: "error",
            message: `❌ Позиции не найдены: ${symbol}${direction ? ` ${direction}` : ""}`,
          });
        }
        
        // Close each matching position
        let totalPnL = 0;
        const closedPositions: { symbol: string; direction: string; exchange: string; pnl: number }[] = [];
        
        for (const pos of matchingPositions) {
          const closeResponse = await fetch(new URL("/api/trade/close", request.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ positionId: pos.id }),
          });
          
          const closeResult = await closeResponse.json();
          if (closeResult.success) {
            totalPnL += closeResult.pnl?.value || 0;
            closedPositions.push({
              symbol: pos.symbol,
              direction: pos.direction,
              exchange: pos.account?.exchangeId || "unknown",
              pnl: closeResult.pnl?.value || 0,
            });
          }
        }
        
        let responseMsg = `🚫 **ЗАКРЫТИЕ ПОЗИЦИИ**\n\n`;
        responseMsg += `✅ Закрыто: **${closedPositions.length}** поз.\n`;
        responseMsg += `💰 PnL: **$${totalPnL.toFixed(2)}**\n\n`;
        responseMsg += `📋 **Детали:**\n`;
        
        for (const p of closedPositions) {
          const pnlEmoji = p.pnl >= 0 ? "🟢" : "🔴";
          responseMsg += `• ${p.symbol} ${p.direction} (${p.exchange}): ${pnlEmoji} $${p.pnl.toFixed(2)}\n`;
        }
        
        return NextResponse.json({
          success: true,
          type: "close-position",
          message: responseMsg,
          closedCount: closedPositions.length,
          totalPnL,
          positions: closedPositions,
        });
      } catch (error) {
        console.error("Close position error:", error);
        return NextResponse.json({
          success: false,
          type: "error",
          message: "❌ Ошибка при закрытии позиции",
        });
      }
    }

    // Check for "delete signals" command
    if (lowerMessage === "delete signals" || lowerMessage === "удалить сигналы" || lowerMessage === "удалить все сигналы" || lowerMessage === "delete all signals") {
      try {
        const result = await db.signal.deleteMany({});
        
        return NextResponse.json({
          success: true,
          type: "delete-signals",
          message: `🗑️ **УДАЛЕНИЕ СИГНАЛОВ**\n\n✅ Удалено сигналов: **${result.count}**\n\nБаза сигналов очищена.`,
          deletedCount: result.count,
        });
      } catch (error) {
        console.error("Delete signals error:", error);
        return NextResponse.json({
          success: false,
          type: "error",
          message: "❌ Ошибка при удалении сигналов",
        });
      }
    }

    // Check for "clear database" command
    if (lowerMessage === "clear database" || lowerMessage === "очистить базу" || lowerMessage === "очистить всё" || lowerMessage === "clear all data" || lowerMessage === "сброс") {
      try {
        // Close all open positions first
        const openPositions = await db.position.findMany({
          where: { status: "OPEN" },
        });
        
        // Delete in correct order (respecting foreign keys)
        const tradesResult = await db.trade.deleteMany({});
        const positionsResult = await db.position.deleteMany({});
        const signalsResult = await db.signal.deleteMany({});
        const logsResult = await db.systemLog.deleteMany({});
        
        // Reset demo account balances
        const accounts = await db.account.findMany({
          where: { accountType: "DEMO" },
        });
        
        for (const account of accounts) {
          await db.account.update({
            where: { id: account.id },
            data: { virtualBalance: JSON.stringify({ USDT: 10000 }) },
          });
        }
        
        const totalDeleted = tradesResult.count + positionsResult.count + signalsResult.count + logsResult.count;
        
        return NextResponse.json({
          success: true,
          type: "clear-database",
          message: `🧹 **ОЧИСТКА БАЗЫ ДАННЫХ**\n\n` +
            `✅ База данных полностью очищена!\n\n` +
            `📊 **Удалено:**\n` +
            `• Трейдов: **${tradesResult.count}**\n` +
            `• Позиций: **${positionsResult.count}**\n` +
            `• Сигналов: **${signalsResult.count}**\n` +
            `• Логов: **${logsResult.count}**\n\n` +
            `💰 Балансы демо-аккаунтов сброшены до **$10,000**`,
          deleted: {
            trades: tradesResult.count,
            positions: positionsResult.count,
            signals: signalsResult.count,
            logs: logsResult.count,
            total: totalDeleted,
          },
        });
      } catch (error) {
        console.error("Clear database error:", error);
        return NextResponse.json({
          success: false,
          type: "error",
          message: "❌ Ошибка при очистке базы данных",
        });
      }
    }

    // Check for help command
    if (lowerMessage === "help" || lowerMessage === "помощь" || lowerMessage === "справка" || lowerMessage === "команды" || lowerMessage === "commands") {
      const helpMessage = `📖 **СПРАВОЧНИК КОМАНД ЧАТ-БОТА**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 **СТАТУС И ИНФОРМАЦИЯ**

\`позиции\` или \`positions\` или \`статус\`
   → Показать все открытые позиции

\`шаблон\` или \`шаблоны\` или \`template\`
   → Показать шаблоны сигналов

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 **ТОРГОВЛЯ (СИГНАЛЫ)**

\`#BTC/USDT LONG Entry: 67000 TP: 68000 SL: 66000 Leverage: 10x\`
   → Открыть позицию LONG

\`#ETH/USDT SHORT Entry: 3500 TP: 3000 SL: 4000 Leverage: 50x cross\`
   → Открыть позицию SHORT

**Формат сигнала:**
• Пара: BTCUSDT или BTC/USDT
• Направление: LONG/SHORT (или лонг/шорт)
• Entry: цена входа (можно несколько)
• TP: тейк-профит (можно несколько)
• SL или Stop: стоп-лосс
• Leverage: плечо (1-1001x)
• Cross/Isolated: тип маржи

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚫 **ЗАКРЫТИЕ ПОЗИЦИЙ**

\`close all\` или \`закрыть все\`
   → Закрыть ВСЕ открытые позиции

\`close btcusdt\` или \`закрыть btcusdt\`
   → Закрыть все позиции по BTCUSDT

\`close btcusdt short\` или \`закрыть btcusdt short\`
   → Закрыть только SHORT позиции по BTCUSDT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🗑️ **УПРАВЛЕНИЕ ДАННЫМИ**

\`удалить сигналы\` или \`delete signals\`
   → Удалить все сохранённые сигналы

\`очистить базу\` или \`сброс\` или \`clear database\`
   → ⚠️ Полный сброс: удалить все позиции, трейды, сигналы, логи
   → Балансы сбрасываются до $10,000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ **БЫСТРЫЕ ШАБЛОНЫ**

\`long\` → шаблон LONG сигнала
\`short\` → шаблон SHORT сигнала
\`spot\` → шаблон SPOT сигнала
\`breakout\` → шаблон пробойного сигнала

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏦 **ПОДДЕРЖИВАЕМЫЕ БИРЖИ**

• Binance (Testnet ✓)
• Bybit (Testnet ✓)
• OKX (Demo ✓)
• Bitget (Demo ✓)
• KuCoin (Testnet ✓)
• BingX (Demo ✓)
• HTX/Huobi (Testnet ✓)
• HyperLiquid (Testnet ✓)
• BitMEX (Testnet ✓)
• BloFin (Demo ✓)
• Coinbase (Testnet ✓)
• **Aster DEX** (Testnet ✓, Demo ✓, до 1001x)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 **ПРИМЕРЫ СИГНАЛОВ**

\`btcusdt short leverage 200x cross tp 30000 stop 75000 entry 68250\`

\`#ETH/USDT LONG Entry Zone: 1800-1850 TP: 2200 TP: 2400 SL: 1700 Leverage: 25x\`

\`SOL spot buy 150 target 180 stop 130\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **Важно:**
• Выберите биржу перед отправкой сигнала
• Демо-торговля использует виртуальный баланс
• Плечо на Aster DEX до 1001x`;

      return NextResponse.json({
        success: true,
        type: "help",
        message: helpMessage,
      });
    }

    // Check for positions count command
    if (lowerMessage === "positions" || lowerMessage === "позиции" || lowerMessage === "статус") {
      try {
        const positionsResponse = await fetch(new URL("/api/trade/open?demo=true", request.url));
        const positionsData = await positionsResponse.json();
        
        if (positionsData.success) {
          let responseMsg = `📊 **СТАТУС ПОЗИЦИЙ**\n\n`;
          responseMsg += `Всего открытых: **${positionsData.count}**\n\n`;
          
          if (positionsData.positions && positionsData.positions.length > 0) {
            // Group by exchange
            type ExchangeGroup = { count: number; symbols: Set<string> };
            const byExchange = positionsData.positions.reduce((acc: Record<string, ExchangeGroup>, p: { account: { exchangeName: string }; symbol: string }) => {
              if (!acc[p.account.exchangeName]) {
                acc[p.account.exchangeName] = { count: 0, symbols: new Set() };
              }
              acc[p.account.exchangeName].count++;
              acc[p.account.exchangeName].symbols.add(p.symbol);
              return acc;
            }, {});
            
            responseMsg += `🏦 **По биржам:**\n`;
            for (const [exchange, data] of Object.entries(byExchange) as [string, ExchangeGroup][]) {
              responseMsg += `• ${exchange}: ${data.count} поз. (${[...data.symbols].join(", ")})\n`;
            }
          }
          
          return NextResponse.json({
            success: true,
            type: "status",
            message: responseMsg,
            count: positionsData.count,
          });
        }
      } catch (error) {
        console.error("Status check error:", error);
      }
    }

    // Check if this is a template request
    const templateCheck = isTemplateRequest(message);
    
    if (templateCheck.isTemplate) {
      if (templateCheck.templateId) {
        // Return specific template
        const template = SIGNAL_TEMPLATES.find(t => t.id === templateCheck.templateId);
        if (template) {
          const marketBadge = template.marketType === "SPOT" ? "💱 SPOT" : "⚡ FUTURES";
          return NextResponse.json({
            success: true,
            type: "template",
            message: `📋 **${template.name}** ${marketBadge}\n\n${template.description}\n\n📝 **Шаблон:**\n\`\`\`\n${template.template}\n\`\`\`\n\n✅ **Пример:**\n\`\`\`\n${template.example}\n\`\`\`\n\n💡 **Ключевое правило:**\n• Сигналы со словом "spot" → SPOT\n• Сигналы без "spot" → FUTURES`,
            template: template,
          });
        }
      }
      
      // Return all templates list grouped by market type
      const futuresTemplates = SIGNAL_TEMPLATES
        .filter(t => t.marketType === "FUTURES")
        .map(t => `• **${t.name}** - ${t.description}\n  Команда: \`${t.id}\``)
        .join("\n\n");
      
      const spotTemplates = SIGNAL_TEMPLATES
        .filter(t => t.marketType === "SPOT")
        .map(t => `• **${t.name}** - ${t.description}\n  Команда: \`${t.id}\``)
        .join("\n\n");
      
      return NextResponse.json({
        success: true,
        type: "templates-list",
        message: `📚 **Шаблоны сигналов (Cornix формат)**\n\n` +
          `⚡ **FUTURES сигналы:**\n${futuresTemplates}\n\n` +
          `💱 **SPOT сигналы:**\n${spotTemplates}\n\n` +
          `💡 **Ключевое правило:**\n` +
          `• Слово "spot" в тексте → SPOT рынок\n` +
          `• Без "spot" → FUTURES рынок (по умолчанию)\n\n` +
          `Введите команду (например, \`long\`, \`short\`, \`spot\`) для получения шаблона.`,
        templates: SIGNAL_TEMPLATES.map(t => ({ 
          id: t.id, 
          name: t.name, 
          description: t.description,
          marketType: t.marketType 
        })),
      });
    }

    // Parse using unified Cornix parser
    const signal = parseCornixSignal(message);

    if (signal) {
      // Save signal to database if requested
      let savedSignalId: string | null = null;
      if (saveToDb) {
        try {
          // Get or create signal counter and increment
          const counter = await db.signalIdCounter.upsert({
            where: { id: "signal_counter" },
            update: { lastId: { increment: 1 } },
            create: { id: "signal_counter", lastId: 1 },
          });
          
          const savedSignal = await db.signal.create({
            data: {
              signalId: counter.lastId,
              source: "MANUAL",
              sourceMessage: message,
              symbol: signal.symbol,
              direction: signal.direction,
              action: signal.action,
              entryPrices: JSON.stringify(signal.entryPrices),
              takeProfits: JSON.stringify(signal.takeProfits),
              stopLoss: signal.stopLoss,
              leverage: signal.leverage,
              status: "PENDING",
            }
          });
          savedSignalId = savedSignal.id;
        } catch (error) {
          console.error("Failed to save signal to DB:", error);
        }
      }

      const responseMessage = formatSignalResponse(signal, savedSignalId || undefined);

      return NextResponse.json({
        success: true,
        type: "signal",
        message: responseMessage,
        signal: {
          symbol: signal.symbol,
          baseAsset: signal.baseAsset,
          quoteAsset: signal.quoteAsset,
          direction: signal.direction,
          marketType: signal.marketType,
          action: signal.action,
          entryPrices: signal.entryPrices,
          entryZone: signal.entryZone,
          stopLoss: signal.stopLoss,
          takeProfits: signal.takeProfits,
          leverage: signal.leverage,
          leverageType: signal.leverageType,
          signalType: signal.signalType,
          exchanges: signal.exchanges,
          confidence: signal.confidence,
          warnings: signal.parseWarnings,
        },
        formatted: formatSignal(signal),
        signalId: savedSignalId,
      });
    }

    // If parsing failed, return a helpful message
    return NextResponse.json({
      success: false,
      type: "error",
      message: "❌ Не удалось распознать сигнал.\n\n" +
        "📝 Введите **\"шаблон\"** для списка шаблонов сигналов.\n" +
        "Команды: **long**, **short**, **spot**, **breakout**, **zone**\n\n" +
        "⚠️ **Важно:** Сигнал должен содержать пару монет (BTC/USDT, ETHUSDT)\n\n" +
        "Пример (FUTURES):\n" +
        "`BTC/USDT LONG Entry: 67000 TP: 68000 Stop: 66000`\n\n" +
        "Пример (SPOT):\n" +
        "`ETH/USDT SPOT Buy: 2500 TP: 2600 Stop: 2400`",
      hint: "Убедитесь, что сигнал содержит пару монет и ключевые слова Entry/Buy",
      signal: null,
    });
  } catch (error) {
    console.error("Parse signal error:", error);
    return NextResponse.json(
      { 
        success: false,
        type: "error",
        error: "Failed to parse signal",
        message: "❌ Внутренняя ошибка сервера. Попробуйте позже." 
      },
      { status: 500 }
    );
  }
}

// GET - API info and documentation
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Signal Parser API - Cornix Compatible",
    documentation: "/docs/CORNIX_SIGNAL_FORMAT.md",
    
    keyRule: {
      spot: "Signals with 'spot' word → SPOT market",
      futures: "Signals without 'spot' → FUTURES market (default)",
    },
    
    usage: {
      method: "POST",
      body: { message: "signal text", saveToDb: false },
    },
    
    templates: SIGNAL_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      marketType: t.marketType,
    })),
    
    exampleRequests: {
      futuresLong: {
        message: "#BTC/USDT\nLONG\nEntry: 67000\nTP: 68000\nStop: 66000\nLeverage: 10x"
      },
      spotBuy: {
        message: "#ETH/USDT SPOT\nBuy: 2500\nTP: 2600\nStop: 2400"
      },
      getTemplates: {
        message: "шаблон"
      }
    }
  });
}
