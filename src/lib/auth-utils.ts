/**
 * Authentication Utilities for API Routes
 * 
 * Provides session-based and API key authentication for trade endpoints.
 * Supports NextAuth.js sessions for web users and X-API-Key header for bot/service access.
 * 
 * Features:
 * - Session-based authentication for web users
 * - API key authentication for bots/services
 * - Rate limiting per user/API key
 * - Authentication attempt logging
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash, timingSafeEqual } from "crypto";

// ==================== TYPES ====================

export interface AuthResult {
  success: true;
  userId: string;
  authType: "session" | "api_key";
  apiKeyId?: string;
  rateLimit: {
    remaining: number;
    resetAt: number;
  };
}

export interface AuthError {
  success: false;
  error: string;
  statusCode: number;
}

export type AuthResponse = AuthResult | AuthError;

export interface AuthContext {
  userId: string;
  authType: "session" | "api_key";
  apiKeyId?: string;
}

export type AuthenticatedHandler<T = unknown> = (
  request: NextRequest,
  context: AuthContext
) => Promise<NextResponse<T>>;

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface AuthConfig {
  rateLimit?: RateLimitConfig;
  requireApiKey?: boolean;
  skipRateLimit?: boolean;
}

// ==================== CONSTANTS ====================

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
};

const TRADE_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60 * 1000, // 1 minute
};

// ==================== RATE LIMITER ====================

class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(t => now - t < 60 * 60 * 1000);
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }

  checkLimit(
    identifier: string,
    config: RateLimitConfig
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let timestamps = this.requests.get(identifier) || [];
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length < config.maxRequests) {
      timestamps.push(now);
      this.requests.set(identifier, timestamps);
      return {
        allowed: true,
        remaining: config.maxRequests - timestamps.length,
        resetAt: now + config.windowMs,
      };
    }

    const oldestTimestamp = Math.min(...timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestTimestamp + config.windowMs,
    };
  }

  reset(identifier: string): void {
    this.requests.delete(identifier);
  }
}

const rateLimiter = new InMemoryRateLimiter();

// ==================== HASH UTILITIES ====================

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function constantTimeCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// ==================== SESSION AUTHENTICATION ====================

/**
 * Validate NextAuth session from request
 */
async function validateSession(request: NextRequest): Promise<AuthResponse> {
  try {
    // Get session token from cookies
    const sessionToken = request.cookies.get("next-auth.session-token")?.value ||
                         request.cookies.get("__Secure-next-auth.session-token")?.value;

    if (!sessionToken) {
      return {
        success: false,
        error: "No session token found",
        statusCode: 401,
      };
    }

    // Look up session in database
    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session) {
      return {
        success: false,
        error: "Invalid session",
        statusCode: 401,
      };
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      // Delete expired session
      await db.session.delete({ where: { id: session.id } });
      return {
        success: false,
        error: "Session expired",
        statusCode: 401,
      };
    }

    return {
      success: true,
      userId: session.userId,
      authType: "session",
      rateLimit: { remaining: 0, resetAt: 0 }, // Will be set by caller
    };
  } catch (error) {
    console.error("[Auth] Session validation error:", error);
    return {
      success: false,
      error: "Session validation failed",
      statusCode: 500,
    };
  }
}

// ==================== API KEY AUTHENTICATION ====================

/**
 * Validate API key from request headers
 * 
 * Header format: X-API-Key: <api_key>
 */
async function validateApiKey(request: NextRequest): Promise<AuthResponse> {
  try {
    const apiKey = request.headers.get("X-API-Key");

    if (!apiKey) {
      return {
        success: false,
        error: "No API key provided",
        statusCode: 401,
      };
    }

    // Validate API key format (ck_xxx)
    if (!apiKey.startsWith("ck_") || apiKey.length < 20) {
      await logAuthAttempt(null, "api_key", false, "Invalid API key format", request);
      return {
        success: false,
        error: "Invalid API key format",
        statusCode: 401,
      };
    }

    // Hash the key for lookup
    const keyHash = hashApiKey(apiKey);

    // Look up API key in database
    const storedKey = await db.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!storedKey) {
      await logAuthAttempt(null, "api_key", false, "API key not found", request);
      return {
        success: false,
        error: "Invalid API key",
        statusCode: 401,
      };
    }

    // Check if API key is active
    if (!storedKey.isActive) {
      await logAuthAttempt(storedKey.userId, "api_key", false, "API key inactive", request);
      return {
        success: false,
        error: "API key is inactive",
        statusCode: 401,
      };
    }

    // Check if API key is expired
    if (storedKey.expiresAt && storedKey.expiresAt < new Date()) {
      await logAuthAttempt(storedKey.userId, "api_key", false, "API key expired", request);
      return {
        success: false,
        error: "API key has expired",
        statusCode: 401,
      };
    }

    // Update last used timestamp
    await db.apiKey.update({
      where: { id: storedKey.id },
      data: { lastUsedAt: new Date() },
    });

    await logAuthAttempt(storedKey.userId, "api_key", true, "Success", request);

    return {
      success: true,
      userId: storedKey.userId,
      authType: "api_key",
      apiKeyId: storedKey.id,
      rateLimit: { remaining: 0, resetAt: 0 }, // Will be set by caller
    };
  } catch (error) {
    console.error("[Auth] API key validation error:", error);
    return {
      success: false,
      error: "API key validation failed",
      statusCode: 500,
    };
  }
}

// ==================== AUTHENTICATION LOGGING ====================

