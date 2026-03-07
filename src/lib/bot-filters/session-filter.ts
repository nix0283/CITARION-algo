/**
 * Session Filter
 * 
 * Filters trading signals based on market sessions.
 * Implements session-aware signal filtering for improved accuracy.
 * 
 * Sessions:
 * - Sydney (Australian)
 * - Tokyo (Asian)
 * - London (European)
 * - New York (American)
 * 
 * Features:
 * - Session detection based on timestamp and timezone
 * - Session overlap detection (high liquidity periods)
 * - Session-specific volatility filtering
 * - Customizable session priorities
 * - Session statistics tracking
 * 
 * @see https://www.tradingview.com/script/Ts0sn9jl/ - Lorentzian Classification Premium
 */

// ==================== TYPE DEFINITIONS ====================

export type MarketSession = 'sydney' | 'tokyo' | 'london' | 'newyork' | 'overlap' | 'closed';

export interface SessionConfig {
  name: MarketSession;
  openHour: number;    // UTC hour when session opens
  closeHour: number;   // UTC hour when session closes
  timezone: string;   // Primary timezone for the session
  priority: number;    // Session priority (1-5, higher = better)
  minVolume: number;   // Minimum relative volume for session to be active
  description: string;
}

export interface SessionState {
  current: MarketSession;
  previous: MarketSession;
  isOpen: boolean;
  isOverlap: boolean;
  activeSessions: MarketSession[];
  transitionCount: number;
  lastTransition: number;
}

export interface SessionFilterConfig {
  enabled: boolean;
  allowOverlapsOnly: boolean;    // Only allow signals during session overlaps
  preferredSessions: MarketSession[]; // Sessions to prioritize
  blockedSessions: MarketSession[];  // Sessions to block
  minSessionDuration: number;        // Minimum minutes into session for signal
  volumeFilter: boolean;            // Apply volume-based filtering
  volumeThreshold: number;           // Minimum volume ratio for signal
}

export interface SessionStats {
  session: MarketSession;
  signalCount: number;
  winRate: number;
  avgPnL: number;
  avgConfidence: number;
  avgVolume: number;
  lastUpdated: number;
}

export interface SessionFilterResult {
  passed: boolean;
  reason: string;
  session: MarketSession;
  isOverlap: boolean;
  sessionVolume: number;
  recommendations: string[];
}

// ==================== SESSION DEFINITIONS ====================

/**
 * Standard market session definitions
 * Hours are in UTC
 */
export const SESSION_DEFINITIONS: Record<MarketSession, SessionConfig> = {
  sydney: {
    name: 'sydney',
    openHour: 22,      // 22:00 UTC (8:00 AM AEST)
    closeHour: 7,       // 07:00 UTC (17:00 AEST)
    timezone: 'Australia/Sydney',
    priority: 3,
    minVolume: 0.0,
    description: 'Australian session - Moderate liquidity'
  },
  
  tokyo: {
    name: 'tokyo',
    openHour: 0,       // 00:00 UTC (9:00 AM JST)
    closeHour: 8,       // 09:00 UTC (18:00 JST)
    timezone: 'Asia/Tokyo',
    priority: 3,
    minVolume: 0.0,
    description: 'Asian session - Focus on JPY and AUD pairs'
  },
  
  london: {
    name: 'london',
    openHour: 7,       // 07:00 UTC (8:00 AM GMT)
    closeHour: 16,      // 16:00 UTC (17:00 GMT)
    timezone: 'Europe/London',
    priority: 4,
    minVolume: 1.0,
    description: 'European session - Major forex session'
  },
  
  newyork: {
    name: 'newyork',
    openHour: 13,      // 13:00 UTC (8:00 AM EST)
    closeHour: 22,      // 22:00 UTC (17:00 EST)
    timezone: 'America/New_York',
    priority: 5,
    minVolume: 1.2,
    description: 'American session - Highest liquidity'
  }
};

/**
 * Session overlaps (high liquidity periods)
 */
export const SESSION_OVERLAPS: { sessions: MarketSession[]; description: string }[] = [
  {
    sessions: ['tokyo', 'sydney'],
    description: 'Asian/Australian overlap - Moderate liquidity'
  },
  {
    sessions: ['tokyo', 'london'],
    description: 'Asian/European overlap - Good liquidity'
  },
  {
    sessions: ['london', 'newyork'],
    description: 'European/American overlap - HIGH LIQUIDITY'
  },
  {
    sessions: ['sydney', 'tokyo', 'london'],
    description: 'Triple overlap - Excellent liquidity'
  },
  {
    sessions: ['london', 'newyork', 'tokyo'],
    description: 'Triple overlap - Extended high liquidity'
  }
];

