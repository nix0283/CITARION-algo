/**
 * TradingView Chart Library Integration
 * 
 * Provides advanced charting capabilities:
 * - TradingView Lightweight Charts integration
 * - Custom indicators support
 * - Real-time data streaming
 * - Multi-pane charts
 * - Drawing tools support
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ChartConfig {
  symbol: string;
  exchange: string;
  timeframe: string;
  theme: 'light' | 'dark';
  showVolume: boolean;
  showStudies: boolean;
  autoSize: boolean;
  crosshairMode: 'normal' | 'magnet' | 'hidden';
  timezone: string;
  locale: string;
}

export interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorConfig {
  id: string;
  name: string;
  type: 'overlay' | 'pane';
  color: string;
  lineWidth: number;
  params: Record<string, number>;
}

export interface Drawing {
  id: string;
  type: 'line' | 'hline' | 'trendline' | 'rectangle' | 'fibonacci' | 'text';
  points: Array<{ time: number; price: number }>;
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  crosshair: string;
  upColor: string;
  downColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  volumeUpColor: string;
  volumeDownColor: string;
}

// ============================================================================
// CHART THEMES
// ============================================================================

export const CHART_THEMES: Record<'light' | 'dark', ChartTheme> = {
  dark: {
    background: '#0f172a',
    text: '#94a3b8',
    grid: '#1e293b',
    crosshair: '#475569',
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderUpColor: '#22c55e',
    borderDownColor: '#ef4444',
    wickUpColor: '#22c55e',
    wickDownColor: '#ef4444',
    volumeUpColor: 'rgba(34, 197, 94, 0.5)',
    volumeDownColor: 'rgba(239, 68, 68, 0.5)',
  },
  light: {
    background: '#ffffff',
    text: '#1e293b',
    grid: '#e2e8f0',
    crosshair: '#64748b',
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderUpColor: '#22c55e',
    borderDownColor: '#ef4444',
    wickUpColor: '#22c55e',
    wickDownColor: '#ef4444',
    volumeUpColor: 'rgba(34, 197, 94, 0.5)',
    volumeDownColor: 'rgba(239, 68, 68, 0.5)',
  },
};

// ============================================================================
// BUILT-IN INDICATORS
// ============================================================================

export const BUILTIN_INDICATORS: Record<string, IndicatorConfig> = {
  sma: {
    id: 'sma',
    name: 'Simple Moving Average',
    type: 'overlay',
    color: '#f59e0b',
    lineWidth: 2,
    params: { period: 20 },
  },
  ema: {
    id: 'ema',
    name: 'Exponential Moving Average',
    type: 'overlay',
    color: '#3b82f6',
    lineWidth: 2,
    params: { period: 20 },
  },
  rsi: {
    id: 'rsi',
    name: 'Relative Strength Index',
    type: 'pane',
    color: '#8b5cf6',
    lineWidth: 2,
    params: { period: 14 },
  },
  macd: {
    id: 'macd',
    name: 'MACD',
    type: 'pane',
    color: '#ec4899',
    lineWidth: 2,
    params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  },
  bb: {
    id: 'bb',
    name: 'Bollinger Bands',
    type: 'overlay',
    color: '#06b6d4',
    lineWidth: 1,
    params: { period: 20, stdDev: 2 },
  },
  atr: {
    id: 'atr',
    name: 'Average True Range',
    type: 'pane',
    color: '#f97316',
    lineWidth: 2,
    params: { period: 14 },
  },
  volume: {
    id: 'volume',
    name: 'Volume',
    type: 'pane',
    color: '#6366f1',
    lineWidth: 1,
    params: {},
  },
  vwap: {
    id: 'vwap',
    name: 'VWAP',
    type: 'overlay',
    color: '#10b981',
    lineWidth: 2,
    params: {},
  },
  ichimoku: {
    id: 'ichimoku',
    name: 'Ichimoku Cloud',
    type: 'overlay',
    color: '#a855f7',
    lineWidth: 1,
    params: { tenkan: 9, kijun: 26, senkou: 52 },
  },
  supertrend: {
    id: 'supertrend',
    name: 'SuperTrend',
    type: 'overlay',
    color: '#14b8a6',
    lineWidth: 2,
    params: { period: 10, multiplier: 3 },
  },
};

// ============================================================================
// CHART CONTROLLER
// ============================================================================

class TradingViewChartController {
  private config: ChartConfig;
  private indicators: Map<string, IndicatorConfig> = new Map();
  private drawings: Map<string, Drawing> = new Map();
  private data: ChartData[] = [];
  private subscribers: Set<(data: unknown) => void> = new Set();

  constructor(config: Partial<ChartConfig> = {}) {
    this.config = {
      symbol: 'BTCUSDT',
      exchange: 'binance',
      timeframe: '1h',
      theme: 'dark',
      showVolume: true,
      showStudies: true,
      autoSize: true,
      crosshairMode: 'normal',
      timezone: 'Etc/UTC',
      locale: 'en',
      ...config,
    };
  }

  /**
   * Update chart configuration
   */
  configure(config: Partial<ChartConfig>): void {
    this.config = { ...this.config, ...config };
    this.notifySubscribers('config', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): ChartConfig {
    return { ...this.config };
  }

  // ============================================================================
  // DATA MANAGEMENT
  // ============================================================================

  /**
   * Set chart data
   */
  setData(data: ChartData[]): void {
    this.data = data;
    this.notifySubscribers('data', data);
  }

  /**
   * Get chart data
   */
  getData(): ChartData[] {
    return [...this.data];
  }

  /**
   * Append new candle
   */
  appendCandle(candle: ChartData): void {
    // Check if updating last candle or adding new
    if (this.data.length > 0) {
      const lastCandle = this.data[this.data.length - 1];
      if (lastCandle.time === candle.time) {
        // Update existing candle
        this.data[this.data.length - 1] = candle;
      } else if (candle.time > lastCandle.time) {
        // Add new candle
        this.data.push(candle);
      }
    } else {
      this.data.push(candle);
    }

    this.notifySubscribers('update', candle);
  }

  /**
   * Update last candle (real-time update)
   */
  updateLastCandle(tick: { time: number; price: number; volume?: number }): void {
    if (this.data.length === 0) return;

    const lastCandle = this.data[this.data.length - 1];
    lastCandle.close = tick.price;
    lastCandle.high = Math.max(lastCandle.high, tick.price);
    lastCandle.low = Math.min(lastCandle.low, tick.price);
    if (tick.volume !== undefined) {
      lastCandle.volume = (lastCandle.volume || 0) + tick.volume;
    }

    this.notifySubscribers('tick', lastCandle);
  }

  // ============================================================================
  // INDICATORS
  // ============================================================================

  /**
   * Add indicator
   */
  addIndicator(indicator: Partial<IndicatorConfig>): string {
    const id = indicator.id || `${indicator.name || 'custom'}-${Date.now()}`;
    const config: IndicatorConfig = {
      id,
      name: indicator.name || 'Custom',
      type: indicator.type || 'overlay',
      color: indicator.color || '#888888',
      lineWidth: indicator.lineWidth || 2,
      params: indicator.params || {},
    };

    this.indicators.set(id, config);
    this.notifySubscribers('indicator:added', config);
    return id;
  }

  /**
   * Remove indicator
   */
  removeIndicator(id: string): boolean {
    const result = this.indicators.delete(id);
    if (result) {
      this.notifySubscribers('indicator:removed', id);
    }
    return result;
  }

  /**
   * Get all indicators
   */
  getIndicators(): IndicatorConfig[] {
    return Array.from(this.indicators.values());
  }

  /**
   * Update indicator parameters
   */
  updateIndicator(id: string, params: Partial<IndicatorConfig['params']>): boolean {
    const indicator = this.indicators.get(id);
    if (!indicator) return false;

    indicator.params = { ...indicator.params, ...params };
    this.notifySubscribers('indicator:updated', indicator);
    return true;
  }

  // ============================================================================
  // DRAWINGS
  // ============================================================================

  /**
   * Add drawing
   */
  addDrawing(drawing: Partial<Drawing>): string {
    const id = drawing.id || `drawing-${Date.now()}`;
    const config: Drawing = {
      id,
      type: drawing.type || 'line',
      points: drawing.points || [],
      color: drawing.color || '#f59e0b',
      lineWidth: drawing.lineWidth || 2,
      lineStyle: drawing.lineStyle || 'solid',
    };

    this.drawings.set(id, config);
    this.notifySubscribers('drawing:added', config);
    return id;
  }

  /**
   * Remove drawing
   */
  removeDrawing(id: string): boolean {
    const result = this.drawings.delete(id);
    if (result) {
      this.notifySubscribers('drawing:removed', id);
    }
    return result;
  }

  /**
   * Get all drawings
   */
  getDrawings(): Drawing[] {
    return Array.from(this.drawings.values());
  }

  /**
   * Clear all drawings
   */
  clearDrawings(): void {
    this.drawings.clear();
    this.notifySubscribers('drawings:cleared', null);
  }

  // ============================================================================
  // THEME
  // ============================================================================

  /**
   * Set theme
   */
  setTheme(theme: 'light' | 'dark'): void {
    this.config.theme = theme;
    this.notifySubscribers('theme', CHART_THEMES[theme]);
  }

  /**
   * Get current theme
   */
  getTheme(): ChartTheme {
    return CHART_THEMES[this.config.theme];
  }

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  /**
   * Subscribe to chart updates
   */
  subscribe(callback: (type: string, data: unknown) => void): () => void {
    const wrapped = (data: unknown) => callback('update', data);
    this.subscribers.add(wrapped);
    return () => this.subscribers.delete(wrapped);
  }

  /**
   * Notify all subscribers
   */
  private notifySubscribers(type: string, data: unknown): void {
    for (const callback of this.subscribers) {
      try {
        callback({ type, data });
      } catch (error) {
        console.error('[ChartController] Subscriber error:', error);
      }
    }
  }

  // ============================================================================
  // EXPORT
  // ============================================================================

  /**
   * Export chart as image
   */
  async exportImage(format: 'png' | 'jpeg' = 'png'): Promise<string | null> {
    // In production, would use chart library's export method
    console.log(`[ChartController] Exporting chart as ${format}`);
    return null;
  }

  /**
   * Get chart state for persistence
   */
  getState(): {
    config: ChartConfig;
    indicators: IndicatorConfig[];
    drawings: Drawing[];
  } {
    return {
      config: this.getConfig(),
      indicators: this.getIndicators(),
      drawings: this.getDrawings(),
    };
  }

  /**
   * Restore chart state
   */
  setState(state: {
    config?: Partial<ChartConfig>;
    indicators?: IndicatorConfig[];
    drawings?: Drawing[];
  }): void {
    if (state.config) {
      this.configure(state.config);
    }
    if (state.indicators) {
      for (const indicator of state.indicators) {
        this.indicators.set(indicator.id, indicator);
      }
    }
    if (state.drawings) {
      for (const drawing of state.drawings) {
        this.drawings.set(drawing.id, drawing);
      }
    }
    this.notifySubscribers('state:restored', this.getState());
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert timeframe to milliseconds
 */
export function timeframeToMs(timeframe: string): number {
  const units: Record<string, number> = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000,
    M: 2592000000, // Approximate
  };

  const match = timeframe.match(/^(\d+)([smhdwM])$/);
  if (!match) return 3600000; // Default to 1h

  const value = parseInt(match[1], 10);
  const unit = match[2];

  return value * (units[unit] || 3600000);
}

/**
 * Format price for display
 */
export function formatPrice(price: number, precision: number = 2): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

/**
 * Format volume for display
 */
export function formatVolume(volume: number): string {
  if (volume >= 1e9) {
    return `${(volume / 1e9).toFixed(2)}B`;
  } else if (volume >= 1e6) {
    return `${(volume / 1e6).toFixed(2)}M`;
  } else if (volume >= 1e3) {
    return `${(volume / 1e3).toFixed(2)}K`;
  }
  return volume.toFixed(2);
}

/**
 * Calculate price change percentage
 */
export function calculateChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const chartController = new TradingViewChartController();
export default chartController;
