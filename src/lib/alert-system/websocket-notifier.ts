/**
 * WebSocket Notifier
 *
 * Real-time notification broadcaster for frontend clients.
 * Uses a lightweight approach compatible with Next.js App Router.
 */

import type { Notifier, AlertChannel, AlertPayload } from './index';
import { ALERT_EMOJIS } from './index';

// =============================================================================
// TYPES
// =============================================================================

export interface WebSocketAlert {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  priority: string;
  data: Record<string, unknown> | null;
  timestamp: number;
  source: string | null;
  symbol: string | null;
}

export interface ClientSubscription {
  socketId: string;
  userId?: string;
  channels: string[];
  symbols: string[];
  sources: string[];
}

export interface WebSocketConfig {
  enabled: boolean;
  port?: number;
  corsOrigin?: string | string[];
}

// =============================================================================
// WEBSOCKET NOTIFIER CLASS
// =============================================================================

class WebSocketNotifierClass implements Notifier {
  name: AlertChannel = 'websocket';
  private config: WebSocketConfig;
  private alertHistory: WebSocketAlert[] = [];
  private maxHistorySize: number = 100;
  private listeners: Array<(alert: WebSocketAlert) => void> = [];

  constructor(config?: WebSocketConfig) {
    this.config = config || { enabled: true };
  }

  /**
   * Add a listener for alerts
   */
  addListener(listener: (alert: WebSocketAlert) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Remove a listener
   */
  removeListener(listener: (alert: WebSocketAlert) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * Check if the notifier is configured
   */
  isConfigured(): boolean {
    return this.config.enabled;
  }

  /**
   * Send an alert via WebSocket
   */
  async send(alert: AlertPayload & { alertId: string }): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'WebSocket not enabled' };
    }

    try {
      const wsAlert: WebSocketAlert = {
        id: alert.alertId,
        type: alert.type,
        category: alert.category,
        title: alert.title,
        message: alert.message,
        priority: alert.priority || 'normal',
        data: alert.data || null,
        timestamp: Date.now(),
        source: alert.source || null,
        symbol: alert.data?.symbol || null,
      };

      // Add to history
      this.alertHistory.push(wsAlert);
      if (this.alertHistory.length > this.maxHistorySize) {
        this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
      }

      // Notify all listeners
      this.notifyListeners(wsAlert);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Notify all registered listeners
   */
  private notifyListeners(alert: WebSocketAlert): void {
    for (const listener of this.listeners) {
      try {
        listener(alert);
      } catch (error) {
        console.error('[WebSocketNotifier] Listener error:', error);
      }
    }
  }

  /**
   * Get connected client count
   */
  getConnectedCount(): number {
    return this.listeners.length;
  }

  /**
   * Get alert history
   */
  getHistory(limit: number = 50): WebSocketAlert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WebSocketConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const websocketNotifier = new WebSocketNotifierClass();

// =============================================================================
// HOOK FOR CLIENT COMPONENTS
// =============================================================================

export interface UseAlertsOptions {
  channels?: string[];
  symbols?: string[];
  sources?: string[];
  userId?: string;
  onAlert?: (alert: WebSocketAlert) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Get the WebSocket URL for alerts
 */
export function getAlertWebSocketUrl(): string {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/socket/alerts`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format alert for display
 */
export function formatAlertDisplay(alert: WebSocketAlert): string {
  const emoji = ALERT_EMOJIS[alert.type as keyof typeof ALERT_EMOJIS] || '🔔';
  return `${emoji} ${alert.title}\n${alert.message}`;
}

/**
 * Get alert severity color
 */
export function getAlertSeverityColor(priority: string): string {
  switch (priority) {
    case 'critical':
      return '#ef4444'; // red
    case 'high':
      return '#f97316'; // orange
    case 'normal':
      return '#22c55e'; // green
    case 'low':
      return '#6b7280'; // gray
    default:
      return '#6b7280';
  }
}

/**
 * Check if alert should play sound
 */
export function shouldPlaySound(priority: string): boolean {
  return priority === 'critical' || priority === 'high';
}
