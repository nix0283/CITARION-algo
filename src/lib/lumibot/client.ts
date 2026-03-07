/**
 * Lumibot API Client
 * Client for communicating with the Lumibot Python service
 */

import type {
  ServiceStatus,
  Strategy,
  StrategyInfo,
  BacktestRequest,
  BacktestResult,
  LiveTradingRequest,
  ActiveStrategy,
  Signal,
  LumibotConfig,
} from './types';

const DEFAULT_CONFIG: LumibotConfig = {
  host: process.env.LUMIBOT_HOST || 'localhost',
  port: parseInt(process.env.LUMIBOT_PORT || '8001'),
  timeout: 30000,
  retries: 3,
};

class LumibotClient {
  private config: LumibotConfig;
  private baseUrl: string;

  constructor(config: Partial<LumibotConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.baseUrl = `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Make HTTP request to Lumibot service
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
      throw new Error('Unknown error');
    }
  }

  // ============== Health & Status ==============

  /**
   * Check service health
   */
  async health(): Promise<{ status: string }> {
    return this.request('/health');
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<ServiceStatus> {
    return this.request('/');
  }

  // ============== Strategies ==============

  /**
   * List all available strategies
   */
  async listStrategies(): Promise<{ strategies: Strategy[] }> {
    return this.request('/strategies');
  }

  /**
   * Get strategy details
   */
  async getStrategy(name: string): Promise<StrategyInfo> {
    return this.request(`/strategies/${name}`);
  }

  // ============== Backtesting ==============

  /**
   * Run backtest
   */
  async runBacktest(request: BacktestRequest): Promise<BacktestResult> {
    return this.request('/backtest', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Simulate backtest (for testing without actual Lumibot)
   */
  async simulateBacktest(request: BacktestRequest): Promise<BacktestResult> {
    return this.request('/backtest/simulate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // ============== Live Trading ==============

  /**
   * Start live trading
   */
  async startLiveTrading(request: LiveTradingRequest): Promise<{
    status: string;
    strategy_id: string;
    message: string;
  }> {
    return this.request('/live/start', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Stop live trading
   */
  async stopLiveTrading(strategyId: string): Promise<{
    status: string;
    strategy_id: string;
  }> {
    return this.request(`/live/${strategyId}/stop`, {
      method: 'POST',
    });
  }

  /**
   * List active strategies
   */
  async listActiveStrategies(): Promise<{
    active_strategies: ActiveStrategy[];
    count: number;
  }> {
    return this.request('/live');
  }

  // ============== Signals ==============

  /**
   * Get recent signals
   */
  async getSignals(limit = 100): Promise<{
    signals: Signal[];
    count: number;
  }> {
    return this.request(`/signals?limit=${limit}`);
  }

  /**
   * Get signals for specific strategy
   */
  async getStrategySignals(
    strategyId: string,
    limit = 100
  ): Promise<{
    signals: Signal[];
    count: number;
  }> {
    return this.request(`/signals/${strategyId}?limit=${limit}`);
  }
}

// Export singleton instance
export const lumibotClient = new LumibotClient();

// Export class for custom configurations
export { LumibotClient };
