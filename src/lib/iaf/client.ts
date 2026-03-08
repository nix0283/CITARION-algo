/**
 * IAF Service Client for CITARION
 *
 * TypeScript client for interacting with the Investing Algorithm Framework
 * Python service. Provides methods for strategy management, signal generation,
 * backtesting, and risk management.
 */

// Types
export interface IAFConfig {
  baseUrl: string;
  timeout?: number;
}

export interface DataSourceConfig {
  identifier: string;
  data_type: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  window_size: number;
}

export interface PositionSizeConfig {
  symbol: string;
  percentage_of_portfolio: number;
  fixed_amount?: number;
  max_amount?: number;
  min_amount?: number;
  risk_per_trade?: number;
}

export interface TakeProfitConfig {
  symbol: string;
  percentage_threshold: number;
  trailing: boolean;
  trailing_offset: number;
  sell_percentage: number;
}

export interface StopLossConfig {
  symbol: string;
  percentage_threshold: number;
  trailing: boolean;
  trailing_offset: number;
  trailing_activation: number;
}

export interface StrategyConfig {
  strategy_type: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  custom_params?: Record<string, unknown>;
  position_sizes?: PositionSizeConfig[];
  take_profits?: TakeProfitConfig[];
  stop_losses?: StopLossConfig[];
}

export interface Signal {
  type: 'buy' | 'sell' | 'hold' | 'close_long' | 'close_short' | 'no_signal';
  symbol: string;
  price: number;
  timestamp: string;
  confidence: number;
  reason: string;
  metadata: Record<string, unknown>;
}

export interface StrategyInfo {
  algorithm_id: string;
  description: string;
  version: string;
  symbols: string[];
  exchanges: string[];
  time_unit: string;
  interval: number;
}

export interface BacktestConfig {
  strategy_id: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  commission: number;
}

export interface BacktestMetrics {
  total_return: number;
  total_return_percentage: number;
  annualized_return: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  max_drawdown: number;
  max_drawdown_percentage: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
}

export interface BacktestResult {
  strategy_id: string;
  result: {
    config: Record<string, unknown>;
    trades: Array<Record<string, unknown>>;
    equity_curve: Array<{
      timestamp: string;
      equity: number;
      drawdown: number;
      drawdown_percentage: number;
    }>;
    metrics: BacktestMetrics;
    summary: {
      total_trades: number;
      total_return: number;
      win_rate: number;
      max_drawdown: number;
      sharpe_ratio: number;
    };
  };
}

export interface RiskPreset {
  position_sizes: PositionSizeConfig[];
  take_profits: TakeProfitConfig[];
  stop_losses: StopLossConfig[];
  max_open_positions: number;
  max_portfolio_risk: number;
}

/**
 * IAF Client class for API communication
 */
export class IAFClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: IAFConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:8000';
    this.timeout = config.timeout || 30000;
  }

  /**
   * Make HTTP request to IAF service
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==================== Health & Status ====================

  /**
   * Check if IAF service is healthy
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request('/health');
  }

  /**
   * Get service info
   */
  async getServiceInfo(): Promise<{
    service: string;
    version: string;
    status: string;
    timestamp: string;
  }> {
    return this.request('/');
  }

  // ==================== Strategies ====================

  /**
   * List all available strategies
   */
  async listStrategies(): Promise<{ strategies: StrategyInfo[] }> {
    return this.request('/strategies');
  }

  /**
   * Get strategy info by ID
   */
  async getStrategy(strategyId: string): Promise<StrategyInfo> {
    return this.request(`/strategies/${strategyId}`);
  }

  /**
   * Create a new strategy instance
   */
  async createStrategy(config: StrategyConfig): Promise<{
    instance_id: string;
    strategy: Record<string, unknown>;
  }> {
    return this.request('/strategies/create', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  /**
   * Generate signals for a strategy instance
   */
  async generateSignals(
    instanceId: string,
    data?: Record<string, unknown>
  ): Promise<{
    instance_id: string;
    signals: Signal[];
    timestamp: string;
  }> {
    return this.request(`/strategies/${instanceId}/signals`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  /**
   * Get strategy state
   */
  async getStrategyState(instanceId: string): Promise<Record<string, unknown>> {
    return this.request(`/strategies/${instanceId}/state`);
  }

  // ==================== Backtesting ====================

  /**
   * Run a backtest
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    return this.request('/backtest', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // ==================== Indicators ====================

  /**
   * Calculate a technical indicator
   */
  async calculateIndicator(
    indicatorName: string,
    data: Array<Record<string, number>>,
    params: Record<string, unknown> = {}
  ): Promise<{
    indicator: string;
    params: Record<string, unknown>;
    data: Array<Record<string, number>>;
    columns: string[];
  }> {
    return this.request(
      `/indicators/calculate?indicator_name=${indicatorName}`,
      {
        method: 'POST',
        body: JSON.stringify({ data, params }),
      }
    );
  }

  // ==================== Risk Management ====================

  /**
   * Get risk presets
   */
  async getRiskPresets(): Promise<{
    presets: {
      conservative: RiskPreset;
      moderate: RiskPreset;
      aggressive: RiskPreset;
    };
  }> {
    return this.request('/risk/presets');
  }

  /**
   * Calculate position size
   */
  async calculatePositionSize(
    portfolioValue: number,
    currentPrice: number,
    config: PositionSizeConfig,
    stopLossPrice?: number
  ): Promise<{
    position_size: number;
    position_value: number;
    percentage_of_portfolio: number;
  }> {
    const params = new URLSearchParams({
      portfolio_value: portfolioValue.toString(),
      current_price: currentPrice.toString(),
    });

    if (stopLossPrice) {
      params.append('stop_loss_price', stopLossPrice.toString());
    }

    return this.request(
      `/position-size/calculate?${params.toString()}`,
      {
        method: 'POST',
        body: JSON.stringify(config),
      }
    );
  }

  // ==================== Exchanges ====================

  /**
   * List supported exchanges
   */
  async listExchanges(): Promise<{
    exchanges: string[];
    description: Record<string, string>;
  }> {
    return this.request('/exchanges');
  }

  /**
   * List supported timeframes
   */
  async listTimeframes(): Promise<{
    timeframes: Array<{ value: string; label: string }>;
  }> {
    return this.request('/timeframes');
  }
}

// Default client instance
export const iafClient = new IAFClient({
  baseUrl: process.env.IAF_SERVICE_URL || 'http://localhost:8000',
});

// Export types
export type {
  IAFConfig,
  DataSourceConfig,
  PositionSizeConfig,
  TakeProfitConfig,
  StopLossConfig,
  StrategyConfig,
  Signal,
  StrategyInfo,
  BacktestConfig,
  BacktestMetrics,
  BacktestResult,
  RiskPreset,
};
