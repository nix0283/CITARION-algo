"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  RefreshCw,
  Activity,
  Percent,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCryptoStore } from "@/stores/crypto-store";
import { ShareStatsCard } from "@/components/share/share-stats-card";

// Time period options with Russian labels
const TIME_PERIODS = [
  { value: "1d", label: "1 день", days: 1 },
  { value: "3d", label: "3 дня", days: 3 },
  { value: "1w", label: "1 неделя", days: 7 },
  { value: "2w", label: "2 недели", days: 14 },
  { value: "1m", label: "1 месяц", days: 30 },
  { value: "3m", label: "3 месяца", days: 90 },
  { value: "6m", label: "6 месяцев", days: 180 },
  { value: "1y", label: "1 год", days: 365 },
  { value: "3y", label: "3 года", days: 1095 },
] as const;

type TimePeriod = typeof TIME_PERIODS[number]["value"];

interface PnLStats {
  totalPnL: number;
  totalPnLPercent: number;
  realizedPnL: number;
  unrealizedPnL: number;
  fundingPnL: number;
  feesPaid: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

interface EquityPoint {
  timestamp: string;
  balance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  fundingPnL: number;
}

interface PnLApiResponse {
  success: boolean;
  stats: PnLStats;
  equityCurve: EquityPoint[];
  allPeriodsStats: Record<string, PnLStats>;
  isDemo: boolean;
}

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899"];

export function PnLAnalytics() {
  const { trades, account, getTotalBalance } = useCryptoStore();
  const [timeRange, setTimeRange] = useState<TimePeriod>("1m");
  const [accountType, setAccountType] = useState<"demo" | "real">("demo");
  const [isLoading, setIsLoading] = useState(false);
  const [apiData, setApiData] = useState<PnLApiResponse | null>(null);
  const [showShareCard, setShowShareCard] = useState(false);

  const isDemo = accountType === "demo";

  // Fetch PnL data from API
  const fetchPnLData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/pnl-stats?demo=${isDemo}&period=${timeRange}&equityCurve=true`
      );
      const data = await response.json();
      if (data.success) {
        setApiData(data);
      }
    } catch (error) {
      console.error("Failed to fetch PnL data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isDemo, timeRange]);

  useEffect(() => {
    fetchPnLData();
  }, [fetchPnLData]);

  // Get days from time range
  const getDaysFromRange = (range: TimePeriod): number => {
    const period = TIME_PERIODS.find((p) => p.value === range);
    return period?.days || 30;
  };

  // Filter trades by time range and account type
  const filteredTrades = useMemo(() => {
    const days = getDaysFromRange(timeRange);
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    return trades.filter(
      (t) =>
        t.status === "CLOSED" &&
        t.isDemo === isDemo &&
        new Date(t.createdAt).getTime() >= cutoff
    );
  }, [trades, timeRange, isDemo]);

  // Calculate statistics from local data (fallback)
  const localStats: PnLStats = useMemo(() => {
    const closedTrades = filteredTrades;
    const winningTrades = closedTrades.filter((t) => t.pnl > 0);
    const losingTrades = closedTrades.filter((t) => t.pnl < 0);

    const totalPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    const initialBalance = 10000;
    
    return {
      totalPnL,
      totalPnLPercent: (totalPnL / initialBalance) * 100,
      realizedPnL: totalPnL,
      unrealizedPnL: 0,
      fundingPnL: 0,
      feesPaid: closedTrades.reduce((sum, t) => sum + t.fee, 0),
      winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgWin: winningTrades.length > 0 ? totalWin / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLoss / losingTrades.length : 0,
      profitFactor: totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0,
      bestTrade: Math.max(...closedTrades.map((t) => t.pnl), 0),
      worstTrade: Math.min(...closedTrades.map((t) => t.pnl), 0),
      sharpeRatio: 0,
      maxDrawdown: 0,
    };
  }, [filteredTrades]);

  // Use API data if available, otherwise use local stats
  const stats = apiData?.stats || localStats;
  const equityCurve = apiData?.equityCurve || [];
  const allPeriodsStats = apiData?.allPeriodsStats || {};

  // PnL over time chart data
  const pnlChartData = useMemo(() => {
    if (equityCurve.length > 0) {
      return equityCurve.map((point) => ({
        date: new Date(point.timestamp).toLocaleDateString("ru-RU", {
          month: "short",
          day: "numeric",
        }),
        balance: point.balance,
        equity: point.equity,
        realizedPnL: point.realizedPnL,
        fundingPnL: point.fundingPnL,
      }));
    }

    // Fallback to local data
    const closedTrades = [...filteredTrades].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const initialBalance = 10000;
    let cumulative = initialBalance;
    const data: { date: string; balance: number; equity: number; pnl: number }[] = [];

    closedTrades.forEach((trade) => {
      cumulative += trade.pnl;
      data.push({
        date: new Date(trade.createdAt).toLocaleDateString("ru-RU", {
          month: "short",
          day: "numeric",
        }),
        balance: cumulative,
        equity: cumulative,
        pnl: trade.pnl,
      });
    });

    return data;
  }, [equityCurve, filteredTrades]);

  // Daily PnL chart data
  const dailyPnLData = useMemo(() => {
    const dailyMap = new Map<string, number>();

    filteredTrades.forEach((trade) => {
      const date = new Date(trade.createdAt).toLocaleDateString("ru-RU");
      dailyMap.set(date, (dailyMap.get(date) || 0) + trade.pnl);
    });

    return Array.from(dailyMap.entries())
      .map(([date, pnl]) => ({ date, pnl }))
      .slice(-30);
  }, [filteredTrades]);

  // Symbol distribution
  const symbolDistribution = useMemo(() => {
    const symbolMap = new Map<string, number>();

    filteredTrades.forEach((trade) => {
      const count = symbolMap.get(trade.symbol) || 0;
      symbolMap.set(trade.symbol, count + 1);
    });

    return Array.from(symbolMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(6);
  }, [filteredTrades]);

  // Win/Loss distribution
  const winLossData = [
    { name: "Прибыльные", value: stats.winningTrades ?? 0, color: "#22c55e" },
    { name: "Убыточные", value: stats.losingTrades ?? 0, color: "#ef4444" },
  ];

  // Period comparison data
  const periodComparisonData = useMemo(() => {
    return TIME_PERIODS.slice(0, 7).map((period) => {
      const periodStats = allPeriodsStats[period.value] || {
        totalPnL: 0,
        totalTrades: 0,
      };
      return {
        period: period.label,
        pnl: periodStats.totalPnL || 0,
        trades: periodStats.totalTrades || 0,
      };
    });
  }, [allPeriodsStats]);

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return "$0.00";
    }
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return "+0.00%";
    }
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number | undefined | null, decimals: number = 1) => {
    if (value === undefined || value === null || isNaN(value)) {
      return "0";
    }
    return value.toFixed(decimals);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Аналитика P&L</h2>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Account Type Toggle */}
          <div className="flex items-center gap-2">
            <Badge
              variant={isDemo ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAccountType("demo")}
            >
              DEMO
            </Badge>
            <Badge
              variant={!isDemo ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setAccountType("real")}
            >
              REAL
            </Badge>
          </div>

          {/* Time Range Selector */}
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimePeriod)}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_PERIODS.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button variant="outline" size="icon" onClick={fetchPnLData} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>

          {/* Share Button */}
          <Button variant="default" size="icon" onClick={() => setShowShareCard(true)}>
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Share Stats Card Dialog */}
      <ShareStatsCard
        open={showShareCard}
        onOpenChange={setShowShareCard}
        statsData={{
          totalTrades: stats.totalTrades ?? 0,
          winningTrades: stats.winningTrades ?? 0,
          losingTrades: stats.losingTrades ?? 0,
          winRate: stats.winRate ?? 0,
          totalPnL: stats.totalPnL ?? 0,
          avgProfit: stats.avgWin ?? 0,
          avgLoss: Math.abs(stats.avgLoss ?? 0),
          bestTrade: stats.bestTrade ?? 0,
          worstTrade: stats.worstTrade ?? 0,
          period: TIME_PERIODS.find(p => p.value === timeRange)?.label ?? "30 Days",
          balance: account.virtualBalance?.USDT ?? getTotalBalance(),
          initialBalance: 10000,
        }}
        equityData={equityCurve.length > 0 ? {
          balanceHistory: equityCurve.map(e => ({ date: e.timestamp, balance: e.balance })),
          totalPnL: stats.totalPnL ?? 0,
          totalPnLPercent: stats.totalPnLPercent ?? 0,
          period: TIME_PERIODS.find(p => p.value === timeRange)?.label ?? "30 Days",
          trades: stats.totalTrades ?? 0,
          winRate: stats.winRate ?? 0,
          initialBalance: 10000,
        } : undefined}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total P&L */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Общий P&L</p>
                <p
                  className={cn(
                    "text-xl font-bold",
                    (stats.totalPnL ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                  )}
                >
                  {(stats.totalPnL ?? 0) >= 0 ? "+" : ""}
                  {formatCurrency(stats.totalPnL)}
                </p>
              </div>
              {(stats.totalPnL ?? 0) >= 0 ? (
                <TrendingUp className="h-8 w-8 text-green-500/20" />
              ) : (
                <TrendingDown className="h-8 w-8 text-red-500/20" />
              )}
            </div>
            <p
              className={cn(
                "text-xs mt-1",
                (stats.totalPnLPercent ?? 0) >= 0 ? "text-green-500" : "text-red-500"
              )}
            >
              {formatPercent(stats.totalPnLPercent)}
            </p>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-xl font-bold">{formatNumber(stats.winRate)}%</p>
              </div>
              <PieChartIcon className="h-8 w-8 text-primary/20" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.winningTrades ?? 0}W / {stats.losingTrades ?? 0}L
            </p>
          </CardContent>
        </Card>

        {/* Profit Factor */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Profit Factor</p>
                <p className="text-xl font-bold">
                  {stats.profitFactor === Infinity ? "∞" : formatNumber(stats.profitFactor, 2)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500/20" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg: {formatCurrency(stats.avgWin)} / {formatCurrency(-stats.avgLoss)}
            </p>
          </CardContent>
        </Card>

        {/* Total Trades */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Всего сделок</p>
                <p className="text-xl font-bold">{stats.totalTrades}</p>
              </div>
              <Activity className="h-8 w-8 text-primary/20" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Best: {formatCurrency(stats.bestTrade)} / Worst: {formatCurrency(stats.worstTrade)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Реализованный P&L</p>
                <p className={cn("font-semibold", (stats.realizedPnL ?? 0) >= 0 ? "text-green-500" : "text-red-500")}>
                  {formatCurrency(stats.realizedPnL)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Нереализованный P&L</p>
                <p className={cn("font-semibold", (stats.unrealizedPnL ?? 0) >= 0 ? "text-green-500" : "text-red-500")}>
                  {formatCurrency(stats.unrealizedPnL)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Фандинг P&L</p>
                <p className={cn("font-semibold", (stats.fundingPnL ?? 0) >= 0 ? "text-green-500" : "text-red-500")}>
                  {formatCurrency(stats.fundingPnL)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Комиссии</p>
                <p className="font-semibold text-red-500">-{formatCurrency(stats.feesPaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="equity" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="equity">Кривая капитала</TabsTrigger>
          <TabsTrigger value="daily">Дневной P&L</TabsTrigger>
          <TabsTrigger value="comparison">По периодам</TabsTrigger>
          <TabsTrigger value="distribution">Распределение</TabsTrigger>
        </TabsList>

        <TabsContent value="equity" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Кривая капитала ({isDemo ? "DEMO" : "REAL"})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pnlChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={pnlChartData}>
                    <defs>
                      <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === "equity" ? "Капитал" : name === "balance" ? "Баланс" : name,
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="hsl(var(--primary))"
                      fill="url(#colorEquity)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  Нет данных для отображения
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Дневной P&L</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyPnLData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={dailyPnLData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [formatCurrency(value), "P&L"]}
                    />
                    <Bar
                      dataKey="pnl"
                      radius={[4, 4, 0, 0]}
                      fill="#8884d8"
                    >
                      {dailyPnLData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  Нет данных для отображения
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Сравнение по периодам</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={periodComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "pnl" ? formatCurrency(value) : value,
                      name === "pnl" ? "P&L" : "Сделки",
                    ]}
                  />
                  <Bar yAxisId="right" dataKey="trades" fill="hsl(var(--primary))" opacity={0.3} name="Сделки" />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="pnl"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: "#22c55e", strokeWidth: 2 }}
                    name="P&L"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Win/Loss</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={winLossData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {winLossData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">По символам</CardTitle>
              </CardHeader>
              <CardContent>
                {symbolDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={symbolDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name }) => name}
                      >
                        {symbolDistribution.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    Нет данных
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Period Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Статистика по всем периодам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2">Период</th>
                  <th className="text-right py-2 px-2">P&L</th>
                  <th className="text-right py-2 px-2">Сделки</th>
                  <th className="text-right py-2 px-2">Win Rate</th>
                  <th className="text-right py-2 px-2">Profit Factor</th>
                </tr>
              </thead>
              <tbody>
                {TIME_PERIODS.map((period) => {
                  const periodStats = allPeriodsStats[period.value] || {
                    totalPnL: 0,
                    totalTrades: 0,
                    winRate: 0,
                    profitFactor: 0,
                  };
                  return (
                    <tr
                      key={period.value}
                      className={cn(
                        "border-b border-border/50 cursor-pointer hover:bg-muted/50",
                        timeRange === period.value && "bg-muted"
                      )}
                      onClick={() => setTimeRange(period.value)}
                    >
                      <td className="py-2 px-2">{period.label}</td>
                      <td
                        className={cn(
                          "text-right py-2 px-2 font-medium",
                          periodStats.totalPnL >= 0 ? "text-green-500" : "text-red-500"
                        )}
                      >
                        {formatCurrency(periodStats.totalPnL)}
                      </td>
                      <td className="text-right py-2 px-2">{periodStats.totalTrades}</td>
                      <td className="text-right py-2 px-2">{formatNumber(periodStats.winRate)}%</td>
                      <td className="text-right py-2 px-2">
                        {periodStats.profitFactor === Infinity
                          ? "∞"
                          : formatNumber(periodStats.profitFactor, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
