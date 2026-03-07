# Trading Bots Phase Improvements Documentation

## Overview

This document describes the critical improvements implemented in the Trading Bots Phase for the CITARION trading platform. The improvements focus on reliability, safety, and preventing race conditions.

## Date: 2025-01-23
## Status: ✅ COMPLETED

---

## 1. Race Condition Prevention

### 1.1 Per-Symbol Mutex

**File:** `src/lib/grid-bot-worker.ts`

A Promise-based mutex that prevents concurrent order execution for the same symbol.

```typescript
class SymbolMutex {
  private locks: Map<string, Promise<void>> = new Map();
  private queue: Map<string, Array<() => void>> = new Map();
  
  async acquire(symbol: string): Promise<() => void> {
    // Returns a release function that must be called
  }
  
  isLocked(symbol: string): boolean;
  getLockedCount(): number;
}
```

**Usage:**
```typescript
const releaseMutex = await symbolMutex.acquire(bot.symbol);
try {
  // Execute order safely
  await exchangeClient.createOrder({ ... });
} finally {
  releaseMutex();
}
```

### 1.2 Distributed Locks

Grid bots now use distributed locks to prevent multiple workers from processing the same bot.

```typescript
const lockResult = await acquireBotLock('grid', botId, { ttl: 30000 });

if (!lockResult.acquired) {
  console.log('Bot already being processed');
  return;
}

try {
  await processGridBot(bot);
} finally {
  await releaseBotLock('grid', botId, lockResult.holder);
}
```

---

## 2. Kill Switch Auto-Arm

### 2.1 Configuration

**File:** `src/lib/risk-management/kill-switch.ts`

```typescript
const defaultAutoArmConfig: AutoArmConfig = {
  autoArmWhenBotStarts: true,
  autoArmWhenLiveMode: true,
  autoArmWhenFirstPosition: true,
  autoArmOnStartup: true,        // NEW: Auto-arm on system startup
  requireConfirmationToDisarm: true,
  logAutoArmEvents: true,
};
```

### 2.2 Initialization

```typescript
const killSwitch = new KillSwitch();

// Call on application startup
await killSwitch.initialize();
// → Kill switch auto-armed on system startup
// → Safety checks started with interval 60000ms
```

### 2.3 Periodic Safety Checks

```typescript
// Register custom safety checks
killSwitch.registerSafetyCheck(async () => {
  const drawdown = await calculateDrawdown();
  
  return {
    shouldTrigger: drawdown > 0.20,
    trigger: 'drawdown',
    details: { drawdown },
  };
});
```

---

## 3. Orphaned Order Detection

### 3.1 Detection

**File:** `src/lib/exchange/base-client.ts`

```typescript
interface OrphanedOrder {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  expectedStatus: string;
  actualStatus?: string;
  detectedAt: Date;
}

async detectOrphanedOrders(
  localOrders: LocalOrder[],
  exchange: ExchangeClient
): Promise<OrphanedOrderResult>
```

### 3.2 Reconciliation Strategies

```typescript
enum ReconciliationStrategy {
  MARK_CANCELLED = 'MARK_CANCELLED',   // Assume cancelled
  CHECK_HISTORY = 'CHECK_HISTORY',     // Check actual final state
}

async reconcileOrphanedOrders(
  orphans: OrphanedOrder[],
  strategy: ReconciliationStrategy
): Promise<ReconciliationResult>
```

### 3.3 Scheduled Detection

```typescript
// Schedule periodic orphan detection (every 5 minutes)
const scheduler = scheduleOrphanDetection(300000);
```

---

## 4. Partial Fill Tracking

### 4.1 Recording Partial Fills

**File:** `src/lib/position-monitor.ts`

```typescript
interface PartialFillInfo {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  totalQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  avgFillPrice: number;
  fills: Array<{
    price: number;
    quantity: number;
    timestamp: Date;
  }>;
}

function recordPartialFill(
  orderId: string,
  fill: { price: number; quantity: number }
): PartialFillInfo
```

### 4.2 Callback Registration

```typescript
// Register callback for partial fill events
onPartialFill((event: PartialFillEvent) => {
  console.log(`Partial fill: ${event.symbol} ${event.filledQuantity}/${event.totalQuantity}`);
  console.log(`Avg price: ${event.weightedAvgPrice}`);
  
  // Update UI, send notification, etc.
});
```

---

## 5. Signal Deduplication

### 5.1 Double-Entry Protection

**File:** `src/lib/signal-parser.ts`

```typescript
// Check for duplicate before processing
const result = await parseSignalWithDedup(text);

if (result.isDuplicate) {
  console.log(`Duplicate signal detected: ${result.duplicateReason}`);
  console.log(`Original signal ID: ${result.originalSignalId}`);
  return;
}

// Execute signal
await executeTrade(result.signal);

// Mark as processed
await markSignalAsProcessed(result.signal, {
  status: 'EXECUTED',
  positionId: 'pos_123',
  processedAt: new Date(),
});
```

### 5.2 Convenience Function

```typescript
const result = await parseAndProcessSignal(text, async (signal) => {
  return await executeTrade(signal);
});

if (result.processed) {
  console.log('Trade executed:', result.result);
} else if (result.isDuplicate) {
  console.log('Signal was duplicate');
}
```

---

## 6. Slippage Protection

