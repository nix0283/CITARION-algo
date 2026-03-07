/**
 * DCA Bot Module
 * 
 * Полнофункциональный модуль DCA (Dollar Cost Averaging) торгового бота.
 */

// Core Engine
export { DCABotEngine } from './dca-bot-engine';

// Types
export type {
  DCABotConfig,
  DCABotState,
  DCABotStatus,
  DCABotEvent,
  DCABotEventType,
  DCAPosition,
  DCAEntry,
  DCAOrder,
  SafetyOrder,
  TakeProfitLevel,
  DCASignal,
  DCABotMetrics,
  DCABotAdapter,
  DCAOrderRequest,
  DCAOrderResult,
  DCABalanceInfo,
  DCAPositionInfo,
} from './types';

// Additional imports for engine
import { DCABotEngine } from './dca-bot-engine';
import { GridBotPaperAdapter } from '../grid-bot/paper-adapter';
import type { DCABotConfig, DCABotAdapter } from './types';

/**
 * Создать DCA Bot с нужным адаптером
 */
export function createDCABot(
  config: DCABotConfig,
  options: {
    paperTrading?: boolean;
    initialBalance?: number;
    adapter?: DCABotAdapter;
  }
): DCABotEngine {
  // For now, use paper adapter
  // Real exchange adapter would be similar to GridBot
  const adapter = options.adapter || new GridBotPaperAdapter(
    config.symbol,
    options.initialBalance || 10000,
    config.leverage
  ) as unknown as DCABotAdapter;
  
  return new DCABotEngine(config, adapter);
}

/**
 * Рассчитать оптимальные параметры DCA
 */
export function calculateDCAParameters(
  balance: number,
  riskPercent: number,
  symbol: string,
  currentPrice: number
): {
  baseOrderAmount: number;
  safetyOrdersCount: number;
  safetyOrderDeviation: number;
} {
  const riskAmount = balance * (riskPercent / 100);
  
  // Base order = 20% of risk
  const baseOrderAmount = riskAmount * 0.2;
  
  // Safety orders = 80% of risk, divided by count
  const safetyOrdersCount = 5;
  const safetyOrderDeviation = 2; // 2% between each level
  
  return {
    baseOrderAmount,
    safetyOrdersCount,
    safetyOrderDeviation,
  };
}
