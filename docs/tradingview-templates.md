# TradingView Alert Templates

This document provides ready-to-use alert templates for TradingView webhooks with CITARION.

## Table of Contents

1. [Setup Instructions](#setup-instructions)
2. [Security Configuration](#security-configuration)
3. [Signal Templates](#signal-templates)
4. [Pine Script Examples](#pine-script-examples)
5. [Troubleshooting](#troubleshooting)

---

## Setup Instructions

### 1. Webhook URL

Configure your TradingView alert to send webhooks to:

```
https://your-domain.com/api/webhook/tradingview
```

### 2. Message Format

TradingView sends alerts as JSON or plain text. CITARION supports both formats.

### 3. Alert Settings

In TradingView Alert Dialog:
- **Webhook URL**: Your CITARION endpoint
- **Message**: Use one of the templates below
- **Alert Name**: Optional - helps identify the alert

---

## Security Configuration

### HMAC-SHA256 Signature

CITARION supports signature validation for secure webhook communication.

#### Environment Variable

```bash
TRADINGVIEW_WEBHOOK_SECRET=your-secret-key-here
```

#### TradingView Alert Configuration

When `TRADINGVIEW_WEBHOOK_SECRET` is set, include the signature in your alert:

```json
{
  "signature": "{{timenow}}",
  "data": { ... }
}
```

**Note**: TradingView Pro/Pro+ accounts support custom webhook payloads with variables.

---

## Signal Templates

### LONG Signals

#### Template 1: Simple Long (Futures)

```json
{
  "symbol": "{{ticker}}",
  "direction": "LONG",
  "entry": {{close}},
  "stopLoss": {{close_1}},
  "takeProfit1": {{close_1}},
  "takeProfit2": {{close_1}},
  "leverage": 10
}
```

**Plain Text Alternative:**
```
#{{ticker}}
LONG
Entry: {{close}}
TP1: {{close_1}}
TP2: {{close_1}}
SL: {{close_1}}
Leverage: 10x
```

#### Template 2: Cornix-Style Long (Futures)

```
⚡⚡ #{{ticker}} ⚡⚡
Exchanges: Binance Futures
Signal Type: Regular (Long)
Leverage: Isolated (10X)
Entry Zone: {{close}} - {{close_1}}
Take-Profit Targets: 1) {{close_1}} 2) {{close_1}} 3) {{close_1}}
Stop Targets: 1) {{close_1}}
```

#### Template 3: Long with Multiple Entries

```json
{
  "symbol": "{{ticker}}",
  "direction": "LONG",
  "entryZone": {
    "min": {{low}},
    "max": {{high}}
  },
  "entries": [
    {{close}},
    {{low}}
  ],
  "stopLoss": {{low_1}},
  "takeProfits": [
    {"price": {{close_1}}, "percent": 30},
    {"price": {{close_1}}, "percent": 40},
    {"price": {{close_1}}, "percent": 30}
  ],
  "leverage": 10,
  "marketType": "FUTURES"
}
```

---

### SHORT Signals

#### Template 1: Simple Short (Futures)

```json
{
  "symbol": "{{ticker}}",
  "direction": "SHORT",
  "entry": {{close}},
  "stopLoss": {{high}},
  "takeProfit1": {{low}},
  "takeProfit2": {{low}},
  "leverage": 10
}
```

**Plain Text Alternative:**
```
#{{ticker}}
SHORT
Entry: {{close}}
TP1: {{low}}
TP2: {{low}}
SL: {{high}}
Leverage: 10x
```

#### Template 2: Cornix-Style Short (Futures)

```
⚡⚡ #{{ticker}} ⚡⚡
Exchanges: Binance Futures
Signal Type: Regular (Short)
Leverage: Isolated (10X)
Entry Zone: {{close}} - {{close_1}}
Take-Profit Targets: 1) {{low}} 2) {{low}} 3) {{low}}
Stop Targets: 1) {{high}}
```

#### Template 3: Short with Trailing Stop

```json
{
  "symbol": "{{ticker}}",
  "direction": "SHORT",
  "entry": {{close}},
  "stopLoss": {{high}},
  "takeProfits": [
    {"price": {{low}}, "percent": 50},
    {"price": {{low}}, "percent": 50}
  ],
  "trailingStop": {
    "activationPrice": {{low}},
    "callbackRate": 1.5
  },
  "leverage": 10
}
```

---

### SPOT Signals

#### Template 1: Simple Buy (Spot)

```json
{
  "symbol": "{{ticker}}",
  "direction": "LONG",
  "entry": {{close}},
  "stopLoss": {{low}},
  "takeProfits": [
    {{close_1}},
    {{close_1}}
  ],
  "marketType": "SPOT"
}
```

**Plain Text Alternative:**
```
#{{ticker}} SPOT
Buy: {{close}}
Take-Profit: {{close_1}}, {{close_1}}
Stop: {{low}}
```

#### Template 2: Cornix-Style Spot

```
#{{ticker}} SPOT
Exchanges: Binance
Buy: {{close}}
Take-Profit: {{close_1}}, {{close_1}}, {{close_1}}
Stop: {{low}}
```

---

### CLOSE Signals

#### Template 1: Close Position

```json
{
  "symbol": "{{ticker}}",
  "action": "CLOSE"
}
```

**Plain Text Alternative:**
```
#{{ticker}} CLOSE
```

#### Template 2: Close with Market

```json
{
  "symbol": "{{ticker}}",
  "action": "CLOSE",
  "orderType": "MARKET"
}
```

---

## Pine Script Examples

### Example 1: RSI Strategy with Webhook Alerts

```pinescript
//@version=5
strategy("RSI Strategy with Webhook", overlay=true)

// Parameters
rsiLength = input.int(14, "RSI Length")
rsiOverbought = input.int(70, "Overbought Level")
rsiOversold = input.int(30, "Oversold Level")
leverage = input.int(10, "Leverage")

// RSI Calculation
rsi = ta.rsi(close, rsiLength)

// Entry Conditions
longCondition = ta.crossover(rsi, rsiOversold)
shortCondition = ta.crossunder(rsi, rsiOverbought)

// Signal Generation
if longCondition
    strategy.entry("Long", strategy.long)
    
    // Webhook alert for LONG
    alert('{"symbol":"' + syminfo.ticker + '","direction":"LONG","entry":' + str.tostring(close) + 
          ',"stopLoss":' + str.tostring(close * 0.98) + 
          ',"takeProfit1":' + str.tostring(close * 1.02) + 
          ',"takeProfit2":' + str.tostring(close * 1.04) + 
          ',"leverage":' + str.tostring(leverage) + '}', alert.freq_per_bar)

if shortCondition
    strategy.entry("Short", strategy.short)
    
    // Webhook alert for SHORT
    alert('{"symbol":"' + syminfo.ticker + '","direction":"SHORT","entry":' + str.tostring(close) + 
          ',"stopLoss":' + str.tostring(close * 1.02) + 
          ',"takeProfit1":' + str.tostring(close * 0.98) + 
          ',"takeProfit2":' + str.tostring(close * 0.96) + 
          ',"leverage":' + str.tostring(leverage) + '}', alert.freq_per_bar)

// Close on opposite condition
if ta.crossunder(rsi, rsiOverbought) and strategy.position_size > 0
    strategy.close("Long")
    alert('{"symbol":"' + syminfo.ticker + '","action":"CLOSE"}', alert.freq_per_bar)

if ta.crossover(rsi, rsiOversold) and strategy.position_size < 0
    strategy.close("Short")
    alert('{"symbol":"' + syminfo.ticker + '","action":"CLOSE"}', alert.freq_per_bar)
```

### Example 2: MACD Strategy with Multi-TP

```pinescript
//@version=5
strategy("MACD Strategy with Multi-TP", overlay=true)

// MACD Parameters
fastLength = input.int(12, "Fast Length")
slowLength = input.int(26, "Slow Length")
signalLength = input.int(9, "Signal Length")

// MACD Calculation
[macdLine, signalLine, histLine] = ta.macd(close, fastLength, slowLength, signalLength)

// Entry Conditions
longCondition = ta.crossover(macdLine, signalLine)
shortCondition = ta.crossunder(macdLine, signalLine)

// Position Management
if longCondition
    strategy.entry("Long", strategy.long)
    
    // Calculate levels
    sl = close * 0.97
    tp1 = close * 1.02
    tp2 = close * 1.04
    tp3 = close * 1.06
    
    // Cornix-style alert
    alert('#' + syminfo.ticker + '\nLONG\nEntry: ' + str.tostring(close, "#.##") + 
          '\nTP1: ' + str.tostring(tp1, "#.##") + 
          '\nTP2: ' + str.tostring(tp2, "#.##") + 
          '\nTP3: ' + str.tostring(tp3, "#.##") + 
          '\nSL: ' + str.tostring(sl, "#.##") + 
          '\nLeverage: 10x', alert.freq_per_bar)

if shortCondition
    strategy.entry("Short", strategy.short)
    
    sl = close * 1.03
    tp1 = close * 0.98
    tp2 = close * 0.96
    tp3 = close * 0.94
    
    alert('#' + syminfo.ticker + '\nSHORT\nEntry: ' + str.tostring(close, "#.##") + 
          '\nTP1: ' + str.tostring(tp1, "#.##") + 
          '\nTP2: ' + str.tostring(tp2, "#.##") + 
          '\nTP3: ' + str.tostring(tp3, "#.##") + 
          '\nSL: ' + str.tostring(sl, "#.##") + 
          '\nLeverage: 10x', alert.freq_per_bar)
```

### Example 3: Bollinger Bands Breakout

```pinescript
//@version=5
strategy("BB Breakout with Webhook", overlay=true)

// BB Parameters
length = input.int(20, "BB Length")
mult = input.float(2.0, "BB Multiplier")

// BB Calculation
[middle, upper, lower] = ta.bb(close, length, mult)

// Entry Conditions
longBreakout = ta.crossover(close, upper)
shortBreakout = ta.crossunder(close, lower)

// Long Breakout
if longBreakout
    strategy.entry("Long", strategy.long)
    
    entry = close
    sl = middle
    tp1 = close + (close - middle)
    tp2 = close + 2 * (close - middle)
    
    alert(json = '{"symbol":"' + syminfo.ticker + 
          '","direction":"LONG","signalType":"BREAKOUT","entry":' + str.tostring(entry) + 
          ',"stopLoss":' + str.tostring(sl) + 
          ',"takeProfits":[{"price":' + str.tostring(tp1) + '},{"price":' + str.tostring(tp2) + '}]' +
          ',"leverage":10}', alert.freq_per_bar)

// Short Breakout
if shortBreakout
    strategy.entry("Short", strategy.short)
    
    entry = close
    sl = middle
    tp1 = close - (middle - close)
    tp2 = close - 2 * (middle - close)
    
    alert('{"symbol":"' + syminfo.ticker + 
          '","direction":"SHORT","signalType":"BREAKOUT","entry":' + str.tostring(entry) + 
          ',"stopLoss":' + str.tostring(sl) + 
          ',"takeProfits":[{"price":' + str.tostring(tp1) + '},{"price":' + str.tostring(tp2) + '}]' +
          ',"leverage":10}', alert.freq_per_bar)

// Plot BB
plot(upper, "Upper BB", color=color.blue)
plot(lower, "Lower BB", color=color.blue)
plot(middle, "Middle BB", color=color.orange)
```

---

## Troubleshooting

### Common Issues

#### 1. Signature Validation Failed

**Error**: `Unauthorized - Invalid signature`

**Solution**:
- Ensure `TRADINGVIEW_WEBHOOK_SECRET` is set correctly
- Verify the secret key matches in TradingView alert settings
- Check that the signature is sent in `X-TradingView-Signature` header

#### 2. Rate Limit Exceeded

**Error**: `Rate limit exceeded - Too many requests`

**Solution**:
- Wait for the retry period (indicated in `retryAfter` field)
- Reduce alert frequency in TradingView
- Consolidate multiple alerts into fewer messages

**Rate Limit**: 10 requests per minute per IP

#### 3. Signal Not Parsed

**Error**: `Could not parse TradingView alert`

**Solution**:
- Ensure the message contains a valid coin pair (e.g., BTC/USDT)
- Check that entry/exit targets are properly formatted
- Use one of the templates above as reference

#### 4. Market Type Incorrect

**Issue**: Signal executed as FUTURES when intended for SPOT

**Solution**:
- Include "SPOT" or "спот" keyword in the message
- Add `"marketType": "SPOT"` to JSON payloads

---

## Response Codes

| Code | Description |
|------|-------------|
| 200 | Success - Signal processed |
| 400 | Bad Request - Invalid signal format |
| 401 | Unauthorized - Invalid or missing signature |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

---

## Response Headers

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per minute (10) |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Retry-After` | Seconds until rate limit resets (only on 429) |

---

## Best Practices

1. **Use Signature Validation** in production environments
2. **Test alerts** with small positions first
3. **Monitor rate limits** using response headers
4. **Use proper risk management** with stop-loss and take-profit levels
5. **Log all alerts** for debugging and audit purposes

---

## Support

For issues or questions:
- Check CITARION documentation
- Review webhook logs in the database
- Contact support with `signalId` from response
