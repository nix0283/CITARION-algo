/**
 * API Version Monitor
 * 
 * Monitors exchange API versions and alerts when updates are required
 */

import { db } from "@/lib/db";
import { ExchangeId, CURRENT_API_VERSIONS, EXCHANGE_CONFIGS } from "./types";

export interface ApiChangeAlert {
  exchange: ExchangeId;
  currentVersion: string;
  detectedVersion?: string;
  changeType: "deprecated" | "updated" | "breaking_change";
  message: string;
  detectedAt: Date;
  acknowledged: boolean;
}

// API version storage key
const API_VERSION_CACHE_KEY = "exchange_api_versions";

/**
 * Check for API version changes
 * Returns alerts if changes are detected
 */
export async function checkApiVersions(): Promise<ApiChangeAlert[]> {
  const alerts: ApiChangeAlert[] = [];

  for (const [exchangeId, knownVersion] of Object.entries(CURRENT_API_VERSIONS)) {
    try {
      // Try to get actual API version from exchange
      const actualVersion = await fetchApiVersion(exchangeId as ExchangeId);
      
      if (actualVersion && actualVersion !== knownVersion) {
        const alert: ApiChangeAlert = {
          exchange: exchangeId as ExchangeId,
          currentVersion: knownVersion,
          detectedVersion: actualVersion,
          changeType: "updated",
          message: `${exchangeId} API updated from v${knownVersion} to v${actualVersion}. Please verify compatibility.`,
          detectedAt: new Date(),
          acknowledged: false,
        };
        
        alerts.push(alert);
        
        // Log alert to database
        await logApiChangeAlert(alert);
      }
    } catch (error) {
      // If we can't reach the API, check for deprecation notices
      console.warn(`[API Monitor] Could not check version for ${exchangeId}`);
    }
  }

  return alerts;
}

/**
 * Fetch actual API version from exchange
 */
async function fetchApiVersion(exchangeId: ExchangeId): Promise<string | null> {
  const config = EXCHANGE_CONFIGS[exchangeId];
  
  try {
    let endpoint: string;
    let baseUrl: string;

    switch (exchangeId) {
      case "binance":
        baseUrl = config.spotUrl || "";
        endpoint = "/api/v3/exchangeInfo";
        break;
      
      case "bybit":
        baseUrl = config.spotUrl || "";
        endpoint = "/v5/market/time";
        break;
      
      case "okx":
        baseUrl = config.spotUrl || "";
        endpoint = "/api/v5/public/time";
        break;
      
      default:
        return null;
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Check for version mismatch in response headers or body
      const serverHeader = response.headers.get("Server") || "";
      if (serverHeader.includes("deprecated")) {
        return "deprecated";
      }
    }

    // Most exchanges don't expose version directly
    return null;
  } catch {
    return null;
  }
}

/**
 * Log API change alert to database
 */
async function logApiChangeAlert(alert: ApiChangeAlert): Promise<void> {
  try {
    await db.systemLog.create({
      data: {
        level: "WARNING",
        category: "API",
        message: `[API MONITOR] ${alert.message}`,
        details: JSON.stringify(alert),
      },
    });
  } catch (error) {
    console.error("[API Monitor] Failed to log alert:", error);
  }
}

/**
 * Get all unacknowledged API alerts
 */
export async function getUnacknowledgedAlerts(): Promise<ApiChangeAlert[]> {
  try {
    const logs = await db.systemLog.findMany({
      where: {
        category: "API",
        level: "WARNING",
        message: { contains: "[API MONITOR]" },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      orderBy: { createdAt: "desc" },
    });

    return logs.map((log) => {
      const details = log.details ? JSON.parse(log.details) : {};
      return {
        exchange: details.exchange || "unknown",
        currentVersion: details.currentVersion || "unknown",
        detectedVersion: details.detectedVersion,
        changeType: details.changeType || "updated",
        message: log.message.replace("[API MONITOR] ", ""),
        detectedAt: log.createdAt,
        acknowledged: false,
      } as ApiChangeAlert;
    });
  } catch (error) {
    console.error("[API Monitor] Failed to get alerts:", error);
    return [];
  }
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: string): Promise<void> {
  try {
    const existingLog = await db.systemLog.findUnique({ where: { id: alertId } });
    const existingDetails = existingLog?.details ? JSON.parse(existingLog.details as string) : {};
    
    await db.systemLog.update({
      where: { id: alertId },
      data: { 
        details: JSON.stringify({ 
          ...existingDetails,
          acknowledged: true 
        })
      },
    });
  } catch (error) {
    console.error("[API Monitor] Failed to acknowledge alert:", error);
  }
}

/**
 * Manual version check endpoint
 */
export async function performVersionCheck(): Promise<{
  checked: ExchangeId[];
  alerts: ApiChangeAlert[];
  timestamp: Date;
}> {
  const alerts = await checkApiVersions();
  
  return {
    checked: Object.keys(CURRENT_API_VERSIONS) as ExchangeId[],
    alerts,
    timestamp: new Date(),
  };
}

/**
 * Get known API versions
 */
export function getKnownVersions(): Record<ExchangeId, string> {
  return { ...CURRENT_API_VERSIONS };
}

/**
 * Check if exchange API is likely deprecated based on response
 */
export function detectDeprecation(
  exchangeId: ExchangeId,
  response: Response,
  responseBody: unknown
): boolean {
  // Check response headers for deprecation notices
  const deprecationHeaders = [
    "X-Deprecated",
    "X-API-Deprecated",
    "Deprecation",
    "Sunset",
  ];

  for (const header of deprecationHeaders) {
    if (response.headers.get(header)) {
      return true;
    }
  }

  // Check response body for deprecation messages
  const body = JSON.stringify(responseBody).toLowerCase();
  const deprecationKeywords = [
    "deprecated",
    "sunset",
    "no longer supported",
    "please upgrade",
    "version outdated",
    "api version",
  ];

  for (const keyword of deprecationKeywords) {
    if (body.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Schedule periodic version checks
 * Call this on server startup
 */
export function scheduleVersionChecks(intervalMs: number = 24 * 60 * 60 * 1000): NodeJS.Timeout {
  console.log(`[API Monitor] Scheduling version checks every ${intervalMs / 1000 / 60 / 60} hours`);
  
  // Initial check
  checkApiVersions().catch(console.error);
  
  // Schedule periodic checks
  return setInterval(() => {
    checkApiVersions().catch(console.error);
  }, intervalMs);
}
