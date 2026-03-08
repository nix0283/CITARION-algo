# Profitmaker Integration Patterns

## Overview

This module integrates architectural patterns and components inspired by [Profitmaker](https://github.com/suenot/profitmaker) - an open-source trading terminal with 130+ exchange support.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Profitmaker Integration                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /src/lib/profitmaker/                                          │
│  ├── exchange/                                                  │
│  │   └── instance-manager.ts  ← Exchange caching & failover    │
│  │                                                             │
│  ├── orderbook/                                                 │
│  │   └── orderbook-manager.ts ← Optimized local order book     │
│  │                                                             │
│  ├── execution/                                                 │
│  │   └── trade-execution.ts  ← Retry logic & order tracking    │
│  │                                                             │
│  ├── fees/                                                      │
│  │   └── fee-calculator.ts   ← Exchange fees & VIP tiers       │
│  │                                                             │
│  ├── builder/                                                   │
│  │   └── bot-builder.ts      ← Visual strategy constructor    │
│  │                                                             │
│  ├── metrics/                                                   │
│  │   └── smart-metrics.ts    ← Comprehensive trading metrics  │
│  │                                                             │
│  ├── backtesting/                                               │
│  │   └── ai-backtesting.ts   ← AI-powered optimization        │
│  │                                                             │
│  └── index.ts                ← Module exports                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Exchange Instance Manager

### Features

- **Connection caching** - Reuse exchange connections
- **Rate limiting** - Token bucket with exponential backoff
- **Health monitoring** - Track exchange status
- **Automatic failover** - Reconnect on errors

### Usage

```typescript
import { 
  ExchangeInstanceManager, 
  ExchangeConnectionPool,
  exchangeManager 
} from '@/lib/profitmaker';

// Register credentials
exchangeManager.registerCredentials('binance', {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
});

// Get instance with caching
const instance = exchangeManager.getInstance('binance');

// Use connection pool
const pool = new ExchangeConnectionPool();
const connection = await pool.acquire('binance');

// Execute with retry logic
const result = await connection.executeRequest(
  async () => {
    // Your API call here
    return await fetchOrder(symbol);
  },
  {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    onRetry: (attempt, delay, error) => {
      console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`);
    },
  }
);
```

### Rate Limiting

```typescript
import { RateLimiter } from '@/lib/profitmaker';

const limiter = new RateLimiter({
  maxRequestsPerMinute: 1200,
  maxOrdersPerSecond: 50,
  backoffMultiplier: 1.5,
  maxBackoffMs: 60000,
});

// Check before request
if (limiter.canRequest()) {
  limiter.recordRequest();
  // Make request
} else {
  const waitTime = limiter.getTimeUntilAvailable();
  console.log(`Wait ${waitTime}ms before next request`);
}
```

---

## 2. Order Book Manager

### Features

- **Snapshot + Delta processing** - Efficient updates
- **Sequence validation** - Prevent stale data
- **Cross-exchange normalization** - Unified format
- **Memory-optimized data structures** - Sorted price levels

### Usage

```typescript
import { 
  OrderBook, 
  OrderBookManager,
  orderBookManager 
} from '@/lib/profitmaker';

// Initialize with snapshot
orderBookManager.initializeBook({
  exchange: 'binance',
  symbol: 'BTCUSDT',
  bids: [{ price: 50000, amount: 1.5, total: 75000 }, ...],
  asks: [{ price: 50100, amount: 1.2, total: 60120 }, ...],
  sequence: 12345,
  timestamp: Date.now(),
});

// Apply delta updates (WebSocket)
orderBookManager.applyDelta({
  exchange: 'binance',
  symbol: 'BTCUSDT',
  bids: [[50000, 0]], // Remove level (amount = 0)
  asks: [[50100, 2.5]], // Update level
  sequence: 12346,
  timestamp: Date.now(),
});

// Get statistics
const stats = orderBookManager.getStats('binance', 'BTCUSDT');
console.log({
  spread: stats.spread,
  midPrice: stats.midPrice,
  imbalance: stats.imbalance,
  totalLiquidity: stats.totalBidLiquidity + stats.totalAskLiquidity,
});

