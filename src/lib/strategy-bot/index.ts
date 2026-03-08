/**
 * Strategy Bot Module
 * 
 * Автоматические торговые боты на основе Strategy Framework + Tactics.
 * 
 * Workflow:
 * 1. Создаётся стратегия с набором тактик
 * 2. Тестируется на исторических данных (Backtest)
 * 3. Оптимизируется через Hyperopt
 * 4. Запускается в Paper Trading
 * 5. При успешных результатах - Live Trading
 * 
 * Интеграция с Grid Bot, DCA Bot, BBot:
 * - Каждый бот может быть протестирован на истории
 * - Каждый бот может работать в Paper Trading режиме
 * - Унифицированный интерфейс для всех ботов
 */

// Main Strategy Bot
export { StrategyBot, getStrategyBotManager, StrategyBotManager } from "./engine";

// Types
export type {
  BotMode,
  BotStatus,
  StrategyBotConfig,
  BacktestSettings,
  PaperSettings,
  LiveSettings,
  StrategyBotState,
  BotPosition,
  BotEntry,
  BotExit,
  BotTPTarget,
  StrategyBotResult,
  BotTrade,
  BotEquityPoint,
  BotLogEntry,
  StrategyBotEvent,
  StrategyBotEventCallback,
  IBotAdapter,
  CreateBotFromBacktestConfig,
  CreateBotFromBacktestResult,
} from "./types";

// Bot Adapters
export {
  GridBotSimulator,
  DCABotSimulator,
  BBotSimulator,
} from "./adapters";

export type {
  BotType,
  BaseBotConfig,
  BotSimulationResult,
  BotSimulationMetrics,
  GridBotSimulationConfig,
  DCABotSimulationConfig,
  BBotSimulationConfig,
} from "./adapters";
