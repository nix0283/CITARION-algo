/**
 * CITARION Multi-Tenant Architecture
 * Stage 4.1 - Tenant Manager
 */

import type {
  Tenant,
  TenantUser,
  TenantApiKey,
  TenantContext,
  TenantIdentification,
  TenantResolution,
  TenantLimits,
  TenantPlan,
  TenantRole,
  PLAN_LIMITS,
} from './types';

// ============================================================================
// TENANT MANAGER
// ============================================================================

export class TenantManager {
  private tenants: Map<string, Tenant> = new Map();
  private users: Map<string, TenantUser> = new Map();
  private apiKeys: Map<string, TenantApiKey> = new Map();
  private slugIndex: Map<string, string> = new Map(); // slug -> tenantId
  private apiKeyPrefixIndex: Map<string, string> = new Map(); // prefix -> apiKeyId

  // -------------------------------------------------------------------------
  // TENANT CRUD
  // -------------------------------------------------------------------------

  async createTenant(data: {
    name: string;
    slug: string;
    plan: TenantPlan;
    ownerId: string;
  }): Promise<Tenant> {
    const tenantId = this.generateId();

    const tenant: Tenant = {
      id: tenantId,
      name: data.name,
      slug: data.slug,
      plan: data.plan,
      status: data.plan === 'free' ? 'active' : 'trial',
      limits: this.getPlanLimits(data.plan),
      settings: this.getDefaultSettings(),
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      trialEndsAt: data.plan !== 'free' ? this.addDays(new Date(), 14) : undefined,
    };

    this.tenants.set(tenantId, tenant);
    this.slugIndex.set(data.slug, tenantId);

    // Create owner user
    await this.addUser(tenantId, data.ownerId, 'owner');

    return tenant;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) || null;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    const tenantId = this.slugIndex.get(slug);
    return tenantId ? this.tenants.get(tenantId) || null : null;
  }

  async updateTenant(
    tenantId: string,
    updates: Partial<Tenant>
  ): Promise<Tenant | null> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return null;

    const updated = {
      ...tenant,
      ...updates,
      updatedAt: new Date(),
    };

    this.tenants.set(tenantId, updated);
    return updated;
  }

  async updatePlan(tenantId: string, plan: TenantPlan): Promise<Tenant | null> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) return null;

    return this.updateTenant(tenantId, {
      plan,
      limits: this.getPlanLimits(plan),
    });
  }

  // -------------------------------------------------------------------------
  // USER MANAGEMENT
  // -------------------------------------------------------------------------

  async addUser(
    tenantId: string,
    userId: string,
    role: TenantRole
  ): Promise<TenantUser> {
    const user: TenantUser = {
      id: this.generateId(),
      tenantId,
      userId,
      role,
      permissions: this.getRolePermissions(role),
      settings: {
        defaultExchange: 'binance',
        defaultSymbol: 'BTCUSDT',
        chartTimeframe: '1h',
        notifications: {
          email: true,
          telegram: false,
          webhook: false,
          push: true,
          tradeAlerts: true,
          riskAlerts: true,
          systemAlerts: true,
        },
      },
      createdAt: new Date(),
    };

    this.users.set(user.id, user);
    return user;
  }

  async getUser(userId: string): Promise<TenantUser | null> {
    for (const user of this.users.values()) {
      if (user.userId === userId) return user;
    }
    return null;
  }

  async getTenantUsers(tenantId: string): Promise<TenantUser[]> {
    const users: TenantUser[] = [];
    for (const user of this.users.values()) {
      if (user.tenantId === tenantId) users.push(user);
    }
    return users;
  }

  async updateUserRole(
    userId: string,
    role: TenantRole
  ): Promise<TenantUser | null> {
    for (const [id, user] of this.users) {
      if (user.userId === userId) {
        const updated = {
          ...user,
          role,
          permissions: this.getRolePermissions(role),
        };
        this.users.set(id, updated);
        return updated;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // API KEY MANAGEMENT
  // -------------------------------------------------------------------------

  async createApiKey(
    tenantId: string,
    userId: string,
    name: string,
    permissions: string[]
  ): Promise<{ apiKey: TenantApiKey; plainKey: string }> {
    const plainKey = this.generateApiKey();
    const keyHash = await this.hashKey(plainKey);
    const keyPrefix = plainKey.substring(0, 8);

    const apiKey: TenantApiKey = {
      id: this.generateId(),
      tenantId,
      userId,
      name,
      key: keyHash,
      keyPrefix,
      permissions,
      createdAt: new Date(),
    };

    this.apiKeys.set(apiKey.id, apiKey);
    this.apiKeyPrefixIndex.set(keyPrefix, apiKey.id);

    return { apiKey, plainKey };
  }

  async validateApiKey(key: string): Promise<TenantApiKey | null> {
    const prefix = key.substring(0, 8);
    const apiKeyId = this.apiKeyPrefixIndex.get(prefix);
    if (!apiKeyId) return null;

    const apiKey = this.apiKeys.get(apiKeyId);
    if (!apiKey || apiKey.revokedAt) return null;

    const isValid = await this.compareKey(key, apiKey.key);
    if (!isValid) return null;

    // Update last used
    apiKey.lastUsedAt = new Date();

    return apiKey;
  }

  async revokeApiKey(apiKeyId: string): Promise<boolean> {
    const apiKey = this.apiKeys.get(apiKeyId);
    if (!apiKey) return false;

    apiKey.revokedAt = new Date();
    this.apiKeyPrefixIndex.delete(apiKey.keyPrefix);

    return true;
  }

  // -------------------------------------------------------------------------
  // TENANT IDENTIFICATION
  // -------------------------------------------------------------------------

  async identifyTenant(
    identification: TenantIdentification
  ): Promise<TenantResolution | null> {
    // 1. Try by tenant ID header
    if (identification.tenantId) {
      const tenant = await this.getTenant(identification.tenantId);
      if (tenant) {
        return { tenant, method: 'header', confidence: 1.0 };
      }
    }

    // 2. Try by subdomain
    if (identification.subdomain) {
      const tenant = await this.getTenantBySlug(identification.subdomain);
      if (tenant) {
        return { tenant, method: 'subdomain', confidence: 1.0 };
      }
    }

    // 3. Try by API key
    if (identification.apiKey) {
      const apiKey = await this.validateApiKey(identification.apiKey);
      if (apiKey) {
        const tenant = await this.getTenant(apiKey.tenantId);
        if (tenant) {
          return { tenant, method: 'api_key', confidence: 1.0 };
        }
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // CONTEXT BUILDING
  // -------------------------------------------------------------------------

  async buildContext(
    tenantId: string,
    userId: string
  ): Promise<TenantContext | null> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) return null;

    const user = await this.getUser(userId);
    if (!user || user.tenantId !== tenantId) return null;

    const rateLimit = await this.checkRateLimit(tenantId, tenant.limits.rateLimit);

    return {
      tenant,
      user,
      permissions: new Set(user.permissions),
      rateLimit,
    };
  }

  // -------------------------------------------------------------------------
  // RATE LIMITING
  // -------------------------------------------------------------------------

  private rateLimitStore: Map<string, { count: number; resetAt: Date }> =
    new Map();

  async checkRateLimit(
    tenantId: string,
    limit: number
  ): Promise<{ remaining: number; resetAt: Date }> {
    const now = new Date();
    const windowStart = new Date(
      Math.floor(now.getTime() / 60000) * 60000
    );
    const resetAt = new Date(windowStart.getTime() + 60000);

    let entry = this.rateLimitStore.get(tenantId);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt };
      this.rateLimitStore.set(tenantId, entry);
    }

    entry.count++;

    return {
      remaining: Math.max(0, limit - entry.count),
      resetAt,
    };
  }

  // -------------------------------------------------------------------------
  // FEATURE CHECKING
  // -------------------------------------------------------------------------

  hasFeature(tenant: Tenant, feature: string): boolean {
    if (tenant.limits.features.includes('*')) return true;
    return tenant.limits.features.includes(feature);
  }

  canCreateBot(tenant: Tenant, currentCount: number): boolean {
    if (tenant.limits.maxBots === -1) return true;
    return currentCount < tenant.limits.maxBots;
  }

  canCreatePosition(tenant: Tenant, currentCount: number): boolean {
    if (tenant.limits.maxPositions === -1) return true;
    return currentCount < tenant.limits.maxPositions;
  }

  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'ctr_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  private async hashKey(key: string): Promise<string> {
    // Simple hash for demo - use bcrypt in production
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async compareKey(
    plainKey: string,
    hashedKey: string
  ): Promise<boolean> {
    const hashed = await this.hashKey(plainKey);
    return hashed === hashedKey;
  }

  private getPlanLimits(plan: TenantPlan): TenantLimits {
    const limits: Record<TenantPlan, TenantLimits> = {
      free: {
        maxBots: 2,
        maxPositions: 5,
        maxApiKeys: 2,
        maxUsers: 1,
        rateLimit: 60,
        features: ['basic_signals', 'paper_trading'],
        dataRetention: 7,
        customIndicators: false,
        priority: 'low',
      },
      basic: {
        maxBots: 5,
        maxPositions: 20,
        maxApiKeys: 5,
        maxUsers: 3,
        rateLimit: 120,
        features: ['basic_signals', 'paper_trading', 'backtesting', 'alerts'],
        dataRetention: 30,
        customIndicators: false,
        priority: 'normal',
      },
      pro: {
        maxBots: 20,
        maxPositions: 100,
        maxApiKeys: 20,
        maxUsers: 10,
        rateLimit: 300,
        features: [
          'basic_signals',
          'paper_trading',
          'backtesting',
          'alerts',
          'advanced_analytics',
          'api_access',
          'custom_indicators',
          'copy_trading',
        ],
        dataRetention: 90,
        customIndicators: true,
        priority: 'high',
      },
      enterprise: {
        maxBots: -1,
        maxPositions: -1,
        maxApiKeys: -1,
        maxUsers: -1,
        rateLimit: 1000,
        features: ['*'],
        dataRetention: 365,
        customIndicators: true,
        priority: 'high',
      },
    };

    return limits[plan];
  }

  private getDefaultSettings() {
    return {
      allowedExchanges: ['binance', 'bybit', 'okx'],
      defaultLeverage: 1,
      maxLeverage: 10,
      riskLimits: {
        maxDrawdown: 20,
        maxDailyLoss: 5,
        maxPositionSize: 10000,
        maxTotalExposure: 50000,
        allowedSymbols: '*',
        blockedSymbols: [],
      },
      notifications: {
        email: true,
        telegram: false,
        webhook: false,
        push: true,
        tradeAlerts: true,
        riskAlerts: true,
        systemAlerts: true,
      },
      timezone: 'UTC',
      currency: 'USD',
      theme: 'dark' as const,
    };
  }

  private getRolePermissions(role: TenantRole): string[] {
    const permissions: Record<TenantRole, string[]> = {
      owner: ['*'],
      admin: [
        'bots:read',
        'bots:write',
        'bots:delete',
        'positions:read',
        'positions:write',
        'positions:close',
        'api_keys:read',
        'api_keys:write',
        'api_keys:delete',
        'users:read',
        'settings:read',
        'settings:write',
      ],
      trader: [
        'bots:read',
        'bots:write',
        'positions:read',
        'positions:write',
        'positions:close',
        'settings:read',
      ],
      viewer: ['bots:read', 'positions:read', 'settings:read'],
    };

    return permissions[role];
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}

// Singleton instance
export const tenantManager = new TenantManager();
