# ЭТАП 4: ПЛАН ADVANCED FEATURES & SCALING

**Дата:** 2025-01-XX  
**Версия документа:** 1.0.0  
**Статус:** Готов к реализации  
**Зависимости:** Этапы 1-3 должны быть завершены

---

## 4.1. MULTI-TENANT ARCHITECTURE

### 4.1.1. Концепция

```
┌─────────────────────────────────────────────────────────────────────┐
│                      MULTI-TENANT ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     TENANT ISOLATION                          │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐               │    │
│  │  │  Tenant A │  │  Tenant B │  │  Tenant C │               │    │
│  │  │  User 1   │  │  User 2   │  │  User 3   │               │    │
│  │  │  API Keys │  │  API Keys │  │  API Keys │               │    │
│  │  │  Positions│  │  Positions│  │  Positions│               │    │
│  │  │  Bots     │  │  Bots     │  │  Bots     │               │    │
│  │  └───────────┘  └───────────┘  └───────────┘               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     SHARED SERVICES                           │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │    │
│  │  │   Auth      │ │   Market    │ │   Cache     │            │    │
│  │  │   Service   │ │   Data      │ │   (Redis)   │            │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1.2. Реализация

```typescript
// src/lib/multi-tenant/types.ts

interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'free' | 'basic' | 'pro' | 'enterprise'
  limits: TenantLimits
  settings: TenantSettings
  createdAt: Date
}

interface TenantLimits {
  maxBots: number
  maxPositions: number
  maxApiKeys: number
  maxUsers: number
  rateLimit: number
  features: string[]
}

interface TenantSettings {
  allowedExchanges: string[]
  defaultLeverage: number
  riskLimits: RiskLimits
  notifications: NotificationSettings
}

// Middleware for tenant isolation
class TenantMiddleware {
  async identifyTenant(request: Request): Promise<Tenant | null> {
    // By subdomain: tenant1.citarion.com
    const host = request.headers.get('host')
    const subdomain = host?.split('.')[0]
    
    // By header: X-Tenant-ID
    const tenantId = request.headers.get('X-Tenant-ID')
    
    // By API key
    const apiKey = request.headers.get('X-API-Key')
    
    return this.resolveTenant({ subdomain, tenantId, apiKey })
  }
}
```

### 4.1.3. Оценка времени: 8 часов

---

## 4.2. API GATEWAY

### 4.2.1. Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                                   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      ROUTING                                  │    │
│  │  /api/v1/* → Internal Services                               │    │
│  │  /api/v2/* → New Versioned APIs                              │    │
│  │  /ws/*     → WebSocket Proxy                                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    MIDDLEWARE                                 │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │    │
│  │  │   Auth    │ │   Rate    │ │   Tenant  │ │   Audit   │   │    │
│  │  │   Check   │ │   Limit   │ │   Isolate │ │   Log     │   │    │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    CIRCUIT BREAKER                            │    │
│  │  Detect failures → Open circuit → Half-open → Close         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2.2. Реализация

```typescript
// src/lib/gateway/api-gateway.ts

class ApiGateway {
  private routes: Map<string, RouteConfig>
  private rateLimiter: DistributedRateLimiter
  private circuitBreaker: CircuitBreaker
  private auditLogger: AuditLogger

