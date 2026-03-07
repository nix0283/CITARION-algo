# ЭТАП 2: ПЛАН МОДЕРНИЗАЦИИ АЛГОРИТМОВ И БОТОВ

**Дата:** 2025-01-XX  
**Версия документа:** 1.0.0  
**Статус:** Готов к реализации  
**Зависимости:** Этап 1 должен быть завершён

---

## 2.1. ПРИМЕНЕНИЕ ГЕНЕТИЧЕСКИХ АЛГОРИТМОВ

### 2.1.1. Архитектура GA для ботов

```typescript
// src/lib/genetic/bot-genetic-optimizer.ts

interface BotGene {
  // Параметры стратегии (кодируются в гены)
  param: string
  value: number | string | boolean
  min?: number
  max?: number
  type: 'numeric' | 'categorical' | 'boolean'
}

interface BotChromosome {
  id: string
  botType: string
  genes: BotGene[]
  fitness: number
  trades: number
  pnl: number
  winRate: number
  sharpe: number
  maxDrawdown: number
}

interface GeneticConfig {
  populationSize: number        // 50-200
  generations: number           // 50-500
  mutationRate: number          // 0.01-0.1
  crossoverRate: number         // 0.7-0.9
  eliteCount: number            // 2-10
  tournamentSize: number        // 3-7
}

class BotGeneticOptimizer {
  private config: GeneticConfig
  private backtestEngine: BacktestEngine
  private population: BotChromosome[]
  
  // Инициализация популяции
  async initializePopulation(botType: string): Promise<BotChromosome[]> {
    const population: BotChromosome[] = []
    
    for (let i = 0; i < this.config.populationSize; i++) {
      const chromosome = this.createRandomChromosome(botType)
      population.push(chromosome)
    }
    
    return population
  }
  
  // Оценка приспособленности (fitness function)
  async evaluateFitness(chromosome: BotChromosome): Promise<number> {
    // Запускаем бэктест с параметрами хромосомы
    const result = await this.backtestEngine.run({
      botType: chromosome.botType,
      params: this.chromosomeToParams(chromosome),
      startDate: this.getBacktestStart(),
      endDate: new Date(),
    })
    
    // Fitness = Sharpe * WinRate * (1 - MaxDD) * TradesFactor
    const fitness = 
      result.sharpeRatio * 
      result.winRate * 
      (1 - result.maxDrawdown) * 
      Math.log10(result.trades + 1)
    
    chromosome.fitness = fitness
    chromosome.trades = result.trades
    chromosome.pnl = result.totalPnl
    chromosome.winRate = result.winRate
    chromosome.sharpe = result.sharpeRatio
    chromosome.maxDrawdown = result.maxDrawdown
    
    return fitness
  }
  
  // Селекция (tournament selection)
  select(population: BotChromosome[]): BotChromosome {
    const tournament = []
    for (let i = 0; i < this.config.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * population.length)
      tournament.push(population[idx])
    }
    return tournament.sort((a, b) => b.fitness - a.fitness)[0]
  }
  
  // Кроссовер
  crossover(parent1: BotChromosome, parent2: BotChromosome): [BotChromosome, BotChromosome] {
    const child1 = this.cloneChromosome(parent1)
    const child2 = this.cloneChromosome(parent2)
    
    // Single-point crossover
    const crossoverPoint = Math.floor(Math.random() * parent1.genes.length)
    
    for (let i = crossoverPoint; i < parent1.genes.length; i++) {
      child1.genes[i] = parent2.genes[i]
      child2.genes[i] = parent1.genes[i]
    }
    
    return [child1, child2]
  }
  
  // Мутация
  mutate(chromosome: BotChromosome): BotChromosome {
    for (const gene of chromosome.genes) {
      if (Math.random() < this.config.mutationRate) {
        if (gene.type === 'numeric') {
          // Gaussian mutation
          const range = (gene.max! - gene.min!) * 0.1
          gene.value = Math.max(gene.min!, Math.min(gene.max!, 
            (gene.value as number) + this.gaussianRandom(0, range)
          ))
        } else if (gene.type === 'boolean') {
          gene.value = !gene.value
        } else if (gene.type === 'categorical') {
          // Random selection from options
          gene.value = this.getRandomCategory(gene.param)
        }
      }
    }
    return chromosome
  }
  
  // Основной цикл эволюции
  async evolve(botType: string, generations?: number): Promise<OptimizationResult> {
    const maxGen = generations || this.config.generations
    
    // Инициализация
    this.population = await this.initializePopulation(botType)
    
    // Оценка начальной популяции
    await Promise.all(this.population.map(c => this.evaluateFitness(c)))
    
    const history: GenerationStats[] = []
    
    for (let gen = 0; gen < maxGen; gen++) {
      // Сортировка по fitness
      this.population.sort((a, b) => b.fitness - a.fitness)
      
      // Сохраняем статистику поколения
      history.push({
        generation: gen,
        bestFitness: this.population[0].fitness,
        avgFitness: this.population.reduce((s, c) => s + c.fitness, 0) / this.population.length,
        bestPnl: this.population[0].pnl,
      })
      
      // Создаём новое поколение
      const newPopulation: BotChromosome[] = []
      
      // Элита (лучшие переносятся без изменений)
      for (let i = 0; i < this.config.eliteCount; i++) {
        newPopulation.push(this.cloneChromosome(this.population[i]))
      }
      
      // Остальные через селекцию, кроссовер и мутацию
      while (newPopulation.length < this.config.populationSize) {
        const parent1 = this.select(this.population)
        const parent2 = this.select(this.population)
        
        if (Math.random() < this.config.crossoverRate) {
          const [child1, child2] = this.crossover(parent1, parent2)
          newPopulation.push(this.mutate(child1))
          if (newPopulation.length < this.config.populationSize) {
            newPopulation.push(this.mutate(child2))
          }
        } else {
          newPopulation.push(this.mutate(this.cloneChromosome(parent1)))
          newPopulation.push(this.mutate(this.cloneChromosome(parent2)))
        }
      }
      
      // Оценка нового поколения
      await Promise.all(
        newPopulation.slice(this.config.eliteCount).map(c => this.evaluateFitness(c))
      )
      
      this.population = newPopulation
    }
    
    // Возвращаем лучшую хромосому
    const best = this.population.sort((a, b) => b.fitness - a.fitness)[0]
    
    return {
      bestParams: this.chromosomeToParams(best),
      fitness: best.fitness,
      pnl: best.pnl,
      sharpe: best.sharpe,
      winRate: best.winRate,
      maxDrawdown: best.maxDrawdown,
      history,
    }
  }
}
```

