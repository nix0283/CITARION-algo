"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Target,
  Plus,
  Play,
  Pause,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Zap,
  AlertTriangle,
  Shield,
  CheckCircle2,
  XCircle,
  Minus,
  BarChart3,
  Loader2,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";
import {
  EnhancedSignalFilter,
  EnhancedFilterResult,
  EnhancedFilterConfig,
  DEFAULT_ENHANCED_FILTER_CONFIG,
} from "@/lib/bot-filters/enhanced-signal-filter";
import { useBotFilter } from "@/hooks/use-bot-filter";
import { FilterStatus, SignalIndicator, FilterToggle } from "./shared/filter-status";

interface OrionBot {
  id: string;
  name: string;
  status: "RUNNING" | "HALTED" | "STOPPED" | "STARTING";
  mode: "PAPER" | "LIVE";
  exchange: string;
  symbols: string[];
  strategy: {
    emaFast: number;
    emaMedium: number;
    emaSlow: number;
    supertrendPeriod: number;
    supertrendMultiplier: number;
  };
  risk: {
    mode: "fixed" | "kelly" | "fractional_kelly";
    maxRiskPct: number;
    maxPositions: number;
  };
  hedging: boolean;
  validationStatus: "INIT" | "RUNNING" | "VALIDATED" | "FAILED";
  createdAt: string;
}

interface OrionPosition {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  size: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  stopLoss: number;
  openedAt: string;
}

interface OrionStats {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalPnL: number;
}

// Signal Types for Orion
interface SuperTrendSignal {
  direction: "LONG" | "SHORT";
  strength: number;
  price: number;
}

interface NPCSignal {
  signal: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  pattern: string;
}

interface SqueezeSignal {
  isSqueezing: boolean;
  bandwidth: number;
  breakoutDirection: "LONG" | "SHORT" | "NEUTRAL";
}

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
  { id: "okx", name: "OKX" },
  { id: "bitget", name: "Bitget" },
];

const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
  "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT"
];

