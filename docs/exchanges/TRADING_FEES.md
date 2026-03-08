# Exchange Trading Fees

Comprehensive documentation of cryptocurrency exchange trading fees for accurate cost calculation in CITARION.

## Overview

### Fee Types

| Type | Description | When Applied |
|------|-------------|--------------|
| **Maker** | For adding liquidity | Limit orders that don't execute immediately |
| **Taker** | For removing liquidity | Market orders, immediate execution |
| **Funding** | Funding rate payment | Every 8 hours for futures positions |
| **Withdrawal** | For withdrawing funds | When withdrawing assets |

### How It Works in CITARION

```typescript
// In BotConfig model (prisma/schema.prisma)
model BotConfig {
  // Spot trading fees (decimal: 0.001 = 0.1%)
  spotMakerFee        Float    @default(0.001)   // 0.1%
  spotTakerFee        Float    @default(0.001)   // 0.1%
  
  // Futures trading fees (decimal: 0.0002 = 0.02%)
  futuresMakerFee     Float    @default(0.0002)  // 0.02%
  futuresTakerFee     Float    @default(0.0004)  // 0.04%
  
  // Slippage for market orders
  slippagePercent     Float    @default(0.0005)  // 0.05%
  
  useCustomFees       Boolean  @default(false)
}
```

---

## Fee Comparison (Non-VIP)

### Spot Trading

| Exchange | Maker | Taker | Token Discount |
|----------|-------|-------|----------------|
| **Binance** | 0.1% | 0.1% | 25% with BNB |
| **Bybit** | 0.1% | 0.1% | VIP discounts |
| **OKX** | 0.08% | 0.1% | Volume discounts |
| **Bitget** | 0.1% | 0.1% | Discounts with BGB |
| **BingX** | 0.1% | 0.1% | - |

### Futures Trading (USDT-M)

| Exchange | Maker | Taker | Notes |
|----------|-------|-------|-------|
| **Binance** | 0.02% | 0.04% | 10% discount with BNB |
| **Bybit** | 0.01% | 0.06% | Lower maker to attract liquidity |
| **OKX** | 0.02% | 0.05% | Negative maker for VIP |
| **Bitget** | 0.02% | 0.06% | Discounts with BGB |
| **BingX** | 0.02% | 0.05% | - |

---

## Binance

### Spot Fees (Non-VIP)

```
Maker: 0.1% (with BNB: 0.075%)
Taker: 0.1% (with BNB: 0.075%)
```

### Futures Fees (USDT-M)

```
Maker: 0.02% (with BNB: 0.018%)
Taker: 0.04% (with BNB: 0.036%)
```

### VIP Tiers

| Level | 30-Day Volume (USDT) | BNB Holding | Spot Maker/Taker | Futures Maker/Taker |
|-------|---------------------|-------------|------------------|---------------------|
| VIP 0 | < 1M | < 50 BNB | 0.1% / 0.1% | 0.02% / 0.04% |
| VIP 1 | ≥ 1M | ≥ 50 BNB | 0.09% / 0.1% | 0.016% / 0.04% |
| VIP 2 | ≥ 5M | ≥ 200 BNB | 0.08% / 0.1% | 0.014% / 0.035% |
| VIP 3 | ≥ 20M | ≥ 500 BNB | 0.06% / 0.08% | 0.012% / 0.032% |
| VIP 4 | ≥ 50M | ≥ 1000 BNB | 0.04% / 0.06% | 0.01% / 0.028% |
| VIP 5 | ≥ 100M | ≥ 2000 BNB | 0.02% / 0.04% | 0.008% / 0.024% |
| VIP 6 | ≥ 200M | ≥ 3500 BNB | 0% / 0.02% | 0.006% / 0.02% |
| VIP 7 | ≥ 500M | ≥ 6000 BNB | 0% / 0.016% | 0.004% / 0.016% |
| VIP 8 | ≥ 1B | ≥ 9000 BNB | 0% / 0.012% | 0.002% / 0.014% |
| VIP 9 | ≥ 2B | ≥ 11000 BNB | 0.016% / 0.025% | 0% / 0.012% |

