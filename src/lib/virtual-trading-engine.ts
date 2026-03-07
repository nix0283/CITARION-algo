/**
 * Virtual Trading Engine for Demo/Paper Trading
 * 
 * Implements:
 * - Market Order execution with slippage (0.05%)
 * - Limit Order virtual matching
 * - Stop-Loss / Take-Profit tracking
 * - Commission simulation (0.1% maker/taker)
 * - Real-time price monitoring via WebSocket
 * - Funding rate settlement for futures positions
 */

import { db } from "@/lib/db";
import { calculateFundingPayment, shouldSettleFunding } from "@/lib/funding";
import { getDefaultUserId } from "@/lib/default-user";

// ==================== TYPES ====================

export interface VirtualOrder {
  id: string;
  accountId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  type: "MARKET" | "LIMIT";
  side: "OPEN" | "CLOSE";
  status: "PENDING" | "FILLED" | "CANCELLED" | "EXPIRED";
  
  // Price info
  price?: number; // For LIMIT orders
  triggerPrice?: number; // For SL/TP orders
  
  // Position info
  quantity: number;
  leverage: number;
  
  // Risk management
  stopLoss?: number;
  takeProfit?: number;
  
  // Timestamps
  createdAt: Date;
  expiresAt?: Date;
  filledAt?: Date;
  filledPrice?: number;
  
  // Fees
  fee: number;
  slippage: number;
  
  // Position reference
  positionId?: string;
  tradeId?: string;
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  high24h?: number;
  low24h?: number;
  timestamp: Date;
}

// ==================== CONSTANTS ====================

// Default slippage for market orders (0.05%)
const DEFAULT_SLIPPAGE = 0.0005;

// Default commission rates (can be overridden by bot config)
const DEFAULT_SPOT_MAKER_FEE = 0.001;   // 0.1% for spot maker orders
const DEFAULT_SPOT_TAKER_FEE = 0.001;   // 0.1% for spot taker orders
const DEFAULT_FUTURES_MAKER_FEE = 0.0002; // 0.02% for futures maker orders
const DEFAULT_FUTURES_TAKER_FEE = 0.0004; // 0.04% for futures taker orders

// Liquidation maintenance margin
const MAINTENANCE_MARGIN = 0.005; // 0.5%

// ==================== FEE CONFIGURATION INTERFACE ====================

export interface FeeConfig {
  spotMakerFee: number;
  spotTakerFee: number;
  futuresMakerFee: number;
  futuresTakerFee: number;
  slippagePercent: number;
  useCustomFees: boolean;
}

// ==================== FEE FETCHING ====================

/**
 * Get fee configuration from bot config or use defaults
 */
export async function getFeeConfig(exchangeType: "spot" | "futures" | "inverse"): Promise<FeeConfig> {
  try {
    const botConfig = await db.botConfig.findFirst({
      where: { isActive: true },
    });
    
    if (botConfig && botConfig.useCustomFees) {
      return {
        spotMakerFee: botConfig.spotMakerFee,
        spotTakerFee: botConfig.spotTakerFee,
        futuresMakerFee: botConfig.futuresMakerFee,
        futuresTakerFee: botConfig.futuresTakerFee,
        slippagePercent: botConfig.slippagePercent,
        useCustomFees: true,
      };
    }
  } catch (error) {
    console.error("Failed to get fee config:", error);
  }
  
  // Return defaults
  return {
    spotMakerFee: DEFAULT_SPOT_MAKER_FEE,
    spotTakerFee: DEFAULT_SPOT_TAKER_FEE,
    futuresMakerFee: DEFAULT_FUTURES_MAKER_FEE,
    futuresTakerFee: DEFAULT_FUTURES_TAKER_FEE,
    slippagePercent: DEFAULT_SLIPPAGE,
    useCustomFees: false,
  };
}

/**
 * Get appropriate fees for market type
 */
