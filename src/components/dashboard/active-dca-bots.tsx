"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Layers, Play, Square, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { useCryptoStore } from "@/stores/crypto-store";

interface ActiveDcaBot {
  id: string;
  name: string;
  symbol: string;
  exchangeId: string;
  status: string;
  direction: string;
  totalInvested: number;
  totalAmount: number;
  avgEntryPrice: number | null;
  realizedPnL: number;
  totalTrades: number;
  currentLevel: number;
  dcaLevels: number;
  startedAt: string | null;
}

export function ActiveDcaBots() {
  const { setActiveTab } = useCryptoStore();
  const [bots, setBots] = useState<ActiveDcaBot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBots = useCallback(async () => {
    try {
      const response = await fetch('/api/bots/active?type=dca');
      const data = await response.json();
      if (data.success) {
        setBots(data.bots.dca || []);
      }
    } catch (error) {
      console.error('Failed to fetch active DCA bots:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 30000);
    return () => clearInterval(interval);
  }, [fetchBots]);

  const handleBotAction = async (botId: string, action: 'stop' | 'start') => {
    try {
      const response = await fetch('/api/bots/dca', {
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

  const isProfitable = (bot: ActiveDcaBot) => bot.realizedPnL >= 0;
  const isLong = (direction: string) => direction === 'LONG';

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-5 w-5 text-primary" />
            Крон
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
            <Layers className="h-5 w-5 text-primary" />
            Крон
            <span className="text-xs text-muted-foreground font-normal">(DCA)</span>
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {bots.length} активных
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {bots.length === 0 ? (
          <div className="text-center py-4">
            <Layers className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">Нет активных ботов</p>
            <Button 
              variant="link" 
              size="sm" 
              onClick={() => setActiveTab('dca-bot')}
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
                    {isLong(bot.direction) ? (
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                    )}
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
                  <span>{bot.direction}</span>
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
                    <p className="text-sm font-semibold">${bot.totalInvested.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">Инвест.</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{bot.totalTrades}</p>
                    <p className="text-xs text-muted-foreground">Сделок</p>
                  </div>
                </div>

                {/* DCA Level Progress */}
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>DCA Уровень</span>
                    <span>{bot.currentLevel}/{bot.dcaLevels}</span>
                  </div>
                  <Progress 
                    value={(bot.currentLevel / bot.dcaLevels) * 100} 
                    className="h-1"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {bots.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setActiveTab('dca-bot')}
            className="w-full"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Все боты Крон
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
