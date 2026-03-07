"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Target,
  Percent,
  BarChart3,
  LineChart,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface PnLStats {
  period: string;
  realizedPnL: number;
  unrealizedPnL: number;
  fundingPnL: number;
  feesPaid: number;
  netPnL: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  winRate: number;
  profitFactor: number;
  avgTrade: number;
  bestTrade: number;
  worstTrade: number;
}

interface EquityPoint {
  timestamp: string;
  balance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  fundingPnL: number;
}

const PERIOD_LABELS: Record<string, string> = {
  "1d": "1 день",
  "3d": "3 дня",
  "1w": "1 неделя",
  "2w": "2 недели",
  "1m": "1 месяц",
  "3m": "3 месяца",
  "6m": "6 месяцев",
  "1y": "1 год",
  "3y": "3 года",
};

const PERIOD_OPTIONS = ["1d", "3d", "1w", "2w", "1m", "3m", "6m", "1y", "3y"];

export function PnLDashboard() {
  const [isDemo, setIsDemo] = useState(true);
  const [period, setPeriod] = useState("1m");
  const [stats, setStats] = useState<PnLStats | null>(null);
  const [allPeriodsStats, setAllPeriodsStats] = useState<Record<string, PnLStats>>({});
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [isDemo, period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/pnl-stats?demo=${isDemo}&period=${period}&equityCurve=true`
      );
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
        setAllPeriodsStats(data.allPeriodsStats);
        setEquityCurve(data.equityCurve);
      }
    } catch (error) {
      console.error("Failed to fetch PnL stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number, decimals = 2) => {
    return num.toLocaleString("ru-RU", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (num: number) => {
    return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
  };

  // Calculate equity curve path for SVG
  const renderEquityCurve = () => {
    if (equityCurve.length < 2) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <LineChart className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Недостаточно данных для графика</p>
            <p className="text-xs mt-1">Совершите несколько сделок</p>
          </div>
        </div>
      );
    }

    const width = 800;
    const height = 300;
    const padding = 40;

    // Find min/max values
    const equities = equityCurve.map(p => p.equity);
    const minEquity = Math.min(...equities);
    const maxEquity = Math.max(...equities);
    const range = maxEquity - minEquity || 1;

    // Generate path
    const points = equityCurve.map((point, i) => {
      const x = padding + (i / (equityCurve.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((point.equity - minEquity) / range) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(" ");

    // Generate area path
    const areaPoints = [
      `${padding},${height - padding}`,
      ...equityCurve.map((point, i) => {
        const x = padding + (i / (equityCurve.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((point.equity - minEquity) / range) * (height - 2 * padding);
        return `${x},${y}`;
      }),
      `${width - padding},${height - padding}`,
    ].join(" ");

    const isProfit = equityCurve[equityCurve.length - 1]?.equity > equityCurve[0]?.equity;
    const lineColor = isProfit ? "#22c55e" : "#ef4444";
    const fillColor = isProfit ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(pct => (
          <line
            key={pct}
            x1={padding}
            y1={padding + (pct / 100) * (height - 2 * padding)}
            x2={width - padding}
            y2={padding + (pct / 100) * (height - 2 * padding)}
            stroke="currentColor"
            strokeOpacity="0.1"
            className="text-border"
          />
        ))}
        
        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill={fillColor}
        />
        
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Start point */}
        <circle
          cx={padding}
          cy={height - padding - ((equityCurve[0]?.equity - minEquity) / range) * (height - 2 * padding)}
          r="4"
          fill={lineColor}
        />

        {/* End point */}
        <circle
          cx={width - padding}
          cy={height - padding - ((equityCurve[equityCurve.length - 1]?.equity - minEquity) / range) * (height - 2 * padding)}
          r="4"
          fill={lineColor}
        />

        {/* Y-axis labels */}
        <text x={padding - 10} y={padding} className="text-xs fill-muted-foreground" textAnchor="end">
          ${formatNumber(maxEquity, 0)}
        </text>
        <text x={padding - 10} y={height - padding} className="text-xs fill-muted-foreground" textAnchor="end">
          ${formatNumber(minEquity, 0)}
        </text>

        {/* X-axis labels */}
        {equityCurve.length > 0 && (
          <>
            <text x={padding} y={height - 10} className="text-xs fill-muted-foreground" textAnchor="middle">
              {new Date(equityCurve[0].timestamp).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
            </text>
            <text x={width - padding} y={height - 10} className="text-xs fill-muted-foreground" textAnchor="middle">
              {new Date(equityCurve[equityCurve.length - 1].timestamp).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
            </text>
          </>
        )}
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Статистика доходности</h2>
          <p className="text-muted-foreground">
            Анализ PnL с учётом комиссий и фандинга
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Demo/Real Switch */}
          <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
            <Label className={cn("text-xs font-medium cursor-pointer", !isDemo && "text-green-500")}>
              REAL
            </Label>
            <Switch
              checked={isDemo}
              onCheckedChange={setIsDemo}
              className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-green-500"
            />
            <Label className={cn("text-xs font-medium cursor-pointer", isDemo && "text-amber-500")}>
              DEMO
            </Label>
          </div>

          {/* Period Selector */}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(p => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net PnL */}
        <Card className={cn(
          "border-2",
          (stats?.netPnL || 0) >= 0 ? "border-green-500/20" : "border-red-500/20"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              {(stats?.netPnL || 0) >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
              <span className="text-sm text-muted-foreground">Чистый PnL</span>
            </div>
            <div className={cn(
              "text-3xl font-bold",
              (stats?.netPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
            )}>
              ${(stats?.netPnL || 0) >= 0 ? "+" : ""}{formatNumber(stats?.netPnL || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              За {PERIOD_LABELS[period]}
            </p>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Win Rate</span>
            </div>
            <div className="text-3xl font-bold">
              {(stats?.winRate || 0).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.winsCount || 0}W / {stats?.lossesCount || 0}L
            </p>
          </CardContent>
        </Card>

        {/* Trades Count */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Сделок</span>
            </div>
            <div className="text-3xl font-bold">
              {stats?.tradesCount || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Profit Factor: {(stats?.profitFactor || 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        {/* Funding */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Percent className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Фандинг</span>
            </div>
            <div className={cn(
              "text-3xl font-bold",
              (stats?.fundingPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
            )}>
              ${(stats?.fundingPnL || 0) >= 0 ? "+" : ""}{formatNumber(stats?.fundingPnL || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(stats?.fundingPnL || 0) >= 0 ? "Получено" : "Уплачено"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Equity Curve */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            Кривая доходности
          </CardTitle>
          <CardDescription>
            Динамика equity за выбранный период
            {isDemo && <Badge variant="outline" className="ml-2 demo-badge">DEMO</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            renderEquityCurve()
          )}
        </CardContent>
      </Card>

      {/* Periods Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Сравнение периодов
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Период</th>
                  <th className="text-right py-2 px-3">PnL</th>
                  <th className="text-right py-2 px-3">Фандинг</th>
                  <th className="text-right py-2 px-3">Комиссии</th>
                  <th className="text-right py-2 px-3">Сделок</th>
                  <th className="text-right py-2 px-3">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {PERIOD_OPTIONS.map(p => {
                  const s = allPeriodsStats[p];
                  if (!s) return null;
                  
                  return (
                    <tr key={p} className={cn(
                      "border-b hover:bg-muted/50 cursor-pointer",
                      p === period && "bg-muted/30"
                    )}
                    onClick={() => setPeriod(p)}
                    >
                      <td className="py-2 px-3 font-medium">{PERIOD_LABELS[p]}</td>
                      <td className={cn(
                        "text-right py-2 px-3",
                        s.netPnL >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        ${s.netPnL >= 0 ? "+" : ""}{formatNumber(s.netPnL)}
                      </td>
                      <td className={cn(
                        "text-right py-2 px-3",
                        s.fundingPnL >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        ${s.fundingPnL >= 0 ? "+" : ""}{formatNumber(s.fundingPnL)}
                      </td>
                      <td className="text-right py-2 px-3 text-red-500">
                        -${formatNumber(s.feesPaid)}
                      </td>
                      <td className="text-right py-2 px-3">{s.tradesCount}</td>
                      <td className="text-right py-2 px-3">{s.winRate.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Детализация PnL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Реализованный PnL</span>
                <span className={stats.realizedPnL >= 0 ? "text-green-500" : "text-red-500"}>
                  ${formatNumber(stats.realizedPnL)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Нереализованный PnL</span>
                <span className={stats.unrealizedPnL >= 0 ? "text-green-500" : "text-red-500"}>
                  ${formatNumber(stats.unrealizedPnL)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Фандинг</span>
                <span className={stats.fundingPnL >= 0 ? "text-green-500" : "text-red-500"}>
                  ${formatNumber(stats.fundingPnL)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Комиссии</span>
                <span className="text-red-500">-${formatNumber(stats.feesPaid)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Чистый PnL</span>
                <span className={stats.netPnL >= 0 ? "text-green-500" : "text-red-500"}>
                  ${formatNumber(stats.netPnL)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Статистика сделок</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Всего сделок</span>
                <span>{stats.tradesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Прибыльных</span>
                <span className="text-green-500">{stats.winsCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Убыточных</span>
                <span className="text-red-500">{stats.lossesCount}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Средняя сделка</span>
                <span className={stats.avgTrade >= 0 ? "text-green-500" : "text-red-500"}>
                  ${formatNumber(stats.avgTrade)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Лучшая сделка</span>
                <span className="text-green-500">${formatNumber(stats.bestTrade)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Худшая сделка</span>
                <span className="text-red-500">${formatNumber(stats.worstTrade)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Profit Factor</span>
                <span>{stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