  async handleRequest(request: Request): Promise<Response> {
    const startTime = Date.now()

    try {
      // 1. Identify tenant
      const tenant = await this.tenantMiddleware.identifyTenant(request)
      if (!tenant) {
        return new Response('Tenant not found', { status: 404 })
      }

      // 2. Rate limit check
      const rateCheck = await this.rateLimiter.check(tenant.id)
      if (!rateCheck.allowed) {
        return new Response('Rate limit exceeded', { status: 429 })
      }

      // 3. Authentication
      const user = await this.authenticate(request, tenant)
      if (!user) {
        return new Response('Unauthorized', { status: 401 })
      }

      // 4. Authorization
      const route = this.matchRoute(request)
      if (!this.authorize(user, route)) {
        return new Response('Forbidden', { status: 403 })
      }

      // 5. Circuit breaker
      const service = await this.circuitBreaker.execute(route.service, async () => {
        return this.proxyRequest(request, route)
      })

      // 6. Audit log
      await this.auditLogger.log({
        tenantId: tenant.id,
        userId: user.id,
        method: request.method,
        path: new URL(request.url).pathname,
        status: service.status,
        duration: Date.now() - startTime,
      })

      return service

    } catch (error) {
      // Error handling
      await this.handleError(error, request)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}
```

### 4.2.3. Оценка времени: 6 часов

---

## 4.3. ADVANCED RISK MANAGEMENT

### 4.3.1. Компоненты

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RISK MANAGEMENT SYSTEM                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     VAR CALCULATOR                            │    │
│  │  Historical VaR, Parametric VaR, Monte Carlo VaR            │    │
│  │  Confidence levels: 90%, 95%, 99%                            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   STRESS TESTING                              │    │
│  │  Historical scenarios: 2008 crash, COVID crash, etc.        │    │
│  │  Hypothetical scenarios: +10%, -20%, flash crash            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    KILL SWITCH                                │    │
│  │  Global, Per-exchange, Per-symbol, Per-bot                   │    │
│  │  Auto-activation on limit breach                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                 POSITION LIMITER                             │    │
│  │  Max position size, Max leverage, Max correlation            │    │
│  │  Sector limits, Asset class limits                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3.2. VaR Calculator

```typescript
// src/lib/risk/var-calculator.ts

class VaRCalculator {
  // Historical VaR
  calculateHistoricalVaR(
    returns: number[],
    confidence: number = 0.95
  ): { var: number; expectedShortfall: number } {
    const sorted = [...returns].sort((a, b) => a - b)
    const index = Math.floor((1 - confidence) * sorted.length)
    
    const varValue = sorted[index]
    const esReturns = sorted.slice(0, index)
    const expectedShortfall = esReturns.reduce((a, b) => a + b, 0) / esReturns.length

    return { var: varValue, expectedShortfall }
  }

  // Parametric VaR (Normal distribution)
  calculateParametricVaR(
    returns: number[],
    confidence: number = 0.95
  ): { var: number; expectedShortfall: number } {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const std = Math.sqrt(
      returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length
    )

    const zScore = this.getZScore(confidence)
    const varValue = mean - zScore * std
    const expectedShortfall = mean - std * Math.exp(-zScore ** 2 / 2) / ((1 - confidence) * Math.sqrt(2 * Math.PI))

    return { var: varValue, expectedShortfall }
  }

  // Monte Carlo VaR
  async calculateMonteCarloVaR(
    positions: Position[],
    scenarios: number = 10000
  ): Promise<{ var: number; es: number; distribution: number[] }> {
    const pnls: number[] = []

    for (let i = 0; i < scenarios; i++) {
      const scenarioPnl = this.simulateScenario(positions)
      pnls.push(scenarioPnl)
    }

    pnls.sort((a, b) => a - b)
    const index = Math.floor(0.05 * scenarios) // 95% confidence
    const varValue = pnls[index]
    const es = pnls.slice(0, index).reduce((a, b) => a + b, 0) / index

    return { var: varValue, es, distribution: pnls }
  }
}
```

### 4.3.3. Оценка времени: 8 часов

---

## 4.4. ADVANCED ANALYTICS

### 4.4.1. Компоненты

```typescript
// src/lib/analytics/advanced-analytics.ts

class AdvancedAnalytics {
  // Correlation matrix
  calculateCorrelationMatrix(returns: Record<string, number[]>): CorrelationMatrix {
    const symbols = Object.keys(returns)
    const matrix: number[][] = []

    for (let i = 0; i < symbols.length; i++) {
      matrix[i] = []
      for (let j = 0; j < symbols.length; j++) {
        matrix[i][j] = this.pearsonCorrelation(
          returns[symbols[i]],
          returns[symbols[j]]
        )
      }
    }

    return { symbols, matrix }
  }

  // Portfolio optimization (Markowitz)
  optimizePortfolio(
    returns: Record<string, number[]>,
    riskFreeRate: number = 0.02
  ): { weights: Record<string, number>; expectedReturn: number; volatility: number; sharpe: number } {
    // Mean-variance optimization
    const symbols = Object.keys(returns)
    const n = symbols.length

    // Calculate expected returns and covariance
    const expectedReturns = symbols.map(s => this.annualizedReturn(returns[s]))
    const covMatrix = this.covarianceMatrix(returns)

    // Efficient frontier optimization
    const optimalWeights = this.optimizeSharpeRatio(expectedReturns, covMatrix, riskFreeRate)

    const weights: Record<string, number> = {}
    symbols.forEach((s, i) => weights[s] = optimalWeights[i])

    const expectedReturn = this.portfolioReturn(optimalWeights, expectedReturns)
    const volatility = this.portfolioVolatility(optimalWeights, covMatrix)
    const sharpe = (expectedReturn - riskFreeRate) / volatility

    return { weights, expectedReturn, volatility, sharpe }
  }

  // Performance attribution
  attributePerformance(
    portfolioReturns: number[],
    benchmarkReturns: number[],
    factors: Record<string, number[]>
  ): AttributionResult {
    // Brinson-Hood-Beebower attribution
    const allocation = this.calculateAllocationEffect()
    const selection = this.calculateSelectionEffect()
    const interaction = this.calculateInteractionEffect()

    return {
      totalReturn: this.totalReturn(portfolioReturns),
      benchmarkReturn: this.totalReturn(benchmarkReturns),
      activeReturn: this.activeReturn(portfolioReturns, benchmarkReturns),
      allocationEffect: allocation,
      selectionEffect: selection,
      interactionEffect: interaction,
      factorExposures: this.calculateFactorExposures(portfolioReturns, factors),
    }
  }
}
```

### 4.4.2. Оценка времени: 6 часов

---

## 4.5. MOBILE APPLICATION (PWA)

### 4.5.1. Компоненты

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MOBILE PWA                                   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    CORE FEATURES                              │    │
│  │  • Push notifications                                        │    │
│  │  • Offline mode (service worker)                             │    │
│  │  • Home screen install                                       │    │
│  │  • Background sync                                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    MOBILE UI                                  │    │
│  │  • Bottom navigation                                         │    │
│  │  • Swipe gestures                                            │    │
│  │  • Pull to refresh                                           │    │
│  │  • Responsive charts                                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    NOTIFICATIONS                              │    │
│  │  • Trade alerts                                              │    │
│  │  • Risk warnings                                             │    │
│  │  • Bot status updates                                        │    │
│  │  • Signal notifications                                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.5.2. Service Worker

```typescript
// public/sw.js

const CACHE_NAME = 'citarion-v1'
const OFFLINE_URL = '/offline.html'

const CACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_ASSETS))
  )
  self.skipWaiting()
})