export function OrionBotManager() {
  const [bots, setBots] = useState<OrionBot[]>([]);
  const [positions, setPositions] = useState<OrionPosition[]>([]);
  const [stats, setStats] = useState<OrionStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Signal Filter State using shared hook
  const {
    filter,
    result: filterResult,
    loading: isFilterLoading,
    evaluate,
    filterEnabled,
    setFilterEnabled,
    updateConfig,
    isReady,
  } = useBotFilter("ORION", "BTCUSDT");

  // Mock signal state for demonstration
  const [superTrendSignal, setSuperTrendSignal] = useState<SuperTrendSignal | null>(null);
  const [npcSignal, setNpcSignal] = useState<NPCSignal | null>(null);
  const [squeezeSignal, setSqueezeSignal] = useState<SqueezeSignal | null>(null);
  const [regime, setRegime] = useState<"TRENDING" | "RANGING" | "NEUTRAL">("TRENDING");
  const [showDisagreement, setShowDisagreement] = useState(false);

  // New bot form state
  const [newBot, setNewBot] = useState({
    name: "",
    exchange: "binance",
    symbols: ["BTCUSDT"],
    emaFast: 20,
    emaMedium: 50,
    emaSlow: 200,
    supertrendPeriod: 10,
    supertrendMultiplier: 3.0,
    riskMode: "fractional_kelly",
    maxRiskPct: 2,
    maxPositions: 5,
    hedging: true,
  });

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch("/api/trend-bot");
      const data = await response.json();
      if (data.success && data.bot) {
        setBots([{
          id: data.bot.instanceId,
          name: "Orion",
          status: data.bot.status,
          mode: data.bot.mode,
          exchange: "multi",
          symbols: ["BTCUSDT", "ETHUSDT"],
          strategy: data.config?.strategy || {
            emaFast: 20,
            emaMedium: 50,
            emaSlow: 200,
            supertrendPeriod: 10,
            supertrendMultiplier: 3.0,
          },
          risk: data.config?.risk || {
            mode: "fractional_kelly",
            maxRiskPct: 2,
            maxPositions: 5,
          },
          hedging: true,
          validationStatus: data.validation?.status || "INIT",
          createdAt: new Date().toISOString(),
        }]);

        setPositions(data.bot.positions || []);
        setStats(data.bot.lifetimeStats || null);
        generateMockSignals();
      }
    } catch (error) {
      console.error("Failed to fetch Orion bots:", error);
    }
  };

  // Generate mock signals for demonstration
  const generateMockSignals = () => {
    setSuperTrendSignal({
      direction: Math.random() > 0.5 ? "LONG" : "SHORT",
      strength: 0.6 + Math.random() * 0.4,
      price: 65000 + Math.random() * 500,
    });

    setNpcSignal({
      signal: Math.random() > 0.5 ? "LONG" : "SHORT",
      confidence: 0.5 + Math.random() * 0.3,
      pattern: Math.random() > 0.5 ? "Breakout" : "Continuation",
    });

    setSqueezeSignal({
      isSqueezing: Math.random() > 0.3,
      bandwidth: 0.02 + Math.random() * 0.02,
      breakoutDirection: Math.random() > 0.5 ? "LONG" : "SHORT",
    });

    setRegime(Math.random() > 0.5 ? "TRENDING" : "RANGING");
  };

  // Check for disagreement when signals change
  useEffect(() => {
    if (superTrendSignal && npcSignal) {
      setShowDisagreement(superTrendSignal.direction !== npcSignal.signal);
    }
  }, [superTrendSignal, npcSignal]);

  const handleStartBot = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/trend-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Orion запущен в PAPER режиме");
        fetchBots();
      } else {
        toast.error(data.error || "Ошибка запуска");
      }
    } catch (error) {
      toast.error("Ошибка при запуске");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopBot = async () => {
    try {
      const response = await fetch("/api/trend-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Orion остановлен");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка при остановке");
    }
  };

  const handleHaltBot = async () => {
    try {
      const response = await fetch("/api/trend-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "halt", reason: "Manual halt" }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Orion приостановлен");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка");
    }
  };

  const handleResumeBot = async () => {
    try {
      const response = await fetch("/api/trend-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Orion возобновлён");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка");
    }
  };

  const handleGoLive = async () => {
    try {
      const response = await fetch("/api/trend-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "goLive" }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Orion переключен в LIVE режим");
        fetchBots();
      } else {
        toast.error(data.message || "Валидация не пройдена");
      }
    } catch (error) {
      toast.error("Ошибка переключения");
    }
  };

  const handleClosePosition = async (positionId: string) => {
    try {
      const response = await fetch("/api/trend-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "closePosition", positionId }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Позиция закрыта");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка закрытия");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RUNNING":
        return <Badge className="bg-green-500/10 text-green-500">Активен</Badge>;
      case "HALTED":
        return <Badge className="bg-yellow-500/10 text-yellow-500">Пауза</Badge>;
      case "STARTING":
        return <Badge className="bg-blue-500/10 text-blue-500">Запуск...</Badge>;
      default:
        return <Badge className="bg-gray-500/10 text-gray-500">Остановлен</Badge>;
    }
  };

  const getValidationBadge = (status: string) => {
    switch (status) {
      case "VALIDATED":
        return <Badge className="bg-green-500/10 text-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Валидирован</Badge>;
      case "RUNNING":
        return <Badge className="bg-blue-500/10 text-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Валидация...</Badge>;
      case "FAILED":
        return <Badge className="bg-red-500/10 text-red-500"><AlertTriangle className="h-3 w-3 mr-1" />Ошибка</Badge>;
      default:
        return <Badge variant="outline">Ожидание</Badge>;
    }
  };

  // Calculate ensemble confidence
  const calculateEnsembleConfidence = () => {
    if (!superTrendSignal && !npcSignal && !squeezeSignal) return 0;
    const scores = [
      superTrendSignal?.strength || 0,
      npcSignal?.confidence || 0,
      squeezeSignal ? (squeezeSignal.isSqueezing ? 0.8 : 0.5) : 0,
    ];
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  const activeBot = bots[0];
  const isRunning = activeBot?.status === "RUNNING";
  const isHalted = activeBot?.status === "HALTED";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Orion - Trend-Following Hunter
          </h2>
          <p className="text-muted-foreground mt-1">
            EMA + Supertrend стратегия с Kelly Criterion риск-менеджментом
          </p>
        </div>

        <div className="flex gap-2">
          {!activeBot ? (
            <Button onClick={handleStartBot} disabled={isLoading}>
              <Play className="h-4 w-4 mr-2" />
              Запустить
            </Button>
          ) : (
            <>
              {isRunning && (
                <Button variant="outline" onClick={handleHaltBot}>
                  <Pause className="h-4 w-4 mr-2" />
                  Пауза
                </Button>
              )}
              {isHalted && (
                <Button variant="outline" onClick={handleResumeBot}>
                  <Play className="h-4 w-4 mr-2" />
                  Возобновить
                </Button>
              )}
              <Button variant="destructive" onClick={handleStopBot}>
                <Trash2 className="h-4 w-4 mr-2" />
                Остановить
              </Button>
              {activeBot.mode === "PAPER" && activeBot.validationStatus === "VALIDATED" && (
                <Button onClick={handleGoLive}>
                  <Zap className="h-4 w-4 mr-2" />
                  Go Live
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Signal Filter Section using shared component */}
      <FilterStatus
        enabled={filterEnabled}
        onToggle={setFilterEnabled}
        result={filterResult}
        loading={isFilterLoading}
        signalDirection={superTrendSignal?.direction || npcSignal?.signal}
        signalConfidence={calculateEnsembleConfidence()}
        regime={regime}
        ensembleScores={{
          lawrence: npcSignal?.confidence,
          ml: superTrendSignal?.strength,
          forecast: squeezeSignal ? (squeezeSignal.isSqueezing ? 0.8 : 0.5) : undefined,
          overall: calculateEnsembleConfidence(),
        }}
        showDisagreement={showDisagreement}
        disagreementDetails={showDisagreement ? "SuperTrend and Neural Pattern disagree on direction" : undefined}
        onTest={generateMockSignals}
        botType="ORION"
      />

      {/* Signal Components Detail */}
      {filterEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Signal Components
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* SuperTrend */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="font-medium">SuperTrend</span>
                  </div>
                  {superTrendSignal && (
                    <SignalIndicator
                      direction={superTrendSignal.direction}
                      confidence={superTrendSignal.strength}
                      size="sm"
                    />
                  )}
                </div>
                {superTrendSignal && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Strength</span>
                      <span className="font-medium">{(superTrendSignal.strength * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={superTrendSignal.strength * 100} className="h-2" />
                  </div>
                )}
              </div>

              {/* Neural Pattern Classifier */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="font-medium">Neural Pattern</span>
                  </div>
                  {npcSignal && (
                    <SignalIndicator
                      direction={npcSignal.signal}
                      confidence={npcSignal.confidence}
                      size="sm"
                    />
                  )}
                </div>
                {npcSignal && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pattern</span>
                      <span className="font-medium">{npcSignal.pattern}</span>
                    </div>
                    <Progress value={npcSignal.confidence * 100} className="h-2" />
                  </div>
                )}
              </div>

              {/* Squeeze */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <span className="font-medium">Squeeze</span>
                  </div>
                  {squeezeSignal && (
                    <Badge variant={squeezeSignal.isSqueezing ? "default" : "outline"}>
                      {squeezeSignal.isSqueezing ? "Active" : "None"}
                    </Badge>
                  )}
                </div>
                {squeezeSignal && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Bandwidth</span>
                      <span className="font-medium">{squeezeSignal.bandwidth.toFixed(4)}</span>
                    </div>
                    <Progress value={squeezeSignal.bandwidth * 50} className="h-2" />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">{positions.length}</div>
                <div className="text-xs text-muted-foreground">Позиций</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">
                  {stats?.winRate ? (stats.winRate * 100).toFixed(0) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Win Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">
                  {stats?.profitFactor?.toFixed(2) || "0.00"}
                </div>
                <div className="text-xs text-muted-foreground">Profit Factor</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              <div>
                <div className="text-2xl font-bold">
                  {stats?.maxDrawdown ? (stats.maxDrawdown * 100).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Max DD</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {stats?.totalPnL && stats.totalPnL >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
              <div>
                <div className={cn(
                  "text-2xl font-bold",
                  stats?.totalPnL && stats.totalPnL >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {stats?.totalPnL ? `$${stats.totalPnL.toFixed(2)}` : "$0.00"}
                </div>
                <div className="text-xs text-muted-foreground">Total PnL</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bot Status & Validation */}
      {activeBot && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bot Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Статус бота</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Статус</span>
                {getStatusBadge(activeBot.status)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Режим</span>
                <Badge variant={activeBot.mode === "LIVE" ? "default" : "secondary"}>
                  {activeBot.mode}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Валидация</span>
                {getValidationBadge(activeBot.validationStatus)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hedging Mode</span>
                <Badge variant={activeBot.hedging ? "default" : "outline"}>
                  {activeBot.hedging ? "Включён" : "Выключен"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Символы</span>
                <span className="text-sm">{activeBot.symbols.join(", ")}</span>
              </div>
            </CardContent>
          </Card>

          {/* Strategy Config */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Конфигурация стратегии</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{activeBot.strategy.emaFast}</div>
                  <div className="text-xs text-muted-foreground">EMA Fast</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{activeBot.strategy.emaMedium}</div>
                  <div className="text-xs text-muted-foreground">EMA Medium</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{activeBot.strategy.emaSlow}</div>
                  <div className="text-xs text-muted-foreground">EMA Slow</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{activeBot.strategy.supertrendPeriod}</div>
                  <div className="text-xs text-muted-foreground">ST Period</div>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{activeBot.strategy.supertrendMultiplier}</div>
                  <div className="text-xs text-muted-foreground">ST Multiplier</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-muted-foreground">Risk Mode</span>
                <Badge variant="outline">{activeBot.risk.mode}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Max Risk</span>
                <span className="font-medium">{activeBot.risk.maxRiskPct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Max Positions</span>
                <span className="font-medium">{activeBot.risk.maxPositions}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Positions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Активные позиции</CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Нет открытых позиций</p>
              <p className="text-sm">Orion будет искать трендовые сигналы</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Символ</TableHead>
                  <TableHead>Сторона</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>PnL</TableHead>
                  <TableHead>Stop Loss</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => (
                  <TableRow key={position.id}>
                    <TableCell className="font-medium">{position.symbol}</TableCell>
                    <TableCell>
                      <Badge className={cn(
                        position.side === "LONG"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-red-500/10 text-red-500"
                      )}>
                        {position.side === "LONG"
                          ? <TrendingUp className="h-3 w-3 mr-1" />
                          : <TrendingDown className="h-3 w-3 mr-1" />
                        }
                        {position.side}
                      </Badge>
                    </TableCell>
                    <TableCell>${position.entryPrice.toFixed(2)}</TableCell>
                    <TableCell>${position.currentPrice.toFixed(2)}</TableCell>
                    <TableCell>{position.size.toFixed(4)}</TableCell>
                    <TableCell>
                      <span className={position.unrealizedPnL >= 0 ? "text-green-500" : "text-red-500"}>
                        {position.unrealizedPnL >= 0 ? "+" : ""}
                        ${position.unrealizedPnL.toFixed(2)}
                        <span className="text-xs ml-1">
                          ({position.unrealizedPnLPct >= 0 ? "+" : ""}
                          {position.unrealizedPnLPct.toFixed(2)}%)
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>${position.stopLoss.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => handleClosePosition(position.id)}
                      >
                        Закрыть
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Architecture Info */}
      <Card className="border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Target className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Архитектурная пара: Orion + Argus</p>
              <p className="text-xs text-muted-foreground">
                <strong>Orion</strong> (Охотник) преследует тренды с EMA + Supertrend стратегией.
                <strong> Argus</strong> (Страж) наблюдает за рынком, orderbook и whale tracking.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
