/**
 * Copy Trading Module
 * 
 * Модуль для копирования сделок мастер-трейдеров.
 * Включает:
 * - Profit Sharing Engine
 * - Follower Risk Manager
 * - Slippage Protection
 * - FIFO Queue for order management
 * - Fill Ratio Tracker for partial fills
 */

export * from "./profit-sharing";
export * from "./follower-risk-manager";
export * from "./slippage-protector";
export * from "./fifo-queue";
export * from "./fill-ratio-tracker";

// Re-export from exchange copy-trading
export * from "../exchange/copy-trading";
