# CITARION Feature Additions - Phase 6

## Overview

This document describes the new features implemented in Phase 6 of the CITARION trading platform development.

**Implementation Date:** 2025-01-XX
**Total Features Implemented:** 6 (CIT-043, CIT-044, CIT-047, CIT-048, CIT-049, CIT-050)

---

## CIT-043: Hotkeys for Trading

### Description
Comprehensive keyboard shortcuts for quick trading actions without mouse interaction.

### Implementation
**File:** `/src/hooks/use-trading-hotkeys.ts`

### Features
| Hotkey | Action |
|--------|--------|
| `B` | Open buy dialog |
| `S` | Open sell dialog |
| `Shift+E` | Close all positions |
| `Shift+C` | Cancel all open orders |
| `R` | Refresh chart data |
| `T` | Toggle chart type |
| `1-6` | Quick buy (1%, 5%, 10%, 25%, 50%, 100% of balance) |
| `?` | Toggle hotkeys help panel |
| `Esc` | Close dialogs |

### Usage
```typescript
import { useTradingHotkeys } from '@/hooks/use-trading-hotkeys';

function MyChart() {
  useTradingHotkeys({
    onBuy: () => openBuyDialog(),
    onSell: () => openSellDialog(),
    onRefresh: () => refreshData(),
  });
}
```

### Integration
- Integrated into PriceChart component
- Works only when on chart or trading tabs
- Shows visual feedback via toast notifications

---

## CIT-044: Order Visualization on Chart

### Description
Visual markers on the price chart showing all executed and pending orders.

### Implementation
**File:** `/src/components/chart/order-markers.tsx`

### Features
- **Order Markers** - Visual representation of orders on chart
  - Green arrow up (▲) for filled buy orders
  - Red arrow down (▼) for filled sell orders
  - Orange circles for limit orders
  - Squares for stop orders
- **Order Info** - Hover to see details
  - Order ID, price, quantity, filled amount
  - Entry time visualization
- **Filtering** - Show/hide by order status
  - Pending orders
  - Filled orders
  - Cancelled orders
  - Stop orders

### Usage
```typescript
import { useOrderMarkers, type OrderMarker } from '@/components/chart/order-markers';

const orders: OrderMarker[] = [
  {
    id: 'order-1',
    time: Math.floor(Date.now() / 1000),
    price: 95000,
    side: 'BUY',
    type: 'LIMIT',
    status: 'FILLED',
    quantity: 0.1,
    symbol: 'BTCUSDT',
    createdAt: Date.now(),
  },
];

const markers = useOrderMarkers(orders);
```

### Marker Types
| Shape | Order Type | Color |
|-------|------------|-------|
| Arrow Up | Market Buy (filled) | Green #26a69a |
| Arrow Down | Market Sell (filled) | Red #ef5350 |
| Circle | Limit orders | Varies by status |
| Square | Stop orders | Orange #ff9800 |

---

## CIT-047: E2E Testing with Playwright

### Description
End-to-end testing framework for automated testing of critical user flows.

### Implementation
**Config:** `/playwright.config.ts`
**Tests:** `/tests/e2e/*.spec.ts`

### Test Suites
1. **Dashboard Tests** (`dashboard.spec.ts`)
   - Page load verification
   - Widget visibility
   - Navigation
   - Responsive design
   - Accessibility checks

2. **Chart Tests** (`chart.spec.ts`)
   - Chart rendering
   - Symbol/timeframe switching
   - Indicator panel
   - Hotkeys
   - Multi-chart mode

3. **Trading Tests** (`trading.spec.ts`)
   - Trading form validation
   - Buy/Sell dialogs
   - Position management
   - Order history

4. **Bot Tests** (`bots.spec.ts`)
   - Bot management
   - Start/stop functionality
   - Configuration

### Running Tests
```bash
# Run all E2E tests
bunx playwright test

# Run specific test file
bunx playwright test dashboard.spec.ts

# Run with UI
bunx playwright test --ui

# Generate test report
bunx playwright show-report
```

### Test Configuration
- **Browsers:** Chromium (Desktop, Mobile, Tablet)
- **Base URL:** http://localhost:3000
- **Timeout:** 60 seconds per test
- **Retries:** 2 (in CI)

---

## CIT-048: Multi-Chart Mode

### Description
Multiple synchronized charts in a grid layout for monitoring multiple trading pairs.

### Implementation
**File:** `/src/components/chart/multi-chart-panel.tsx`

### Features
- **Layout Presets:**
  - 2 Horizontal (side by side)
  - 2 Vertical (stacked)
  - 3 Mixed (1 large + 2 small)
  - 4 Grid (2x2)
  - 6 Grid (2x3)

- **Interactivity:**
  - Drag & drop to rearrange
  - Resize charts by dragging corners
  - Independent symbol/timeframe per chart
  - Add/remove charts dynamically