### 2.1.2. Параметры для оптимизации по ботам

| Бот | Параметры для GA | Диапазоны |
|-----|------------------|-----------|
| **GRID** | gridSpacing, gridCount, tpPercent | 0.5-5%, 5-50, 0.5-5% |
| **DCA** | entryCount, entryStep, tpPerLevel | 3-10, 1-5%, 0.5-3% |
| **BB** | period, stdDev, stochPeriod | 10-30, 1.5-3, 7-21 |
| **Argus** | volumeThreshold, priceThreshold, cooldown | 2-10x, 2-10%, 30-300s |
| **Vision** | lookbackPeriod, confidence, features | 50-200, 0.6-0.9, subset |
| **Orion** | emaPeriod, supertrendPeriod, supertrendMult | 5-50, 5-30, 1.5-4 |

### 2.1.3. Self-Learning Pipeline

```typescript
// src/lib/self-learning/pipeline.ts

class SelfLearningPipeline {
  private geneticOptimizer: BotGeneticOptimizer
  private paperTradingEngine: PaperTradingEngine
  private orchestrator: NatsOrchestrator
  
  async runContinuousOptimization(config: LearningConfig): Promise<void> {
    // Цикл непрерывного обучения
    while (config.enabled) {
      for (const botType of config.botTypes) {
        // 1. Запуск генетической оптимизации
        const result = await this.geneticOptimizer.evolve(botType, 50)
        
        // 2. Валидация на paper trading
        const validation = await this.validateOnPaperTrading(botType, result.bestParams)
        
        if (validation.improved) {
          // 3. Постепенное внедрение (10% от капитала)
          await this.deployWithGradualRollout(botType, result.bestParams, 0.1)
          
          // 4. Уведомление
          await this.orchestrator.publish('LEARNING.UPDATE', {
            botType,
            improvement: validation.improvement,
            newParams: result.bestParams,
          })
        }
      }
      
      // Пауза между циклами
      await this.sleep(config.intervalMs)
    }
  }
}
```

### 2.1.4. Оценка времени

| Этап | Время |
|------|-------|
| GA Framework | 8 часов |
| Fitness Functions для ботов | 6 часов |
| Paper Trading validation | 4 часа |
| UI для мониторинга | 4 часа |
| Тестирование | 4 часа |
| **Итого** | **26 часов** |

---

## 2.2. КЛАССИЧЕСКИЙ ML (k-NN, GRADIENT BOOSTING)

### 2.2.1. Расширение Lawrence Classifier

