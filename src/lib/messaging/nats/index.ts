/**
 * NATS Messaging Module
 * 
 * Provides event-driven messaging for CITARION platform.
 */

export * from './message-queue';
import { natsMessageQueue } from './message-queue';
export default natsMessageQueue;
