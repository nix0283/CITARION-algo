/**
 * Prometheus Metrics Exporter for CITARION
 * 
 * Exports trading metrics in Prometheus format for Grafana dashboards.
 * Metrics include:
 * - Trading PnL
 * - Active bots
 * - Position counts
 * - Trade durations
 * - Win/Loss rates
 * - API response times
 */

import { db } from "@/lib/db";

// ==================== METRIC TYPES ====================

interface MetricValue {
  name: string;
  help: string;
  type: "gauge" | "counter" | "histogram";
  value: number | number[];
  labels?: Record<string, string>;
}

// ==================== PROMETHEUS EXPORTER ====================

class PrometheusExporter {
  private metrics: Map<string, MetricValue> = new Map();
  private lastUpdateTime: number = 0;
  private cacheDuration: number = 30000; // 30 seconds cache

  /**
   * Update all metrics from database
   */
  async updateMetrics(): Promise<void> {
    const now = Date.now();
    
    // Use cache if recently updated
    if (now - this.lastUpdateTime < this.cacheDuration) {
      return;
    }
    
    this.lastUpdateTime = now;

    try {
      // Fetch all required data in parallel
      const [
        totalTrades,
        openPositions,
        closedPositions,
        totalPnl,
        activeGridBots,
        activeDcaBots,
        activeBbBots,
        activeVisionBots,
        recentTrades,
      ] = await Promise.all([
        // Total trades count
        db.trade.count(),
        
        // Open positions
        db.position.count({ where: { status: "OPEN" } }),
        
        // Closed positions
        db.position.count({ where: { status: "CLOSED" } }),
        
        // Total realized PnL
        db.trade.aggregate({
          where: { status: "CLOSED" },
          _sum: { pnl: true },
        }),
        
        // Active bots by type
        db.gridBot.count({ where: { isActive: true } }),
        db.dcaBot.count({ where: { isActive: true } }),
        db.bBBot.count({ where: { isActive: true } }),
        db.visionBot.count({ where: { isActive: true } }),
        
        // Recent trades for duration calculation
        db.trade.findMany({
          where: { status: "CLOSED" },
          select: { pnl: true, entryTime: true, exitTime: true },
          take: 100,
          orderBy: { exitTime: "desc" },
        }),
      ]);

      // Calculate win/loss statistics
      const wins = recentTrades.filter(t => (t.pnl || 0) > 0).length;
      const losses = recentTrades.filter(t => (t.pnl || 0) <= 0).length;
      const winRate = recentTrades.length > 0 ? (wins / recentTrades.length) * 100 : 0;

      // Calculate average trade duration
      const durations = recentTrades
        .filter(t => t.entryTime && t.exitTime)
        .map(t => (t.exitTime!.getTime() - t.entryTime!.getTime()) / 1000);
      const avgDuration = durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0;

      // Set metrics
      this.setGauge("citarion_trades_total", "Total number of trades", totalTrades);
      this.setGauge("citarion_positions_open", "Number of open positions", openPositions);
      this.setGauge("citarion_positions_closed", "Number of closed positions", closedPositions);
      this.setGauge("citarion_pnl_total_usdt", "Total realized PnL in USDT", totalPnl._sum.pnl || 0);
      
      this.setGauge("citarion_bots_active", "Number of active bots", activeGridBots, { type: "grid" });
      this.setGauge("citarion_bots_active", "Number of active bots", activeDcaBots, { type: "dca" });
      this.setGauge("citarion_bots_active", "Number of active bots", activeBbBots, { type: "bb" });
      this.setGauge("citarion_bots_active", "Number of active bots", activeVisionBots, { type: "vision" });
      
      this.setGauge("citarion_win_rate_percent", "Win rate percentage", winRate);
      this.setGauge("citarion_wins_total", "Total winning trades", wins);
      this.setGauge("citarion_losses_total", "Total losing trades", losses);
      this.setGauge("citarion_avg_trade_duration_seconds", "Average trade duration in seconds", avgDuration);

      // Calculate histogram buckets for trade durations
      this.setHistogram("citarion_trade_duration_seconds", "Trade duration distribution", durations, [
        60, 300, 900, 1800, 3600, 7200, 14400, 28800, 57600, 86400,
      ]);

      // Calculate histogram buckets for PnL
      const pnls = recentTrades.map(t => t.pnl || 0);
      this.setHistogram("citarion_trade_pnl_usdt", "Trade PnL distribution", pnls, [
        -500, -200, -100, -50, -20, -10, 0, 10, 20, 50, 100, 200, 500,
      ]);

    } catch (error) {
      console.error("[Prometheus] Failed to update metrics:", error);
      
      // Set error metric
      this.setGauge("citarion_exporter_errors_total", "Total exporter errors", 1);
    }
  }

  /**
   * Set a gauge metric
   */
  private setGauge(name: string, help: string, value: number, labels?: Record<string, string>): void {
    const key = labels ? `${name}_${Object.values(labels).join("_")}` : name;
    this.metrics.set(key, {
      name,
      help,
      type: "gauge",
      value,
      labels,
    });
  }

  /**
   * Set a counter metric
   */
  private setCounter(name: string, help: string, value: number, labels?: Record<string, string>): void {
    const key = labels ? `${name}_${Object.values(labels).join("_")}` : name;
    this.metrics.set(key, {
      name,
      help,
      type: "counter",
      value,
      labels,
    });
  }

  /**
   * Set a histogram metric
   */
  private setHistogram(name: string, help: string, values: number[], buckets: number[]): void {
    const buckets_counts = buckets.map(le => ({
      le,
      count: values.filter(v => v <= le).length,
    }));
    
    this.metrics.set(name, {
      name,
      help,
      type: "histogram",
      value: buckets_counts.map(b => b.count),
      labels: { buckets: buckets.join(",") },
    });
  }

