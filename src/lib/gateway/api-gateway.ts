/**
 * CITARION API Gateway
 * Stage 4.2 - API Gateway with Circuit Breaker
 */

import type { NextRequest } from 'next/server';
import type { TenantContext } from '../multi-tenant/types';

// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // ms
  halfOpenMaxCalls: number;
}

export interface RouteConfig {
  path: string;
  method: string[];
  service: string;
  handler: string;
  rateLimit?: number;
  permissions?: string[];
  cache?: {
    enabled: boolean;
    ttl: number;
  };
}

export interface GatewayMetrics {
  requestsTotal: number;
  requestsSuccess: number;
  requestsFailed: number;
  avgLatency: number;
  activeConnections: number;
  circuitsOpen: number;
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenCalls: number = 0;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000,
      halfOpenMaxCalls: 3,
    }
  ) {}

  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.timeout) {
        this.state = 'half_open';
        this.halfOpenCalls = 0;
      } else {
        if (fallback) return fallback();
        throw new Error(`Circuit breaker '${this.name}' is open`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) return fallback();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half_open') {
      this.successes++;
      this.halfOpenCalls++;

      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.state = 'open';
      }
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenCalls = 0;
  }
}

// ============================================================================
// API GATEWAY
// ============================================================================

export class ApiGateway {
  private routes: Map<string, RouteConfig> = new Map();
  private circuits: Map<string, CircuitBreaker> = new Map();
  private requestLog: Array<{
    timestamp: Date;
    method: string;
    path: string;
    status: number;
    duration: number;
    tenantId?: string;
  }> = [];

  constructor() {
    this.initializeRoutes();
  }

  // -------------------------------------------------------------------------
  // ROUTE REGISTRATION
  // -------------------------------------------------------------------------

  registerRoute(config: RouteConfig): void {
    const key = `${config.method.join('|')}:${config.path}`;
    this.routes.set(key, config);

    // Create circuit breaker for service
    if (!this.circuits.has(config.service)) {
      this.circuits.set(config.service, new CircuitBreaker(config.service));
    }
  }

  private initializeRoutes(): void {
    // Trading routes
    this.registerRoute({
      path: '/api/v1/trade',
      method: ['POST'],
      service: 'trading',
      handler: 'executeTrade',
      permissions: ['positions:write'],
      rateLimit: 10,
    });

    this.registerRoute({
      path: '/api/v1/positions',
      method: ['GET'],
      service: 'trading',
      handler: 'getPositions',
      permissions: ['positions:read'],
      cache: { enabled: true, ttl: 5000 },
    });

    this.registerRoute({
      path: '/api/v1/positions/:id/close',
      method: ['POST'],
      service: 'trading',
      handler: 'closePosition',
      permissions: ['positions:close'],
      rateLimit: 5,
    });

    // Bot routes
    this.registerRoute({
      path: '/api/v1/bots',
      method: ['GET', 'POST'],
      service: 'bots',
      handler: 'manageBots',
      permissions: ['bots:read', 'bots:write'],
    });

    this.registerRoute({
      path: '/api/v1/bots/:id',
      method: ['GET', 'PUT', 'DELETE'],
      service: 'bots',
      handler: 'manageBot',
      permissions: ['bots:read', 'bots:write', 'bots:delete'],
    });

    this.registerRoute({
      path: '/api/v1/bots/:id/start',
      method: ['POST'],
      service: 'bots',
      handler: 'startBot',
      permissions: ['bots:write'],
      rateLimit: 5,
    });

    this.registerRoute({
      path: '/api/v1/bots/:id/stop',
      method: ['POST'],
      service: 'bots',
      handler: 'stopBot',
      permissions: ['bots:write'],
      rateLimit: 5,
    });

    // Market data routes
    this.registerRoute({
      path: '/api/v1/market/ticker',
      method: ['GET'],
      service: 'market',
      handler: 'getTicker',
      cache: { enabled: true, ttl: 1000 },
    });

    this.registerRoute({
      path: '/api/v1/market/klines',
      method: ['GET'],
      service: 'market',
      handler: 'getKlines',
      cache: { enabled: true, ttl: 5000 },
    });

    this.registerRoute({
      path: '/api/v1/market/orderbook',
      method: ['GET'],
      service: 'market',
      handler: 'getOrderbook',
      cache: { enabled: true, ttl: 500 },
    });

    // Analytics routes
    this.registerRoute({
      path: '/api/v1/analytics/pnl',
      method: ['GET'],
      service: 'analytics',
      handler: 'getPnL',
      permissions: ['analytics:read'],
      cache: { enabled: true, ttl: 10000 },
    });

    this.registerRoute({
      path: '/api/v1/analytics/risk',
      method: ['GET'],
      service: 'analytics',
      handler: 'getRiskMetrics',
      permissions: ['analytics:read'],
    });

    // Risk management routes
    this.registerRoute({
      path: '/api/v1/risk/var',
      method: ['GET', 'POST'],
      service: 'risk',
      handler: 'calculateVaR',
      permissions: ['settings:read'],
    });

    this.registerRoute({
      path: '/api/v1/risk/limits',
      method: ['GET', 'PUT'],
      service: 'risk',
      handler: 'manageRiskLimits',
      permissions: ['settings:read', 'settings:write'],
    });

    this.registerRoute({
      path: '/api/v1/risk/kill-switch',
      method: ['POST'],
      service: 'risk',
      handler: 'triggerKillSwitch',
      permissions: ['admin:access'],
      rateLimit: 1,
    });
  }

