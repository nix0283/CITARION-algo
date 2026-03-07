/**
 * Prometheus Metrics Exporter
 * Stage 3.3: Monitoring implementation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MetricValue {
  value: number
  labels?: Record<string, string>
  timestamp?: number
}

export interface MetricConfig {
  name: string
  help: string
  type: 'counter' | 'gauge' | 'histogram' | 'summary'
  labels?: string[]
}

export interface HistogramBucket {
  le: number // Less than or equal
  count: number
}

// ============================================================================
// METRIC CLASS
// ============================================================================

class Metric {
  private values: Map<string, MetricValue> = new Map()
  private config: MetricConfig

  constructor(config: MetricConfig) {
    this.config = config
  }

  private labelKey(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return ''
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',')
  }

  inc(value: number = 1, labels?: Record<string, string>): void {
    const key = this.labelKey(labels)
    const current = this.values.get(key)?.value || 0
    this.values.set(key, { value: current + value, labels })
  }

  dec(value: number = 1, labels?: Record<string, string>): void {
    const key = this.labelKey(labels)
    const current = this.values.get(key)?.value || 0
    this.values.set(key, { value: Math.max(0, current - value), labels })
  }

  set(value: number, labels?: Record<string, string>): void {
    const key = this.labelKey(labels)
    this.values.set(key, { value, labels, timestamp: Date.now() })
  }

  observe(value: number, labels?: Record<string, string>): void {
    // For histograms/summaries
    const key = this.labelKey(labels)
    const current = this.values.get(key)
    if (current) {
      const observations = (current.value as any).observations || []
      observations.push(value)
      this.values.set(key, {
        value: { observations, sum: observations.reduce((a: number, b: number) => a + b, 0), count: observations.length },
        labels
      })
    } else {
      this.values.set(key, {
        value: { observations: [value], sum: value, count: 1 },
        labels
      })
    }
  }

  get(key?: string): number | undefined {
    return this.values.get(key || '')?.value
  }

  getAll(): MetricValue[] {
    return Array.from(this.values.values())
  }

  reset(): void {
    this.values.clear()
  }

  export(): string {
    let output = `# HELP ${this.config.name} ${this.config.help}\n`
    output += `# TYPE ${this.config.name} ${this.config.type}\n`

    for (const [key, metric] of this.values.entries()) {
      const labelStr = key ? `{${key}}` : ''
      if (this.config.type === 'histogram' && typeof metric.value === 'object') {
        const data = metric.value as { observations: number[]; sum: number; count: number }
        // Export histogram buckets
        const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
        let cumulative = 0
        const sorted = [...data.observations].sort((a, b) => a - b)
        
        for (const bucket of buckets) {
          while (sorted.length > 0 && sorted[0] <= bucket) {
            cumulative++
            sorted.shift()
          }
          output += `${this.config.name}_bucket{le="${bucket}"} ${cumulative}\n`
        }
        output += `${this.config.name}_bucket{le="+Inf"} ${data.count}\n`
        output += `${this.config.name}_sum ${data.sum}\n`
        output += `${this.config.name}_count ${data.count}\n`
      } else {
        output += `${this.config.name}${labelStr} ${metric.value}\n`
      }
    }

    return output
  }
}

// ============================================================================
// PROMETHEUS EXPORTER
// ============================================================================

class PrometheusExporter {
  private metrics: Map<string, Metric> = new Map()
  private prefix: string

  constructor(prefix: string = 'citarion') {
    this.prefix = prefix
  }

  private metricName(name: string): string {
    return `${this.prefix}_${name}`
  }

  registerCounter(name: string, help: string, labels?: string[]): Metric {
    const metric = new Metric({
      name: this.metricName(name),
      help,
      type: 'counter',
      labels,
    })
    this.metrics.set(this.metricName(name), metric)
    return metric
  }

  registerGauge(name: string, help: string, labels?: string[]): Metric {
    const metric = new Metric({
      name: this.metricName(name),
      help,
      type: 'gauge',
      labels,
    })
    this.metrics.set(this.metricName(name), metric)
    return metric
  }

  registerHistogram(name: string, help: string, labels?: string[]): Metric {
    const metric = new Metric({
      name: this.metricName(name),
      help,
      type: 'histogram',
      labels,
    })
    this.metrics.set(this.metricName(name), metric)
    return metric
  }

  getMetric(name: string): Metric | undefined {
    return this.metrics.get(this.metricName(name))
  }

  // Convenience methods
  counterInc(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.metrics.get(this.metricName(name))?.inc(value, labels)
  }

  gaugeSet(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.get(this.metricName(name))?.set(value, labels)
  }

  histogramObserve(name: string, value: number, labels?: Record<string, string>): void {
    this.metrics.get(this.metricName(name))?.observe(value, labels)
  }

  export(): string {
    return Array.from(this.metrics.values())
      .map(m => m.export())
      .join('\n')
  }

  reset(): void {
    this.metrics.forEach(m => m.reset())
  }
}

// ============================================================================
// CITARION METRICS
// ============================================================================

// Business Metrics
const tradesTotal = new Metric({
  name: 'citarion_trades_total',
  help: 'Total number of trades',
  type: 'counter',
  labels: ['symbol', 'side', 'bot_type', 'exchange'],
})

const pnlCurrent = new Metric({
  name: 'citarion_pnl_current',
  help: 'Current unrealized PnL',
  type: 'gauge',
  labels: ['symbol', 'bot_type'],
})

const positionCount = new Metric({
  name: 'citarion_position_count',
  help: 'Number of open positions',
  type: 'gauge',
  labels: ['symbol', 'side', 'bot_type'],
})

const signalConfidence = new Metric({
  name: 'citarion_signal_confidence',
  help: 'Signal confidence score',
  type: 'histogram',
  labels: ['bot_type', 'direction'],
})

// Technical Metrics
const apiLatency = new Metric({
  name: 'citarion_api_latency_seconds',
  help: 'API request latency',
  type: 'histogram',
  labels: ['exchange', 'endpoint', 'method'],
})

const wsConnections = new Metric({
  name: 'citarion_websocket_connections',
  help: 'Number of WebSocket connections',
  type: 'gauge',
  labels: ['exchange'],
})

const orderExecutionTime = new Metric({
  name: 'citarion_order_execution_seconds',
  help: 'Order execution time',
  type: 'histogram',
  labels: ['exchange', 'type'],
})

const botOptimizationDuration = new Metric({
  name: 'citarion_bot_optimization_duration_seconds',
  help: 'Genetic algorithm optimization duration',
  type: 'histogram',
  labels: ['bot_type'],
})

// ML Metrics
const gaGeneration = new Metric({
  name: 'citarion_ga_generation',
  help: 'Current genetic algorithm generation',
  type: 'gauge',
  labels: ['bot_type'],
})

const gaFitness = new Metric({
  name: 'citarion_ga_fitness',
  help: 'Best fitness in current generation',
  type: 'gauge',
  labels: ['bot_type'],
})

const mlAccuracy = new Metric({
  name: 'citarion_ml_accuracy',
  help: 'ML model accuracy',
  type: 'gauge',
  labels: ['model', 'horizon'],
})

// System Metrics
const journalTradesTotal = new Metric({
  name: 'citarion_journal_trades_total',
  help: 'Total trades recorded in journal',
  type: 'counter',
  labels: ['outcome'],
})

const cacheHitRate = new Metric({
  name: 'citarion_cache_hit_rate',
  help: 'Cache hit rate',
  type: 'gauge',
  labels: ['cache_type'],
})

// ============================================================================
// METRICS RECORDER
// ============================================================================

class MetricsRecorder {
  // Trade recording
  recordTrade(symbol: string, side: string, botType: string, exchange: string): void {
    tradesTotal.inc(1, { symbol, side, bot_type: botType, exchange })
  }

  recordPnl(symbol: string, botType: string, pnl: number): void {
    pnlCurrent.set(pnl, { symbol, bot_type: botType })
  }

  recordPosition(symbol: string, side: string, botType: string, count: number): void {
    positionCount.set(count, { symbol, side, bot_type: botType })
  }

  recordSignal(botType: string, direction: string, confidence: number): void {
    signalConfidence.observe(confidence, { bot_type: botType, direction })
  }

  // API recording
  recordApiLatency(exchange: string, endpoint: string, method: string, latencyMs: number): void {
    apiLatency.observe(latencyMs / 1000, { exchange, endpoint, method })
  }

  recordWsConnection(exchange: string, count: number): void {
    wsConnections.set(count, { exchange })
  }

  recordOrderExecution(exchange: string, type: string, timeMs: number): void {
    orderExecutionTime.observe(timeMs / 1000, { exchange, type })
  }

  // GA recording
  recordGaGeneration(botType: string, generation: number, fitness: number): void {
    gaGeneration.set(generation, { bot_type: botType })
    gaFitness.set(fitness, { bot_type: botType })
  }

  recordOptimizationDuration(botType: string, durationMs: number): void {
    botOptimizationDuration.observe(durationMs / 1000, { bot_type: botType })
  }

  // ML recording
  recordMlAccuracy(model: string, horizon: string, accuracy: number): void {
    mlAccuracy.set(accuracy, { model, horizon })
  }

  // Journal recording
  recordJournalTrade(outcome: 'win' | 'loss'): void {
    journalTradesTotal.inc(1, { outcome })
  }

  // Cache recording
  recordCacheHitRate(cacheType: string, rate: number): void {
    cacheHitRate.set(rate, { cache_type: cacheType })
  }

  // Export all
  export(): string {
    return [
      tradesTotal.export(),
      pnlCurrent.export(),
      positionCount.export(),
      signalConfidence.export(),
      apiLatency.export(),
      wsConnections.export(),
      orderExecutionTime.export(),
      botOptimizationDuration.export(),
      gaGeneration.export(),
      gaFitness.export(),
      mlAccuracy.export(),
      journalTradesTotal.export(),
      cacheHitRate.export(),
    ].join('\n')
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const metricsRecorder = new MetricsRecorder()
export const prometheusExporter = new PrometheusExporter()

export default {
  PrometheusExporter,
  Metric,
  MetricsRecorder,
  metricsRecorder,
}
