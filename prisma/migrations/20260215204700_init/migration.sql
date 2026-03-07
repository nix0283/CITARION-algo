-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "image" TEXT,
    "currentMode" TEXT NOT NULL DEFAULT 'DEMO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'DEMO',
    "exchangeId" TEXT NOT NULL DEFAULT 'binance',
    "exchangeType" TEXT NOT NULL DEFAULT 'spot',
    "exchangeName" TEXT NOT NULL DEFAULT 'Binance',
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "apiPassphrase" TEXT,
    "apiUid" TEXT,
    "subAccount" TEXT,
    "isTestnet" BOOLEAN NOT NULL DEFAULT false,
    "virtualBalance" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "entryPrice" REAL,
    "entryTime" DATETIME,
    "amount" REAL NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "exitPrice" REAL,
    "exitTime" DATETIME,
    "closeReason" TEXT,
    "stopLoss" REAL,
    "takeProfits" TEXT,
    "pnl" REAL NOT NULL DEFAULT 0,
    "pnlPercent" REAL NOT NULL DEFAULT 0,
    "fee" REAL NOT NULL DEFAULT 0,
    "signalSource" TEXT,
    "signalId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "positionId" TEXT,
    CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "totalAmount" REAL NOT NULL,
    "filledAmount" REAL NOT NULL DEFAULT 0,
    "avgEntryPrice" REAL NOT NULL,
    "currentPrice" REAL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "stopLoss" REAL,
    "takeProfit" REAL,
    "trailingStop" TEXT,
    "unrealizedPnl" REAL NOT NULL DEFAULT 0,
    "realizedPnl" REAL NOT NULL DEFAULT 0,
    "totalFundingPaid" REAL NOT NULL DEFAULT 0,
    "totalFundingReceived" REAL NOT NULL DEFAULT 0,
    "lastFundingTime" DATETIME,
    "openFee" REAL NOT NULL DEFAULT 0,
    "closeFee" REAL NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalIdCounter" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'signal_counter',
    "lastId" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "signalId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceChannel" TEXT,
    "sourceMessage" TEXT,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "marketType" TEXT NOT NULL DEFAULT 'FUTURES',
    "entryPrices" TEXT,
    "entryZone" TEXT,
    "entryWeights" TEXT,
    "takeProfits" TEXT,
    "stopLoss" REAL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "leverageType" TEXT NOT NULL DEFAULT 'ISOLATED',
    "signalType" TEXT NOT NULL DEFAULT 'REGULAR',
    "trailingConfig" TEXT,
    "amountPerTrade" REAL,
    "riskPercentage" REAL,
    "exchanges" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "processedAt" DATETIME,
    "closedAt" DATETIME,
    "closeReason" TEXT,
    "executedTrades" TEXT,
    "positionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BotConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "exchangeId" TEXT NOT NULL DEFAULT 'binance',
    "exchangeType" TEXT NOT NULL DEFAULT 'futures',
    "tradeAmount" REAL NOT NULL DEFAULT 100,
    "amountType" TEXT NOT NULL DEFAULT 'FIXED',
    "amountOverride" BOOLEAN NOT NULL DEFAULT false,
    "closeOnTPSLBeforeEntry" BOOLEAN NOT NULL DEFAULT true,
    "firstEntryGracePercent" REAL NOT NULL DEFAULT 0,
    "trailingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trailingType" TEXT DEFAULT 'BREAKEVEN',
    "trailingValue" REAL,
    "trailingTriggerType" TEXT,
    "trailingTriggerValue" REAL,
    "trailingStopPercent" REAL,
    "entryStrategy" TEXT NOT NULL DEFAULT 'EVENLY_DIVIDED',
    "entryWeights" TEXT,
    "entryZoneTargets" INTEGER NOT NULL DEFAULT 1,
    "tpStrategy" TEXT NOT NULL DEFAULT 'ONE_TARGET',
    "tpTargetCount" INTEGER NOT NULL DEFAULT 1,
    "tpCustomRatios" TEXT,
    "defaultStopLoss" REAL,
    "slTimeout" INTEGER NOT NULL DEFAULT 0,
    "slTimeoutUnit" TEXT NOT NULL DEFAULT 'SECONDS',
    "slOrderType" TEXT NOT NULL DEFAULT 'MARKET',
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "leverageOverride" BOOLEAN NOT NULL DEFAULT false,
    "hedgeMode" BOOLEAN NOT NULL DEFAULT false,
    "marginMode" TEXT NOT NULL DEFAULT 'ISOLATED',
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 5,
    "minTradeInterval" INTEGER NOT NULL DEFAULT 5,
    "allowedSymbols" TEXT,
    "blacklistedSymbols" TEXT,
    "signalSources" TEXT,
    "ignoreSignalsWithoutSL" BOOLEAN NOT NULL DEFAULT false,
    "ignoreSignalsWithoutTP" BOOLEAN NOT NULL DEFAULT false,
    "minRiskRewardRatio" REAL,
    "spotMakerFee" REAL NOT NULL DEFAULT 0.001,
    "spotTakerFee" REAL NOT NULL DEFAULT 0.001,
    "futuresMakerFee" REAL NOT NULL DEFAULT 0.0002,
    "futuresTakerFee" REAL NOT NULL DEFAULT 0.0004,
    "slippagePercent" REAL NOT NULL DEFAULT 0.0005,
    "useCustomFees" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnEntry" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnExit" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSL" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnTP" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnError" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnNewSignal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BotConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BotConfig_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'BINANCE',
    "price" REAL NOT NULL,
    "bidPrice" REAL,
    "askPrice" REAL,
    "high24h" REAL,
    "low24h" REAL,
    "volume24h" REAL,
    "priceChangePercent" REAL,
    "lastUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT,
    "tradeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TradingViewWebhookLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawPayload" TEXT NOT NULL,
    "contentType" TEXT,
    "symbol" TEXT,
    "action" TEXT,
    "direction" TEXT,
    "price" REAL,
    "stopLoss" REAL,
    "takeProfit" REAL,
    "takeProfits" TEXT,
    "leverage" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "parseError" TEXT,
    "confidence" REAL,
    "tradeId" TEXT,
    "errorMessage" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "FundingRateHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'binance',
    "fundingRate" REAL NOT NULL,
    "fundingTime" DATETIME NOT NULL,
    "markPrice" REAL,
    "indexPrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FundingPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "fundingRate" REAL NOT NULL,
    "payment" REAL NOT NULL,
    "fundingTime" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundingPayment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PnLHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "balance" REAL NOT NULL,
    "equity" REAL NOT NULL,
    "realizedPnL" REAL NOT NULL DEFAULT 0,
    "unrealizedPnL" REAL NOT NULL DEFAULT 0,
    "fundingPnL" REAL NOT NULL DEFAULT 0,
    "feesPaid" REAL NOT NULL DEFAULT 0,
    "tradesCount" INTEGER NOT NULL DEFAULT 0,
    "winsCount" INTEGER NOT NULL DEFAULT 0,
    "lossesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GridBot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "symbol" TEXT NOT NULL,
    "exchangeId" TEXT NOT NULL DEFAULT 'binance',
    "gridType" TEXT NOT NULL DEFAULT 'ARITHMETIC',
    "gridCount" INTEGER NOT NULL DEFAULT 10,
    "upperPrice" REAL NOT NULL,
    "lowerPrice" REAL NOT NULL,
    "totalInvestment" REAL NOT NULL,
    "perGridAmount" REAL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "marginMode" TEXT NOT NULL DEFAULT 'ISOLATED',
    "takeProfit" REAL,
    "stopLoss" REAL,
    "triggerPrice" REAL,
    "triggerType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'STOPPED',
    "startedAt" DATETIME,
    "stoppedAt" DATETIME,
    "totalProfit" REAL NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "realizedPnL" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GridBot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GridOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gridBotId" TEXT NOT NULL,
    "gridLevel" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" REAL NOT NULL,
    "filled" REAL NOT NULL DEFAULT 0,
    "exchangeOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "filledAt" DATETIME,
    CONSTRAINT "GridOrder_gridBotId_fkey" FOREIGN KEY ("gridBotId") REFERENCES "GridBot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DcaBot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "symbol" TEXT NOT NULL,
    "exchangeId" TEXT NOT NULL DEFAULT 'binance',
    "direction" TEXT NOT NULL DEFAULT 'LONG',
    "entryType" TEXT NOT NULL DEFAULT 'MARKET',
    "entryPrice" REAL,
    "baseAmount" REAL NOT NULL,
    "dcaLevels" INTEGER NOT NULL DEFAULT 5,
    "dcaPercent" REAL NOT NULL DEFAULT 5,
    "dcaMultiplier" REAL NOT NULL DEFAULT 1.5,
    "dcaCustomLevels" TEXT,
    "tpType" TEXT NOT NULL DEFAULT 'PERCENT',
    "tpValue" REAL NOT NULL DEFAULT 10,
    "tpSellBase" BOOLEAN NOT NULL DEFAULT false,
    "slEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slType" TEXT NOT NULL DEFAULT 'PERCENT',
    "slValue" REAL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "marginMode" TEXT NOT NULL DEFAULT 'ISOLATED',
    "trailingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trailingPercent" REAL,
    "status" TEXT NOT NULL DEFAULT 'STOPPED',
    "startedAt" DATETIME,
    "stoppedAt" DATETIME,
    "totalInvested" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "avgEntryPrice" REAL,
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "realizedPnL" REAL NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DcaBot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DcaOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dcaBotId" TEXT NOT NULL,
    "dcaLevel" INTEGER NOT NULL,
    "price" REAL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL DEFAULT 'MARKET',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" REAL NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "filled" REAL NOT NULL DEFAULT 0,
    "exchangeOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "filledAt" DATETIME,
    CONSTRAINT "DcaOrder_dcaBotId_fkey" FOREIGN KEY ("dcaBotId") REFERENCES "DcaBot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OhlcvCandle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'binance',
    "marketType" TEXT NOT NULL DEFAULT 'futures',
    "timeframe" TEXT NOT NULL,
    "openTime" DATETIME NOT NULL,
    "closeTime" DATETIME NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "quoteVolume" REAL,
    "trades" INTEGER,
    "takerBuyVolume" REAL,
    "takerBuyQuoteVolume" REAL,
    "isFinal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExchangeSyncStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "marketType" TEXT NOT NULL DEFAULT 'futures',
    "timeframe" TEXT NOT NULL DEFAULT '1h',
    "lastSyncTime" DATETIME,
    "lastCandleTime" DATETIME,
    "candlesCount" INTEGER NOT NULL DEFAULT 0,
    "isSyncing" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'binance',
    "date" DATETIME NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "quoteVolume" REAL NOT NULL,
    "trades" INTEGER NOT NULL,
    "avgFundingRate" REAL,
    "totalFunding" REAL,
    "fundingCount" INTEGER NOT NULL DEFAULT 0,
    "volatility" REAL,
    "priceChangePercent" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_exchangeId_exchangeType_key" ON "Account"("userId", "exchangeId", "exchangeType");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_signalId_key" ON "Signal"("signalId");

