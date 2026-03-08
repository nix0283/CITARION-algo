/**
 * Position Correlation Monitor
 * Monitors and manages correlation between positions to prevent concentration risk
 * Audit Fix: P2.11 - Implement Position Correlation Monitor
 */

export interface PositionData {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  leverage: number;
  margin: number;
  timestamp: number;
}

export interface CorrelationResult {
  symbol1: string;
  symbol2: string;
  correlation: number; // -1 to 1
  covariance: number;
  sampleSize: number;
  lastUpdated: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  timestamp: number;
}

export interface CorrelationAlert {
  id: string;
  type: 'high_correlation' | 'concentration_risk' | 'portfolio_correlation';
  severity: 'warning' | 'critical';
  symbols: string[];
  correlation: number;
  threshold: number;
  message: string;
  timestamp: number;
}

export interface CorrelationConfig {
  maxCorrelationThreshold: number; // Max allowed correlation (default: 0.7)
  warningThreshold: number; // Warning level (default: 0.5)
  minSampleSize: number; // Minimum data points for correlation
  lookbackPeriod: number; // Lookback period in milliseconds
  checkInterval: number; // How often to check correlations
  enableAlerts: boolean;
}

const DEFAULT_CONFIG: CorrelationConfig = {
  maxCorrelationThreshold: 0.7,
  warningThreshold: 0.5,
  minSampleSize: 30,
  lookbackPeriod: 86400000, // 24 hours
  checkInterval: 60000, // 1 minute
  enableAlerts: true,
};

export class PositionCorrelationMonitor {
  private config: CorrelationConfig;
  private priceHistory: Map<string, Array<{ price: number; timestamp: number }>> = new Map();
  private positions: Map<string, PositionData> = new Map();
  private correlations: Map<string, CorrelationResult> = new Map();
  private alerts: CorrelationAlert[] = [];
  private checkInterval?: NodeJS.Timeout;
  private handlers: {
    onAlert: ((alert: CorrelationAlert) => void)[];
    onCorrelationUpdate: ((matrix: CorrelationMatrix) => void)[];
  } = { onAlert: [], onCorrelationUpdate: [] };

  constructor(config: Partial<CorrelationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add or update a position
   */
  updatePosition(position: PositionData): void {
    this.positions.set(position.id, position);
    this.addPricePoint(position.symbol, position.currentPrice);
  }

  /**
   * Remove a position
   */
  removePosition(positionId: string): void {
    this.positions.delete(positionId);
  }

  /**
   * Add a price data point
   */
  addPricePoint(symbol: string, price: number, timestamp: number = Date.now()): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol)!;
    history.push({ price, timestamp });

