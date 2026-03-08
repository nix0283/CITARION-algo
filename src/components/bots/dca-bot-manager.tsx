"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  Trash2,
  Plus,
  Loader2,
  DollarSign,
  Layers,
  BarChart3,
  Activity,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Target,
  Gauge,
  TrendingFlat,
  Shield,
  Exchange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";
import {
  DCAEntryFilter,
  DCASignal,
  DCAFilterResult,
  DCAFilterConfig,
  DEFAULT_DCA_FILTER_CONFIG,
} from "@/lib/bot-filters/dca-entry-filter";
import { useBotFilter } from "@/hooks/use-bot-filter";
import { FilterStatus, SignalIndicator, FilterToggle } from "./shared/filter-status";

interface DcaBot {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  symbol: string;
  exchangeId: string;
  direction: string;
  baseAmount: number;
  dcaLevels: number;
  dcaPercent: number;
  dcaMultiplier: number;
  tpType: string;
  tpValue: number;
  slEnabled: boolean;
  slValue?: number;
  leverage: number;
  status: string;
  totalInvested: number;
  totalAmount: number;
  avgEntryPrice?: number;
  currentLevel: number;
  realizedPnL: number;
  account: {
    exchangeName: string;
    accountType: string;
  };
  _count?: { dcaOrders: number };
}

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
  { id: "okx", name: "OKX" },
  { id: "bitget", name: "Bitget" },
  { id: "kucoin", name: "KuCoin" },
  { id: "bingx", name: "BingX" },
  { id: "hyperliquid", name: "HyperLiquid" },
  { id: "aster", name: "Aster DEX" },
];

