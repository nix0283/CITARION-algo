/**
 * Cornix API Integration
 * Direct connection to Cornix API for signal retrieval and position tracking
 *
 * Features:
 * - API key authentication
 * - Signal retrieval
 * - Position tracking
 * - Real-time notifications
 * - Channel synchronization
 */

// ==================== Types ====================

export interface CornixConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
}

export interface CornixSignal {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrices: number[];
  takeProfits: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage: number;
  marketType: "SPOT" | "FUTURES";
  status: "PENDING" | "ACTIVE" | "CLOSED";
  source: string;
  createdAt: Date;
  exchanges: string[];
}

export interface CornixPosition {
  id: string;
  signalId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  amount: number;
  leverage: number;
  unrealizedPnl: number;
  status: "OPEN" | "CLOSED";
  exchanges: { name: string; positionId: string }[];
}

export interface CornixChannel {
  id: string;
  name: string;
  type: "telegram" | "discord";
  isActive: boolean;
  signalsCount: number;
}

export interface CornixAccount {
  id: string;
  exchange: string;
  exchangeType: "spot" | "futures";
  isConnected: boolean;
  balance: number;
  equity: number;
  unrealizedPnl: number;
}

// ==================== Cornix API Client ====================

export class CornixAPIClient {
  private config: CornixConfig;
  private baseUrl: string;

  constructor(config: CornixConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.cornix.io/v1";
  }