    // Clean up old data
    const cutoff = timestamp - this.config.lookbackPeriod;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }
  }

  /**
   * Start monitoring
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      console.warn('[CorrelationMonitor] Already monitoring');
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkCorrelations();
    }, this.config.checkInterval);

    console.log('[CorrelationMonitor] Started monitoring');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      console.log('[CorrelationMonitor] Stopped monitoring');
    }
  }

  /**
   * Check all correlations
   */
  private checkCorrelations(): void {
    const symbols = this.getActiveSymbols();
    if (symbols.length < 2) return;

    // Calculate correlation matrix
    const matrix = this.calculateCorrelationMatrix(symbols);
    
    // Emit update
    this.handlers.onCorrelationUpdate.forEach(h => h(matrix));

    // Check for violations
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const correlation = matrix.matrix[i][j];
        this.checkCorrelationViolation(symbols[i], symbols[j], correlation);
      }
    }

    // Check portfolio concentration
    this.checkPortfolioConcentration(matrix);
  }

  /**
   * Calculate correlation between two symbols
   */
  calculateCorrelation(symbol1: string, symbol2: string): CorrelationResult | null {
    const history1 = this.priceHistory.get(symbol1);
    const history2 = this.priceHistory.get(symbol2);

    if (!history1 || !history2) return null;

    // Align timestamps and get returns
    const returns1: number[] = [];
    const returns2: number[] = [];

    // Use simple price returns
    for (let i = 1; i < Math.min(history1.length, history2.length); i++) {
      if (history1[i] && history1[i - 1] && history2[i] && history2[i - 1]) {
        const ret1 = (history1[i].price - history1[i - 1].price) / history1[i - 1].price;
        const ret2 = (history2[i].price - history2[i - 1].price) / history2[i - 1].price;
        returns1.push(ret1);
        returns2.push(ret2);
      }
    }

    if (returns1.length < this.config.minSampleSize) {
      return null;
    }

    // Calculate Pearson correlation
    const correlation = this.pearsonCorrelation(returns1, returns2);
    const covariance = this.calculateCovariance(returns1, returns2);

    const result: CorrelationResult = {
      symbol1,
      symbol2,
      correlation,
      covariance,
      sampleSize: returns1.length,
      lastUpdated: Date.now(),
    };

    // Cache the result
    const key = this.getCorrelationKey(symbol1, symbol2);
    this.correlations.set(key, result);

    return result;
  }

  /**
   * Calculate full correlation matrix
   */
  calculateCorrelationMatrix(symbols: string[]): CorrelationMatrix {
    const n = symbols.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1; // Self-correlation is always 1
      
      for (let j = i + 1; j < n; j++) {
        const result = this.calculateCorrelation(symbols[i], symbols[j]);
        const corr = result?.correlation ?? 0;
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }

    return {
      symbols,
      matrix,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculate Pearson correlation coefficient
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
    const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
    const sumXY = x.slice(0, n).reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.slice(0, n).reduce((acc, xi) => acc + xi * xi, 0);
    const sumY2 = y.slice(0, n).reduce((acc, yi) => acc + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  /**
   * Calculate covariance
   */
  private calculateCovariance(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let covariance = 0;
    for (let i = 0; i < n; i++) {
      covariance += (x[i] - meanX) * (y[i] - meanY);
    }

    return covariance / (n - 1);
  }

  /**
   * Check for correlation threshold violation
   */
  private checkCorrelationViolation(symbol1: string, symbol2: string, correlation: number): void {
    if (Math.abs(correlation) >= this.config.maxCorrelationThreshold) {
      this.createAlert('high_correlation', 'critical', [symbol1, symbol2], correlation);
    } else if (Math.abs(correlation) >= this.config.warningThreshold) {
      this.createAlert('high_correlation', 'warning', [symbol1, symbol2], correlation);
    }
  }

  /**
   * Check portfolio concentration risk
   */
  private checkPortfolioConcentration(matrix: CorrelationMatrix): void {
    const symbols = matrix.symbols;
    if (symbols.length < 3) return;

    // Calculate average portfolio correlation
    let totalCorrelation = 0;
    let count = 0;

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        totalCorrelation += Math.abs(matrix.matrix[i][j]);
        count++;
      }
    }

    const avgCorrelation = count > 0 ? totalCorrelation / count : 0;

    if (avgCorrelation >= this.config.warningThreshold) {
      this.createAlert(
        'portfolio_correlation',
        avgCorrelation >= this.config.maxCorrelationThreshold ? 'critical' : 'warning',
        symbols,
        avgCorrelation
      );
    }

    // Check for concentration in highly correlated groups
    const groups = this.findCorrelatedGroups(matrix, this.config.maxCorrelationThreshold);
    for (const group of groups) {
      if (group.length >= 3) {
        this.createAlert('concentration_risk', 'warning', group, this.config.maxCorrelationThreshold);
      }
    }
  }

  /**
   * Find groups of highly correlated symbols
   */
  private findCorrelatedGroups(matrix: CorrelationMatrix, threshold: number): string[][] {
    const symbols = matrix.symbols;
    const visited = new Set<number>();
    const groups: string[][] = [];

    for (let i = 0; i < symbols.length; i++) {
      if (visited.has(i)) continue;

      const group: string[] = [symbols[i]];
      visited.add(i);

      for (let j = i + 1; j < symbols.length; j++) {
        if (visited.has(j)) continue;
        if (Math.abs(matrix.matrix[i][j]) >= threshold) {
          group.push(symbols[j]);
          visited.add(j);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Create an alert
   */
  private createAlert(
    type: CorrelationAlert['type'],
    severity: CorrelationAlert['severity'],
    symbols: string[],
    correlation: number
  ): void {
    const alert: CorrelationAlert = {
      id: `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      symbols,
      correlation,
      threshold: severity === 'critical' 
        ? this.config.maxCorrelationThreshold 
        : this.config.warningThreshold,
      message: this.formatAlertMessage(type, severity, symbols, correlation),
      timestamp: Date.now(),
    };

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    if (this.config.enableAlerts) {
      console.warn(`[CorrelationMonitor] Alert: ${alert.message}`);
      this.handlers.onAlert.forEach(h => h(alert));
    }
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(
    type: CorrelationAlert['type'],
    severity: CorrelationAlert['severity'],
    symbols: string[],
    correlation: number
  ): string {
    const corrStr = (correlation * 100).toFixed(1);
    
    switch (type) {
      case 'high_correlation':
        return `[${severity.toUpperCase()}] High correlation (${corrStr}%) detected between ${symbols.join(' and ')}`;
      case 'concentration_risk':
        return `[${severity.toUpperCase()}] Concentration risk: ${symbols.length} positions in highly correlated group (${symbols.slice(0, 3).join(', ')}...)`;
      case 'portfolio_correlation':
        return `[${severity.toUpperCase()}] High portfolio-wide correlation (${corrStr}% average)`;
      default:
        return `Unknown correlation alert`;
    }
  }

  /**
   * Get active symbols from positions
   */
  private getActiveSymbols(): string[] {
    const symbols = new Set<string>();
    for (const position of this.positions.values()) {
      symbols.add(position.symbol);
    }
    return Array.from(symbols);
  }

  /**
   * Get correlation key for caching
   */
  private getCorrelationKey(symbol1: string, symbol2: string): string {
    return [symbol1, symbol2].sort().join(':');
  }

  /**
   * Get correlation between two symbols
   */
  getCorrelation(symbol1: string, symbol2: string): CorrelationResult | null {
    const key = this.getCorrelationKey(symbol1, symbol2);
    return this.correlations.get(key) || null;
  }

  /**
   * Get all correlations
   */
  getAllCorrelations(): CorrelationResult[] {
    return Array.from(this.correlations.values());
  }

  /**
   * Get active alerts
   */
  getAlerts(): CorrelationAlert[] {
    return [...this.alerts];
  }

  /**
   * Clear alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Register event handlers
   */
  onAlert(handler: (alert: CorrelationAlert) => void): void {
    this.handlers.onAlert.push(handler);
  }

  onCorrelationUpdate(handler: (matrix: CorrelationMatrix) => void): void {
    this.handlers.onCorrelationUpdate.push(handler);
  }

  /**
   * Get portfolio correlation risk score (0-100)
   */
  getPortfolioRiskScore(): number {
    const symbols = this.getActiveSymbols();
    if (symbols.length < 2) return 0;

    const matrix = this.calculateCorrelationMatrix(symbols);
    let totalCorrelation = 0;
    let count = 0;

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        totalCorrelation += Math.abs(matrix.matrix[i][j]);
        count++;
      }
    }

    const avgCorrelation = count > 0 ? totalCorrelation / count : 0;
    return Math.round(avgCorrelation * 100);
  }

  /**
   * Suggest position adjustments to reduce correlation risk
   */
  suggestAdjustments(): Array<{ symbol: string; action: 'reduce' | 'close'; reason: string }> {
    const suggestions: Array<{ symbol: string; action: 'reduce' | 'close'; reason: string }> = [];
    const symbols = this.getActiveSymbols();

    if (symbols.length < 2) return suggestions;

    const matrix = this.calculateCorrelationMatrix(symbols);

    // Find positions contributing most to correlation risk
    const symbolRiskScores = symbols.map((symbol, i) => {
      let riskScore = 0;
      for (let j = 0; j < symbols.length; j++) {
        if (i !== j) {
          riskScore += Math.abs(matrix.matrix[i][j]);
        }
      }
      return { symbol, riskScore };
    });

    symbolRiskScores.sort((a, b) => b.riskScore - a.riskScore);

    // Suggest reducing or closing highest risk positions
    for (let i = 0; i < Math.min(3, symbolRiskScores.length); i++) {
      const { symbol, riskScore } = symbolRiskScores[i];
      if (riskScore > symbols.length * this.config.maxCorrelationThreshold) {
        suggestions.push({
          symbol,
          action: riskScore > symbols.length * 0.8 ? 'close' : 'reduce',
          reason: `High correlation risk score: ${(riskScore / symbols.length * 100).toFixed(1)}%`,
        });
      }
    }

    return suggestions;
  }

  /**
   * Get price history for a symbol
   */
  getPriceHistory(symbol: string): Array<{ price: number; timestamp: number }> {
    return this.priceHistory.get(symbol) || [];
  }

  /**
   * Import price history
   */
  importPriceHistory(symbol: string, prices: Array<{ price: number; timestamp: number }>): void {
    this.priceHistory.set(symbol, prices);
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    this.stopMonitoring();
    this.positions.clear();
    this.priceHistory.clear();
    this.correlations.clear();
    console.log('[CorrelationMonitor] Shutdown complete');
  }
}

// Singleton
let instance: PositionCorrelationMonitor | null = null;

export function getPositionCorrelationMonitor(
  config?: Partial<CorrelationConfig>
): PositionCorrelationMonitor {
  if (!instance) {
    instance = new PositionCorrelationMonitor(config);
  }
  return instance;
}

export default PositionCorrelationMonitor;