// Fetch event - Network first, cache fallback
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    )
  } else {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response)
            })
          }
          return response
        })
        return cached || fetchPromise
      })
    )
  }
})

// Push notification
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: data.url,
      actions: data.actions,
    })
  )
})
```

### 4.5.3. Оценка времени: 10 часов

---

## 4.6. BACKUP & DISASTER RECOVERY

### 4.6.1. Стратегия

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DISASTER RECOVERY PLAN                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     BACKUP STRATEGY                           │    │
│  │  • Full backup: Weekly (S3)                                  │    │
│  │  • Incremental backup: Daily (S3)                            │    │
│  │  • WAL archiving: Continuous                                 │    │
│  │  • Retention: 30 days                                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     RPO / RTO                                 │    │
│  │  • RPO (Recovery Point Objective): 1 hour                    │    │
│  │  • RTO (Recovery Time Objective): 4 hours                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   FAILOVER                                    │    │
│  │  • Primary: Region A                                         │    │
│  │  • Secondary: Region B (hot standby)                         │    │
│  │  • DNS failover: CloudFlare                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.6.2. Backup Script

```bash
#!/bin/bash
# scripts/backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/$DATE"
S3_BUCKET="s3://citarion-backups"

# PostgreSQL backup
pg_dump -Fc citarion > "$BACKUP_DIR/postgres_$DATE.dump"

# Redis backup
redis-cli --rdb "$BACKUP_DIR/redis_$DATE.rdb"

# Prisma schema backup
cp prisma/schema.prisma "$BACKUP_DIR/"

# Upload to S3
aws s3 sync "$BACKUP_DIR" "$S3_BUCKET/$DATE/"

# Cleanup old backups (keep 30 days)
find /backups -type d -mtime +30 -exec rm -rf {} +

echo "Backup completed: $DATE"
```

### 4.6.3. Оценка времени: 4 часа

---

## 4.7. COMPLIANCE & REGULATORY

### 4.7.1. Компоненты

- KYC/AML integration
- Transaction monitoring
- Sanctions screening
- Audit trail (SOC2)
- Data retention policies
- Privacy controls (GDPR)

### 4.7.2. Оценка времени: 8 часов

---

## СВОДНАЯ ОЦЕНКА ВРЕМЕНИ (ЭТАП 4)

| Раздел | Описание | Время |
|--------|----------|-------|
| 4.1 | Multi-tenant Architecture | 8ч |
| 4.2 | API Gateway | 6ч |
| 4.3 | Advanced Risk Management | 8ч |
| 4.4 | Advanced Analytics | 6ч |
| 4.5 | Mobile Application (PWA) | 10ч |
| 4.6 | Backup & Disaster Recovery | 4ч |
| 4.7 | Compliance & Regulatory | 8ч |
| **ИТОГО** | | **50 часов (~7 дней)** |

---

## ПОСЛЕДОВАТЕЛЬНОСТЬ РЕАЛИЗАЦИИ (ЭТАП 4)

```
Day 1-2:
├── 4.1 Multi-tenant Architecture
└── 4.2 API Gateway

Day 3:
├── 4.3 Advanced Risk Management
└── 4.4 Advanced Analytics

Day 4-5:
├── 4.5 Mobile PWA
└── 4.5 Service Worker

Day 6:
├── 4.6 Backup & DR
└── 4.7 Compliance

Day 7:
└── Final testing & documentation
```

---

## ИТОГОВАЯ СТАТИСТИКА

| Этап | Время | Статус |
|------|-------|--------|
| **Этап 0** | Аудит | ✅ Завершён |
| **Этап 1** | 141 час | ✅ План готов |
| **Этап 2** | 171 час | ✅ Компоненты созданы |
| **Этап 3** | 31 час | ✅ Компоненты созданы |
| **Этап 4** | 50 часов | ✅ План готов |
| **ИТОГО** | **393 часа (~49 дней)** | |

---

*План Этапа 4 завершён. Жду подтверждения для начала реализации.*