export function getFeesForMarket(
  feeConfig: FeeConfig,
  exchangeType: "spot" | "futures" | "inverse",
  orderType: "maker" | "taker"
): { makerFee: number; takerFee: number } {
  if (exchangeType === "spot") {
    return {
      makerFee: feeConfig.spotMakerFee,
      takerFee: feeConfig.spotTakerFee,
    };
  } else {
    // Futures and Inverse use futures fees
    return {
      makerFee: feeConfig.futuresMakerFee,
      takerFee: feeConfig.futuresTakerFee,
    };
  }
}

// ==================== ORDER EXECUTION ====================

/**
 * Execute a virtual market order with slippage
 */
export async function executeVirtualMarketOrder(params: {
  accountId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  quantity: number;
  leverage: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  exchangeType?: "spot" | "futures" | "inverse";
}): Promise<{
  success: boolean;
  position?: {
    id: string;
    avgEntryPrice: number;
    quantity: number;
    fee: number;
    slippage: number;
  };
  error?: string;
}> {
  const { accountId, symbol, direction, quantity, leverage, currentPrice, stopLoss, takeProfit, exchangeType = "futures" } = params;
  
  try {
    // Get fee configuration
    const feeConfig = await getFeeConfig(exchangeType);
    const fees = getFeesForMarket(feeConfig, exchangeType, "taker");
    
    // Apply slippage to execution price
    // For LONG: buy at higher price (ask)
    // For SHORT: sell at lower price (bid)
    const slippageAmount = currentPrice * feeConfig.slippagePercent;
    const executedPrice = direction === "LONG" 
      ? currentPrice + slippageAmount 
      : currentPrice - slippageAmount;
    
    // Calculate position value and fees (taker fee for market orders)
    const positionValue = quantity * executedPrice;
    const fee = positionValue * fees.takerFee;
    
    // Get account balance
    const account = await db.account.findUnique({
      where: { id: accountId },
    });
    
    if (!account) {
      return { success: false, error: "Account not found" };
    }
    
    const balance = account.virtualBalance ? JSON.parse(account.virtualBalance) : { USDT: 0 };
    const marginRequired = positionValue / leverage;
    
    if (balance.USDT < marginRequired + fee) {
      return { success: false, error: `Insufficient balance. Required: ${(marginRequired + fee).toFixed(2)} USDT` };
    }
    
    // Deduct margin and fee
    balance.USDT -= (marginRequired + fee);
    
    await db.account.update({
      where: { id: accountId },
      data: { virtualBalance: JSON.stringify(balance) },
    });
    
    // Create position
    const position = await db.position.create({
      data: {
        accountId,
        symbol,
        direction,
        status: "OPEN",
        totalAmount: quantity,
        filledAmount: quantity,
        avgEntryPrice: executedPrice,
        currentPrice: executedPrice,
        leverage,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isDemo: true,
      },
    });
    
    // Create trade record
    const userIdForTrade = await getDefaultUserId();
    await db.trade.create({
      data: {
        userId: userIdForTrade,
        accountId,
        symbol,
        direction,
        status: "OPEN",
        entryPrice: executedPrice,
        entryTime: new Date(),
        amount: quantity,
        leverage,
        stopLoss: stopLoss || null,
        fee,
        signalSource: "VIRTUAL_ENGINE",
        isDemo: true,
        positionId: position.id,
      },
    });
    
    // Log the execution
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        message: `[DEMO] Market order executed: ${direction} ${quantity} ${symbol} @ $${executedPrice.toFixed(2)}`,
        details: JSON.stringify({
          positionId: position.id,
          symbol,
          direction,
          quantity,
          leverage,
          entryPrice: executedPrice,
          margin: marginRequired,
          fee,
          feeRate: fees.takerFee,
          slippage: feeConfig.slippagePercent,
          exchangeType,
        }),
      },
    });
    
    return {
      success: true,
      position: {
        id: position.id,
        avgEntryPrice: executedPrice,
        quantity,
        fee,
        slippage: slippageAmount,
      },
    };
  } catch (error) {
    console.error("Virtual market order error:", error);
    return { success: false, error: "Failed to execute market order" };
  }
}

