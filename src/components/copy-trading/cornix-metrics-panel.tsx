"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, TrendingUp, TrendingDown, Activity, DollarSign,
  RefreshCw, Target, Award, Percent, LineChart, PieChart,
  Calendar, Clock, Users, Zap, AlertCircle, Loader2, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface PerformanceMetrics {
  totalPnl: number;
  totalPnlPercent: number;
  todayPnl: number;
  todayPnlPercent: number;
  weekPnl: number;
  weekPnlPercent: number;
  monthPnl: number;
  monthPnlPercent: number;
  winRate: number;
  avgHoldTime: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentStreak: number;
  bestTrade: number;
  worstTrade: number;
}

interface SignalMetrics {
  totalSignals: number;
  successfulSignals: number;
  failedSignals: number;
  pendingSignals: number;
  avgExecutionTime: number;
  successRate: number;
  avgReturn: number;
  signalsByExchange: Record<string, number>;
  signalsByPair: { pair: string; count: number; pnl: number }[];
}

interface CopyTradingMetrics {
  activeFollowers: number;
  totalFollowers: number;
  totalCopiedTrades: number;
  avgFollowerPnl: number;
  profitShareEarned: number;
  topFollowers: { id: string; pnl: number; trades: number }[];
}

interface TimeSeriesData {
  date: string;
  pnl: number;
  trades: number;
  equity: number;
}

