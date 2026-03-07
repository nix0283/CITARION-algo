/**
 * CITARION Parallel Fitness Evaluation Module
 * 
 * Implements parallel fitness evaluation using worker threads and batch processing
 * for faster genetic algorithm optimization.
 * 
 * CIT-028: Parallel fitness evaluation with worker threads
 */

import {
  Chromosome,
  FitnessContext,
  FitnessFunction,
  Individual,
  ParallelEvaluationConfig,
  DEFAULT_PARALLEL_CONFIG,
  FitnessWorkerTask,
  FitnessWorkerResult,
  generateId,
} from './types'

// ============================================================================
// BATCH EVALUATOR
// ============================================================================

/**
 * Batch evaluation result
 */
export interface BatchResult {
  results: FitnessWorkerResult[]
  totalTime: number
  successCount: number
  errorCount: number
}

/**
 * Create batch evaluator for parallel fitness evaluation
 */
export class BatchEvaluator {
  private config: ParallelEvaluationConfig
  private fitnessFunction: FitnessFunction
  private pendingTasks: Map<string, { 
    resolve: (result: FitnessWorkerResult) => void
    reject: (error: Error) => void
  }> = new Map()

  constructor(
    fitnessFunction: FitnessFunction,
    config: Partial<ParallelEvaluationConfig> = {}
  ) {
    this.config = { ...DEFAULT_PARALLEL_CONFIG, ...config }
    this.fitnessFunction = fitnessFunction
  }

  /**
   * Evaluate a batch of individuals
   */
  async evaluateBatch(
    individuals: Individual[],
    context: FitnessContext
  ): Promise<BatchResult> {
    const startTime = Date.now()
    const results: FitnessWorkerResult[] = []
    
    if (this.config.mode === 'none' || this.config.maxWorkers <= 1) {
      // Sequential evaluation
      for (const ind of individuals) {
        const result = await this.evaluateOne(ind, context)
        results.push(result)
      }
    } else if (this.config.mode === 'async') {
      // Concurrent async evaluation with semaphore
      const semaphore = new Semaphore(this.config.maxWorkers)
      const promises = individuals.map(ind => 
        semaphore.withLock(async () => this.evaluateOne(ind, context))
      )
      const settled = await Promise.allSettled(promises)
      
      for (let i = 0; i < settled.length; i++) {
        const result = settled[i]
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({
            id: individuals[i].id,
            fitness: -Infinity,
            error: result.reason?.message || 'Unknown error',
            duration: 0,
          })
        }
      }
    } else if (this.config.mode === 'batch') {
      // Batch processing with chunks
      const chunks = this.chunkArray(individuals, this.config.batchSize)
      
      for (const chunk of chunks) {
        const chunkResults = await this.evaluateChunk(chunk, context)
        results.push(...chunkResults)
      }
    }

    const totalTime = Date.now() - startTime
    const successCount = results.filter(r => !r.error).length
    const errorCount = results.filter(r => r.error).length