/**
 * Create a virtual limit order
 */
export async function createVirtualLimitOrder(params: {
  accountId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  price: number;
  quantity: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  expiresAt?: Date;
  exchangeType?: "spot" | "futures" | "inverse";
}): Promise<{
  success: boolean;
  orderId?: string;
  error?: string;
}> {
  const { accountId, symbol, direction, price, quantity, leverage, stopLoss, takeProfit, expiresAt, exchangeType = "futures" } = params;
  
  try {
    // Get fee configuration
    const feeConfig = await getFeeConfig(exchangeType);
    const fees = getFeesForMarket(feeConfig, exchangeType, "maker");
    
    // Get account
    const account = await db.account.findUnique({
      where: { id: accountId },
    });
    
    if (!account) {
      return { success: false, error: "Account not found" };
    }
    
    const balance = account.virtualBalance ? JSON.parse(account.virtualBalance) : { USDT: 0 };
    const positionValue = quantity * price;
    const marginRequired = positionValue / leverage;
    const fee = positionValue * fees.makerFee;
    
    // Reserve margin for limit order
    if (balance.USDT < marginRequired + fee) {
      return { success: false, error: `Insufficient balance for limit order` };
    }
    
    // Create pending trade (limit order)
    const userIdForLimitTrade = await getDefaultUserId();
    const trade = await db.trade.create({
      data: {
        userId: userIdForLimitTrade,
        accountId,
        symbol,
        direction,
        status: "PENDING",
        amount: quantity,
        leverage,
        stopLoss: stopLoss || null,
        takeProfits: takeProfit ? JSON.stringify([{ price: takeProfit, percentage: 100 }]) : null,
        fee: 0, // Fee charged on fill
        signalSource: "VIRTUAL_LIMIT",
        isDemo: true,
      },
    });
    
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        message: `[DEMO] Limit order created: ${direction} ${quantity} ${symbol} @ $${price.toFixed(2)}`,
        details: JSON.stringify({
          tradeId: trade.id,
          symbol,
          direction,
          price,
          quantity,
          leverage,
          expiresAt,
          exchangeType,
          feeRate: fees.makerFee,
        }),
      },
    });
    
    return {
      success: true,
      orderId: trade.id,
    };
  } catch (error) {
    console.error("Create limit order error:", error);
    return { success: false, error: "Failed to create limit order" };
  }
}

// ==================== ORDER MATCHING ====================

/**
 * Check and execute pending limit orders
 * Called when new price data is received
 */
export async function processLimitOrders(priceUpdate: PriceUpdate): Promise<void> {
  const { symbol, price, bidPrice, askPrice } = priceUpdate;
  
  try {
    // Find pending trades for this symbol
    const pendingTrades = await db.trade.findMany({
      where: {
        symbol,
        status: "PENDING",
        isDemo: true,
      },
    });
    
    for (const trade of pendingTrades) {
      const entryPrice = trade.entryPrice;
      if (!entryPrice) continue;
      
      let shouldFill = false;
      
      // Check if limit price is hit
      if (trade.direction === "LONG") {
        // Buy limit: fill when price drops to or below limit price
        const effectivePrice = askPrice || price;
        if (effectivePrice <= entryPrice) {
          shouldFill = true;
        }
      } else {
        // Sell limit: fill when price rises to or above limit price
        const effectivePrice = bidPrice || price;
        if (effectivePrice >= entryPrice) {
          shouldFill = true;
        }
      }
      
      if (shouldFill) {
        await fillLimitOrder(trade.id, price);
      }
    }
  } catch (error) {
    console.error("Process limit orders error:", error);
  }
}

/**
 * Fill a pending limit order
 */