export function CornixMetricsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'performance' | 'signals' | 'copytrading'>('performance');
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [signals, setSignals] = useState<SignalMetrics | null>(null);
  const [copyTrading, setCopyTrading] = useState<CopyTradingMetrics | null>(null);
  const [equityCurve, setEquityCurve] = useState<TimeSeriesData[]>([]);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // Fetch metrics from API
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/cornix/metrics?period=${period}`);
      const result = await response.json();

      if (result.success) {
        setPerformance(result.data.performance);
        setSignals(result.data.signals);
        setCopyTrading(result.data.copyTrading);
        setEquityCurve(result.data.equityCurve || []);
      } else {
        // Use demo data
        setPerformance(getDemoPerformance());
        setSignals(getDemoSignals());
        setCopyTrading(getDemoCopyTrading());
        setEquityCurve(generateDemoEquityCurve());
      }
    } catch (error) {
      console.error('[CornixMetricsPanel] Error:', error);
      // Use demo data for demo
      setPerformance(getDemoPerformance());
      setSignals(getDemoSignals());
      setCopyTrading(getDemoCopyTrading());
      setEquityCurve(generateDemoEquityCurve());
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const formatNumber = (num: number, decimals = 2) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  if (initialLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Cornix Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Cornix Metrics
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Performance and signal metrics from Cornix integration
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period Selector */}
          <div className="flex gap-1">
            {(['7d', '30d', '90d', 'all'] as const).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
              >
                {p === 'all' ? 'All Time' : p.toUpperCase()}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Performance Summary Cards */}
      {performance && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total PnL</span>
              </div>
              <div className={cn(
                "text-2xl font-bold mt-2",
                performance.totalPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
              )}>
                {performance.totalPnl >= 0 ? '+' : ''}${formatNumber(performance.totalPnl)}
              </div>
              <p className={cn(
                "text-xs flex items-center gap-1",
                performance.totalPnlPercent >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
              )}>
                {performance.totalPnlPercent >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {formatNumber(performance.totalPnlPercent)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Win Rate</span>
              </div>
              <div className="text-2xl font-bold mt-2">{formatNumber(performance.winRate, 1)}%</div>
              <Progress value={performance.winRate} className="h-2 mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Trades</span>
              </div>
              <div className="text-2xl font-bold mt-2">{performance.totalTrades}</div>
              <p className="text-xs text-muted-foreground">
                {performance.winningTrades}W / {performance.losingTrades}L
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Profit Factor</span>
              </div>
              <div className="text-2xl font-bold mt-2">{formatNumber(performance.profitFactor)}</div>
              <p className="text-xs text-muted-foreground">
                Sharpe: {formatNumber(performance.sharpeRatio)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for detailed metrics */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="signals">Signals</TabsTrigger>
          <TabsTrigger value="copytrading">Copy Trading</TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          {performance && (
            <>
              {/* Period PnL Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Today</span>
                    </div>
                    <div className={cn(
                      "text-xl font-bold mt-2",
                      performance.todayPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                    )}>
                      {performance.todayPnl >= 0 ? '+' : ''}${formatNumber(performance.todayPnl)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(performance.todayPnlPercent)}%
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">This Week</span>
                    </div>
                    <div className={cn(
                      "text-xl font-bold mt-2",
                      performance.weekPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                    )}>
                      {performance.weekPnl >= 0 ? '+' : ''}${formatNumber(performance.weekPnl)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(performance.weekPnlPercent)}%
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">This Month</span>
                    </div>
                    <div className={cn(
                      "text-xl font-bold mt-2",
                      performance.monthPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                    )}>
                      {performance.monthPnl >= 0 ? '+' : ''}${formatNumber(performance.monthPnl)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(performance.monthPnlPercent)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Stats */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-lg">Detailed Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground">Avg Win</div>
                      <div className="text-lg font-semibold text-[#0ECB81]">
                        +${formatNumber(performance.avgWin)}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground">Avg Loss</div>
                      <div className="text-lg font-semibold text-[#F6465D]">
                        -${formatNumber(Math.abs(performance.avgLoss))}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground">Best Trade</div>
                      <div className="text-lg font-semibold text-[#0ECB81]">
                        +${formatNumber(performance.bestTrade)}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground">Worst Trade</div>
                      <div className="text-lg font-semibold text-[#F6465D]">
                        -${formatNumber(Math.abs(performance.worstTrade))}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground">Avg Hold Time</div>
                      <div className="text-lg font-semibold">
                        {formatDuration(performance.avgHoldTime)}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground">Max Drawdown</div>
                      <div className="text-lg font-semibold text-[#F6465D]">
                        -{formatNumber(performance.maxDrawdown)}%
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground">Current Streak</div>
                      <div className="text-lg font-semibold">
                        {performance.currentStreak > 0 ? '+' : ''}{performance.currentStreak} trades
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground">Sharpe Ratio</div>
                      <div className="text-lg font-semibold">
                        {formatNumber(performance.sharpeRatio)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Equity Curve */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <LineChart className="h-5 w-5" />
                    Equity Curve
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {equityCurve.length > 0 ? (
                    <div className="h-48 flex items-end gap-1">
                      {equityCurve.slice(-30).map((point, i) => {
                        const maxEquity = Math.max(...equityCurve.map(p => p.equity));
                        const minEquity = Math.min(...equityCurve.map(p => p.equity));
                        const range = maxEquity - minEquity || 1;
                        const height = ((point.equity - minEquity) / range) * 100;
                        const isPositive = point.pnl >= 0;
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 min-w-[4px] rounded-t transition-all hover:opacity-80",
                              isPositive ? "bg-[#0ECB81]" : "bg-[#F6465D]"
                            )}
                            style={{ height: `${Math.max(height, 5)}%` }}
                            title={`${point.date}: $${formatNumber(point.equity)}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-muted-foreground">
                      No equity curve data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Signals Tab */}
        <TabsContent value="signals" className="space-y-4">
          {signals && (
            <>
              {/* Signal Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Total Signals</span>
                    </div>
                    <div className="text-2xl font-bold mt-2">{signals.totalSignals}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-[#0ECB81]" />
                      <span className="text-sm text-muted-foreground">Successful</span>
                    </div>
                    <div className="text-2xl font-bold mt-2 text-[#0ECB81]">
                      {signals.successfulSignals}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(signals.successRate)}% success rate
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-[#F6465D]" />
                      <span className="text-sm text-muted-foreground">Failed</span>
                    </div>
                    <div className="text-2xl font-bold mt-2 text-[#F6465D]">
                      {signals.failedSignals}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Avg Execution</span>
                    </div>
                    <div className="text-2xl font-bold mt-2">
                      {formatNumber(signals.avgExecutionTime / 1000, 1)}s
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Signals by Exchange */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Signals by Exchange
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(signals.signalsByExchange).map(([exchange, count]) => (
                      <div key={exchange} className="p-3 bg-muted/50 rounded-lg text-center">
                        <div className="text-xs text-muted-foreground capitalize">{exchange}</div>
                        <div className="text-lg font-semibold">{count}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top Trading Pairs */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-lg">Top Trading Pairs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {signals.signalsByPair.slice(0, 10).map((pair, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{i + 1}</Badge>
                          <span className="font-semibold">{pair.pair}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-muted-foreground">{pair.count} signals</div>
                          <div className={cn(
                            "font-semibold",
                            pair.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                          )}>
                            {pair.pnl >= 0 ? '+' : ''}${formatNumber(pair.pnl)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Copy Trading Tab */}
        <TabsContent value="copytrading" className="space-y-4">
          {copyTrading && (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Copy Trading Metrics</AlertTitle>
                <AlertDescription>
                  These metrics are available when you are connected as a Master Trader on OKX or Bitget.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Active Followers</span>
                    </div>
                    <div className="text-2xl font-bold mt-2">{copyTrading.activeFollowers}</div>
                    <p className="text-xs text-muted-foreground">
                      of {copyTrading.totalFollowers} total
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Copied Trades</span>
                    </div>
                    <div className="text-2xl font-bold mt-2">{copyTrading.totalCopiedTrades}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <Percent className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Avg Follower PnL</span>
                    </div>
                    <div className={cn(
                      "text-2xl font-bold mt-2",
                      copyTrading.avgFollowerPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                    )}>
                      {copyTrading.avgFollowerPnl >= 0 ? '+' : ''}${formatNumber(copyTrading.avgFollowerPnl)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-[#0ECB81]" />
                      <span className="text-sm text-muted-foreground">Profit Share</span>
                    </div>
                    <div className="text-2xl font-bold mt-2 text-[#0ECB81]">
                      ${formatNumber(copyTrading.profitShareEarned)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Followers */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-lg">Top Followers</CardTitle>
                </CardHeader>
                <CardContent>
                  {copyTrading.topFollowers.length > 0 ? (
                    <div className="space-y-2">
                      {copyTrading.topFollowers.map((follower, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Users className="h-4 w-4 text-primary" />
                            </div>
                            <span className="font-semibold">{follower.id}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-sm text-muted-foreground">{follower.trades} trades</div>
                            <div className={cn(
                              "font-semibold",
                              follower.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                            )}>
                              {follower.pnl >= 0 ? '+' : ''}${formatNumber(follower.pnl)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No followers data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== DEMO DATA HELPERS ====================

function getDemoPerformance(): PerformanceMetrics {
  return {
    totalPnl: 12456.78,
    totalPnlPercent: 24.91,
    todayPnl: 345.67,
    todayPnlPercent: 0.69,
    weekPnl: 1234.56,
    weekPnlPercent: 2.47,
    monthPnl: 4567.89,
    monthPnlPercent: 9.13,
    winRate: 68.5,
    avgHoldTime: 4 * 3600000 + 30 * 60000, // 4h 30m
    totalTrades: 156,
    winningTrades: 107,
    losingTrades: 49,
    avgWin: 234.56,
    avgLoss: -156.78,
    profitFactor: 1.85,
    sharpeRatio: 2.15,
    maxDrawdown: 8.45,
    currentStreak: 5,
    bestTrade: 890.12,
    worstTrade: -345.67,
  };
}

function getDemoSignals(): SignalMetrics {
  return {
    totalSignals: 89,
    successfulSignals: 61,
    failedSignals: 8,
    pendingSignals: 20,
    avgExecutionTime: 1250, // ms
    successRate: 68.5,
    avgReturn: 2.34,
    signalsByExchange: {
      binance: 32,
      bybit: 24,
      okx: 18,
      bitget: 10,
      bingx: 5,
    },
    signalsByPair: [
      { pair: 'BTCUSDT', count: 28, pnl: 3456.78 },
      { pair: 'ETHUSDT', count: 22, pnl: 2134.56 },
      { pair: 'SOLUSDT', count: 15, pnl: 1567.89 },
      { pair: 'DOGEUSDT', count: 12, pnl: 890.12 },
      { pair: 'XRPUSDT', count: 8, pnl: 567.89 },
    ],
  };
}

function getDemoCopyTrading(): CopyTradingMetrics {
  return {
    activeFollowers: 12,
    totalFollowers: 15,
    totalCopiedTrades: 234,
    avgFollowerPnl: 456.78,
    profitShareEarned: 1234.56,
    topFollowers: [
      { id: 'user_1', pnl: 1234.56, trades: 45 },
      { id: 'user_2', pnl: 987.65, trades: 38 },
      { id: 'user_3', pnl: 678.90, trades: 29 },
      { id: 'user_4', pnl: 456.78, trades: 22 },
      { id: 'user_5', pnl: 234.56, trades: 15 },
    ],
  };
}

function generateDemoEquityCurve(): TimeSeriesData[] {
  const data: TimeSeriesData[] = [];
  let equity = 50000;
  const now = Date.now();

  for (let i = 30; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pnl = (Math.random() - 0.35) * 1000;
    equity += pnl;
    data.push({
      date,
      pnl,
      trades: Math.floor(Math.random() * 10) + 1,
      equity,
    });
  }

  return data;
}
