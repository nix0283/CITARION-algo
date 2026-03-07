"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  User,
  Send,
  TrendingUp,
  TrendingDown,
  Copy,
  Sparkles,
  Zap,
  AlertCircle,
  Building2,
  Bell,
  BellRing,
  RefreshCw,
  ExternalLink,
  WifiOff,
  Wifi,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

const EXCHANGES = [
  { id: "binance", name: "Binance", hasDemo: true },
  { id: "bybit", name: "Bybit", hasDemo: true },
  { id: "okx", name: "OKX", hasDemo: true },
  { id: "bitget", name: "Bitget", hasDemo: true },
  { id: "kucoin", name: "KuCoin", hasDemo: true },
  { id: "bingx", name: "BingX", hasDemo: true },
  { id: "gate", name: "Gate.io", hasDemo: true },
  { id: "hyperliquid", name: "HyperLiquid", hasDemo: true },
];

interface Message {
  id: string;
  role: "user" | "bot" | "system" | "notification";
  content: string;
  timestamp: Date;
  type?: string;
  data?: Record<string, unknown>;
}

interface ParsedSignal {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrices: number[];
  takeProfits: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage: number;
  marketType: "SPOT" | "FUTURES";
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function ChatBot() {
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedExchange, setSelectedExchange] = useState("binance");
  const [mode, setMode] = useState<"DEMO" | "REAL">("DEMO");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // SSE connection for notifications
  useEffect(() => {
    const connectSSE = () => {
      try {
        const eventSource = new EventSource("/api/notifications");
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => setIsConnected(true);
        eventSource.onerror = () => {
          setIsConnected(false);
          eventSource.close();
          setTimeout(connectSSE, 5000);
        };

        eventSource.onmessage = (event) => {
          try {
            const notification = JSON.parse(event.data);
            if (notification.title === "Connected") return;
            
            addMessage({
              role: "notification",
              content: `🔔 ${notification.title}\n\n${notification.message}`,
              type: "notification",
            });
          } catch {
            // Ignore parse errors
          }
        };
      } catch {
        setTimeout(connectSSE, 5000);
      }
    };

    // Add welcome message
    addMessage({
      role: "bot",
      content: `👋 **Привет! Я Oracle** — AI-бот для торговли.

📌 **Возможности:**
• Отправьте сигнал в Cornix формате
• Команды: **help**, **positions**, **close all**
• Выберите биржу и режим (DEMO)

🔮 *Вижу сигналы там, где другие видят хаос.*

Пример: \`BTCUSDT LONG Entry: 67000 TP: 68000 SL: 66000 Leverage: 10x\``,
      type: "welcome",
    });

    connectSSE();

    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Add a message
  const addMessage = useCallback((msg: Omit<Message, "id" | "timestamp">) => {
    const newMsg: Message = {
      ...msg,
      id: generateId(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  }, []);

  // Send message
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const currentInput = input.trim();
    setInput("");
    setIsLoading(true);

    // Add user message
    addMessage({ role: "user", content: currentInput });

    try {
      const response = await fetch("/api/chat/parse-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput }),
      });

      const data = await response.json();

      addMessage({
        role: data.success ? "bot" : "system",
        content: data.message || "Не удалось обработать сообщение",
        type: data.type,
        data: data.signal || data,
      });
    } catch {
      addMessage({
        role: "system",
        content: "❌ Ошибка. Попробуйте ещё раз.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  // Execute signal via demo API
  const handleExecuteSignal = async (signal: ParsedSignal) => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      toast.loading(`Opening ${signal.symbol} ${signal.direction}...`, { id: "execute" });

      const response = await fetch("/api/demo/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...signal,
          exchangeId: selectedExchange,
          amount: 100,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message, { id: "execute" });
        addMessage({
          role: "bot",
          content: data.message,
          type: "signal",
          data: data.position,
        });
        // Dispatch event to update positions table
        console.log("[ChatBot] Dispatching position-opened event:", data.position);
        window.dispatchEvent(new CustomEvent("position-opened", { 
          detail: data.position 
        }));
        // Also dispatch to window for other components
        window.dispatchEvent(new Event("position-opened"));
      } else {
        toast.error(data.error || "Failed", { id: "execute" });
        addMessage({
          role: "system",
          content: `❌ ${data.error || "Failed to open position"}`,
          type: "error",
        });
      }
    } catch (error) {
      toast.error("Error executing signal", { id: "execute" });
    } finally {
      setIsLoading(false);
    }
  };

  // Sync positions
  const handleSyncPositions = async () => {
    if (isLoading) return;
    setIsLoading(true);

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
        content: "❌ Failed to sync",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Close all positions
  const handleCloseAll = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch("/api/demo/close-all", { method: "POST" });
      const data = await response.json();

      addMessage({
        role: data.success ? "bot" : "system",
        content: data.message || data.error,
        type: data.success ? "notification" : "error",
      });
    } catch {
      addMessage({
        role: "system",
        content: "❌ Failed to close positions",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessageContent = (message: Message) => {
    const signal = message.type === "signal" && message.data ? 
      (message.data as ParsedSignal) : null;

    return (
      <>
        <p className="whitespace-pre-wrap">{message.content}</p>

        {signal && (
          <div className="mt-2 rounded-lg border border-border bg-card p-3 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  signal.direction === "LONG"
                    ? "bg-green-500/10 text-green-500 border-green-500/20"
                    : "bg-red-500/10 text-red-500 border-red-500/20"
                )}
              >
                {signal.direction === "LONG" ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {signal.direction}
              </Badge>
              <span className="font-medium text-sm">{signal.symbol}</span>
              <Badge variant="secondary" className="text-xs">
                {signal.leverage}x
              </Badge>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="flex-1 h-8"
                onClick={() => handleExecuteSignal(signal)}
                disabled={isLoading}
              >
                <Zap className="h-3 w-3 mr-1" />
                Execute
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(signal, null, 2));
                  toast.success("Copied");
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="relative">
              <Bot className="h-5 w-5 text-primary" />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full",
                  isConnected ? "bg-green-500" : "bg-yellow-500"
                )}
              />
            </div>
            Oracle
            <span className="text-xs font-normal text-muted-foreground">(DEMO)</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              AI
            </Badge>
            <Badge
              className={cn(
                "text-xs",
                mode === "DEMO"
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-orange-500/10 text-orange-500 border-orange-500/20"
              )}
            >
              {mode}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
        <div className="flex-1 min-h-0 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex gap-3", message.role === "user" && "flex-row-reverse")}
                >
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback
                      className={cn(
                        message.role === "bot"
                          ? "bg-primary/20 text-primary"
                          : message.role === "system"
                          ? "bg-red-500/20 text-red-500"
                          : message.role === "notification"
                          ? "bg-blue-500/20 text-blue-500"
                          : "bg-secondary"
                      )}
                    >
                      {message.role === "bot" ? (
                        <Bot className="h-4 w-4" />
                      ) : message.role === "system" ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : message.role === "notification" ? (
                        <Bell className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div className={cn("flex-1 max-w-[85%]", message.role === "user" && "text-right")}>
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : message.role === "system"
                          ? "bg-red-500/10 text-red-600 dark:text-red-400 rounded-tl-sm border border-red-500/20"
                          : message.role === "notification"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-tl-sm border border-blue-500/20"
                          : "bg-secondary rounded-tl-sm"
                      )}
                    >
                      {renderMessageContent(message)}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20 text-primary">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs text-muted-foreground">Processing...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border flex-shrink-0 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <Select value={selectedExchange} onValueChange={setSelectedExchange}>
              <SelectTrigger className="h-7 text-xs w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGES.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {ex.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mode} onValueChange={(v) => setMode(v as "DEMO" | "REAL")}>
              <SelectTrigger className="h-7 text-xs w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEMO">DEMO</SelectItem>
                <SelectItem value="REAL">REAL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Signal or command (help, positions, close all...)"
              className="flex-1"
              disabled={isLoading}
              autoFocus
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <div className="flex flex-wrap gap-1 mt-2">
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-primary" onClick={() => setInput("help")}>
              📖 help
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setInput("positions")}>
              📊 positions
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-blue-500"
              onClick={handleSyncPositions}
              disabled={isLoading}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Sync
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-red-500"
              onClick={handleCloseAll}
              disabled={isLoading}
            >
              🚫 close all
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
