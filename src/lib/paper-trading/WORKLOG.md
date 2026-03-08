# Paper Trading Engine Worklog

## 2026-01-XX - Persistence Layer Integration

### Created/Updated Files
- `/prisma/schema.prisma` - Added PaperAccount, PaperPosition, PaperTrade models
- `/src/lib/paper-trading/persistence.ts` - Full persistence implementation with dual-mode support
- `/src/lib/paper-trading/engine.ts` - Integrated auto-save and account restoration
- `/src/lib/paper-trading/index.ts` - Export persistence module

### Persistence Architecture

```
Paper Trading Persistence
├── Dual Mode Support
│   ├── V1: PaperTradingAccount (single table, JSON storage)
│   └── V2: PaperAccount + PaperPosition + PaperTrade (separate tables)
│
├── Auto-Save
│   ├── Interval: 5 minutes (configurable)
│   ├── On position change (opened/closed/updated)
│   └── On account status change
│
├── Serialization
│   ├── Position JSON serialization with Date handling
│   ├── Trade history serialization
│   └── Equity curve serialization (last 1000 points)
│
└── Restoration
    ├── Load active accounts on startup
    ├── Resume auto-save timers
    └── Reconstruct in-memory state
```

### Database Schema

```prisma
model PaperAccount {
  id              String   @id @default(uuid())
  userId          String?
  initialBalance  Float
  balance         Float
  equity          Float
  availableMargin Float
  marginUsed      Float
  currentDrawdown Float
  maxDrawdown     Float
  status          String   @default("ACTIVE")
  positions       String?  // JSON
  equityCurve     String?  // JSON
  metrics         String?  // JSON
  
  paperPositions  PaperPosition[]
  paperTrades     PaperTrade[]
}

model PaperPosition {
  id              String   @id @default(uuid())
  accountId       String
  symbol          String
  direction       String
  totalSize       Float
  entryPrice      Float
  currentPrice    Float
  unrealizedPnl   Float
  stopLoss        Float?
  takeProfit      String?  // JSON
  leverage        Int
  marginUsed      Float
  liquidationPrice Float?
  status          String   @default("OPEN")
  trailingStop    String?  // JSON
  totalFundingPaid Float  @default(0)
  openedAt        DateTime @default(now())
  closedAt        DateTime?
  
  account         PaperAccount @relation(...)
}

model PaperTrade {
  id              String   @id @default(uuid())
  accountId       String
  positionId      String?
  symbol          String
  direction       String
  side            String   // OPEN, CLOSE, PARTIAL_CLOSE
  size            Float
  price           Float
  pnl             Float?
  fee             Float
  reason          String?
  timestamp       DateTime @default(now())
  
  account         PaperAccount @relation(...)
}
```

### Key Features

1. **Auto-Save Mechanism**
   - Timer-based saving every 5 minutes
   - Event-triggered saving on position changes
   - Debouncing for rapid changes

2. **Account Restoration**
   - Load all active accounts on engine init
   - Resume auto-save timers
   - Full state reconstruction

3. **Dual Storage Mode**
   - V1: Single table with JSON (backward compatible)
   - V2: Separate tables for better querying

### Usage Example

```typescript
import { getPaperTradingEngine } from '@/lib/paper-trading';

const engine = getPaperTradingEngine();

// Restore accounts from database
await engine.restoreAccounts();

// Create new account (auto-saved)
const account = await engine.createAccount({
  id: 'paper-1',
  name: 'Test Account',
  initialBalance: 10000,
  // ... other config
});

// Start trading (auto-save started)
await engine.start(account.id);

// Account is now auto-saved every 5 minutes
// and on every position change
```

---

## 2026-01-XX - Initial Implementation

### Created Files
- `/src/lib/paper-trading/types.ts` - Types for virtual account, positions, trades
- `/src/lib/paper-trading/engine.ts` - PaperTradingEngine class
- `/src/lib/paper-trading/index.ts` - Module exports

### Architecture

```
Paper Trading Engine
├── types.ts
│   ├── PaperTradingConfig   - Configuration for paper account
│   ├── PaperAccount         - Virtual trading account
│   ├── PaperPosition        - Open position tracking
│   ├── PaperTrade           - Completed trade record
│   ├── PaperTradingMetrics  - Performance metrics
│   └── PaperTradingEvent    - Event system for callbacks
│
└── engine.ts
    └── PaperTradingEngine
        ├── createAccount()       - Create virtual account
        ├── start() / stop()      - Control trading
        ├── updatePrices()        - Update with real prices
        ├── processCandles()      - Analyze and execute signals
        ├── openPosition()        - Manual position opening
        ├── closePosition()       - Close position
        ├── closeAllPositions()   - Emergency close all
        └── subscribe()           - Event subscription
```

### Key Features

1. **Virtual Account Management**
   - Multiple accounts support
   - Real-time balance tracking
   - Equity and margin calculation
   - Drawdown monitoring

2. **Position Tracking**
   - Entry/Exit recording
   - PnL calculation
   - Leverage support
   - Liquidation price tracking

3. **Tactics Integration**
   - SL/TP from tactics
   - Trailing stop execution
   - Partial closes
   - DCA support

4. **Event System**
   - POSITION_OPENED
   - POSITION_CLOSED
   - POSITION_UPDATED
   - SIGNAL_GENERATED
   - MAX_DRAWDOWN_REACHED
   - ERROR

### Example Usage

```typescript
import { getPaperTradingEngine } from '@/lib/paper-trading';

const engine = getPaperTradingEngine();

// Create account
const account = engine.createAccount({
  id: 'paper-1',
  name: 'Test Account',
  initialBalance: 10000,
  currency: 'USDT',
  exchange: 'binance',
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframe: '1h',
  strategyId: 'rsi-reversal',
  tacticsSets: [tacticsSet],
  autoTrading: true,
  maxRiskPerTrade: 2,
  maxDrawdown: 20,
  maxOpenPositions: 3,
});

// Start trading
engine.start(account.id);

// Update with real prices (from WebSocket)
engine.updatePrices({
  'BTCUSDT': 45000,
  'ETHUSDT': 3000,
});

// Or process candles
await engine.processCandles(account.id, 'BTCUSDT', candles);

// Subscribe to events
engine.subscribe((event) => {
  if (event.type === 'POSITION_OPENED') {
    console.log('New position:', event.data.position);
  }
});
```

### Integration Points

1. **Strategy Framework** - Signal generation
2. **Tactics** - Position management rules
3. **Real Price Feeds** - From exchange WebSocket
4. **Notifications** - Via event system

### Differences from Backtesting

| Feature | Backtesting | Paper Trading |
|---------|-------------|---------------|
| Data | Historical | Real-time |
| Speed | Fast (batch) | Real-time |
| Slippage | Simulated | Actual |
| Purpose | Strategy testing | Live simulation |

### Next Steps

- [x] Connect to real exchange WebSocket
- [x] Add persistence (database)
- [ ] Implement order queue
- [ ] Add multi-exchange support
