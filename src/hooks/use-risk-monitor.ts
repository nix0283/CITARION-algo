/**
 * useRiskMonitor Hook
 * 
 * React hook for real-time risk monitoring via WebSocket
 * Connects to the risk-monitor service on port 3004
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Types
export interface RiskState {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  totalExposure: number;
  totalPnL: number;
  drawdown: number;
  varValue: number;
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
  timestamp: Date;
}

export interface KillSwitchState {
  isArmed: boolean;
  isTriggered: boolean;
  triggerReason?: string;
  botsStopped: number;
  lastTriggeredAt?: Date;
}

export interface RiskAlert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  data?: any;
  timestamp: Date;
  acknowledged: boolean;
}

export interface BotSummary {
  total: number;
  running: number;
  stopped: number;
  byType: Record<string, number>;
}

export interface UseRiskMonitorReturn {
  // State
  riskState: RiskState | null;
  killSwitch: KillSwitchState | null;
  botSummary: BotSummary | null;
  alerts: RiskAlert[];
  isConnected: boolean;
  
  // Actions
  triggerKillSwitch: (reason?: string) => void;
  armKillSwitch: () => void;
  disarmKillSwitch: () => void;
  recoverKillSwitch: () => void;
  acknowledgeAlert: (alertId: string) => void;
  
  // Connection
  connect: () => void;
  disconnect: () => void;
}

const RISK_MONITOR_PORT = 3004;

export function useRiskMonitor(): UseRiskMonitorReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [riskState, setRiskState] = useState<RiskState | null>(null);
  const [killSwitch, setKillSwitch] = useState<KillSwitchState | null>(null);
  const [botSummary, setBotSummary] = useState<BotSummary | null>(null);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io(`/?XTransformPort=${RISK_MONITOR_PORT}`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[RiskMonitor] Connected');
      setIsConnected(true);
      socket.emit('subscribe');
    });

    socket.on('disconnect', () => {
      console.log('[RiskMonitor] Disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[RiskMonitor] Connection error:', error);
    });

    // Initial data
    socket.on('initial_data', (data: {
      riskState: RiskState;
      killSwitch: KillSwitchState;
      botSummary: BotSummary;
      alerts: RiskAlert[];
    }) => {
      setRiskState(data.riskState);
      setKillSwitch(data.killSwitch);
      setBotSummary(data.botSummary);
      setAlerts(data.alerts || []);
    });

    // Risk updates
    socket.on('risk_update', (state: RiskState) => {
      setRiskState(state);
    });

    // Kill switch updates
    socket.on('killswitch_update', (state: KillSwitchState) => {
      setKillSwitch(state);
    });

    socket.on('killswitch_triggered', (data: { reason: string; botsStopped: number; timestamp: Date }) => {
      console.log('[RiskMonitor] Kill switch triggered:', data.reason);
    });

    // Bot summary updates
    socket.on('bot_summary_update', (summary: BotSummary) => {
      setBotSummary(summary);
    });

    // Alerts
    socket.on('risk_alert', (alert: RiskAlert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 100));
    });

    socket.on('alert_acknowledged', (alert: RiskAlert) => {
      setAlerts(prev => prev.map(a => a.id === alert.id ? alert : a));
    });
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Kill switch actions
  const triggerKillSwitch = useCallback((reason?: string) => {
    socketRef.current?.emit('trigger_killswitch', { reason });
  }, []);

  const armKillSwitch = useCallback(() => {
    socketRef.current?.emit('arm_killswitch');
  }, []);

  const disarmKillSwitch = useCallback(() => {
    socketRef.current?.emit('disarm_killswitch');
  }, []);

  const recoverKillSwitch = useCallback(() => {
    socketRef.current?.emit('recover_killswitch');
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    socketRef.current?.emit('acknowledge_alert', alertId);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    riskState,
    killSwitch,
    botSummary,
    alerts,
    isConnected,
    triggerKillSwitch,
    armKillSwitch,
    disarmKillSwitch,
    recoverKillSwitch,
    acknowledgeAlert,
    connect,
    disconnect,
  };
}

export default useRiskMonitor;