```typescript
// src/lib/ml/extended-classifier.ts

interface ExtendedClassifierConfig {
  // k-NN параметры
  kNeighbors: number           // 3-15
  distanceMetric: 'euclidean' | 'manhattan' | 'lorentzian' | 'mahalanobis'
  weighted: boolean
  
  // Gradient Boosting параметры
  nEstimators: number          // 50-500
  maxDepth: number             // 3-10
  learningRate: number         // 0.01-0.3
  subsample: number            // 0.5-1.0
  
  // Ensemble
  ensembleMethod: 'voting' | 'stacking' | 'blending'
}

class ExtendedSignalClassifier {
  private knn: KNNClassifier
  private gb: GradientBoostingClassifier
  private ensemble: EnsembleVoter
  
  // Feature engineering
  extractFeatures(marketData: MarketData): Features {
    return {
      // Price features
      returns: this.calculateReturns(marketData.close),
      logReturns: this.calculateLogReturns(marketData.close),
      volatility: this.calculateVolatility(marketData, 20),
      
      // Trend features
      adx: this.calculateADX(marketData),
      supertrend: this.calculateSupertrend(marketData),
      emaSlope: this.calculateEMASlope(marketData, 20),
      
      // Momentum features
      rsi: this.calculateRSI(marketData, 14),
      stochK: this.calculateStoch(marketData).k,
      macdHist: this.calculateMACD(marketData).histogram,
      
      // Volume features
      volumeRatio: this.calculateVolumeRatio(marketData, 20),
      obvSlope: this.calculateOBVSlope(marketData),
      
      // Volatility features
      atrRatio: this.calculateATR(marketData, 14) / marketData.close[0],
      bbWidth: this.calculateBBWidth(marketData),
      
      // Microstructure
      bidAskImbalance: marketData.bidAskImbalance,
      tradeIntensity: marketData.tradeIntensity,
      
      // Time features
      hour: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
    }
  }
  
  // Prediction with confidence
  async predict(features: Features): Promise<PredictionResult> {
    const knnPred = await this.knn.predict(features)
    const gbPred = await this.gb.predict(features)
    
    // Ensemble
    const ensemblePred = this.ensemble.combine([
      { prediction: knnPred, weight: 0.4 },
      { prediction: gbPred, weight: 0.6 },
    ])
    
    return {
      direction: ensemblePred.direction,
      confidence: ensemblePred.confidence,
      probabilities: {
        long: ensemblePred.probs.long,
        short: ensemblePred.probs.short,
        neutral: ensemblePred.probs.neutral,
      },
      features: features,
      models: {
        knn: knnPred,
        gradientBoosting: gbPred,
      },
    }
  }
}
```

### 2.2.2. Feature Importance Analysis

```typescript
// src/lib/ml/feature-importance.ts

class FeatureImportanceAnalyzer {
  // Permutation importance
  async calculatePermutationImportance(
    model: GradientBoostingClassifier,
    data: Dataset,
    metric: Metric
  ): Promise<FeatureImportance[]> {
    const baseline = await model.evaluate(data, metric)
    const importances: FeatureImportance[] = []
    
    for (const feature of data.features) {
      const shuffled = this.shuffleFeature(data, feature)
      const score = await model.evaluate(shuffled, metric)
      
      importances.push({
        feature: feature.name,
        importance: baseline - score,
        std: this.calculateStd(feature),
      })
    }
    
    return importances.sort((a, b) => b.importance - a.importance)
  }
  
  // SHAP values (simplified)
  async calculateSHAP(
    model: GradientBoostingClassifier,
    sample: Features
  ): Promise<SHAPValues> {
    // Simplified SHAP calculation
    const baseValue = model.getBaseValue()
    const contributions: Record<string, number> = {}
    
    for (const [name, value] of Object.entries(sample)) {
      contributions[name] = model.getFeatureContribution(name, value)
    }
    
    return {
      baseValue,
      contributions,
      prediction: baseValue + Object.values(contributions).reduce((a, b) => a + b, 0),
    }
  }
}
```

### 2.2.3. Оценка времени

| Этап | Время |
|------|-------|
| Extended Classifier | 6 часов |
| Feature Engineering | 4 часа |
| Ensemble Methods | 4 часа |
| Feature Importance | 3 часа |
| UI визуализация | 3 часа |
| Тестирование | 3 часа |
| **Итого** | **23 часа** |

---

## 2.3. УЛУЧШЕНИЕ VISION (ONLINE LEARNING)

### 2.3.1. Online Learning Architecture

