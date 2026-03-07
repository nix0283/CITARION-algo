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
  FileText,
  Check,
  Building2,
  Bell,
  BellRing,
  RefreshCw,
  ExternalLink,
  WifiOff,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useChatWebSocket, type ChatMessage, type SignalData, type ExternalPosition } from "@/hooks/use-chat-websocket";

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

const EXCHANGES = [
  { id: "binance", name: "Binance", hasTestnet: true, hasDemo: false },
  { id: "bybit", name: "Bybit", hasTestnet: true, hasDemo: false },
  { id: "okx", name: "OKX", hasTestnet: false, hasDemo: true },
  { id: "bitget", name: "Bitget", hasTestnet: false, hasDemo: true },
  { id: "kucoin", name: "KuCoin", hasTestnet: true, hasDemo: false },
  { id: "bingx", name: "BingX", hasTestnet: false, hasDemo: true },
  { id: "huobi", name: "HTX (Huobi)", hasTestnet: true, hasDemo: false },
  { id: "hyperliquid", name: "HyperLiquid", hasTestnet: true, hasDemo: false },
  { id: "bitmex", name: "BitMEX", hasTestnet: true, hasDemo: false },
  { id: "blofin", name: "BloFin", hasTestnet: false, hasDemo: true },
  { id: "coinbase", name: "Coinbase", hasTestnet: true, hasDemo: false },
  { id: "aster", name: "Aster DEX", hasTestnet: true, hasDemo: true },
  { id: "gate", name: "Gate.io", hasTestnet: true, hasDemo: true },
];

