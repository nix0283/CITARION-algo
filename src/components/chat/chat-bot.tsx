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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

interface Message {
  id: string;
  role: "user" | "bot" | "error" | "notification";
  content: string;
  timestamp: Date;
  signal?: ParsedSignal;
  template?: SignalTemplate;
  templates?: TemplateListItem[];
  type?: "signal" | "template" | "templates-list" | "error" | "notification" | "external-position";
  notificationType?: string;
  externalPosition?: ExternalPosition;
}

interface ParsedSignal {
  symbol: string;
  direction: "LONG" | "SHORT";
  action: "BUY" | "SELL" | "CLOSE";
  entryPrices: number[];
  takeProfits: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage: number;
  confidence: number;
}

interface SignalTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  example: string;
}

interface TemplateListItem {
  id: string;
  name: string;
  description: string;
}

interface NotificationEvent {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: "low" | "normal" | "high" | "critical";
}

interface ExternalPosition {
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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      content:
        "👋 Привет! Я **Оракул** — AI-бот для парсинга и исполнения сигналов.\n\n" +
        "📌 **Возможности:**\n" +
        "• Введите сигнал для парсинга\n" +
        "• Введите **\"шаблон\"** для списка шаблонов\n" +
        "• Команды: **long**, **short**, **позиции**, **close all**\n" +
        "• **справка** - полная справка\n\n" +
        "🔮 *Вижу сигналы там, где другие видят хаос.*\n\n" +
        "Пример: `BTCUSDT LONG Entry: 97000 TP: 100000 SL: 94000`",
      timestamp: new Date(),
      type: "template",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedExchange, setSelectedExchange] = useState("gate");
  const [isConnected, setIsConnected] = useState(false);
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

  // Real-time notifications via SSE
  useEffect(() => {
    const connectSSE = () => {
      try {
        const eventSource = new EventSource("/api/notifications");
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const notification: NotificationEvent = JSON.parse(event.data);
            if (notification.title === "Connected") return;
            
            const notificationMessage: Message = {
              id: `notif-${Date.now()}`,
              role: "notification",
              content: `🔔 ${notification.title}\n\n${notification.message}`,
              timestamp: new Date(),
              type: "notification",
              notificationType: notification.type,
            };
            
            setMessages((prev) => [...prev, notificationMessage]);
            
            if (notification.type?.includes("WARNING") || notification.type?.includes("ERROR")) {
              toast.error(notification.title, { description: notification.message });
            } else {
              toast.success(notification.title, { description: notification.message });
            }
          } catch {
            // Ignore parse errors
          }
        };

        eventSource.onerror = () => {
          setIsConnected(false);
          eventSource.close();
          setTimeout(connectSSE, 5000);
        };
      } catch {
        setTimeout(connectSSE, 5000);
      }
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat/parse-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        role: data.success ? "bot" : "error",
        content: data.message || "Не удалось распознать сигнал",
        timestamp: new Date(),
        signal: data.signal,
        template: data.template,
        templates: data.templates,
        type: data.type,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const errorMessage: Message = {
        id: `bot-${Date.now()}`,
        role: "error",
        content: "❌ Ошибка при обработке сигнала. Проверьте соединение и попробуйте ещё раз.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  const handleExecuteSignal = async (signal: ParsedSignal) => {
    try {
      toast.loading(`Исполняю сигнал на ${EXCHANGES.find((e) => e.id === selectedExchange)?.name}...`, {
        id: "execute-signal",
      });

      const response = await fetch("/api/trade/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...signal,
          isDemo: true,
          exchangeId: selectedExchange,
          amount: 100,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to execute signal");
      }

      const result = await response.json();
      toast.success(`✅ ${result.message || `Сделка ${signal.symbol} ${signal.direction} открыта!`}`, {
        id: "execute-signal",
      });

      const notificationMessage: Message = {
        id: `exec-${Date.now()}`,
        role: "notification",
        content: `✅ Позиция открыта\n\n${signal.symbol} ${signal.direction}\nExchange: ${EXCHANGES.find((e) => e.id === selectedExchange)?.name}`,
        timestamp: new Date(),
        type: "notification",
        notificationType: "POSITION_OPENED",
      };
      setMessages((prev) => [...prev, notificationMessage]);
    } catch (error) {
      toast.error(
        `Ошибка: ${error instanceof Error ? error.message : "Ошибка при исполнении сигнала"}`,
        { id: "execute-signal" }
      );
    }
  };

  const handleCopyTemplate = (template: SignalTemplate, messageId: string) => {
    navigator.clipboard.writeText(template.template);
    setCopiedId(messageId);
    toast.success("Шаблон скопирован!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyExample = (template: SignalTemplate, messageId: string) => {
    navigator.clipboard.writeText(template.example);
    setCopiedId(`example-${messageId}`);
    toast.success("Пример скопирован!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTemplateClick = (templateId: string) => {
    setInput(templateId);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const getNotificationIcon = (type?: string) => {
    if (!type) return <Bell className="h-4 w-4" />;
    if (type.includes("TP")) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (type.includes("SL")) return <TrendingDown className="h-4 w-4 text-red-500" />;
    if (type.includes("EXTERNAL")) return <ExternalLink className="h-4 w-4 text-blue-500" />;
    if (type.includes("WARNING") || type.includes("ERROR"))
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    return <Bell className="h-4 w-4" />;
  };

  const handleSyncPositions = async () => {
    try {
      toast.loading("Синхронизация позиций с биржей...", { id: "sync-positions" });

      const response = await fetch("/api/positions/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to sync positions");
      }

      const result = await response.json();
      
      if (result.newPositions > 0) {
        toast.success(`🔍 Обнаружено ${result.newPositions} новых позиций!`, { id: "sync-positions" });
        
        const notificationMessage: Message = {
          id: `sync-${Date.now()}`,
          role: "notification",
          content: `🔍 Синхронизация завершена\n\nОбнаружено новых позиций: ${result.newPositions}\nАккаунтов проверено: ${result.accountsChecked}`,
          timestamp: new Date(),
          type: "notification",
          notificationType: "SYNC_COMPLETE",
        };
        setMessages((prev) => [...prev, notificationMessage]);
      } else {
        toast.success("Синхронизация завершена. Новых позиций не найдено.", { id: "sync-positions" });
      }
    } catch (error) {
      toast.error(
        `Ошибка синхронизации: ${error instanceof Error ? error.message : "Unknown error"}`,
        { id: "sync-positions" }
      );
    }
  };

  const handleEscortPosition = async (positionId: string, action: "accept" | "ignore") => {
    try {
      toast.loading(action === "accept" ? "Принятие позиции на сопровождение..." : "Игнорирование позиции...", {
        id: "escort-position",
      });

      const response = await fetch("/api/positions/escort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalPositionId: positionId,
          action,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to escort position");
      }

      const result = await response.json();

      if (action === "accept") {
        toast.success(`✅ Позиция принята на сопровождение!`, { id: "escort-position" });
      } else {
        toast.success(`🚫 Позиция проигнорирована`, { id: "escort-position" });
      }
    } catch (error) {
      toast.error(
        `Ошибка: ${error instanceof Error ? error.message : "Unknown error"}`,
        { id: "escort-position" }
      );
    }
  };

  const handleShowExternalPositions = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch("/api/positions/escort?status=PENDING_APPROVAL");
      
      if (!response.ok) {
        throw new Error("Failed to fetch external positions");
      }

      const result = await response.json();

      if (result.positions && result.positions.length > 0) {
        for (const pos of result.positions) {
          const message: Message = {
            id: `ext-${pos.id}`,
            role: "notification",
            content: `🔍 Внешняя позиция\n\n${pos.symbol} ${pos.direction}\nExchange: ${pos.exchangeName}\nEntry: $${formatNumber(pos.avgEntryPrice)}\nAmount: ${pos.amount.toFixed(6)}\nLeverage: ${pos.leverage}x`,
            timestamp: new Date(),
            type: "external-position",
            notificationType: "EXTERNAL_POSITION_DETECTED",
            externalPosition: pos,
          };
          setMessages((prev) => [...prev, message]);
        }
      } else {
        toast.info("Нет ожидающих внешних позиций");
      }
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
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
            Оракул
            <span className="text-xs font-normal text-muted-foreground">(ИИ-сигналы)</span>
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
                  <BellRing className="h-3 w-3 mr-1" />
                  Реальное время
                </>
              ) : (
                "Офлайн"
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
                          : message.role === "error"
                          ? "bg-red-500/20 text-red-500"
                          : message.role === "notification"
                          ? "bg-blue-500/20 text-blue-500"
                          : "bg-secondary"
                      )}
                    >
                      {message.role === "bot" ? (
                        <Bot className="h-4 w-4" />
                      ) : message.role === "error" ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : message.role === "notification" ? (
                        getNotificationIcon(message.notificationType)
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
                          : message.role === "error"
                          ? "bg-red-500/10 text-red-600 dark:text-red-400 rounded-tl-sm border border-red-500/20"
                          : message.role === "notification"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-tl-sm border border-blue-500/20"
                          : "bg-secondary rounded-tl-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>

                    {message.template && (
                      <div className="mt-2 rounded-lg border border-border bg-card p-3 text-left">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {message.template.name}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">{message.template.description}</p>
                        <div className="bg-muted/50 rounded-md p-2 mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-muted-foreground">Шаблон:</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleCopyTemplate(message.template!, message.id)}
                            >
                              {copiedId === message.id ? (
                                <Check className="h-3 w-3 mr-1 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3 mr-1" />
                              )}
                              {copiedId === message.id ? "Скопировано" : "Копировать"}
                            </Button>
                          </div>
                          <pre className="text-xs whitespace-pre-wrap font-mono">{message.template.template}</pre>
                        </div>
                        <div className="bg-green-500/5 border border-green-500/20 rounded-md p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">
                              Пример:
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-green-600 hover:text-green-700"
                              onClick={() => handleCopyExample(message.template!, message.id)}
                            >
                              {copiedId === `example-${message.id}` ? (
                                <Check className="h-3 w-3 mr-1 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3 mr-1" />
                              )}
                              {copiedId === `example-${message.id}` ? "Скопировано" : "Копировать"}
                            </Button>
                          </div>
                          <pre className="text-xs whitespace-pre-wrap font-mono text-green-700 dark:text-green-300">
                            {message.template.example}
                          </pre>
                        </div>
                      </div>
                    )}

                    {message.templates && message.templates.length > 0 && (
                      <div className="mt-2 rounded-lg border border-border bg-card p-3 text-left">
                        <div className="flex items-center gap-2 mb-3">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Доступные шаблоны:</span>
                        </div>
                        <div className="space-y-2">
                          {message.templates.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => handleTemplateClick(t.id)}
                              className="w-full text-left p-2 rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{t.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {t.id}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {message.signal && (
                      <div className="mt-2 rounded-lg border border-border bg-card p-3 text-left">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                message.signal.direction === "LONG"
                                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                                  : "bg-red-500/10 text-red-500 border-red-500/20"
                              )}
                            >
                              {message.signal.direction === "LONG" ? (
                                <TrendingUp className="h-3 w-3 mr-1" />
                              ) : (
                                <TrendingDown className="h-3 w-3 mr-1" />
                              )}
                              {message.signal.direction}
                            </Badge>
                            <span className="font-medium text-sm">{message.signal.symbol}</span>
                            <Badge variant="secondary" className="text-xs">
                              {message.signal.leverage}x
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Вход:</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {message.signal.entryPrices.map((price, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  ${formatNumber(price)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">ТП:</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {message.signal.takeProfits.map((tp, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  ${formatNumber(tp.price)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        {message.signal.stopLoss && (
                          <div className="mt-2 text-xs">
                            <span className="text-muted-foreground">СТ:</span>{" "}
                            <span className="text-red-500">${formatNumber(message.signal.stopLoss)}</span>
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            className="flex-1 h-8"
                            onClick={() => handleExecuteSignal(message.signal!)}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            Исполнить
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(message.signal, null, 2));
                              toast.success("Скопировано");
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {message.externalPosition && message.type === "external-position" && (
                      <div className="mt-2 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-left">
                        <div className="flex items-center gap-2 mb-2">
                          <ExternalLink className="h-4 w-4 text-blue-500" />
                          <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                            Внешняя позиция
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              message.externalPosition.direction === "LONG"
                                ? "bg-green-500/10 text-green-500 border-green-500/20"
                                : "bg-red-500/10 text-red-500 border-red-500/20"
                            )}
                          >
                            {message.externalPosition.direction === "LONG" ? (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {message.externalPosition.direction}
                          </Badge>
                          <span className="font-medium text-sm">{message.externalPosition.symbol}</span>
                          <Badge variant="secondary" className="text-xs">
                            {message.externalPosition.leverage}x
                          </Badge>
                        </div>
                        <div className="text-xs space-y-1 text-muted-foreground">
                          <div>Биржа: {message.externalPosition.exchangeName}</div>
                          <div>Вход: ${formatNumber(message.externalPosition.avgEntryPrice)}</div>
                          <div>Сумма: {message.externalPosition.amount.toFixed(6)} (${formatNumber(message.externalPosition.amountUsd)})</div>
                          {message.externalPosition.unrealizedPnl !== undefined && (
                            <div className={cn(
                              message.externalPosition.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"
                            )}>
                              Профит: {message.externalPosition.unrealizedPnl >= 0 ? "+" : ""}${formatNumber(message.externalPosition.unrealizedPnl)}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            className="flex-1 h-8 bg-green-500 hover:bg-green-600 text-white"
                            onClick={() => handleEscortPosition(message.externalPosition!.id, "accept")}
                          >
                            ✅ Сопровождать
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-red-500 border-red-500/30 hover:bg-red-500/10"
                            onClick={() => handleEscortPosition(message.externalPosition!.id, "ignore")}
                          >
                            🚫 Игнорировать
                          </Button>
                        </div>
                      </div>
                    )}

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
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                      </div>
                      <span className="text-xs text-muted-foreground">Анализирую...</span>
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
              placeholder="Сигнал или команда (шаблон, long, short, close all...)"
              className="flex-1"
              disabled={isLoading}
              autoFocus
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <div className="flex flex-wrap gap-1 mt-2">
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-primary" onClick={() => setInput("справка")}>
              📖 справка
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setInput("шаблон")}>
              📋 шаблон
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setInput("long")}>
              📈 long
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setInput("short")}>
              📉 short
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setInput("позиции")}>
              📊 позиции
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-blue-500 hover:text-blue-600"
              onClick={handleSyncPositions}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Синхр.
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-blue-500 hover:text-blue-600"
              onClick={handleShowExternalPositions}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Внешние
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-red-500 hover:text-red-600"
              onClick={() => setInput("close all")}
            >
              🚫 close all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-orange-500 hover:text-orange-600"
              onClick={() => setInput("удалить сигналы")}
            >
              🗑️ сигналы
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-red-600 hover:text-red-700"
              onClick={() => setInput("очистить базу")}
            >
              🧹 сброс
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