- **Configuration:**
  - Layout persistence
  - Custom layouts
  - Grid snap-to-grid

### Usage
```typescript
import { MultiChartPanel } from '@/components/chart/multi-chart-panel';

<MultiChartPanel
  renderChart={(symbol, timeframe, chartId) => (
    <PriceChart symbol={symbol} timeframe={timeframe} />
  )}
  containerWidth={1200}
/>
```

### Keyboard Navigation
- Navigate between charts with arrow keys
- Focus chart for detailed view
- Escape to exit focus mode

---

## CIT-049: One-Click Trading

### Description
Execute trades instantly by clicking on the chart at desired price level.

### Implementation
**File:** `/src/components/chart/one-click-trading.tsx`

### Features
- **Click to Trade:**
  - Click below current price → Buy dialog
  - Click above current price → Sell dialog
  - Pre-filled with clicked price

- **Quick Size Buttons:**
  - 1%, 5%, 10%, 25%, 50%, 100% of available balance

- **Risk Management:**
  - Auto-suggested stop loss (2% default)
  - Auto-suggested take profit (4% default)
  - Reduce-only option

- **Order Types:**
  - Market orders
  - Limit orders (at clicked price)

### Usage
```typescript
// Enable one-click trading in PriceChart
<Button onClick={() => setOneClickEnabled(!oneClickEnabled)}>
  {oneClickEnabled ? 'Disable' : 'Enable'} One-Click Trading
</Button>
```

### Configuration
```typescript
const config: OneClickTradingConfig = {
  enabled: true,
  defaultQuantity: 0.001,
  defaultType: 'MARKET',
  slippageTolerance: 0.5,
  showConfirmation: true,
  quickSizes: [1, 5, 10, 25, 50, 100],
  defaultStopLossPercent: 2,
  defaultTakeProfitPercent: 4,
};
```

### Safety Features
- Confirmation dialog required (configurable)
- Visual preview of order details
- Balance check before execution
- Position impact preview

---

## CIT-050: Sentry Integration

### Description
Error monitoring and performance tracking with Sentry.

### Implementation
**Files:**
- `/src/lib/monitoring/sentry.ts` - Main configuration
- `/sentry.client.config.ts` - Client-side init
- `/sentry.server.config.ts` - Server-side init
- `/sentry.edge.config.ts` - Edge runtime init

### Features
- **Error Tracking:**
  - Automatic error capture
  - Stack traces
  - User context
  - Breadcrumbs

- **Performance Monitoring:**
  - Transaction tracing
  - HTTP request timing
  - Database query timing

- **Session Replay:**
  - Record user sessions on error
  - Privacy masking for sensitive data

### Configuration
```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### Environment Variables
```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Manual Error Reporting
```typescript
import { captureTradeError, captureBotError, captureAPIError } from '@/lib/monitoring/sentry';

// Trade error
captureTradeError(error, {
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
});

// Bot error
captureBotError(error, {
  botId: 'bot-123',
  botType: 'GRID',
});

// API error
captureAPIError(error, {
  endpoint: '/api/trade',
  method: 'POST',
  statusCode: 500,
});
```

### Privacy
- API keys are masked
- Passwords are redacted
- Sensitive headers removed
- URL parameters filtered

---

## Summary Table

| CIT | Feature | Status | Dependencies |
|-----|---------|--------|--------------|
| 043 | Hotkeys | ✅ Complete | react-hotkeys-hook |
| 044 | Order Visualization | ✅ Complete | Built-in |
| 047 | E2E Testing | ✅ Complete | @playwright/test |
| 048 | Multi-Chart | ✅ Complete | react-grid-layout |
| 049 | One-Click Trading | ✅ Complete | Built-in |
| 050 | Sentry | ✅ Complete | @sentry/nextjs |

---

## Testing Checklist

### Hotkeys (CIT-043)
- [ ] B opens buy dialog
- [ ] S opens sell dialog
- [ ] Shift+E triggers close all
- [ ] Numbers 1-6 set correct percentages
- [ ] ? shows help panel
- [ ] Esc closes dialogs

### Order Visualization (CIT-044)
- [ ] Markers appear at correct prices
- [ ] Colors match order type/status
- [ ] Hover shows order details
- [ ] Filtering works correctly

### E2E Tests (CIT-047)
- [ ] All test suites pass
- [ ] No flaky tests
- [ ] Coverage includes critical paths

### Multi-Chart (CIT-048)
- [ ] Layout presets work
- [ ] Drag and drop functional
- [ ] Resize works
- [ ] Charts maintain state

### One-Click Trading (CIT-049)
- [ ] Click opens correct dialog
- [ ] Price is pre-filled
- [ ] Quick sizes calculate correctly
- [ ] Confirmation shows

### Sentry (CIT-050)
- [ ] Errors are captured
- [ ] Performance traces work
- [ ] Sensitive data is masked
- [ ] Session replay works

---

*Generated by CITARION Development Team*
