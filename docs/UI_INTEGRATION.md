# UI Integration Documentation

## Overview

This document describes the UI integration of Frequency Bot Panel, ML Filtering Panel, and ML Pipeline components into the main CITARION dashboard. The integration provides seamless navigation between different bot management panels and ML filtering tools.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CITARION UI                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │   Sidebar   │──────► Navigation State (activeTab)                        │
│  └─────────────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Main Content Area                            │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │                                                              │  │    │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │  │    │
│  │  │  │  Dashboard     │  │  Chart         │  │  Trading       │ │  │    │
│  │  │  └────────────────┘  └────────────────┘  └────────────────┘ │  │    │
│  │  │                                                              │  │    │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │  │    │
│  │  │  │  ML Filter     │  │  Hyperopt      │  │  Strategy Lab  │ │  │    │
│  │  │  │  (NEW)         │  │                │  │                │ │  │    │
│  │  │  └────────────────┘  └────────────────┘  └────────────────┘ │  │    │
│  │  │                                                              │  │    │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │  │    │
│  │  │  │  Grid Bot      │  │  DCA Bot       │  │  BB Bot        │ │  │    │
│  │  │  │  (MESH)        │  │  (SCALE)       │  │  (BAND)        │ │  │    │
│  │  │  └────────────────┘  └────────────────┘  └────────────────┘ │  │    │
│  │  │                                                              │  │    │
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │  │    │
│  │  │  │  Argus Bot     │  │  Orion Bot     │  │  Vision Bot    │ │  │    │
│  │  │  │  (PND)         │  │  (TRND)        │  │  (FCST)        │ │  │    │
│  │  │  └────────────────┘  └────────────────┘  └────────────────┘ │  │    │
│  │  │                                                              │  │    │
│  │  │  ┌────────────────────────────────────────────────────────┐ │  │    │
│  │  │  │          FREQUENCY BOT PANEL                          │ │  │    │
│  │  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │ │  │    │
│  │  │  │  │    HFT   │ │    MFT   │ │    LFT   │ │   LOGOS   │ │ │  │    │
│  │  │  │  │  Helios  │ │  Selene  │ │  Atlas   │ │  Meta Bot │ │ │  │    │
│  │  │  │  └──────────┘ └──────────┘ └──────────┘ └───────────┘ │ │  │    │
│  │  │  └────────────────────────────────────────────────────────┘ │  │    │
│  │  │                                                              │  │    │
│  │  │  ┌────────────────────────────────────────────────────────┐ │  │    │
│  │  │  │          ML FILTERING PANEL (NEW)                      │ │  │    │
│  │  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │ │  │    │
│  │  │  │  │ Overview │ │  Config  │ │   Test   │ │  Training │ │ │  │    │
│  │  │  │  └──────────┘ └──────────┘ └──────────┘ └───────────┘ │ │  │    │
│  │  │  └────────────────────────────────────────────────────────┘ │  │    │
│  │  │                                                              │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Navigation Structure

### Sidebar Categories

| Category | Description | Bots |
|----------|-------------|------|
| **Main** | Core functionality | Dashboard, Chart, Trading, Strategy Lab, Hyperopt, ML Filter |
| **Operational** | Market-making and scaling strategies | MESH (Grid), SCALE (DCA), BAND (BB) |
| **Institutional** | Advanced trading strategies | PND (Argus), TRND (Orion), FCST (Vision), RNG (Range), LMB (Lumibot) |
| **Frequency** | Time-based trading strategies | HFT (Helios), MFT (Selene), LFT (Atlas), FREQ Panel |

### Menu Items

```typescript
// Main navigation
{ id: "ml-filter", label: "ML Filter", icon: Filter, isNew: true }

// Frequency Bots navigation
{ id: "hft-bot", label: "HFT", code: "Helios", category: "frequency" }
{ id: "mft-bot", label: "MFT", code: "Selene", category: "frequency" }
{ id: "lft-bot", label: "LFT", code: "Atlas", category: "frequency" }
{ id: "frequency-bots", label: "FREQ Panel", code: "All + LOGOS", category: "frequency" }
```

## Components

### 1. ML Filtering Panel

**Location:** `/src/components/ml/ml-filtering-panel.tsx`