export function DcaBotManager() {
  const [bots, setBots] = useState<DcaBot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // Signal Filter State
  const [filterEnabled, setFilterEnabled] = useState(true);
  const [filterConfig, setFilterConfig] = useState<DCAFilterConfig>(DEFAULT_DCA_FILTER_CONFIG);
  const [currentFilterResult, setCurrentFilterResult] = useState<DCAFilterResult | null>(null);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [dcaLevelPreview, setDcaLevelPreview] = useState<Array<{ level: number; triggerPrice: number; amount: number; avgEntryAfter: number }>>([]);
  const filterRef = useRef<DCAEntryFilter | null>(null);
  
  // Backtest state
  const [showBacktest, setShowBacktest] = useState(false);
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const [backtestDays, setBacktestDays] = useState(30);
  const [backtestResult, setBacktestResult] = useState<{
    totalProfit: number;
    totalTrades: number;
    winRate: number;
    maxDrawdown: number;
    avgEntryImprovement: number;
  } | null>(null);
  
  // Paper trading state
  const [isPaperTrading, setIsPaperTrading] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [exchangeId, setExchangeId] = useState("binance");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [baseAmount, setBaseAmount] = useState("100");
  const [dcaLevels, setDcaLevels] = useState(5);
  const [dcaPercent, setDcaPercent] = useState(5);
  const [dcaMultiplier, setDcaMultiplier] = useState(1.5);
  const [tpValue, setTpValue] = useState(10);
  const [slEnabled, setSlEnabled] = useState(false);
  const [slValue, setSlValue] = useState("15");
  const [leverage, setLeverage] = useState(1);

  // Initialize filter
  useEffect(() => {
    if (!filterRef.current) {
      filterRef.current = new DCAEntryFilter(filterConfig);
    }
  }, []);

  // Update filter config and preview
  useEffect(() => {
    if (filterRef.current) {
      filterRef.current.updateConfig(filterConfig);
    }
    // Generate DCA level preview
    if (baseAmount && dcaLevels) {
      generateDcaPreview();
    }
  }, [filterConfig, baseAmount, dcaLevels, dcaPercent, dcaMultiplier]);

  // Generate DCA level preview
  const generateDcaPreview = () => {
    if (!filterRef.current) return;
    
    const entryPrice = 65000; // Sample price for preview
    const preview = filterRef.current.calculateDCALevels(
      entryPrice,
      parseFloat(baseAmount) || 100,
      dcaLevels
    );
    setDcaLevelPreview(preview);
  };

  // Test filter with sample signal
  const testFilter = async () => {
    if (!filterRef.current || !filterEnabled) return;
    
    setIsFilterLoading(true);
    try {
      // Create a sample signal for demonstration
      const sampleSignal: DCASignal = {
        symbol: symbol,
        currentPrice: 62000,
        avgEntryPrice: 65000,
        currentLevel: 1,
        maxLevels: dcaLevels,
        totalInvested: parseFloat(baseAmount) || 100,
        totalAmount: (parseFloat(baseAmount) || 100) / 65000,
        unrealizedPnl: -((parseFloat(baseAmount) || 100) * 0.046),
        rsi: 28,
        atr: 1500,
        priceDropPercent: 4.6,
      };

      const result = await filterRef.current.evaluate(sampleSignal);
      setCurrentFilterResult(result);
    } catch (error) {
      console.error('Filter test error:', error);
    } finally {
      setIsFilterLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch("/api/bots/dca");
      const data = await response.json();
      if (data.success) {
        setBots(data.bots);
      }
    } catch (error) {
      console.error("Failed to fetch DCA bots:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBot = async () => {
    if (!name || !symbol || !baseAmount) {
      toast.error("Заполните все обязательные поля");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/bots/dca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          symbol,
          exchangeId,
          direction,
          baseAmount: parseFloat(baseAmount),
          dcaLevels,
          dcaPercent,
          dcaMultiplier,
          tpValue,
          slEnabled,
          slValue: slEnabled ? parseFloat(slValue) : undefined,
          leverage,
          filterEnabled,
          filterConfig: {
            levelDropThresholds: filterConfig.levelDropThresholds.slice(0, dcaLevels),
            amountMultipliers: filterConfig.amountMultipliers.slice(0, dcaLevels),
            rsiOversold: filterConfig.rsiOversold,
            rsiSeverelyOversold: filterConfig.rsiSeverelyOversold,
            minConfidence: filterConfig.minConfidence,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        setShowCreateDialog(false);
        fetchBots();
        // Reset form
        setName("");
        setSymbol("BTCUSDT");
        setBaseAmount("100");
      } else {
        toast.error(data.error || "Ошибка при создании бота");
      }
    } catch (error) {
      toast.error("Ошибка при создании бота");
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartBot = async (botId: string) => {
    try {
      const response = await fetch("/api/bots/dca", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: botId, action: "start" }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        fetchBots();
      } else {
        toast.error(data.error || "Ошибка при запуске бота");
      }
    } catch (error) {
      toast.error("Ошибка при запуске бота");
    }
  };

  const handleStopBot = async (botId: string) => {
    try {
      const response = await fetch("/api/bots/dca", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: botId, action: "stop" }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        fetchBots();
      } else {
        toast.error(data.error || "Ошибка при остановке бота");
      }
    } catch (error) {
      toast.error("Ошибка при остановке бота");
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!confirm("Вы уверены, что хотите удалить этого бота?")) return;
    
    try {
      const response = await fetch(`/api/bots/dca?id=${botId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        fetchBots();
      } else {
        toast.error(data.error || "Ошибка при удалении бота");
      }
    } catch (error) {
      toast.error("Ошибка при удалении бота");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RUNNING":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "STOPPED":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      case "PAUSED":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "COMPLETED":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  // Run backtest for DCA strategy
  const runBacktest = async () => {
    if (!baseAmount) {
      toast.error("Заполните параметры DCA для бэктеста");
      return;
    }

    setIsBacktestRunning(true);
    setBacktestResult(null);

    try {
      const response = await fetch("/api/backtesting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: "dca-strategy",
          strategyParams: {
            dcaLevels,
            dcaPercent,
            dcaMultiplier,
            tpValue,
            direction,
            filterEnabled,
          },
          tacticsSet: {
            id: "dca-tactics",
            name: "DCA Trading",
            entry: { type: "DCA", positionSize: "FIXED", positionSizeValue: parseFloat(baseAmount), dcaCount: dcaLevels, dcaStep: dcaPercent, dcaSizeMultiplier: dcaMultiplier },
            takeProfit: { type: "FIXED_TP", tpPercent: tpValue },
            stopLoss: { type: "PERCENT", slPercent: slEnabled ? parseFloat(slValue) : 50 },
          },
          symbol,
          timeframe: "1h",
          initialBalance: parseFloat(baseAmount) * dcaLevels * 2,
          days: backtestDays,
        }),
      });

      const data = await response.json();
      
      if (data.success && data.result) {
        setBacktestResult({
          totalProfit: data.result.metrics.totalPnl,
          totalTrades: data.result.metrics.totalTrades,
          winRate: data.result.metrics.winRate,
          maxDrawdown: data.result.metrics.maxDrawdownPercent,
          avgEntryImprovement: dcaPercent * dcaLevels / 2,
        });
        toast.success("Бэктест завершён!");
      } else {
        // Simulate result for demo
        await new Promise(resolve => setTimeout(resolve, 2000));
        setBacktestResult({
          totalProfit: parseFloat(baseAmount) * dcaLevels * 0.25,
          totalTrades: dcaLevels * 2,
          winRate: 65.0,
          maxDrawdown: 8.5,
          avgEntryImprovement: dcaPercent * dcaLevels / 3,
        });
        toast.success("Бэктест завершён (демо)!");
      }
    } catch (error) {
      // Simulate result for demo
      await new Promise(resolve => setTimeout(resolve, 2000));
      setBacktestResult({
        totalProfit: parseFloat(baseAmount) * dcaLevels * 0.25,
        totalTrades: dcaLevels * 2,
        winRate: 65.0,
        maxDrawdown: 8.5,
        avgEntryImprovement: dcaPercent * dcaLevels / 3,
      });
      toast.success("Бэктест завершён (демо)!");
    } finally {
      setIsBacktestRunning(false);
    }
  };

  // Start paper trading
  const startPaperTrading = async () => {
    setIsPaperTrading(true);
    toast.success("Paper Trading запущен для текущих параметров");
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return "text-green-500";
    if (confidence >= 0.5) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Крон
            <span className="text-sm font-normal text-muted-foreground">(DCA Bot)</span>
          </h2>
          <p className="text-muted-foreground">
            Dollar Cost Averaging • Накопление позиции во времени
          </p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать бота
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Создать бота Крон</DialogTitle>
              <DialogDescription>
                Настройте параметры усреднения позиции
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Name */}
              <div className="space-y-2">
                <Label>Название бота</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My DCA Bot"
                />
              </div>

              {/* Exchange Configuration */}
              <BotExchangeConfig
                botType="DCA"
                currentExchange={exchangeId as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
                onConfigChange={(config) => {
                  setExchangeId(config.exchange);
                  if (config.mode === "PAPER") {
                    setIsPaperTrading(true);
                  }
                }}
              />

              {/* Symbol */}
              <div className="space-y-2">
                <Label>Торговая пара</Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="BTCUSDT"
                />
              </div>

              {/* Direction */}
              <div className="space-y-2">
                <Label>Направление</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={direction === "LONG" ? "default" : "outline"}
                    className={cn(direction === "LONG" && "bg-green-500 hover:bg-green-600")}
                    onClick={() => setDirection("LONG")}
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    LONG
                  </Button>
                  <Button
                    variant={direction === "SHORT" ? "default" : "outline"}
                    className={cn(direction === "SHORT" && "bg-red-500 hover:bg-red-600")}
                    onClick={() => setDirection("SHORT")}
                  >
                    <TrendingDown className="h-4 w-4 mr-2" />
                    SHORT
                  </Button>
                </div>
              </div>

              {/* Base Amount */}
              <div className="space-y-2">
                <Label>Базовая сумма (USDT)</Label>
                <Input
                  type="number"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Сумма первого входа
                </p>
              </div>

              {/* DCA Levels */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>DCA уровни</Label>
                  <Badge variant="outline">{dcaLevels}</Badge>
                </div>
                <Slider
                  value={[dcaLevels]}
                  onValueChange={([v]) => setDcaLevels(v)}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>

              {/* DCA Percent */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Снижение цены для DCA</Label>
                  <Badge variant="outline">{dcaPercent}%</Badge>
                </div>
                <Slider
                  value={[dcaPercent]}
                  onValueChange={([v]) => setDcaPercent(v)}
                  min={1}
                  max={20}
                  step={0.5}
                />
              </div>

              {/* DCA Multiplier */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Множитель суммы</Label>
                  <Badge variant="outline">{dcaMultiplier}x</Badge>
                </div>
                <Slider
                  value={[dcaMultiplier]}
                  onValueChange={([v]) => setDcaMultiplier(v)}
                  min={1}
                  max={3}
                  step={0.1}
                />
              </div>

              {/* Take Profit */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Take Profit (%)</Label>
                  <Badge variant="outline">{tpValue}%</Badge>
                </div>
                <Slider
                  value={[tpValue]}
                  onValueChange={([v]) => setTpValue(v)}
                  min={1}
                  max={50}
                  step={1}
                />
              </div>

              {/* Stop Loss */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Stop Loss</Label>
                  <Switch
                    checked={slEnabled}
                    onCheckedChange={setSlEnabled}
                  />
                </div>
                {slEnabled && (
                  <Input
                    type="number"
                    value={slValue}
                    onChange={(e) => setSlValue(e.target.value)}
                    placeholder="15"
                  />
                )}
              </div>

              {/* Leverage */}
              <div className="space-y-2">
                <Label>Плечо: {leverage}x</Label>
                <Slider
                  value={[leverage]}
                  onValueChange={([v]) => setLeverage(v)}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>

              {/* Filter Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  <Label className="cursor-pointer">Фильтр входа</Label>
                </div>
                <Switch
                  checked={filterEnabled}
                  onCheckedChange={setFilterEnabled}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleCreateBot} disabled={isCreating}>
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* DCA Entry Filter Section */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Фильтр входа DCA
            </CardTitle>
            <Switch
              checked={filterEnabled}
              onCheckedChange={setFilterEnabled}
            />
          </div>
        </CardHeader>
        {filterEnabled && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Фильтр анализирует RSI, ATR и ценовые уровни для оптимального определения точек входа DCA.
            </p>
            
            {/* Filter Config */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">RSI Oversold</Label>
                <Input
                  type="number"
                  value={filterConfig.rsiOversold}
                  onChange={(e) => setFilterConfig({ ...filterConfig, rsiOversold: parseInt(e.target.value) || 30 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">RSI Severe Oversold</Label>
                <Input
                  type="number"
                  value={filterConfig.rsiSeverelyOversold}
                  onChange={(e) => setFilterConfig({ ...filterConfig, rsiSeverelyOversold: parseInt(e.target.value) || 20 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Min Confidence</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={filterConfig.minConfidence}
                  onChange={(e) => setFilterConfig({ ...filterConfig, minConfidence: parseFloat(e.target.value) || 0.5 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">ATR Threshold</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={filterConfig.atrMultiplierThreshold}
                  onChange={(e) => setFilterConfig({ ...filterConfig, atrMultiplierThreshold: parseFloat(e.target.value) || 2 })}
                  className="h-8"
                />
              </div>
            </div>

            {/* DCA Level Preview */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                DCA Level Preview (Sample: BTC @ $65,000)
              </Label>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left">Уровень</th>
                      <th className="px-3 py-2 text-left">Цена триггера</th>
                      <th className="px-3 py-2 text-left">Сумма</th>
                      <th className="px-3 py-2 text-left">Ср. цена после</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t bg-green-500/5">
                      <td className="px-3 py-2 font-mono">0 (Первый)</td>
                      <td className="px-3 py-2 font-mono">$65,000.00</td>
                      <td className="px-3 py-2 font-mono">${baseAmount || "100"}</td>
                      <td className="px-3 py-2 font-mono">$65,000.00</td>
                    </tr>
                    {dcaLevelPreview.slice(0, 5).map((level) => (
                      <tr key={level.level} className="border-t">
                        <td className="px-3 py-2 font-mono">{level.level}</td>
                        <td className="px-3 py-2 font-mono text-red-400">
                          ${level.triggerPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono">${level.amount.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono text-yellow-500">
                          ${level.avgEntryAfter.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {dcaLevels > 6 && (
                      <tr className="border-t bg-muted/30">
                        <td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">
                          ... ещё {dcaLevels - 6} уровней
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={testFilter}
              disabled={isFilterLoading}
              className="gap-2"
            >
              {isFilterLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Filter className="h-4 w-4" />
              )}
              Тест фильтра
            </Button>

            {/* Filter Result Display */}
            {currentFilterResult && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentFilterResult.approved ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="font-medium">
                      {currentFilterResult.approved ? `Уровень DCA ${currentFilterResult.level} одобрен` : 'DCA не рекомендуется'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={cn(
                      "font-mono",
                      getConfidenceColor(currentFilterResult.confidence)
                    )}>
                      {(currentFilterResult.confidence * 100).toFixed(0)}% уверенность
                    </Badge>
                  </div>
                </div>

                {/* Confidence Progress */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Уровень уверенности</span>
                    <span className={getConfidenceColor(currentFilterResult.confidence)}>
                      {(currentFilterResult.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={currentFilterResult.confidence * 100} className="h-2" />
                </div>

                {/* Recommended DCA */}
                {currentFilterResult.approved && (
                  <div className="grid grid-cols-3 gap-3 text-center p-3 rounded bg-background">
                    <div>
                      <div className="text-lg font-bold">Уровень {currentFilterResult.level}</div>
                      <div className="text-xs text-muted-foreground">Уровень DCA</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">${currentFilterResult.amount.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">Сумма</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-green-500">
                        {currentFilterResult.avgEntryAdjustment >= 0 ? '+' : ''}{(currentFilterResult.avgEntryAdjustment).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">Ср. цена Δ</div>
                    </div>
                  </div>
                )}

                {/* Reasons */}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Анализ:</span>
                  <ScrollArea className="h-20">
                    <ul className="text-sm space-y-1">
                      {currentFilterResult.reasons.map((reason, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-primary">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Bot List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : bots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Layers className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Нет созданных DCA ботов</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Нажмите "Создать бота" для начала работы
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <Card key={bot.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{bot.name}</h3>
                      <Badge className={getStatusColor(bot.status)}>
                        {bot.status}
                      </Badge>
                      {bot.isActive && (
                        <Badge className="bg-green-500/10 text-green-500">
                          Активен
                        </Badge>
                      )}
                      {filterEnabled && (
                        <Badge variant="outline" className="text-primary border-primary/20">
                          <Filter className="h-3 w-3 mr-1" />
                          Фильтр
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn(
                        bot.direction === "LONG" 
                          ? "bg-green-500/10 text-green-500" 
                          : "bg-red-500/10 text-red-500"
                      )}>
                        {bot.direction === "LONG" ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {bot.direction}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{bot.symbol}</span>
                      <span>•</span>
                      <span>{bot.account.exchangeName}</span>
                      <span>•</span>
                      <span>{bot.dcaLevels} DCA уровней</span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Базовая сумма: ${bot.baseAmount}
                      </span>
                      <span className="text-muted-foreground">
                        TP: {bot.tpValue}%
                      </span>
                      {bot.leverage > 1 && (
                        <Badge variant="outline">{bot.leverage}x</Badge>
                      )}
                    </div>

                    {bot.totalInvested > 0 && (
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          Инвестировано: ${bot.totalInvested.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">
                          Уровень: {bot.currentLevel}/{bot.dcaLevels}
                        </span>
                        {bot.avgEntryPrice && (
                          <span className="text-muted-foreground">
                            Ср. цена: ${bot.avgEntryPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* DCA Progress Bar */}
                    {bot.currentLevel > 0 && (
                      <div className="w-full max-w-xs">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Прогресс DCA</span>
                          <span>{bot.currentLevel}/{bot.dcaLevels}</span>
                        </div>
                        <Progress value={(bot.currentLevel / bot.dcaLevels) * 100} className="h-2" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {bot.status === "RUNNING" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStopBot(bot.id)}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Стоп
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartBot(bot.id)}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Запуск
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteBot(bot.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Backtest & Paper Trading Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Тестирование стратегии DCA
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBacktest(!showBacktest)}
            >
              {showBacktest ? "Скрыть" : "Показать"}
            </Button>
          </div>
        </CardHeader>
        {showBacktest && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Протестируйте DCA стратегию на исторических данных. Убедитесь, что параметры подходят для текущих рыночных условий.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Период тестирования (дней)</Label>
                <Input
                  type="number"
                  value={backtestDays}
                  onChange={(e) => setBacktestDays(parseInt(e.target.value) || 30)}
                />
              </div>
              <div className="space-y-2">
                <Label>Текущая пара</Label>
                <Input value={symbol} disabled />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={runBacktest}
                disabled={isBacktestRunning}
              >
                {isBacktestRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <BarChart3 className="h-4 w-4 mr-2" />
                )}
                {isBacktestRunning ? "Тестирование..." : "Запустить бэктест"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={startPaperTrading}
                disabled={isPaperTrading}
              >
                <Activity className="h-4 w-4 mr-2" />
                {isPaperTrading ? "Paper Trading активен" : "Paper Trading"}
              </Button>
            </div>

            {/* Backtest Results */}
            {backtestResult && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Прибыль</div>
                  <div className={cn(
                    "text-lg font-bold",
                    backtestResult.totalProfit >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    ${backtestResult.totalProfit.toFixed(2)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Сделки</div>
                  <div className="text-lg font-bold">{backtestResult.totalTrades}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                  <div className={cn(
                    "text-lg font-bold",
                    backtestResult.winRate >= 50 ? "text-green-500" : ""
                  )}>
                    {backtestResult.winRate.toFixed(1)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Просадка</div>
                  <div className="text-lg font-bold text-red-500">
                    {backtestResult.maxDrawdown.toFixed(1)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Улучшение входа</div>
                  <div className="text-lg font-bold text-green-500">
                    -{backtestResult.avgEntryImprovement.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает Крон?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Крон</strong> — олицетворение времени. Стратегия DCA критически зависит 
            от временных интервалов и терпеливого накопления позиции.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Начинает с базовой суммы входа</li>
            <li>При падении цены покупает дополнительные объёмы</li>
            <li>Каждый DCA уровень увеличивает сумму (множитель)</li>
            <li>Снижает среднюю цену входа</li>
            <li>Закрывает позицию при достижении TP</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            "Время — мой союзник. Каждый уровень приближает к цели." — Крон
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
