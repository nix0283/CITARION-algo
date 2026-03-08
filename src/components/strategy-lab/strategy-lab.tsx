"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  FlaskConical,
  Play,
  Pause,
  Trash2,
  Plus,
  TrendingUp,
  TrendingDown,
  Loader2,
  Settings,
  Zap,
  Target,
  Shield,
  Clock,
  BarChart3,
  LineChart,
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Brain,
  Gauge,
  ArrowRight,
  FileText,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PREDEFINED_TACTICS_SETS, TacticsSet, EntryType, ExitType } from "@/lib/strategy/tactics/types";

// ==================== TYPES ====================

interface Strategy {
  id: string;
  name: string;
  description?: string;
  version: string;
  tags?: string[];
  parameters: StrategyParameter[];
}

interface StrategyParameter {
  name: string;
  description?: string;
  type: "number" | "integer" | "boolean" | "string" | "select";
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  category?: string;
}

interface BacktestResult {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  progress: number;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  initialBalance: number;
  finalBalance: number;
  finalEquity: number;
  dataInfo?: {
    source: string;
    candlesCount: number;
    exchange: string;
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate: string;
  };
  // ML Filter stats
  mlFilter?: {
    enabled: boolean;
    totalSignals: number;
    passedSignals: number;
    rejectedSignals: number;
    avgMLScore?: number;
    improvementPercent?: number;
  };
}

interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  avgPnl: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
}

interface BacktestTrade {
  id: string;
  direction: "LONG" | "SHORT";
  avgEntryPrice: number;
  avgExitPrice: number;
  pnl: number;
  pnlPercent: number;
  openedAt: Date;
  closedAt: Date;
  closeReason: string;
}

interface EquityPoint {
  timestamp: Date;
  balance: number;
  equity: number;
  drawdownPercent: number;
}

interface PaperTradingBot {
  id: string;
  name: string;
  status: "IDLE" | "RUNNING" | "PAUSED" | "STOPPED";
  strategyId: string;
  symbol: string;
  balance: number;
  equity: number;
  totalPnl: number;
  openPositions: number;
  tradesCount: number;
  winRate: number;
  startedAt?: Date;
  tacticsSetId: string;
}

interface HyperoptResult {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  progress: number;
  bestParams?: Record<string, number | string | boolean>;
  bestObjectiveValue?: number;
  trialsCount: number;
  completedTrials: number;
  dataInfo?: {
    source: string;
    candlesCount: number;
    exchange: string;
    symbol: string;
    timeframe: string;
  };
}

// ==================== CONSTANTS ====================

const TIMEFRAMES = [
  { id: "1m", name: "1 минута" },
  { id: "5m", name: "5 минут" },
  { id: "15m", name: "15 минут" },
  { id: "1h", name: "1 час" },
  { id: "4h", name: "4 часа" },
  { id: "1d", name: "1 день" },
];

const EXCHANGES = [
  { id: "binance", name: "Binance", supportsFutures: true },
  { id: "bybit", name: "Bybit", supportsFutures: true },
  { id: "okx", name: "OKX", supportsFutures: true },
  { id: "bitget", name: "Bitget", supportsFutures: true },
];

const OPTIMIZATION_OBJECTIVES = [
  { id: "sharpeRatio", name: "Sharpe Ratio" },
  { id: "totalPnl", name: "Общий PnL" },
  { id: "winRate", name: "Win Rate" },
  { id: "profitFactor", name: "Profit Factor" },
  { id: "maxDrawdown", name: "Мин. просадка" },
];

const OPTIMIZATION_METHODS = [
  { id: "RANDOM", name: "Случайный поиск" },
  { id: "GRID", name: "Поиск по сетке" },
  { id: "TPE", name: "TPE (Байесовская)" },
  { id: "GENETIC", name: "Генетический алгоритм" },
];

// ==================== MOCK DATA ====================

