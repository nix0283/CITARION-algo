/**
 * Worker Thread Pool Module
 * Offloads blocking operations to worker threads
 * Audit Fix: P1.19 - Implement Worker Thread Pool for blocking operations
 */

export interface WorkerTask<T = unknown, R = unknown> {
  id: string;
  type: string;
  data: T;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  result?: R;
  error?: string;
  retries: number;
  maxRetries: number;
}

export interface WorkerPoolConfig {
  minWorkers: number;
  maxWorkers: number;
  taskTimeout: number;
  maxRetries: number;
  idleTimeout: number;
  taskQueueSize: number;
}

const DEFAULT_CONFIG: WorkerPoolConfig = {
  minWorkers: 2,
  maxWorkers: 8,
  taskTimeout: 30000, // 30 seconds
  maxRetries: 2,
  idleTimeout: 60000, // 1 minute
  taskQueueSize: 1000,
};

export interface TaskHandler<T = unknown, R = unknown> {
  (data: T): Promise<R> | R;
}

export interface WorkerPoolMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  timeoutTasks: number;
  activeWorkers: number;
  idleWorkers: number;
  queueSize: number;
  averageExecutionTime: number;
}

interface WorkerInfo {
  id: string;
  busy: boolean;
  currentTask?: string;
  lastUsed: number;
  tasksCompleted: number;
}

/**
 * Worker Pool implementation using simulated worker threads
 * In production, this would use actual Worker threads for CPU-intensive tasks
 */