```typescript
// src/lib/vision-bot/online-learner.ts

interface OnlineLearningConfig {
  // Incremental learning
  bufferSize: number           // Сколько образцов накапливать перед обновлением
  learningRate: number         // Скорость адаптации
  forgettingFactor: number     // 0.95-0.99 - вес старых данных
  
  // Drift detection
  driftDetection: boolean
  driftThreshold: number       // Порог для детекции drift
  driftWindow: number          // Окно для проверки
  
  // Performance monitoring
  trackAccuracy: boolean
  retrainThreshold: number     // Если accuracy падает ниже - retrain
}

class OnlineVisionLearner {
  private model: IncrementalModel
  private buffer: TrainingBuffer
  private config: OnlineLearningConfig
  private performanceTracker: PerformanceTracker
  
  // Incremental update
  async update(newData: TrainingSample): Promise<void> {
    this.buffer.add(newData)
    
    // Проверяем, есть ли drift
    if (this.config.driftDetection) {
      const drift = await this.detectDrift()
      if (drift.detected) {
        await this.handleDrift(drift)
        return
      }
    }
    
    // Инкрементальное обучение при заполнении буфера
    if (this.buffer.size >= this.config.bufferSize) {
      await this.incrementalTrain()
    }
    
    // Мониторинг производительности
    if (this.config.trackAccuracy) {
      const accuracy = await this.performanceTracker.getRecentAccuracy()
      if (accuracy < this.config.retrainThreshold) {
        await this.fullRetrain()
      }
    }
  }
  
  // Drift detection (ADWIN)
  private async detectDrift(): Promise<DriftResult> {
    const recent = this.performanceTracker.getRecentPredictions(100)
    const historical = this.performanceTracker.getHistoricalPredictions(1000)
    
    const recentAcc = this.calculateAccuracy(recent)
    const historicalAcc = this.calculateAccuracy(historical)
    
    const drift = Math.abs(recentAcc - historicalAcc) > this.config.driftThreshold
    
    return {
      detected: drift,
      recentAccuracy: recentAcc,
      historicalAccuracy: historicalAcc,
      severity: Math.abs(recentAcc - historicalAcc),
    }
  }
  
  // Handle concept drift
  private async handleDrift(drift: DriftResult): Promise<void> {
    console.warn(`⚠️ Concept drift detected! Severity: ${drift.severity}`)
    
    if (drift.severity > 0.3) {
      // Severe drift - full retrain
      await this.fullRetrain()
    } else {
      // Mild drift - increase learning rate temporarily
      this.model.setLearningRate(this.config.learningRate * 2)
      await this.incrementalTrain()
      this.model.setLearningRate(this.config.learningRate)
    }
  }
}
```

### 2.3.2. Multi-horizon Forecasting

```typescript
// src/lib/vision-bot/multi-horizon.ts

interface MultiHorizonForecast {
  horizons: {
    '1h': ForecastResult
    '4h': ForecastResult
    '24h': ForecastResult
    '7d': ForecastResult
  }
  consensus: {
    direction: 'LONG' | 'SHORT' | 'NEUTRAL'
    confidence: number
    agreement: number  // % согласия между горизонами
  }
}

class MultiHorizonForecaster {
  private models: Map<string, ForecastModel>  // Одна модель на горизонт
  
  async forecast(symbol: string): Promise<MultiHorizonForecast> {
    const forecasts: Record<string, ForecastResult> = {}
    
    for (const horizon of ['1h', '4h', '24h', '7d']) {
      const model = this.models.get(horizon)
      forecasts[horizon] = await model.predict(symbol)
    }
    
    // Консенсус
    const consensus = this.calculateConsensus(forecasts)
    
    return { horizons: forecasts, consensus }
  }
  
  private calculateConsensus(forecasts: Record<string, ForecastResult>): Consensus {
    const directions = Object.values(forecasts).map(f => f.direction)
    const confidences = Object.values(forecasts).map(f => f.confidence)
    
    // Взвешенное голосование (ближайшие горизонты важнее)
    const weights = { '1h': 0.4, '4h': 0.3, '24h': 0.2, '7d': 0.1 }
    
    let longScore = 0, shortScore = 0, neutralScore = 0
    
    for (const [horizon, forecast] of Object.entries(forecasts)) {
      const weight = weights[horizon as keyof typeof weights]
      if (forecast.direction === 'LONG') longScore += weight * forecast.confidence
      if (forecast.direction === 'SHORT') shortScore += weight * forecast.confidence
      if (forecast.direction === 'NEUTRAL') neutralScore += weight * forecast.confidence
    }
    
    const maxScore = Math.max(longScore, shortScore, neutralScore)
    const direction = maxScore === longScore ? 'LONG' : maxScore === shortScore ? 'SHORT' : 'NEUTRAL'
    
    // Agreement = насколько согласны все горизонты
    const majorityDir = this.getMajorityDirection(directions)
    const agreement = directions.filter(d => d === majorityDir).length / directions.length
    
    return {
      direction,
      confidence: maxScore,
      agreement,
    }
  }
}
```

