# Сравнение параметров Cornix и CITARION

## ✅ Полностью реализованные параметры

| Раздел | Параметр Cornix | Поле в CITARION | Статус |
|--------|----------------|---------------------|--------|
| **General** | | | |
| | Amount per Trade | `tradeAmount` + `amountType` | ✅ |
| | Percentage (3%) | `amountType: "PERCENTAGE"` | ✅ |
| | Fixed Amount | `amountType: "FIXED"` | ✅ |
| | Override | `amountOverride` | ✅ |
| | Close Trade on TP/SL before Entry | `closeOnTPSLBeforeEntry` | ✅ |
| | First Entry Grace Percentage | `firstEntryGracePercent` | ✅ |
| **Trailing** | | | |
| | Stop (Moving Target) | `trailingType: "MOVING_TARGET"` | ✅ |
| | Stop (Breakeven) | `trailingType: "BREAKEVEN"` | ✅ |
| | Trigger when target # reached | `trailingTriggerType + trailingTriggerValue` | ✅ |
| | Trigger when % above entry | `trailingTriggerType: "PERCENT_ABOVE_ENTRY"` | ✅ |
| | Moving 2-Target | `trailingType: "MOVING_2_TARGET"` | ✅ |
| | Percent Below Highest | `trailingType: "PERCENT_BELOW_HIGHEST"` | ✅ |
| **Strategies** | | | |
| | Entry Zone - Number of Targets | `entryZoneTargets` (1-10) | ✅ |
| | Entry Strategy - Evenly Divided | `entryStrategy: "EVENLY_DIVIDED"` | ✅ |
| | Entry Strategy - Custom (10-3-5-7) | `entryStrategy: "CUSTOM_RATIOS"` + `entryWeights` | ✅ |
| | Decreasing Exponential | `entryStrategy: "DECREASING_EXP"` | ✅ |
| | Increasing Exponential | `entryStrategy: "INCREASING_EXP"` | ✅ |
| | Take-Profit Strategy - One Target | `tpStrategy: "ONE_TARGET"` | ✅ |
| | Take-Profit Strategy - Multiple | `tpStrategy: "MULTIPLE_TARGETS"` + `tpTargetCount` | ✅ |
| | Take-Profit Strategy - All Targets | `tpStrategy: "ALL_TARGETS"` | ✅ |
| **Stop-Loss** | | | |
| | Default Stop-Loss | `defaultStopLoss` (null = Without) | ✅ |
| | Stop Timeout | `slTimeout` + `slTimeoutUnit` | ✅ |
| | Stop Type - Market | `slOrderType: "MARKET"` | ✅ |
| | Stop Type - Limit | `slOrderType: "LIMIT"` | ✅ |
| **Filters** | | | |
| | Max Trades | `maxOpenTrades` (1-20) | ✅ |
| | Interval Between Trades | `minTradeInterval` (минуты) | ✅ |
| | Blacklisted Symbols/Pairs | `blacklistedSymbols` | ✅ |
| **Margin** | | | |
| | Leverage | `leverage` (1-125x) | ✅ |
| | Leverage Override | `leverageOverride` | ✅ |
| | Mode - One-Way | `hedgeMode: false` | ✅ |
| | Mode - Hedge Mode | `hedgeMode: true` | ✅ |
| | Margin Mode - Isolated | `marginMode: "ISOLATED"` | ✅ |
| | Margin Mode - Crossed | `marginMode: "CROSSED"` | ✅ |
| **Signal Settings** | | | |
| | Signal Sources | `signalSources` | ✅ |
| | Ignore signals without SL | `ignoreSignalsWithoutSL` | ✅ |
| | Ignore signals without TP | `ignoreSignalsWithoutTP` | ✅ |
| | Min Risk/Reward Ratio | `minRiskRewardRatio` | ✅ |
| **Notifications** | | | |
| | Notify on Entry | `notifyOnEntry` | ✅ |
| | Notify on Exit | `notifyOnExit` | ✅ |
| | Notify on SL | `notifyOnSL` | ✅ |
| | Notify on TP | `notifyOnTP` | ✅ |
| | Notify on Error | `notifyOnError` | ✅ |
| | Notify on New Signal | `notifyOnNewSignal` | ✅ |
