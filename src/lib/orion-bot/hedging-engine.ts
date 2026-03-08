/**
 * ORION Hedging State Machine
 *
 * Manages position hedging in Hedging Mode.
 *
 * Hedging Mode allows:
 * - Simultaneous LONG and SHORT positions on same symbol
 * - Net exposure calculation
 * - Auto-hedge when correlation threshold exceeded
 *
 * State Machine:
 * ┌─────────────┐
 * │  UNHEDGED   │ ← Initial state
 * └──────┬──────┘
 *        │ Open opposite position
 *        ▼
 * ┌─────────────┐
 * │  PARTIAL    │ ← Partial hedge
 * └──────┬──────┘
 *        │ Full coverage
 *        ▼
 * ┌─────────────┐
 * │   FULL      │ ← Full hedge (net ~ 0)
 * └─────────────┘
 */

import type {
  OrionPosition,
  PositionSide,
  HedgeInfo,
  TrendSignal,
} from './types';

// =============================================================================
// HEDGE STATE
// =============================================================================

export type HedgeState = 'UNHEDGED' | 'PARTIAL' | 'FULL';

export interface HedgePair {
  longPosition: OrionPosition | null;
  shortPosition: OrionPosition | null;
  netExposure: number;
  hedgeRatio: number; // 0 = unhedged, 1 = fully hedged
  state: HedgeState;
}

// =============================================================================
// HEDGING ENGINE
// =============================================================================

export class HedgingEngine {
  private hedgePairs: Map<string, HedgePair> = new Map();
  private autoHedgeCorrelation: number;

  constructor(autoHedgeCorrelation: number = 0.7) {
    this.autoHedgeCorrelation = autoHedgeCorrelation;
  }

  /**
   * Register or update a position in the hedge engine
   */
  public registerPosition(position: OrionPosition): HedgePair {
    const key = `${position.exchange}:${position.symbol}`;

    let pair = this.hedgePairs.get(key) || this.createEmptyPair();

    if (position.side === 'LONG') {
      pair.longPosition = position;
    } else {
      pair.shortPosition = position;
    }

    // Recalculate pair metrics
    pair = this.recalculatePair(pair);

    this.hedgePairs.set(key, pair);
    return pair;
  }

  /**
   * Remove a position from the hedge engine
   */
  public removePosition(position: OrionPosition): HedgePair | null {
    const key = `${position.exchange}:${position.symbol}`;
    const pair = this.hedgePairs.get(key);

    if (!pair) return null;

    if (position.side === 'LONG') {
      pair.longPosition = null;
    } else {
      pair.shortPosition = null;
    }

    // Recalculate after removal
    const updatedPair = this.recalculatePair(pair);

    // If both positions are gone, remove the pair
    if (!updatedPair.longPosition && !updatedPair.shortPosition) {
      this.hedgePairs.delete(key);
      return null;
    }

    this.hedgePairs.set(key, updatedPair);
    return updatedPair;
  }

  /**
   * Get hedge pair for a symbol
   */
  public getHedgePair(exchange: string, symbol: string): HedgePair | null {
    return this.hedgePairs.get(`${exchange}:${symbol}`) || null;
  }

  /**
   * Check if opening a new position would create a hedge
   */
  public checkHedgeScenario(
    signal: TrendSignal,
    existingPositions: OrionPosition[]
  ): {
    wouldHedge: boolean;
    hedgeType: 'NEW' | 'PARTIAL' | 'FULL';
    existingPosition: OrionPosition | null;
    netExposureAfter: number;
  } {
    const relevantPositions = existingPositions.filter(
      p => p.exchange === signal.exchange && p.symbol === signal.symbol
    );

    const oppositeSide: PositionSide = signal.direction === 'LONG' ? 'SHORT' : 'LONG';
    const existingOpposite = relevantPositions.find(p => p.side === oppositeSide) || null;

    if (!existingOpposite) {
      return {
        wouldHedge: false,
        hedgeType: 'NEW',
        existingPosition: null,
        netExposureAfter: 0,
      };
    }

    // Calculate what net exposure would be
    const currentNet = this.calculateNetExposure(
      existingOpposite.side === 'LONG' ? existingOpposite : null,
      existingOpposite.side === 'SHORT' ? existingOpposite : null
    );

    const netExposureAfter = signal.direction === 'LONG'
      ? currentNet + 0 // Would add to long
      : currentNet - 0; // Would add to short

    const hedgeRatio = this.calculateHedgeRatio(
      existingOpposite.side === 'LONG' ? existingOpposite : null,
      existingOpposite.side === 'SHORT' ? existingOpposite : null
    );

    return {
      wouldHedge: true,
      hedgeType: hedgeRatio > 0 ? 'PARTIAL' : 'FULL',
      existingPosition: existingOpposite,
      netExposureAfter,
    };
  }

  /**
   * Calculate net exposure for a pair
   */
  public calculateNetExposure(
    longPosition: OrionPosition | null,
    shortPosition: OrionPosition | null
  ): number {
    const longValue = longPosition?.value || 0;
    const shortValue = shortPosition?.value || 0;

    return longValue - shortValue;
  }

  /**
   * Calculate hedge ratio (0-1)
   * 0 = unhedged, 1 = fully hedged
   */
  public calculateHedgeRatio(
    longPosition: OrionPosition | null,
    shortPosition: OrionPosition | null
  ): number {
    if (!longPosition && !shortPosition) return 0;

    const longValue = longPosition?.value || 0;
    const shortValue = shortPosition?.value || 0;

    if (longValue === 0 || shortValue === 0) return 0;

    const totalValue = longValue + shortValue;
    const netValue = Math.abs(longValue - shortValue);

    return 1 - (netValue / totalValue);
  }

