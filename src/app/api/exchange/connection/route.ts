/**
 * Exchange Connection API
 * 
 * Handles exchange account management, connection testing, and balance fetching
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptApiKey, decryptApiKey } from "@/lib/encryption";
import { createExchangeClient, ExchangeId, MarketType, getSupportedExchanges, getExchangeConfig, supportsMarketType } from "@/lib/exchange";
import { getDefaultUserId } from "@/lib/default-user";

// GET - Get supported exchanges or account info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    // Get supported exchanges list
    if (action === "exchanges") {
      const exchanges = getSupportedExchanges().map((id) => {
        const config = getExchangeConfig(id);
        return {
          id,
          name: config.name,
          markets: config.markets,
          hasTestnet: config.hasTestnet,
          requiresPassphrase: config.requiresPassphrase,
          supportsHedgeMode: config.supportsHedgeMode,
          supportsTrailingStop: config.supportsTrailingStop,
        };
      });

      return NextResponse.json({ success: true, exchanges });
    }

    // Get connected accounts
    if (action === "accounts") {
      const accounts = await db.account.findMany({
        select: {
          id: true,
          accountType: true,
          exchangeId: true,
          exchangeType: true,
          exchangeName: true,
          isActive: true,
          isTestnet: true,
          lastSyncAt: true,
          lastError: true,
          virtualBalance: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ success: true, accounts });
    }

    // Test connection
    if (action === "test") {
      const accountId = searchParams.get("accountId");
      if (!accountId) {
        return NextResponse.json({ error: "Account ID required" }, { status: 400 });
      }
      return testConnection(accountId);
    }

    // Get account balance
    if (action === "balance") {
      const accountId = searchParams.get("accountId");
      if (!accountId) {
        return NextResponse.json({ error: "Account ID required" }, { status: 400 });
      }
      return getAccountBalance(accountId);
    }

    return NextResponse.json(
      { error: "Invalid action. Use: exchanges, accounts, test, balance" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Request failed", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}

// POST - Add/update exchange account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, exchangeId, exchangeType = "futures", exchangeName, apiKey, apiSecret, passphrase, isTestnet = false, virtualBalance } = body;

    if (action === "connect") {
      if (!exchangeId || !exchangeType) {
        return NextResponse.json({ error: "Exchange ID and type required" }, { status: 400 });
      }

      if (!supportsMarketType(exchangeId as ExchangeId, exchangeType as MarketType)) {
        return NextResponse.json({ error: `${exchangeId} does not support ${exchangeType}` }, { status: 400 });
      }

      const config = getExchangeConfig(exchangeId as ExchangeId);
      const userId = await getDefaultUserId();

      if (apiKey && apiSecret) {
        if (config.requiresPassphrase && !passphrase) {
          return NextResponse.json({ error: `${exchangeId} requires passphrase` }, { status: 400 });
        }

        const encryptedApiKey = encryptApiKey(apiKey);
        const encryptedApiSecret = encryptApiKey(apiSecret);
        const encryptedPassphrase = passphrase ? encryptApiKey(passphrase) : null;

        const account = await db.account.create({
          data: {
            userId,
            accountType: "REAL",
            exchangeId,
            exchangeType,
            exchangeName: exchangeName || config.name,
            isTestnet,
            apiKey: encryptedApiKey,
            apiSecret: encryptedApiSecret,
            apiPassphrase: encryptedPassphrase,
            isActive: true,
          },
        });

        await db.systemLog.create({
          data: {
            level: "INFO",
            category: "API",
            message: `[Exchange] Connected ${exchangeId} ${exchangeType}`,
            details: JSON.stringify({ accountId: account.id, exchangeId, exchangeType, testnet: isTestnet }),
          },
        });

        return NextResponse.json({
          success: true,
          account: { id: account.id, exchangeId, exchangeType, exchangeName: account.exchangeName, accountType: "REAL", isTestnet },
          message: `Аккаунт ${config.name} подключён`,
        });
      } else {
        const account = await db.account.create({
          data: {
            userId,
            accountType: "DEMO",
            exchangeId,
            exchangeType,
            exchangeName: exchangeName || config.name,
            virtualBalance: virtualBalance || JSON.stringify({ USDT: 10000 }),
            isActive: true,
          },
        });

        return NextResponse.json({
          success: true,
          account: { id: account.id, exchangeId, exchangeType, exchangeName: account.exchangeName, accountType: "DEMO" },
          message: `Demo аккаунт ${config.name} создан`,
        });
      }
    }

    if (action === "verify") {
      if (!exchangeId || !apiKey || !apiSecret) {
        return NextResponse.json({ error: "Exchange ID, key, and secret required" }, { status: 400 });
      }

      const config = getExchangeConfig(exchangeId as ExchangeId);
      if (config.requiresPassphrase && !passphrase) {
        return NextResponse.json({ error: `${exchangeId} requires passphrase` }, { status: 400 });
      }

      try {
        const client = createExchangeClient(exchangeId as ExchangeId, {
          credentials: { apiKey, apiSecret, passphrase },
          marketType: exchangeType as MarketType,
          testnet: isTestnet,
        });

        const testResult = await client.testConnection();
        return NextResponse.json({ success: testResult.success, message: testResult.message, exchange: exchangeId, testnet: isTestnet });
      } catch (error) {
        return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Verification failed" });
      }
    }

    return NextResponse.json({ error: "Invalid action. Use: connect, verify" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Failed", details: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}

// DELETE - Remove exchange account
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    if (!accountId) return NextResponse.json({ error: "Account ID required" }, { status: 400 });

    const account = await db.account.findUnique({ where: { id: accountId } });
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.account.delete({ where: { id: accountId } });
    await db.systemLog.create({
      data: { level: "INFO", category: "API", message: `[Exchange] Disconnected ${account.exchangeId}`, details: JSON.stringify({ accountId }) },
    });

    return NextResponse.json({ success: true, message: "Account disconnected" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

async function testConnection(accountId: string) {
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (account.accountType === "DEMO") {
    return NextResponse.json({ success: true, message: "Demo connection OK", accountType: "DEMO" });
  }

  if (!account.apiKey || !account.apiSecret) {
    return NextResponse.json({ error: "No credentials" }, { status: 400 });
  }

  try {
    const decryptedApiKey = decryptApiKey(account.apiKey);
    const decryptedApiSecret = decryptApiKey(account.apiSecret);

    const client = createExchangeClient(account.exchangeId as ExchangeId, {
      credentials: { apiKey: decryptedApiKey, apiSecret: decryptedApiSecret, passphrase: account.apiPassphrase || undefined },
      marketType: account.exchangeType as MarketType,
      testnet: account.isTestnet,
    });

    const result = await client.testConnection();

    if (result.success) {
      await db.account.update({ where: { id: accountId }, data: { lastSyncAt: new Date(), lastError: null } });
    }

    return NextResponse.json({ success: result.success, message: result.message, exchange: account.exchangeId, testnet: account.isTestnet });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    await db.account.update({ where: { id: accountId }, data: { lastError: msg } });
    return NextResponse.json({ success: false, message: msg, exchange: account.exchangeId });
  }
}

async function getAccountBalance(accountId: string) {
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (account.accountType === "DEMO") {
    const balance = account.virtualBalance ? JSON.parse(account.virtualBalance) : { USDT: 10000 };
    return NextResponse.json({ success: true, balance, accountType: "DEMO" });
  }

  if (!account.apiKey || !account.apiSecret) {
    return NextResponse.json({ error: "No credentials" }, { status: 400 });
  }

  try {
    const decryptedApiKey = decryptApiKey(account.apiKey);
    const decryptedApiSecret = decryptApiKey(account.apiSecret);

    const client = createExchangeClient(account.exchangeId as ExchangeId, {
      credentials: { apiKey: decryptedApiKey, apiSecret: decryptedApiSecret, passphrase: account.apiPassphrase || undefined },
      marketType: account.exchangeType as MarketType,
      testnet: account.isTestnet,
    });

    const info = await client.getAccountInfo();
    return NextResponse.json({ success: true, balance: info.balances, totalEquity: info.totalEquity, availableMargin: info.availableMargin, exchange: account.exchangeId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