### 2.3.3. Оценка времени

| Этап | Время |
|------|-------|
| Online Learning Framework | 6 часов |
| Drift Detection | 4 часа |
| Multi-horizon Forecasting | 5 часов |
| UI визуализация | 3 часа |
| Тестирование | 4 часа |
| **Итого** | **22 часа** |

---

## 2.4. РАЗВИТИЕ LOGOS (АВТОНОМНАЯ ТОРГОВЛЯ)

### 2.4.1. Trading Journal System

```typescript
// src/lib/logos-bot/trading-journal.ts

interface JournalEntry {
  id: string
  timestamp: Date
  
  // Trade info
  trade: {
    symbol: string
    side: 'LONG' | 'SHORT'
    entryPrice: number
    exitPrice?: number
    size: number
    pnl?: number
    status: 'OPEN' | 'CLOSED'
  }
  
  // Context
  context: {
    marketCondition: 'trending' | 'ranging' | 'volatile'
    signalSource: string
    confidence: number
    indicators: Record<string, number>
    forecastDirection?: string
    forecastConfidence?: number
  }
  
  // Analysis
  analysis: {
    entryQuality: number      // 0-1
    exitQuality?: number      // 0-1
    executionQuality?: number // 0-1
    lessons: string[]
    mistakes: string[]
    improvements: string[]
  }
  
  // Tags
  tags: string[]  // 'good_entry', 'bad_exit', 'fomo', 'revenge_trade', etc.
}

class TradingJournal {
  private db: PrismaClient
  private aiAnalyzer: AIAnalyzer
  
  async recordEntry(trade: Trade, context: TradeContext): Promise<JournalEntry> {
    // Автоматический анализ
    const analysis = await this.analyzeTrade(trade, context)
    
    const entry: JournalEntry = {
      id: generateId(),
      timestamp: new Date(),
      trade,
      context,
      analysis,
      tags: await this.autoTag(trade, analysis),
    }
    
    await this.db.journalEntry.create({ data: entry })
    
    // Публикуем для self-learning
    await this.orchestrator.publish('JOURNAL.ENTRY', entry)
    
    return entry
  }
  
  async analyzeTrade(trade: Trade, context: TradeContext): Promise<TradeAnalysis> {
    const analysis: TradeAnalysis = {
      entryQuality: 0,
      exitQuality: 0,
      executionQuality: 0,
      lessons: [],
      mistakes: [],
      improvements: [],
    }
    
    // Entry quality: совпадал ли с трендом?
    if (context.marketCondition === 'trending' && 
        context.forecastDirection === trade.side) {
      analysis.entryQuality += 0.5
    }
    
    // Entry quality: была ли высокая уверенность?
    if (context.confidence > 0.7) {
      analysis.entryQuality += 0.3
    }
    
    // Exit quality: был ли TP/SL соблюдён?
    if (trade.status === 'CLOSED') {
      if (trade.pnl > 0) {
        analysis.exitQuality = 0.8
        analysis.lessons.push('Profitable exit')
      } else if (trade.exitReason === 'STOP_LOSS') {
        analysis.exitQuality = 0.6
        analysis.lessons.push('Risk management respected')
      } else {
        analysis.exitQuality = 0.3
        analysis.mistakes.push('Exit without plan')
      }
    }
    
    // AI analysis
    const aiInsights = await this.aiAnalyzer.analyze(entry)
    analysis.lessons.push(...aiInsights.lessons)
    analysis.mistakes.push(...aiInsights.mistakes)
    analysis.improvements.push(...aiInsights.improvements)
    
    return analysis
  }
  
  // Pattern detection in journal
  async detectPatterns(): Promise<DetectedPatterns> {
    const entries = await this.db.journalEntry.findMany({
      where: { timestamp: { gte: subDays(new Date(), 30) } }
    })
    
    const patterns: DetectedPatterns = {
      bestConditions: [],
      worstConditions: [],
      commonMistakes: [],
      improvingAreas: [],
    }
    
    // Successful trades conditions
    const winners = entries.filter(e => e.trade.pnl > 0)
    patterns.bestConditions = this.extractCommonConditions(winners)
    
    // Losing trades conditions
    const losers = entries.filter(e => e.trade.pnl < 0)
    patterns.worstConditions = this.extractCommonConditions(losers)
    
    // Common mistakes
    const allMistakes = entries.flatMap(e => e.analysis.mistakes)
    patterns.commonMistakes = this.countOccurrences(allMistakes)
    
    return patterns
  }
}
```