**Features:**
- ML Signal Filter management
- Lawrence Classifier integration
- Signal quality statistics
- Configuration management
- Filter testing interface
- Training data management

**Tabs:**
- **Overview**: Statistics, quality metrics, rejection reasons
- **Configuration**: Filter settings and component toggles
- **Test Filter**: Test signal filtering with custom parameters
- **Training**: Classifier training statistics and settings

**Usage:**

```tsx
import { MLFilteringPanel } from '@/components/ml/ml-filtering-panel'

// In page.tsx renderContent()
case "ml-filter":
  return <MLFilteringPanel />
```

**API Endpoints:**
- `GET /api/ml/filter` - Get filter config and stats
- `POST /api/ml/filter` - Filter a signal through ML pipeline
- `PUT /api/ml/filter` - Update filter configuration
- `GET /api/ml/stats` - Get comprehensive ML statistics
- `POST /api/ml/train` - Add training samples

### 2. Frequency Bot Panel

**Location:** `/src/components/bots/frequency-bot-panel.tsx`

**Features:**
- Unified control panel for HFT, MFT, LFT bots
- LOGOS Meta Bot integration
- Real-time status monitoring
- Start/Stop controls
- Win rate and PnL visualization
- Latency indicators (color-coded)
- Signal feed display

**Usage:**

```tsx
import { FrequencyBotPanel } from '@/components/bots/frequency-bot-panel'

// In page.tsx renderContent()
case "hft-bot":
case "mft-bot":
case "lft-bot":
case "frequency-bots":
  return <FrequencyBotPanel />
```

### 2. Sidebar Updates

**Location:** `/src/components/layout/sidebar.tsx`

**Changes:**
- Added "FREQ Panel" menu item
- Grouped under "Частотные" (Frequency) category
- Marked as NEW with badge
- Shows "All + LOGOS" code hint

### 3. Main Page Integration

**Location:** `/src/app/page.tsx`

**Changes:**
- Added import for FrequencyBotPanel
- Added cases for hft-bot, mft-bot, lft-bot, frequency-bots
- All route to the same FrequencyBotPanel component

## Data Flow

```
┌──────────────────┐     ┌────────────────────┐     ┌───────────────────┐
│  Sidebar Click   │────►│  setActiveTab()    │────►│  renderContent()  │
│  (Frequency)     │     │  Zustand Store     │     │  Switch Case      │
└──────────────────┘     └────────────────────┘     └───────────────────┘
                                                              │
                                                              ▼
                                                    ┌───────────────────┐
                                                    │ FrequencyBotPanel │
                                                    │                   │
                                                    │ ┌───────────────┐ │
                                                    │ │  API Calls    │ │
                                                    │ │  /bots/freq   │ │
                                                    │ │  /bots/logos  │ │
                                                    │ └───────────────┘ │
                                                    └───────────────────┘
```

## API Endpoints Used

### Frequency Bots API

```typescript
// GET /api/bots/frequency
const response = await fetch('/api/bots/frequency')
const { bots, systemStatus } = await response.json()

// POST /api/bots/frequency
await fetch('/api/bots/frequency', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'start', // or 'stop', 'configure'
    botCode: 'HFT',  // or 'MFT', 'LFT'
    config: { ... }
  })
})
```

### LOGOS API

```typescript
// GET /api/bots/logos
const response = await fetch('/api/bots/logos')
const { bot } = await response.json()

// POST /api/bots/logos
await fetch('/api/bots/logos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'start' // or 'stop', 'configure'
  })
})
```

## State Management

### Zustand Store

```typescript
// useCryptoStore
interface CryptoStore {
  activeTab: string
  setActiveTab: (tab: string) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  // ... other state
}
```

### Local Component State

```typescript
// FrequencyBotPanel
const [bots, setBots] = useState<BotInfo[]>([])
const [logosStatus, setLogosStatus] = useState<LogosStatus | null>(null)
const [signals, setSignals] = useState<SignalInfo[]>([])
const [loading, setLoading] = useState(true)
```

## Styling

### Category Colors

```typescript
const categoryStyles = {
  operational: { 
    icon: Activity, 
    color: 'text-blue-400', 
    bgColor: 'bg-blue-500/10' 
  },
  institutional: { 
    icon: Crown, 
    color: 'text-purple-400', 
    bgColor: 'bg-purple-500/10' 
  },
  frequency: { 
    icon: Cpu, 
    color: 'text-orange-400', 
    bgColor: 'bg-orange-500/10' 
  },
  meta: { 
    icon: Brain, 
    color: 'text-green-400', 
    bgColor: 'bg-green-500/10' 
  },
}
```

