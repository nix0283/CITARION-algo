"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Target,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignalRecord {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  timestamp: string;
  result?: "WIN" | "LOSS";
}

export interface FilterStats {
  totalSignals: number;
  winRate: number;
  avgConfidence: number;
  recentSignals: SignalRecord[];
  performanceTrend: number[];
}

export interface FilterStatsCardProps {
  stats: FilterStats;
  compact?: boolean;
  className?: string;
}

export function FilterStatsCard({
  stats,
  compact = false,
  className,
}: FilterStatsCardProps) {
  // Calculate win rate color
  const winRateColor = useMemo(() => {
    if (stats.winRate >= 70) return "text-green-500";
    if (stats.winRate >= 50) return "text-yellow-500";
    return "text-red-500";
  }, [stats.winRate]);

  // Calculate trend direction
  const trendDirection = useMemo(() => {
    if (stats.performanceTrend.length < 2) return "neutral";
    const recent = stats.performanceTrend.slice(-3);
    const older = stats.performanceTrend.slice(-6, -3);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
    if (recentAvg > olderAvg + 2) return "up";
    if (recentAvg < olderAvg - 2) return "down";
    return "neutral";
  }, [stats.performanceTrend]);

  // Format time ago
  const formatTimeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
    return `${Math.floor(diffMins / 1440)}d`;
  };

  // Mini chart data for sparkline
  const miniChartData = useMemo(() => {
    const max = Math.max(...stats.performanceTrend);
    const min = Math.min(...stats.performanceTrend);
    const range = max - min || 1;
    return stats.performanceTrend.map((value) => ((value - min) / range) * 100);
  }, [stats.performanceTrend]);

  if (compact) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Signals</div>
              <div className="text-lg font-bold">{stats.totalSignals.toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
              <div className={cn("text-lg font-bold", winRateColor)}>
                {stats.winRate.toFixed(1)}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Avg Conf</div>
              <div className="text-lg font-bold">{stats.avgConfidence.toFixed(0)}%</div>
            </div>
          </div>
          {/* Mini Sparkline */}
          <div className="mt-3 flex items-end justify-between h-8 gap-0.5">
            {miniChartData.map((value, index) => (
              <div
                key={index}
                className={cn(
                  "flex-1 rounded-sm transition-all",
                  trendDirection === "up"
                    ? "bg-green-500/60"
                    : trendDirection === "down"
                      ? "bg-red-500/60"
                      : "bg-yellow-500/60"
                )}
                style={{ height: `${Math.max(value, 10)}%` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="py-4 px-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Filter Statistics</CardTitle>
            <CardDescription className="text-xs">Performance overview</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {trendDirection === "up" ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : trendDirection === "down" ? (
              <TrendingDown className="h-4 w-4 text-red-500" />
            ) : (
              <Minus className="h-4 w-4 text-yellow-500" />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/50">
            <Activity className="h-4 w-4 text-muted-foreground mb-1" />
            <span className="text-2xl font-bold">{stats.totalSignals.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">Total Signals</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/50">
            <Target className={cn("h-4 w-4 mb-1", winRateColor)} />
            <span className={cn("text-2xl font-bold", winRateColor)}>
              {stats.winRate.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">Win Rate</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-secondary/50">
            <BarChart3 className="h-4 w-4 text-muted-foreground mb-1" />
            <span className="text-2xl font-bold">{stats.avgConfidence.toFixed(0)}%</span>
            <span className="text-xs text-muted-foreground">Avg Conf</span>
          </div>
        </div>

        {/* Performance Trend Mini Chart */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Performance Trend</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                trendDirection === "up"
                  ? "bg-green-500/10 text-green-500"
                  : trendDirection === "down"
                    ? "bg-red-500/10 text-red-500"
                    : "bg-yellow-500/10 text-yellow-500"
              )}
            >
              {trendDirection === "up" ? "Improving" : trendDirection === "down" ? "Declining" : "Stable"}
            </Badge>
          </div>
          <div className="h-12 flex items-end justify-between gap-0.5 p-2 rounded-lg bg-secondary/30">
            {miniChartData.map((value, index) => (
              <div
                key={index}
                className={cn(
                  "flex-1 rounded-sm min-w-[4px] transition-all hover:opacity-80",
                  trendDirection === "up"
                    ? "bg-green-500/60"
                    : trendDirection === "down"
                      ? "bg-red-500/60"
                      : "bg-yellow-500/60"
                )}
                style={{ height: `${Math.max(value, 10)}%` }}
                title={`${stats.performanceTrend[index]}%`}
              />
            ))}
          </div>
        </div>

        {/* Recent Signals */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Recent Signals</span>
          <ScrollArea className="h-[140px] rounded-lg border">
            <div className="p-2 space-y-2">
              {stats.recentSignals.slice(0, 5).map((signal, index) => (
                <div key={signal.id}>
                  {index > 0 && <Separator className="my-2" />}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center",
                          signal.direction === "LONG"
                            ? "bg-green-500/20"
                            : "bg-red-500/20"
                        )}
                      >
                        {signal.direction === "LONG" ? (
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-medium">{signal.symbol}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatTimeAgo(signal.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {signal.confidence}%
                      </Badge>
                      {signal.result && (
                        <Badge
                          className={cn(
                            "text-[10px]",
                            signal.result === "WIN"
                              ? "bg-green-500/10 text-green-500"
                              : "bg-red-500/10 text-red-500"
                          )}
                        >
                          {signal.result}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {stats.recentSignals.length === 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No recent signals
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
