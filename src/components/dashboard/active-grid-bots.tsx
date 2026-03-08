"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Grid3X3, Play, Square, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { useCryptoStore } from "@/stores/crypto-store";

interface ActiveGridBot {
  id: string;
  name: string;
  symbol: string;
  exchangeId: string;
  status: string;
  totalProfit: number;
  totalTrades: number;
  realizedPnL: number;
  gridCount: number;
  upperPrice: number;
  lowerPrice: number;
  leverage: number;
  startedAt: string | null;
}

export function ActiveGridBots() {
  const { setActiveTab } = useCryptoStore();
  const [bots, setBots] = useState<ActiveGridBot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBots = useCallback(async () => {
    try {
      const response = await fetch('/api/bots/active?type=grid');
      const data = await response.json();
      if (data.success) {
        setBots(data.bots.grid || []);
      }
    } catch (error) {
      console.error('Failed to fetch active grid bots:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBots();
    // Refresh every 30 seconds
    const interval = setInterval(fetchBots, 30000);
    return () => clearInterval(interval);
  }, [fetchBots]);

  const handleBotAction = async (botId: string, action: 'stop' | 'start') => {
    try {
      const response = await fetch('/api/bots/grid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, action }),
      });
      const data = await response.json();
      if (data.success) {
        fetchBots();
      }
    } catch (error) {
      console.error('Failed to update bot:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'PAUSED': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const isProfitable = (bot: ActiveGridBot) => bot.realizedPnL >= 0;

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3X3 className="h-5 w-5 text-primary" />
            Архитектор
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-4 text-muted-foreground">
          Загрузка...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3X3 className="h-5 w-5 text-primary" />
            Архитектор
            <span className="text-xs text-muted-foreground font-normal">(GRD)</span>
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {bots.length} активных
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {bots.length === 0 ? (
          <div className="text-center py-4">
            <Grid3X3 className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">Нет активных ботов</p>
            <Button 
              variant="link" 
              size="sm" 
              onClick={() => setActiveTab('grid-bot')}
              className="mt-1"
            >
              Создать бота
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="p-3 rounded-lg bg-secondary/50 border border-border/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{bot.name}</span>
                    <Badge variant="outline" className={cn("text-xs", getStatusColor(bot.status))}>
                      {bot.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {bot.status === 'RUNNING' ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleBotAction(bot.id, 'stop')}
                        className="h-7 w-7 text-destructive"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleBotAction(bot.id, 'start')}
                        className="h-7 w-7 text-green-500"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span className="font-mono">{bot.symbol}</span>
                  <span>•</span>
                  <span className="capitalize">{bot.exchangeId}</span>
                  <span>•</span>
                  <span>{bot.gridCount} уровней</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className={cn(
                      "text-sm font-semibold",
                      isProfitable(bot) ? "text-green-500" : "text-red-500"
                    )}>
                      ${bot.realizedPnL.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">PnL</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{bot.totalTrades}</p>
                    <p className="text-xs text-muted-foreground">Сделок</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{bot.leverage}x</p>
                    <p className="text-xs text-muted-foreground">Плечо</p>
                  </div>
                </div>

                {/* Progress bar showing price range */}
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>${bot.lowerPrice.toFixed(2)}</span>
                    <span>${bot.upperPrice.toFixed(2)}</span>
                  </div>
                  <Progress value={50} className="h-1" />
                </div>
              </div>
            ))}
          </div>
        )}

        {bots.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setActiveTab('grid-bot')}
            className="w-full"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Все боты Архитектор
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