export class WorkerPool {
  private config: WorkerPoolConfig;
  private taskQueue: WorkerTask[] = [];
  private activeTasks: Map<string, WorkerTask> = new Map();
  private workers: Map<string, WorkerInfo> = new Map();
  private handlers: Map<string, TaskHandler> = new Map();
  private taskResolvers: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private metrics: WorkerPoolMetrics = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    timeoutTasks: 0,
    activeWorkers: 0,
    idleWorkers: 0,
    queueSize: 0,
    averageExecutionTime: 0,
  };
  private executionTimes: number[] = [];
  private isRunning: boolean = false;
  private processInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  /**
   * Initialize the worker pool
   */
  private initialize(): void {
    // Create minimum workers
    for (let i = 0; i < this.config.minWorkers; i++) {
      this.createWorker();
    }
    
    console.log(`[WorkerPool] Initialized with ${this.config.minWorkers} workers`);
  }

  /**
   * Start processing tasks
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Process queue periodically
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 100);

    // Cleanup idle workers
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleWorkers();
    }, 10000);

    console.log('[WorkerPool] Started processing');
  }

  /**
   * Stop processing tasks
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = undefined;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    console.log('[WorkerPool] Stopped processing');
  }

  /**
   * Create a new worker
   */
  private createWorker(): WorkerInfo {
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const worker: WorkerInfo = {
      id: workerId,
      busy: false,
      lastUsed: Date.now(),
      tasksCompleted: 0,
    };
    
    this.workers.set(workerId, worker);
    this.updateWorkerMetrics();
    
    return worker;
  }

  /**
   * Get an available worker
   */
  private getAvailableWorker(): WorkerInfo | null {
    // Find idle worker
    for (const worker of this.workers.values()) {
      if (!worker.busy) {
        return worker;
      }
    }

    // Create new worker if under max
    if (this.workers.size < this.config.maxWorkers) {
      return this.createWorker();
    }

    return null;
  }

  /**
   * Register a task handler
   */
  registerHandler<T, R>(type: string, handler: TaskHandler<T, R>): void {
    this.handlers.set(type, handler as TaskHandler);
    console.log(`[WorkerPool] Registered handler for task type: ${type}`);
  }

  /**
   * Submit a task to the pool
   */
  submit<T, R>(
    type: string,
    data: T,
    options: {
      priority?: WorkerTask['priority'];
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      // Check if handler exists
      if (!this.handlers.has(type)) {
        reject(new Error(`No handler registered for task type: ${type}`));
        return;
      }

      // Check queue size
      if (this.taskQueue.length >= this.config.taskQueueSize) {
        reject(new Error('Task queue is full'));
        return;
      }

      const taskId = this.generateTaskId();
      const task: WorkerTask<T, R> = {
        id: taskId,
        type,
        data,
        priority: options.priority || 'normal',
        timeout: options.timeout || this.config.taskTimeout,
        createdAt: Date.now(),
        status: 'pending',
        retries: 0,
        maxRetries: options.maxRetries ?? this.config.maxRetries,
      };

      this.taskQueue.push(task);
      this.resortQueue();
      this.metrics.totalTasks++;
      this.metrics.queueSize = this.taskQueue.length;

      this.taskResolvers.set(taskId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      // Try to process immediately
      if (this.isRunning) {
        this.processQueue();
      }
    });
  }

  /**
   * Process tasks from the queue
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0) {
      const worker = this.getAvailableWorker();
      if (!worker) break;

      const task = this.taskQueue.shift();
      if (!task) break;

      this.executeTask(worker, task);
    }

    this.metrics.queueSize = this.taskQueue.length;
  }

  /**
   * Execute a task on a worker
   */
  private async executeTask(worker: WorkerInfo, task: WorkerTask): Promise<void> {
    const handler = this.handlers.get(task.type);
    if (!handler) {
      this.failTask(task, 'No handler found');
      return;
    }

    worker.busy = true;
    worker.currentTask = task.id;
    task.status = 'running';
    task.startedAt = Date.now();
    this.activeTasks.set(task.id, task);

    const resolvers = this.taskResolvers.get(task.id);
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (task.status === 'running') {
        this.timeoutTask(task);
      }
    }, task.timeout);

    try {
      const result = await Promise.resolve(handler(task.data));
      
      clearTimeout(timeoutId);
      
      task.result = result;
      task.status = 'completed';
      task.completedAt = Date.now();
      
      const executionTime = task.completedAt - (task.startedAt || task.createdAt);
      this.executionTimes.push(executionTime);
      if (this.executionTimes.length > 100) {
        this.executionTimes.shift();
      }
      this.updateAverageExecutionTime();

      this.metrics.completedTasks++;
      worker.tasksCompleted++;
      worker.lastUsed = Date.now();

      if (resolvers) {
        resolvers.resolve(result);
        this.taskResolvers.delete(task.id);
      }

      console.log(`[WorkerPool] Task ${task.id} completed in ${executionTime}ms`);
    } catch (error) {
      clearTimeout(timeoutId);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (task.retries < task.maxRetries) {
        // Retry the task
        task.retries++;
        task.status = 'pending';
        this.taskQueue.push(task);
        this.resortQueue();
        console.log(`[WorkerPool] Task ${task.id} failed, retrying (${task.retries}/${task.maxRetries})`);
      } else {
        this.failTask(task, errorMessage);
      }
    } finally {
      worker.busy = false;
      worker.currentTask = undefined;
      this.activeTasks.delete(task.id);
      this.updateWorkerMetrics();
    }
  }

  /**
   * Fail a task
   */
  private failTask(task: WorkerTask, error: string): void {
    task.status = 'failed';
    task.error = error;
    task.completedAt = Date.now();
    
    this.metrics.failedTasks++;
    
    const resolvers = this.taskResolvers.get(task.id);
    if (resolvers) {
      resolvers.reject(new Error(error));
      this.taskResolvers.delete(task.id);
    }

    console.error(`[WorkerPool] Task ${task.id} failed: ${error}`);
  }

  /**
   * Timeout a task
   */
  private timeoutTask(task: WorkerTask): void {
    task.status = 'timeout';
    task.error = `Task timed out after ${task.timeout}ms`;
    task.completedAt = Date.now();
    
    this.metrics.timeoutTasks++;
    this.metrics.failedTasks++;
    
    const resolvers = this.taskResolvers.get(task.id);
    if (resolvers) {
      resolvers.reject(new Error(task.error));
      this.taskResolvers.delete(task.id);
    }

    console.error(`[WorkerPool] Task ${task.id} timed out`);

    // Free the worker
    for (const worker of this.workers.values()) {
      if (worker.currentTask === task.id) {
        worker.busy = false;
        worker.currentTask = undefined;
        this.activeTasks.delete(task.id);
        break;
      }
    }

    this.updateWorkerMetrics();
  }

  /**
   * Resort queue by priority
   */
  private resortQueue(): void {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    this.taskQueue.sort((a, b) => {
      // Critical tasks first
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Then by creation time (FIFO)
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Cleanup idle workers
   */
  private cleanupIdleWorkers(): void {
    const now = Date.now();
    const cutoff = now - this.config.idleTimeout;

    for (const [id, worker] of this.workers.entries()) {
      if (
        !worker.busy &&
        worker.lastUsed < cutoff &&
        this.workers.size > this.config.minWorkers
      ) {
        this.workers.delete(id);
        console.log(`[WorkerPool] Removed idle worker ${id}`);
      }
    }

    this.updateWorkerMetrics();
  }

  /**
   * Update worker metrics
   */
  private updateWorkerMetrics(): void {
    let active = 0;
    let idle = 0;

    for (const worker of this.workers.values()) {
      if (worker.busy) {
        active++;
      } else {
        idle++;
      }
    }

    this.metrics.activeWorkers = active;
    this.metrics.idleWorkers = idle;
  }

  /**
   * Update average execution time
   */
  private updateAverageExecutionTime(): void {
    if (this.executionTimes.length === 0) {
      this.metrics.averageExecutionTime = 0;
      return;
    }

    const sum = this.executionTimes.reduce((a, b) => a + b, 0);
    this.metrics.averageExecutionTime = sum / this.executionTimes.length;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): WorkerTask['status'] | null {
    const task = this.activeTasks.get(taskId) || 
                 this.taskQueue.find(t => t.id === taskId);
    return task?.status || null;
  }

  /**
   * Get metrics
   */
  getMetrics(): WorkerPoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.taskQueue.length;
  }

  /**
   * Generate task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    console.log('[WorkerPool] Shutting down...');
    
    this.stop();

    // Wait for active tasks to complete
    const activeCount = this.activeTasks.size;
    if (activeCount > 0) {
      console.log(`[WorkerPool] Waiting for ${activeCount} active tasks to complete...`);
      
      // Give tasks up to 5 seconds to complete
      const timeout = 5000;
      const start = Date.now();
      
      while (this.activeTasks.size > 0 && Date.now() - start < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Reject pending tasks
    for (const task of this.taskQueue) {
      const resolvers = this.taskResolvers.get(task.id);
      if (resolvers) {
        resolvers.reject(new Error('Worker pool shutting down'));
        this.taskResolvers.delete(task.id);
      }
    }

    this.taskQueue = [];
    this.workers.clear();
    this.activeTasks.clear();

    console.log('[WorkerPool] Shutdown complete. Final metrics:', this.metrics);
  }
}

// Singleton instance
let poolInstance: WorkerPool | null = null;

export function getWorkerPool(config?: Partial<WorkerPoolConfig>): WorkerPool {
  if (!poolInstance) {
    poolInstance = new WorkerPool(config);
  }
  return poolInstance;
}

// Common task types for trading platform
export const TASK_TYPES = {
  ENCRYPT_DATA: 'encrypt_data',
  DECRYPT_DATA: 'decrypt_data',
  CALCULATE_INDICATORS: 'calculate_indicators',
  PARSE_SIGNAL: 'parse_signal',
  VALIDATE_ORDER: 'validate_order',
  PROCESS_BACKTEST: 'process_backtest',
  GENERATE_REPORT: 'generate_report',
  COMPUTE_VAR: 'compute_var',
  STRESS_TEST: 'stress_test',
} as const;

export default WorkerPool;
