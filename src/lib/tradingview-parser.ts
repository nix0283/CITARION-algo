/**
 * TradingView Alert Parser for CITARION
 * Supports multiple alert formats from TradingView
 */

export interface ParsedTradingViewSignal {
  symbol: string;
  action: "BUY" | "SELL" | "CLOSE";
  direction?: "LONG" | "SHORT";
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  takeProfits?: Array<{ price: number; percentage: number }>;
  leverage?: number;
  quantity?: number;
  orderType?: "MARKET" | "LIMIT";
  timeframe?: string;
  strategy?: string;
  raw: string;
  format: "SIMPLE" | "JSON" | "CUSTOM" | "STRATEGY";
  confidence: number; // 0-1 score for parsing confidence
}

export interface ParseResult {
  success: boolean;
  signal?: ParsedTradingViewSignal;
  error?: string;
  warnings?: string[];
}

/**
 * Normalize symbol to standard format (e.g., BTCUSDT)
 */
function normalizeSymbol(symbol: string): string {
  // Remove common suffixes and prefixes
  let normalized = symbol.toUpperCase().trim();
  
  // Add USDT suffix if missing (for crypto pairs)
  const stablecoins = ["USDT", "USDC", "BUSD", "USD"];
  const hasStablecoin = stablecoins.some(sc => normalized.endsWith(sc));
  
  if (!hasStablecoin && !normalized.includes(":")) {
    // Check if it's a known crypto symbol
    const cryptoSymbols = ["BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX", "DOT", "MATIC", "LINK", "UNI", "ATOM", "LTC", "BCH"];
    if (cryptoSymbols.some(s => normalized.startsWith(s))) {
      normalized = normalized + "USDT";
    }
  }
  
  // Handle TradingView format like "BINANCE:BTCUSDT"
  if (normalized.includes(":")) {
    normalized = normalized.split(":")[1] || normalized;
  }
  
  // Handle format like "BTC/USDT"
  normalized = normalized.replace("/", "");
  
  return normalized;
}

/**
 * Parse action string to standard format
 */
function parseAction(action: string): "BUY" | "SELL" | "CLOSE" {
  const normalized = action.toUpperCase().trim();
  
  if (["BUY", "LONG", "ENTER LONG", "ENTERLONG", "GO LONG", "BULL"].includes(normalized)) {
    return "BUY";
  }
  if (["SELL", "SHORT", "ENTER SHORT", "ENTERSHORT", "GO SHORT", "BEAR"].includes(normalized)) {
    return "SELL";
  }
  if (["CLOSE", "EXIT", "CLOSE LONG", "CLOSE SHORT", "EXIT LONG", "EXIT SHORT", "TP", "TAKE PROFIT"].includes(normalized)) {
    return "CLOSE";
  }
  
  return "BUY"; // Default
}

/**
 * Determine direction from action
 */
function getDirection(action: "BUY" | "SELL" | "CLOSE", actionText?: string): "LONG" | "SHORT" | undefined {
  if (action === "BUY") return "LONG";
  if (action === "SELL") return "SHORT";
  
  // For CLOSE, try to determine from context
  if (actionText) {
    const text = actionText.toUpperCase();
    if (text.includes("LONG")) return "LONG";
    if (text.includes("SHORT")) return "SHORT";
  }
  
  return undefined;
}

/**
 * Parse JSON format from TradingView
 */
