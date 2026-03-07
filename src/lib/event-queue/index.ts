/**
 * Event Queue Module
 * Contains Dead Letter Queue and related utilities
 */

export {
  DeadLetterQueue,
  getDeadLetterQueue,
  type DLQEvent,
  type DLQConfig,
} from './dead-letter-queue';

export default DeadLetterQueue;