### Source
- https://www.binance.com/en/fee/trading

---

## Bybit

### Spot Fees (Non-VIP)

```
Maker: 0.1%
Taker: 0.1%
```

### Futures Fees (Non-VIP)

```
Perpetual Maker: 0.01%
Perpetual Taker: 0.06%

Options Maker: 0.02%
Options Taker: 0.03%
```

### VIP Tiers

| Level | 30-Day Volume (USDT) | Spot Maker/Taker | Futures Maker/Taker |
|-------|---------------------|------------------|---------------------|
| Non-VIP | < 0 | 0.1% / 0.1% | 0.01% / 0.06% |
| VIP 1 | ≥ 50,000 | 0.09% / 0.1% | 0.008% / 0.055% |
| VIP 2 | ≥ 200,000 | 0.08% / 0.09% | 0.006% / 0.05% |
| VIP 3 | ≥ 500,000 | 0.075% / 0.08% | 0.005% / 0.045% |
| VIP 4 | ≥ 1,000,000 | 0.07% / 0.075% | 0.0045% / 0.04% |
| VIP 5 | ≥ 2,000,000 | 0.065% / 0.07% | 0.004% / 0.035% |
| Pro 1 | ≥ 5,000,000 | 0.06% / 0.065% | 0.003% / 0.03% |
| Pro 2 | ≥ 15,000,000 | 0.055% / 0.06% | 0.002% / 0.025% |
| Pro 3 | ≥ 50,000,000 | 0.05% / 0.055% | 0.001% / 0.02% |

### Sources
- https://www.bybit.com/en/announcement-info/fee-rate/
- https://www.bybit.com/en/help-center/article/Bybit-Fees-You-Need-to-Know

### Special Fees for CIS Countries

**Important:** Since March 7, 2024, Bybit applies increased fees for users from Russia and CIS countries.

#### CIS Countries List

- Russia (RU)
- Belarus (BY)
- Kazakhstan (KZ)
- Kyrgyzstan (KG)
- Tajikistan (TJ)
- Uzbekistan (UZ)
- Armenia (AM)
- Azerbaijan (AZ)
- Moldova (MD)

#### Fee Changes for CIS Users

| Product | Standard Fee | CIS Fee | Change |
|---------|-------------|---------|--------|
| **Perpetual Futures Maker** | 0.01% | **0.10%** | +0.09% |
| **Perpetual Futures Taker** | 0.06% | **0.10%** | +0.04% |
| **Spot Maker** | 0.1% | **0.3%** (from Jun 12, 2024) | +0.2% |
| **Spot Taker** | 0.1% | **0.3%** (from Jun 12, 2024) | +0.2% |

#### Bybit Kazakhstan