### 2.4.2. Autonomous Trading Engine

```typescript
// src/lib/logos-bot/autonomous-engine.ts

interface AutonomousConfig {
  enabled: boolean
  maxPositionSize: number     // Макс размер позиции
  maxPositions: number        // Макс количество позиций
  minConfidence: number       // Мин уверенность для торговли
  riskPerTrade: number        // % риска на сделку
  
  // Learning
  learnFromJournal: boolean
  adaptStrategies: boolean
  
  // Safety
  maxDailyLoss: number        // Макс дневной убыток
  maxDrawdown: number         // Макс просадка
  coolDownAfterLoss: number   // Пауза после убытка (минуты)
}

class AutonomousTradingEngine {
  private journal: TradingJournal
  private signalAggregator: SignalAggregator
  private riskManager: RiskManager
  private orchestrator: NatsOrchestrator
  private config: AutonomousConfig
  
  async evaluateAndTrade(): Promise<TradeDecision | null> {
    // 1. Агрегация сигналов от всех ботов
    const aggregated = await this.signalAggregator.aggregate()
    
    // 2. Проверка confident threshold
    if (aggregated.confidence < this.config.minConfidence) {
      return null
    }
    
    // 3. Проверка risk limits
    const riskCheck = await this.riskManager.checkLimits()
    if (!riskCheck.allowed) {
      return null
    }
    
    // 4. Проверка истории (не повторять ошибки)
    const historicalCheck = await this.checkHistoricalPerformance(aggregated)
    if (historicalCheck.skip) {
      console.log(`Skipping: ${historicalCheck.reason}`)
      return null
    }
    
    // 5. Расчёт размера позиции
    const positionSize = await this.calculatePositionSize(aggregated)
    
    // 6. Исполнение
    const decision: TradeDecision = {
      symbol: aggregated.symbol,
      side: aggregated.consensus,
      size: positionSize,
      confidence: aggregated.confidence,
      sources: aggregated.sources,
      reasoning: aggregated.reasoning,
    }
    
    // 7. Публикация для исполнения
    await this.orchestrator.publish('LOGOS.TRADE_DECISION', decision)
    
    return decision
  }
  
  private async checkHistoricalPerformance(signal: AggregatedSignal): Promise<HistoricalCheck> {
    // Проверяем похожие ситуации в журнале
    const similarTrades = await this.journal.findSimilar({
      symbol: signal.symbol,
      direction: signal.consensus,
      marketCondition: signal.marketCondition,
    })
    
    if (similarTrades.length === 0) {
      return { skip: false }
    }
    
    // Если исторически такие сделки убыточны - пропускаем
    const winRate = this.calculateWinRate(similarTrades)
    
    if (winRate < 0.4) {
      return {
        skip: true,
        reason: `Historical win rate for similar conditions: ${(winRate * 100).toFixed(1)}%`
      }
    }
    
    return { skip: false }
  }
}
```

### 2.4.3. Оценка времени

| Этап | Время |
|------|-------|
| Trading Journal System | 8 часов |
| Pattern Detection | 6 часов |
| Autonomous Engine | 8 часов |
| Safety Mechanisms | 4 часа |
| UI Dashboard | 4 часа |
| Тестирование | 4 часа |
| **Итого** | **34 часа** |

---

## 2.5. ОПТИМИЗАЦИЯ HFT/MFT/LFT

### 2.5.1. Latency Optimization

```typescript
// src/lib/hft-bot/latency-optimizer.ts

interface LatencyMetrics {
  networkLatency: number      // ms
  processingLatency: number   // ms
  totalLatency: number        // ms
  jitter: number              // ms
}

class LatencyOptimizer {
  private metrics: LatencyMetrics
  
  // WebSocket optimization
  optimizeWebSocket(ws: WebSocket): void {
    // Disable Nagle's algorithm
    ws.setNoDelay(true)
    
    // Use binary protocol
    ws.binaryType = 'arraybuffer'
    
    // Pre-allocate buffers
    this.preallocateBuffers(1024)
  }
  
  // Message parsing optimization
  createFastParser(): FastParser {
    // Use pre-compiled parsers
    return {
      parseTicker: this.compileTickerParser(),
      parseOrderbook: this.compileOrderbookParser(),
      parseTrade: this.compileTradeParser(),
    }
  }
  
  // Memory pool for zero-allocation parsing
  private bufferPool: BufferPool
  
  getBuffer(): Buffer {
    return this.bufferPool.acquire()
  }
  
  releaseBuffer(buf: Buffer): void {
    this.bufferPool.release(buf)
  }
  
  // Benchmark
  async benchmark(): Promise<LatencyMetrics> {
    const start = process.hrtime.bigint()
    
    // Simulate message processing
    await this.processTestMessage()
    
    const end = process.hrtime.bigint()
    const totalNs = Number(end - start)
    
    return {
      networkLatency: 0,  // Measured separately
      processingLatency: totalNs / 1_000_000,  // ns to ms
      totalLatency: totalNs / 1_000_000,
      jitter: 0,
    }
  }
}
```

