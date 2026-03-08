/**
 * CITARION Multi-Tenant Architecture
 * Stage 4.1 - Tenant Middleware for Request Processing
 */

import type { NextRequest } from 'next/server';
import { tenantManager } from './manager';
import type { TenantContext, TenantResolution } from './types';

// ============================================================================
// TENANT MIDDLEWARE
// ============================================================================

export class TenantMiddleware {
  /**
   * Extract tenant identification from request
   */
  async identifyTenant(request: NextRequest): Promise<TenantResolution | null> {
    // 1. Check X-Tenant-ID header
    const tenantIdHeader = request.headers.get('X-Tenant-ID');
    if (tenantIdHeader) {
      const resolution = await tenantManager.identifyTenant({
        tenantId: tenantIdHeader,
      });
      if (resolution) return resolution;
    }

    // 2. Check subdomain
    const host = request.headers.get('host') || '';
    const subdomain = this.extractSubdomain(host);
    if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
      const resolution = await tenantManager.identifyTenant({ subdomain });
      if (resolution) return resolution;
    }

    // 3. Check API key
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey) {
      const resolution = await tenantManager.identifyTenant({ apiKey });
      if (resolution) return resolution;
    }

    // 4. Check Authorization Bearer token
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // In real implementation, decode JWT and extract tenant
      // For now, treat as API key
      const resolution = await tenantManager.identifyTenant({ apiKey: token });
      if (resolution) return resolution;
    }

    return null;
  }

  /**
   * Build full tenant context for authenticated request
   */
  async buildContext(
    request: NextRequest,
    userId: string
  ): Promise<TenantContext | null> {
    const resolution = await this.identifyTenant(request);
    if (!resolution) return null;

    return tenantManager.buildContext(resolution.tenant.id, userId);
  }

  /**
   * Check if request is authorized for tenant
   */
  async checkAuthorization(
    context: TenantContext,
    permission: string
  ): Promise<boolean> {
    // Check if user has wildcard permission
    if (context.permissions.has('*')) return true;

    // Check specific permission
    return context.permissions.has(permission);
  }

  /**
   * Check rate limit for tenant
   */
  async checkRateLimit(context: TenantContext): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfter?: number;
  }> {
    if (context.rateLimit.remaining > 0) {
      return {
        allowed: true,
        remaining: context.rateLimit.remaining - 1,
        resetAt: context.rateLimit.resetAt,
      };
    }

    const retryAfter = Math.ceil(
      (context.rateLimit.resetAt.getTime() - Date.now()) / 1000
    );

    return {
      allowed: false,
      remaining: 0,
      resetAt: context.rateLimit.resetAt,
      retryAfter,
    };
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private extractSubdomain(host: string): string | null {
    // Remove port if present
    const hostname = host.split(':')[0];

    // Check for localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return null;
    }

    // Extract subdomain from domain
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      return parts[0];
    }

    return null;
  }
}

// ============================================================================
// MIDDLEWARE WRAPPER
// ============================================================================

export function withTenant(
  handler: (
    request: NextRequest,
    context: TenantContext
  ) => Promise<Response>
) {
  return async (request: NextRequest): Promise<Response> => {
    const middleware = new TenantMiddleware();

    // Identify tenant
    const resolution = await middleware.identifyTenant(request);
    if (!resolution) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user ID from session or token
    const userId = request.headers.get('X-User-ID');
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build context
    const context = await middleware.buildContext(request, userId);
    if (!context) {
      return new Response(
        JSON.stringify({ error: 'Context build failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    const rateLimit = await middleware.checkRateLimit(context);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          retryAfter: rateLimit.retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rateLimit.retryAfter),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    // Call handler
    const response = await handler(request, context);

    // Add rate limit headers
    response.headers.set(
      'X-RateLimit-Remaining',
      String(rateLimit.remaining)
    );
    response.headers.set(
      'X-RateLimit-Reset',
      rateLimit.resetAt.toISOString()
    );
    response.headers.set('X-Tenant-ID', context.tenant.id);

    return response;
  };
}

// ============================================================================
// PERMISSION HELPERS
// ============================================================================

export const PERMISSIONS = {
  // Bots
  BOTS_READ: 'bots:read',
  BOTS_WRITE: 'bots:write',
  BOTS_DELETE: 'bots:delete',

  // Positions
  POSITIONS_READ: 'positions:read',
  POSITIONS_WRITE: 'positions:write',
  POSITIONS_CLOSE: 'positions:close',

  // API Keys
  API_KEYS_READ: 'api_keys:read',
  API_KEYS_WRITE: 'api_keys:write',
  API_KEYS_DELETE: 'api_keys:delete',

  // Users
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',

  // Analytics
  ANALYTICS_READ: 'analytics:read',

  // Admin
  ADMIN_ACCESS: 'admin:access',
} as const;

export function requirePermission(permission: string) {
  return async (
    request: NextRequest,
    context: TenantContext
  ): Promise<boolean> => {
    const middleware = new TenantMiddleware();
    return middleware.checkAuthorization(context, permission);
  };
}

// Singleton
export const tenantMiddleware = new TenantMiddleware();
