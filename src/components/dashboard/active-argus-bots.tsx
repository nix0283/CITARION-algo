"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Play,
  Pause,
  TrendingUp,
  TrendingDown,
  Zap,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ArgusBot {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  exchange: string;
  currentSignal: "LONG" | "SHORT" | "NEUTRAL";
  useMarketForecast: boolean;
  signals24h: number;
  lastSignal?: {
    symbol: string;
    direction: "LONG" | "SHORT";
    type: string;
    timestamp: string;
  };
}

export function ActiveArgusBots() {
  const [bots, setBots] = useState<ArgusBot[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch("/api/bots/argus");
      const data = await response.json();
      if (data.success) {
        setBots((data.bots || []).filter((b: ArgusBot) => b.status === "ACTIVE"));
      }
    } catch (error) {
      console.error("Failed to fetch Argus bots:", error);
    }
  };

  const handleToggleBot = async (botId: string, currentStatus: string) => {
    setIsLoading(true);
    try {
      const action = currentStatus === "ACTIVE" ? "pause" : "start";
      await fetch("/api/bots/argus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, botId }),
      });
      fetchBots();
    } catch (error) {
      console.error("Failed to toggle bot:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge className="bg-green-500/10 text-green-500">
            <Activity className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case "PAUSED":
        return <Badge className="bg-yellow-500/10 text-yellow-500">Paused</Badge>;
      default:
        return <Badge variant="outline">Stopped</Badge>;
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case "LONG":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "SHORT":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Argus Bots
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {bots.length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {bots.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Нет активных Argus ботов</p>
            <p className="text-xs mt-1">Создайте бота для детекции pump/dump</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      bot.status === "ACTIVE" ? "bg-green-500 animate-pulse" : "bg-yellow-500"
                    )}
                  />
                  <div>
                    <div className="text-sm font-medium">{bot.name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{bot.exchange}</span>
                      {bot.useMarketForecast && (
                        <Badge className="bg-blue-500/10 text-blue-500 text-[10px]">
                          <Zap className="h-2 w-2 mr-0.5" />
                          Forecast
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      {getSignalIcon(bot.currentSignal)}
                      <span className="text-xs font-medium">{bot.currentSignal}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {bot.signals24h} signals/24h
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleToggleBot(bot.id, bot.status)}
                    disabled={isLoading}
                  >
                    {bot.status === "ACTIVE" ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
