/**
 * Signal Adapter
 * 
 * Converts trading signals to standardized format for backtesting and paper trading.
 * Based on TradingView Backtest Adapter pattern by jdehorty.
 * 
 * Signal Format:
 * - 1: Start Long Trade
 * - 2: End Long Trade
 * - -1: Start Short Trade
 * - -2: End Short Trade
 * - 0: No Signal / Neutral
 * 
 * @see https://www.tradingview.com/script/Pu38F2pB-Backtest-Adapter/
 */

// ==================== TYPE DEFINITIONS ====================

/**
 * Standardized trading signal values
 */
export enum SignalType {
  NONE = 0,
  START_LONG = 1,
  END_LONG = 2,
  START_SHORT = -1,
  END_SHORT = -2,
}

/**
 * Trading direction
 */
export type TradeDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

/**
 * Trading session definition
 */
export interface TradingSession {
  name: string;
  startHour: number;  // 0-23
  startMinute: number; // 0-59
  endHour: number;
  endMinute: number;
  timezone: string;  // e.g., 'UTC', 'America/New_York'
  daysOfWeek: number[]; // 0 = Sunday, 6 = Saturday
}

/**
 * Predefined trading sessions
 */
export const TRADING_SESSIONS: Record<string, TradingSession> = {
  ASIAN: {
    name: 'Asian Session',
    startHour: 0,
    startMinute: 0,
    endHour: 8,
    endMinute: 0,
    timezone: 'UTC',
    daysOfWeek: [1, 2, 3, 4, 5], // Monday-Friday
  },
  LONDON: {
    name: 'London Session',
    startHour: 8,
    startMinute: 0,
    endHour: 16,
    endMinute: 0,
    timezone: 'UTC',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  NEW_YORK: {
    name: 'New York Session',
    startHour: 13,
    startMinute: 0,
    endHour: 21,
    endMinute: 0,
    timezone: 'UTC',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  LONDON_NY_OVERLAP: {
    name: 'London-NY Overlap',
    startHour: 13,
    startMinute: 0,
    endHour: 16,
    endMinute: 0,
    timezone: 'UTC',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  ASIAN_LONDON_OVERLAP: {
    name: 'Asian-London Overlap',
    startHour: 7,
    startMinute: 0,
    endHour: 9,
    endMinute: 0,
    timezone: 'UTC',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  WEEKEND: {
    name: 'Weekend',
    startHour: 0,
    startMinute: 0,
    endHour: 23,
    endMinute: 59,
    timezone: 'UTC',
    daysOfWeek: [0, 6], // Sunday, Saturday
  },
  ALWAYS: {
    name: 'Always Active',
    startHour: 0,
    startMinute: 0,
    endHour: 23,
    endMinute: 59,
    timezone: 'UTC',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
};

/**
 * Signal metadata for enhanced tracking
 */
export interface SignalMetadata {
  timestamp: number;
  price: number;
  confidence?: number;
  probability?: number;
  source: string;  // Strategy/indicator name
  timeframe: string;
  symbol: string;
  features?: Record<string, number>;
  filters?: {
    passed: boolean;
    reasons: string[];
  };
}

/**
 * Complete signal with all information
 */
export interface Signal {
  type: SignalType;
  direction: TradeDirection;
  action: 'ENTER' | 'EXIT' | 'NONE';
  metadata: SignalMetadata;
}

/**
 * Signal adapter configuration
 */
export interface SignalAdapterConfig {
  /** Enable date filtering */
  useDateFilter: boolean;
  /** Start date for backtest/paper trading */
  startDate?: Date;
  /** End date for backtest */
  endDate?: Date;
  /** Trading sessions to filter signals */
  sessions: TradingSession[];
  /** Whether to only trade during specified sessions */
  useSessionFilter: boolean;
  /** Require session overlap for signals */
  requireOverlap: boolean;
  /** Minimum confidence threshold (0-1) */
  minConfidence: number;
  /** Minimum probability threshold (0-1) */
  minProbability: number;
  /** Cooldown period between signals (ms) */
  cooldownPeriod: number;
  /** Maximum positions per direction */
  maxPositions: number;
}

/**
 * Position state for tracking
 */
export interface PositionState {
  direction: TradeDirection;
  size: number;
  entryPrice: number;
  entryTime: number;
  unrealizedPnl: number;
}

// ==================== SIGNAL CONVERTER ====================

/**
 * Convert raw signal value to SignalType
 */
export function parseSignalType(value: number): SignalType {
  if (value >= 0.5) return SignalType.START_LONG;
  if (value <= -0.5 && value > -1.5) return SignalType.START_SHORT;
  if (value >= 1.5) return SignalType.END_LONG;
  if (value <= -1.5) return SignalType.END_SHORT;
  return SignalType.NONE;
}

/**
 * Convert SignalType to direction
 */
export function signalToDirection(signal: SignalType): TradeDirection {
  if (signal === SignalType.START_LONG) return 'LONG';
  if (signal === SignalType.START_SHORT) return 'SHORT';
  return 'NEUTRAL';
}

/**
 * Convert SignalType to action
 */
export function signalToAction(signal: SignalType): 'ENTER' | 'EXIT' | 'NONE' {
  if (signal === SignalType.START_LONG || signal === SignalType.START_SHORT) {
    return 'ENTER';
  }
  if (signal === SignalType.END_LONG || signal === SignalType.END_SHORT) {
    return 'EXIT';
  }
  return 'NONE';
}

/**
 * Convert direction and action to SignalType
 */
export function toSignalType(direction: TradeDirection, action: 'ENTER' | 'EXIT'): SignalType {
  if (direction === 'LONG' && action === 'ENTER') return SignalType.START_LONG;
  if (direction === 'LONG' && action === 'EXIT') return SignalType.END_LONG;
  if (direction === 'SHORT' && action === 'ENTER') return SignalType.START_SHORT;
  if (direction === 'SHORT' && action === 'EXIT') return SignalType.END_SHORT;
  return SignalType.NONE;
}

// ==================== SESSION FILTER ====================

/**
 * Check if a timestamp falls within a trading session
 */
export function isInSession(timestamp: number, session: TradingSession): boolean {
  const date = new Date(timestamp);
  
  // Check day of week
  const dayOfWeek = date.getUTCDay();
  if (!session.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }
  
  // Check time
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const currentTime = hours * 60 + minutes;
  const sessionStart = session.startHour * 60 + session.startMinute;
  const sessionEnd = session.endHour * 60 + session.endMinute;
  
  // Handle overnight sessions
  if (sessionStart <= sessionEnd) {
    return currentTime >= sessionStart && currentTime < sessionEnd;
  } else {
    // Session crosses midnight
    return currentTime >= sessionStart || currentTime < sessionEnd;
  }
}

/**
 * Get active sessions for a timestamp
 */
export function getActiveSessions(timestamp: number, sessions: TradingSession[]): TradingSession[] {
  return sessions.filter(session => isInSession(timestamp, session));
}

/**
 * Check if multiple sessions overlap at given time
 */
export function isSessionOverlap(timestamp: number, sessions: TradingSession[]): boolean {
  return getActiveSessions(timestamp, sessions).length > 1;
}

// ==================== SIGNAL ADAPTER ====================

/**
 * Signal Adapter
 * 
 * Converts trading signals to standardized format with filtering and validation.
 * Compatible with Backtest Adapter pattern for seamless integration.
 */
export class SignalAdapter {
  private config: SignalAdapterConfig;
  private positionState: PositionState | null = null;
  private lastSignalTime: number = 0;
  private signalHistory: Signal[] = [];

  constructor(config?: Partial<SignalAdapterConfig>) {
    this.config = {
      useDateFilter: false,
      sessions: [TRADING_SESSIONS.ALWAYS],
      useSessionFilter: false,
      requireOverlap: false,
      minConfidence: 0.5,
      minProbability: 0.5,
      cooldownPeriod: 60000, // 1 minute
      maxPositions: 1,
      ...config,
    };
  }

  /**
   * Check if trading is allowed at given timestamp
   */
  canTrade(timestamp: number): { allowed: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Date filter
    if (this.config.useDateFilter) {
      if (this.config.startDate && timestamp < this.config.startDate.getTime()) {
        reasons.push(`Before start date: ${this.config.startDate.toISOString()}`);
      }
      if (this.config.endDate && timestamp > this.config.endDate.getTime()) {
        reasons.push(`After end date: ${this.config.endDate.toISOString()}`);
      }
    }

    // Session filter
    if (this.config.useSessionFilter && this.config.sessions.length > 0) {
      const activeSessions = getActiveSessions(timestamp, this.config.sessions);
      
      if (activeSessions.length === 0) {
        reasons.push('Outside trading session');
      } else if (this.config.requireOverlap && activeSessions.length < 2) {
        reasons.push('No session overlap');
      }
    }

    // Cooldown
    if (timestamp - this.lastSignalTime < this.config.cooldownPeriod) {
      reasons.push(`In cooldown period (${Math.ceil((this.config.cooldownPeriod - (timestamp - this.lastSignalTime)) / 1000)}s remaining)`);
    }

    return {
      allowed: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Validate signal against current position state
   */
  validateSignal(signal: SignalType, timestamp: number): { valid: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check if we have a position
    const hasLongPosition = this.positionState?.direction === 'LONG';
    const hasShortPosition = this.positionState?.direction === 'SHORT';
    const hasPosition = hasLongPosition || hasShortPosition;

    // Validate based on signal type and current position
    switch (signal) {
      case SignalType.START_LONG:
        if (hasLongPosition) {
          reasons.push('Already in LONG position');
        }
        if (hasShortPosition) {
          reasons.push('In SHORT position - close first or use reverse signal');
        }
        break;

      case SignalType.START_SHORT:
        if (hasShortPosition) {
          reasons.push('Already in SHORT position');
        }
        if (hasLongPosition) {
          reasons.push('In LONG position - close first or use reverse signal');
        }
        break;

      case SignalType.END_LONG:
        if (!hasLongPosition) {
          reasons.push('No LONG position to close');
        }
        break;

      case SignalType.END_SHORT:
        if (!hasShortPosition) {
          reasons.push('No SHORT position to close');
        }
        break;

      case SignalType.NONE:
        // Always valid
        break;
    }

    return {
      valid: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Process a raw signal and return processed signal
   */
  processSignal(
    rawSignal: number,
    metadata: SignalMetadata
  ): Signal {
    const signalType = parseSignalType(rawSignal);
    const direction = signalToDirection(signalType);
    const action = signalToAction(signalType);

    const signal: Signal = {
      type: signalType,
      direction,
      action,
      metadata: {
        ...metadata,
        filters: {
          passed: false,
          reasons: [],
        },
      },
    };

    // Check trading permissions
    const tradeCheck = this.canTrade(metadata.timestamp);
    signal.metadata.filters!.reasons.push(...tradeCheck.reasons);

    // Validate against position state
    const validation = this.validateSignal(signalType, metadata.timestamp);
    signal.metadata.filters!.reasons.push(...validation.reasons);

    // Check confidence threshold
    if (metadata.confidence !== undefined && metadata.confidence < this.config.minConfidence) {
      signal.metadata.filters!.reasons.push(
        `Confidence ${metadata.confidence.toFixed(2)} below threshold ${this.config.minConfidence}`
      );
    }

    // Check probability threshold
    if (metadata.probability !== undefined && metadata.probability < this.config.minProbability) {
      signal.metadata.filters!.reasons.push(
        `Probability ${metadata.probability.toFixed(2)} below threshold ${this.config.minProbability}`
      );
    }

    // Final pass/fail
    signal.metadata.filters!.passed = signal.metadata.filters!.reasons.length === 0;

    // Store in history
    this.signalHistory.push(signal);
    if (signal.metadata.filters!.passed) {
      this.lastSignalTime = metadata.timestamp;
      this.updatePositionState(signal);
    }

    return signal;
  }

  /**
   * Update internal position state based on signal
   */
  private updatePositionState(signal: Signal): void {
    switch (signal.type) {
      case SignalType.START_LONG:
      case SignalType.START_SHORT:
        this.positionState = {
          direction: signal.direction,
          size: 1, // Default size
          entryPrice: signal.metadata.price,
          entryTime: signal.metadata.timestamp,
          unrealizedPnl: 0,
        };
        break;

      case SignalType.END_LONG:
      case SignalType.END_SHORT:
        this.positionState = null;
        break;
    }
  }

  /**
   * Get current position state
   */
  getPositionState(): PositionState | null {
    return this.positionState;
  }

  /**
   * Update position state externally (e.g., from exchange)
   */
  setPositionState(state: PositionState | null): void {
    this.positionState = state;
  }

  /**
   * Get signal history
   */
  getSignalHistory(limit?: number): Signal[] {
    if (limit) {
      return this.signalHistory.slice(-limit);
    }
    return [...this.signalHistory];
  }

  /**
   * Get configuration
   */
  getConfig(): SignalAdapterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SignalAdapterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset adapter state
   */
  reset(): void {
    this.positionState = null;
    this.lastSignalTime = 0;
    this.signalHistory = [];
  }

  /**
   * Export state for persistence
   */
  exportState(): {
    positionState: PositionState | null;
    lastSignalTime: number;
    signalCount: number;
  } {
    return {
      positionState: this.positionState,
      lastSignalTime: this.lastSignalTime,
      signalCount: this.signalHistory.length,
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    positionState: PositionState | null;
    lastSignalTime: number;
  }): void {
    this.positionState = state.positionState;
    this.lastSignalTime = state.lastSignalTime;
  }
}

// ==================== SIGNAL GENERATOR ====================

/**
 * Create signals from ML Classifier results
 */
export function createSignalFromClassifierResult(
  result: {
    direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    probability: number;
    confidence: number;
    features: Record<string, number>;
  },
  metadata: Omit<SignalMetadata, 'confidence' | 'probability' | 'features'>
): number {
  // If neutral, return no signal
  if (result.direction === 'NEUTRAL') {
    return SignalType.NONE;
  }

  // Use probability and confidence to determine signal strength
  const strength = result.probability * result.confidence;

  // If strength is too low, no signal
  if (strength < 0.3) {
    return SignalType.NONE;
  }

  // Return entry signal with strength encoded
  if (result.direction === 'LONG') {
    return SignalType.START_LONG;
  } else {
    return SignalType.START_SHORT;
  }
}

/**
 * Create exit signal based on position and market conditions
 */
export function createExitSignal(
  currentPosition: 'LONG' | 'SHORT',
  exitConditions: {
    takeProfit?: boolean;
    stopLoss?: boolean;
    trailingStop?: boolean;
    signalReversal?: boolean;
    timeout?: boolean;
  }
): SignalType {
  if (currentPosition === 'LONG') {
    return SignalType.END_LONG;
  } else if (currentPosition === 'SHORT') {
    return SignalType.END_SHORT;
  }
  return SignalType.NONE;
}

// ==================== SINGLETON INSTANCE ====================

let adapterInstance: SignalAdapter | null = null;

/**
 * Get Signal Adapter instance (singleton factory)
 */
export function getSignalAdapter(config?: Partial<SignalAdapterConfig>): SignalAdapter {
  if (!adapterInstance) {
    adapterInstance = new SignalAdapter(config);
  } else if (config) {
    adapterInstance.setConfig(config);
  }
  return adapterInstance;
}

/**
 * Reset the singleton instance
 */
export function resetSignalAdapter(): void {
  adapterInstance = null;
}

// Named export for all functions
const signalAdapterModule = {
  // Enums
  SignalType,
  
  // Constants
  TRADING_SESSIONS,
  
  // Converter functions
  parseSignalType,
  signalToDirection,
  signalToAction,
  toSignalType,
  
  // Session functions
  isInSession,
  getActiveSessions,
  isSessionOverlap,
  
  // Classes
  SignalAdapter,
  
  // Factory functions
  createSignalFromClassifierResult,
  createExitSignal,
  getSignalAdapter,
  resetSignalAdapter,
};

export default signalAdapterModule;