### Status Colors

```typescript
const statusStyles = {
  idle: { color: 'bg-gray-500', label: 'Idle' },
  starting: { color: 'bg-yellow-500', label: 'Starting' },
  running: { color: 'bg-green-500', label: 'Running' },
  stopping: { color: 'bg-yellow-500', label: 'Stopping' },
  error: { color: 'bg-red-500', label: 'Error' },
  paused: { color: 'bg-orange-500', label: 'Paused' },
}
```

### Latency Indicators

| Latency | Color | Class |
|---------|-------|-------|
| < 10ms | Green | `text-green-400` |
| 10-100ms | Yellow | `text-yellow-400` |
| > 100ms | Red | `text-red-400` |

## Real-time Updates

### Polling Interval

```typescript
// 5-second refresh interval
useEffect(() => {
  const interval = setInterval(doFetch, 5000)
  return () => clearInterval(interval)
}, [])
```

### Data Refresh

```typescript
const fetchAll = useCallback(async () => {
  await Promise.all([fetchBots(), fetchLogos()])
  setLoading(false)
  setRefreshing(false)
}, [])
```

## Best Practices

### 1. Avoid State Updates in Effects

```typescript
// ❌ Wrong - causes cascading renders
useEffect(() => {
  fetchAll()
}, [fetchAll])

// ✅ Correct - inline fetch with mounted flag
useEffect(() => {
  let mounted = true
  const doFetch = async () => {
    if (!mounted) return
    // fetch logic
  }
  doFetch()
  return () => { mounted = false }
}, [])
```

### 2. Use Consistent Error Handling

```typescript
try {
  const response = await fetch('/api/bots/frequency')
  if (!response.ok) throw new Error('Failed to fetch')
  const data = await response.json()
  setBots(data.bots)
} catch (error) {
  console.error('Error fetching bots:', error)
}
```

### 3. Cleanup Subscriptions

```typescript
useEffect(() => {
  const interval = setInterval(doFetch, 5000)
  return () => clearInterval(interval)
}, [])
```

## Troubleshooting

### Panel Not Rendering

1. Check that activeTab matches the case value
2. Verify FrequencyBotPanel import is correct
3. Check console for errors

### Data Not Loading

1. Verify API endpoint is accessible
2. Check network tab for failed requests
3. Verify response format matches expected types

### Status Not Updating

1. Check polling interval is active
2. Verify state updates use correct setter
3. Check for memory leaks in useEffect

## Future Enhancements

1. **WebSocket Integration**: Replace polling with real-time WebSocket updates
2. **Bot Configuration Modal**: Detailed configuration editor
3. **Signal History Charts**: Visual signal performance tracking
4. **Alert Integration**: Notifications for important events
5. **Keyboard Shortcuts**: Quick navigation between panels

## Next Steps

Based on the completed ML Integration and UI Integration work, the following enhancements are recommended:

### Immediate (Next Session)
1. **Training Data Collection** - Gather historical signal outcomes to train the Lawrence Classifier
2. **Signal Pipeline Testing** - Verify end-to-end signal flow with ML filtering
3. **WebSocket Integration** - Replace polling with real-time updates for both panels

### Short-term
1. **Model Evaluation Dashboard** - Track classifier accuracy over time
2. **Feature Importance Visualization** - Show which features affect predictions most
3. **Signal Performance Charts** - Visual signal tracking and quality metrics
4. **Alert Integration** - Notifications for ML filter events

### Medium-term
1. **Advanced Feature Engineering** - Add more predictive features to the classifier
2. **Ensemble Methods** - Combine multiple classifiers for improved accuracy
3. **Real-time Learning** - Continuous model updates with feedback loop
4. **Cross-bot ML Integration** - Share ML insights between all bots

### Long-term
1. **Deep Learning Integration** - Neural network-based signal classification
2. **Reinforcement Learning** - Self-optimizing trading strategies
3. **Multi-timeframe Analysis** - ML across different timeframes
4. **Market Regime Detection** - Advanced regime classification