For users from Kazakhstan, there is a separate platform [Bybit.kz](https://www.bybit.kz) with local AFSA license:

```
Bybit Kazakhstan Trading Fees:
- Spot Maker: 0.1%
- Spot Taker: 0.1%
- P2P: 0% commission
```

**Note:** Users from Kazakhstan can use both the global Bybit platform and the local Bybit.kz.

#### P2P Fees for RUB

For P2P trading in Russian Rubles (RUB):
- Maker: up to **0.3%** when buying cryptocurrency with rubles
- Taker: depends on the advertisement

#### Code for Region Detection

```typescript
// Check if special fees apply to the user
export function isCISUser(countryCode: string): boolean {
  const cisCountries = [
    'RU', // Russia
    'BY', // Belarus
    'KZ', // Kazakhstan
    'KG', // Kyrgyzstan
    'TJ', // Tajikistan
    'UZ', // Uzbekistan
    'AM', // Armenia
    'AZ', // Azerbaijan
    'MD', // Moldova
  ]
  return cisCountries.includes(countryCode)
}

// Get actual Bybit fees
export function getBybitFees(countryCode: string, vipLevel: number = 0): FeeConfig {
  const isCIS = isCISUser(countryCode)
  
  if (isCIS && vipLevel === 0) {
    return {
      spot: { makerFee: 0.003, takerFee: 0.003 },       // 0.3% for CIS
      futures: { makerFee: 0.001, takerFee: 0.001 },    // 0.1% for CIS
    }
  }
  
  // Standard fees
  return {
    spot: { makerFee: 0.001, takerFee: 0.001 },         // 0.1%
    futures: { makerFee: 0.0001, takerFee: 0.0006 },    // 0.01% / 0.06%
  }
}
```

#### Sources

- [Bybit increases commissions for CIS countries](https://dapp.expert/news/bybit-increases-commissions-for-clients-from-russia-and-cis-countries) (March 7, 2024)
- [Upcoming Update to Spot Fees for Selected Regions](https://announcements.bybit.com/en/article/upcoming-update-to-spot-fees-for-users-in-selected-regions-bltedc1712c1c355b2c) (June 12, 2024)
- [Bybit Kazakhstan Fee Structure](https://www.bybit.kz/en-KAZ/help-center/article/Trading-Fee-Structure)

---

## OKX

### Spot Fees (Non-VIP)

```
Maker: 0.08%
Taker: 0.1%
```

### Futures Fees (Non-VIP)

```
Maker: 0.02%
Taker: 0.05%
```

### VIP Tiers

| Level | 30-Day Volume (USD) | OKB Holding | Spot Maker/Taker | Futures Maker/Taker |
|-------|--------------------| -----------|------------------|---------------------|
| LV1 | < 10,000 | < 500 OKB | 0.08% / 0.1% | 0.02% / 0.05% |
| LV2 | ≥ 10,000 | - | 0.07% / 0.09% | 0.018% / 0.045% |
| LV3 | ≥ 500,000 | ≥ 500 OKB | 0.06% / 0.08% | 0.015% / 0.04% |
| LV4 | ≥ 2,000,000 | ≥ 1,000 OKB | 0.04% / 0.06% | 0.01% / 0.03% |
| LV5 | ≥ 10,000,000 | ≥ 2,000 OKB | 0.02% / 0.04% | 0.005% / 0.02% |

### Negative Fees

OKX offers negative maker fees for VIP levels:
- LV5: Maker -0.005% (you receive for adding liquidity)

### Source
- https://www.okx.com/fees

---

## Bitget

### Spot Fees (Non-VIP)

```
Maker: 0.1%
Taker: 0.1%
```

### Futures Fees (Non-VIP)

```
Maker: 0.02%
Taker: 0.06%
```

### VIP Tiers

| Level | 30-Day Volume (USDT) | Spot Maker/Taker | Futures Maker/Taker |
|-------|---------------------|------------------|---------------------|
| VIP 0 | < 300,000 | 0.1% / 0.1% | 0.02% / 0.06% |
| VIP 1 | ≥ 300,000 | 0.08% / 0.1% | 0.018% / 0.055% |
| VIP 2 | ≥ 1,000,000 | 0.07% / 0.09% | 0.015% / 0.05% |
| VIP 3 | ≥ 3,000,000 | 0.05% / 0.08% | 0.012% / 0.045% |
| VIP 4 | ≥ 10,000,000 | 0.03% / 0.06% | 0.01% / 0.04% |
| PRO 1 | ≥ 30,000,000 | 0.02% / 0.05% | 0.008% / 0.035% |
| PRO 2 | ≥ 80,000,000 | 0.01% / 0.04% | 0.005% / 0.03% |
| PRO 3 | ≥ 200,000,000 | 0% / 0.03% | 0.003% / 0.025% |
| PRO 4 | ≥ 600,000,000 | 0% / 0.02% | 0% / 0.02% |
| PRO 5 | ≥ 1,500,000,000 | 0% / 0.015% | 0% / 0.015% |
| PRO 6 | ≥ 3,000,000,000 | 0% / 0.01% | 0% / 0.01% |

### Source
- https://www.bitget.com/fee

---

## BingX

### Spot Fees (Non-VIP)

```
Maker: 0.1%
Taker: 0.1%
```

### Standard Futures Fees (Non-VIP)

```
Maker: 0.02%
Taker: 0.05%
```

### Perpetual Futures Fees (Non-VIP)

```
Maker: 0.02%
Taker: 0.05%
```

### VIP Tiers

| Level | 30-Day Volume (USDT) | Spot Maker/Taker | Futures Maker/Taker |
|-------|---------------------|------------------|---------------------|
| VIP 0 | < 10,000 | 0.1% / 0.1% | 0.02% / 0.05% |
| VIP 1 | ≥ 10,000 | 0.035% / 0.06% | 0.018% / 0.045% |
| VIP 2 | ≥ 100,000 | 0.03% / 0.055% | 0.015% / 0.04% |
| VIP 3 | ≥ 500,000 | 0.025% / 0.05% | 0.012% / 0.035% |
| VIP 4 | ≥ 1,000,000 | 0.02% / 0.045% | 0.01% / 0.03% |
| VIP 5 | ≥ 5,000,000 | 0.015% / 0.04% | 0.008% / 0.025% |
| VIP 6 | ≥ 10,000,000 | 0.01% / 0.035% | 0.005% / 0.02% |
| VIP 7 | ≥ 50,000,000 | 0% / 0.03% | 0.003% / 0.015% |
| VIP 8 | ≥ 100,000,000 | 0% / 0.025% | 0% / 0.01% |

### Sources
- https://bingx.com/en/support/articles/360027240173-fee-schedule
- https://bingx.com/en/support/costs

---

## Fee Calculation in CITARION

### Fee Types

```typescript
// src/lib/fee-calculator.ts
export interface FeeConfig {
  makerFee: number    // Decimal: 0.0002 = 0.02%
  takerFee: number    // Decimal: 0.0004 = 0.04%
  slippage?: number   // For market orders
}

export const EXCHANGE_FEES: Record<string, FeeConfig> = {
  binance: {
    spot: { makerFee: 0.001, takerFee: 0.001 },      // 0.1%
    futures: { makerFee: 0.0002, takerFee: 0.0004 }, // 0.02% / 0.04%
  },
  bybit: {
    spot: { makerFee: 0.001, takerFee: 0.001 },      // 0.1%
    futures: { makerFee: 0.0001, takerFee: 0.0006 }, // 0.01% / 0.06%
  },
  okx: {
    spot: { makerFee: 0.0008, takerFee: 0.001 },     // 0.08% / 0.1%
    futures: { makerFee: 0.0002, takerFee: 0.0005 }, // 0.02% / 0.05%
  },
  bitget: {
    spot: { makerFee: 0.001, takerFee: 0.001 },      // 0.1%
    futures: { makerFee: 0.0002, takerFee: 0.0006 }, // 0.02% / 0.06%
  },
  bingx: {
    spot: { makerFee: 0.001, takerFee: 0.001 },      // 0.1%
    futures: { makerFee: 0.0002, takerFee: 0.0005 }, // 0.02% / 0.05%
  },
}
```

### Position Fee Calculation

```typescript
export function calculatePositionFees(params: {
  entryPrice: number
  exitPrice: number
  amount: number
  leverage: number
  makerFee: number
  takerFee: number
  orderType: 'market' | 'limit'
}): {
  openFee: number
  closeFee: number
  totalFee: number
  feePercent: number
} {
  const { entryPrice, exitPrice, amount, leverage, makerFee, takerFee, orderType } = params
  
  const positionValue = amount * entryPrice
  const closeValue = amount * exitPrice
  
  // Market orders = taker fee
  // Limit orders = maker fee (if not immediately filled)
  const feeRate = orderType === 'market' ? takerFee : makerFee
  
  const openFee = positionValue * takerFee  // Entry usually market
  const closeFee = closeValue * feeRate
  const totalFee = openFee + closeFee
  
  const pnl = (exitPrice - entryPrice) * amount
  const feePercent = (totalFee / Math.abs(pnl)) * 100
  
  return {
    openFee,
    closeFee,
    totalFee,
    feePercent,
  }
}
```

### Calculation Example

```typescript
const result = calculatePositionFees({
  entryPrice: 97000,
  exitPrice: 100000,
  amount: 0.1,        // BTC
  leverage: 10,
  makerFee: 0.0002,   // 0.02% (Binance futures maker)
  takerFee: 0.0004,   // 0.04% (Binance futures taker)
  orderType: 'market',
})

console.log(result)
// {
//   openFee: 3.88 USDT,      // 0.1 * 97000 * 0.0004
//   closeFee: 4.0 USDT,      // 0.1 * 100000 * 0.0004
//   totalFee: 7.88 USDT,
//   feePercent: 2.63%        // Of PnL
// }
```

---

## Funding Rate

### What is Funding?

Funding is a periodic payment between long and short positions on the futures market. Usually occurs every 8 hours (00:00, 08:00, 16:00 UTC).

### Funding Calculation

```typescript
export function calculateFunding(params: {
  positionSize: number      // In coins
  fundingRate: number       // Decimal: 0.0001 = 0.01%
  markPrice: number         // Mark price
}): number {
  const { positionSize, fundingRate, markPrice } = params
  return positionSize * markPrice * fundingRate
}

// Example
const funding = calculateFunding({
  positionSize: 0.1,      // BTC
  fundingRate: 0.0001,    // 0.01%
  markPrice: 97000,
})
// Result: 0.97 USDT
// Positive = pay (if LONG)
// Negative = receive (if LONG)
```

### Average Funding Rates

| Exchange | BTC/USDT | ETH/USDT | Typical Range |
|----------|----------|----------|---------------|
| Binance | 0.01% | 0.01% | -0.1% ~ +0.1% |
| Bybit | 0.01% | 0.01% | -0.1% ~ +0.1% |
| OKX | 0.01% | 0.01% | -0.05% ~ +0.05% |
| Bitget | 0.01% | 0.01% | -0.1% ~ +0.1% |
| BingX | 0.01% | 0.01% | -0.1% ~ +0.1% |

---

## Recommendations for CITARION

### 1. Use Current Fees

```typescript
// Update fees when changing exchange or VIP level
async function getExchangeFees(exchangeId: string, vipLevel: number) {
  // Can be stored in DB and updated periodically
  const fees = await db.exchangeFees.findFirst({
    where: { exchangeId, vipLevel }
  })
  return fees
}
```

### 2. Consider Token Discounts

| Exchange | Token | Discount |
|----------|-------|----------|
| Binance | BNB | 25% on spot, 10% on futures |
| Bitget | BGB | Up to 50% |
| OKX | OKB | By volume |

### 3. Minimize Costs

- Use **Limit orders** (lower maker fee)
- Enable **BNB/BGB/OKB** for discounts
- Reach **VIP levels** by trading volume

### 4. Include in PnL

```typescript
// Real PnL including fees
function calculateRealPnL(params: {
  grossPnL: number
  openFee: number
  closeFee: number
  totalFunding: number
}): number {
  return params.grossPnL - params.openFee - params.closeFee - params.totalFunding
}
```

---

## Data Updates

Fees can change. Recommended:

1. **Check monthly** official exchange pages
2. **Store in DB** for flexible updates
3. **Notify users** about significant changes

### Storage Model

```prisma
model ExchangeFees {
  id            String   @id @default(cuid())
  exchangeId    String   // binance, bybit, etc.
  vipLevel      Int      @default(0)
  
  spotMaker     Float    @default(0.001)
  spotTaker     Float    @default(0.001)
  
  futuresMaker  Float    @default(0.0002)
  futuresTaker  Float    @default(0.0004)
  
  updatedAt     DateTime @updatedAt
  
  @@unique([exchangeId, vipLevel])
}
```

---

## Sources

| Exchange | URL |
|----------|-----|
| Binance | https://www.binance.com/en/fee/trading |
| Bybit | https://www.bybit.com/en/announcement-info/fee-rate/ |
| Bybit Help | https://www.bybit.com/en/help-center/article/Bybit-Fees-You-Need-to-Know |
| OKX | https://www.okx.com/fees |
| Bitget | https://www.bitget.com/fee |
| BingX | https://bingx.com/en/support/articles/360027240173-fee-schedule |
| BingX Costs | https://bingx.com/en/support/costs |