### 2.5.2. HFT/MFT/LFT Strategy Implementations

```typescript
// HFT: Market making
class HFTMarketMaking {
  // Avellaneda-Stoikov model
  calculateOptimalQuotes(params: MMParams): Quotes {
    const { S, sigma, T, q, gamma, k } = params
    
    // Reservation price
    const r = S - q * gamma * sigma * sigma * T
    
    // Optimal spread
    const spread = gamma * sigma * sigma * T + (2 / gamma) * Math.log(1 + gamma / k)
    
    return {
      bid: r - spread / 2,
      ask: r + spread / 2,
      spread,
    }
  }
}

// MFT: VWAP execution
class MFTVWAPExecution {
  async executeVWAP(order: Order): Promise<ExecutionResult> {
    const volumeProfile = await this.getVolumeProfile(order.symbol)
    const schedule = this.createExecutionSchedule(order, volumeProfile)
    
    const executions: Execution[] = []
    
    for (const slice of schedule) {
      const exec = await this.executeSlice(slice)
      executions.push(exec)
      
      // Adaptive timing based on market conditions
      await this.adaptiveDelay(slice, exec)
    }
    
    return this.aggregateResults(executions)
  }
}

// LFT: Swing trading
class LFTSwingTrader {
  async analyzeAndTrade(symbol: string): Promise<SwingSignal | null> {
    // Daily + 4H timeframe analysis
    const daily = await this.getAnalysis(symbol, '1d')
    const h4 = await this.getAnalysis(symbol, '4h')
    
    // Trend alignment
    if (daily.trend !== h4.trend) {
      return null
    }
    
    // Support/Resistance
    const levels = await this.findKeyLevels(symbol)
    
    // Entry signal
    const entry = this.findEntrySignal(daily, h4, levels)
    
    if (entry) {
      return {
        symbol,
        direction: daily.trend,
        entry: entry.price,
        stopLoss: entry.sl,
        takeProfit: entry.tp,
        timeframe: '4h',
        holdingPeriod: '1-7 days',
      }
    }
    
    return null
  }
}
```

### 2.5.3. Оценка времени

| Этап | Время |
|------|-------|
| Latency Optimization | 6 часов |
| HFT Market Making | 8 часов |
| MFT VWAP/TWAP | 6 часов |
| LFT Swing Trading | 6 часов |
| UI для каждого | 6 часов |
| Тестирование | 6 часов |
| **Итого** | **38 часов** |

---

## 2.6. ИНТЕГРАЦИЯ LUMI (ЗАПУСК СЕРВИСА)

### 2.6.1. Fix Plan

1. **Добавить скрипт запуска в package.json**
2. **Настроить переменные окружения**
3. **Интегрировать с NATS**
4. **Добавить health check**

```json
// package.json
{
  "scripts": {
    "dev": "next dev -p 3000 2>&1 | tee dev.log",
    "lumibot": "cd lumibot-service && uvicorn main:app --host 0.0.0.0 --port 8001",
    "dev:all": "concurrently \"bun run dev\" \"bun run lumibot\""
  }
}
```

### 2.6.2. NATS Integration for Lumibot

```python
# lumibot-service/nats_publisher.py

import asyncio
import json
from nats.aio.client import Client as NATS

class NATSPublisher:
    def __init__(self, nats_url: str = "nats://localhost:4222"):
        self.nc = NATS()
        self.nats_url = nats_url
        
    async def connect(self):
        await self.nc.connect(self.nats_url)
        
    async def publish_signal(self, signal: dict):
        await self.nc.publish(
            "SIGNAL.LUMIBOT",
            json.dumps(signal).encode()
        )
        
    async def subscribe_commands(self, handler):
        await self.nc.subscribe("COMMAND.LUMIBOT", handler)
```

### 2.6.3. Оценка времени

| Этап | Время |
|------|-------|
| Startup script | 1 час |
| NATS integration | 3 часа |
| Strategy implementations | 4 часа |
| Testing | 2 часа |
| **Итого** | **10 часов** |

---

## 2.7. РАЗВИТИЕ ОРАКУЛА

### 2.7.1. Extended Commands

