/**
 * Double Entry Protection System
 * 
 * Prevents duplicate position entries across the entire trading system.
 * Implements multiple layers of protection:
 * 
 * 1. Signal Fingerprinting - Unique hash of signal parameters
 * 2. Symbol+Direction Lock - Prevents same symbol/direction within cooldown
 * 3. Price Zone Protection - Prevents entries within same price zone
 * 4. Time-based Deduplication - Rejects similar signals within time window
 * 5. Cross-Bot Coordination - Ensures only one bot trades per symbol
 * 
 * This is critical for preventing:
 * - Double entries from signal providers
 * - Race conditions between bots
 * - Duplicate manual entries
 * - API retry storms
 */

import * as crypto from 'crypto';

// ==================== TYPES ====================

export interface DoubleEntryConfig {
  /** Enable signal fingerprinting */
  enableFingerprinting: boolean;
  
  /** Cooldown period in seconds for same symbol+direction */
  symbolCooldownSeconds: number;
  
  /** Price zone threshold percentage (e.g., 0.5% = 0.005) */
  priceZoneThreshold: number;
  
  /** Time window for signal deduplication in seconds */
  deduplicationWindowSeconds: number;
  
  /** Enable cross-bot coordination */
  enableCrossBotCoordination: boolean;
  
  /** Maximum position entries per symbol per day */
  maxEntriesPerSymbolPerDay: number;
  
  /** Enable fuzzy matching for similar signals */
  enableFuzzyMatching: boolean;
  
  /** Fuzzy match threshold (0-1, higher = stricter) */
  fuzzyMatchThreshold: number;
}

export interface SignalFingerprint {
  /** Unique hash of signal */
  hash: string;
  
  /** Signal components that were hashed */
  components: {
    symbol: string;
    direction: string;
    entryPrices: number[];
    stopLoss?: number;
    takeProfits?: number[];
    leverage?: number;
  };
  
  /** Source of the signal */
  source: string;
  
  /** Timestamp */
  timestamp: Date;
}

export interface EntryCheckResult {
  /** Whether entry is allowed */
  allowed: boolean;
  
  /** Reason if blocked */
  reason?: string;
  
  /** Existing position if found */
  existingPosition?: {
    id: string;
    symbol: string;
    direction: string;
    entryPrice: number;
    botType?: string;
    createdAt: Date;
  };
  
  /** Similar signals found */
  similarSignals?: SignalFingerprint[];
  
  /** Warnings (entry allowed but with caution) */
  warnings?: string[];
  
  /** Cooldown remaining in seconds */
  cooldownRemaining?: number;
}

export interface PositionEntry {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  amount: number;
  leverage: number;
  source: 'SIGNAL' | 'BOT' | 'MANUAL' | 'API';
  botType?: string;
  signalHash?: string;
  createdAt: Date;
  accountId: string;
}

export interface BotLock {
  botId: string;
  botType: string;
  symbol: string;
  lockedAt: Date;
  expiresAt: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_DOUBLE_ENTRY_CONFIG: DoubleEntryConfig = {
  enableFingerprinting: true,
  symbolCooldownSeconds: 60,
  priceZoneThreshold: 0.005,
  deduplicationWindowSeconds: 300,
  enableCrossBotCoordination: true,
  maxEntriesPerSymbolPerDay: 20,
  enableFuzzyMatching: true,
  fuzzyMatchThreshold: 0.85,
};

// ==================== DOUBLE ENTRY PROTECTION CLASS ====================

export class DoubleEntryProtection {
  private config: DoubleEntryConfig;
  
  // In-memory caches (use Redis in production)
  private recentEntries: Map<string, PositionEntry[]> = new Map();
  private signalFingerprints: Map<string, SignalFingerprint[]> = new Map();
  private botLocks: Map<string, BotLock> = new Map();
  private symbolCooldowns: Map<string, Date> = new Map();
  private dailyEntryCounts: Map<string, { count: number; date: string }> = new Map();
  