// Subscribe to updates
const unsubscribe = orderBookManager.subscribe(
  'binance', 
  'BTCUSDT',
  (book) => {
    console.log('Best bid:', book.getBestBid());
    console.log('Best ask:', book.getBestAsk());
  }
);

// Calculate market impact
const impact = book.calculateMarketImpact(10, 'buy');
console.log(`Avg price: ${impact.avgPrice}`);
console.log(`Slippage: ${impact.slippage}%`);
```

### Aggregated View

```typescript
// Get best prices across exchanges
const aggregated = orderBookManager.getAggregatedView(
  'BTCUSDT',
  ['binance', 'bybit', 'okx']
);

console.log(`Best bid: ${aggregated.bestBid.price} on ${aggregated.bestBid.exchange}`);
console.log(`Best ask: ${aggregated.bestAsk.price} on ${aggregated.bestAsk.exchange}`);
```

---

## 3. Trade Execution Engine

### Features

- **Exponential backoff retry** - Automatic retry on failures
- **Order status tracking** - Real-time order state
- **Position management** - Track open positions
- **Smart order routing** - Best execution across exchanges

### Usage

```typescript
import { 
  TradeExecutionEngine,
  tradeExecutionEngine 
} from '@/lib/profitmaker';

// Execute order with retry
const result = await tradeExecutionEngine.executeOrder(
  {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    side: 'buy',
    type: 'market',
    amount: 0.1,
  },
  async (request) => {
    // Your exchange API call
    return await exchangeClient.createOrder(request);
  }
);

console.log(`Order ${result.orderId}: ${result.status}`);
console.log(`Filled: ${result.filled} @ ${result.avgPrice}`);
```

### Order Tracking

```typescript
const tracker = tradeExecutionEngine.getOrderTracker();

// Get all open orders
const openOrders = tracker.getOpenOrders('binance', 'BTCUSDT');

// Get order by ID
const order = tracker.getOrder('order-123');

// Get order by client order ID
const order = tracker.getOrderByClientId('my-client-id-123');
```

### Position Management

```typescript
const positionManager = tradeExecutionEngine.getPositionManager();

// Get current position
const position = positionManager.getPosition('binance', 'BTCUSDT', 'long');

console.log({
  size: position.size,
  entryPrice: position.entryPrice,
  pnl: position.unrealizedPnl,
  pnlPercent: position.unrealizedPnlPercent,
});

// Update mark price (real-time)
positionManager.updateMarkPrice('binance', 'BTCUSDT', 51000);

// Get total unrealized PnL
const totalPnl = positionManager.getTotalUnrealizedPnl();
```

### Smart Order Routing

```typescript
import { smartOrderRouter } from '@/lib/profitmaker';

// Get order books from multiple exchanges
const orderBooks = new Map([
  ['binance', { bids: [...], asks: [...] }],
  ['bybit', { bids: [...], asks: [...] }],
  ['okx', { bids: [...], asks: [...] }],
]);

// Find best execution
const best = smartOrderRouter.findBestExecution(
  'BTCUSDT',
  'buy',
  1.0, // Amount
  orderBooks
);

console.log(`Best execution on ${best.exchange}`);
console.log(`Average price: ${best.avgPrice}`);
console.log(`Slippage: ${best.slippage}%`);
```

---

## 4. Fee Calculator

### Features

- **5 exchange fee structures** - Binance, Bybit, OKX, Bitget, BingX
- **VIP tier support** - Volume-based discounts
- **Maker/Taker differentiation** - Accurate fee calculation
- **Funding rate calculation** - For futures positions

### Usage

```typescript
import { feeCalculator, feeOptimizer } from '@/lib/profitmaker';

// Calculate trading fee
const fee = feeCalculator.calculateFee({
  exchange: 'binance',
  symbol: 'BTCUSDT',
  side: 'buy',
  orderType: 'limit',
  amount: 1.0,
  price: 50000,
  marketType: 'spot',
  vipLevel: 'VIP1',
});

console.log(`Fee: ${fee.feeAmount} ${fee.feeCurrency}`);
console.log(`Rate: ${fee.feeRate * 100}% (${fee.isMaker ? 'maker' : 'taker'})`);
```

### VIP Tiers

```typescript
// Get VIP tier info
const tiers = feeCalculator.getVIPTiers('binance');

