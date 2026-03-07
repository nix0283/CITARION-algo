"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// Types
export interface ChatMessage {
  id: string;
  role: "user" | "bot" | "system" | "notification";
  content: string;
  timestamp: Date;
  type?: "signal" | "command" | "notification" | "external-position" | "error";
  data?: SignalData | ExternalPosition | NotificationData | CommandResult;
}

export interface SignalData {
  symbol: string;
  direction: "LONG" | "SHORT";
  action: "BUY" | "SELL" | "CLOSE";
  entryPrices: number[];
  takeProfits: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage: number;
  marketType: "SPOT" | "FUTURES";
}

export interface ExternalPosition {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  exchangeName: string;
  amount: number;
  amountUsd: number;
  avgEntryPrice: number;
  currentPrice?: number;
  leverage: number;
  unrealizedPnl?: number;
  detectedAt: string;
}

export interface NotificationData {
  type: string;
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "critical";
}

export interface CommandResult {
  command: string;
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface UseChatWebSocketOptions {
  port?: number;
  autoConnect?: boolean;
  onMessage?: (message: ChatMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface UseChatWebSocketReturn {
  isConnected: boolean;
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  executeSignal: (signal: SignalData) => void;
  setMode: (mode: "DEMO" | "REAL") => void;
  setExchange: (exchange: string) => void;
  syncPositions: () => void;
  escortPosition: (positionId: string, action: "accept" | "ignore") => void;
  clearMessages: () => void;
}

const CHAT_SERVICE_PORT = 3005;

export function useChatWebSocket(options: UseChatWebSocketOptions = {}): UseChatWebSocketReturn {
  const {
    port = CHAT_SERVICE_PORT,
    autoConnect = true,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect) return;

    const socket = io("/?XTransformPort=" + port, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[ChatWebSocket] Connected");
      setIsConnected(true);
      onConnect?.();
    });

    socket.on("disconnect", () => {
      console.log("[ChatWebSocket] Disconnected");
      setIsConnected(false);
      onDisconnect?.();
    });

    socket.on("connect_error", (error) => {
      console.error("[ChatWebSocket] Connection error:", error);
      onError?.(error);
    });

    socket.on("chat_message", (message: ChatMessage) => {
      setMessages((prev) => [...prev, { ...message, timestamp: new Date(message.timestamp) }]);
      onMessage?.(message);
    });

    socket.on("message_history", (history: ChatMessage[]) => {
      setMessages(history.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
    });

    return () => {
      socket.disconnect();
    };
  }, [autoConnect, port, onMessage, onConnect, onDisconnect, onError]);

  // Send message
  const sendMessage = useCallback((content: string) => {
    if (!socketRef.current || !isConnected) {
      console.warn("[ChatWebSocket] Not connected");
      return;
    }

    socketRef.current.emit("send_message", { content });
  }, [isConnected]);

  // Execute signal
  const executeSignal = useCallback((signal: SignalData) => {
    if (!socketRef.current || !isConnected) {
      console.warn("[ChatWebSocket] Not connected");
      return;
    }

    socketRef.current.emit("execute_signal", { signal });
  }, [isConnected]);

  // Set mode
  const setMode = useCallback((mode: "DEMO" | "REAL") => {
    if (!socketRef.current || !isConnected) return;
    socketRef.current.emit("set_mode", { mode });
  }, [isConnected]);

  // Set exchange
  const setExchange = useCallback((exchange: string) => {
    if (!socketRef.current || !isConnected) return;
    socketRef.current.emit("set_exchange", { exchange });
  }, [isConnected]);

  // Sync positions
  const syncPositions = useCallback(() => {
    if (!socketRef.current || !isConnected) return;
    socketRef.current.emit("sync_positions");
  }, [isConnected]);

  // Escort position
  const escortPosition = useCallback((positionId: string, action: "accept" | "ignore") => {
    if (!socketRef.current || !isConnected) return;
    socketRef.current.emit("escort_position", { positionId, action });
  }, [isConnected]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    isConnected,
    messages,
    sendMessage,
    executeSignal,
    setMode,
    setExchange,
    syncPositions,
    escortPosition,
    clearMessages,
  };
}
