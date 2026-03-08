/**
 * ML WebSocket Hook
 *
 * React hook for real-time ML predictions via WebSocket.
 * Connects directly to the ML Service WebSocket endpoint.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ==================== TYPES ====================

export type MLPredictionChannel = 'price_predictions' | 'signal_predictions' | 'regime_predictions';

export interface MLWebSocketMessage {
  type: string;
  data: unknown;
  timestamp?: string;
}

export interface PricePrediction {
  predictions: number[][];
  horizons: string[];
  confidence?: number;
  note?: string;
}

export interface SignalPrediction {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  probabilities: {
    BUY: number;
    SELL: number;
    HOLD: number;
  };
  note?: string;
}

export interface RegimePrediction {
  regime: 'BULL' | 'BEAR' | 'SIDEWAYS';
  regime_id: number;
  confidence: number;
  probabilities: {
    BULL: number;
    BEAR: number;
    SIDEWAYS: number;
  };
  transition_matrix?: number[][];
  note?: string;
}

export interface UseMLWebSocketOptions {
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Channels to subscribe to */
  channels?: MLPredictionChannel[];
  /** ML Service port (default: 3006) */
  port?: number;
  /** Reconnect on disconnect */
  reconnect?: boolean;
  /** Max reconnect attempts */
  maxReconnectAttempts?: number;
  /** On prediction received */
  onPrediction?: (channel: string, prediction: unknown) => void;
  /** On connection status change */
  onConnectionChange?: (connected: boolean) => void;
  /** On error */
  onError?: (error: string) => void;
}

export interface UseMLWebSocketReturn {
  /** Is WebSocket connected */
  isConnected: boolean;
  /** Last price prediction */
  pricePrediction: PricePrediction | null;
  /** Last signal prediction */
  signalPrediction: SignalPrediction | null;
  /** Last regime prediction */
  regimePrediction: RegimePrediction | null;
  /** Connection error */
  error: string | null;
  /** Connect to WebSocket */
  connect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Subscribe to channels */
  subscribe: (channels: MLPredictionChannel[]) => void;
  /** Unsubscribe from channels */
  unsubscribe: (channels?: MLPredictionChannel[]) => void;
  /** Request prediction on-demand */
  requestPrediction: (type: 'price' | 'signal' | 'regime', features?: unknown) => void;
  /** Send ping */
  ping: () => void;
}

// ==================== HOOK ====================

export function useMLWebSocket(
  options: UseMLWebSocketOptions = {}
): UseMLWebSocketReturn {
  const {
    autoConnect = true,
    channels = ['price_predictions', 'signal_predictions', 'regime_predictions'],
    port = 3006,
    reconnect = true,
    maxReconnectAttempts = 5,
    onPrediction,
    onConnectionChange,
    onError,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelsRef = useRef(channels);
  const callbacksRef = useRef({ onPrediction, onConnectionChange, onError });

  const [isConnected, setIsConnected] = useState(false);
  const [pricePrediction, setPricePrediction] = useState<PricePrediction | null>(null);
  const [signalPrediction, setSignalPrediction] = useState<SignalPrediction | null>(null);
  const [regimePrediction, setRegimePrediction] = useState<RegimePrediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectKey, setConnectKey] = useState(autoConnect ? 1 : 0);

  // Keep refs updated
  useEffect(() => {
    channelsRef.current = channels;
    callbacksRef.current = { onPrediction, onConnectionChange, onError };
  });

  // Build WebSocket URL
  const getWebSocketUrl = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/?XTransformPort=${port}`;
  }, [port]);

  // Auto-connect effect
  useEffect(() => {
    if (connectKey === 0) return;

    const url = getWebSocketUrl();
    if (!url) return;

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ML WebSocket] Connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        callbacksRef.current.onConnectionChange?.(true);

        // Auto-subscribe to channels
        if (channelsRef.current.length > 0) {
          ws.send(JSON.stringify({
            type: 'subscribe_predictions',
            data: { channels: channelsRef.current },
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: MLWebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'prediction':
              const data = message.data as { channel: string; prediction: unknown };
              if (data.channel === 'price_predictions') {
                setPricePrediction(data.prediction as PricePrediction);
              } else if (data.channel === 'signal_predictions') {
                setSignalPrediction(data.prediction as SignalPrediction);
              } else if (data.channel === 'regime_predictions') {
                setRegimePrediction(data.prediction as RegimePrediction);
              }
              callbacksRef.current.onPrediction?.(data.channel, data.prediction);
              break;

            case 'status':
            case 'subscribed':
            case 'unsubscribed':
            case 'heartbeat':
            case 'pong':
              // No action needed
              break;

            case 'error':
              const errorData = message.data as { error: string };
              setError(errorData.error);
              callbacksRef.current.onError?.(errorData.error);
              break;

            default:
              console.log('[ML WebSocket] Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('[ML WebSocket] Parse error:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('[ML WebSocket] Disconnected:', event.code, event.reason);
        setIsConnected(false);
        callbacksRef.current.onConnectionChange?.(false);

        // Attempt reconnect
        if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`[ML WebSocket] Reconnecting in ${delay}ms...`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            setConnectKey(k => k + 1);
          }, delay);
        }
      };

      ws.onerror = () => {
        console.error('[ML WebSocket] Error');
        setError('WebSocket connection error');
        callbacksRef.current.onError?.('WebSocket connection error');
      };

    } catch (err) {
      console.error('[ML WebSocket] Connect error:', err);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setError(err instanceof Error ? err.message : 'Connection failed');
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectKey, getWebSocketUrl, reconnect, maxReconnectAttempts]);

  // Connect function
  const connect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setConnectKey(k => k + 1);
  }, []);

  // Disconnect function
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectKey(0);
    callbacksRef.current.onConnectionChange?.(false);
  }, []);

  // Subscribe to channels
  const subscribe = useCallback((newChannels: MLPredictionChannel[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe_predictions',
        data: { channels: newChannels },
      }));
    }
  }, []);

  // Unsubscribe from channels
  const unsubscribe = useCallback((channelsToUnsubscribe?: MLPredictionChannel[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        data: { channels: channelsToUnsubscribe || [] },
      }));
    }
  }, []);

  // Request prediction on-demand
  const requestPrediction = useCallback((
    type: 'price' | 'signal' | 'regime',
    features?: unknown
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'prediction_request',
        data: { prediction_type: type, features },
      }));
    }
  }, []);

  // Send ping
  const ping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'ping',
      }));
    }
  }, []);

  return {
    isConnected,
    pricePrediction,
    signalPrediction,
    regimePrediction,
    error,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    requestPrediction,
    ping,
  };
}

export default useMLWebSocket;