  /**
   * Export metrics in Prometheus text format
   */
  async getMetrics(): Promise<string> {
    await this.updateMetrics();
    
    const lines: string[] = [];
    const processedNames = new Set<string>();

    // Process each metric
    for (const [key, metric] of this.metrics) {
      // Add TYPE and HELP headers once per metric name
      if (!processedNames.has(metric.name)) {
        lines.push(`# HELP ${metric.name} ${metric.help}`);
        lines.push(`# TYPE ${metric.name} ${metric.type}`);
        processedNames.add(metric.name);
      }

      // Format the metric value
      if (metric.type === "histogram") {
        // Histogram format
        const buckets = (metric.labels?.buckets || "").split(",").map(Number);
        const values = metric.value as number[];
        buckets.forEach((bucket, i) => {
          lines.push(`${metric.name}_bucket{le="${bucket}"} ${values[i] || 0}`);
        });
        lines.push(`${metric.name}_bucket{le="+Inf"} ${values[values.length - 1] || 0}`);
        const sum = values.reduce((a: number, b: number) => a + b, 0);
        lines.push(`${metric.name}_sum ${sum}`);
        lines.push(`${metric.name}_count ${values.length}`);
      } else {
        // Gauge/Counter format
        const labelsStr = metric.labels 
          ? `{${Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(",")}}` 
          : "";
        lines.push(`${metric.name}${labelsStr} ${metric.value}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get metrics as JSON for internal use
   */
  async getMetricsJson(): Promise<Record<string, any>> {
    await this.updateMetrics();
    
    const result: Record<string, any> = {};
    
    for (const [key, metric] of this.metrics) {
      result[key] = {
        name: metric.name,
        help: metric.help,
        type: metric.type,
        value: metric.value,
        labels: metric.labels,
      };
    }
    
    return result;
  }
}

// ==================== SINGLETON INSTANCE ====================

let exporterInstance: PrometheusExporter | null = null;

export function getPrometheusExporter(): PrometheusExporter {
  if (!exporterInstance) {
    exporterInstance = new PrometheusExporter();
  }
  return exporterInstance;
}

// ==================== API METRICS COLLECTOR ====================

interface ApiMetric {
  path: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

class ApiMetricsCollector {
  private metrics: ApiMetric[] = [];
  private maxMetrics: number = 10000;

  recordRequest(path: string, method: string, statusCode: number, duration: number): void {
    this.metrics.push({
      path,
      method,
      statusCode,
      duration,
      timestamp: Date.now(),
    });

    // Trim old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getStats(): {
    totalRequests: number;
    avgDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    errorRate: number;
  } {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        avgDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorRate: 0,
      };
    }

    const durations = this.metrics.map(m => m.duration).sort((a, b) => a - b);
    const errors = this.metrics.filter(m => m.statusCode >= 400).length;

    return {
      totalRequests: this.metrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50Duration: durations[Math.floor(durations.length * 0.5)],
      p95Duration: durations[Math.floor(durations.length * 0.95)],
      p99Duration: durations[Math.floor(durations.length * 0.99)],
      errorRate: (errors / this.metrics.length) * 100,
    };
  }

  /**
   * Export API metrics in Prometheus format
   */
  exportPrometheus(): string {
    const stats = this.getStats();
    const lines: string[] = [
      "# HELP citarion_api_requests_total Total API requests",
      "# TYPE citarion_api_requests_total counter",
      `citarion_api_requests_total ${stats.totalRequests}`,
      "",
      "# HELP citarion_api_duration_seconds API request duration",
      "# TYPE citarion_api_duration_seconds gauge",
      `citarion_api_duration_seconds{quantile="0.5"} ${stats.p50Duration / 1000}`,
      `citarion_api_duration_seconds{quantile="0.95"} ${stats.p95Duration / 1000}`,
      `citarion_api_duration_seconds{quantile="0.99"} ${stats.p99Duration / 1000}`,
      `citarion_api_duration_seconds{quantile="avg"} ${stats.avgDuration / 1000}`,
      "",
      "# HELP citarion_api_error_rate API error rate percentage",
      "# TYPE citarion_api_error_rate gauge",
      `citarion_api_error_rate ${stats.errorRate}`,
    ];
    return lines.join("\n");
  }
}

let apiMetricsInstance: ApiMetricsCollector | null = null;

export function getApiMetricsCollector(): ApiMetricsCollector {
  if (!apiMetricsInstance) {
    apiMetricsInstance = new ApiMetricsCollector();
  }
  return apiMetricsInstance;
}

// ==================== TRADING METRICS RECORDER ====================

export class TradingMetricsRecorder {
  /**
   * Record a trade for metrics
   */
  static async recordTrade(data: {
    symbol: string;
    direction: string;
    pnl: number;
    duration: number;
    isWin: boolean;
    botType?: string;
  }): Promise<void> {
    const exporter = getPrometheusExporter();
    
    // Force immediate metrics update
    exporter["lastUpdateTime"] = 0;
    await exporter.updateMetrics();
  }

  /**
   * Record bot state change
   */
  static async recordBotStateChange(botType: string, isActive: boolean): Promise<void> {
    const exporter = getPrometheusExporter();
    exporter["lastUpdateTime"] = 0;
  }

  /**
   * Record position change
   */
  static async recordPositionChange(symbol: string, action: "OPEN" | "CLOSE"): Promise<void> {
    const exporter = getPrometheusExporter();
    exporter["lastUpdateTime"] = 0;
  }
}
