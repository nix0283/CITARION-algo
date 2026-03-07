import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptApiKey, maskApiKey } from "@/lib/encryption";
import { getDefaultUserId } from "@/lib/default-user";

// GET - Get all connected exchanges
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountType = searchParams.get("accountType"); // DEMO or REAL

    const where: Record<string, unknown> = {};
    if (accountType) {
      where.accountType = accountType;
    }

    const accounts = await db.account.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Mask sensitive data
    const safeAccounts = accounts.map((acc) => ({
      ...acc,
      apiKey: acc.apiKey ? maskApiKey(acc.apiKey) : null,
      apiSecret: acc.apiSecret ? "••••••••" : null,
    }));

    return NextResponse.json({
      success: true,
      accounts: safeAccounts,
      count: safeAccounts.length,
    });
  } catch (error) {
    console.error("Get exchanges error:", error);
    return NextResponse.json(
      { error: "Failed to get exchanges" },
      { status: 500 }
    );
  }
}

// POST - Connect new exchange
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      exchangeId,
      exchangeType = "futures",
      exchangeName,
      apiKey,
      apiSecret,
      apiPassphrase,
      apiUid,
      subAccount,
      isTestnet = false,
      accountType = "REAL",
    } = body;

    // Validate required fields for REAL accounts
    if (accountType === "REAL") {
      if (!exchangeId || !apiKey || !apiSecret) {
        return NextResponse.json(
          { error: "Exchange ID, API Key and API Secret are required for REAL accounts" },
          { status: 400 }
        );
      }
    }

    // Encrypt API credentials for REAL accounts
    let encryptedKey = apiKey;
    let encryptedSecret = apiSecret;
    let encryptedPassphrase = apiPassphrase;
    let encryptedUid = apiUid;
    
    if (accountType === "REAL" && apiKey && apiSecret) {
      try {
        encryptedKey = encryptApiKey(apiKey);
        encryptedSecret = encryptApiKey(apiSecret);
        if (apiPassphrase) encryptedPassphrase = encryptApiKey(apiPassphrase);
        if (apiUid) encryptedUid = encryptApiKey(apiUid);
      } catch (error) {
        console.error("Failed to encrypt API credentials:", error);
        return NextResponse.json(
          { error: "Failed to secure API credentials" },
          { status: 500 }
        );
      }
    }

    // Check if this exchange already exists
    const existing = await db.account.findFirst({
      where: {
        exchangeId,
        exchangeType,
        accountType,
      },
    });

    if (existing) {
      // Update existing account
      const updated = await db.account.update({
        where: { id: existing.id },
        data: {
          apiKey: encryptedKey,
          apiSecret: encryptedSecret,
          apiPassphrase: encryptedPassphrase,
          apiUid: encryptedUid,
          subAccount,
          isTestnet,
          lastSyncAt: null,
          lastError: null,
          isActive: true,
        },
      });

      return NextResponse.json({
        success: true,
        account: {
          ...updated,
          apiKey: maskApiKey(apiKey || ""),
          apiSecret: "••••••••",
        },
        message: `Аккаунт ${exchangeName || exchangeId} обновлён`,
      });
    }

    // Create new account
    const userId = await getDefaultUserId();
    const account = await db.account.create({
      data: {
        userId,
        accountType,
        exchangeId,
        exchangeType,
        exchangeName: exchangeName || exchangeId,
        apiKey: encryptedKey,
        apiSecret: encryptedSecret,
        apiPassphrase: encryptedPassphrase,
        apiUid: encryptedUid,
        subAccount,
        isTestnet,
        isActive: true,
        virtualBalance: accountType === "DEMO" ? JSON.stringify({ USDT: 10000 }) : null,
      },
    });

    // Log the action
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "SYSTEM",
        message: `Exchange connected: ${exchangeId} (${exchangeType})`,
        details: JSON.stringify({ accountId: account.id, isTestnet }),
      },
    });

    return NextResponse.json({
      success: true,
      account: {
        ...account,
        apiKey: maskApiKey(apiKey || ""),
        apiSecret: "••••••••",
      },
      message: `Биржа ${exchangeName || exchangeId} успешно подключена`,
    });
  } catch (error) {
    console.error("Connect exchange error:", error);
    return NextResponse.json(
      { error: "Failed to connect exchange", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PUT - Update exchange settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, isActive, apiKey, apiSecret, apiPassphrase, subAccount, isTestnet } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (apiKey) updateData.apiKey = apiKey;
    if (apiSecret) updateData.apiSecret = apiSecret;
    if (apiPassphrase !== undefined) updateData.apiPassphrase = apiPassphrase;
    if (subAccount !== undefined) updateData.subAccount = subAccount;
    if (isTestnet !== undefined) updateData.isTestnet = isTestnet;

    const account = await db.account.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      account: {
        ...account,
        apiKey: account.apiKey ? `${account.apiKey.slice(0, 8)}...${account.apiKey.slice(-4)}` : null,
        apiSecret: account.apiSecret ? "••••••••" : null,
      },
      message: "Настройки обновлены",
    });
  } catch (error) {
    console.error("Update exchange error:", error);
    return NextResponse.json(
      { error: "Failed to update exchange" },
      { status: 500 }
    );
  }
}

// DELETE - Disconnect exchange
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    // Get account info before deleting
    const account = await db.account.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Delete account
    await db.account.delete({
      where: { id },
    });

    // Log the action
    await db.systemLog.create({
      data: {
        level: "INFO",
        category: "SYSTEM",
        message: `Exchange disconnected: ${account.exchangeId}`,
        details: JSON.stringify({ accountId: id }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Биржа ${account.exchangeName || account.exchangeId} отключена`,
    });
  } catch (error) {
    console.error("Disconnect exchange error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect exchange" },
      { status: 500 }
    );
  }
}
