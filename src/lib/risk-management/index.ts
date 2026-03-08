/**
 * RISK MANAGEMENT MODULE INDEX
 */

export { VaRCalculator, calculateVaR, defaultVaRConfig } from './var-calculator';
export { PositionLimiter, calculateKelly, defaultPositionLimits } from './position-limiter';
export { DrawdownMonitor, defaultDrawdownThresholds } from './drawdown-monitor';
export { KillSwitch, defaultKillSwitchConfig, defaultAutoArmConfig, type KillSwitchCallback, type AutoArmCallback } from './kill-switch';
export { 
  KillSwitchManager, 
  getKillSwitchManager, 
  initializeKillSwitchManager, 
  canTradeGlobally 
} from './kill-switch-manager';
export { RiskManager, createRiskManager, defaultRiskManagerConfig } from './risk-manager';

// Audit Fix: P2.11 - Position Correlation Monitor
export {
  PositionCorrelationMonitor,
  getPositionCorrelationMonitor,
  type PositionData,
  type CorrelationResult,
  type CorrelationMatrix,
  type CorrelationAlert,
  type CorrelationConfig,
} from './position-correlation';

// Audit Fix: P2.12 - Monte Carlo VaR Calculator
export {
  MonteCarloVaR,
  getMonteCarloVaR,
  type Position as VaRPosition,
  type VaRResult,
  type MonteCarloConfig,
  type SimulationMethod,
} from './var-monte-carlo';

// Audit Fix: P2.13 - Stress Testing Engine
export {
  StressTestingEngine,
  getStressTestingEngine,
  type StressScenario,
  type MarketShock,
  type StressTestResult,
  type PortfolioPosition,
  type StressTestConfig,
} from './stress-testing';

// Audit Fix: P2.28 - Position Reconciliation System
export {
  PositionReconciliation,
  getPositionReconciliation,
  type InternalPosition,
  type ExchangePosition,
  type ReconciliationResult,
  type ReconciliationAction,
  type ReconciliationConfig,
} from './position-reconciliation';

// Liquidation Protection Module
export {
  calculateLiquidationPrice,
  getDistanceToLiquidation,
  validateMarginSafety,
  calculateMaxSafeLeverage,
  calculateRequiredMargin,
  getPortfolioLiquidationRisk,
  type Exchange as LiquidationExchange,
  type MarginMode,
  type PositionSide,
  type PositionParams,
  type MaintenanceMarginConfig,
  type LiquidationResult,
  type ValidationResult,
} from './liquidation-protection';

export * from './types';