// ==================== SESSION DETECTOR ====================

/**
 * Session Detector
 * 
 * Determines the current market session(s) based on timestamp.
 */
export class SessionDetector {
  private state: SessionState = {
    current: 'closed',
    previous: 'closed',
    isOpen: false,
    isOverlap: false,
    activeSessions: [],
    transitionCount: 0,
    lastTransition: 0
  };
  
  /**
   * Detect current session(s) from timestamp
   */
  detect(timestamp: number): SessionState {
    const date = new Date(timestamp);
    const hourUTC = date.getUTCHours();
    const minuteUTC = date.getUTCMinutes();
    const timeInHours = hourUTC + minuteUTC / 60;
    
    const activeSessions: MarketSession[] = [];
    
    // Check each session
    for (const [name, config] of Object.entries(SESSION_DEFINITIONS)) {
      if (this.isSessionActive(timeInHours, config)) {
        activeSessions.push(name);
      }
    }
    
    // Determine if there's an overlap
    const isOverlap = activeSessions.length > 1;
    
    // Determine primary session (highest priority)
    let current: MarketSession = 'closed';
    if (activeSessions.length > 0) {
      current = activeSessions.reduce((best, session) => {
        const bestPriority = SESSION_DEFINITIONS[best]?.priority ?? 0;
        const sessionPriority = SESSION_DEFINITIONS[session]?.priority ?? 0;
        return sessionPriority > bestPriority ? session : best;
      }, activeSessions[0]);
    }
    
    // Check for transition
    const isTransition = this.state.current !== current;
    const transitionCount = isTransition 
      ? this.state.transitionCount + 1 
      : this.state.transitionCount;
    
    // Update state
    this.state = {
      current,
      previous: this.state.current,
      isOpen: activeSessions.length > 0,
      isOverlap,
      activeSessions,
      transitionCount,
      lastTransition: isTransition ? timestamp : this.state.lastTransition
    };
    
    return { ...this.state };
  }
  
  /**
   * Check if a session is active at given time
   */
  private isSessionActive(timeInHours: number, config: SessionConfig): boolean {
    // Handle sessions that cross midnight
    if (config.openHour > config.closeHour) {
      // Session crosses midnight (e.g., Sydney 22:00 - 07:00)
      return timeInHours >= config.openHour || timeInHours < config.closeHour;
    } else {
      // Normal session (e.g., London 07:00 - 16:00)
      return timeInHours >= config.openHour && timeInHours < config.closeHour;
    }
  }
  
  /**
   * Get minutes into current session
   */
  getMinutesIntoSession(timestamp: number): number {
    const date = new Date(timestamp);
    const hourUTC = date.getUTCHours();
    const minuteUTC = date.getUTCMinutes();
    
    const session = this.state.current;
    if (session === 'closed') return 0;
    
    const config = SESSION_DEFINITIONS[session];
    if (!config) return 0;
    
    const timeInMinutes = hourUTC * 60 + minuteUTC;
    const openMinutes = config.openHour * 60;
    
    if (config.openHour > config.closeHour) {
      // Session crosses midnight
      if (hourUTC >= config.openHour) {
        return timeInMinutes - openMinutes;
      } else {
        // After midnight
        return (24 * 60 - openMinutes) + timeInMinutes;
      }
    } else {
      return timeInMinutes - openMinutes;
    }
  }
  
  /**
   * Get minutes remaining in current session
   */
  getMinutesRemaining(timestamp: number): number {
    const session = this.state.current;
    if (session === 'closed') return 0;
    
    const config = SESSION_DEFINITIONS[session];
    if (!config) return 0;
    
    const date = new Date(timestamp);
    const hourUTC = date.getUTCHours();
    const minuteUTC = date.getUTCMinutes();
    const timeInMinutes = hourUTC * 60 + minuteUTC;
    const closeMinutes = config.closeHour * 60;
    
    if (config.openHour > config.closeHour) {
      // Session crosses midnight
      if (hourUTC < config.closeHour) {
        return closeMinutes - timeInMinutes;
      } else {
        return (24 * 60 - timeInMinutes) + closeMinutes;
      }
    } else {
      return closeMinutes - timeInMinutes;
    }
  }
  
  /**
   * Get current state
   */
  getState(): SessionState {
    return { ...this.state };
  }
  
