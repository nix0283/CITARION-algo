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

// Helper function to generate unique IDs
function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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
  const modeRef = useRef<"DEMO" | "REAL">("DEMO");
  const exchangeRef = useRef<string>("binance");

  // Add a message to the local state
  const addMessage = useCallback((message: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    onMessage?.(newMessage);
    return newMessage;
  }, [onMessage]);

  // API fallback for when WebSocket is not connected
  const sendMessageViaAPI = useCallback(async (content: string) => {
    try {
      // Add user message
      addMessage({ role: "user", content });

      // Call the parse-signal API
      const response = await fetch("/api/chat/parse-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });

      const data = await response.json();

      // Add bot response
      addMessage({
        role: data.success ? "bot" : "system",
        content: data.message || "Failed to process message",
        type: data.type,
        data: data.signal || data,
      });

      return data;
    } catch (error) {
      addMessage({
        role: "system",
        content: "❌ Error processing message. Please try again.",
        type: "error",
      });
      return null;
    }
  }, [addMessage]);

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
      // Don't call onError for connection errors - we have API fallback
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

  // Send message (with API fallback)
  const sendMessage = useCallback((content: string) => {
    if (socketRef.current && isConnected) {
      // Add user message locally
      addMessage({ role: "user", content });
      // Send via WebSocket
      socketRef.current.emit("send_message", { content });
    } else {
      // Fallback to API
      sendMessageViaAPI(content);
    }
  }, [isConnected, addMessage, sendMessageViaAPI]);

  // Execute signal (with API fallback)
  const executeSignal = useCallback(async (signal: SignalData) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("execute_signal", { signal });
    } else {
      // Fallback to API
      addMessage({ role: "user", content: `Execute: ${signal.symbol} ${signal.direction}` });
      
      const response = await fetch("/api/trade/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...signal,
          isDemo: modeRef.current === "DEMO",
          exchangeId: exchangeRef.current,
          amount: 100,
        }),
      });

      const data = await response.json();

      addMessage({
        role: data.success ? "bot" : "system",
        content: data.success
          ? `✅ Position opened: ${signal.symbol} ${signal.direction}`
          : `❌ Failed: ${data.error || "Unknown error"}`,
        type: data.success ? "signal" : "error",
      });
    }
  }, [isConnected, addMessage]);

  // Set mode
  const setMode = useCallback((mode: "DEMO" | "REAL") => {
    modeRef.current = mode;
    if (socketRef.current && isConnected) {
      socketRef.current.emit("set_mode", { mode });
    }
  }, [isConnected]);

  // Set exchange
  const setExchange = useCallback((exchange: string) => {
    exchangeRef.current = exchange;
    if (socketRef.current && isConnected) {
      socketRef.current.emit("set_exchange", { exchange });
    }
  }, [isConnected]);

  // Sync positions (with API fallback)
  const syncPositions = useCallback(async () => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("sync_positions");
    } else {
      // Fallback to API
      const response = await fetch("/api/positions/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      addMessage({
        role: "bot",
        content: data.success
          ? `🔄 Synced: ${data.newPositions || 0} new positions`
          : "❌ Sync failed",
        type: "notification",
      });
    }
  }, [isConnected, addMessage]);

  // Escort position (with API fallback)
  const escortPosition = useCallback(async (positionId: string, action: "accept" | "ignore") => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("escort_position", { positionId, action });
    } else {
      // Fallback to API
      const response = await fetch("/api/positions/escort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalPositionId: positionId, action }),
      });

      const data = await response.json();
      addMessage({
        role: data.success ? "bot" : "system",
        content: data.success
          ? `✅ Position ${action === "accept" ? "accepted" : "ignored"}`
          : "❌ Failed to update position",
        type: "notification",
      });
    }
  }, [isConnected, addMessage]);

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