async function fillLimitOrder(tradeId: string, fillPrice: number, exchangeType: "spot" | "futures" | "inverse" = "futures"): Promise<void> {
  try {
    const trade = await db.trade.findUnique({
      where: { id: tradeId },
      include: { account: true },
    });
    
    if (!trade || trade.status !== "PENDING") return;
    
    // Get fee configuration
    const feeConfig = await getFeeConfig(exchangeType);
    const fees = getFeesForMarket(feeConfig, exchangeType, "maker");
    
    const positionValue = trade.amount * fillPrice;
    const fee = positionValue * fees.makerFee;
    const marginRequired = positionValue / trade.leverage;
    
    // Get and update balance
    const balance = trade.account.virtualBalance 
      ? JSON.parse(trade.account.virtualBalance) 
      : { USDT: 0 };
    
    if (balance.USDT < marginRequired + fee) {
      // Cancel order due to insufficient funds
      await db.trade.update({
        where: { id: tradeId },
        data: { 
          status: "CANCELLED",
          closeReason: "Insufficient balance at fill time",
        },
      });
      return;
    }
    
    // Deduct margin and fee
    balance.USDT -= (marginRequired + fee);
    
    await db.account.update({
      where: { id: trade.accountId },
      data: { virtualBalance: JSON.stringify(balance) },
    });
    
    // Create position
    const position = await db.position.create({
      data: {
        accountId: trade.accountId,
        symbol: trade.symbol,
        direction: trade.direction,
        status: "OPEN",
        totalAmount: trade.amount,
        filledAmount: trade.amount,
        avgEntryPrice: fillPrice,
        currentPrice: fillPrice,
        leverage: trade.leverage,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfits ? JSON.parse(trade.takeProfits)[0]?.price : null,
        unrealizedPnl: 0,
        realizedPnl: 0,
        isDemo: true,
      },
    });
    
    // Update trade
    await db.trade.update({
      where: { id: tradeId },
      data: {
        status: "OPEN",
        entryPrice: fillPrice,
        entryTime: new Date(),
        fee,
        positionId: position.id,
      },
    });
    
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        message: `[DEMO] Limit order filled: ${trade.direction} ${trade.amount} ${trade.symbol} @ $${fillPrice.toFixed(2)}`,
        details: JSON.stringify({
          tradeId,
          positionId: position.id,
          fillPrice,
          fee,
        }),
      },
    });
  } catch (error) {
    console.error("Fill limit order error:", error);
  }
}

// ==================== SL/TP TRACKING ====================

/**
 * Check and execute Stop-Loss and Take-Profit for open positions
 * Called when new price data is received
 */
export async function processSLTP(priceUpdate: PriceUpdate): Promise<void> {
  const { symbol, price } = priceUpdate;
  
  try {
    // Find open positions for this symbol
    const positions = await db.position.findMany({
      where: {
        symbol,
        status: "OPEN",
        isDemo: true,
      },
      include: {
        account: true,
        trades: { where: { status: "OPEN" } },
      },
    });
    
    for (const position of positions) {
      let shouldClose = false;
      let closeReason = "";
      let closePrice = price;
      
      // Check Stop-Loss
      if (position.stopLoss) {
        if (position.direction === "LONG" && price <= position.stopLoss) {
          shouldClose = true;
          closeReason = "Stop-Loss";
          closePrice = position.stopLoss;
        } else if (position.direction === "SHORT" && price >= position.stopLoss) {
          shouldClose = true;
          closeReason = "Stop-Loss";
          closePrice = position.stopLoss;
        }
      }
      
      // Check Take-Profit
      if (!shouldClose && position.takeProfit) {
        if (position.direction === "LONG" && price >= position.takeProfit) {
          shouldClose = true;
          closeReason = "Take-Profit";
          closePrice = position.takeProfit;
        } else if (position.direction === "SHORT" && price <= position.takeProfit) {
          shouldClose = true;
          closeReason = "Take-Profit";
          closePrice = position.takeProfit;
        }
      }
      
      // Check liquidation
      if (!shouldClose) {
        const liquidationPrice = calculateLiquidationPrice(
          position.avgEntryPrice,
          position.leverage,
          position.direction as "LONG" | "SHORT"
        );
        
        if (position.direction === "LONG" && price <= liquidationPrice) {
          shouldClose = true;
          closeReason = "Liquidation";
          closePrice = liquidationPrice;
        } else if (position.direction === "SHORT" && price >= liquidationPrice) {
          shouldClose = true;
          closeReason = "Liquidation";
          closePrice = liquidationPrice;
        }
      }
      
      if (shouldClose) {
        await closePosition(position.id, closePrice, closeReason);
      } else {
        // Update unrealized PnL
        await updatePositionPnL(position, price);
      }
    }
  } catch (error) {
    console.error("Process SL/TP error:", error);
  }
}

