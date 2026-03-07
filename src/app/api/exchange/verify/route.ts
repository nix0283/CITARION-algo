import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";

// Simple exchange API verification
// In production, this would use actual exchange API libraries

interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  isTestnet: boolean;
}

// Verify Binance API connection
async function verifyBinance(credentials: ExchangeCredentials): Promise<{ success: boolean; message: string; balance?: number }> {
  try {
    const baseUrl = credentials.isTestnet 
      ? "https://testnet.binancefuture.com" 
      : "https://fapi.binance.com";
    
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac("sha256", credentials.apiSecret)
      .update(queryString)
      .digest("hex");

    const response = await fetch(`${baseUrl}/fapi/v2/account?${queryString}&signature=${signature}`, {
      headers: {
        "X-MBX-APIKEY": credentials.apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, message: error.msg || "Binance API error" };
    }

    const data = await response.json();
    const usdtBalance = data.assets?.find((a: { asset: string }) => a.asset === "USDT")?.availableBalance || 0;

    return { 
      success: true, 
      message: "Binance API подключён успешно",
      balance: parseFloat(usdtBalance)
    };
  } catch (error) {
    return { 
      success: false, 
      message: `Binance connection failed: ${error instanceof Error ? error.message : "Unknown error"}` 
    };
  }
}

// Verify Bybit API connection
async function verifyBybit(credentials: ExchangeCredentials): Promise<{ success: boolean; message: string; balance?: number }> {
  try {
    const baseUrl = credentials.isTestnet 
      ? "https://api-testnet.bybit.com" 
      : "https://api.bybit.com";
    
    const timestamp = Date.now().toString();
    const queryString = `api_key=${credentials.apiKey}&timestamp=${timestamp}`;
    const signature = crypto
      .createHmac("sha256", credentials.apiSecret)
      .update(queryString)
      .digest("hex");

    const response = await fetch(`${baseUrl}/v5/account/wallet-balance?accountType=UNIFIED`, {
      headers: {
        "X-BAPI-API-KEY": credentials.apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, message: error.retMsg || "Bybit API error" };
    }

    const data = await response.json();
    
    if (data.retCode !== 0) {
      return { success: false, message: data.retMsg };
    }

    const usdtBalance = data.result?.list?.[0]?.coin?.find((c: { coin: string }) => c.coin === "USDT")?.walletBalance || 0;

    return { 
      success: true, 
      message: "Bybit API подключён успешно",
      balance: parseFloat(usdtBalance)
    };
  } catch (error) {
    return { 
      success: false, 
      message: `Bybit connection failed: ${error instanceof Error ? error.message : "Unknown error"}` 
    };
  }
}

// Verify OKX API connection
async function verifyOKX(credentials: ExchangeCredentials): Promise<{ success: boolean; message: string; balance?: number }> {
  try {
    if (!credentials.apiPassphrase) {
      return { success: false, message: "OKX requires API Passphrase" };
    }

    const baseUrl = "https://www.okx.com";
    const timestamp = new Date().toISOString();
    const method = "GET";
    const requestPath = "/api/v5/account/balance";

    const prehash = timestamp + method + requestPath;
    const signature = crypto
      .createHmac("sha256", credentials.apiSecret)
      .update(prehash)
      .digest("base64");

    const response = await fetch(`${baseUrl}${requestPath}`, {
      headers: {
        "OK-ACCESS-KEY": credentials.apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": credentials.apiPassphrase,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, message: error.msg || "OKX API error" };
    }

    const data = await response.json();
    
    if (data.code !== "0") {
      return { success: false, message: data.msg };
    }

    const usdtBalance = data.data?.[0]?.details?.find((d: { ccy: string }) => d.ccy === "USDT")?.cashBal || 0;

    return { 
      success: true, 
      message: "OKX API подключён успешно",
      balance: parseFloat(usdtBalance)
    };
  } catch (error) {
    return { 
      success: false, 
      message: `OKX connection failed: ${error instanceof Error ? error.message : "Unknown error"}` 
    };
  }
}

// Demo verification for other exchanges
async function verifyDemo(): Promise<{ success: boolean; message: string }> {
  return { success: true, message: "Demo connection successful" };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    // Get account from database
    const account = await db.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    if (!account.apiKey || !account.apiSecret) {
      return NextResponse.json(
        { error: "API credentials not configured" },
        { status: 400 }
      );
    }

    const credentials: ExchangeCredentials = {
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      apiPassphrase: account.apiPassphrase || undefined,
      isTestnet: account.isTestnet,
    };

    // Verify based on exchange
    let result;
    switch (account.exchangeId) {
      case "binance":
        result = await verifyBinance(credentials);
        break;
      case "bybit":
        result = await verifyBybit(credentials);
        break;
      case "okx":
        result = await verifyOKX(credentials);
        break;
      default:
        result = await verifyDemo();
    }

    // Update account status
    await db.account.update({
      where: { id: accountId },
      data: {
        lastSyncAt: result.success ? new Date() : null,
        lastError: result.success ? null : result.message,
      },
    });

    // Log verification
    await db.systemLog.create({
      data: {
        level: result.success ? "INFO" : "WARNING",
        category: "SYSTEM",
        message: `Exchange verification: ${account.exchangeId} - ${result.success ? "success" : "failed"}`,
        details: JSON.stringify({ accountId, message: result.message }),
      },
    });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      balance: result.balance,
    });

  } catch (error) {
    console.error("Verify exchange error:", error);
    return NextResponse.json(
      { error: "Failed to verify exchange", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