function parseJsonFormat(data: Record<string, unknown>, raw: string): ParseResult {
  const warnings: string[] = [];
  
  try {
    const symbol = normalizeSymbol(String(data.symbol || data.ticker || data.pair || ""));
    if (!symbol) {
      return { success: false, error: "Missing symbol in JSON payload" };
    }
    
    const actionStr = String(data.action || data.side || data.type || "buy");
    const action = parseAction(actionStr);
    
    const signal: ParsedTradingViewSignal = {
      symbol,
      action,
      direction: getDirection(action, actionStr),
      price: typeof data.price === "number" ? data.price : 
             typeof data.entry === "number" ? data.entry as number : 
             typeof data.entry_price === "number" ? data.entry_price as number : undefined,
      stopLoss: typeof data.stop_loss === "number" ? data.stop_loss as number :
                typeof data.stopLoss === "number" ? data.stopLoss as number :
                typeof data.sl === "number" ? data.sl as number : undefined,
      takeProfit: typeof data.take_profit === "number" ? data.take_profit as number :
                  typeof data.takeProfit === "number" ? data.takeProfit as number :
                  typeof data.tp === "number" ? data.tp as number : undefined,
      leverage: typeof data.leverage === "number" ? data.leverage as number : undefined,
      quantity: typeof data.quantity === "number" ? data.quantity as number :
                typeof data.amount === "number" ? data.amount as number : undefined,
      orderType: typeof data.order_type === "string" ? 
                 (data.order_type as string).toUpperCase() as "MARKET" | "LIMIT" : "MARKET",
      timeframe: typeof data.timeframe === "string" ? data.timeframe : undefined,
      strategy: typeof data.strategy === "string" ? data.strategy : undefined,
      raw,
      format: "JSON",
      confidence: 0.95,
    };
    
    // Parse multiple take profits if present
    if (data.take_profits && Array.isArray(data.take_profits)) {
      signal.takeProfits = (data.take_profits as Array<{ price?: number; percentage?: number }>).map((tp, index, arr) => ({
        price: typeof tp.price === "number" ? tp.price : typeof tp === "number" ? tp as unknown as number : 0,
        percentage: typeof tp.percentage === "number" ? tp.percentage : 
                    Math.round(100 / arr.length), // Equal distribution
      }));
    }
    
    // Warn about missing critical fields
    if (!signal.price && signal.action !== "CLOSE") {
      warnings.push("No entry price specified, will use market price");
    }
    
    return { success: true, signal, warnings };
    
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}` 
    };
  }
}

/**
 * Parse simple TradingView format
 * Example: "{{ticker}} {{strategy.order.action}} @ {{strategy.order.price}}"
 */
function parseSimpleFormat(text: string): ParseResult {
  const warnings: string[] = [];
  
  try {
    // Pattern: SYMBOL ACTION @ PRICE
    const simplePattern = /^([A-Z0-9:\/]+)\s+(BUY|SELL|LONG|SHORT|CLOSE)\s*(?:@?\s*(\d+\.?\d*))?/i;
    const match = text.match(simplePattern);
    
    if (match) {
      const symbol = normalizeSymbol(match[1]);
      const action = parseAction(match[2]);
      const price = match[3] ? parseFloat(match[3]) : undefined;
      
      const signal: ParsedTradingViewSignal = {
        symbol,
        action,
        direction: getDirection(action, match[2]),
        price,
        raw: text,
        format: "SIMPLE",
        confidence: 0.85,
      };
      
      if (!price && action !== "CLOSE") {
        warnings.push("No price specified, will use market price");
      }
      
      return { success: true, signal, warnings };
    }
    
    // Try strategy format: "BTCUSDT strategy.long @ 67000"
    const strategyPattern = /^([A-Z0-9:\/]+)\s+strategy\.(long|short)\s*(?:@?\s*(\d+\.?\d*))?/i;
    const strategyMatch = text.match(strategyPattern);
    
    if (strategyMatch) {
      const symbol = normalizeSymbol(strategyMatch[1]);
      const action = strategyMatch[2].toLowerCase() === "long" ? "BUY" : "SELL";
      const price = strategyMatch[3] ? parseFloat(strategyMatch[3]) : undefined;
      
      return {
        success: true,
        signal: {
          symbol,
          action,
          direction: action === "BUY" ? "LONG" : "SHORT",
          price,
          raw: text,
          format: "STRATEGY",
          confidence: 0.90,
        },
        warnings,
      };
    }
    
    return { success: false, error: "Does not match simple format pattern" };
    
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to parse simple format: ${error instanceof Error ? error.message : "Unknown error"}` 
    };
  }
}

/**
 * Parse custom format
 * Example:
 * BTCUSDT LONG
 * Entry: 67000
 * TP: 68000
 * SL: 66000
 * Leverage: 10x
 */