export function ChatBot() {
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedExchange, setSelectedExchange] = useState("gate");
  const [mode, setMode] = useState<"DEMO" | "REAL">("DEMO");
  const scrollRef = useRef<HTMLDivElement>(null);

  // WebSocket connection
  const {
    isConnected,
    messages,
    sendMessage: wsSendMessage,
    executeSignal,
    setExchange,
    setMode: wsSetMode,
    syncPositions,
    escortPosition,
  } = useChatWebSocket({
    autoConnect: true,
    onMessage: (message) => {
      // Show toast for important messages
      if (message.type === "notification" && message.data) {
        const data = message.data as { priority?: string };
        if (data.priority === "critical" || data.priority === "high") {
          toast.error(message.content.split("\n")[0], {
            description: message.content.split("\n").slice(1).join("\n"),
          });
        }
      }
    },
  });

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Update exchange on WebSocket
  useEffect(() => {
    setExchange(selectedExchange);
  }, [selectedExchange, setExchange]);

  // Update mode on WebSocket
  useEffect(() => {
    wsSetMode(mode);
  }, [mode, wsSetMode]);

  const handleSend = () => {
    if (!input.trim()) return;
    wsSendMessage(input.trim());
    setInput("");
  };

  const handleExecuteSignal = (signal: SignalData) => {
    executeSignal(signal);
    toast.success(`Executing ${signal.symbol} ${signal.direction}...`);
  };

  const handleCopyTemplate = (template: string, messageId: string) => {
    navigator.clipboard.writeText(template);
    setCopiedId(messageId);
    toast.success("Copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSyncPositions = () => {
    syncPositions();
    toast.loading("Syncing positions...", { id: "sync" });
    setTimeout(() => toast.success("Sync initiated", { id: "sync" }), 1000);
  };

  const handleEscortPosition = (positionId: string, action: "accept" | "ignore") => {
    escortPosition(positionId, action);
    toast.success(action === "accept" ? "Position accepted for escort" : "Position ignored");
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const getNotificationIcon = (type?: string) => {
    if (!type) return <Bell className="h-4 w-4" />;
    if (type.includes("TP")) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (type.includes("SL")) return <TrendingDown className="h-4 w-4 text-red-500" />;
    if (type.includes("EXTERNAL")) return <ExternalLink className="h-4 w-4 text-blue-500" />;
    if (type.includes("WARNING") || type.includes("ERROR") || type.includes("RISK"))
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    return <Bell className="h-4 w-4" />;
  };

  const renderMessageContent = (message: ChatMessage) => {
    const signal = message.type === "signal" ? (message.data as SignalData) : null;
    const externalPos = message.type === "external-position" ? (message.data as ExternalPosition) : null;

    return (
      <>
        <p className="whitespace-pre-wrap">{message.content}</p>

        {/* Signal with Execute button */}
        {signal && (
          <div className="mt-2 rounded-lg border border-border bg-card p-3 text-left">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
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
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Entry:</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {signal.entryPrices.map((price, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      ${formatNumber(price)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">TP:</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {signal.takeProfits.map((tp, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      ${formatNumber(tp.price)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            {signal.stopLoss && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">SL:</span>{" "}
                <span className="text-red-500">${formatNumber(signal.stopLoss)}</span>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="flex-1 h-8"
                onClick={() => handleExecuteSignal(signal)}
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

        {/* External Position with Escort buttons */}
        {externalPos && (
          <div className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-left">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                External Position
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  externalPos.direction === "LONG"
                    ? "bg-green-500/10 text-green-500 border-green-500/20"
                    : "bg-red-500/10 text-red-500 border-red-500/20"
                )}
              >
                {externalPos.direction === "LONG" ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {externalPos.direction}
              </Badge>
              <span className="font-medium text-sm">{externalPos.symbol}</span>
              <Badge variant="secondary" className="text-xs">
                {externalPos.leverage}x
              </Badge>
            </div>
            <div className="text-xs space-y-1 text-muted-foreground">
              <div>Exchange: {externalPos.exchangeName}</div>
              <div>Entry: ${formatNumber(externalPos.avgEntryPrice)}</div>
              <div>Amount: {externalPos.amount.toFixed(6)} (${formatNumber(externalPos.amountUsd)})</div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="flex-1 h-8 bg-green-500 hover:bg-green-600 text-white"
                onClick={() => handleEscortPosition(externalPos.id, "accept")}
              >
                ✅ Escort
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-red-500 border-red-500/30 hover:bg-red-500/10"
                onClick={() => handleEscortPosition(externalPos.id, "ignore")}
              >
                🚫 Ignore
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
                  isConnected ? "bg-green-500" : "bg-red-500"
                )}
              />
            </div>
            Oracle
            <span className="text-xs font-normal text-muted-foreground">(AI-Signals)</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              GPT-4
            </Badge>
            <Badge
              className={cn(
                "text-xs",
                isConnected
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-red-500/10 text-red-500 border-red-500/20"
              )}
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3 mr-1" />
                  WebSocket
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 mr-1" />
                  Offline
                </>
              )}
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
                        getNotificationIcon(message.type)
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
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border flex-shrink-0 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <Select value={selectedExchange} onValueChange={setSelectedExchange}>
              <SelectTrigger className="h-7 text-xs w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGES.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    <span className="flex items-center gap-1">
                      {ex.name}
                      {ex.hasDemo && (
                        <Badge variant="outline" className="text-[9px] h-3 px-1">
                          Demo
                        </Badge>
                      )}
                    </span>
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
            {isConnected && (
              <Badge variant="outline" className="text-xs text-green-500">
                <BellRing className="h-3 w-3 mr-1" />
                Live
              </Badge>
            )}
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
              placeholder="Signal or command (help, long, short, close all...)"
              className="flex-1"
              disabled={!isConnected}
              autoFocus
            />
            <Button type="submit" size="icon" disabled={!isConnected || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <div className="flex flex-wrap gap-1 mt-2">
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-primary" onClick={() => setInput("help")}>
              📖 help
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setInput("long")}>
              📈 long
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setInput("short")}>
              📉 short
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setInput("positions")}>
              📊 positions
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-blue-500 hover:text-blue-600"
              onClick={handleSyncPositions}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Sync
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-red-500 hover:text-red-600"
              onClick={() => setInput("close all")}
            >
              🚫 close all
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