-- CreateIndex
CREATE INDEX "Signal_signalId_idx" ON "Signal"("signalId");

-- CreateIndex
CREATE INDEX "Signal_symbol_marketType_status_idx" ON "Signal"("symbol", "marketType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPrice_symbol_key" ON "MarketPrice"("symbol");

-- CreateIndex
CREATE INDEX "FundingRateHistory_symbol_exchange_fundingTime_idx" ON "FundingRateHistory"("symbol", "exchange", "fundingTime");

-- CreateIndex
CREATE INDEX "FundingPayment_positionId_idx" ON "FundingPayment"("positionId");

-- CreateIndex
CREATE INDEX "FundingPayment_symbol_fundingTime_idx" ON "FundingPayment"("symbol", "fundingTime");

-- CreateIndex
CREATE INDEX "PnLHistory_userId_isDemo_timestamp_idx" ON "PnLHistory"("userId", "isDemo", "timestamp");

-- CreateIndex
CREATE INDEX "GridBot_userId_isActive_idx" ON "GridBot"("userId", "isActive");

-- CreateIndex
CREATE INDEX "GridBot_symbol_exchangeId_isActive_idx" ON "GridBot"("symbol", "exchangeId", "isActive");

-- CreateIndex
CREATE INDEX "GridOrder_gridBotId_status_idx" ON "GridOrder"("gridBotId", "status");

-- CreateIndex
CREATE INDEX "GridOrder_gridBotId_gridLevel_idx" ON "GridOrder"("gridBotId", "gridLevel");

-- CreateIndex
CREATE INDEX "DcaBot_userId_isActive_idx" ON "DcaBot"("userId", "isActive");

-- CreateIndex
CREATE INDEX "DcaBot_symbol_exchangeId_isActive_idx" ON "DcaBot"("symbol", "exchangeId", "isActive");

-- CreateIndex
CREATE INDEX "DcaOrder_dcaBotId_status_idx" ON "DcaOrder"("dcaBotId", "status");

-- CreateIndex
CREATE INDEX "DcaOrder_dcaBotId_dcaLevel_idx" ON "DcaOrder"("dcaBotId", "dcaLevel");

-- CreateIndex
CREATE INDEX "OhlcvCandle_symbol_exchange_timeframe_openTime_idx" ON "OhlcvCandle"("symbol", "exchange", "timeframe", "openTime");

-- CreateIndex
CREATE INDEX "OhlcvCandle_exchange_openTime_idx" ON "OhlcvCandle"("exchange", "openTime");

-- CreateIndex
CREATE UNIQUE INDEX "OhlcvCandle_symbol_exchange_timeframe_openTime_key" ON "OhlcvCandle"("symbol", "exchange", "timeframe", "openTime");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeSyncStatus_exchange_symbol_marketType_timeframe_key" ON "ExchangeSyncStatus"("exchange", "symbol", "marketType", "timeframe");

-- CreateIndex
CREATE INDEX "DailyStats_symbol_exchange_date_idx" ON "DailyStats"("symbol", "exchange", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStats_symbol_exchange_date_key" ON "DailyStats"("symbol", "exchange", "date");