tiers.forEach(tier => {
  console.log(`${tier.level}: ${tier.minVolume30d / 1e6}M USD - Maker: ${tier.makerFee * 100}%, Taker: ${tier.takerFee * 100}%`);
});

// Calculate volume required for tier
const volume = feeCalculator.getVolumeRequiredForTier('binance', 'VIP3');
console.log(`Need ${volume / 1e6}M 30-day volume for VIP3`);
```

### Compare Fees

```typescript
// Compare fees across exchanges
const comparison = feeCalculator.compareFeesAcrossExchanges(
  ['binance', 'bybit', 'okx', 'bitget'],
  'BTCUSDT',
  1.0,
  50000,
  'futures'
);

comparison.forEach(ex => {
  console.log(`${ex.exchange}: Maker ${ex.makerFee * 100}%, Taker ${ex.takerFee * 100}%`);
});
```

### Round-Trip Fees

```typescript
// Calculate total fees for entry + exit
const roundTrip = feeCalculator.calculateRoundTripFee(
  'binance',
  'BTCUSDT',
  1.0,
  50000, // Entry price
  55000, // Exit price
  'futures'
);

console.log(`Total fees: ${roundTrip.totalFeeAmount}`);
console.log(`As percentage: ${roundTrip.totalFeePercent}%`);
```

### Fee Optimization

```typescript
// Find optimal execution strategy
const optimal = feeOptimizer.findOptimalExecution(
  'binance',
  'BTCUSDT',
  10.0,
  50000,
  'spot'
);

console.log(`Strategy: ${optimal.strategy}`);
console.log(`Estimated fee: ${optimal.estimatedFee}`);
console.log(`Savings: ${optimal.savings}`);

// Calculate break-even price
const breakEven = feeOptimizer.calculateBreakEvenPrice(
  'binance',
  'BTCUSDT',
  1.0,
  50000,
  'futures'
);

console.log(`Break-even price: ${breakEven.breakEvenPrice}`);
console.log(`Required gain: ${breakEven.requiredGainPercent}%`);
```

---

## 5. Bot Visual Builder

### Features

- **Drag-and-drop strategy construction** - Visual interface
- **Node-based workflow** - Composable components
- **Real-time compilation** - Generate executable code
- **Pre-built nodes** - Indicators, signals, actions

### Node Types

| Category | Nodes |
|----------|-------|
| **Indicators** | RSI, EMA, MACD, SMA, Bollinger Bands, ATR |
| **Signals** | Crossover, Threshold, Pattern Detection |
| **Conditions** | AND, OR, NOT, Compare |
| **Actions** | Buy, Sell, Cancel, Set Stop Loss |
| **Risk Management** | Stop Loss, Take Profit, Position Size |
| **Data Sources** | OHLCV, Ticker, Order Book |
| **Math** | Add, Subtract, Multiply, Divide |

### Usage

```typescript
import { botBuilder } from '@/lib/profitmaker';

// Create new bot
const bot = botBuilder.createBot(
  'My Strategy',
  'RSI + EMA crossover strategy'
);

// Add data source node
const dataSourceNode = botBuilder.addNode(
  bot.id,
  'data',
  { x: 100, y: 100 }
);

// Add indicator nodes
const rsiNode = botBuilder.addNode(bot.id, 'indicator', { x: 300, y: 100 });
botBuilder.updateNodeConfig(bot.id, rsiNode!.id, {
  period: 14,
  source: 'close',
});

const emaNode = botBuilder.addNode(bot.id, 'indicator', { x: 300, y: 200 });
botBuilder.updateNodeConfig(bot.id, emaNode!.id, {
  period: 20,
});

// Add signal node
const thresholdNode = botBuilder.addNode(bot.id, 'signal', { x: 500, y: 100 });
botBuilder.updateNodeConfig(bot.id, thresholdNode!.id, {
  threshold: 30,
});

// Connect nodes
botBuilder.connectNodes(
  bot.id,
  dataSourceNode!.id, 'close',
  rsiNode!.id, 'data'
);