  constructor(config: Partial<DoubleEntryConfig> = {}) {
    this.config = { ...DEFAULT_DOUBLE_ENTRY_CONFIG, ...config };
    
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }
  
  /**
   * Check if a position entry is allowed
   */
  checkEntry(entry: Omit<PositionEntry, 'id' | 'createdAt'>): EntryCheckResult {
    const warnings: string[] = [];
    
    // 1. Check daily entry limit
    const dailyLimitResult = this.checkDailyLimit(entry.symbol, entry.accountId);
    if (!dailyLimitResult.allowed) {
      return {
        allowed: false,
        reason: dailyLimitResult.reason,
        cooldownRemaining: dailyLimitResult.cooldownRemaining,
      };
    }
    
    // 2. Check symbol cooldown
    const cooldownResult = this.checkSymbolCooldown(entry.symbol, entry.direction);
    if (!cooldownResult.allowed) {
      return {
        allowed: false,
        reason: cooldownResult.reason,
        cooldownRemaining: cooldownResult.cooldownRemaining,
      };
    }
    
    // 3. Check for existing position in same direction
    const existingResult = this.checkExistingPosition(entry);
    if (!existingResult.allowed) {
      return {
        allowed: false,
        reason: existingResult.reason,
        existingPosition: existingResult.existingPosition,
      };
    }
    
    // 4. Check price zone overlap
    const priceZoneResult = this.checkPriceZone(entry);
    if (!priceZoneResult.allowed) {
      return {
        allowed: false,
        reason: priceZoneResult.reason,
        existingPosition: priceZoneResult.existingPosition,
      };
    }
    
    // 5. Check cross-bot coordination
    if (this.config.enableCrossBotCoordination && entry.botType) {
      const botResult = this.checkBotCoordination(entry);
      if (!botResult.allowed) {
        return {
          allowed: false,
          reason: botResult.reason,
        };
      }
    }
    
    // 6. Check signal fingerprint if provided
    if (this.config.enableFingerprinting && entry.signalHash) {
      const fingerprintResult = this.checkSignalFingerprint(entry.signalHash);
      if (!fingerprintResult.allowed) {
        return {
          allowed: false,
          reason: fingerprintResult.reason,
          similarSignals: fingerprintResult.similarSignals,
        };
      }
    }
    
    // 7. Fuzzy match check for similar signals
    if (this.config.enableFuzzyMatching) {
      const fuzzyResult = this.checkFuzzyMatch(entry);
      if (fuzzyResult.similarSignals && fuzzyResult.similarSignals.length > 0) {
        warnings.push(`Found ${fuzzyResult.similarSignals.length} similar recent signal(s)`);
      }
    }
    
    return {
      allowed: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
  
  /**
   * Register a new position entry
   */
  registerEntry(entry: PositionEntry): void {
    const key = `${entry.accountId}:${entry.symbol}:${entry.direction}`;
    const entries = this.recentEntries.get(key) || [];
    entries.push(entry);
    this.recentEntries.set(key, entries);
    
    const cooldownKey = `${entry.symbol}:${entry.direction}`;
    this.symbolCooldowns.set(cooldownKey, new Date());
    
    const dailyKey = `${entry.accountId}:${entry.symbol}`;
    const today = new Date().toISOString().split('T')[0];
    const current = this.dailyEntryCounts.get(dailyKey);
    if (current && current.date === today) {
      current.count++;
    } else {
      this.dailyEntryCounts.set(dailyKey, { count: 1, date: today });
    }
    
    if (entry.botType && this.config.enableCrossBotCoordination) {
      this.acquireBotLock(entry.botType, entry.symbol, entry.id);
    }
  }
  
  /**
   * Remove a position entry (when position is closed)
   */
  removeEntry(entryId: string, symbol: string, direction: string, accountId: string): void {
    const key = `${accountId}:${symbol}:${direction}`;
    const entries = this.recentEntries.get(key);
    if (entries) {
      const filtered = entries.filter(e => e.id !== entryId);
      if (filtered.length > 0) {
        this.recentEntries.set(key, filtered);
      } else {
        this.recentEntries.delete(key);
      }
    }
    
    const cooldownKey = `${symbol}:${direction}`;
    this.symbolCooldowns.delete(cooldownKey);
  }
  
  /**
   * Generate a signal fingerprint
   */
  generateSignalFingerprint(
    symbol: string,
    direction: string,
    entryPrices: number[],
    stopLoss?: number,
    takeProfits?: number[],
    leverage?: number,
    source: string = 'UNKNOWN'
  ): SignalFingerprint {
    const normalizedEntries = [...entryPrices].sort((a, b) => a - b);
    
    const fingerprintData = {
      symbol,
      direction,
      entryPrices: normalizedEntries,
      stopLoss: stopLoss ? Math.round(stopLoss * 100) / 100 : null,
      takeProfits: takeProfits ? [...takeProfits].sort((a, b) => a - b) : null,
      leverage: leverage || 1,
    };
    
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(fingerprintData))
      .digest('hex')
      .substring(0, 16);
    
    const fingerprint: SignalFingerprint = {
      hash,
      components: {
        symbol,
        direction,
        entryPrices: normalizedEntries,
        stopLoss,
        takeProfits,
        leverage,
      },
      source,
      timestamp: new Date(),
    };
    
    const key = `${symbol}:${direction}`;
    const fingerprints = this.signalFingerprints.get(key) || [];
    fingerprints.push(fingerprint);
    this.signalFingerprints.set(key, fingerprints);
    
    return fingerprint;
  }
  
  /**
   * Acquire bot lock for a symbol
   */
  acquireBotLock(botType: string, symbol: string, botId: string): boolean {
    const key = `${symbol}`;
    const existingLock = this.botLocks.get(key);
    
    if (existingLock) {
      if (new Date() > existingLock.expiresAt) {
        this.botLocks.set(key, {
          botId,
          botType,
          symbol,
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        return true;
      }
      return existingLock.botId === botId;
    }
    
    this.botLocks.set(key, {
      botId,
      botType,
      symbol,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return true;
  }
  
  /**
   * Release bot lock for a symbol
   */
  releaseBotLock(botId: string, symbol: string): void {
    const key = `${symbol}`;
    const existingLock = this.botLocks.get(key);
    
    if (existingLock && existingLock.botId === botId) {
      this.botLocks.delete(key);
    }
  }
  
  /**
   * Clear all locks and entries for an account
   */
  clearAccount(accountId: string): void {
    for (const [key, entries] of this.recentEntries.entries()) {
      if (key.startsWith(accountId)) {
        this.recentEntries.delete(key);
      }
    }
    
    for (const key of this.dailyEntryCounts.keys()) {
      if (key.startsWith(accountId)) {
        this.dailyEntryCounts.delete(key);
      }
    }
  }
  
  // ==================== PRIVATE METHODS ====================
  
  private checkDailyLimit(symbol: string, accountId: string): { allowed: boolean; reason?: string; cooldownRemaining?: number } {
    const dailyKey = `${accountId}:${symbol}`;
    const current = this.dailyEntryCounts.get(dailyKey);
    const today = new Date().toISOString().split('T')[0];
    
    if (current && current.date === today && current.count >= this.config.maxEntriesPerSymbolPerDay) {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const cooldownRemaining = Math.floor((midnight.getTime() - now.getTime()) / 1000);
      
      return {
        allowed: false,
        reason: `Daily entry limit reached for ${symbol} (${this.config.maxEntriesPerSymbolPerDay} entries/day)`,
        cooldownRemaining,
      };
    }
    
    return { allowed: true };
  }
  
  private checkSymbolCooldown(symbol: string, direction: string): { allowed: boolean; reason?: string; cooldownRemaining?: number } {
    const cooldownKey = `${symbol}:${direction}`;
    const lastEntry = this.symbolCooldowns.get(cooldownKey);
    
    if (lastEntry) {
      const elapsed = (Date.now() - lastEntry.getTime()) / 1000;
      if (elapsed < this.config.symbolCooldownSeconds) {
        const cooldownRemaining = Math.ceil(this.config.symbolCooldownSeconds - elapsed);
        return {
          allowed: false,
          reason: `Cooldown active for ${symbol} ${direction}`,
          cooldownRemaining,
        };
      }
    }
    
    return { allowed: true };
  }
  
  private checkExistingPosition(entry: Omit<PositionEntry, 'id' | 'createdAt'>): { allowed: boolean; reason?: string; existingPosition?: PositionEntry } {
    const key = `${entry.accountId}:${entry.symbol}:${entry.direction}`;
    const entries = this.recentEntries.get(key);
    
    if (entries && entries.length > 0) {
      const cutoff = new Date(Date.now() - this.config.deduplicationWindowSeconds * 1000);
      const activeEntries = entries.filter(e => e.createdAt > cutoff);
      
      if (activeEntries.length > 0) {
        const latest = activeEntries[activeEntries.length - 1];
        return {
          allowed: false,
          reason: `Existing position found for ${entry.symbol} ${entry.direction}`,
          existingPosition: latest,
        };
      }
    }
    
    return { allowed: true };
  }
  
  private checkPriceZone(entry: Omit<PositionEntry, 'id' | 'createdAt'>): { allowed: boolean; reason?: string; existingPosition?: PositionEntry } {
    const key = `${entry.accountId}:${entry.symbol}:${entry.direction}`;
    const entries = this.recentEntries.get(key);
    
    if (entries && entries.length > 0) {
      const threshold = entry.entryPrice * this.config.priceZoneThreshold;
      
      for (const existing of entries) {
        const priceDiff = Math.abs(existing.entryPrice - entry.entryPrice);
        if (priceDiff < threshold) {
          return {
            allowed: false,
            reason: `Entry price ${entry.entryPrice} too close to existing entry ${existing.entryPrice}`,
            existingPosition: existing,
          };
        }
      }
    }
    
    return { allowed: true };
  }
  
  private checkBotCoordination(entry: Omit<PositionEntry, 'id' | 'createdAt'>): { allowed: boolean; reason?: string } {
    const key = `${entry.symbol}`;
    const existingLock = this.botLocks.get(key);
    
    if (existingLock && existingLock.botType !== entry.botType) {
      return {
        allowed: false,
        reason: `Symbol ${entry.symbol} is locked by ${existingLock.botType} bot`,
      };
    }
    
    return { allowed: true };
  }
  
  private checkSignalFingerprint(signalHash: string): { allowed: boolean; reason?: string; similarSignals?: SignalFingerprint[] } {
    for (const [, fingerprints] of this.signalFingerprints.entries()) {
      const existing = fingerprints.find(f => f.hash === signalHash);
      if (existing) {
        return {
          allowed: false,
          reason: 'Duplicate signal detected',
          similarSignals: [existing],
        };
      }
    }
    
    return { allowed: true };
  }
  
  private checkFuzzyMatch(entry: Omit<PositionEntry, 'id' | 'createdAt'>): { similarSignals: SignalFingerprint[] } {
    const similarSignals: SignalFingerprint[] = [];
    const key = `${entry.symbol}:${entry.direction}`;
    const fingerprints = this.signalFingerprints.get(key) || [];
    
    const cutoff = new Date(Date.now() - this.config.deduplicationWindowSeconds * 1000);
    const recentFingerprints = fingerprints.filter(f => f.timestamp > cutoff);
    
    for (const fp of recentFingerprints) {
      const similarity = this.calculateSimilarity(entry, fp);
      if (similarity >= this.config.fuzzyMatchThreshold) {
        similarSignals.push(fp);
      }
    }
    
    return { similarSignals };
  }
  
  private calculateSimilarity(
    entry: Omit<PositionEntry, 'id' | 'createdAt'>,
    fingerprint: SignalFingerprint
  ): number {
    let score = 0;
    let factors = 0;
    
    if (entry.entryPrice && fingerprint.components.entryPrices.length > 0) {
      const avgFpPrice = fingerprint.components.entryPrices.reduce((a, b) => a + b, 0) / fingerprint.components.entryPrices.length;
      const priceDiff = Math.abs(entry.entryPrice - avgFpPrice) / entry.entryPrice;
      score += Math.max(0, 1 - priceDiff * 10);
      factors++;
    }
    
    if (entry.entryPrice > 0) {
      const entrySL = entry.entryPrice * 0.95;
      const fpSL = fingerprint.components.stopLoss || fingerprint.components.entryPrices[0] * 0.95;
      if (entrySL && fpSL) {
        const slDiff = Math.abs(entrySL - fpSL) / entrySL;
        score += Math.max(0, 1 - slDiff * 10);
        factors++;
      }
    }
    
    if (entry.leverage && fingerprint.components.leverage) {
      if (entry.leverage === fingerprint.components.leverage) {
        score += 1;
      } else {
        const leverageDiff = Math.abs(entry.leverage - fingerprint.components.leverage) / Math.max(entry.leverage, fingerprint.components.leverage);
        score += Math.max(0, 1 - leverageDiff);
      }
      factors++;
    }
    
    return factors > 0 ? score / factors : 0;
  }
  
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entries] of this.recentEntries.entries()) {
      const cutoff = new Date(now - 24 * 60 * 60 * 1000);
      const filtered = entries.filter(e => e.createdAt > cutoff);
      if (filtered.length === 0) {
        this.recentEntries.delete(key);
      } else {
        this.recentEntries.set(key, filtered);
      }
    }
    
    for (const [key, fingerprints] of this.signalFingerprints.entries()) {
      const cutoff = new Date(now - this.config.deduplicationWindowSeconds * 1000);
      const filtered = fingerprints.filter(f => f.timestamp > cutoff);
      if (filtered.length === 0) {
        this.signalFingerprints.delete(key);
      } else {
        this.signalFingerprints.set(key, filtered);
      }
    }
    
    for (const [key, lock] of this.botLocks.entries()) {
      if (now > lock.expiresAt.getTime()) {
        this.botLocks.delete(key);
      }
    }
    
    const today = new Date().toISOString().split('T')[0];
    for (const [key, data] of this.dailyEntryCounts.entries()) {
      if (data.date !== today) {
        this.dailyEntryCounts.delete(key);
      }
    }
  }
  
  // ==================== GETTERS ====================
  
  getConfig(): DoubleEntryConfig {
    return { ...this.config };
  }
  
  getRecentEntries(accountId: string, symbol?: string, direction?: string): PositionEntry[] {
    const result: PositionEntry[] = [];
    
    for (const [key, entries] of this.recentEntries.entries()) {
      if (key.startsWith(accountId)) {
        if (symbol && direction) {
          if (key === `${accountId}:${symbol}:${direction}`) {
            result.push(...entries);
          }
        } else {
          result.push(...entries);
        }
      }
    }
    
    return result;
  }
  
  getBotLocks(): BotLock[] {
    return Array.from(this.botLocks.values());
  }
  
  getDailyEntryCount(accountId: string, symbol: string): number {
    const key = `${accountId}:${symbol}`;
    const data = this.dailyEntryCounts.get(key);
    const today = new Date().toISOString().split('T')[0];
    
    if (data && data.date === today) {
      return data.count;
    }
    return 0;
  }
}

// ==================== SINGLETON INSTANCE ====================

let doubleEntryProtection: DoubleEntryProtection | null = null;

export function getDoubleEntryProtection(config?: Partial<DoubleEntryConfig>): DoubleEntryProtection {
  if (!doubleEntryProtection) {
    doubleEntryProtection = new DoubleEntryProtection(config);
  }
  return doubleEntryProtection;
}

export function createDoubleEntryProtection(config?: Partial<DoubleEntryConfig>): DoubleEntryProtection {
  return new DoubleEntryProtection(config);
}

// ==================== EXPORTS ====================

export default DoubleEntryProtection;
