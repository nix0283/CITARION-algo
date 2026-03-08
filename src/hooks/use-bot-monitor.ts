/**
 * useBotMonitor Hook
 * Real-time bot monitoring via WebSocket
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Types
export interface BotStatus {
  id: string;
  type: string;
  name: string;
  status: string;
  exchangeId: string;
  symbol: string;
  mode: string;
  metrics: {
    totalTrades: number;
    totalPnL: number;
    unrealizedPnL: number;
    winRate: number;
  };
  lastUpdate: Date;
}

export interface BotEvent {
  type: 'status_change' | 'trade' | 'position_update' | 'error' | 'log';
  botId: string;
  data: any;
  timestamp: Date;
}

export interface UseBotMonitorOptions {
  autoConnect?: boolean;
  onBotUpdate?: (bot: BotStatus) => void;
  onBotEvent?: (event: BotEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface UseBotMonitorReturn {
  bots: BotStatus[];
  events: BotEvent[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  startBot: (botId: string) => void;
  stopBot: (botId: string) => void;
  pauseBot: (botId: string) => void;
  executeTrade: (params: {
    botId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    amount: number;
    price?: number;
  }) => void;
  subscribeBot: (botId: string) => void;
  unsubscribeBot: (botId: string) => void;
  refreshBots: () => void;
}

const BOT_MONITOR_PORT = 3003;

export function useBotMonitor(options: UseBotMonitorOptions = {}): UseBotMonitorReturn {
  const {
    autoConnect = true,
    onBotUpdate,
    onBotEvent,
    onConnectionChange,
  } = options;

  const [bots, setBots] = useState<BotStatus[]>([]);
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io(`/?XTransformPort=${BOT_MONITOR_PORT}`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[BotMonitor] Connected');
      setIsConnected(true);
      setError(null);
      onConnectionChange?.(true);
    });

    socket.on('disconnect', () => {
      console.log('[BotMonitor] Disconnected');
      setIsConnected(false);
      onConnectionChange?.(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[BotMonitor] Connection error:', err.message);
      setError(err.message);
      setIsLoading(false);
    });

    // Initial data
    socket.on('initial_data', (data: { bots: BotStatus[]; events: BotEvent[] }) => {
      setBots(data.bots);
      setEvents(data.events);
      setIsLoading(false);
    });

    // Bot updates
    socket.on('bot_update', (bot: BotStatus) => {
      setBots(prev => {
        const index = prev.findIndex(b => b.id === bot.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = bot;
          return updated;
        }
        return [...prev, bot];
      });
      onBotUpdate?.(bot);
    });

    // Bot metrics update
    socket.on('bot_metrics', (data: { botId: string; metrics: any; timestamp: Date }) => {
      setBots(prev => prev.map(bot =>
        bot.id === data.botId
          ? { ...bot, metrics: { ...bot.metrics, ...data.metrics }, lastUpdate: new Date() }
          : bot
      ));
    });

    // Bot events
    socket.on('bot_event', (event: BotEvent) => {
      setEvents(prev => [...prev.slice(-99), event]);
      onBotEvent?.(event);
    });

    // All bots update
    socket.on('all_bots', (updatedBots: BotStatus[]) => {
      setBots(updatedBots);
    });
  }, [onBotUpdate, onBotEvent, onConnectionChange]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  // Start bot
  const startBot = useCallback((botId: string) => {
    socketRef.current?.emit('start_bot', { botId });
  }, []);

  // Stop bot
  const stopBot = useCallback((botId: string) => {
    socketRef.current?.emit('stop_bot', { botId });
  }, []);

  // Pause bot
  const pauseBot = useCallback((botId: string) => {
    socketRef.current?.emit('pause_bot', { botId });
  }, []);

  // Execute trade
  const executeTrade = useCallback((params: {
    botId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    amount: number;
    price?: number;
  }) => {
    socketRef.current?.emit('execute_trade', params);
  }, []);

  // Subscribe to specific bot
  const subscribeBot = useCallback((botId: string) => {
    socketRef.current?.emit('subscribe_bot', botId);
  }, []);

  // Unsubscribe from bot
  const unsubscribeBot = useCallback((botId: string) => {
    socketRef.current?.emit('unsubscribe_bot', botId);
  }, []);

  // Refresh bots
  const refreshBots = useCallback(() => {
    socketRef.current?.emit('get_all_bots');
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    bots,
    events,
    isConnected,
    isLoading,
    error,
    connect,
    disconnect,
    startBot,
    stopBot,
    pauseBot,
    executeTrade,
    subscribeBot,
    unsubscribeBot,
    refreshBots,
  };
}

export default useBotMonitor;
