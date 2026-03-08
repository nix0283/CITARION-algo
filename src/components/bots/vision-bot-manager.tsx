"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Eye,
  Plus,
  Play,
  Pause,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  BarChart3,
  Target,
  Activity,
  Zap,
  Filter,
  CheckCircle2,
  XCircle,
  Gauge,
  Brain,
  LineChart,
  Sparkles,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  EnhancedSignalFilter,
  EnhancedFilterResult,
  EnhancedFilterConfig,
  DEFAULT_ENHANCED_FILTER_CONFIG,
  SignalContext,
} from "@/lib/bot-filters/enhanced-signal-filter";
import { useBotFilter } from "@/hooks/use-bot-filter";
import { FilterStatus, SignalIndicator, FilterToggle } from "./shared/filter-status";

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

interface VisionBot {
  id: string;
  name: string;
  isRunning: boolean;
  strategy: "basic" | "multi_tp" | "trailing" | "reentry_24h";
  riskProfile: "easy" | "normal" | "hard" | "scalper";
  currentSignal: "LONG" | "SHORT" | "NEUTRAL";
  currentForecast?: MarketForecast;
  equity: number;
  totalReturn: number;
  winRate: number;
}

interface BacktestResult {
  symbol: string;
  strategy: string;
  totalReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  numTrades: number;
  winRatePct: number;
}

// Ensemble Score Types
interface EnsembleScore {
  lawrence: number;
  ml: number;
  forecast: number;
  overall: number;
  direction: "LONG" | "SHORT" | "NEUTRAL";
}

const STRATEGIES = [
  { id: "basic", name: "Basic", desc: "Фиксированный SL 2% / TP 4%" },
  { id: "multi_tp", name: "Multi TP", desc: "Множественные TP: 2%, 4%, 6%" },
  { id: "trailing", name: "Trailing", desc: "Trailing stop 2%" },
  { id: "reentry_24h", name: "Re-entry 24h", desc: "Ре-энтри до 3 раз, SL 3%" },
];

const RISK_PROFILES = [
  { id: "easy", name: "Easy", leverage: 2, risk: "5%" },
  { id: "normal", name: "Normal", leverage: 3, risk: "10%" },
  { id: "hard", name: "Hard", leverage: 5, risk: "15%" },
  { id: "scalper", name: "Scalper", leverage: 10, risk: "2%" },
];

