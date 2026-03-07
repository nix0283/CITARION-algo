"use client";

import { useState } from "react";
import { useCryptoStore } from "@/stores/crypto-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Radio,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Format number consistently to avoid hydration mismatch
function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

interface Signal {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  action: "BUY" | "SELL" | "CLOSE";
  entryPrices: number[];
  takeProfits: { price: number; percentage: number }[];
  stopLoss?: number;
  leverage: number;
  source: "TELEGRAM" | "DISCORD" | "TRADINGVIEW" | "MANUAL";
  status: "PENDING" | "EXECUTED" | "IGNORED";
  createdAt: string;
}

// Demo signals for display
const DEMO_SIGNALS: Signal[] = [
  {
    id: "sig-1",
    symbol: "BTCUSDT",
    direction: "LONG",
    action: "BUY",
    entryPrices: [67000, 66500],
    takeProfits: [
      { price: 68000, percentage: 30 },
      { price: 69000, percentage: 40 },
      { price: 70000, percentage: 30 },
    ],
    stopLoss: 65000,
    leverage: 10,
    source: "TELEGRAM",
    status: "EXECUTED",
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "sig-2",
    symbol: "ETHUSDT",
    direction: "LONG",
    action: "BUY",
    entryPrices: [3500],
    takeProfits: [
      { price: 3600, percentage: 50 },
      { price: 3700, percentage: 50 },
    ],
    stopLoss: 3400,
    leverage: 5,
    source: "TRADINGVIEW",
    status: "PENDING",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "sig-3",
    symbol: "SOLUSDT",
    direction: "SHORT",
    action: "SELL",
    entryPrices: [175],
    takeProfits: [{ price: 165, percentage: 100 }],
    stopLoss: 180,
    leverage: 10,
    source: "DISCORD",
    status: "IGNORED",
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
];

export function SignalFeed() {
  const { account } = useCryptoStore();
  const [signals, setSignals] = useState<Signal[]>(DEMO_SIGNALS);

  const isDemo = account?.accountType === "DEMO";

  const getSourceIcon = (source: Signal["source"]) => {
    switch (source) {
      case "TELEGRAM":
        return <MessageSquare className="h-3 w-3" />;
      case "DISCORD":
        return <Radio className="h-3 w-3" />;
      case "TRADINGVIEW":
        return <Zap className="h-3 w-3" />;
      default:
        return <Zap className="h-3 w-3" />;
    }
  };

  const getStatusBadge = (status: Signal["status"]) => {
    switch (status) {
      case "EXECUTED":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            Исполнен
          </Badge>
        );
      case "PENDING":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
            <Clock className="h-3 w-3 mr-1" />
            Ожидание
          </Badge>
        );
      case "IGNORED":
        return (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
            <XCircle className="h-3 w-3 mr-1" />
            Игнор
          </Badge>
        );
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "только что";
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} ч назад`;
    return date.toLocaleDateString("ru-RU");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-5 w-5 text-primary" />
            Лента сигналов
            <Badge variant="secondary" className="ml-2 text-xs">
              Live
            </Badge>
          </CardTitle>
          <Badge
            variant="outline"
            className={cn("text-xs", isDemo ? "demo-badge" : "real-badge")}
          >
            {isDemo ? "[DEMO]" : "[REAL]"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <ScrollArea className="h-[400px] px-6">
          <div className="space-y-3">
            {signals.map((signal) => (
              <div
                key={signal.id}
                className="rounded-lg border border-border p-3 space-y-2 hover:bg-secondary/30 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
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
                    <span className="font-medium text-sm">
                      {signal.symbol.replace("USDT", "/USDT")}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {signal.leverage}x
                    </Badge>
                  </div>
                  {getStatusBadge(signal.status)}
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Вход:</span>
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
                          ${formatNumber(tp.price)} ({tp.percentage}%)
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {signal.stopLoss && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">SL:</span>{" "}
                    <span className="text-red-500">
                      ${formatNumber(signal.stopLoss)}
                    </span>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {getSourceIcon(signal.source)}
                    <span>{signal.source}</span>
                  </div>
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {formatTime(signal.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