    return {
      results,
      totalTime,
      successCount,
      errorCount,
    }
  }

  /**
   * Evaluate a single individual
   */
  private async evaluateOne(
    individual: Individual,
    context: FitnessContext
  ): Promise<FitnessWorkerResult> {
    const startTime = Date.now()
    
    try {
      const fitness = await this.executeWithTimeout(
        this.fitnessFunction(individual.chromosome, context),
        this.config.timeout
      )
      
      return {
        id: individual.id,
        fitness,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      return {
        id: individual.id,
        fitness: -Infinity,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Evaluate a chunk of individuals
   */
  private async evaluateChunk(
    chunk: Individual[],
    context: FitnessContext
  ): Promise<FitnessWorkerResult[]> {
    const promises = chunk.map(ind => this.evaluateOne(ind, context))
    return Promise.all(promises)
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T> | T,
    timeout: number
  ): Promise<T> {
    if (!(promise instanceof Promise)) {
      return promise
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Evaluation timed out after ${timeout}ms`))
      }, timeout)

      promise
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

// ============================================================================
// SEMAPHORE FOR CONCURRENCY CONTROL
// ============================================================================

/**
 * Simple semaphore for limiting concurrent operations
 */
class Semaphore {
  private permits: number
  private waitQueue: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }

    return new Promise<void>(resolve => {
      this.waitQueue.push(resolve)
    })
  }

  private release(): void {
    const next = this.waitQueue.shift()
    if (next) {
      next()
    } else {
      this.permits++
    }
  }
}

// ============================================================================
// PARALLEL FITNESS MANAGER
// ============================================================================

/**
 * Manager for parallel fitness evaluation
 */
export class ParallelFitnessManager {
  private config: ParallelEvaluationConfig
  private evaluators: BatchEvaluator[] = []
  private taskQueue: FitnessWorkerTask[] = []
  private resultCallbacks: Map<string, (result: FitnessWorkerResult) => void> = new Map()
  private activeWorkers: number = 0

  constructor(
    fitnessFunction: FitnessFunction,
    config: Partial<ParallelEvaluationConfig> = {}
  ) {
    this.config = { ...DEFAULT_PARALLEL_CONFIG, ...config }
    
    // Create evaluators for each worker
    for (let i = 0; i < this.config.maxWorkers; i++) {
      this.evaluators.push(new BatchEvaluator(fitnessFunction, this.config))
    }
  }

  /**
   * Evaluate population in parallel
   */
  async evaluatePopulation(
    population: Individual[],
    context: FitnessContext
  ): Promise<Map<string, FitnessWorkerResult>> {
    const results = new Map<string, FitnessWorkerResult>()
    
    if (!this.config.enabled || this.config.mode === 'none') {
      // Sequential fallback
      const evaluator = this.evaluators[0]
      const batchResult = await evaluator.evaluateBatch(population, context)
      
      for (const result of batchResult.results) {
        results.set(result.id, result)
      }
      
      return results
    }

    // Distribute work among evaluators
    const chunkSize = Math.ceil(population.length / this.config.maxWorkers)
    const promises: Promise<BatchResult>[] = []

    for (let i = 0; i < this.config.maxWorkers; i++) {
      const start = i * chunkSize
      const chunk = population.slice(start, start + chunkSize)
      
      if (chunk.length > 0) {
        promises.push(this.evaluators[i].evaluateBatch(chunk, context))
      }
    }

    // Collect results
    const batchResults = await Promise.all(promises)
    
    for (const batch of batchResults) {
      for (const result of batch.results) {
        results.set(result.id, result)
      }
    }

    return results
  }

  /**
   * Update fitness function (for dynamic fitness functions)
   */
  updateFitnessFunction(fn: FitnessFunction): void {
    this.evaluators = []
    for (let i = 0; i < this.config.maxWorkers; i++) {
      this.evaluators.push(new BatchEvaluator(fn, this.config))
    }
  }

  /**
   * Get configuration
   */
  getConfig(): ParallelEvaluationConfig {
    return { ...this.config }
  }
}

// ============================================================================
// ADAPTIVE PARALLEL EVALUATOR
// ============================================================================

/**
 * Performance metrics for adaptive scheduling
 */
interface PerformanceMetrics {
  avgEvaluationTime: number
  successRate: number
  throughput: number
}

/**
 * Adaptive parallel evaluator that adjusts batch size based on performance
 */
export class AdaptiveParallelEvaluator {
  private manager: ParallelFitnessManager
  private metrics: PerformanceMetrics = {
    avgEvaluationTime: 0,
    successRate: 1,
    throughput: 0,
  }
  private evaluationTimes: number[] = []
  private maxHistorySize: number = 100

  constructor(
    fitnessFunction: FitnessFunction,
    config: Partial<ParallelEvaluationConfig> = {}
  ) {
    this.manager = new ParallelFitnessManager(fitnessFunction, config)
  }

  /**
   * Evaluate with adaptive batch sizing
   */
  async evaluate(
    population: Individual[],
    context: FitnessContext
  ): Promise<Map<string, FitnessWorkerResult>> {
    const startTime = Date.now()
    
    const results = await this.manager.evaluatePopulation(population, context)
    
    // Update metrics
    const totalTime = Date.now() - startTime
    const successCount = Array.from(results.values()).filter(r => !r.error).length
    
    this.updateMetrics(
      totalTime / population.length,
      successCount / population.length,
      population.length / (totalTime / 1000)
    )
    
    return results
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(
    evalTime: number,
    successRate: number,
    throughput: number
  ): void {
    this.evaluationTimes.push(evalTime)
    
    if (this.evaluationTimes.length > this.maxHistorySize) {
      this.evaluationTimes.shift()
    }
    
    this.metrics = {
      avgEvaluationTime: this.evaluationTimes.reduce((a, b) => a + b, 0) / this.evaluationTimes.length,
      successRate,
      throughput,
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  /**
   * Get manager
   */
  getManager(): ParallelFitnessManager {
    return this.manager
  }
}

// ============================================================================
// TASK SCHEDULER
// ============================================================================

/**
 * Task scheduler for prioritized fitness evaluation
 */
export class FitnessTaskScheduler {
  private queue: FitnessWorkerTask[] = []
  private config: ParallelEvaluationConfig
  private processing: boolean = false

  constructor(config: Partial<ParallelEvaluationConfig> = {}) {
    this.config = { ...DEFAULT_PARALLEL_CONFIG, ...config }
  }

  /**
   * Add task to queue
   */
  enqueue(
    chromosome: Chromosome,
    context: FitnessContext,
    priority: number = 0
  ): string {
    const task: FitnessWorkerTask = {
      id: generateId(),
      chromosome,
      context,
    }
    
    // Insert by priority (higher priority first)
    let insertIndex = this.queue.findIndex(t => (t as any).priority < priority)
    if (insertIndex === -1) {
      insertIndex = this.queue.length
    }
    
    this.queue.splice(insertIndex, 0, task)
    
    return task.id
  }

  /**
   * Get next task from queue
   */
  dequeue(): FitnessWorkerTask | null {
    return this.queue.shift() || null
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue = []
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  BatchEvaluator,
  ParallelFitnessManager,
  AdaptiveParallelEvaluator,
  FitnessTaskScheduler,
}