const MOCK_STRATEGIES: Strategy[] = [
  {
    id: "rsi-macd-strategy",
    name: "RSI + MACD Strategy",
    description: "Пересечение RSI и MACD для определения точек входа",
    version: "1.0.0",
    tags: ["trend", "momentum"],
    parameters: [
      { name: "rsiPeriod", type: "integer", defaultValue: 14, min: 5, max: 30, description: "Период RSI" },
      { name: "rsiOverbought", type: "integer", defaultValue: 70, min: 60, max: 90, description: "Уровень перекупленности" },
      { name: "rsiOversold", type: "integer", defaultValue: 30, min: 10, max: 40, description: "Уровень перепроданности" },
      { name: "macdFast", type: "integer", defaultValue: 12, min: 5, max: 20, description: "Быстрая EMA MACD" },
      { name: "macdSlow", type: "integer", defaultValue: 26, min: 15, max: 40, description: "Медленная EMA MACD" },
      { name: "macdSignal", type: "integer", defaultValue: 9, min: 5, max: 15, description: "Сигнальная линия" },
    ],
  },
  {
    id: "bb-reversal-strategy",
    name: "Bollinger Bands Reversal",
    description: "Торговля от границ Боллинджера с подтверждением",
    version: "1.0.0",
    tags: ["mean-reversion", "volatility"],
    parameters: [
      { name: "bbPeriod", type: "integer", defaultValue: 20, min: 10, max: 50, description: "Период BB" },
      { name: "bbStdDev", type: "number", defaultValue: 2.0, min: 1.0, max: 3.0, step: 0.1, description: "Стандартное отклонение" },
      { name: "confirmCandles", type: "integer", defaultValue: 2, min: 1, max: 5, description: "Свечи для подтверждения" },
    ],
  },
  {
    id: "ema-crossover-strategy",
    name: "EMA Crossover",
    description: "Пересечение экспоненциальных скользящих средних",
    version: "1.0.0",
    tags: ["trend", "simple"],
    parameters: [
      { name: "fastEma", type: "integer", defaultValue: 9, min: 5, max: 20, description: "Быстрая EMA" },
      { name: "slowEma", type: "integer", defaultValue: 21, min: 15, max: 50, description: "Медленная EMA" },
      { name: "useFilter", type: "boolean", defaultValue: true, description: "Фильтр по тренду" },
    ],
  },
];

// ==================== MAIN COMPONENT ====================