  /**
   * Determine hedge state
   */
  public determineHedgeState(hedgeRatio: number): HedgeState {
    if (hedgeRatio === 0) return 'UNHEDGED';
    if (hedgeRatio >= 0.95) return 'FULL';
    return 'PARTIAL';
  }

  /**
   * Get hedge info for a position
   */
  public getHedgeInfo(position: OrionPosition): HedgeInfo {
    const pair = this.getHedgePair(position.exchange, position.symbol);

    if (!pair) {
      return {
        netExposure: position.value * (position.side === 'LONG' ? 1 : -1),
        hedgeStatus: 'unhedged',
      };
    }

    const pairedPositionId = position.side === 'LONG'
      ? pair.shortPosition?.id
      : pair.longPosition?.id;

    return {
      pairedPositionId,
      netExposure: pair.netExposure,
      hedgeStatus: pair.state.toLowerCase() as 'unhedged' | 'partial' | 'full',
    };
  }

  /**
   * Calculate effective exposure across all positions
   */
  public calculatePortfolioNetExposure(): number {
    let totalExposure = 0;

    for (const pair of this.hedgePairs.values()) {
      totalExposure += pair.netExposure;
    }

    return totalExposure;
  }

  /**
   * Get all hedge pairs
   */
  public getAllHedgePairs(): HedgePair[] {
    return Array.from(this.hedgePairs.values());
  }

  /**
   * Check if hedging should be recommended
   */
  public shouldRecommendHedge(
    position: OrionPosition,
    unrealizedPnLPct: number
  ): boolean {
    // Recommend hedge if:
    // 1. Position is losing more than 2%
    // 2. No existing hedge
    // 3. Market conditions suggest reversal

    if (unrealizedPnLPct < -2) {
      const pair = this.getHedgePair(position.exchange, position.symbol);
      if (!pair || pair.state === 'UNHEDGED') {
        return true;
      }
    }

    return false;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private createEmptyPair(): HedgePair {
    return {
      longPosition: null,
      shortPosition: null,
      netExposure: 0,
      hedgeRatio: 0,
      state: 'UNHEDGED',
    };
  }

  private recalculatePair(pair: HedgePair): HedgePair {
    const netExposure = this.calculateNetExposure(
      pair.longPosition,
      pair.shortPosition
    );

    const hedgeRatio = this.calculateHedgeRatio(
      pair.longPosition,
      pair.shortPosition
    );

    const state = this.determineHedgeState(hedgeRatio);

    return {
      ...pair,
      netExposure,
      hedgeRatio,
      state,
    };
  }
}

// =============================================================================
// HEDGE DECISION ENGINE
// =============================================================================

export interface HedgeDecision {
  action: 'OPEN_HEDGE' | 'CLOSE_HEDGE' | 'ADJUST_HEDGE' | 'NO_ACTION';
  reason: string;
  side: PositionSide | null;
  size?: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class HedgeDecisionEngine {
  private hedgingEngine: HedgingEngine;

  constructor(hedgingEngine: HedgingEngine) {
    this.hedgingEngine = hedgingEngine;
  }

  /**
   * Decide whether to open, close, or adjust a hedge
   */
  public decide(
    position: OrionPosition,
    currentPrice: number,
    signal: TrendSignal | null
  ): HedgeDecision {
    const hedgeInfo = this.hedgingEngine.getHedgeInfo(position);
    const pnlPct = position.unrealizedPnLPct;

    // CASE 1: Large loss on unhedged position
    if (pnlPct < -5 && hedgeInfo.hedgeStatus === 'unhedged') {
      return {
        action: 'OPEN_HEDGE',
        reason: `Large unrealized loss (${pnlPct.toFixed(2)}%) - recommend hedge`,
        side: position.side === 'LONG' ? 'SHORT' : 'LONG',
        size: position.size,
        urgency: 'HIGH',
      };
    }

    // CASE 2: Signal reversal on hedged position
    if (signal && hedgeInfo.hedgeStatus !== 'unhedged') {
      const signalAgainstPosition =
        (position.side === 'LONG' && signal.direction === 'SHORT') ||
        (position.side === 'SHORT' && signal.direction === 'LONG');

      if (signalAgainstPosition && signal.strength > 0.7) {
        return {
          action: 'ADJUST_HEDGE',
          reason: 'Strong reversal signal detected',
          side: signal.direction === 'LONG' ? 'LONG' : 'SHORT',
          urgency: 'MEDIUM',
        };
      }
    }

    // CASE 3: Profitable position with hedge - consider closing hedge
    if (pnlPct > 3 && hedgeInfo.hedgeStatus === 'partial') {
      return {
        action: 'CLOSE_HEDGE',
        reason: 'Position profitable - consider removing partial hedge',
        side: position.side === 'LONG' ? 'SHORT' : 'LONG',
        urgency: 'LOW',
      };
    }

    // CASE 4: Full hedge with profit on one side - consider unwinding
    if (hedgeInfo.hedgeStatus === 'full') {
      const pair = this.hedgingEngine.getHedgePair(
        position.exchange,
        position.symbol
      );

      if (pair) {
        const longPnL = pair.longPosition?.unrealizedPnLPct || 0;
        const shortPnL = pair.shortPosition?.unrealizedPnLPct || 0;

        if (Math.abs(longPnL - shortPnL) > 5) {
          const closeSide = longPnL > shortPnL ? 'SHORT' : 'LONG';
          return {
            action: 'CLOSE_HEDGE',
            reason: 'Unbalanced hedge - close losing side',
            side: closeSide,
            urgency: 'MEDIUM',
          };
        }
      }
    }

    return {
      action: 'NO_ACTION',
      reason: 'No hedge action required',
      side: null,
      urgency: 'LOW',
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { HedgingEngine as HedgingStateMachine };