botBuilder.connectNodes(
  bot.id,
  rsiNode!.id, 'value',
  thresholdNode!.id, 'value'
);

// Add action node
const buyNode = botBuilder.addNode(bot.id, 'action', { x: 700, y: 100 });
botBuilder.updateNodeConfig(bot.id, buyNode!.id, {
  symbol: 'BTCUSDT',
  orderType: 'market',
  amountType: 'percentage',
  amountValue: 10,
});

botBuilder.connectNodes(
  bot.id,
  thresholdNode!.id, 'below',
  buyNode!.id, 'signal'
);

// Compile to executable code
const compiled = botBuilder.compileBot(bot.id);
console.log(compiled.code);
```

---

## 6. Smart Metrics Engine

### Features

- **30+ trading metrics** - Comprehensive analysis
- **Risk-adjusted returns** - Sharpe, Sortino, Calmar
- **Trade statistics** - Win rate, profit factor, expectancy
- **AI recommendations** - Automated improvement suggestions

### Available Metrics

| Category | Metrics |
|----------|---------|
| **Returns** | Total Return, Annualized Return, Daily/Monthly Returns |
| **Risk** | Volatility, Variance, Max Drawdown, VaR, CVaR |
| **Risk-Adjusted** | Sharpe Ratio, Sortino Ratio, Calmar Ratio, Treynor, Information Ratio |
| **Trade Stats** | Win Rate, Avg Win/Loss, Profit Factor, Risk/Reward Ratio |
| **Efficiency** | Avg Holding Time, Trades/Day, Profit/Trade, Profit/Hour |
| **Advanced** | Kelly Percentage, Alpha, Beta |

### Usage

```typescript
import { smartMetricsEngine } from '@/lib/profitmaker';

// Calculate all metrics
const metrics = smartMetricsEngine.calculateMetrics(trades, equityCurve);

console.log({
  // Returns
  totalReturn: metrics.totalReturnPercent,
  annualizedReturn: metrics.annualizedReturn * 100,
  
  // Risk
  maxDrawdown: metrics.maxDrawdownPercent,
  volatility: metrics.volatility,
  
  // Risk-adjusted
  sharpeRatio: metrics.sharpeRatio,
  sortinoRatio: metrics.sortinoRatio,
  
  // Trade stats
  winRate: metrics.winRate,
  profitFactor: metrics.profitFactor,
  
  // Advanced
  kellyPercentage: metrics.kellyPercentage,
});

// Get summary with grade
const summary = smartMetricsEngine.calculateSummary(trades, equityCurve);

console.log(`Performance: ${summary.performance}`);
console.log(`Risk: ${summary.risk}`);
console.log(`Efficiency: ${summary.efficiency}`);
console.log(`Grade: ${summary.grade}`);

summary.recommendations.forEach(rec => console.log(`• ${rec}`));
```

---

## 7. AI-Enhanced Backtesting

### Features

- **Genetic algorithm optimization** - Evolve strategy parameters
- **AI-guided selection** - Smart parameter suggestions
- **Market regime detection** - Adapt to conditions
- **AI analysis** - Automated insights

### Usage

```typescript
import { aiStrategyOptimizer, aiMarketAnalyzer } from '@/lib/profitmaker';

// Initialize
await aiStrategyOptimizer.initialize();

// Optimize strategy parameters
const result = await aiStrategyOptimizer.optimizeStrategy(
  {
    strategyName: 'RSI Reversal',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-01-01'),
    initialCapital: 10000,
    optimizationTarget: 'sharpe',
    maxIterations: 100,
    populationSize: 50,
    mutationRate: 0.1,
    crossoverRate: 0.7,
  },
  [
    { name: 'rsiPeriod', type: 'integer', min: 7, max: 21, current: 14 },
    { name: 'oversold', type: 'number', min: 20, max: 40, current: 30 },
    { name: 'overbought', type: 'number', min: 60, max: 80, current: 70 },
  ],
  async (params) => {
    // Run backtest with params
    return await runBacktest(params);
  }
);

console.log(`Best score: ${result.bestScore}`);
console.log(`Best params: ${JSON.stringify(result.bestParameters)}`);