  /**
   * Get session config
   */
  getSessionConfig(session: MarketSession): SessionConfig | undefined {
    return SESSION_DEFINITIONS[session];
  }
  
  /**
   * Get all active sessions
   */
  getActiveSessions(): MarketSession[] {
    return [...this.state.activeSessions];
  }
  
  /**
   * Check if currently in overlap period
   */
  isInOverlap(): boolean {
    return this.state.isOverlap;
  }
}

// ==================== SESSION FILTER ====================

/**
 * Session Filter
 * 
 * Filters trading signals based on session characteristics.
 */
export class SessionFilter {
  private detector: SessionDetector;
  private config: SessionFilterConfig;
  private stats: Map<MarketSession, SessionStats> = new Map();
  
  constructor(config?: Partial<SessionFilterConfig>) {
    this.detector = new SessionDetector();
    this.config = {
      enabled: true,
      allowOverlapsOnly: false,
      preferredSessions: ['london', 'newyork'],
      blockedSessions: [],
      minSessionDuration: 5,  // 5 minutes
      volumeFilter: true,
      volumeThreshold: 0.8,
      ...config
    };
    
    // Initialize stats
    for (const session of Object.keys(SESSION_DEFINITIONS) as MarketSession[]) {
      this.stats.set(session, {
        session,
        signalCount: 0,
        winRate: 0,
        avgPnL: 0,
        avgConfidence: 0,
        avgVolume: 0,
        lastUpdated: Date.now()
      });
    }
  }
  
  /**
   * Filter a trading signal
   */
  filter(
    timestamp: number,
    volumeRatio?: number,
    signalConfidence?: number
  ): SessionFilterResult {
    if (!this.config.enabled) {
      return {
        passed: true,
        reason: 'Session filter disabled',
        session: 'closed',
        isOverlap: false,
        sessionVolume: volumeRatio ?? 1,
        recommendations: []
      };
    }
    
    // Detect current session
    const state = this.detector.detect(timestamp);
    const session = state.current;
    const isOverlap = state.isOverlap;
    
    const recommendations: string[] = [];
    let passed = true;
    let reason = 'Signal passed session filter';
    
    // Check if market is closed
    if (session === 'closed') {
      passed = false;
      reason = 'Market is closed - no active session';
      recommendations.push('Wait for market open');
      return { passed, reason, session, isOverlap, sessionVolume: 0, recommendations };
    }
    
    // Check blocked sessions
    if (this.config.blockedSessions.includes(session)) {
      passed = false;
      reason = `Session ${session} is blocked`;
      recommendations.push(`Wait for ${this.config.blockedSessions.find(s => !this.config.blockedSessions.includes(s)) ?? 'another session'}`);
    }
    
    // Check overlap-only mode
    if (this.config.allowOverlapsOnly && !isOverlap) {
      passed = false;
      reason = 'Overlap-only mode active but not in overlap period';
      recommendations.push('Wait for session overlap (London-NY overlap recommended)');
    }
    
    // Check minimum session duration
    const minutesIntoSession = this.detector.getMinutesIntoSession(timestamp);
    if (passed && minutesIntoSession < this.config.minSessionDuration) {
      passed = false;
      reason = `Session just opened (${minutesIntoSession} minutes) - waiting for ${this.config.minSessionDuration} minutes`;
      recommendations.push('Wait for session to stabilize');
    }
    
    // Check volume filter
    if (passed && this.config.volumeFilter && volumeRatio !== undefined) {
      const sessionConfig = SESSION_DEFINITIONS[session];
      const minVolume = sessionConfig?.minVolume ?? this.config.volumeThreshold;
      
      if (volumeRatio < minVolume) {
        passed = false;
        reason = `Volume too low for ${session} session (${volumeRatio.toFixed(2)} < ${minVolume})`;
        recommendations.push('Wait for higher volume');
      }
    }
    
    // Add session-specific recommendations
    if (passed) {
      if (isOverlap) {
        recommendations.push('High liquidity overlap period - ideal for trading');
      }
      
      if (this.config.preferredSessions.includes(session)) {
        recommendations.push(`Preferred session ${session} active`);
      }
      
      const minutesRemaining = this.detector.getMinutesRemaining(timestamp);
      if (minutesRemaining < 30) {
        recommendations.push(`Session closing soon (${minutesRemaining} minutes remaining)`);
      }
    }
    
    return {
      passed,
      reason,
      session,
      isOverlap,
      sessionVolume: volumeRatio ?? 1,
      recommendations
    };
  }
  