  // ==================== Authentication ====================

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-Key": this.config.apiKey,
      "X-API-Secret": this.config.apiSecret,
    };
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    body?: unknown
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  // ==================== Account Methods ====================

  async getAccounts(): Promise<CornixAccount[]> {
    const result = await this.request<CornixAccount[]>("/accounts");
    return result.data || [];
  }

  async getAccount(accountId: string): Promise<CornixAccount | null> {
    const result = await this.request<CornixAccount>(`/accounts/${accountId}`);
    return result.data || null;
  }

  async getBalance(accountId: string): Promise<{ balance: number; equity: number; pnl: number } | null> {
    const result = await this.request<{ balance: number; equity: number; unrealizedPnl: number }>(
      `/accounts/${accountId}/balance`
    );
    return result.data ? { balance: result.data.balance, equity: result.data.equity, pnl: result.data.unrealizedPnl } : null;
  }

  // ==================== Signal Methods ====================

  async getSignals(options?: {
    status?: "PENDING" | "ACTIVE" | "CLOSED";
    limit?: number;
    offset?: number;
  }): Promise<CornixSignal[]> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));

    const result = await this.request<CornixSignal[]>(`/signals?${params.toString()}`);
    return result.data || [];
  }

  async getSignal(signalId: string): Promise<CornixSignal | null> {
    const result = await this.request<CornixSignal>(`/signals/${signalId}`);
    return result.data || null;
  }

  async getActiveSignals(): Promise<CornixSignal[]> {
    return this.getSignals({ status: "ACTIVE" });
  }

  // ==================== Position Methods ====================

  async getPositions(options?: {
    status?: "OPEN" | "CLOSED";
    limit?: number;
  }): Promise<CornixPosition[]> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.limit) params.set("limit", String(options.limit));

    const result = await this.request<CornixPosition[]>(`/positions?${params.toString()}`);
    return result.data || [];
  }

  async getPosition(positionId: string): Promise<CornixPosition | null> {
    const result = await this.request<CornixPosition>(`/positions/${positionId}`);
    return result.data || null;
  }

  async getOpenPositions(): Promise<CornixPosition[]> {
    return this.getPositions({ status: "OPEN" });
  }

  async closePosition(positionId: string): Promise<boolean> {
    const result = await this.request(`/positions/${positionId}/close`, "POST");
    return result.success;
  }

  async updatePosition(positionId: string, updates: {
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<boolean> {
    const result = await this.request(`/positions/${positionId}`, "POST", updates);
    return result.success;
  }

  // ==================== Channel Methods ====================

  async getChannels(): Promise<CornixChannel[]> {
    const result = await this.request<CornixChannel[]>("/channels");
    return result.data || [];
  }

  async subscribeChannel(channelId: string): Promise<boolean> {
    const result = await this.request(`/channels/${channelId}/subscribe`, "POST");
    return result.success;
  }

  async unsubscribeChannel(channelId: string): Promise<boolean> {
    const result = await this.request(`/channels/${channelId}/unsubscribe`, "POST");
    return result.success;
  }

  // ==================== Trading Methods ====================

  async executeSignal(signal: Omit<CornixSignal, "id" | "createdAt">): Promise<{ success: boolean; positionId?: string; error?: string }> {
    const result = await this.request<{ positionId: string }>("/signals/execute", "POST", signal);
    return { success: result.success, positionId: result.data?.positionId, error: result.error };
  }

  async openPosition(params: {
    symbol: string;
    direction: "LONG" | "SHORT";
    amount: number;
    leverage: number;
    stopLoss?: number;
    takeProfit?: number;
    accountId: string;
  }): Promise<{ success: boolean; positionId?: string; error?: string }> {
    const result = await this.request<{ positionId: string }>("/positions/open", "POST", params);
    return { success: result.success, positionId: result.data?.positionId, error: result.error };
  }

  // ==================== Webhook Methods ====================

  async setupWebhook(webhookUrl: string): Promise<boolean> {
    const result = await this.request("/webhooks", "POST", { url: webhookUrl });
    return result.success;
  }

  async removeWebhook(): Promise<boolean> {
    const result = await this.request("/webhooks", "DELETE");
    return result.success;
  }
}

// ==================== Singleton Instance ====================

let cornixClient: CornixAPIClient | null = null;

export function getCornixClient(): CornixAPIClient | null {
  return cornixClient;
}

export function initializeCornixClient(config: CornixConfig): CornixAPIClient {
  cornixClient = new CornixAPIClient(config);
  return cornixClient;
}

export function isCornixConfigured(): boolean {
  return !!process.env.CORNIX_API_KEY && !!process.env.CORNIX_API_SECRET;
}

// ==================== Helper Functions ====================

export function formatCornixSignal(signal: CornixSignal): string {
  const directionEmoji = signal.direction === "LONG" ? "🟢" : "🔴";
  const marketEmoji = signal.marketType === "SPOT" ? "💱" : "⚡";

  let msg = `${directionEmoji} **${signal.symbol}** ${signal.direction}\n`;
  msg += `${marketEmoji} Market: ${signal.marketType}\n\n`;

  if (signal.entryPrices.length > 0) {
    msg += `📍 Entry: ${signal.entryPrices.map(p => `$${p.toLocaleString()}`).join(", ")}\n`;
  }

  if (signal.takeProfits.length > 0) {
    msg += `🎯 TP: ${signal.takeProfits.map(tp => `$${tp.price.toLocaleString()}`).join(", ")}\n`;
  }

  if (signal.stopLoss) {
    msg += `🛑 SL: $${signal.stopLoss.toLocaleString()}\n`;
  }

  if (signal.marketType === "FUTURES") {
    msg += `⚡ Leverage: ${signal.leverage}x\n`;
  }

  return msg;
}

export function formatCornixPosition(position: CornixPosition): string {
  const directionEmoji = position.direction === "LONG" ? "🟢" : "🔴";
  const pnlEmoji = position.unrealizedPnl >= 0 ? "📈" : "📉";
  const pnlSign = position.unrealizedPnl >= 0 ? "+" : "";

  let msg = `${directionEmoji} **${position.symbol}** ${position.direction}\n\n`;
  msg += `📊 Position:\n`;
  msg += `• Entry: $${position.entryPrice.toLocaleString()}\n`;
  msg += `• Current: $${position.currentPrice.toLocaleString()}\n`;
  msg += `• Amount: ${position.amount}\n`;
  msg += `• Leverage: ${position.leverage}x\n`;
  msg += `• PnL: ${pnlEmoji} ${pnlSign}$${position.unrealizedPnl.toFixed(2)}\n`;

  return msg;
}
