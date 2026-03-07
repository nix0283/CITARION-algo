/**
 * CITARION Multi-Tenant Architecture
 * Stage 4.1 - Multi-Tenant Types and Interfaces
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type TenantPlan = 'free' | 'basic' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'cancelled' | 'trial';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  limits: TenantLimits;
  settings: TenantSettings;
  metadata: TenantMetadata;
  createdAt: Date;
  updatedAt: Date;
  trialEndsAt?: Date;
}

export interface TenantLimits {
  maxBots: number;
  maxPositions: number;
  maxApiKeys: number;
  maxUsers: number;
  rateLimit: number; // requests per minute
  features: string[];
  dataRetention: number; // days
  customIndicators: boolean;
  priority: 'low' | 'normal' | 'high';
}

export interface TenantSettings {
  allowedExchanges: string[];
  defaultLeverage: number;
  maxLeverage: number;
  riskLimits: RiskLimits;
  notifications: NotificationSettings;
  timezone: string;
  currency: string;
  theme: 'light' | 'dark' | 'auto';
}

export interface RiskLimits {
  maxDrawdown: number; // percentage
  maxDailyLoss: number; // percentage
  maxPositionSize: number; // USD
  maxTotalExposure: number; // USD
  allowedSymbols: string[] | '*';
  blockedSymbols: string[];
}

export interface NotificationSettings {
  email: boolean;
  telegram: boolean;
  webhook: boolean;
  push: boolean;
  tradeAlerts: boolean;
  riskAlerts: boolean;
  systemAlerts: boolean;
}

export interface TenantMetadata {
  company?: string;
  address?: string;
  phone?: string;
  website?: string;
  vatId?: string;
  contactEmail?: string;
}

// ============================================================================
// USER IN TENANT CONTEXT
// ============================================================================

export type TenantRole = 'owner' | 'admin' | 'trader' | 'viewer';

export interface TenantUser {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  permissions: string[];
  settings: UserSettings;
  createdAt: Date;
  lastAccessAt?: Date;
}

export interface UserSettings {
  defaultExchange: string;
  defaultSymbol: string;
  chartTimeframe: string;
  notifications: NotificationSettings;
}

// ============================================================================
// TENANT API KEY
// ============================================================================

export interface TenantApiKey {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  key: string; // hashed
  keyPrefix: string; // first 8 chars for display
  permissions: string[];
  exchange?: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  revokedAt?: Date;
}

// ============================================================================
// PLAN LIMITS CONFIGURATION
// ============================================================================

export const PLAN_LIMITS: Record<TenantPlan, TenantLimits> = {
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
    maxBots: -1, // unlimited
    maxPositions: -1,
    maxApiKeys: -1,
    maxUsers: -1,
    rateLimit: 1000,
    features: ['*'], // all features
    dataRetention: 365,
    customIndicators: true,
    priority: 'high',
  },
};

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export const FEATURES = {
  // Trading
  BASIC_SIGNALS: 'basic_signals',
  PAPER_TRADING: 'paper_trading',
  LIVE_TRADING: 'live_trading',
  COPY_TRADING: 'copy_trading',

  // Analysis
  BACKTESTING: 'backtesting',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  PORTFOLIO_OPTIMIZATION: 'portfolio_optimization',
  STRESS_TESTING: 'stress_testing',

  // Automation
  ALERTS: 'alerts',
  WEBHOOKS: 'webhooks',
  API_ACCESS: 'api_access',
  CUSTOM_INDICATORS: 'custom_indicators',

  // Risk
  VAR_CALCULATOR: 'var_calculator',
  KILL_SWITCH: 'kill_switch',
  POSITION_LIMITER: 'position_limiter',

  // Bots
  HFT_BOT: 'hft_bot',
  GENETIC_OPTIMIZATION: 'genetic_optimization',
  SELF_LEARNING: 'self_learning',

  // Integrations
  TELEGRAM_BOT: 'telegram_bot',
  MOBILE_PWA: 'mobile_pwa',
} as const;

export type FeatureName = (typeof FEATURES)[keyof typeof FEATURES];

// ============================================================================
// TENANT CONTEXT
// ============================================================================

export interface TenantContext {
  tenant: Tenant;
  user: TenantUser;
  permissions: Set<string>;
  rateLimit: {
    remaining: number;
    resetAt: Date;
  };
}

// ============================================================================
// IDENTIFICATION METHODS
// ============================================================================

export interface TenantIdentification {
  subdomain?: string;
  tenantId?: string;
  apiKey?: string;
  userId?: string;
}

export interface TenantResolution {
  tenant: Tenant;
  method: 'subdomain' | 'header' | 'api_key' | 'session';
  confidence: number;
}