```typescript
// Новые команды Оракула

const EXTENDED_COMMANDS = {
  // Analytics
  'analyze BTC': 'Full market analysis for BTC',
  'correlation BTC ETH': 'Correlation analysis between assets',
  'seasonality BTC': 'Seasonal patterns for BTC',
  
  // Portfolio
  'rebalance': 'Suggest portfolio rebalancing',
  'hedge BTC': 'Hedge BTC position recommendations',
  
  // Bot management
  'optimize grid BTC': 'Run GA optimization for Grid bot',
  'backtest dca ETH 30d': 'Run backtest for DCA bot',
  
  // Risk
  'risk report': 'Full risk analysis report',
  'stress test': 'Run stress test scenarios',
  
  // Learning
  'journal summary': 'Trading journal summary',
  'lessons learned': 'AI-generated lessons from recent trades',
  'improve my trading': 'Personalized improvement suggestions',
}
```

### 2.7.2. Natural Language Processing

```typescript
// src/lib/oracle/nlp-processor.ts

class OracleNLPProcessor {
  private llm: LLMClient
  
  async processMessage(message: string): Promise<OracleResponse> {
    // 1. Intent classification
    const intent = await this.classifyIntent(message)
    
    // 2. Entity extraction
    const entities = await this.extractEntities(message)
    
    // 3. Response generation
    switch (intent) {
      case 'TRADE':
        return this.handleTradeIntent(entities)
      case 'ANALYSIS':
        return this.handleAnalysisIntent(entities)
      case 'QUESTION':
        return this.handleQuestionIntent(message)
      default:
        return this.handleUnknownIntent(message)
    }
  }
  
  private async handleQuestionIntent(message: string): Promise<OracleResponse> {
    // Use LLM for natural questions
    const context = await this.gatherContext()
    const response = await this.llm.chat({
      messages: [
        { role: 'system', content: ORACLE_SYSTEM_PROMPT },
        { role: 'user', content: `Context: ${JSON.stringify(context)}\n\nQuestion: ${message}` },
      ],
    })
    
    return {
      type: 'TEXT',
      content: response.content,
    }
  }
}
```

### 2.7.3. Оценка времени

| Этап | Время |
|------|-------|
| Extended Commands | 4 часа |
| NLP Integration | 6 часов |
| Context Gathering | 3 часа |
| UI improvements | 3 часа |
| Тестирование | 2 часа |
| **Итого** | **18 часов** |

---

## СВОДНАЯ ОЦЕНКА ВРЕМЕНИ (ЭТАП 2)

| Раздел | Время | Приоритет |
|--------|-------|-----------|
| 2.1 Генетические алгоритмы | 26 часов | P1 |
| 2.2 Классический ML | 23 часа | P1 |
| 2.3 Vision Online Learning | 22 часа | P1 |
| 2.4 Logos автономная торговля | 34 часа | P0 |
| 2.5 HFT/MFT/LFT оптимизация | 38 часов | P2 |
| 2.6 Lumi интеграция | 10 часов | P0 |
| 2.7 Развитие Оракула | 18 часов | P1 |
| **ИТОГО** | **171 час** | - |

**Календарный план (при 8ч/день): ~22 рабочих дня**

---

## ПОСЛЕДОВАТЕЛЬНОСТЬ РЕАЛИЗАЦИИ (ЭТАП 2)

```
Week 1:
├── 2.6 Lumi интеграция (критично)
├── 2.4 Logos - Trading Journal
└── 2.4 Logos - Autonomous Engine (база)

Week 2:
├── 2.1 GA Framework
├── 2.2 Extended Classifier
└── 2.7 Оракул - Extended Commands

Week 3:
├── 2.3 Vision Online Learning
├── 2.4 Logos - Pattern Detection
└── 2.7 Оракул - NLP

Week 4:
├── 2.5 HFT оптимизация
├── 2.5 MFT/LFT стратегии
└── Финальное тестирование
```

---

## ЗАВИСИМОСТИ МЕЖДУ ЭТАПАМИ 1 И 2

| Этап 2 | Зависит от Этапа 1 |
|--------|-------------------|
| 2.1 GA | 1.2 (BotClient), 1.5 (Risk) |
| 2.2 ML | 1.4 (Vision) |
| 2.3 Vision | 1.2 (Event Bus), 1.4 (Vision) |
| 2.4 Logos | 1.2, 1.3 (Oracle), 1.5 (Risk) |
| 2.5 HFT | 1.5, 1.6 (Multi-exchange) |
| 2.6 Lumi | 1.1 (NATS) |
| 2.7 Oracle | 1.3 (Oracle integration) |

---

*План Этапа 2 завершён. Требуется завершение Этапа 1 перед началом реализации.*
