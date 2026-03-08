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
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const modeRef = useRef<"DEMO" | "REAL">("DEMO");
  const exchangeRef = useRef<string>("binance");
  const isLoadingRef = useRef(false);

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
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

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
    } finally {
      isLoadingRef.current = false;
    }
  }, [addMessage]);

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect) return;

    const socket = io("/?XTransformPort=" + port, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
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
      console.log("[ChatWebSocket] Connection error, using API fallback");
      setIsConnected(false);
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
  }, [autoConnect, port, onMessage, onConnect, onDisconnect]);

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

  // Execute signal via demo API (no auth required)
  const executeSignal = useCallback(async (signal: SignalData) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      addMessage({ role: "user", content: `Execute: ${signal.symbol} ${signal.direction}` });

      // Use demo API - no authentication required
      const response = await fetch("/api/demo/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...signal,
          exchangeId: exchangeRef.current,
        }),
      });

      const data = await response.json();

      addMessage({
        role: data.success ? "bot" : "system",
        content: data.message || (data.success
          ? `✅ Position opened: ${signal.symbol} ${signal.direction}`
          : `❌ Failed: ${data.error || "Unknown error"}`),
        type: data.success ? "signal" : "error",
        data: data.position || data,
      });
    } catch (error) {
      addMessage({
        role: "system",
        content: "❌ Failed to execute signal. Please try again.",
        type: "error",
      });
    } finally {
      isLoadingRef.current = false;
    }
  }, [addMessage]);

  // Set mode (DEMO only supported in demo API)
  const setMode = useCallback((mode: "DEMO" | "REAL") => {
    modeRef.current = mode;
    if (mode === "REAL") {
      addMessage({
        role: "system",
        content: "⚠️ REAL mode requires API key configuration. Using DEMO mode.",
        type: "notification",
      });
    }
    if (socketRef.current && isConnected) {
      socketRef.current.emit("set_mode", { mode });
    }
  }, [isConnected, addMessage]);

  // Set exchange
  const setExchange = useCallback((exchange: string) => {
    exchangeRef.current = exchange;
    if (socketRef.current && isConnected) {
      socketRef.current.emit("set_exchange", { exchange });
    }
  }, [isConnected]);

  // Sync positions via demo API
  const syncPositions = useCallback(async () => {
    try {
      const response = await fetch("/api/demo/trade");
      const data = await response.json();
      
      addMessage({
        role: "bot",
        content: `📊 **Demo Positions** (${data.count || 0})\n\n💰 Balance: ${(data.balance?.USDT || 10000).toFixed(2)} USDT`,
        type: "notification",
      });
    } catch {
      addMessage({
        role: "system",
        content: "❌ Failed to sync positions",
        type: "error",
      });
    }
  }, [addMessage]);

  // Escort position
  const escortPosition = useCallback(async (positionId: string, action: "accept" | "ignore") => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit("escort_position", { positionId, action });
    } else {
      addMessage({
        role: "system",
        content: `✅ Position ${action === "accept" ? "accepted" : "ignored"}`,
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
