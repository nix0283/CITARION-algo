# CITARION UI Adaptation Recommendations

Based on comprehensive analysis of Cornix trading platform UI examples.

## Table of Contents
1. [Bot Panel Styling](#1-bot-panel-styling)
2. [Analytics Panel Styling](#2-analytics-panel-styling)
3. [Settings Form Styling](#3-settings-form-styling)
4. [Notification Panel Styling](#4-notification-panel-styling)
5. [Copy Trading Panel Styling](#5-copy-trading-panel-styling)
6. [Common Component Patterns](#6-common-component-patterns)
7. [Color System](#7-color-system)
8. [Typography System](#8-typography-system)
9. [Layout Patterns](#9-layout-patterns)

---

## 1. Bot Panel Styling

### 1.1 Grid Bot Panel

#### Layout Structure
```
┌─────────────────────────────────────────────────────────────┐
│ Grid Bot Card                                                │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Bot Header          │ │ Mini Chart / Grid Visualization │ │
│ │ Name: BTC/USDT      │ │                                  │ │
│ │ Status: ● Active    │ │    ╱╲    ╱╲                      │ │
│ │ Exchange: Binance   │ │   ╱  ╲  ╱  ╲                     │ │
│ └─────────────────────┘ │  ╱    ╲╱    ╲                    │ │
│                         └─────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Configuration                                                │
│ ┌─────────────────┐ ┌─────────────────┐                     │
│ │ Upper Price     │ │ Lower Price     │                     │
│ │ $45,000         │ │ $35,000         │                     │
│ └─────────────────┘ └─────────────────┘                     │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ Grid Quantity   │ │ Grid Profit %   │ │ Total Invested  │ │
│ │ 50 grids        │ │ 0.5% per grid   │ │ $5,000 USDT     │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Statistics                                                   │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│ │ ROI         │ │ Profit      │ │ Active Grids│ │ Win Rate│ │
│ │ +12.5%      │ │ +$625.00    │ │ 35/50       │ │ 78%     │ │
│ │ 📈 +2.3%    │ │ 🟢 Today    │ │             │ │         │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Actions                                                      │
│ [▶ Start] [⏸ Pause] [✏ Edit] [🗑 Delete] [📊 Details]      │
└─────────────────────────────────────────────────────────────┘
```

#### Component Implementation
```tsx
// GridBotCard.tsx
const GridBotCard = ({ bot }) => {
  return (
    <Card className="rounded-md border border-gray-200 shadow-sm">
      {/* Header Section */}
      <div className="flex justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Avatar src={bot.exchangeIcon} size="sm" />
          <div>
            <h3 className="font-semibold text-text-primary">{bot.name}</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${
                bot.active ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <span className="text-text-secondary">
                {bot.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        <MiniGridChart data={bot.gridData} />
      </div>

      {/* Configuration Section */}
      <div className="p-4 border-b border-gray-100">
        <h4 className="text-sm font-medium text-text-secondary mb-3">
          Configuration
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <ConfigItem label="Upper Price" value={`$${bot.upperPrice}`} />
          <ConfigItem label="Lower Price" value={`$${bot.lowerPrice}`} />
          <ConfigItem label="Grid Quantity" value={`${bot.grids} grids`} />
          <ConfigItem label="Grid Profit" value={`${bot.profitPerGrid}%`} />
        </div>
      </div>

      {/* Statistics Section */}
      <div className="p-4 grid grid-cols-4 gap-3">
        <StatCard 
          label="ROI" 
          value={`${bot.roi}%`}
          trend={bot.roiTrend}
          color={bot.roi >= 0 ? 'success' : 'error'}
        />
        <StatCard label="Profit" value={`$${bot.profit}`} />
        <StatCard label="Active Grids" value={`${bot.activeGrids}/${bot.totalGrids}`} />
        <StatCard label="Win Rate" value={`${bot.winRate}%`} />
      </div>

      {/* Actions Section */}
      <div className="p-4 flex justify-end gap-2 border-t border-gray-100">
        <Button variant="primary" size="sm">
          {bot.active ? 'Pause' : 'Start'}
        </Button>
        <Button variant="default" size="sm">Edit</Button>
        <Button variant="default" size="sm">Details</Button>
      </div>
    </Card>
  );
};
```

### 1.2 DCA Bot Panel

#### Key Components
- **Entry Settings**: Trigger type, price conditions
- **Safety Orders**: Max orders, step percentage, volume scale
- **Take Profit**: TP levels, trailing stop, breakeven
- **Risk Management**: Max position, stop loss

```tsx
// DCA Bot specific patterns
const DCABotSections = {
  entry: {
    trigger: ['Price', 'RSI', 'MACD', 'Custom'],
    conditions: ['Above', 'Below', 'Crosses'],
  },
  safety: {
    maxSafetyOrders: { min: 0, max: 20, default: 5 },
    safetyOrderStep: { min: 0.5, max: 10, default: 2, unit: '%' },
    safetyOrderVolumeScale: { min: 1, max: 3, default: 1.5 },
  },
  takeProfit: {
    takeProfitCount: { min: 1, max: 10, default: 1 },
    trailingEnabled: true,
    breakevenEnabled: true,
  },
};
```

### 1.3 BB Bot (Bollinger Band) Panel

#### Configuration Fields
```tsx
const BollingerBandConfig = () => (
  <div className="space-y-4">
    {/* Indicator Settings */}
    <ConfigSection title="Bollinger Band Settings">
      <FormField label="Period">
        <Input type="number" defaultValue={20} />
      </FormField>
      <FormField label="Standard Deviation">
        <Input type="number" step="0.1" defaultValue={2} />
      </FormField>
      <FormField label="MA Type">
        <Select options={['SMA', 'EMA', 'WMA']} defaultValue="SMA" />
      </FormField>
    </ConfigSection>

    {/* Entry Conditions */}
    <ConfigSection title="Entry Conditions">
      <FormField label="Entry on">
        <Select options={['Lower Band Touch', 'Lower Band Cross', 'Custom']} />
      </FormField>
      <FormField label="Confirmation">
        <Checkbox>Require RSI confirmation</Checkbox>
      </FormField>
    </ConfigSection>

    {/* Exit Conditions */}
    <ConfigSection title="Exit Conditions">
      <FormField label="Exit on">
        <Select options={['Upper Band Touch', 'Middle Band', 'Upper Band Cross']} />
      </FormField>
    </ConfigSection>
  </div>
);
```

### 1.4 Argus Bot Panel (AI/ML)

#### Special Features
- Model selection with performance history
- Confidence threshold visualization
- Backtest results preview
- Feature importance chart

```tsx
const ArgusBotConfig = () => (
  <div className="space-y-6">
    {/* Model Selection */}
    <Card>
      <h4 className="font-medium mb-4">AI Model Configuration</h4>
      <FormField label="Model">
        <Select 
          options={[
            { value: 'lstm', label: 'LSTM Neural Network' },
            { value: 'transformer', label: 'Transformer' },
            { value: 'ensemble', label: 'Ensemble Model' },
          ]}
        />
      </FormField>
      
      {/* Confidence Slider */}
      <div className="mt-4">
        <label className="block text-sm mb-2">
          Confidence Threshold: {confidence}%
        </label>
        <Slider 
          value={confidence}
          onChange={setConfidence}
          marks={{ 0: '0%', 50: '50%', 100: '100%' }}
        />
        <p className="text-xs text-text-secondary mt-1">
          Higher = Fewer but more reliable trades
        </p>
      </div>
    </Card>

    {/* Performance Preview */}
    <Card>
      <h4 className="font-medium mb-4">Model Performance (30 days)</h4>
      <MiniChart data={modelPerformance} />
      <div className="grid grid-cols-3 gap-4 mt-4">
        <MetricCard label="Accuracy" value="73%" />
        <MetricCard label="Sharpe" value="1.85" />
        <MetricCard label="Max DD" value="-8.2%" />
      </div>
    </Card>
  </div>
);
```

---

## 2. Analytics Panel Styling

### 2.1 Performance Dashboard

#### Layout Pattern
```
┌──────────────────────────────────────────────────────────────────┐
│ Performance Analytics                          [1D][1W][1M][1Y] │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │                     Equity Curve Chart                        │ │
│ │                                                                │ │
│ │    $12,000 ─┬────────────────────────────────────────────    │ │
│ │              │                        ╱───────               │ │
│ │    $10,000 ─┤           ╱─────────╱                         │ │
│ │              │     ╱────╱                                     │ │
│ │     $8,000 ─┤────╱                                            │ │
│ │              │                                                 │ │
│ │     $6,000 ─┴─────────────────────────────────────────────    │ │
│ │              Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec  │ │
│ └──────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ Total Profit│ │ Win Rate    │ │ Max Drawdown│ │ Sharpe Ratio│ │
│ │             │ │             │ │             │ │             │ │
│ │   +$2,450   │ │    67.3%    │ │    -8.5%    │ │     2.14    │ │
│ │   +12.25%   │ │   ▲ +2.1%   │ │   ▼ -1.2%   │ │   ▲ +0.32   │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┐ ┌──────────────────────────┐       │
│ │    Profit by Day         │ │    Trade Distribution   │       │
│ │    (Bar Chart)           │ │    (Donut Chart)        │       │
│ │                          │ │                          │       │
│ │  Mon ▓▓▓▓▓▓▓▓ $450      │ │     ▓▓▓ Win (67%)       │       │
│ │  Tue ▓▓▓▓▓ $280         │ │     ▓▓▓ Loss (28%)      │       │
│ │  Wed ▓▓▓▓▓▓▓ $320       │ │     ▓ Breakeven (5%)    │       │
│ │  Thu ▓▓▓ $150           │ │                          │       │
│ │  Fri ▓▓▓▓▓▓▓▓▓ $620     │ │                          │       │
│ └──────────────────────────┘ └──────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Backtesting Statistics Cards

```tsx
// BacktestingStatisticCard Pattern
const StatisticCard = ({ label, value, subValue, trend, icon }) => {
  const trendColor = trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-gray-500';
  const trendIcon = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
  
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-secondary">{label}</span>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-text-primary">
          {value}
        </span>
        {subValue && (
          <span className="text-sm text-text-secondary">{subValue}</span>
        )}
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-1 ${trendColor}`}>
          <span>{trendIcon}</span>
          <span className="text-sm">{Math.abs(trend)}%</span>
        </div>
      )}
    </div>
  );
};
```

### 2.3 Metrics Grid

```tsx
const metricsConfig = [
  { key: 'totalProfit', label: 'Total Profit', format: 'currency', trend: true },
  { key: 'winRate', label: 'Win Rate', format: 'percentage', trend: true },
  { key: 'maxDrawdown', label: 'Max Drawdown', format: 'percentage', inverse: true },
  { key: 'sharpeRatio', label: 'Sharpe Ratio', format: 'decimal' },
  { key: 'totalTrades', label: 'Total Trades', format: 'number' },
  { key: 'avgTradeDuration', label: 'Avg Duration', format: 'duration' },
  { key: 'profitFactor', label: 'Profit Factor', format: 'decimal' },
  { key: 'expectancy', label: 'Expectancy', format: 'currency' },
];

const MetricsGrid = ({ data }) => (
  <div className="grid grid-cols-4 gap-4">
    {metricsConfig.map(metric => (
      <StatisticCard
        key={metric.key}
        label={metric.label}
        value={formatValue(data[metric.key], metric.format)}
        trend={data[`${metric.key}Trend`]}
      />
    ))}
  </div>
);
```

---

## 3. Settings Form Styling

### 3.1 Form Layout Pattern

```tsx
const SettingsForm = ({ section }) => (
  <div className="max-w-2xl">
    {/* Section Header */}
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-text-primary">
        {section.title}
      </h2>
      <p className="text-text-secondary mt-1">{section.description}</p>
    </div>

    {/* Form Content */}
    <div className="space-y-6">
      {section.fields.map((field, idx) => (
        <FormField key={idx} field={field} />
      ))}
    </div>

    {/* Actions */}
    <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-gray-200">
      <Button variant="default">Cancel</Button>
      <Button variant="primary">Save Changes</Button>
    </div>
  </div>
);

const FormField = ({ field }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-text-primary">
      {field.label}
      {field.required && <span className="text-red-500 ml-1">*</span>}
    </label>
    
    {field.type === 'text' && (
      <Input 
        placeholder={field.placeholder}
        defaultValue={field.value}
        className="w-full"
      />
    )}
    
    {field.type === 'select' && (
      <Select 
        options={field.options}
        defaultValue={field.value}
        className="w-full"
      />
    )}
    
    {field.type === 'toggle' && (
      <Switch checked={field.value} />
    )}
    
    {field.type === 'number' && (
      <Input 
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        defaultValue={field.value}
      />
    )}
    
    {field.helpText && (
      <p className="text-xs text-text-secondary">{field.helpText}</p>
    )}
  </div>
);
```

### 3.2 Settings Sections

```tsx
const settingsSections = {
  account: {
    title: 'Account & Security',
    fields: [
      { label: 'Email', type: 'text', value: 'user@example.com' },
      { label: 'Password', type: 'password', value: '••••••••' },
      { label: 'Two-Factor Authentication', type: 'toggle', value: false },
      { label: 'Session Timeout', type: 'select', options: ['15 min', '30 min', '1 hour', 'Never'] },
    ],
  },
  
  notifications: {
    title: 'Notification Preferences',
    fields: [
      { label: 'Email Notifications', type: 'toggle', value: true },
      { label: 'Push Notifications', type: 'toggle', value: true },
      { label: 'Trade Alerts', type: 'toggle', value: true },
      { label: 'Signal Alerts', type: 'toggle', value: false },
      { label: 'Error Alerts', type: 'toggle', value: true },
    ],
  },
  
  trading: {
    title: 'Trading Defaults',
    fields: [
      { label: 'Default Leverage', type: 'number', min: 1, max: 125, value: 10 },
      { label: 'Default Order Type', type: 'select', options: ['Market', 'Limit'] },
      { label: 'Confirm Before Trading', type: 'toggle', value: true },
      { label: 'Default Time-in-Force', type: 'select', options: ['GTC', 'IOC', 'FOK'] },
    ],
  },
  
  risk: {
    title: 'Risk Management',
    fields: [
      { label: 'Max Position Size (%)', type: 'number', min: 1, max: 100, value: 10 },
      { label: 'Max Daily Loss (%)', type: 'number', min: 1, max: 50, value: 5 },
      { label: 'Auto Stop Loss', type: 'toggle', value: true },
      { label: 'Default Stop Loss (%)', type: 'number', min: 0.5, max: 50, step: 0.5, value: 2 },
    ],
  },
};
```

---

## 4. Notification Panel Styling

### 4.1 Notification List Pattern

```tsx
const NotificationPanel = () => (
  <div className="w-96 bg-white border-l border-gray-200">
    {/* Header */}
    <div className="p-4 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">Notifications</h3>
        <button className="text-sm text-primary-500 hover:text-primary-600">
          Mark all read
        </button>
      </div>
      {/* Filter Tabs */}
      <div className="flex gap-2 mt-3">
        {['All', 'Trades', 'Signals', 'System'].map(tab => (
          <button
            key={tab}
            className="px-3 py-1 text-sm rounded-full bg-gray-100 hover:bg-gray-200"
          >
            {tab}
          </button>
        ))}
      </div>
    </div>

    {/* Notification List */}
    <div className="overflow-y-auto h-[calc(100vh-140px)]">
      {notifications.map(notification => (
        <NotificationItem key={notification.id} {...notification} />
      ))}
    </div>
  </div>
);

const NotificationItem = ({ type, title, message, time, read, actions }) => {
  const icons = {
    trade: <CheckCircle className="text-green-500" />,
    signal: <Bell className="text-blue-500" />,
    error: <AlertCircle className="text-red-500" />,
    warning: <AlertTriangle className="text-orange-500" />,
    bot: <Bot className="text-purple-500" />,
  };

  return (
    <div className={`
      p-4 border-b border-gray-100 
      ${!read ? 'bg-blue-50' : 'bg-white'}
      hover:bg-gray-50 cursor-pointer
    `}>
      <div className="flex gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-1">
          {icons[type]}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-text-primary truncate">
              {title}
            </h4>
            {!read && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1 line-clamp-2">
            {message}
          </p>
          <span className="text-xs text-text-tertiary mt-2 block">
            {formatRelativeTime(time)}
          </span>
          
          {/* Action Buttons */}
          {actions && (
            <div className="flex gap-2 mt-2">
              {actions.map(action => (
                <button
                  key={action.label}
                  className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

---

## 5. Copy Trading Panel Styling

### 5.1 Trader Card Pattern

```tsx
const TraderCard = ({ trader }) => {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar src={trader.avatar} size={48} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-text-primary">{trader.name}</h3>
              {trader.verified && (
                <Badge variant="verified" icon={<CheckCircle size={12} />}>
                  Verified
                </Badge>
              )}
            </div>
            <span className="text-sm text-text-secondary">
              {trader.followers.toLocaleString()} followers
            </span>
          </div>
        </div>

        {/* Performance Chart */}
        <div className="h-16 mb-4">
          <MiniLineChart data={trader.performanceData} />
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <MetricDisplay 
            label="ROI" 
            value={`${trader.roi > 0 ? '+' : ''}${trader.roi}%`}
            color={trader.roi >= 0 ? 'text-green-500' : 'text-red-500'}
          />
          <MetricDisplay 
            label="Win Rate" 
            value={`${trader.winRate}%`}
          />
          <MetricDisplay 
            label="Max DD" 
            value={`${trader.maxDrawdown}%`}
            color="text-red-500"
          />
        </div>

        {/* Trading Info */}
        <div className="text-sm text-text-secondary mb-4">
          <div className="flex justify-between">
            <span>Trading Since</span>
            <span>{formatDate(trader.joinedAt)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Total Trades</span>
            <span>{trader.totalTrades.toLocaleString()}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1">
            Copy Trader
          </Button>
          <Button variant="default">
            <Info size={16} />
          </Button>
        </div>
      </div>
    </Card>
  );
};
```

### 5.2 Copy Trading Dashboard

```tsx
const CopyTradingDashboard = () => (
  <div className="space-y-6">
    {/* Active Copies */}
    <section>
      <h2 className="text-lg font-semibold mb-4">Active Copies</h2>
      <div className="grid grid-cols-2 gap-4">
        {activeCopies.map(copy => (
          <ActiveCopyCard key={copy.id} {...copy} />
        ))}
      </div>
    </section>

    {/* Top Performers */}
    <section>
      <h2 className="text-lg font-semibold mb-4">Top Performers</h2>
      <div className="grid grid-cols-3 gap-4">
        {topTraders.map(trader => (
          <TraderCard key={trader.id} trader={trader} />
        ))}
      </div>
    </section>

    {/* Risk Allocation */}
    <section>
      <h2 className="text-lg font-semibold mb-4">Risk Allocation</h2>
      <Card>
        <RiskAllocationSettings />
      </Card>
    </section>
  </div>
);
```

---

## 6. Common Component Patterns

### 6.1 Card Component

```tsx
const Card = ({ children, className, hover = false }) => (
  <div className={`
    bg-white rounded-lg border border-gray-200 shadow-sm
    ${hover ? 'hover:shadow-md transition-shadow' : ''}
    ${className || ''}
  `}>
    {children}
  </div>
);
```

### 6.2 Time Range Selector

```tsx
const TimeRangeSelector = ({ value, onChange }) => {
  const ranges = ['1D', '1W', '1M', '3M', '1Y', 'All'];
  
  return (
    <div className="flex gap-1">
      {ranges.map(range => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={`
            px-3 py-1 text-sm font-medium rounded-md transition-colors
            ${value === range 
              ? 'bg-primary-500 text-white' 
              : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
            }
          `}
        >
          {range}
        </button>
      ))}
    </div>
  );
};
```

### 6.3 Filter Dropdown

```tsx
const FilterDropdown = ({ label, icon, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 hover:border-gray-300"
      >
        {icon}
        <span className="text-sm">{label}</span>
        {selected.length > 0 && (
          <Badge variant="primary" size="sm">{selected.length}</Badge>
        )}
        <ChevronDown size={14} />
      </button>
      
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-2">
            <input 
              type="text"
              placeholder="Search..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {options.map(option => (
              <label
                key={option.value}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <Checkbox
                  checked={selected.includes(option.value)}
                  onChange={() => onChange(option.value)}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
          <div className="p-2 border-t border-gray-200 flex justify-end gap-2">
            <Button size="sm" variant="default" onClick={() => onChange([])}>
              Reset
            </Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
```

### 6.4 Data Table

```tsx
const DataTable = ({ columns, data, sortable, pagination }) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map(col => (
              <th
                key={col.key}
                className={`
                  px-4 py-3 text-left text-sm font-medium text-text-secondary
                  ${sortable && col.sortable ? 'cursor-pointer hover:bg-gray-50' : ''}
                `}
                onClick={() => {
                  if (sortable && col.sortable) {
                    setSortKey(col.key);
                    setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  {col.title}
                  {sortable && col.sortable && sortKey === col.key && (
                    sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr 
              key={row.id || idx}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-sm">
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      
      {pagination && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <span className="text-sm text-text-secondary">
            Showing {pagination.from} to {pagination.to} of {pagination.total}
          </span>
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  );
};
```

---

## 7. Color System

### 7.1 Primary Colors

```css
:root {
  /* Primary Blue */
  --color-primary: #3272FE;
  --color-primary-hover: #5c95ff;
  --color-primary-active: #2155d9;
  --color-primary-bg: #EFF4FF;
  --color-primary-border: #adcfff;
}

/* Tailwind equivalents */
.primary-500 { @apply bg-[#3272FE] text-white; }
.primary-400 { @apply bg-[#5c95ff] text-white; }
.primary-600 { @apply bg-[#2155d9] text-white; }
.primary-bg { @apply bg-[#EFF4FF] text-primary-600; }
```

### 7.2 Semantic Colors

```css
:root {
  /* Success */
  --color-success: #14CB17;
  --color-success-bg: #f6ffed;
  --color-success-border: #b7eb8f;
  
  /* Error */
  --color-error: #ff4d4f;
  --color-error-bg: #fff2f0;
  --color-error-border: #ffccc7;
  
  /* Warning */
  --color-warning: #faad14;
  --color-warning-bg: #fffbe6;
  --color-warning-border: #ffe58f;
  
  /* Info */
  --color-info: #1677ff;
  --color-info-bg: #e6f4ff;
  --color-info-border: #91caff;
}
```

### 7.3 Neutral Colors

```css
:root {
  --color-text-primary: #2E3D5C;
  --color-text-secondary: #8992A3;
  --color-text-tertiary: #B9B9BB;
  --color-text-disabled: rgba(137,146,163,0.5);
  
  --color-border: rgba(137,146,163,0.19);
  --color-border-secondary: #f0f0f0;
  
  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #FAFAFA;
  --color-bg-tertiary: #F5F5F5;
}
```

---

## 8. Typography System

### 8.1 Font Stack

```css
:root {
  --font-family: 'NunitoSans', 'Inter', -apple-system, BlinkMacSystemFont, 
    'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 
    'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  --font-family-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', 
    Menlo, Courier, monospace;
}
```

### 8.2 Heading Scale

```tsx
const headingStyles = {
  h1: 'text-[38px] font-semibold leading-[1.21]',
  h2: 'text-[30px] font-semibold leading-[1.27]',
  h3: 'text-[24px] font-semibold leading-[1.33]',
  h4: 'text-[20px] font-semibold leading-[1.4]',
  h5: 'text-[16px] font-semibold leading-[1.5]',
};
```

### 8.3 Body Text

```tsx
const textStyles = {
  body: 'text-[14px] leading-[1.57]',
  small: 'text-[12px] leading-[1.67]',
  large: 'text-[16px] leading-[1.5]',
  
  // Weights
  regular: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};
```

---

## 9. Layout Patterns

### 9.1 Page Layout

```tsx
const PageLayout = ({ sidebar, header, children }) => (
  <div className="flex h-screen bg-gray-50">
    {/* Sidebar */}
    <aside className="w-64 bg-white border-r border-gray-200">
      {sidebar}
    </aside>
    
    {/* Main Content */}
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-gray-200 px-6">
        {header}
      </header>
      
      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  </div>
);
```

### 9.2 Panel Layout

```tsx
const PanelLayout = ({ leftPanel, mainContent, rightPanel }) => (
  <div className="flex gap-4 h-full">
    {/* Left Panel - Fixed Width */}
    <div className="w-80 flex-shrink-0">
      {leftPanel}
    </div>
    
    {/* Main Content - Flexible */}
    <div className="flex-1 min-w-0">
      {mainContent}
    </div>
    
    {/* Right Panel - Fixed Width */}
    {rightPanel && (
      <div className="w-80 flex-shrink-0">
        {rightPanel}
      </div>
    )}
  </div>
);
```

### 9.3 Grid Layouts

```tsx
// 4-column metric grid
<div className="grid grid-cols-4 gap-4">
  {metrics.map(m => <MetricCard key={m.key} {...m} />)}
</div>

// 3-column card grid
<div className="grid grid-cols-3 gap-6">
  {traders.map(t => <TraderCard key={t.id} trader={t} />)}
</div>

// 2-column settings layout
<div className="grid grid-cols-2 gap-6">
  <SettingsSection {...accountSettings} />
  <SettingsSection {...notificationSettings} />
</div>
```

---

## Summary

This document provides comprehensive UI adaptation recommendations based on analysis of the Cornix trading platform. Key takeaways:

1. **Use card-based layouts** for bot panels, statistics, and configuration sections
2. **Apply consistent color coding**: Green for profit/success, Red for loss/error, Blue for primary actions
3. **Implement proper hierarchy** with section headers, labels, and helper text
4. **Use standard spacing** of 4px increments (4, 8, 12, 16, 24, 32px)
5. **Apply 6px border radius** for cards, buttons, and inputs
6. **Use data visualization** (mini charts, progress bars) to display metrics
7. **Implement responsive layouts** with flexible panels and grids