/**
 * Calculate liquidation price
 */
function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  direction: "LONG" | "SHORT"
): number {
  if (direction === "LONG") {
    return entryPrice * (1 - (1 / leverage) + MAINTENANCE_MARGIN);
  } else {
    return entryPrice * (1 + (1 / leverage) - MAINTENANCE_MARGIN);
  }
}

/**
 * Update position unrealized PnL
 */
async function updatePositionPnL(position: {
  id: string;
  avgEntryPrice: number;
  totalAmount: number;
  leverage: number;
  direction: string;
}, currentPrice: number): Promise<void> {
  try {
    let pnl: number;
    
    if (position.direction === "LONG") {
      pnl = (currentPrice - position.avgEntryPrice) * position.totalAmount;
    } else {
      pnl = (position.avgEntryPrice - currentPrice) * position.totalAmount;
    }
    
    const pnlPercent = (pnl / (position.avgEntryPrice * position.totalAmount / position.leverage)) * 100;
    
    await db.position.update({
      where: { id: position.id },
      data: {
        currentPrice,
        unrealizedPnl: pnl,
      },
    });
  } catch (error) {
    console.error("Update PnL error:", error);
  }
}

// ==================== CLOSE POSITION ====================

const TAKER_FEE = DEFAULT_FUTURES_TAKER_FEE; // For close position fee calculation

/**
 * Close a position
 */
async function closePosition(
  positionId: string,
  closePrice: number,
  reason: string
): Promise<void> {
  try {
    const position = await db.position.findUnique({
      where: { id: positionId },
      include: { account: true, trades: true },
    });
    
    if (!position || position.status !== "OPEN") return;
    
    // Get fee configuration
    const feeConfig = await getFeeConfig("futures");
    
    // Calculate final PnL
    let pnl: number;
    if (position.direction === "LONG") {
      pnl = (closePrice - position.avgEntryPrice) * position.totalAmount;
    } else {
      pnl = (position.avgEntryPrice - closePrice) * position.totalAmount;
    }
    
    // Apply closing fee
    const closeFee = position.totalAmount * closePrice * feeConfig.futuresTakerFee;
    pnl -= closeFee;
    
    // Add funding PnL
    const netFunding = position.totalFundingReceived - position.totalFundingPaid;
    pnl += netFunding;
    
    // Update balance
    const balance = position.account.virtualBalance 
      ? JSON.parse(position.account.virtualBalance) 
      : { USDT: 0 };
    
    // Return margin + profit/loss
    const margin = position.avgEntryPrice * position.totalAmount / position.leverage;
    balance.USDT += margin + pnl;
    
    await db.account.update({
      where: { id: position.accountId },
      data: { virtualBalance: JSON.stringify(balance) },
    });
    
    // Update position
    await db.position.update({
      where: { id: positionId },
      data: {
        status: "CLOSED",
        realizedPnl: pnl,
        currentPrice: closePrice,
      },
    });
    
    // Update trade
    if (position.trades.length > 0) {
      const trade = position.trades[0];
      await db.trade.update({
        where: { id: trade.id },
        data: {
          status: "CLOSED",
          exitPrice: closePrice,
          exitTime: new Date(),
          closeReason: reason,
          pnl,
          pnlPercent: (pnl / (position.avgEntryPrice * position.totalAmount / position.leverage)) * 100,
          fee: trade.fee + closeFee,
        },
      });
    }
    
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "TRADE",
        message: `[DEMO] Position closed (${reason}): ${position.direction} ${position.totalAmount.toFixed(6)} ${position.symbol} @ $${closePrice.toFixed(2)}, PnL: $${pnl.toFixed(2)}, Funding: $${netFunding.toFixed(2)}`,
        details: JSON.stringify({
          positionId,
          closePrice,
          reason,
          pnl,
          closeFee,
          netFunding,
        }),
      },
    });
  } catch (error) {
    console.error("Close position error:", error);
  }
}