async function logAuthAttempt(
  userId: string | null,
  authType: "session" | "api_key",
  success: boolean,
  message: string,
  request: NextRequest
): Promise<void> {
  try {
    const ipAddress = request.headers.get("x-forwarded-for") ||
                      request.headers.get("x-real-ip") ||
                      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    await db.systemLog.create({
      data: {
        level: success ? "INFO" : "WARNING",
        category: "AUTH",
        message: `Auth attempt: ${authType} - ${message}`,
        userId: userId,
        details: JSON.stringify({
          authType,
          success,
          ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
          userAgent: userAgent.slice(0, 200), // Truncate long user agents
          path: request.nextUrl.pathname,
          method: request.method,
        }),
      },
    });
  } catch (error) {
    console.error("[Auth] Failed to log auth attempt:", error);
  }
}

// ==================== MAIN AUTHENTICATION FUNCTION ====================

/**
 * Authenticate a request using session or API key
 * 
 * Priority:
 * 1. X-API-Key header (for bots/services)
 * 2. Session cookie (for web users)
 */
export async function authenticateRequest(
  request: NextRequest,
  config: AuthConfig = {}
): Promise<AuthResponse> {
  const rateLimitConfig = config.rateLimit || TRADE_RATE_LIMIT;
  
  // Check for API key first
  const apiKeyHeader = request.headers.get("X-API-Key");
  
  let authResult: AuthResponse;

  if (apiKeyHeader) {
    // API key authentication
    authResult = await validateApiKey(request);
  } else if (config.requireApiKey) {
    // API key required but not provided
    return {
      success: false,
      error: "API key required for this endpoint",
      statusCode: 401,
    };
  } else {
    // Session authentication
    authResult = await validateSession(request);
  }

  if (!authResult.success) {
    return authResult;
  }

  // Apply rate limiting
  const identifier = authResult.authType === "api_key"
    ? `api_key:${authResult.apiKeyId}`
    : `session:${authResult.userId}`;

  const rateLimitResult = rateLimiter.checkLimit(identifier, rateLimitConfig);

  if (!rateLimitResult.allowed && !config.skipRateLimit) {
    await logAuthAttempt(
      authResult.userId,
      authResult.authType,
      false,
      "Rate limit exceeded",
      request
    );
    return {
      success: false,
      error: "Rate limit exceeded. Please try again later.",
      statusCode: 429,
    };
  }

  return {
    ...authResult,
    rateLimit: rateLimitResult,
  };
}

// ==================== WITH AUTH WRAPPER ====================

/**
 * Higher-order function to wrap API route handlers with authentication
 * 
 * @example
 * ```typescript
 * export const POST = withAuth(async (request, context) => {
 *   // context.userId is authenticated
 *   // context.authType is 'session' or 'api_key'
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withAuth<T = unknown>(
  handler: AuthenticatedHandler<T>,
  config: AuthConfig = {}
): (request: NextRequest) => Promise<NextResponse<T>> {
  return async (request: NextRequest) => {
    const authResult = await authenticateRequest(request, config);

    if (!authResult.success) {
      return NextResponse.json<T>(
        { error: authResult.error } as T,
        { status: authResult.statusCode }
      );
    }

    const context: AuthContext = {
      userId: authResult.userId,
      authType: authResult.authType,
      apiKeyId: authResult.apiKeyId,
    };

    try {
      return await handler(request, context);
    } catch (error) {
      console.error("[Auth] Handler error:", error);
      return NextResponse.json<T>(
        { error: "Internal server error" } as T,
        { status: 500 }
      );
    }
  };
}

// ==================== API KEY MANAGEMENT ====================

/**
 * Generate a new API key for a user
 */
export async function generateApiKey(
  userId: string,
  name: string,
  permissions: string[] = ["trade:read", "trade:write"],
  expiresAt?: Date
): Promise<{ key: string; secret: string; id: string }> {
  // Generate key and secret
  const keyBytes = new Uint8Array(16);
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(keyBytes);
  crypto.getRandomValues(secretBytes);

  const key = `ck_${Buffer.from(keyBytes).toString("hex")}`;
  const secret = `cs_${Buffer.from(secretBytes).toString("hex")}`;

  // Hash for storage
  const keyHash = hashApiKey(key);

  // Store in database
  const apiKey = await db.apiKey.create({
    data: {
      userId,
      name,
      keyHash,
      keyPrefix: key.slice(0, 10), // Store prefix for display
      permissions: JSON.stringify(permissions),
      isActive: true,
      expiresAt,
    },
  });

  return {
    key,
    secret,
    id: apiKey.id,
  };
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  try {
    const result = await db.apiKey.updateMany({
      where: {
        id: keyId,
        userId,
      },
      data: {
        isActive: false,
      },
    });

    return result.count > 0;
  } catch (error) {
    console.error("[Auth] Failed to revoke API key:", error);
    return false;
  }
}

/**
 * List API keys for a user (without revealing the full key)
 */
export async function listApiKeys(userId: string): Promise<Array<{
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}>> {
  const keys = await db.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      permissions: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return keys.map(k => ({
    ...k,
    permissions: JSON.parse(k.permissions || "[]"),
  }));
}

// ==================== LEGACY DEFAULT USER FALLBACK ====================

/**
 * Get or create a default user for endpoints that don't require authentication
 * This is for backward compatibility with existing demo functionality
 */
export async function getDefaultUser(): Promise<{ id: string; email: string }> {
  const defaultEmail = "user@citarion.local";
  
  let user = await db.user.findFirst({
    where: { email: defaultEmail },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        email: defaultEmail,
        name: "Default User",
        currentMode: "DEMO",
      },
    });
  }

  return user;
}

// ==================== EXPORTS ====================

export {
  rateLimiter,
  hashApiKey,
  constantTimeCompare,
  TRADE_RATE_LIMIT,
  DEFAULT_RATE_LIMIT,
};
