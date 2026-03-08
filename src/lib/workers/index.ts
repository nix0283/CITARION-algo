/**
 * Workers Module
 * Contains Worker Pool and related utilities for offloading blocking operations
 */

export {
  WorkerPool,
  getWorkerPool,
  TASK_TYPES,
  type WorkerTask,
  type WorkerPoolConfig,
  type WorkerPoolMetrics,
  type TaskHandler,
} from './worker-pool';

export default WorkerPool;
