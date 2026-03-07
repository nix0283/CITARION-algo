/**
 * Signal Filter Service
 * Cornix-compatible signal filtering and validation
 */

import type { Signal } from "@prisma/client";

export interface SignalFilterConfig {
  // R:R Filters
  minRiskRewardRatio?: number;
  maxRiskRewardRatio?: number;
  
  // SL Filters
  requireSL: boolean;
  maxSLPercent?: number;
  minSLPercent?: number;
  
  // TP Filters
  requireTP: boolean;
  maxTPCount?: number;
  minTPCount?: number;
  
  // Symbol Filters
  allowedSymbols?: string[];
  blockedSymbols?: string[];
  
  // Direction Filter
  directionFilter?: "LONG" | "SHORT" | "BOTH";
  
  // Entry Filters
  maxEntryDistance?: number; // Max distance from current price
  
  // Volume/Price Filters
  minSymbolPrice?: number;
  maxSymbolPrice?: number;
  min24hVolume?: number;
  
  // Timing Filters
  maxSignalAge?: number; // Max signal age in minutes
  
  // Leverage Filters
  maxLeverage?: number;
  minLeverage?: number;
}

export interface SignalFilterResult {
  passed: boolean;
  signal: Signal;
  filters: {
    name: string;
    passed: boolean;
    reason?: string;
  }[];
  score: number; // 0-100
}

/**
 * Calculate Risk:Reward ratio
 */
export function calculateRR(
  entryPrice: number,
  slPrice: number,
  tpPrice: number,
  direction: "LONG" | "SHORT"
): number {
  const risk = direction === "LONG"
    ? Math.abs(entryPrice - slPrice) / entryPrice
    : Math.abs(slPrice - entryPrice) / entryPrice;
  
  const reward = direction === "LONG"
    ? Math.abs(tpPrice - entryPrice) / entryPrice
    : Math.abs(entryPrice - tpPrice) / entryPrice;
  
  if (risk === 0) return 0;
  return reward / risk;
}

/**
 * Filter signal based on configuration
 */
export function filterSignal(
  signal: Signal,
  config: SignalFilterConfig,
  currentPrice?: number
): SignalFilterResult {
  const filters: SignalFilterResult["filters"] = [];
  let totalScore = 0;
  let passed = true;
  
  // SL Required Filter
  if (config.requireSL) {
    const hasSL = signal.stopLoss !== null && signal.stopLoss !== undefined;
    filters.push({
      name: "requireSL",
      passed: hasSL,
      reason: hasSL ? undefined : "Signal has no Stop Loss"
    });
    if (!hasSL) passed = false;
  }
  
  // TP Required Filter
  if (config.requireTP) {
    const hasTP = signal.takeProfit !== null || 
      (signal.takeProfits && JSON.parse(signal.takeProfits as string).length > 0);
    filters.push({
      name: "requireTP",
      passed: hasTP,
      reason: hasTP ? undefined : "Signal has no Take Profit"
    });
    if (!hasTP) passed = false;
  }
  
  // Direction Filter
  if (config.directionFilter && config.directionFilter !== "BOTH") {
    const directionMatch = signal.direction === config.directionFilter;
    filters.push({
      name: "directionFilter",
      passed: directionMatch,
      reason: directionMatch ? undefined : `Signal direction ${signal.direction} not allowed`
    });
    if (!directionMatch) passed = false;
  }
  
  // Symbol Filter
  if (config.allowedSymbols && config.allowedSymbols.length > 0) {
    const symbolAllowed = config.allowedSymbols.includes(signal.symbol);
    filters.push({
      name: "allowedSymbols",
      passed: symbolAllowed,
      reason: symbolAllowed ? undefined : `Symbol ${signal.symbol} not in allowed list`
    });
    if (!symbolAllowed) passed = false;
  }
  
  // Blocked Symbols Filter
  if (config.blockedSymbols && config.blockedSymbols.length > 0) {
    const symbolBlocked = config.blockedSymbols.includes(signal.symbol);
    filters.push({
      name: "blockedSymbols",
      passed: !symbolBlocked,
      reason: symbolBlocked ? `Symbol ${signal.symbol} is blocked` : undefined
    });
    if (symbolBlocked) passed = false;
  }
  
  // R:R Filter
  if (config.minRiskRewardRatio && signal.stopLoss && signal.takeProfit) {
    const rr = calculateRR(
      signal.entryPrice,
      signal.stopLoss,
      signal.takeProfit,
      signal.direction as "LONG" | "SHORT"
    );
    const rrValid = rr >= config.minRiskRewardRatio;
    filters.push({
      name: "minRiskRewardRatio",
      passed: rrValid,
      reason: rrValid ? undefined : `R:R ${rr.toFixed(2)} below minimum ${config.minRiskRewardRatio}`
    });
    if (!rrValid) passed = false;
    totalScore += rrValid ? 20 : 0;
  }
  
  // Max Entry Distance Filter
  if (config.maxEntryDistance && currentPrice) {
    const distance = Math.abs(signal.entryPrice - currentPrice) / currentPrice * 100;
    const distanceValid = distance <= config.maxEntryDistance;
    filters.push({
      name: "maxEntryDistance",
      passed: distanceValid,
      reason: distanceValid ? undefined : `Entry distance ${distance.toFixed(2)}% exceeds max ${config.maxEntryDistance}%`
    });
    if (!distanceValid) passed = false;
  }
  
  // Signal Age Filter
  if (config.maxSignalAge) {
    const signalAge = (Date.now() - new Date(signal.createdAt).getTime()) / 60000;
    const ageValid = signalAge <= config.maxSignalAge;
    filters.push({
      name: "maxSignalAge",
      passed: ageValid,
      reason: ageValid ? undefined : `Signal age ${signalAge.toFixed(0)}min exceeds max ${config.maxSignalAge}min`
    });
    if (!ageValid) passed = false;
  }
  
  // Leverage Filter
  if (config.maxLeverage && signal.leverage) {
    const leverageValid = signal.leverage <= config.maxLeverage;
    filters.push({
      name: "maxLeverage",
      passed: leverageValid,
      reason: leverageValid ? undefined : `Leverage ${signal.leverage}x exceeds max ${config.maxLeverage}x`
    });
    if (!leverageValid) passed = false;
  }
  
  // Calculate total score
  const passedCount = filters.filter(f => f.passed).length;
  totalScore = (passedCount / filters.length) * 100;
  
  return {
    passed,
    signal,
    filters,
    score: totalScore
  };
}

/**
 * Score signal for prioritization
 */
export function scoreSignal(
  signal: Signal,
  config: SignalFilterConfig
): number {
  let score = 50; // Base score
  
  // R:R bonus
  if (signal.stopLoss && signal.takeProfit) {
    const rr = calculateRR(
      signal.entryPrice,
      signal.stopLoss,
      signal.takeProfit,
      signal.direction as "LONG" | "SHORT"
    );
    if (rr >= 3) score += 20;
    else if (rr >= 2) score += 15;
    else if (rr >= 1.5) score += 10;
  }
  
  // Has SL bonus
  if (signal.stopLoss) score += 10;
  
  // Has multiple TPs bonus
  if (signal.takeProfits) {
    const tps = JSON.parse(signal.takeProfits as string);
    if (tps.length >= 3) score += 10;
    else if (tps.length >= 2) score += 5;
  }
  
  // Cap at 100
  return Math.min(100, Math.max(0, score));
}

export default {
  calculateRR,
  filterSignal,
  scoreSignal
};