// View AI analysis
console.log('Strengths:', result.analysis.strengths);
console.log('Weaknesses:', result.analysis.weaknesses);
console.log('Suggestions:', result.analysis.suggestions);
```

### Market Analysis

```typescript
await aiMarketAnalyzer.initialize();

// Analyze market conditions
const analysis = await aiMarketAnalyzer.analyzeMarketConditions(ohlcvData);

console.log(`Trend: ${analysis.trend}`);
console.log(`Volatility: ${analysis.volatility}`);
console.log(`Regime: ${analysis.regime}`);
console.log(`Confidence: ${analysis.confidence}`);
console.log(`Signals: ${analysis.signals}`);

// Generate trading signals
const signal = await aiMarketAnalyzer.generateSignals(marketData, indicators);

console.log(`Signal: ${signal.signal}`);
console.log(`Confidence: ${signal.confidence}%`);
console.log(`Risk: ${signal.riskLevel}`);
signal.reasons.forEach(r => console.log(`• ${r}`));
```

---

## Integration with CITARION

### Using with Existing Bots

```typescript
// Enhance DCA bot with smart metrics
import { smartMetricsEngine } from '@/lib/profitmaker';

const dcabot = new DCABot(config);

// After trades, calculate metrics
bot.on('trade', (trade) => {
  const metrics = smartMetricsEngine.calculateMetrics(
    bot.getTrades(),
    bot.getEquityCurve()
  );
  
  // Adjust DCA amount based on Kelly
  if (metrics.kellyPercentage > 10) {
    bot.setBuyAmount(metrics.kellyPercentage / 100 * portfolioValue);
  }
});
```

### Using with IAF Service

```typescript
// Use fee calculator with IAF strategies
import { feeCalculator } from '@/lib/profitmaker';

// Calculate expected fees before backtest
const fees = feeCalculator.calculateRoundTripFee(
  'binance',
  'BTCUSDT',
  positionSize,
  entryPrice,
  targetPrice,
  'futures'
);

// Include in IAF risk config
strategy.risk_config.position_sizes[0].percentage_of_portfolio = 
  basePercentage - fees.totalFeePercent;
```

### Using Order Book Manager

```typescript
import { orderBookManager } from '@/lib/profitmaker';

// Subscribe to order book updates
const ws = new WebSocket('wss://stream.binance.com/ws/btcusdt@depth');

ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  
  orderBookManager.applyDelta({
    exchange: 'binance',
    symbol: 'BTCUSDT',
    bids: data.b,
    asks: data.a,
    sequence: data.u,
    timestamp: Date.now(),
  });
  
  // Use in trading logic
  const stats = orderBookManager.getStats('binance', 'BTCUSDT');
  
  // Check for order book imbalance
  if (Math.abs(stats.imbalance) > 0.5) {
    console.log(`Strong ${stats.imbalance > 0 ? 'buy' : 'sell'} pressure`);
  }
};
```

---

## File Structure

```
/src/lib/profitmaker/
├── index.ts                      # Module exports
├── exchange/
│   └── instance-manager.ts       # Exchange connection management
├── orderbook/
│   └── orderbook-manager.ts      # Order book processing
├── execution/
│   └── trade-execution.ts        # Trade execution with retry
├── fees/
│   └── fee-calculator.ts         # Fee calculation & optimization
├── builder/
│   └── bot-builder.ts            # Visual strategy builder
├── metrics/
│   └── smart-metrics.ts          # Trading metrics engine
└── backtesting/
    └── ai-backtesting.ts         # AI-enhanced optimization
```

---

## Key Benefits

1. **Reliability** - Automatic retry, failover, health monitoring
2. **Performance** - Optimized data structures, efficient caching
3. **Accuracy** - Precise fee calculation with VIP tiers
4. **Insights** - AI-powered analysis and recommendations
5. **Flexibility** - Modular design, easy integration
6. **Transparency** - Clear metrics and reporting

---

## References

- [Profitmaker GitHub](https://github.com/suenot/profitmaker)
- [Profitmaker Website](https://www.profitmaker.cc)
- [Profitmaker Roadmap](https://www.profitmaker.cc/#roadmap)