function parseCustomFormat(text: string): ParseResult {
  const warnings: string[] = [];
  
  try {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l);
    if (lines.length < 2) {
      return { success: false, error: "Custom format requires at least 2 lines" };
    }
    
    // First line: SYMBOL ACTION
    const firstLinePattern = /^([A-Z0-9:\/]+)\s+(LONG|SHORT|BUY|SELL)/i;
    const firstLineMatch = lines[0].match(firstLinePattern);
    
    if (!firstLineMatch) {
      return { success: false, error: "First line must contain symbol and direction" };
    }
    
    const symbol = normalizeSymbol(firstLineMatch[1]);
    const actionText = firstLineMatch[2].toUpperCase();
    const action = parseAction(actionText);
    
    const signal: ParsedTradingViewSignal = {
      symbol,
      action,
      direction: actionText === "SHORT" || actionText === "SELL" ? "SHORT" : "LONG",
      raw: text,
      format: "CUSTOM",
      confidence: 0.90,
    };
    
    // Parse remaining lines for details
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      // Entry price
      if (line.startsWith("entry") || line.startsWith("enter") || line.startsWith("price")) {
        const priceMatch = line.match(/[:\s](\d+\.?\d*)/);
        if (priceMatch) {
          signal.price = parseFloat(priceMatch[1]);
        }
      }
      
      // Stop loss
      if (line.startsWith("sl") || line.startsWith("stop")) {
        const slMatch = line.match(/[:\s](\d+\.?\d*)/);
        if (slMatch) {
          signal.stopLoss = parseFloat(slMatch[1]);
        }
      }
      
      // Take profit (single)
      if (line.startsWith("tp") || line.startsWith("take") || line.startsWith("target")) {
        const tpMatch = line.match(/[:\s](\d+\.?\d*)/);
        if (tpMatch) {
          signal.takeProfit = parseFloat(tpMatch[1]);
        }
      }
      
      // Leverage
      if (line.startsWith("leverage") || line.startsWith("lev") || line.includes("x")) {
        const levMatch = line.match(/[:\s](\d+)\s*x?/i);
        if (levMatch) {
          signal.leverage = parseInt(levMatch[1], 10);
        }
      }
      
      // Quantity
      if (line.startsWith("qty") || line.startsWith("quantity") || line.startsWith("amount")) {
        const qtyMatch = line.match(/[:\s](\d+\.?\d*)/);
        if (qtyMatch) {
          signal.quantity = parseFloat(qtyMatch[1]);
        }
      }
    }
    
    if (!signal.price && signal.action !== "CLOSE") {
      warnings.push("No entry price found, will use market price");
      signal.confidence = 0.75;
    }
    
    return { success: true, signal, warnings };
    
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to parse custom format: ${error instanceof Error ? error.message : "Unknown error"}` 
    };
  }
}

/**
 * Parse multiple take profits from text
 */
function parseMultipleTakeProfits(text: string): Array<{ price: number; percentage: number }> | undefined {
  const tps: Array<{ price: number; percentage: number }> = [];
  
  // Pattern: TP1: 68000, TP2: 69000, TP3: 70000
  const tpPattern = /TP(\d+)\s*[:\s]\s*(\d+\.?\d*)(?:\s*\((\d+)%?\))?/gi;
  let match;
  
  while ((match = tpPattern.exec(text)) !== null) {
    const tpNumber = parseInt(match[1], 10);
    const price = parseFloat(match[2]);
    const percentage = match[3] ? parseInt(match[3], 10) : 0;
    
    if (price > 0) {
      tps.push({ price, percentage });
    }
  }
  
  // If we found TPs but no percentages, distribute equally
  if (tps.length > 0 && tps.every(tp => tp.percentage === 0)) {
    const equalPercent = Math.round(100 / tps.length);
    tps.forEach(tp => tp.percentage = equalPercent);
  }
  
  return tps.length > 0 ? tps : undefined;
}

/**
 * Main parser function - tries all formats
 */
export function parseTradingViewAlert(payload: string): ParseResult {
  if (!payload || typeof payload !== "string") {
    return { success: false, error: "Empty or invalid payload" };
  }
  
  const trimmedPayload = payload.trim();
  const warnings: string[] = [];
  
  // Try JSON format first
  if (trimmedPayload.startsWith("{") && trimmedPayload.endsWith("}")) {
    try {
      const jsonData = JSON.parse(trimmedPayload);
      return parseJsonFormat(jsonData, trimmedPayload);
    } catch {
      warnings.push("Payload looks like JSON but failed to parse");
    }
  }
  
  // Try custom multi-line format
  if (trimmedPayload.includes("\n")) {
    const customResult = parseCustomFormat(trimmedPayload);
    if (customResult.success) {
      // Try to extract multiple TPs from the text
      const multipleTps = parseMultipleTakeProfits(trimmedPayload);
      if (multipleTps && customResult.signal) {
        customResult.signal.takeProfits = multipleTps;
      }
      return customResult;
    }
  }
  
  // Try simple format
  const simpleResult = parseSimpleFormat(trimmedPayload);
  if (simpleResult.success) {
    return simpleResult;
  }
  
  // Try to extract at least symbol and action from any format
  const anySymbolMatch = trimmedPayload.match(/\b([A-Z]{2,5}USDT?)\b/i);
  const anyActionMatch = trimmedPayload.match(/\b(BUY|SELL|LONG|SHORT|CLOSE)\b/i);
  
  if (anySymbolMatch && anyActionMatch) {
    const symbol = normalizeSymbol(anySymbolMatch[1]);
    const action = parseAction(anyActionMatch[1]);
    
    // Try to find price
    const priceMatch = trimmedPayload.match(/@?\s*(\d{4,}\.?\d*)/);
    const slMatch = trimmedPayload.match(/(?:SL|stop)[:\s]*(\d+\.?\d*)/i);
    const tpMatch = trimmedPayload.match(/(?:TP|target|take)[:\s]*(\d+\.?\d*)/i);
    
    return {
      success: true,
      signal: {
        symbol,
        action,
        direction: getDirection(action, anyActionMatch[1]),
        price: priceMatch ? parseFloat(priceMatch[1]) : undefined,
        stopLoss: slMatch ? parseFloat(slMatch[1]) : undefined,
        takeProfit: tpMatch ? parseFloat(tpMatch[1]) : undefined,
        raw: trimmedPayload,
        format: "SIMPLE",
        confidence: 0.60,
      },
      warnings: ["Parsed with low confidence - verify all fields"],
    };
  }
  
  return { 
    success: false, 
    error: "Could not parse TradingView alert. Ensure valid format with symbol and action.",
    warnings
  };
}

/**
 * Validate parsed signal
 */
export function validateSignal(signal: ParsedTradingViewSignal): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!signal.symbol || signal.symbol.length < 3) {
    errors.push("Invalid or missing symbol");
  }
  
  if (!signal.action) {
    errors.push("Missing action (BUY/SELL/CLOSE)");
  }
  
  if (signal.action !== "CLOSE") {
    if (signal.price && signal.price <= 0) {
      errors.push("Entry price must be positive");
    }
    
    if (signal.stopLoss && signal.stopLoss <= 0) {
      errors.push("Stop loss must be positive");
    }
    
    if (signal.takeProfit && signal.takeProfit <= 0) {
      errors.push("Take profit must be positive");
    }
    
    // Validate SL/TP logic for LONG
    if (signal.direction === "LONG" && signal.price) {
      if (signal.stopLoss && signal.stopLoss >= signal.price) {
        errors.push("Stop loss should be below entry price for LONG");
      }
      if (signal.takeProfit && signal.takeProfit <= signal.price) {
        errors.push("Take profit should be above entry price for LONG");
      }
    }
    
    // Validate SL/TP logic for SHORT
    if (signal.direction === "SHORT" && signal.price) {
      if (signal.stopLoss && signal.stopLoss <= signal.price) {
        errors.push("Stop loss should be above entry price for SHORT");
      }
      if (signal.takeProfit && signal.takeProfit >= signal.price) {
        errors.push("Take profit should be below entry price for SHORT");
      }
    }
    
    if (signal.leverage && (signal.leverage < 1 || signal.leverage > 125)) {
      errors.push("Leverage must be between 1 and 125");
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Format signal for display
 */
export function formatSignalSummary(signal: ParsedTradingViewSignal): string {
  const parts: string[] = [];
  
  parts.push(`${signal.symbol} ${signal.direction || signal.action}`);
  
  if (signal.price) {
    parts.push(`@ ${signal.price}`);
  }
  
  if (signal.stopLoss) {
    parts.push(`SL: ${signal.stopLoss}`);
  }
  
  if (signal.takeProfit) {
    parts.push(`TP: ${signal.takeProfit}`);
  }
  
  if (signal.takeProfits && signal.takeProfits.length > 0) {
    const tpStr = signal.takeProfits.map(tp => `${tp.price}(${tp.percentage}%)`).join(", ");
    parts.push(`TPs: [${tpStr}]`);
  }
  
  if (signal.leverage) {
    parts.push(`${signal.leverage}x`);
  }
  
  return parts.join(" | ");
}
