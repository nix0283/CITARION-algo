/**
 * Cornix-Compatible Signal Parser
 * 
 * Based on Cornix documentation: https://help.cornix.io/en/articles/5814956-signal-posting
 * 
 * Signal Format Rules:
 * 1. Keywords can be in ANY order in the text
 * 2. Supports both English and Russian keywords
 * 3. Pair formats: BTCUSDT, BTC/USDT, BTC USDT, BTC (defaults to USDT)
 * 4. SPOT signals contain "spot" or "спот", otherwise FUTURES
 * 
 * Signal Management:
 * - Include direction (long/short) to avoid conflicts when both directions exist
 * - "enter/вход" command for immediate market entry
 */

// ==================== TYPES ====================

export interface ParsedSignal {
  id?: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  direction: "LONG" | "SHORT";
  action: "BUY" | "SELL" | "CLOSE" | "UPDATE_TP" | "UPDATE_SL" | "MARKET_ENTRY";
  marketType: "SPOT" | "FUTURES";
  entryPrices: number[];
  entryZone?: { min: number; max: number };
  stopLoss?: number;
  takeProfits: { price: number; percentage: number }[];
  leverage: number;
  leverageType: "ISOLATED" | "CROSS";
  signalType: "REGULAR" | "BREAKOUT";
  trailingConfig?: TrailingConfig;
  amountPerTrade?: number;
  riskPercentage?: number;
  exchanges: string[];
  confidence: number;
  rawText: string;
  isMarketEntry?: boolean;
  // For update commands
  updateTpIndex?: number;
  updateTpPrice?: number;
}

export interface TrailingConfig {
  entry?: { type: "percentage" | "price"; value: number };
  takeProfit?: { type: "percentage" | "price"; value: number };
  stop?: {
    type: "moving_target" | "breakeven";
    trigger?: { type: "target" | "percent"; value: number };
  };
}

export interface SignalManagementCommand {
  type: "RESET_ID" | "CLEAR_BASE" | "UPDATE_TP" | "UPDATE_SL" | "CLOSE_SIGNAL" | "MARKET_ENTRY" | "PARSE_SIGNAL";
  symbol?: string;
  direction?: "LONG" | "SHORT";
  marketType?: "SPOT" | "FUTURES";
  tpIndex?: number;
  tpPrice?: number;
  slPrice?: number;
  signal?: ParsedSignal;
}

// ==================== KEYWORDS (English + Russian) ====================

const KEYWORDS = {
  // Direction
  LONG: ["long", "лонг", "buy", "покупка", "покупать", "buying", "longs"],
  SHORT: ["short", "шорт", "sell", "продажа", "продавать", "selling", "shorts"],
  
  // Market type
  SPOT: ["spot", "спот", "спотовая", "спотовый", "спотовое"],
  FUTURES: ["futures", "фьючерс", "perpetual", "перп", "фьючерсы"],
  
  // Entry
  ENTRY: ["entry", "enter", "buy", "вход", "ent", "entrs", "войти"],
  ENTRY_ZONE: ["entry zone", "buy zone", "зона входа", "зона покупки"],
  
  // Range/Zone keywords for entry
  RANGE: ["range", "диапазон", "zone", "зона"],
  
  // Take Profit
  TAKE_PROFIT: ["take profit", "takeprofit", "take-profit", "tp", "target", "sell", 
                "тейк", "тейк профит", "цель", "таргет", "тп"],
  
  // Stop Loss
  STOP_LOSS: ["stop loss", "stoploss", "stop-loss", "stop", "sl", "стоп", "стоп лосс", "сл"],
  
  // Leverage
  LEVERAGE: ["leverage", "lev", "левередж", "плечо", "лев", "lever"],
  ISOLATED: ["isolated", "изолированная", "изолированный", "изол", "isol"],
  CROSS: ["cross", "кросс", "перекрестная", "крос"],
  
  // Signal Type
  BREAKOUT: ["breakout", "пробой", "above", "ниже", "below", "выше"],
  REGULAR: ["regular", "обычный", "обычная"],
  
  // Actions
  CLOSE: ["close", "закрыть", "exit", "выход", "cancel", "отмена"],
  
  // Management commands
  RESET_ID: ["id reset", "сброс id", "reset id", "сбросить id"],
  CLEAR_BASE: ["clear base", "очистить базу", "clear database", "очистить базу данных"],
  
  // Market entry
  MARKET_ENTRY: ["enter", "вход", "market", "рынок", "по рынку"],
  
  // Exchanges
  EXCHANGES: ["exchanges:", "exchange:", "биржи:", "биржа:"],
} as const;

// ==================== HELPER FUNCTIONS ====================

/**
 * Normalize text - lowercase and remove extra spaces
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if text contains any of the keywords
 */
function containsKeyword(text: string, keywords: readonly string[]): boolean {
  const normalized = normalizeText(text);
  return keywords.some(kw => {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(text);
  });
}