  /**
   * Record signal outcome for statistics
   */
  recordSignal(
    timestamp: number,
    session: MarketSession,
    pnl: number,
    confidence: number,
    volumeRatio: number
  ): void {
    const stats = this.stats.get(session);
    if (!stats) return;
    
    const count = stats.signalCount + 1;
    const oldWinRate = stats.winRate;
    const newWinRate = pnl > 0 
      ? (oldWinRate * stats.signalCount + 1) / count
      : (oldWinRate * stats.signalCount) / count;
    
    this.stats.set(session, {
      session,
      signalCount: count,
      winRate: newWinRate,
      avgPnL: (stats.avgPnL * stats.signalCount + pnl) / count,
      avgConfidence: (stats.avgConfidence * stats.signalCount + confidence) / count,
      avgVolume: (stats.avgVolume * stats.signalCount + volumeRatio) / count,
      lastUpdated: Date.now()
    });
  }
  
  /**
   * Get session statistics
   */
  getStats(session: MarketSession): SessionStats | undefined {
    return this.stats.get(session);
  }
  
  /**
   * Get all statistics
   */
  getAllStats(): SessionStats[] {
    return Array.from(this.stats.values());
  }
  
  /**
   * Get best sessions based on historical performance
   */
  getBestSessions(): MarketSession[] {
    const statsArray = Array.from(this.stats.values())
      .filter(s => s.signalCount > 10)
      .sort((a, b) => b.winRate - a.winRate || b.avgPnL - a.avgPnL);
    
    return statsArray.map(s => s.session);
  }
  
  /**
   * Update filter configuration
   */
  updateConfig(config: Partial<SessionFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): SessionFilterConfig {
    return { ...this.config };
  }
  
  /**
   * Get session detector
   */
  getDetector(): SessionDetector {
    return this.detector;
  }
  
  /**
   * Clear statistics
   */
  clearStats(): void {
    for (const session of this.stats.keys()) {
      this.stats.set(session, {
        session,
        signalCount: 0,
        winRate: 0,
        avgPnL: 0,
        avgConfidence: 0,
        avgVolume: 0,
        lastUpdated: Date.now()
      });
    }
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get current session name
 */
export function getCurrentSession(timestamp?: number): MarketSession {
  const detector = new SessionDetector();
  return detector.detect(timestamp ?? Date.now()).current;
}

/**
 * Check if market is open
 */
export function isMarketOpen(timestamp?: number): boolean {
  const detector = new SessionDetector();
  return detector.detect(timestamp ?? Date.now()).isOpen;
}

/**
 * Check if in overlap period
 */
export function isInOverlap(timestamp?: number): boolean {
  const detector = new SessionDetector();
  return detector.detect(timestamp ?? Date.now()).isOverlap;
}

/**
 * Get next session open time
 */
export function getNextSessionOpen(timestamp?: number): { session: MarketSession; minutesUntil: number } {
  const now = timestamp ?? Date.now();
  const date = new Date(now);
  const hourUTC = date.getUTCHours();
  const minuteUTC = date.getUTCMinutes();
  const timeInMinutes = hourUTC * 60 + minuteUTC;
  
  // Find next session to open
  let nextSession: MarketSession = 'sydney';
  let minMinutesUntil = Infinity;
  
  for (const [name, config] of Object.entries(SESSION_DEFINITIONS)) {
    const openMinutes = config.openHour * 60;
    let minutesUntil: number;
    
    if (openMinutes > timeInMinutes) {
      minutesUntil = openMinutes - timeInMinutes;
    } else {
      // Opens tomorrow
      minutesUntil = (24 * 60 - timeInMinutes) + openMinutes;
    }
    
    if (minutesUntil < minMinutesUntil) {
      minMinutesUntil = minutesUntil;
      nextSession = name;
    }
  }
  
  return { session: nextSession, minutesUntil: minMinutesUntil };
}

// ==================== SINGLETON INSTANCE ====================

let filterInstance: SessionFilter | null = null;

/**
 * Get session filter instance
 */
export function getSessionFilter(config?: Partial<SessionFilterConfig>): SessionFilter {
  if (!filterInstance) {
    filterInstance = new SessionFilter(config);
  }
  return filterInstance;
}

/**
 * Reset session filter instance
 */
export function resetSessionFilter(): void {
  filterInstance = null;
}

export default {
  SessionDetector,
  SessionFilter,
  SESSION_DEFINITIONS,
  SESSION_OVERLAPS,
  getSessionFilter,
  resetSessionFilter,
  getCurrentSession,
  isMarketOpen,
  isInOverlap,
  getNextSessionOpen
};
