"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  Download,
  Settings,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileJson,
  Copy,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ==================== TYPES ====================

type SpaceType = "uniform" | "quniform" | "loguniform" | "categorical" | "normal";
type OptimizationMethod = "RANDOM" | "GRID" | "TPE" | "GENETIC" | "BAYESIAN" | "CMAES";
type OptimizationObjective = "sharpeRatio" | "sortinoRatio" | "totalPnl" | "winRate" | "profitFactor" | "maxDrawdown";
type HyperoptStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";

interface HyperoptParameter {
  id: string;
  name: string;
  space: SpaceType;
  min: number;
  max: number;
  step?: number;
  choices?: string;
  defaultValue: number | string;
  enabled: boolean;
}

interface HyperoptTrial {
  id: number;
  params: Record<string, number | string | boolean>;
  objectiveValue: number;
  status: "COMPLETED" | "FAILED" | "PRUNED";
  duration: number;
  trades: number;
  winRate: number;
  pnl: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

interface HyperoptResult {
  id: string;
  status: HyperoptStatus;
  progress: number;
  currentIteration: number;
  totalIterations: number;
  bestParams: Record<string, number | string | boolean>;
  bestObjectiveValue: number;
  trials: HyperoptTrial[];
  startedAt: Date | null;
  completedAt: Date | null;
  elapsedTime: number;
  statistics: {
    avgObjective: number;
    stdObjective: number;
    improvement: number;
    trialsWithoutImprovement: number;
  };
}

// ==================== DEFAULT STATE ====================

const DEFAULT_PARAMETER: Omit<HyperoptParameter, "id"> = {
  name: "",
  space: "uniform",
  min: 0,
  max: 100,
  step: 1,
  choices: "",
  defaultValue: 0,
  enabled: true,
};

const DEFAULT_RESULT: HyperoptResult = {
  id: "",
  status: "IDLE",
  progress: 0,
  currentIteration: 0,
  totalIterations: 0,
  bestParams: {},
  bestObjectiveValue: 0,
  trials: [],
  startedAt: null,
  completedAt: null,
  elapsedTime: 0,
  statistics: {
    avgObjective: 0,
    stdObjective: 0,
    improvement: 0,
    trialsWithoutImprovement: 0,
  },
};

// ==================== OBJECTIVE OPTIONS ====================

const OBJECTIVE_OPTIONS = [
  { value: "sharpeRatio", label: "Sharpe Ratio", icon: TrendingUp, description: "Доходность с поправкой на риск" },
  { value: "sortinoRatio", label: "Sortino Ratio", icon: Target, description: "Доходность с учётом нисходящего риска" },
  { value: "totalPnl", label: "Общий PnL", icon: BarChart3, description: "Общая прибыль/убыток" },
  { value: "winRate", label: "Win Rate", icon: Zap, description: "Процент прибыльных сделок" },
  { value: "profitFactor", label: "Profit Factor", icon: TrendingUp, description: "Валовая прибыль / валовый убыток" },
  { value: "maxDrawdown", label: "Мин. просадка", icon: TrendingDown, description: "Минимизировать максимальную просадку" },
] as const;

// ==================== METHOD OPTIONS ====================

const METHOD_OPTIONS = [
  { value: "TPE", label: "TPE", description: "Tree-structured Parzen Estimator (рекомендуется)" },
  { value: "RANDOM", label: "Случайный поиск", description: "Простой случайный перебор" },
  { value: "GRID", label: "Поиск по сетке", description: "Полный перебор по сетке" },
  { value: "GENETIC", label: "Генетический алгоритм", description: "Эволюционная оптимизация" },
  { value: "BAYESIAN", label: "Байесовская", description: "Оптимизация гауссовскими процессами" },
  { value: "CMAES", label: "CMA-ES", description: "Адаптация ковариационной матрицы" },
] as const;

// ==================== SPACE TYPE OPTIONS ====================

const SPACE_TYPE_OPTIONS = [
  { value: "uniform", label: "Равномерное", description: "Непрерывное равномерное распределение" },
  { value: "quniform", label: "Квантованное", description: "Дискретное равномерное с шагом" },
  { value: "loguniform", label: "Лог-равномерное", description: "Равномерное в логарифмическом масштабе" },
  { value: "categorical", label: "Категориальное", description: "Дискретные категории" },
  { value: "normal", label: "Нормальное", description: "Гауссово распределение" },
] as const;

// ==================== MAIN COMPONENT ====================

export function HyperoptPanel() {
  // Parameter state
  const [parameters, setParameters] = useState<HyperoptParameter[]>([
    {
      id: "1",
      name: "rsiPeriod",
      space: "quniform",
      min: 5,
      max: 30,
      step: 1,
      defaultValue: 14,
      enabled: true,
    },
    {
      id: "2",
      name: "rsiOverbought",
      space: "quniform",
      min: 60,
      max: 85,
      step: 1,
      defaultValue: 70,
      enabled: true,
    },
    {
      id: "3",
      name: "rsiOversold",
      space: "quniform",
      min: 15,
      max: 40,
      step: 1,
      defaultValue: 30,
      enabled: true,
    },
  ]);

  // Optimization settings
  const [method, setMethod] = useState<OptimizationMethod>("TPE");
  const [objective, setObjective] = useState<OptimizationObjective>("sharpeRatio");
  const [maxEvals, setMaxEvals] = useState(100);
  const [strategyId, setStrategyId] = useState("rsi-reversal");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [initialBalance, setInitialBalance] = useState(10000);

  // Constraints
  const [minTrades, setMinTrades] = useState(10);
  const [maxDrawdown, setMaxDrawdown] = useState(30);
  const [earlyStopping, setEarlyStopping] = useState(true);
  const [earlyStoppingPatience, setEarlyStoppingPatience] = useState(20);

  // Results state
  const [result, setResult] = useState<HyperoptResult>(DEFAULT_RESULT);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // UI state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedTrial, setSelectedTrial] = useState<HyperoptTrial | null>(null);

  // Timer for elapsed time
  useEffect(() => {
    if (isRunning && !isPaused && result.startedAt) {
      const interval = setInterval(() => {
        setResult(prev => ({
          ...prev,
          elapsedTime: Date.now() - (prev.startedAt?.getTime() || Date.now()),
        }));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isRunning, isPaused, result.startedAt]);

  // Parameter management
  const addParameter = useCallback(() => {
    const newParam: HyperoptParameter = {
      ...DEFAULT_PARAMETER,
      id: Date.now().toString(),
    };
    setParameters(prev => [...prev, newParam]);
  }, []);

  const removeParameter = useCallback((id: string) => {
    setParameters(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateParameter = useCallback((id: string, updates: Partial<HyperoptParameter>) => {
    setParameters(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  // Optimization controls
  const startOptimization = useCallback(async () => {
    if (parameters.filter(p => p.enabled && p.name).length === 0) {
      toast.error("Добавьте хотя бы один параметр для оптимизации");
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    
    const newResult: HyperoptResult = {
      id: `hyperopt-${Date.now()}`,
      status: "RUNNING",
      progress: 0,
      currentIteration: 0,
      totalIterations: maxEvals,
      bestParams: {},
      bestObjectiveValue: -Infinity,
      trials: [],
      startedAt: new Date(),
      completedAt: null,
      elapsedTime: 0,
      statistics: {
        avgObjective: 0,
        stdObjective: 0,
        improvement: 0,
        trialsWithoutImprovement: 0,
      },
    };
    setResult(newResult);

    try {
      // Call API to start optimization
      const response = await fetch("/api/hyperopt/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId,
          symbol,
          timeframe,
          initialBalance,
          method,
          objective,
          maxEvals,
          parameters: parameters.filter(p => p.enabled).map(p => ({
            name: p.name,
            space: p.space,
            min: p.min,
            max: p.max,
            q: p.step,
            choices: p.choices?.split(",").map(c => c.trim()),
            defaultValue: p.defaultValue,
          })),
          constraints: {
            minTrades,
            maxDrawdown,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start optimization");
      }

      const data = await response.json();

      if (data.success) {
        // Simulate progress updates
        await simulateProgressUpdates(newResult, data.result);
        toast.success("Оптимизация успешно завершена");
      } else {
        throw new Error(data.error || "Ошибка оптимизации");
      }
    } catch (error) {
      console.error("Hyperopt error:", error);
      toast.error(error instanceof Error ? error.message : "Ошибка оптимизации");
      setResult(prev => ({ ...prev, status: "FAILED" }));
    } finally {
      setIsRunning(false);
      setIsPaused(false);
    }
  }, [parameters, strategyId, symbol, timeframe, initialBalance, method, objective, maxEvals, minTrades, maxDrawdown]);

  // Simulate progress updates for demo
  const simulateProgressUpdates = async (initialResult: HyperoptResult, apiResult: any) => {
    const totalSteps = maxEvals;
    let currentResult = { ...initialResult };
    
    for (let i = 0; i < totalSteps; i++) {
      if (!isRunning) break;
      
      // Simulate trial completion
      const trial: HyperoptTrial = {
        id: i + 1,
        params: generateRandomParams(parameters),
        objectiveValue: 0.5 + Math.random() * 2,
        status: Math.random() > 0.1 ? "COMPLETED" : "FAILED",
        duration: Math.floor(Math.random() * 1000) + 200,
        trades: Math.floor(Math.random() * 100) + 10,
        winRate: 40 + Math.random() * 30,
        pnl: (Math.random() - 0.3) * 1000,
        sharpeRatio: 0.5 + Math.random() * 2,
        maxDrawdown: 5 + Math.random() * 25,
      };

      if (trial.status === "COMPLETED") {
        trial.objectiveValue = objective === "maxDrawdown" ? -trial.maxDrawdown : 
          objective === "winRate" ? trial.winRate :
          objective === "totalPnl" ? trial.pnl :
          trial.sharpeRatio;
      }

      currentResult = {
        ...currentResult,
        currentIteration: i + 1,
        progress: ((i + 1) / totalSteps) * 100,
        trials: [...currentResult.trials, trial],
        bestObjectiveValue: Math.max(currentResult.bestObjectiveValue, trial.objectiveValue),
        bestParams: trial.objectiveValue > currentResult.bestObjectiveValue ? trial.params : currentResult.bestParams,
      };

      setResult(currentResult);
      
      // Small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Set final result from API
    setResult(prev => ({
      ...prev,
      status: "COMPLETED",
      progress: 100,
      completedAt: new Date(),
      bestParams: apiResult.bestParams || prev.bestParams,
      bestObjectiveValue: apiResult.bestObjectiveValue || prev.bestObjectiveValue,
      statistics: apiResult.statistics || prev.statistics,
    }));
  };

  // Generate random parameters for simulation
  const generateRandomParams = (params: HyperoptParameter[]): Record<string, number | string | boolean> => {
    const result: Record<string, number | string | boolean> = {};
    for (const p of params.filter(p => p.enabled)) {
      if (p.space === "categorical" && p.choices) {
        const choices = p.choices.split(",").map(c => c.trim());
        result[p.name] = choices[Math.floor(Math.random() * choices.length)];
      } else {
        result[p.name] = p.min + Math.random() * (p.max - p.min);
        if (p.step) {
          result[p.name] = Math.round(result[p.name] as number / p.step) * p.step;
        }
      }
    }
    return result;
  };

  const pauseOptimization = useCallback(() => {
    setIsPaused(true);
    setResult(prev => ({ ...prev, status: "PAUSED" }));
    toast.info("Оптимизация приостановлена");
  }, []);

  const resumeOptimization = useCallback(() => {
    setIsPaused(false);
    setResult(prev => ({ ...prev, status: "RUNNING" }));
    toast.info("Оптимизация продолжена");
  }, []);

  const stopOptimization = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setResult(prev => ({ 
      ...prev, 
      status: "CANCELLED",
      completedAt: new Date(),
    }));
    toast.warning("Оптимизация остановлена");
  }, []);

  // Export functions
  const exportToJSON = useCallback((params: Record<string, number | string | boolean>, filename: string) => {
    const json = JSON.stringify(params, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Параметры экспортированы в JSON");
  }, []);

  const copyToClipboard = useCallback((params: Record<string, number | string | boolean>) => {
    navigator.clipboard.writeText(JSON.stringify(params, null, 2));
    toast.success("Параметры скопированы в буфер обмена");
  }, []);

  // Format time
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  // Get status badge
  const getStatusBadge = (status: HyperoptStatus) => {
    const styles: Record<HyperoptStatus, { color: string; icon: React.ReactNode; label: string }> = {
      IDLE: { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: <Clock className="h-3 w-3" />, label: "Готов" },
      RUNNING: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <RefreshCw className="h-3 w-3 animate-spin" />, label: "Выполнение" },
      PAUSED: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: <Pause className="h-3 w-3" />, label: "Пауза" },
      COMPLETED: { color: "bg-green-500/20 text-green-400 border-green-500/30", icon: <CheckCircle className="h-3 w-3" />, label: "Завершено" },
      CANCELLED: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3" />, label: "Отменено" },
      FAILED: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: <AlertTriangle className="h-3 w-3" />, label: "Ошибка" },
    };
    const { color, icon, label } = styles[status];
    return (
      <Badge variant="outline" className={cn("gap-1", color)}>
        {icon}
        {label}
      </Badge>
    );
  };

  // Get objective label
  const getObjectiveLabel = (obj: string): string => {
    return OBJECTIVE_OPTIONS.find(o => o.value === obj)?.label || obj;
  };

  // Sorted trials by objective
  const sortedTrials = [...result.trials]
    .filter(t => t.status === "COMPLETED")
    .sort((a, b) => b.objectiveValue - a.objectiveValue);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Оптимизация гиперпараметров
          </h2>
          <p className="text-sm text-muted-foreground">
            Оптимизация параметров стратегии с помощью продвинутых алгоритмов
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(result.status)}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Configuration */}
        <div className="xl:col-span-1 space-y-6">
          {/* Strategy Settings */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Настройки стратегии
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Стратегия</Label>
                  <Select value={strategyId} onValueChange={setStrategyId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rsi-reversal">RSI Reversal</SelectItem>
                      <SelectItem value="macd-crossover">MACD Crossover</SelectItem>
                      <SelectItem value="bb-bands">Bollinger Bands</SelectItem>
                      <SelectItem value="ema-cross">EMA Crossover</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Символ</Label>
                  <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Таймфрейм</Label>
                  <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5m">5 минут</SelectItem>
                      <SelectItem value="15m">15 минут</SelectItem>
                      <SelectItem value="1h">1 час</SelectItem>
                      <SelectItem value="4h">4 часа</SelectItem>
                      <SelectItem value="1d">1 день</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Начальный баланс</Label>
                  <Input 
                    type="number" 
                    value={initialBalance} 
                    onChange={(e) => setInitialBalance(Number(e.target.value))} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Optimization Settings */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Настройки оптимизации
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Objective Function */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Целевая функция</Label>
                <Select value={objective} onValueChange={(v) => setObjective(v as OptimizationObjective)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBJECTIVE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <opt.icon className="h-4 w-4" />
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {OBJECTIVE_OPTIONS.find(o => o.value === objective)?.description}
                </p>
              </div>

              {/* Method */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Метод оптимизации</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as OptimizationMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Max Evaluations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Макс. итераций</Label>
                  <Badge variant="outline">{maxEvals}</Badge>
                </div>
                <Slider
                  value={[maxEvals]}
                  onValueChange={([v]) => setMaxEvals(v)}
                  min={10}
                  max={500}
                  step={10}
                />
              </div>

              <Separator />

              {/* Constraints */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground">Ограничения</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Мин. сделок</Label>
                    <Input 
                      type="number" 
                      value={minTrades} 
                      onChange={(e) => setMinTrades(Number(e.target.value))}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Макс. просадка (%)</Label>
                    <Input 
                      type="number" 
                      value={maxDrawdown} 
                      onChange={(e) => setMaxDrawdown(Number(e.target.value))}
                      className="h-8"
                    />
                  </div>
                </div>
              </div>

              {/* Early Stopping */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm font-medium">Ранняя остановка</p>
                  <p className="text-xs text-muted-foreground">Остановить при отсутствии улучшений</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={earlyStopping}
                    onCheckedChange={setEarlyStopping}
                  />
                  {earlyStopping && (
                    <Input
                      type="number"
                      value={earlyStoppingPatience}
                      onChange={(e) => setEarlyStoppingPatience(Number(e.target.value))}
                      className="w-16 h-7 text-xs"
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Control Buttons */}
          <Card className="bg-card border-border">
            <CardContent className="pt-4">
              <div className="flex gap-2">
                {!isRunning ? (
                  <Button 
                    className="flex-1 gradient-primary text-background font-semibold"
                    onClick={startOptimization}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Начать оптимизацию
                  </Button>
                ) : (
                  <>
                    {isPaused ? (
                      <Button 
                        className="flex-1 gradient-primary text-background"
                        onClick={resumeOptimization}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Продолжить
                      </Button>
                    ) : (
                      <Button 
                        variant="outline"
                        className="flex-1"
                        onClick={pauseOptimization}
                      >
                        <Pause className="h-4 w-4 mr-2" />
                        Пауза
                      </Button>
                    )}
                    <Button 
                      variant="destructive"
                      onClick={stopOptimization}
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Columns: Parameters & Results */}
        <div className="xl:col-span-2 space-y-6">
          {/* Parameters Configuration */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Параметры для оптимизации
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addParameter}>
                  <Plus className="h-4 w-4 mr-1" />
                  Добавить параметр
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-64">
                <div className="space-y-3 pr-4">
                  {parameters.map((param, index) => (
                    <div 
                      key={param.id}
                      className={cn(
                        "p-3 rounded-lg border border-border bg-secondary/30",
                        !param.enabled && "opacity-50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Enable Toggle */}
                        <Switch
                          checked={param.enabled}
                          onCheckedChange={(v) => updateParameter(param.id, { enabled: v })}
                          className="mt-1"
                        />
                        
                        {/* Parameter Fields */}
                        <div className="flex-1 grid grid-cols-5 gap-2">
                          <div className="col-span-1">
                            <Label className="text-xs text-muted-foreground">Имя</Label>
                            <Input
                              value={param.name}
                              onChange={(e) => updateParameter(param.id, { name: e.target.value })}
                              placeholder="param"
                              className="h-8 mt-1"
                              disabled={!param.enabled}
                            />
                          </div>
                          
                          <div className="col-span-1">
                            <Label className="text-xs text-muted-foreground">Тип</Label>
                            <Select 
                              value={param.space} 
                              onValueChange={(v) => updateParameter(param.id, { space: v as SpaceType })}
                              disabled={!param.enabled}
                            >
                              <SelectTrigger className="h-8 mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SPACE_TYPE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <Label className="text-xs text-muted-foreground">Min</Label>
                            <Input
                              type="number"
                              value={param.min}
                              onChange={(e) => updateParameter(param.id, { min: Number(e.target.value) })}
                              className="h-8 mt-1"
                              disabled={!param.enabled || param.space === "categorical"}
                            />
                          </div>
                          
                          <div>
                            <Label className="text-xs text-muted-foreground">Max</Label>
                            <Input
                              type="number"
                              value={param.max}
                              onChange={(e) => updateParameter(param.id, { max: Number(e.target.value) })}
                              className="h-8 mt-1"
                              disabled={!param.enabled || param.space === "categorical"}
                            />
                          </div>
                          
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              {param.space === "categorical" ? "Варианты" : "По умолч."}
                            </Label>
                            {param.space === "categorical" ? (
                              <Input
                                value={param.choices}
                                onChange={(e) => updateParameter(param.id, { choices: e.target.value })}
                                placeholder="a,b,c"
                                className="h-8 mt-1"
                                disabled={!param.enabled}
                              />
                            ) : (
                              <Input
                                type="number"
                                value={param.defaultValue}
                                onChange={(e) => updateParameter(param.id, { defaultValue: Number(e.target.value) })}
                                className="h-8 mt-1"
                                disabled={!param.enabled}
                              />
                            )}
                          </div>
                        </div>
                        
                        {/* Remove Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeParameter(param.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  {parameters.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Нет настроенных параметров</p>
                      <p className="text-xs">Добавьте параметры для оптимизации</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Progress & Statistics */}
          {(isRunning || result.status !== "IDLE") && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Прогресс и статистика
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Итерация {result.currentIteration} / {result.totalIterations}
                    </span>
                    <span className="font-mono">{result.progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={result.progress} className="h-2" />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Прошло времени</p>
                    <p className="text-lg font-mono font-semibold">
                      {formatTime(result.elapsedTime)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Лучший {getObjectiveLabel(objective)}</p>
                    <p className="text-lg font-mono font-semibold text-green-500">
                      {result.bestObjectiveValue.toFixed(4)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Ср. значение</p>
                    <p className="text-lg font-mono font-semibold">
                      {result.statistics.avgObjective.toFixed(4)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Улучшение</p>
                    <p className="text-lg font-mono font-semibold text-primary">
                      +{result.statistics.improvement.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Best Parameters Preview */}
                {Object.keys(result.bestParams).length > 0 && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-green-500">Найдены лучшие параметры</p>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => copyToClipboard(result.bestParams)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Копировать
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => exportToJSON(result.bestParams, `hyperopt-best-${Date.now()}`)}
                        >
                          <FileJson className="h-3 w-3 mr-1" />
                          Экспорт
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(result.bestParams).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="bg-green-500/5">
                          {key}: <span className="font-mono ml-1">{typeof value === "number" ? value.toFixed(2) : value}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Results Table */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Результаты ({sortedTrials.length} тестов)
                </CardTitle>
                {sortedTrials.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-1" />
                        Экспорт
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => exportToJSON(result.bestParams, "best-params")}>
                        <FileJson className="h-4 w-4 mr-2" />
                        Лучшие параметры (JSON)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportToJSON(result.trials, "all-trials")}>
                        <FileJson className="h-4 w-4 mr-2" />
                        Все тесты (JSON)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-80">
                {sortedTrials.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Параметры</TableHead>
                        <TableHead className="text-right">Цель</TableHead>
                        <TableHead className="text-right">Сделки</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                        <TableHead className="text-right">PnL</TableHead>
                        <TableHead className="text-right">Sharpe</TableHead>
                        <TableHead className="text-right">Макс. DD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedTrials.slice(0, 50).map((trial, index) => (
                        <TableRow 
                          key={trial.id}
                          className={cn(
                            "cursor-pointer hover:bg-secondary/50",
                            index === 0 && "bg-green-500/5"
                          )}
                          onClick={() => setSelectedTrial(trial)}
                        >
                          <TableCell className="font-mono">
                            {index === 0 ? (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                #{trial.id}
                              </Badge>
                            ) : (
                              `#${trial.id}`
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {Object.entries(trial.params).slice(0, 3).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {key}: {typeof value === "number" ? value.toFixed(1) : value}
                                </Badge>
                              ))}
                              {Object.keys(trial.params).length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{Object.keys(trial.params).length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {trial.objectiveValue.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {trial.trades}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={trial.winRate >= 50 ? "text-green-500" : "text-red-500"}>
                              {trial.winRate.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={trial.pnl >= 0 ? "text-green-500" : "text-red-500"}>
                              {trial.pnl >= 0 ? "+" : ""}{trial.pnl.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={trial.sharpeRatio >= 1 ? "text-green-500" : "text-amber-500"}>
                              {trial.sharpeRatio.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={trial.maxDrawdown <= 20 ? "text-green-500" : trial.maxDrawdown <= 30 ? "text-amber-500" : "text-red-500"}>
                              {trial.maxDrawdown.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No results yet</p>
                    <p className="text-xs">Start an optimization to see results</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trial Details Dialog */}
      <Dialog open={!!selectedTrial} onOpenChange={() => setSelectedTrial(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Trial #{selectedTrial?.id} Details
            </DialogTitle>
            <DialogDescription>
              Complete parameter set and performance metrics
            </DialogDescription>
          </DialogHeader>
          
          {selectedTrial && (
            <div className="space-y-4">
              {/* Parameters */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Parameters</Label>
                <div className="p-3 rounded-lg bg-secondary/50 space-y-1">
                  {Object.entries(selectedTrial.params).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-mono">{typeof value === "number" ? value.toFixed(4) : String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Metrics */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Metrics</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Objective</p>
                    <p className="font-mono font-semibold">{selectedTrial.objectiveValue.toFixed(4)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Trades</p>
                    <p className="font-mono font-semibold">{selectedTrial.trades}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="font-mono font-semibold">{selectedTrial.winRate.toFixed(1)}%</p>
                  </div>
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">PnL</p>
                    <p className={cn("font-mono font-semibold", selectedTrial.pnl >= 0 ? "text-green-500" : "text-red-500")}>
                      {selectedTrial.pnl >= 0 ? "+" : ""}{selectedTrial.pnl.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Sharpe</p>
                    <p className="font-mono font-semibold">{selectedTrial.sharpeRatio.toFixed(2)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Max DD</p>
                    <p className="font-mono font-semibold text-red-500">{selectedTrial.maxDrawdown.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTrial(null)}>
              Close
            </Button>
            {selectedTrial && (
              <Button onClick={() => {
                exportToJSON(selectedTrial.params, `trial-${selectedTrial.id}-params`);
              }}>
                <Download className="h-4 w-4 mr-2" />
                Export Params
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default HyperoptPanel;