// ==================== PRICE PROCESSOR ====================

/**
 * Process funding settlement for open positions
 * Funding is typically settled every 8 hours (00:00, 08:00, 16:00 UTC)
 */
export async function processFundingSettlement(
  symbol: string,
  fundingRate: number,
  markPrice: number
): Promise<void> {
  try {
    // Find open futures positions for this symbol
    const positions = await db.position.findMany({
      where: {
        symbol,
        status: "OPEN",
        isDemo: true,
      },
    });
    
    for (const position of positions) {
      // Check if funding should be settled
      if (position.lastFundingTime && !shouldSettleFunding(position.lastFundingTime)) {
        continue;
      }
      
      // Calculate position size in USDT
      const positionSize = position.totalAmount * markPrice;
      
      // Calculate funding payment
      const fundingPayment = calculateFundingPayment(
        positionSize,
        fundingRate,
        position.direction as "LONG" | "SHORT"
      );
      
      // Create funding payment record
      await db.fundingPayment.create({
        data: {
          positionId: position.id,
          symbol: position.symbol,
          direction: position.direction,
          quantity: position.totalAmount,
          fundingRate,
          payment: fundingPayment,
          fundingTime: new Date(),
        }
      });
      
      // Update position funding tracking
      await db.position.update({
        where: { id: position.id },
        data: {
          totalFundingPaid: fundingPayment < 0 
            ? { increment: Math.abs(fundingPayment) } 
            : position.totalFundingPaid,
          totalFundingReceived: fundingPayment > 0 
            ? { increment: fundingPayment } 
            : position.totalFundingReceived,
          lastFundingTime: new Date(),
        }
      });
      
      await db.systemLog.create({
        data: {
          level: "INFO",
          category: "TRADE",
          message: `[DEMO] Funding settled: ${position.symbol} ${position.direction} rate=${(fundingRate * 100).toFixed(4)}% payment=$${fundingPayment.toFixed(2)}`,
          details: JSON.stringify({
            positionId: position.id,
            symbol: position.symbol,
            direction: position.direction,
            fundingRate,
            fundingPayment,
            positionSize,
            markPrice,
          }),
        }
      });
    }
  } catch (error) {
    console.error("Funding settlement error:", error);
  }
}

/**
 * Process incoming price updates
 * This function should be called by WebSocket price handlers
 */
export async function processPriceUpdate(priceUpdate: PriceUpdate): Promise<void> {
  // Process limit orders
  await processLimitOrders(priceUpdate);
  
  // Process SL/TP for open positions
  await processSLTP(priceUpdate);
  
  // Update market price cache
  await db.marketPrice.upsert({
    where: { symbol: priceUpdate.symbol },
    create: {
      symbol: priceUpdate.symbol,
      price: priceUpdate.price,
      bidPrice: priceUpdate.bidPrice,
      askPrice: priceUpdate.askPrice,
      high24h: priceUpdate.high24h,
      low24h: priceUpdate.low24h,
      lastUpdate: new Date(),
    },
    update: {
      price: priceUpdate.price,
      bidPrice: priceUpdate.bidPrice,
      askPrice: priceUpdate.askPrice,
      high24h: priceUpdate.high24h,
      low24h: priceUpdate.low24h,
      lastUpdate: new Date(),
    },
  });
}

// ==================== EXPORTS ====================

export {
  DEFAULT_SLIPPAGE,
  DEFAULT_SPOT_MAKER_FEE,
  DEFAULT_SPOT_TAKER_FEE,
  DEFAULT_FUTURES_MAKER_FEE,
  DEFAULT_FUTURES_TAKER_FEE,
  MAINTENANCE_MARGIN,
};