  // -------------------------------------------------------------------------
  // REQUEST HANDLING
  // -------------------------------------------------------------------------

  async handleRequest(
    request: NextRequest,
    context: TenantContext
  ): Promise<Response> {
    const startTime = Date.now();
    const method = request.method;
    const path = new URL(request.url).pathname;

    try {
      // 1. Match route
      const route = this.matchRoute(method, path);
      if (!route) {
        return this.createResponse(404, { error: 'Not found' });
      }

      // 2. Check permissions
      if (route.permissions) {
        const hasPermission = route.permissions.some((p) =>
          context.permissions.has(p)
        );
        if (!hasPermission) {
          return this.createResponse(403, { error: 'Forbidden' });
        }
      }

      // 3. Check cache
      if (route.cache?.enabled && method === 'GET') {
        const cached = await this.checkCache(path, context.tenant.id);
        if (cached) {
          this.logRequest({
            timestamp: new Date(),
            method,
            path,
            status: 200,
            duration: Date.now() - startTime,
            tenantId: context.tenant.id,
          });
          return this.createResponse(200, cached, { 'X-Cache': 'HIT' });
        }
      }

      // 4. Execute through circuit breaker
      const circuit = this.circuits.get(route.service)!;
      const result = await circuit.execute(
        async () => {
          return this.executeHandler(route, request, context);
        },
        async () => {
          return this.createResponse(503, {
            error: 'Service temporarily unavailable',
            service: route.service,
          });
        }
      );

      // 5. Cache response if applicable
      if (route.cache?.enabled && method === 'GET' && result.ok) {
        const data = await result.clone().json();
        await this.setCache(path, context.tenant.id, data, route.cache.ttl);
      }

      // 6. Log request
      this.logRequest({
        timestamp: new Date(),
        method,
        path,
        status: result.status,
        duration: Date.now() - startTime,
        tenantId: context.tenant.id,
      });

      return result;
    } catch (error) {
      // Log error
      this.logRequest({
        timestamp: new Date(),
        method,
        path,
        status: 500,
        duration: Date.now() - startTime,
        tenantId: context.tenant.id,
      });

      return this.createResponse(500, {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // -------------------------------------------------------------------------
  // ROUTE MATCHING
  // -------------------------------------------------------------------------

  private matchRoute(method: string, path: string): RouteConfig | null {
    for (const [key, config] of this.routes) {
      const [methods, pattern] = key.split(':');

      if (!methods.split('|').includes(method)) continue;

      if (this.matchPath(pattern, path)) {
        return config;
      }
    }

    return null;
  }

  private matchPath(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) return false;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) continue;
      if (patternParts[i] !== pathParts[i]) return false;
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // HANDLER EXECUTION
  // -------------------------------------------------------------------------

  private async executeHandler(
    route: RouteConfig,
    request: NextRequest,
    context: TenantContext
  ): Promise<Response> {
    // In production, this would route to actual service handlers
    // For now, return a mock response
    const data = {
      service: route.service,
      handler: route.handler,
      tenant: context.tenant.id,
      timestamp: new Date().toISOString(),
    };

    return this.createResponse(200, data);
  }

  // -------------------------------------------------------------------------
  // CACHING
  // -------------------------------------------------------------------------

  private cache: Map<string, { data: unknown; expiresAt: number }> = new Map();

  private async checkCache(
    path: string,
    tenantId: string
  ): Promise<unknown | null> {
    const key = `${tenantId}:${path}`;
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private async setCache(
    path: string,
    tenantId: string,
    data: unknown,
    ttl: number
  ): Promise<void> {
    const key = `${tenantId}:${path}`;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  // -------------------------------------------------------------------------
  // LOGGING & METRICS
  // -------------------------------------------------------------------------

  private logRequest(entry: {
    timestamp: Date;
    method: string;
    path: string;
    status: number;
    duration: number;
    tenantId?: string;
  }): void {
    this.requestLog.push(entry);

    // Keep only last 10000 entries
    if (this.requestLog.length > 10000) {
      this.requestLog = this.requestLog.slice(-5000);
    }
  }

  getMetrics(): GatewayMetrics {
    const requests = this.requestLog;
    const successCount = requests.filter((r) => r.status < 400).length;
    const failedCount = requests.filter((r) => r.status >= 400).length;
    const totalDuration = requests.reduce((sum, r) => sum + r.duration, 0);

    let circuitsOpen = 0;
    for (const circuit of this.circuits.values()) {
      if (circuit.getState() === 'open') circuitsOpen++;
    }

    return {
      requestsTotal: requests.length,
      requestsSuccess: successCount,
      requestsFailed: failedCount,
      avgLatency: requests.length > 0 ? totalDuration / requests.length : 0,
      activeConnections: 0, // Would track in production
      circuitsOpen,
    };
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private createResponse(
    status: number,
    data: unknown,
    headers: Record<string, string> = {}
  ): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  }
}

// Singleton
export const apiGateway = new ApiGateway();