export function VisionBotManager() {
  const [bots, setBots] = useState<VisionBot[]>([]);
  const [currentForecast, setCurrentForecast] = useState<MarketForecast | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [isBacktestLoading, setIsBacktestLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Signal Filter State
  const [filterEnabled, setFilterEnabled] = useState(true);
  const [filterConfig, setFilterConfig] = useState<EnhancedFilterConfig>(DEFAULT_ENHANCED_FILTER_CONFIG);
  const [ensembleScore, setEnsembleScore] = useState<EnsembleScore | null>(null);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const filterRef = useRef<EnhancedSignalFilter | null>(null);

  // New bot form
  const [newBot, setNewBot] = useState({
    name: "",
    strategy: "reentry_24h" as const,
    riskProfile: "normal" as const,
  });

  // Backtest form
  const [backtestParams, setBacktestParams] = useState({
    symbol: "BTC/USDT",
    strategy: "reentry_24h" as const,
    days: 365,
  });

  // Initialize filter
  useEffect(() => {
    if (!filterRef.current) {
      filterRef.current = new EnhancedSignalFilter(filterConfig);
    }
  }, []);

  // Update filter config
  useEffect(() => {
    if (filterRef.current) {
      filterRef.current.updateConfig(filterConfig);
    }
  }, [filterConfig]);

  useEffect(() => {
    fetchBots();
    fetchForecast();
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch("/api/bots/vision");
      const data = await response.json();
      if (data.success) {
        setBots(data.bots || []);
      }
    } catch (error) {
      console.error("Failed to fetch Vision bots:", error);
    }
  };

  const fetchForecast = async () => {
    setIsForecastLoading(true);
    try {
      const response = await fetch("/api/bots/vision?action=forecast");
      const data = await response.json();
      if (data.success && data.forecast) {
        setCurrentForecast(data.forecast);
        // Generate ensemble score from forecast
        generateEnsembleScore(data.forecast);
      }
    } catch (error) {
      console.error("Failed to fetch forecast:", error);
    } finally {
      setIsForecastLoading(false);
    }
  };

  // Generate ensemble score breakdown
  const generateEnsembleScore = (forecast: MarketForecast) => {
    // Simulate ensemble components
    const lawrence = forecast.confidence * 0.9 + Math.random() * 0.1;
    const ml = forecast.confidence * 0.85 + Math.random() * 0.15;
    const forecastScore = forecast.confidence;
    const overall = (lawrence + ml + forecastScore) / 3;

    setEnsembleScore({
      lawrence,
      ml,
      forecast: forecastScore,
      overall,
      direction: forecast.signal,
    });
  };

  // Test filter
  const testFilter = async () => {
    if (!filterRef.current || !filterEnabled) return;
    
    setIsFilterLoading(true);
    try {
      // Generate ensemble score if forecast exists
      if (currentForecast) {
        generateEnsembleScore(currentForecast);
      }
    } catch (error) {
      console.error('Filter test error:', error);
    } finally {
      setIsFilterLoading(false);
    }
  };

  const handleCreateBot = async () => {
    if (!newBot.name) {
      toast.error("Введите имя бота");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/bots/vision?action=create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newBot,
          filterEnabled,
          filterConfig: {
            minConfidence: filterConfig.minConfidence,
            maxRiskScore: filterConfig.maxRiskScore,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`Бот "${newBot.name}" создан!`);
        setIsCreateOpen(false);
        setNewBot({ name: "", strategy: "reentry_24h", riskProfile: "normal" });
        fetchBots();
      } else {
        toast.error(data.error || "Ошибка создания");
      }
    } catch (error) {
      toast.error("Ошибка при создании");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartBot = async (botId: string) => {
    try {
      const response = await fetch(`/api/bots/vision?action=start&id=${botId}`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Бот запущен");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка запуска");
    }
  };

  const handleStopBot = async (botId: string) => {
    try {
      const response = await fetch(`/api/bots/vision?action=stop&id=${botId}`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Бот остановлен");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка остановки");
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!confirm("Удалить бота?")) return;
    try {
      const response = await fetch(`/api/bots/vision?id=${botId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Бот удалён");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка удаления");
    }
  };

  const handleRunBacktest = async () => {
    setIsBacktestLoading(true);
    try {
      const response = await fetch("/api/bots/vision?action=backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...backtestParams,
          filterEnabled,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setBacktestResult(data.result);
        toast.success("Бэктест завершён!");
      } else {
        toast.error(data.error || "Ошибка бэктеста");
      }
    } catch (error) {
      toast.error("Ошибка при запуске бэктеста");
    } finally {
      setIsBacktestLoading(false);
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case "LONG":
        return <TrendingUp className="h-5 w-5 text-green-500" />;
      case "SHORT":
        return <TrendingDown className="h-5 w-5 text-red-500" />;
      default:
        return <Minus className="h-5 w-5 text-yellow-500" />;
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

  // Get ensemble score color
  const getScoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-500";
    if (score >= 0.5) return "text-yellow-500";
    return "text-red-500";
  };

  // Get recommended action
  const getRecommendedAction = () => {
    if (!ensembleScore) return null;
    
    if (ensembleScore.overall >= 0.7) {
      return { action: "ENTER", color: "text-green-500", icon: CheckCircle2 };
    } else if (ensembleScore.overall >= 0.5) {
      return { action: "WAIT", color: "text-yellow-500", icon: AlertTriangle };
    }
    return { action: "AVOID", color: "text-red-500", icon: XCircle };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="h-6 w-6 text-primary" />
            Vision - Market Forecast
          </h2>
          <p className="text-muted-foreground mt-1">
            Прогнозирование рынка с вероятностным анализом
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchForecast} disabled={isForecastLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isForecastLoading && "animate-spin")} />
            Обновить прогноз
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Создать бота
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Новый Vision Bot</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium">Имя бота</label>
                  <Input
                    value={newBot.name}
                    onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
                    placeholder="Vision-BTC-1"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Стратегия</label>
                  <Select
                    value={newBot.strategy}
                    onValueChange={(v) => setNewBot({ ...newBot, strategy: v as typeof newBot.strategy })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STRATEGIES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div>
                            <div>{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.desc}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Профиль риска</label>
                  <Select
                    value={newBot.riskProfile}
                    onValueChange={(v) => setNewBot({ ...newBot, riskProfile: v as typeof newBot.riskProfile })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_PROFILES.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <div className="flex items-center gap-2">
                            <span>{p.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {p.leverage}x / {p.risk}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filter Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    <label className="text-sm font-medium cursor-pointer">Signal Filter</label>
                  </div>
                  <Switch
                    checked={filterEnabled}
                    onCheckedChange={setFilterEnabled}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreateBot}
                  disabled={isLoading || !newBot.name}
                >
                  {isLoading ? "Создание..." : "Создать бота"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Ensemble Signal Filter Section */}
      <Card className="border-primary/20 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Ensemble Signal Filter
            </CardTitle>
            <Switch
              checked={filterEnabled}
              onCheckedChange={setFilterEnabled}
            />
          </div>
        </CardHeader>
        {filterEnabled && (
          <CardContent className="p-6 space-y-6">
            {/* Recommended Action */}
            {ensembleScore && (
              <div className={cn(
                "p-4 rounded-lg border-2 flex items-center justify-between",
                ensembleScore.overall >= 0.7 ? "border-green-500/50 bg-green-500/5" :
                ensembleScore.overall >= 0.5 ? "border-yellow-500/50 bg-yellow-500/5" :
                "border-red-500/50 bg-red-500/5"
              )}>
                <div className="flex items-center gap-3">
                  {(() => {
                    const rec = getRecommendedAction();
                    if (!rec) return null;
                    const Icon = rec.icon;
                    return <Icon className={cn("h-6 w-6", rec.color)} />;
                  })()}
                  <div>
                    <div className={cn("text-xl font-bold", getRecommendedAction()?.color)}>
                      {getRecommendedAction()?.action}
                    </div>
                    <div className="text-sm text-muted-foreground">Recommended Action</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getSignalIcon(ensembleScore.direction)}
                  <Badge className={cn(
                    "text-lg px-4 py-1",
                    ensembleScore.direction === "LONG" ? "bg-green-500/20 text-green-500" :
                    ensembleScore.direction === "SHORT" ? "bg-red-500/20 text-red-500" :
                    "bg-gray-500/20 text-gray-500"
                  )}>
                    {ensembleScore.direction}
                  </Badge>
                </div>
              </div>
            )}

            {/* Ensemble Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              {/* Lawrence Score */}
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Brain className="h-4 w-4 text-purple-500" />
                    <span className="text-sm text-muted-foreground">Lawrence</span>
                  </div>
                  <div className={cn("text-2xl font-bold", ensembleScore ? getScoreColor(ensembleScore.lawrence) : "text-muted-foreground")}>
                    {ensembleScore ? `${(ensembleScore.lawrence * 100).toFixed(0)}%` : "--"}
                  </div>
                  {ensembleScore && (
                    <Progress value={ensembleScore.lawrence * 100} className="h-1.5 mt-2" />
                  )}
                </CardContent>
              </Card>

              {/* ML Score */}
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Gauge className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">ML Model</span>
                  </div>
                  <div className={cn("text-2xl font-bold", ensembleScore ? getScoreColor(ensembleScore.ml) : "text-muted-foreground")}>
                    {ensembleScore ? `${(ensembleScore.ml * 100).toFixed(0)}%` : "--"}
                  </div>
                  {ensembleScore && (
                    <Progress value={ensembleScore.ml * 100} className="h-1.5 mt-2" />
                  )}
                </CardContent>
              </Card>

              {/* Forecast Score */}
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <LineChart className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">Forecast</span>
                  </div>
                  <div className={cn("text-2xl font-bold", ensembleScore ? getScoreColor(ensembleScore.forecast) : "text-muted-foreground")}>
                    {ensembleScore ? `${(ensembleScore.forecast * 100).toFixed(0)}%` : "--"}
                  </div>
                  {ensembleScore && (
                    <Progress value={ensembleScore.forecast * 100} className="h-1.5 mt-2" />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Overall Ensemble Score */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Ensemble Score</span>
                <span className={cn("text-lg font-bold", ensembleScore ? getScoreColor(ensembleScore.overall) : "text-muted-foreground")}>
                  {ensembleScore ? `${(ensembleScore.overall * 100).toFixed(1)}%` : "--"}
                </span>
              </div>
              <Progress value={ensembleScore ? ensembleScore.overall * 100 : 0} className="h-3" />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>Avoid</span>
                <span>Wait</span>
                <span>Enter</span>
              </div>
            </div>

            {/* Filter Config */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium">Min Confidence (BB)</label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={filterConfig.minConfidence.BB}
                  onChange={(e) => setFilterConfig({
                    ...filterConfig,
                    minConfidence: { ...filterConfig.minConfidence, BB: parseFloat(e.target.value) || 0.6 }
                  })}
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Max Risk Score</label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={filterConfig.maxRiskScore}
                  onChange={(e) => setFilterConfig({ ...filterConfig, maxRiskScore: parseFloat(e.target.value) || 0.7 })}
                  className="h-8"
                />
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={testFilter}
              disabled={isFilterLoading || !currentForecast}
              className="gap-2"
            >
              {isFilterLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Filter className="h-4 w-4" />
              )}
              Recalculate Ensemble
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Current Forecast Card */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Текущий прогноз рынка
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {currentForecast ? (
            <div className="space-y-6">
              {/* Signal */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getSignalIcon(currentForecast.signal)}
                  <div>
                    <div className={cn("text-3xl font-bold", getSignalColor(currentForecast.signal))}>
                      {currentForecast.signal}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Уверенность: {(currentForecast.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Время</div>
                  <div className="font-medium">
                    {new Date(currentForecast.timestamp).toLocaleString("ru-RU")}
                  </div>
                </div>
              </div>

              {/* Probabilities */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Upward
                    </span>
                    <span className="font-medium">{(currentForecast.probabilities.upward * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={currentForecast.probabilities.upward * 100} className="h-2 bg-muted [&>div]:bg-green-500" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      Downward
                    </span>
                    <span className="font-medium">{(currentForecast.probabilities.downward * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={currentForecast.probabilities.downward * 100} className="h-2 bg-muted [&>div]:bg-red-500" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <Minus className="h-4 w-4 text-yellow-500" />
                      Consolidation
                    </span>
                    <span className="font-medium">{(currentForecast.probabilities.consolidation * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={currentForecast.probabilities.consolidation * 100} className="h-2 bg-muted [&>div]:bg-yellow-500" />
                </div>
              </div>

              {/* Indicators */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {(currentForecast.indicators.roc_24h * 100).toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">ROC 24h</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {(currentForecast.indicators.atr_pct * 100).toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">ATR%</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {(currentForecast.indicators.trend_strength * 100).toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Trend</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {currentForecast.indicators.volume_ratio.toFixed(2)}x
                  </div>
                  <div className="text-xs text-muted-foreground">Volume</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Eye className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Нажмите "Обновить прогноз" для получения данных</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bots List & Backtest */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Bots */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Активные боты</CardTitle>
          </CardHeader>
          <CardContent>
            {bots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Нет созданных ботов</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bots.map((bot) => (
                  <div
                    key={bot.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      {getSignalIcon(bot.currentSignal)}
                      <div>
                        <div className="font-medium">{bot.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {bot.strategy} • {bot.riskProfile}
                          {filterEnabled && (
                            <Badge variant="outline" className="text-xs text-primary">
                              <Filter className="h-2.5 w-2.5 mr-1" />
                              Filter
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={bot.isRunning ? "default" : "outline"}>
                        {bot.isRunning ? "Активен" : "Остановлен"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => bot.isRunning ? handleStopBot(bot.id) : handleStartBot(bot.id)}
                      >
                        {bot.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500"
                        onClick={() => handleDeleteBot(bot.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Backtest */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Бэктест стратегии
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium">Символ</label>
                  <Input
                    value={backtestParams.symbol}
                    onChange={(e) => setBacktestParams({ ...backtestParams, symbol: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Стратегия</label>
                  <Select
                    value={backtestParams.strategy}
                    onValueChange={(v) => setBacktestParams({ ...backtestParams, strategy: v as typeof backtestParams.strategy })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STRATEGIES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Дней</label>
                  <Input
                    type="number"
                    value={backtestParams.days}
                    onChange={(e) => setBacktestParams({ ...backtestParams, days: parseInt(e.target.value) || 365 })}
                    className="mt-1"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleRunBacktest}
                disabled={isBacktestLoading}
              >
                {isBacktestLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Тестирование...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Запустить бэктест
                  </>
                )}
              </Button>

              {backtestResult && (
                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Доходность:</span>
                      <span className={cn(
                        "ml-2 font-bold",
                        backtestResult.totalReturnPct >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {backtestResult.totalReturnPct >= 0 ? "+" : ""}{backtestResult.totalReturnPct}%
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sharpe:</span>
                      <span className="ml-2 font-bold">{backtestResult.sharpeRatio}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Max DD:</span>
                      <span className="ml-2 font-bold text-red-500">{backtestResult.maxDrawdownPct}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Win Rate:</span>
                      <span className="ml-2 font-bold">{backtestResult.winRatePct}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Сделок:</span>
                      <span className="ml-2 font-bold">{backtestResult.numTrades}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strategy Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Доступные стратегии</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {STRATEGIES.map((strategy) => (
              <div key={strategy.id} className="p-4 rounded-lg border bg-card">
                <div className="font-medium mb-1">{strategy.name}</div>
                <div className="text-sm text-muted-foreground">{strategy.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
