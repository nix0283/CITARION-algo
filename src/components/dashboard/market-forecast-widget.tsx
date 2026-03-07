"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Target,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketForecast {
  timestamp: string;
  symbol: string;
  probabilities: {
    upward: number;
    downward: number;
    consolidation: number;
  };
  signal: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  indicators: {
    roc_24h: number;
    atr_pct: number;
    trend_strength: number;
    volume_ratio: number;
  };
}

export function MarketForecastWidget() {
  const [forecast, setForecast] = useState<MarketForecast | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    fetchForecast();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchForecast, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchForecast = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/bots/vision?action=forecast");
      const data = await response.json();
      if (data.success && data.forecast) {
        setForecast(data.forecast);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch forecast:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case "LONG":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "SHORT":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "LONG":
        return "text-green-500";
      case "SHORT":
        return "text-red-500";
      default:
        return "text-yellow-500";
    }
  };

  const getProgressColor = (type: "up" | "down" | "cons") => {
    switch (type) {
      case "up":
        return "[&>div]:bg-green-500";
      case "down":
        return "[&>div]:bg-red-500";
      default:
        return "[&>div]:bg-yellow-500";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Market Forecast
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={fetchForecast}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {forecast ? (
          <>
            {/* Signal */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getSignalIcon(forecast.signal)}
                <span className={cn("text-xl font-bold", getSignalColor(forecast.signal))}>
                  {forecast.signal}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">
                  {(forecast.confidence * 100).toFixed(0)}% confidence
                </div>
              </div>
            </div>

            {/* Probabilities */}
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    Up
                  </span>
                  <span>{(forecast.probabilities.upward * 100).toFixed(0)}%</span>
                </div>
                <Progress
                  value={forecast.probabilities.upward * 100}
                  className={cn("h-1.5 bg-muted", getProgressColor("up"))}
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-red-500" />
                    Down
                  </span>
                  <span>{(forecast.probabilities.downward * 100).toFixed(0)}%</span>
                </div>
                <Progress
                  value={forecast.probabilities.downward * 100}
                  className={cn("h-1.5 bg-muted", getProgressColor("down"))}
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1">
                    <Minus className="h-3 w-3 text-yellow-500" />
                    Cons
                  </span>
                  <span>{(forecast.probabilities.consolidation * 100).toFixed(0)}%</span>
                </div>
                <Progress
                  value={forecast.probabilities.consolidation * 100}
                  className={cn("h-1.5 bg-muted", getProgressColor("cons"))}
                />
              </div>
            </div>

            {/* Indicators */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ROC 24h</span>
                <span className={cn(
                  forecast.indicators.roc_24h > 0 ? "text-green-500" : "text-red-500"
                )}>
                  {(forecast.indicators.roc_24h * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ATR</span>
                <span>{(forecast.indicators.atr_pct * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trend</span>
                <span className={cn(
                  forecast.indicators.trend_strength > 0 ? "text-green-500" : "text-red-500"
                )}>
                  {(forecast.indicators.trend_strength * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Volume</span>
                <span>{forecast.indicators.volume_ratio.toFixed(2)}x</span>
              </div>
            </div>

            {lastUpdate && (
              <div className="text-[10px] text-muted-foreground text-right">
                Updated: {lastUpdate.toLocaleTimeString("ru-RU")}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No forecast data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