/**
 * Extract all numbers from text
 */
function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  const regex = /\b(\d+(?:[.,]\d+)?)\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const num = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(num) && num > 0) {
      numbers.push(num);
    }
  }
  return numbers;
}

// ==================== COIN PAIR PARSING ====================

/**
 * Parse coin pair from various formats
 * Supports: BTCUSDT, BTC/USDT, BTC USDT, BTC (defaults to USDT)
 */
export function parseCoinPair(text: string): { symbol: string; baseAsset: string; quoteAsset: string } | null {
  const cleanText = text.replace(/[\r\n]+/g, " ");
  
  // Known quote assets
  const quoteAssets = ["USDT", "USD", "BUSD", "USDC", "BTC", "ETH", "BNB"];
  
  // Pattern 1: BTC/USDT or BTC-USDT or BTC_USDT
  const separatedMatch = cleanText.match(/#?([A-Z]{2,10})\s*[\/\-_]\s*([A-Z]{2,10})/i);
  if (separatedMatch) {
    const base = separatedMatch[1].toUpperCase();
    const quote = separatedMatch[2].toUpperCase();
    return { symbol: `${base}${quote}`, baseAsset: base, quoteAsset: quote };
  }
  
  // Pattern 2: BTC USDT (separated by space)
  // IMPORTANT: Exclude direction/market keywords (short, long, spot, etc.)
  const directionKeywords = ["long", "short", "lonг", "шорт", "spot", "спот", "buy", "sell", "futures"];
  const spaceMatch = cleanText.match(/#?([A-Z]{2,10})\s+([A-Z]{2,10})(?:\s|$)/i);
  if (spaceMatch) {
    const base = spaceMatch[1].toUpperCase();
    const quote = spaceMatch[2].toUpperCase();
    // Skip if second part is a direction/market keyword
    if (!directionKeywords.includes(quote.toLowerCase())) {
      // Verify second part is a quote asset
      if (quoteAssets.includes(quote) || quote.length >= 3) {
        return { symbol: `${base}${quote}`, baseAsset: base, quoteAsset: quote };
      }
    }
  }
  
  // Pattern 3: BTCUSDT (combined)
  const combinedMatch = cleanText.match(/\b([A-Z]{3,10})(USDT|USD|BUSD|USDC)\b/i);
  if (combinedMatch) {
    const base = combinedMatch[1].toUpperCase();
    const quote = combinedMatch[2].toUpperCase();
    return { symbol: `${base}${quote}`, baseAsset: base, quoteAsset: quote };
  }
  
  // Pattern 3.5: BTCUSDT followed by direction (e.g., "btcusdt short leverage...")
  // This handles when the full symbol is followed by direction keyword
  const symbolWithDirection = cleanText.match(/\b([A-Z]{2,10}(?:USDT|USD|BUSD|USDC))\s+(?:long|short|лонг|шорт|buy|sell)/i);
  if (symbolWithDirection) {
    const fullSymbol = symbolWithDirection[1].toUpperCase();
    // Extract base from the symbol
    const quoteMatch = fullSymbol.match(/([A-Z]+)(USDT|USD|BUSD|USDC)$/);
    if (quoteMatch) {
      const base = quoteMatch[1];
      const quote = quoteMatch[2];
      return { symbol: fullSymbol, baseAsset: base, quoteAsset: quote };
    }
  }
  
  // Pattern 4: Just BTC (defaults to USDT)
  const singleMatch = cleanText.match(/(?:^|\s)#?([A-Z]{2,10})(?:\s|$)(?!.*(?:long|short|лонг|шорт|buy|sell))/i);
  if (singleMatch) {
    const base = singleMatch[1].toUpperCase();
    // Check it's not a keyword
    const keywordList = ["long", "short", "spot", "entry", "stop", "tp", "sl", "buy", "sell"];
    if (!keywordList.includes(base.toLowerCase())) {
      return { symbol: `${base}USDT`, baseAsset: base, quoteAsset: "USDT" };
    }
  }
  
  // Pattern 5: Any 2-5 letter token followed by numbers (like SOL at 22)
  const tokenMatch = cleanText.match(/(?:^|\s)([A-Z]{2,5})(?:\s+(?:long|short|лонг|шорт|buy|sell))/i);
  if (tokenMatch) {
    const base = tokenMatch[1].toUpperCase();
    return { symbol: `${base}USDT`, baseAsset: base, quoteAsset: "USDT" };
  }
  
  return null;
}

// ==================== MARKET TYPE ====================

/**
 * Determine market type (SPOT vs FUTURES)
 * Key rule: "spot"/"спот" word = SPOT, everything else = FUTURES
 */
export function determineMarketType(text: string): "SPOT" | "FUTURES" {
  if (containsKeyword(text, KEYWORDS.SPOT)) {
    return "SPOT";
  }
  return "FUTURES";
}

// ==================== DIRECTION PARSING ====================

/**
 * Parse direction (LONG/SHORT) from text
 */
export function parseDirection(text: string): "LONG" | "SHORT" | null {
  const hasLong = containsKeyword(text, KEYWORDS.LONG);
  const hasShort = containsKeyword(text, KEYWORDS.SHORT);
  
  if (hasLong && !hasShort) return "LONG";
  if (hasShort && !hasLong) return "SHORT";
  
  // Both or neither - will need to infer from prices later
  return null;
}

// ==================== LEVERAGE PARSING ====================

/**
 * Parse leverage from text
 * Supports: "leverage 50x", "lev 50", "50x", "плечо 50", "cross 50", "isolated 50"
 */
export function parseLeverage(text: string): { leverage: number; type: "ISOLATED" | "CROSS" } {
  let leverage = 1;
  let type: "ISOLATED" | "CROSS" = "ISOLATED";

  // Check for leverage type (check this first)
  if (containsKeyword(text, KEYWORDS.CROSS)) {
    type = "CROSS";
  }
  
  // Patterns for leverage value
  const patterns = [
    // "leverage 50x" or "lev 50" or "плечо 50"
    /(?:leverage|lev|левередж|плечо|лев)\s*:?\s*(?:isolated|изол|cross|крос)?\s*(\d+)\s*x?/i,
    // "cross 50" or "isolated 50" 
    /(?:isolated|изолированн(?:ая|ый)|isol)\s*\(?\s*(\d+)\s*x?\)?/i,
    /(?:cross|кросс|крос)\s*\(?\s*(\d+)\s*x?\)?/i,
    // "50x" standalone
    /\bx(\d+)\b/i,
    // "x50" standalone
    /\b(\d+)\s*x\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseInt(match[1]);
      if (value > 0 && value <= 1001) {
        leverage = value;
        break;
      }
    }
  }

  return { leverage, type };
}

// ==================== ENTRY PARSING ====================

/**
 * Parse entry prices from text (arbitrary order support)
 * 
 * Supports range/zone formats:
 * - "range 1000 1100" or "range 1000-1100"
 * - "диапазон 1000-1100" or "диапазон 1000 1100"
 * - "zone 1000 1100" or "зона 1000-1100"
 * - Dash with any spacing: "1000-1100", "1000- 1100", "1000 -1100", "1000 - 1100"
 */
export function parseEntryPrices(text: string): { 
  prices: number[]; 
  zone?: { min: number; max: number }; 
  isBreakout: boolean;
  isMarketEntry: boolean;
} {
  const prices: number[] = [];
  let zone: { min: number; max: number } | undefined;
  let isBreakout = false;
  let isMarketEntry = false;

  const cleanText = text.replace(/[\r\n]+/g, " ");

  // Check for market entry
  if (containsKeyword(text, KEYWORDS.MARKET_ENTRY)) {
    isMarketEntry = true;
  }

  // Check for breakout
  if (/\b(?:above|below|пробой)\b/i.test(cleanText)) {
    isBreakout = true;
  }

  // ========================================
  // PRIORITY 1: Range/Zone/Диапазон keywords
  // ========================================
  // Pattern: "range 1000 1100" or "range 1000-1100" or "range 1000 - 1100"
  // Pattern: "диапазон 1000 1100" or "диапазон 1000-1100"
  // Pattern: "zone 1000 1100" or "зона 1000-1100"
  // Dash can have any spacing: "1000-1100", "1000- 1100", "1000 -1100", "1000 - 1100"
  
  const rangePatterns = [
    // "range/диапазон/zone/зона 1000 1100" (space separated)
    /(?:range|диапазон|zone|зона)\s+([\d,.]+)\s+([\d,.]+)(?![\d])/i,
    // "range/диапазон/zone/зона 1000-1100" (dash without/with spaces)
    /(?:range|диапазон|zone|зона)\s+([\d,.]+)\s*[-–]\s*([\d,.]+)/i,
  ];
  
  for (const pattern of rangePatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const min = parseFloat(match[1].replace(/,/g, ""));
      const max = parseFloat(match[2].replace(/,/g, ""));
      if (!isNaN(min) && !isNaN(max) && min > 0 && max > 0) {
        zone = { min: Math.min(min, max), max: Math.max(min, max) };
        prices.push(zone.min, zone.max);
        return { prices, zone, isBreakout, isMarketEntry };
      }
    }
  }

  // ========================================
  // PRIORITY 2: Entry Zone (classic format)
  // ========================================
  // "Entry Zone: 100-200" or "buy zone 100-200"
  const zoneMatch = cleanText.match(/(?:entry|buy)?\s*zone\s*:?\s*([\d,.]+)\s*[-–to]+\s*([\d,.]+)/i);
  if (zoneMatch) {
    const min = parseFloat(zoneMatch[1].replace(/,/g, ""));
    const max = parseFloat(zoneMatch[2].replace(/,/g, ""));
    if (!isNaN(min) && !isNaN(max) && min > 0 && max > 0) {
      zone = { min: Math.min(min, max), max: Math.max(min, max) };
      prices.push(zone.min, zone.max);
      return { prices, zone, isBreakout, isMarketEntry };
    }
  }

  // ========================================
  // PRIORITY 3: Entry keyword with prices
  // ========================================
  // "entry 22" or "вход 22" or "entry 22 23 24"
  const entryKeywordMatch = cleanText.match(/(?:entry|enter|buy|вход|ent)\s*:?\s*([\d\s.,]+)/i);
  if (entryKeywordMatch) {
    const numbers = entryKeywordMatch[1].match(/[\d.]+/g);
    if (numbers) {
      for (const num of numbers) {
        const price = parseFloat(num);
        if (!isNaN(price) && price > 0 && price < 100000000) {
          prices.push(price);
        }
      }
    }
  }

  // ========================================
  // PRIORITY 4: Standalone range (no keyword)
  // ========================================
  // "1000-1100" or "1000 - 1100" (if no TP/SL context)
  if (prices.length === 0) {
    // Match range with flexible dash spacing
    const rangeMatch = cleanText.match(/([\d,.]+)\s*[-–]\s*([\d,.]+)/i);
    if (rangeMatch && !cleanText.match(/(?:tp|тп|sl|stop|стоп)/i)) {
      const start = parseFloat(rangeMatch[1].replace(/,/g, ""));
      const end = parseFloat(rangeMatch[2].replace(/,/g, ""));
      if (!isNaN(start) && !isNaN(end) && start > 0 && end > 0) {
        // Check if this looks like a price range (not percentage or small numbers)
        if (start > 1 && end > 1) {
          zone = { min: Math.min(start, end), max: Math.max(start, end) };
          prices.push(zone.min, zone.max);
        }
      }
    }
  }

  return { 
    prices: [...new Set(prices)].sort((a, b) => a - b), 
    zone, 
    isBreakout,
    isMarketEntry 
  };
}

// ==================== TAKE PROFIT PARSING ====================

/**
 * Parse take profit targets
 * Supports: "tp 20 30 40 50" or "tp1 20 tp2 30 tp3 40" or "tp1: 20 tp2: 30"
 */
export function parseTakeProfits(text: string): { price: number; percentage: number }[] {
  const takeProfits: { price: number; percentage: number }[] = [];
  const cleanText = text.replace(/[\r\n]+/g, " ");

  // Pattern 1: tp1 20 tp2 30 tp3 40
  const indexedMatches = cleanText.matchAll(/(?:tp|тп|target|цель)\s*(\d+)\s*:?\s*([\d,.]+)/gi);
  const tpMap: Map<number, number> = new Map();
  
  for (const match of indexedMatches) {
    const index = parseInt(match[1]);
    const price = parseFloat(match[2].replace(/,/g, ""));
    if (!isNaN(price) && price > 0 && index >= 1 && index <= 10) {
      tpMap.set(index, price);
    }
  }

  // If found indexed TPs, convert to array
  if (tpMap.size > 0) {
    const sorted = Array.from(tpMap.entries()).sort((a, b) => a[0] - b[0]);
    const total = sorted.length;
    for (const [_, price] of sorted) {
      takeProfits.push({ price, percentage: Math.round(100 / total) });
    }
    return takeProfits;
  }

  // Pattern 2: tp 20 30 40 50 (all TPs after keyword)
  const bulkMatch = cleanText.match(/(?:tp|тп|take\s*profit|target|тейк|цель)\s*:?\s*([\d\s.,]+?)(?=(?:sl|stop|стоп|leverage|lev|плечо|entry|вход|$))/i);
  if (bulkMatch) {
    const numbers = bulkMatch[1].match(/[\d.]+/g);
    if (numbers) {
      const prices = numbers.map(n => parseFloat(n)).filter(p => !isNaN(p) && p > 0);
      const total = prices.length;
      for (const price of prices) {
        takeProfits.push({ price, percentage: total > 0 ? Math.round(100 / total) : 100 });
      }
    }
  }

  return takeProfits;
}

// ==================== STOP LOSS PARSING ====================

/**
 * Parse stop loss
 * Supports: "sl 20", "stop 20", "стоп 20"
 */
export function parseStopLoss(text: string): number | undefined {
  const patterns = [
    /(?:stop\s*loss|stoploss|stop-loss|stop|sl|стоп|сл)\s*:?\s*([\d,.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
  }

  return undefined;
}

// ==================== AMOUNT PARSING ====================

/**
 * Parse amount per trade
 */
export function parseAmountPerTrade(text: string): { amount?: number; riskPercentage?: number } {
  const result: { amount?: number; riskPercentage?: number } = {};

  // Risk percentage
  const riskMatch = text.match(/(?:risk\s*management|rm|risk|риск)\s*:?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (riskMatch) {
    result.riskPercentage = parseFloat(riskMatch[1]);
    return result;
  }

  // Regular amount
  const amountMatch = text.match(/(?:amount|invest|max|капитал|сумма)\s*:?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1]);
  }

  return result;
}

// ==================== EXCHANGES PARSING ====================

/**
 * Parse exchanges
 */
export function parseExchanges(text: string): string[] {
  const exchanges: string[] = [];
  const knownExchanges = [
    "binance", "bybit", "okx", "bitget", "bingx", 
    "huobi", "kucoin", "gate", "mexc", "coinbase",
    "бинанс", "байбит", "окх"
  ];

  const exchangeMatch = text.match(/exchanges?\s*:?\s*([^\n]+)/i);
  if (exchangeMatch) {
    const exchangeText = exchangeMatch[1].toLowerCase();
    for (const exchange of knownExchanges) {
      if (exchangeText.includes(exchange)) {
        exchanges.push(exchange.charAt(0).toUpperCase() + exchange.slice(1));
      }
    }
  }

  return exchanges;
}

// ==================== SIGNAL TYPE PARSING ====================

/**
 * Parse signal type (REGULAR vs BREAKOUT)
 */
export function parseSignalType(text: string): "REGULAR" | "BREAKOUT" {
  if (/signal\s*type\s*:?\s*breakout/i.test(text)) {
    return "BREAKOUT";
  }
  if (/\b(?:above|below|пробой)\b/i.test(text)) {
    return "BREAKOUT";
  }
  return "REGULAR";
}

// ==================== MAIN SIGNAL PARSING ====================

/**
 * Parse a complete trading signal from text (supports arbitrary keyword order)
 */
export function parseSignal(text: string): ParsedSignal | null {
  try {
    const cleanText = text.trim();
    if (!cleanText) return null;

    // Parse coin pair
    const coinPair = parseCoinPair(cleanText);
    if (!coinPair) return null;

    // Determine market type (SPOT vs FUTURES)
    const marketType = determineMarketType(cleanText);

    // Parse direction
    const explicitDirection = parseDirection(cleanText);

    // Parse entry prices
    const entryResult = parseEntryPrices(cleanText);
    const entryPrices = entryResult.prices;

    // Parse stop loss
    const stopLoss = parseStopLoss(cleanText);

    // Parse take profits
    const takeProfits = parseTakeProfits(cleanText);

    // Determine direction from prices if not explicit
    let direction: "LONG" | "SHORT";
    if (explicitDirection) {
      direction = explicitDirection;
    } else if (entryPrices.length > 0 && stopLoss) {
      const avgEntry = entryPrices.reduce((a, b) => a + b, 0) / entryPrices.length;
      direction = stopLoss < avgEntry ? "LONG" : "SHORT";
    } else if (entryPrices.length > 0 && takeProfits.length > 0) {
      const avgEntry = entryPrices.reduce((a, b) => a + b, 0) / entryPrices.length;
      const avgTP = takeProfits.reduce((a, b) => a + b.price, 0) / takeProfits.length;
      direction = avgTP > avgEntry ? "LONG" : "SHORT";
    } else {
      direction = "LONG"; // Default
    }

    // Parse leverage (only for futures)
    const { leverage, type: leverageType } = marketType === "FUTURES"
      ? parseLeverage(cleanText)
      : { leverage: 1, type: "ISOLATED" as const };

    // Parse amount
    const { amount: amountPerTrade, riskPercentage } = parseAmountPerTrade(cleanText);

    // Parse exchanges
    const exchanges = parseExchanges(cleanText);

    // Parse signal type
    const signalType = parseSignalType(cleanText);

    // Check for close signal
    const isClose = containsKeyword(cleanText, KEYWORDS.CLOSE);

    // Calculate confidence
    let confidence = 0.5;
    if (coinPair) confidence += 0.1;
    if (entryPrices.length > 0) confidence += 0.2;
    if (stopLoss) confidence += 0.1;
    if (takeProfits.length > 0) confidence += 0.1;
    if (explicitDirection) confidence += 0.1;

    return {
      symbol: coinPair.symbol,
      baseAsset: coinPair.baseAsset,
      quoteAsset: coinPair.quoteAsset,
      direction,
      action: isClose ? "CLOSE" : entryResult.isMarketEntry ? "BUY" : "BUY",
      marketType,
      entryPrices,
      entryZone: entryResult.zone,
      stopLoss,
      takeProfits,
      leverage,
      leverageType,
      signalType,
      amountPerTrade,
      riskPercentage,
      exchanges,
      confidence: Math.min(confidence, 1),
      rawText: cleanText,
    };
  } catch (error) {
    console.error("Parse signal error:", error);
    return null;
  }
}

// ==================== MANAGEMENT COMMAND PARSING ====================

/**
 * Parse signal management command
 * 
 * Commands:
 * - "id reset" / "сброс id" - Reset signal ID counter
 * - "clear base" / "очистить базу" - Clear all signals
 * - "btcusdt long tp2 100" - Update TP2 for BTCUSDT LONG signal
 * - "btcusdt short sl 95" - Update stop loss for BTCUSDT SHORT signal
 * - "btcusdt long close" - Close BTCUSDT LONG signal
 * - "btcusdt enter" / "btcusdt вход" - Market entry for BTCUSDT
 */
export function parseManagementCommand(text: string): SignalManagementCommand | null {
  const cleanText = text.trim();
  const lowerText = cleanText.toLowerCase();
  
  // Check for RESET_ID command
  if (containsKeyword(cleanText, KEYWORDS.RESET_ID)) {
    return { type: "RESET_ID" };
  }

  // Check for CLEAR_BASE command
  if (containsKeyword(cleanText, KEYWORDS.CLEAR_BASE)) {
    return { type: "CLEAR_BASE" };
  }

  // Parse symbol and direction
  const coinPair = parseCoinPair(cleanText);
  if (!coinPair) return null;

  const marketType = determineMarketType(cleanText);
  const direction = parseDirection(cleanText);

  // Check for market entry: "btcusdt enter" or "btcusdt вход"
  if (containsKeyword(cleanText, KEYWORDS.MARKET_ENTRY) && !containsKeyword(cleanText, KEYWORDS.CLOSE)) {
    return {
      type: "MARKET_ENTRY",
      symbol: coinPair.symbol,
      direction: direction || undefined,
      marketType,
    };
  }

  // Check for CLOSE command: "btcusdt long close" or "btcusdt закрыть"
  if (containsKeyword(cleanText, KEYWORDS.CLOSE)) {
    return {
      type: "CLOSE_SIGNAL",
      symbol: coinPair.symbol,
      direction: direction || undefined,
      marketType,
    };
  }

  // Check for TP update: "btcusdt long tp2 100" or "тп2 100"
  const tpMatch = cleanText.match(/(?:tp|тп)\s*(\d+)\s+([\d,.]+)/i);
  if (tpMatch) {
    const tpIndex = parseInt(tpMatch[1]);
    const tpPrice = parseFloat(tpMatch[2].replace(/,/g, ""));
    if (!isNaN(tpIndex) && !isNaN(tpPrice) && tpIndex >= 1 && tpIndex <= 10) {
      return {
        type: "UPDATE_TP",
        symbol: coinPair.symbol,
        direction: direction || undefined,
        marketType,
        tpIndex,
        tpPrice,
      };
    }
  }

  // Check for SL update: "btcusdt long sl 95" or "стоп 95"
  const slMatch = cleanText.match(/(?:sl|stop|стоп|сл)\s+([\d,.]+)/i);
  if (slMatch) {
    const slPrice = parseFloat(slMatch[1].replace(/,/g, ""));
    if (!isNaN(slPrice) && slPrice > 0) {
      return {
        type: "UPDATE_SL",
        symbol: coinPair.symbol,
        direction: direction || undefined,
        marketType,
        slPrice,
      };
    }
  }

  return null;
}

/**
 * Check if text is a management command
 */
export function isManagementCommand(text: string): boolean {
  const command = parseManagementCommand(text);
  return command !== null && 
    (command.type === "RESET_ID" || command.type === "CLEAR_BASE");
}

/**
 * Check if text is a signal update command
 */
export function isSignalUpdateCommand(text: string): boolean {
  const command = parseManagementCommand(text);
  return command !== null && 
    ["UPDATE_TP", "UPDATE_SL", "CLOSE_SIGNAL", "MARKET_ENTRY"].includes(command.type);
}

// ==================== VALIDATION ====================

/**
 * Validate parsed signal
 */
export function validateSignal(signal: ParsedSignal): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!signal.symbol) {
    errors.push("Symbol is required");
  }

  if (!signal.baseAsset || !signal.quoteAsset) {
    errors.push("Base and quote assets are required");
  }

  if (signal.action !== "CLOSE" && signal.action !== "MARKET_ENTRY" && signal.entryPrices.length === 0) {
    errors.push("Entry prices are required for new signals");
  }

  if (signal.entryPrices.length > 10) {
    errors.push("Maximum 10 entry prices allowed");
  }

  if (signal.takeProfits.length > 10) {
    errors.push("Maximum 10 take profit targets allowed");
  }

  if (signal.stopLoss && signal.entryPrices.length > 0) {
    const avgEntry = signal.entryPrices.reduce((a, b) => a + b, 0) / signal.entryPrices.length;
    if (signal.direction === "LONG" && signal.stopLoss >= avgEntry) {
      errors.push("Stop loss must be below entry price for LONG signals");
    }
    if (signal.direction === "SHORT" && signal.stopLoss <= avgEntry) {
      errors.push("Stop loss must be above entry price for SHORT signals");
    }
  }

  if (signal.leverage < 1 || signal.leverage > 1001) {
    errors.push("Leverage must be between 1 and 1001");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== FORMAT SIGNAL FOR DISPLAY ====================

/**
 * Format signal for display/Telegram message
 */
export function formatSignal(signal: ParsedSignal): string {
  const lines: string[] = [];
  
  const directionIcon = signal.direction === "LONG" ? "🟢" : "🔴";
  lines.push(`${directionIcon} <b>#${signal.symbol}</b> ${signal.marketType}`);
  lines.push("");

  lines.push(`<b>Direction:</b> ${signal.direction}`);
  lines.push(`<b>Signal Type:</b> ${signal.signalType}`);

  if (signal.entryPrices.length > 0) {
    if (signal.entryZone) {
      lines.push(`<b>Entry Zone:</b> ${signal.entryZone.min} - ${signal.entryZone.max}`);
    } else {
      lines.push(`<b>Entry:</b> ${signal.entryPrices.join(", ")}`);
    }
  }

  if (signal.takeProfits.length > 0) {
    lines.push(`<b>Take Profits:</b>`);
    signal.takeProfits.forEach((tp, i) => {
      lines.push(`  TP${i + 1}: ${tp.price} (${tp.percentage}%)`);
    });
  }

  if (signal.stopLoss) {
    lines.push(`<b>Stop Loss:</b> ${signal.stopLoss}`);
  }

  if (signal.marketType === "FUTURES") {
    lines.push(`<b>Leverage:</b> ${signal.leverageType} (${signal.leverage}x)`);
  }

  if (signal.exchanges.length > 0) {
    lines.push(`<b>Exchanges:</b> ${signal.exchanges.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Format signal in Cornix style
 */
export function formatSignalCornix(signal: ParsedSignal): string {
  const lines: string[] = [];

  lines.push(`⚡⚡ #${signal.baseAsset}/${signal.quoteAsset} ⚡⚡`);
  
  if (signal.exchanges.length > 0) {
    lines.push(`Exchanges: ${signal.exchanges.join(", ")}`);
  }

  lines.push(`Signal Type: ${signal.signalType} (${signal.direction})`);

  if (signal.marketType === "FUTURES") {
    lines.push(`Leverage: ${signal.leverageType} (${signal.leverage}X)`);
  }

  if (signal.entryZone) {
    lines.push(`Entry Zone: ${signal.entryZone.min} - ${signal.entryZone.max}`);
  } else if (signal.entryPrices.length > 0) {
    if (signal.entryPrices.length === 1) {
      lines.push(`Entry: ${signal.entryPrices[0]}`);
    } else {
      lines.push(`Entry Targets:`);
      signal.entryPrices.forEach((price, i) => {
        lines.push(`${i + 1}) ${price}`);
      });
    }
  }

  if (signal.takeProfits.length > 0) {
    lines.push(`Take-Profit Targets:`);
    signal.takeProfits.forEach((tp, i) => {
      lines.push(`${i + 1}) ${tp.price}`);
    });
  }

  if (signal.stopLoss) {
    lines.push(`Stop Targets:`);
    lines.push(`1) ${signal.stopLoss}`);
  }

  return lines.join("\n");
}

// ==================== CORNIX COMPATIBILITY EXPORTS ====================

/**
 * Extended signal type for Cornix compatibility
 * Includes additional fields used by the API
 */
export interface ParsedCornixSignal extends ParsedSignal {
  isBreakout: boolean;
  breakoutDirection?: "above" | "below";
  parseWarnings: string[];
}

/**
 * Parse signal with Cornix-compatible return type
 * This function wraps parseSignal and adds additional fields
 */
export function parseCornixSignal(text: string): ParsedCornixSignal | null {
  const signal = parseSignal(text);
  if (!signal) return null;

  const warnings: string[] = [];
  
  // Check for missing critical fields
  if (signal.entryPrices.length === 0 && signal.action !== "CLOSE") {
    warnings.push("No entry prices specified");
  }
  if (!signal.stopLoss && signal.action !== "CLOSE") {
    warnings.push("No stop loss specified");
  }
  if (signal.takeProfits.length === 0 && signal.action !== "CLOSE") {
    warnings.push("No take profit targets specified");
  }

  // Determine breakout direction
  const cleanText = text.toLowerCase();
  let breakoutDirection: "above" | "below" | undefined;
  if (/\babove\b/.test(cleanText)) {
    breakoutDirection = "above";
  } else if (/\bbelow\b/.test(cleanText)) {
    breakoutDirection = "below";
  }

  return {
    ...signal,
    isBreakout: signal.signalType === "BREAKOUT",
    breakoutDirection,
    parseWarnings: warnings,
  };
}

// ==================== SIGNAL DEDUPLICATION ====================

import {
  SignalForDedup,
  ProcessResult,
  toSignalForDedup,
  getSignalDeduplicator,
  shouldProcessSignal,
  markSignalProcessed,
} from './signal-processing';

/**
 * Result of parsing with deduplication check
 */
export interface ParseWithDedupResult {
  /** Parsed signal (null if parsing failed) */
  signal: ParsedSignal | null;
  /** Whether this is a duplicate signal */
  isDuplicate: boolean;
  /** Reason if duplicate */
  duplicateReason?: string;
  /** Original signal that this duplicates */
  originalSignalId?: string;
}

/**
 * Parse a signal with deduplication check
 * 
 * This function parses the signal and checks if it has already been processed.
 * It does NOT automatically mark the signal as processed - you must call
 * markSignalProcessed() after successfully executing the signal.
 * 
 * @example
 * ```typescript
 * const result = await parseSignalWithDedup(text);
 * 
 * if (result.signal && !result.isDuplicate) {
 *   // Execute the signal
 *   const positionId = await executeSignal(result.signal);
 *   
 *   // Mark as processed
 *   await markSignalAsProcessed(result.signal, {
 *     status: 'EXECUTED',
 *     positionId,
 *     processedAt: new Date(),
 *   });
 * }
 * ```
 */
export async function parseSignalWithDedup(text: string): Promise<ParseWithDedupResult> {
  // Parse the signal first
  const signal = parseSignal(text);
  
  if (!signal) {
    return { signal: null, isDuplicate: false };
  }

  // Convert to dedup format
  const signalForDedup: SignalForDedup = toSignalForDedup(signal);
  
  // Check if already processed
  const checkResult = await shouldProcessSignal(signalForDedup);
  
  return {
    signal,
    isDuplicate: !checkResult.canProcess,
    duplicateReason: checkResult.reason,
    originalSignalId: checkResult.originalSignal?.id,
  };
}

/**
 * Mark a parsed signal as processed
 * 
 * Call this after successfully executing a signal to prevent re-processing.
 * 
 * @example
 * ```typescript
 * await markSignalAsProcessed(signal, {
 *   status: 'EXECUTED',
 *   positionId: 'pos_123',
 *   tradeId: 'trade_456',
 *   processedAt: new Date(),
 * });
 * ```
 */
export async function markSignalAsProcessed(
  signal: ParsedSignal,
  result: ProcessResult
): Promise<void> {
  const signalForDedup: SignalForDedup = toSignalForDedup(signal);
  await markSignalProcessed(signalForDedup, result);
}

/**
 * Parse and process a signal with automatic deduplication
 * 
 * This is a convenience function that combines parsing, deduplication check,
 * and marking as processed. It will automatically mark signals as processed
 * (or as duplicates/failed) based on the processor result.
 * 
 * @example
 * ```typescript
 * const result = await parseAndProcessSignal(text, async (signal) => {
 *   // Your signal execution logic
 *   return await executeTrade(signal);
 * });
 * 
 * if (result.processed) {
 *   console.log('Trade executed:', result.positionId);
 * } else if (result.isDuplicate) {
 *   console.log('Signal was duplicate');
 * }
 * ```
 */
export async function parseAndProcessSignal<T>(
  text: string,
  processor: (signal: ParsedSignal) => Promise<T>
): Promise<{
  processed: boolean;
  signal: ParsedSignal | null;
  result?: T;
  isDuplicate: boolean;
  duplicateReason?: string;
  error?: string;
}> {
  // Parse the signal
  const parseResult = await parseSignalWithDedup(text);
  
  if (!parseResult.signal) {
    return {
      processed: false,
      signal: null,
      isDuplicate: false,
      error: 'Failed to parse signal',
    };
  }

  // Check for duplicate
  if (parseResult.isDuplicate) {
    return {
      processed: false,
      signal: parseResult.signal,
      isDuplicate: true,
      duplicateReason: parseResult.duplicateReason,
    };
  }

  try {
    // Execute the processor
    const result = await processor(parseResult.signal);
    
    // Mark as executed
    await markSignalAsProcessed(parseResult.signal, {
      status: 'EXECUTED',
      processedAt: new Date(),
    });

    return {
      processed: true,
      signal: parseResult.signal,
      result,
      isDuplicate: false,
    };
  } catch (error) {
    // Mark as failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await markSignalAsProcessed(parseResult.signal, {
      status: 'FAILED',
      error: errorMessage,
      processedAt: new Date(),
    });

    return {
      processed: false,
      signal: parseResult.signal,
      isDuplicate: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if a signal has already been processed
 * 
 * @example
 * ```typescript
 * const signal = parseSignal(text);
 * if (signal) {
 *   const isDup = await isSignalDuplicate(signal);
 *   if (isDup) {
 *     console.log('Signal already processed');
 *   }
 * }
 * ```
 */
export async function isSignalDuplicate(signal: ParsedSignal): Promise<{
  isDuplicate: boolean;
  reason?: string;
  originalSignalId?: string;
}> {
  const signalForDedup: SignalForDedup = toSignalForDedup(signal);
  const result = await shouldProcessSignal(signalForDedup);
  
  return {
    isDuplicate: !result.canProcess,
    reason: result.reason,
    originalSignalId: result.originalSignal?.id,
  };
}