### 6.1 Configuration

**File:** `src/lib/copy-trading/slippage-protector.ts`

```typescript
interface SlippageConfig {
  maxSlippagePercent: number;      // Default: 0.5%
  volatilityMultiplier: boolean;   // Default: true
  rejectOnExceeded: boolean;       // Default: true
  warningThreshold: number;        // Default: 0.25%
  atrPeriod: number;               // Default: 14
  volatilityFactor: number;        // Default: 0.1
  enableLogging: boolean;          // Default: true
  maxLatencyMs: number;            // Default: 30000
}
```

### 6.2 Usage

```typescript
const protector = new SlippageProtector({
  maxSlippagePercent: 0.5,
  volatilityMultiplier: true,
});

const result = protector.checkSlippage(
  masterEntry,     // Master's entry price
  currentPrice,    // Current market price
  'LONG',          // Trade direction
  context          // Copy trade context
);

if (!result.acceptable) {
  console.log(`Trade rejected: ${result.reason}`);
  console.log(`Slippage: ${result.slippagePercent}%`);
  console.log(`Threshold: ${result.appliedThreshold}%`);
}
```

### 6.3 Risk Profiles

```typescript
// Conservative: 0.25% max, no volatility adjustment
const conservative = createSlippageConfigByProfile('conservative');

// Moderate: 0.5% max, volatility-adjusted (default)
const moderate = createSlippageConfigByProfile('moderate');

// Aggressive: 1.0% max, warn but don't reject
const aggressive = createSlippageConfigByProfile('aggressive');
```

---

## 7. Circuit Breaker Progressive Cooldown

### 7.1 Cooldown Levels

**File:** `src/lib/argus-bot/circuit-breaker.ts`

| Trigger | Cooldown | Action |
|---------|----------|--------|
| 1st | 1 hour | Automatic recovery |
| 2nd | 4 hours | Automatic recovery |
| 3rd | 24 hours | Automatic recovery |
| 4th+ | ∞ | Manual reset required |

### 7.2 Usage

```typescript
const circuitBreaker = new CircuitBreaker({
  enabled: true,
  maxConsecutiveLosses: 5,
  maxDailyLoss: 500,
  progressiveCooldown: true,
});

// Check if can trade
const { allowed, reason } = circuitBreaker.canTrade();
if (!allowed) {
  console.log(`Cannot trade: ${reason}`);
}

// Record trade result
const result = circuitBreaker.recordTrade(pnl);
if (result.triggered) {
  console.log(`Circuit breaker triggered: ${result.reason}`);
}

// Check if manual reset required
if (circuitBreaker.isManualResetRequired()) {
  console.log('Manual reset required - too many triggers');
  // Admin intervention needed
  circuitBreaker.forceReset();
}

// Get progressive stats
const stats = circuitBreaker.getProgressiveStats();
console.log(`Triggers: ${stats.triggers}`);
console.log(`Current cooldown: ${stats.currentCooldown}ms`);
```

---

## 8. Bot Processing Metrics

### 8.1 Metrics Tracking

**File:** `src/lib/bot-workers.ts`

```typescript
interface BotProcessingMetrics {
  gridBot: {
    successCount: number;
    failCount: number;
    timeoutCount: number;
    avgDuration: number;
    maxDuration: number;
  };
  dcaBot: {
    successCount: number;
    failCount: number;
    timeoutCount: number;
    avgDuration: number;
    maxDuration: number;
  };
}

const metrics = getBotMetrics();
console.log('Grid bot success rate:', 
  metrics.gridBot.successCount / 
  (metrics.gridBot.successCount + metrics.gridBot.failCount)
);
```

### 8.2 Timeout Handling

```typescript
// Process with timeout (default 25s)
const result = await withTimeout(
  processGridBotInternal(bot),
  25000,
  `Grid bot ${bot.id} processing timeout`
);
```

---

## 9. Error Handling

All improvements include proper error handling:

```typescript
try {
  await processWithProtection();
} catch (error) {
  if (error instanceof TimeoutError) {
    // Handle timeout
  } else if (error instanceof LockAcquisitionError) {
    // Handle lock failure
  }
}
```

---

## 10. Monitoring

### 10.1 Slippage Statistics

```typescript
const stats = slippageProtector.getSlippageStats();
// {
//   totalChecks: 150,
//   acceptedCount: 142,
//   rejectedCount: 8,
//   warningCount: 25,
//   avgSlippage: 0.23,
//   maxSlippage: 0.67,
//   rejectionRate: 0.053
// }
```

### 10.2 Circuit Breaker State

```typescript
const state = circuitBreaker.getState();
// {
//   active: true,
//   triggeredAt: Date,
//   reason: 'Too many consecutive losses',
//   until: Date,
//   consecutiveLosses: 5,
//   requiresManualReset: false
// }
```

---

## 11. Best Practices

1. **Always acquire mutex before order execution**
2. **Check circuit breaker before every trade**
3. **Log slippage events for analysis**
4. **Monitor orphaned orders periodically**
5. **Use progressive cooldown for safety**
6. **Mark signals as processed after execution**
7. **Handle partial fills gracefully**

---

## References

- [Mutex Pattern](https://en.wikipedia.org/wiki/Mutual_exclusion)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Slippage in Trading](https://www.investopedia.com/terms/s/slippage.asp)