export function StrategyLab() {
  // State
  const [activeTab, setActiveTab] = useState("strategies");
  const [strategies] = useState<Strategy[]>(MOCK_STRATEGIES);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [strategyParams, setStrategyParams] = useState<Record<string, number | boolean | string>>({});
  
  // Tactics state
  const [selectedTactics, setSelectedTactics] = useState<TacticsSet>(PREDEFINED_TACTICS_SETS[0]);
  
  // Backtest state
  const [backtestSymbol, setBacktestSymbol] = useState("BTCUSDT");
  const [backtestTimeframe, setBacktestTimeframe] = useState("1h");
  const [backtestInitialBalance, setBacktestInitialBalance] = useState(10000);
  const [backtestDays, setBacktestDays] = useState(90);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const [backtestExchange, setBacktestExchange] = useState("binance");
  const [backtestMarketType, setBacktestMarketType] = useState<"spot" | "futures">("futures");
  
  // Paper Trading state
  const [paperBots, setPaperBots] = useState<PaperTradingBot[]>([]);
  const [isCreatingPaperBot, setIsCreatingPaperBot] = useState(false);
  const [showPaperBotDialog, setShowPaperBotDialog] = useState(false);
  
  // Hyperopt state
  const [hyperoptResult, setHyperoptResult] = useState<HyperoptResult | null>(null);
  const [isHyperoptRunning, setIsHyperoptRunning] = useState(false);
  const [hyperoptMethod, setHyperoptMethod] = useState("TPE");
  const [hyperoptObjective, setHyperoptObjective] = useState("sharpeRatio");
  const [hyperoptTrials, setHyperoptTrials] = useState(50);
  
  // ML Filter state
  const [useMLFilter, setUseMLFilter] = useState(true);
  const [mlMinScore, setMlMinScore] = useState(0.4);

  // Initialize strategy params when strategy changes
  useEffect(() => {
    if (selectedStrategy) {
      const params: Record<string, number | boolean | string> = {};
      selectedStrategy.parameters.forEach(p => {
        params[p.name] = p.defaultValue;
      });
      setStrategyParams(params);
    }
  }, [selectedStrategy]);

  // Run backtest
  const runBacktest = useCallback(async () => {
    if (!selectedStrategy) {
      toast.error("Выберите стратегию");
      return;
    }

    setIsBacktestRunning(true);
    setBacktestResult({
      id: `backtest-${Date.now()}`,
      status: "RUNNING",
      progress: 0,
      metrics: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        avgPnl: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        maxDrawdownPercent: 0,
      },
      trades: [],
      equityCurve: [],
      initialBalance: backtestInitialBalance,
      finalBalance: backtestInitialBalance,
      finalEquity: backtestInitialBalance,
    });

    try {
      const response = await fetch("/api/backtesting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: selectedStrategy.id,
          strategyParams,
          tacticsSet: selectedTactics,
          symbol: backtestSymbol,
          timeframe: backtestTimeframe,
          initialBalance: backtestInitialBalance,
          days: backtestDays,
          exchange: backtestExchange,
          marketType: backtestMarketType,
          // ML Filter settings
          useMLFilter,
          mlMinScore,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setBacktestResult(data.result);
        toast.success("Бэктест завершён!");
      } else {
        throw new Error(data.error || "Ошибка бэктеста");
      }
    } catch (error) {
      console.error("Backtest error:", error);
      // Simulate result for demo
      await new Promise(resolve => setTimeout(resolve, 2000));
      setBacktestResult({
        id: `backtest-${Date.now()}`,
        status: "COMPLETED",
        progress: 100,
        metrics: {
          totalTrades: 47,
          winningTrades: 29,
          losingTrades: 18,
          winRate: 61.7,
          totalPnl: 2345.67,
          totalPnlPercent: 23.46,
          avgPnl: 49.91,
          profitFactor: 1.89,
          sharpeRatio: 1.42,
          maxDrawdown: 1234.56,
          maxDrawdownPercent: 8.7,
        },
        trades: [],
        equityCurve: [],
        initialBalance: backtestInitialBalance,
        finalBalance: backtestInitialBalance + 2345.67,
        finalEquity: backtestInitialBalance + 2345.67,
        // ML Filter demo stats
        mlFilter: useMLFilter ? {
          enabled: true,
          totalSignals: 68,
          passedSignals: 47,
          rejectedSignals: 21,
          avgMLScore: 0.62,
          improvementPercent: useMLFilter ? 15.3 : 0, // Simulated improvement
        } : undefined,
      });
      toast.success("Бэктест завершён (демо)!");
    } finally {
      setIsBacktestRunning(false);
    }
  }, [selectedStrategy, strategyParams, selectedTactics, backtestSymbol, backtestTimeframe, backtestInitialBalance, backtestDays, backtestExchange, backtestMarketType, useMLFilter, mlMinScore]);

  // Create Paper Trading bot from backtest
  const createPaperBotFromBacktest = useCallback(async () => {
    if (!selectedStrategy) {
      toast.error("Сначала выберите стратегию");
      return;
    }

    setIsCreatingPaperBot(true);
    try {
      const response = await fetch("/api/paper-trading/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${selectedStrategy.name} Paper Bot`,
          strategyId: selectedStrategy.id,
          strategyParams,
          tacticsSet: selectedTactics,
          symbol: backtestSymbol,
          timeframe: backtestTimeframe,
          initialBalance: backtestInitialBalance,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setPaperBots(prev => [...prev, data.bot]);
        setShowPaperBotDialog(false);
        toast.success("Paper Trading бот создан!");
      } else {
        throw new Error(data.error || "Ошибка создания бота");
      }
    } catch (error) {
      // Simulate creation for demo
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newBot: PaperTradingBot = {
        id: `paper-bot-${Date.now()}`,
        name: `${selectedStrategy.name} Paper Bot`,
        status: "IDLE",
        strategyId: selectedStrategy.id,
        symbol: backtestSymbol,
        balance: backtestInitialBalance,
        equity: backtestInitialBalance,
        totalPnl: 0,
        openPositions: 0,
        tradesCount: 0,
        winRate: 0,
        tacticsSetId: selectedTactics.id,
      };
      setPaperBots(prev => [...prev, newBot]);
      setShowPaperBotDialog(false);
      toast.success("Paper Trading бот создан (демо)!");
    } finally {
      setIsCreatingPaperBot(false);
    }
  }, [selectedStrategy, strategyParams, selectedTactics, backtestSymbol, backtestTimeframe, backtestInitialBalance]);

  // Run hyperopt
  const runHyperopt = useCallback(async () => {
    if (!selectedStrategy) {
      toast.error("Выберите стратегию");
      return;
    }

    setIsHyperoptRunning(true);
    setHyperoptResult({
      id: `hyperopt-${Date.now()}`,
      status: "RUNNING",
      progress: 0,
      trialsCount: hyperoptTrials,
      completedTrials: 0,
    });

    try {
      const response = await fetch("/api/hyperopt/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: selectedStrategy.id,
          tacticsSet: selectedTactics,
          symbol: backtestSymbol,
          timeframe: backtestTimeframe,
          initialBalance: backtestInitialBalance,
          method: hyperoptMethod,
          objective: hyperoptObjective,
          maxEvals: hyperoptTrials,
          days: backtestDays,
          exchange: backtestExchange,
          marketType: backtestMarketType,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setHyperoptResult(data.result);
        toast.success("Оптимизация завершена!");
      } else {
        throw new Error(data.error || "Ошибка оптимизации");
      }
    } catch (error) {
      // Simulate optimization for demo
      await new Promise(resolve => setTimeout(resolve, 3000));
      setHyperoptResult({
        id: `hyperopt-${Date.now()}`,
        status: "COMPLETED",
        progress: 100,
        bestParams: {
          rsiPeriod: 12,
          rsiOverbought: 75,
          rsiOversold: 25,
          macdFast: 10,
          macdSlow: 24,
          macdSignal: 8,
        },
        bestObjectiveValue: 1.78,
        trialsCount: hyperoptTrials,
        completedTrials: hyperoptTrials,
      });
      toast.success("Оптимизация завершена (демо)!");
    } finally {
      setIsHyperoptRunning(false);
    }
  }, [selectedStrategy, selectedTactics, backtestSymbol, backtestTimeframe, backtestInitialBalance, hyperoptMethod, hyperoptObjective, hyperoptTrials, backtestDays]);

  // Render parameter input
  const renderParamInput = (param: StrategyParameter) => {
    const value = strategyParams[param.name] ?? param.defaultValue;

    switch (param.type) {
      case "integer":
      case "number":
        return (
          <div key={param.name} className="space-y-2">
            <div className="flex justify-between">
              <Label>{param.description || param.name}</Label>
              <Badge variant="outline">{String(value)}</Badge>
            </div>
            <Slider
              value={[Number(value)]}
              onValueChange={([v]) => setStrategyParams(prev => ({ ...prev, [param.name]: v }))}
              min={param.min}
              max={param.max}
              step={param.step || 1}
            />
          </div>
        );
      case "boolean":
        return (
          <div key={param.name} className="flex items-center justify-between">
            <Label>{param.description || param.name}</Label>
            <Switch
              checked={Boolean(value)}
              onCheckedChange={(checked) => setStrategyParams(prev => ({ ...prev, [param.name]: checked }))}
            />
          </div>
        );
      case "select":
        return (
          <div key={param.name} className="space-y-2">
            <Label>{param.description || param.name}</Label>
            <Select
              value={String(value)}
              onValueChange={(v) => setStrategyParams(prev => ({ ...prev, [param.name]: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {param.options?.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      default:
        return (
          <div key={param.name} className="space-y-2">
            <Label>{param.description || param.name}</Label>
            <Input
              value={String(value)}
              onChange={(e) => setStrategyParams(prev => ({ ...prev, [param.name]: e.target.value }))}
            />
          </div>
        );
    }
  };

  // Render tactics editor
  const renderTacticsEditor = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Выберите пресет тактик</Label>
        <Select
          value={selectedTactics.id}
          onValueChange={(id) => {
            const tactics = PREDEFINED_TACTICS_SETS.find(t => t.id === id);
            if (tactics) setSelectedTactics(tactics);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PREDEFINED_TACTICS_SETS.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Accordion type="multiple" className="w-full" defaultValue={["entry", "tp", "sl"]}>
        {/* Entry Tactics */}
        <AccordionItem value="entry">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <span>Вход в позицию</span>
              <Badge variant="outline" className="ml-2">{selectedTactics.entry.type}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Тип входа</Label>
                <Select
                  value={selectedTactics.entry.type}
                  onValueChange={(v) => setSelectedTactics(prev => ({
                    ...prev,
                    entry: { ...prev.entry, type: v as EntryType }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKET">Рыночный</SelectItem>
                    <SelectItem value="LIMIT">Лимитный</SelectItem>
                    <SelectItem value="BREAKOUT">Пробой</SelectItem>
                    <SelectItem value="PULLBACK">Откат</SelectItem>
                    <SelectItem value="DCA">DCA (усреднение)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Размер позиции</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={selectedTactics.entry.positionSizeValue}
                      onChange={(e) => setSelectedTactics(prev => ({
                        ...prev,
                        entry: { ...prev.entry, positionSizeValue: parseFloat(e.target.value) }
                      }))}
                    />
                    <Select
                      value={selectedTactics.entry.positionSize}
                      onValueChange={(v) => setSelectedTactics(prev => ({
                        ...prev,
                        entry: { ...prev.entry, positionSize: v as "PERCENT" | "FIXED" | "RISK_BASED" }
                      }))}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENT">%</SelectItem>
                        <SelectItem value="FIXED">USDT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {selectedTactics.entry.type === "DCA" && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Кол-во входов</Label>
                    <Input
                      type="number"
                      value={selectedTactics.entry.dcaCount || 5}
                      onChange={(e) => setSelectedTactics(prev => ({
                        ...prev,
                        entry: { ...prev.entry, dcaCount: parseInt(e.target.value) }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Шаг (%)</Label>
                    <Input
                      type="number"
                      value={selectedTactics.entry.dcaStep || 2}
                      onChange={(e) => setSelectedTactics(prev => ({
                        ...prev,
                        entry: { ...prev.entry, dcaStep: parseFloat(e.target.value) }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Множитель</Label>
                    <Input
                      type="number"
                      value={selectedTactics.entry.dcaSizeMultiplier || 1.5}
                      onChange={(e) => setSelectedTactics(prev => ({
                        ...prev,
                        entry: { ...prev.entry, dcaSizeMultiplier: parseFloat(e.target.value) }
                      }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Take Profit Tactics */}
        <AccordionItem value="tp">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" />
              <span>Take Profit</span>
              <Badge variant="outline" className="ml-2">{selectedTactics.takeProfit.type}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Тип TP</Label>
                <Select
                  value={selectedTactics.takeProfit.type}
                  onValueChange={(v) => setSelectedTactics(prev => ({
                    ...prev,
                    takeProfit: { ...prev.takeProfit, type: v as ExitType }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED_TP">Фиксированный</SelectItem>
                    <SelectItem value="MULTI_TP">Множественный</SelectItem>
                    <SelectItem value="TRAILING_STOP">Трейлинг</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedTactics.takeProfit.type === "FIXED_TP" && (
                <div className="space-y-2">
                  <Label>TP процент</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[selectedTactics.takeProfit.tpPercent || 3]}
                      onValueChange={([v]) => setSelectedTactics(prev => ({
                        ...prev,
                        takeProfit: { ...prev.takeProfit, tpPercent: v }
                      }))}
                      min={0.5}
                      max={20}
                      step={0.5}
                      className="flex-1"
                    />
                    <Badge variant="outline">{selectedTactics.takeProfit.tpPercent || 3}%</Badge>
                  </div>
                </div>
              )}

              {selectedTactics.takeProfit.type === "MULTI_TP" && selectedTactics.takeProfit.targets && (
                <div className="space-y-2">
                  <Label>Цели TP</Label>
                  <div className="space-y-2">
                    {selectedTactics.takeProfit.targets.map((target, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">TP{target.index}</Badge>
                        <span>{target.profitPercent}% прибыли</span>
                        <span className="text-muted-foreground">→</span>
                        <span>закрыть {target.closePercent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTactics.takeProfit.type === "TRAILING_STOP" && selectedTactics.takeProfit.trailingConfig && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Трейлинг %</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[selectedTactics.takeProfit.trailingConfig.percentValue || 2]}
                        onValueChange={([v]) => setSelectedTactics(prev => ({
                          ...prev,
                          takeProfit: {
                            ...prev.takeProfit,
                            trailingConfig: { ...prev.takeProfit.trailingConfig!, percentValue: v }
                          }
                        }))}
                        min={0.5}
                        max={10}
                        step={0.5}
                        className="flex-1"
                      />
                      <Badge variant="outline">{selectedTactics.takeProfit.trailingConfig.percentValue || 2}%</Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Активация при прибыли %</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[selectedTactics.takeProfit.trailingConfig.activationProfit || 1]}
                        onValueChange={([v]) => setSelectedTactics(prev => ({
                          ...prev,
                          takeProfit: {
                            ...prev.takeProfit,
                            trailingConfig: { ...prev.takeProfit.trailingConfig!, activationProfit: v }
                          }
                        }))}
                        min={0}
                        max={10}
                        step={0.5}
                        className="flex-1"
                      />
                      <Badge variant="outline">{selectedTactics.takeProfit.trailingConfig.activationProfit || 1}%</Badge>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Stop Loss Tactics */}
        <AccordionItem value="sl">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-500" />
              <span>Stop Loss</span>
              <Badge variant="outline" className="ml-2">{selectedTactics.stopLoss.type}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Тип SL</Label>
                <Select
                  value={selectedTactics.stopLoss.type}
                  onValueChange={(v) => setSelectedTactics(prev => ({
                    ...prev,
                    stopLoss: { ...prev.stopLoss, type: v as "FIXED" | "PERCENT" | "ATR_BASED" }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Процент</SelectItem>
                    <SelectItem value="FIXED">Фиксированная цена</SelectItem>
                    <SelectItem value="ATR_BASED">На основе ATR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedTactics.stopLoss.type === "PERCENT" && (
                <div className="space-y-2">
                  <Label>SL процент</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[selectedTactics.stopLoss.slPercent || 2]}
                      onValueChange={([v]) => setSelectedTactics(prev => ({
                        ...prev,
                        stopLoss: { ...prev.stopLoss, slPercent: v }
                      }))}
                      min={0.5}
                      max={15}
                      step={0.5}
                      className="flex-1"
                    />
                    <Badge variant="outline">{selectedTactics.stopLoss.slPercent || 2}%</Badge>
                  </div>
                </div>
              )}

              {selectedTactics.stopLoss.type === "ATR_BASED" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ATR множитель</Label>
                    <Input
                      type="number"
                      value={selectedTactics.stopLoss.atrMultiplier || 2}
                      onChange={(e) => setSelectedTactics(prev => ({
                        ...prev,
                        stopLoss: { ...prev.stopLoss, atrMultiplier: parseFloat(e.target.value) }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ATR период</Label>
                    <Input
                      type="number"
                      value={selectedTactics.stopLoss.atrPeriod || 14}
                      onChange={(e) => setSelectedTactics(prev => ({
                        ...prev,
                        stopLoss: { ...prev.stopLoss, atrPeriod: parseInt(e.target.value) }
                      }))}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Перевести в безубыток при прибыли %</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[selectedTactics.stopLoss.moveToBreakevenAfter || 0]}
                    onValueChange={([v]) => setSelectedTactics(prev => ({
                      ...prev,
                      stopLoss: { ...prev.stopLoss, moveToBreakevenAfter: v }
                    }))}
                    min={0}
                    max={10}
                    step={0.5}
                    className="flex-1"
                  />
                  <Badge variant="outline">{selectedTactics.stopLoss.moveToBreakevenAfter || 0}%</Badge>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );

  // Render backtest results
  const renderBacktestResults = () => {
    if (!backtestResult) return null;

    return (
      <div className="space-y-4">
        {/* Progress */}
        {backtestResult.status === "RUNNING" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Выполнение бэктеста...</span>
              <span>{backtestResult.progress.toFixed(1)}%</span>
            </div>
            <Progress value={backtestResult.progress} />
          </div>
        )}

        {/* Metrics */}
        {backtestResult.status === "COMPLETED" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Всего сделок</div>
                  <div className="text-2xl font-bold">{backtestResult.metrics.totalTrades}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                  <div className={cn(
                    "text-2xl font-bold",
                    backtestResult.metrics.winRate >= 50 ? "text-green-500" : "text-red-500"
                  )}>
                    {backtestResult.metrics.winRate.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Общий PnL</div>
                  <div className={cn(
                    "text-2xl font-bold",
                    backtestResult.metrics.totalPnl >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    ${backtestResult.metrics.totalPnl.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Макс. просадка</div>
                  <div className="text-2xl font-bold text-red-500">
                    {backtestResult.metrics.maxDrawdownPercent.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Profit Factor</div>
                  <div className={cn(
                    "text-xl font-bold",
                    backtestResult.metrics.profitFactor >= 1.5 ? "text-green-500" : ""
                  )}>
                    {backtestResult.metrics.profitFactor.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Sharpe Ratio</div>
                  <div className={cn(
                    "text-xl font-bold",
                    backtestResult.metrics.sharpeRatio >= 1 ? "text-green-500" : ""
                  )}>
                    {backtestResult.metrics.sharpeRatio.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Финальный баланс</div>
                  <div className={cn(
                    "text-xl font-bold",
                    backtestResult.finalBalance >= backtestResult.initialBalance ? "text-green-500" : "text-red-500"
                  )}>
                    ${backtestResult.finalBalance.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">Изменение</div>
                  <div className={cn(
                    "text-xl font-bold",
                    backtestResult.metrics.totalPnlPercent >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    {backtestResult.metrics.totalPnlPercent >= 0 ? "+" : ""}
                    {backtestResult.metrics.totalPnlPercent.toFixed(2)}%
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ML Filter Stats */}
            {backtestResult.mlFilter && backtestResult.mlFilter.enabled && (
              <Card className="bg-purple-500/5 border-purple-500/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="h-5 w-5 text-purple-500" />
                    <span className="font-semibold">ML Filter Результаты</span>
                    <Badge className="bg-purple-500/20 text-purple-500 border-purple-500/30">
                      +{backtestResult.mlFilter.improvementPercent?.toFixed(1)}% улучшение
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Всего сигналов</span>
                      <div className="font-semibold">{backtestResult.mlFilter.totalSignals}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Прошло ML</span>
                      <div className="font-semibold text-green-500">{backtestResult.mlFilter.passedSignals}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Отклонено</span>
                      <div className="font-semibold text-red-500">{backtestResult.mlFilter.rejectedSignals}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Средний ML Score</span>
                      <div className="font-semibold">{((backtestResult.mlFilter.avgMLScore || 0) * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    ML Filter отфильтровал {backtestResult.mlFilter.rejectedSignals} низкокачественных сигналов, 
                    что улучшило результаты бэктеста на ~{backtestResult.mlFilter.improvementPercent?.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Create Paper Bot Button */}
            <Button
              className="w-full"
              onClick={createPaperBotFromBacktest}
              disabled={isCreatingPaperBot}
            >
              {isCreatingPaperBot ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Создать Paper Trading бота из этого бэктеста
            </Button>

            {/* Data Source Info */}
            {backtestResult.dataInfo && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm">
                    {backtestResult.dataInfo.source === "real" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-muted-foreground">
                      {backtestResult.dataInfo.source === "real" 
                        ? `Реальные данные: ${backtestResult.dataInfo.candlesCount} свечей с ${EXCHANGES.find(e => e.id === backtestResult.dataInfo?.exchange)?.name || backtestResult.dataInfo.exchange}`
                        : "Демо-данные (мок)"
                      }
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{backtestResult.dataInfo.symbol}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{backtestResult.dataInfo.timeframe}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    );
  };

  // Render paper trading bots
  const renderPaperBots = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Активные Paper Trading боты</h3>
        <Dialog open={showPaperBotDialog} onOpenChange={setShowPaperBotDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Создать бота
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Создать Paper Trading бота</DialogTitle>
              <DialogDescription>
                Настройте параметры виртуальной торговли
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Стратегия</Label>
                <Select
                  value={selectedStrategy?.id || ""}
                  onValueChange={(id) => {
                    const s = strategies.find(s => s.id === id);
                    setSelectedStrategy(s || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите стратегию" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Символ</Label>
                <Input
                  value={backtestSymbol}
                  onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label>Начальный баланс</Label>
                <Input
                  type="number"
                  value={backtestInitialBalance}
                  onChange={(e) => setBacktestInitialBalance(parseInt(e.target.value))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaperBotDialog(false)}>
                Отмена
              </Button>
              <Button onClick={createPaperBotFromBacktest} disabled={isCreatingPaperBot}>
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {paperBots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Нет активных Paper Trading ботов</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Запустите бэктест и создайте бота для виртуальной торговли
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {paperBots.map(bot => (
            <Card key={bot.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{bot.name}</h4>
                      <Badge className={cn(
                        bot.status === "RUNNING" ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-500"
                      )}>
                        {bot.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{bot.symbol}</span>
                      <span>•</span>
                      <span>Баланс: ${bot.balance.toFixed(2)}</span>
                      <span>•</span>
                      <span>Позиции: {bot.openPositions}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn(
                        "font-medium",
                        bot.totalPnl >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        PnL: ${bot.totalPnl.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">
                        Win Rate: {bot.winRate.toFixed(1)}%
                      </span>
                      <span className="text-muted-foreground">
                        Сделок: {bot.tradesCount}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {bot.status === "RUNNING" ? (
                      <Button variant="outline" size="sm">
                        <Pause className="h-4 w-4 mr-1" />
                        Пауза
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm">
                        <Play className="h-4 w-4 mr-1" />
                        Запуск
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // Render hyperopt
  const renderHyperopt = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Оптимизация параметров
          </CardTitle>
          <CardDescription>
            Автоматический подбор параметров стратегии для максимальной эффективности
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Метод оптимизации</Label>
              <Select value={hyperoptMethod} onValueChange={setHyperoptMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPTIMIZATION_METHODS.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Целевая метрика</Label>
              <Select value={hyperoptObjective} onValueChange={setHyperoptObjective}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPTIMIZATION_OBJECTIVES.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Количество итераций</Label>
              <Badge variant="outline">{hyperoptTrials}</Badge>
            </div>
            <Slider
              value={[hyperoptTrials]}
              onValueChange={([v]) => setHyperoptTrials(v)}
              min={10}
              max={200}
              step={10}
            />
          </div>

          <Button
            className="w-full"
            onClick={runHyperopt}
            disabled={isHyperoptRunning || !selectedStrategy}
          >
            {isHyperoptRunning ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isHyperoptRunning ? "Оптимизация..." : "Запустить оптимизацию"}
          </Button>
        </CardContent>
      </Card>

      {/* Hyperopt Results */}
      {hyperoptResult && (
        <Card>
          <CardHeader>
            <CardTitle>Результаты оптимизации</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hyperoptResult.status === "RUNNING" && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Прогресс оптимизации...</span>
                  <span>{hyperoptResult.completedTrials}/{hyperoptResult.trialsCount}</span>
                </div>
                <Progress value={(hyperoptResult.completedTrials / hyperoptResult.trialsCount) * 100} />
              </div>
            )}

            {hyperoptResult.status === "COMPLETED" && hyperoptResult.bestParams && (
              <>
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-semibold text-green-500">Лучший результат найден</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Objective Value: <span className="font-medium text-foreground">
                      {hyperoptResult.bestObjectiveValue?.toFixed(4)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Лучшие параметры</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(hyperoptResult.bestParams).map(([key, value]) => (
                      <div key={key} className="flex justify-between p-2 rounded bg-muted/50">
                        <span className="text-sm">{key}</span>
                        <span className="text-sm font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStrategyParams(hyperoptResult.bestParams || {})}
                  >
                    Применить параметры
                  </Button>
                  <Button className="flex-1" onClick={runBacktest}>
                    Запустить бэктест
                  </Button>
                </div>

                {/* Data Source Info */}
                {hyperoptResult.dataInfo && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                    {hyperoptResult.dataInfo.source === "real" || hyperoptResult.dataInfo.source === "database" || hyperoptResult.dataInfo.source === "exchange" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    <span>
                      {hyperoptResult.dataInfo.source === "real" || hyperoptResult.dataInfo.source === "database" || hyperoptResult.dataInfo.source === "exchange"
                        ? `Реальные данные: ${hyperoptResult.dataInfo.candlesCount} свечей`
                        : "Демо-данные"
                      }
                    </span>
                    <span>•</span>
                    <span>{EXCHANGES.find(e => e.id === hyperoptResult.dataInfo?.exchange)?.name || hyperoptResult.dataInfo.exchange}</span>
                    <span>•</span>
                    <span>{hyperoptResult.dataInfo.symbol}</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Main render
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            Strategy Lab
          </h2>
          <p className="text-muted-foreground">
            Создание, тестирование и оптимизация торговых стратегий
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="strategies">
            <FileText className="h-4 w-4 mr-2" />
            Стратегии
          </TabsTrigger>
          <TabsTrigger value="backtest">
            <BarChart3 className="h-4 w-4 mr-2" />
            Бэктест
          </TabsTrigger>
          <TabsTrigger value="paper">
            <Activity className="h-4 w-4 mr-2" />
            Paper Trading
          </TabsTrigger>
          <TabsTrigger value="hyperopt">
            <Brain className="h-4 w-4 mr-2" />
            Оптимизация
          </TabsTrigger>
        </TabsList>

        {/* Strategies Tab */}
        <TabsContent value="strategies" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Strategy Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Выбор стратегии</CardTitle>
                <CardDescription>
                  Выберите стратегию и настройте параметры
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Стратегия</Label>
                  <Select
                    value={selectedStrategy?.id || ""}
                    onValueChange={(id) => {
                      const s = strategies.find(s => s.id === id);
                      setSelectedStrategy(s || null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите стратегию" />
                    </SelectTrigger>
                    <SelectContent>
                      {strategies.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <span>{s.name}</span>
                            {s.tags?.map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedStrategy && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {selectedStrategy.description}
                    </p>

                    <div className="space-y-4 pt-4 border-t">
                      <h4 className="font-medium">Параметры стратегии</h4>
                      {selectedStrategy.parameters.map(renderParamInput)}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Tactics Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Тактики</CardTitle>
                <CardDescription>
                  Настройка входа, выхода и управления позицией
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderTacticsEditor()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Backtest Tab */}
        <TabsContent value="backtest" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Backtest Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Настройки бэктеста</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Символ</Label>
                  <Input
                    value={backtestSymbol}
                    onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())}
                    placeholder="BTCUSDT"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Таймфрейм</Label>
                  <Select value={backtestTimeframe} onValueChange={setBacktestTimeframe}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEFRAMES.map(tf => (
                        <SelectItem key={tf.id} value={tf.id}>{tf.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Биржа</Label>
                    <Select value={backtestExchange} onValueChange={setBacktestExchange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXCHANGES.map(ex => (
                          <SelectItem key={ex.id} value={ex.id}>{ex.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Тип рынка</Label>
                    <Select value={backtestMarketType} onValueChange={(v) => setBacktestMarketType(v as "spot" | "futures")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="futures">Futures</SelectItem>
                        <SelectItem value="spot">Spot</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Период (дней)</Label>
                  <Input
                    type="number"
                    value={backtestDays}
                    onChange={(e) => setBacktestDays(parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Начальный баланс (USDT)</Label>
                  <Input
                    type="number"
                    value={backtestInitialBalance}
                    onChange={(e) => setBacktestInitialBalance(parseInt(e.target.value))}
                  />
                </div>

                {/* ML Filter Settings */}
                <div className="space-y-3 pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      <Label className="font-medium">ML Filter</Label>
                    </div>
                    <Switch
                      checked={useMLFilter}
                      onCheckedChange={setUseMLFilter}
                    />
                  </div>
                  
                  {useMLFilter && (
                    <div className="space-y-2 pl-6">
                      <div className="flex justify-between">
                        <Label className="text-sm text-muted-foreground">Мин. ML Score</Label>
                        <Badge variant="outline">{(mlMinScore * 100).toFixed(0)}%</Badge>
                      </div>
                      <Slider
                        value={[mlMinScore]}
                        onValueChange={([v]) => setMlMinScore(v)}
                        min={0.1}
                        max={0.9}
                        step={0.05}
                      />
                      <p className="text-xs text-muted-foreground">
                        Сигналы с ML Score ниже этого значения будут отфильтрованы
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={runBacktest}
                  disabled={isBacktestRunning || !selectedStrategy}
                >
                  {isBacktestRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {isBacktestRunning ? "Выполнение..." : "Запустить бэктест"}
                </Button>
              </CardContent>
            </Card>

            {/* Backtest Results */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Результаты бэктеста</CardTitle>
                </CardHeader>
                <CardContent>
                  {backtestResult ? renderBacktestResults() : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground">Запустите бэктест для просмотра результатов</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Paper Trading Tab */}
        <TabsContent value="paper" className="space-y-4">
          {renderPaperBots()}
        </TabsContent>

        {/* Hyperopt Tab */}
        <TabsContent value="hyperopt" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Текущая стратегия</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedStrategy ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{selectedStrategy.name}</span>
                        {selectedStrategy.tags?.map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground">{selectedStrategy.description}</p>
                      <div className="pt-2">
                        <Label className="text-xs text-muted-foreground">Текущие параметры</Label>
                        <div className="grid grid-cols-2 gap-1 mt-1">
                          {Object.entries(strategyParams).slice(0, 6).map(([key, value]) => (
                            <div key={key} className="text-xs p-1 rounded bg-muted/30">
                              {key}: {String(value)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Выберите стратегию во вкладке "Стратегии"</p>
                  )}
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Текущие тактики</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Вход: {selectedTactics.entry.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-green-500" />
                      <span className="text-sm">TP: {selectedTactics.takeProfit.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-500" />
                      <span className="text-sm">SL: {selectedTactics.stopLoss.type}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              {renderHyperopt()}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
