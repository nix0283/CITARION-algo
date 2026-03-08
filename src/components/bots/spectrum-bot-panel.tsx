"use client";

import { useState, useEffect, useCallback } from "react";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  GitBranch,
  Play,
  Pause,
  Settings,
  TrendingUp,
  TrendingDown,
  Loader2,
  Activity,
  BarChart3,
  Zap,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SpectrumConfig, PairStats, CointegrationResult, PairSignal, PairPosition } from "@/lib/institutional-bots/types";

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
  { id: "okx", name: "OKX" },
  { id: "bitget", name: "Bitget" },
  { id: "bingx", name: "BingX" },
];

interface MockPairData {
  symbol1: string;
  symbol2: string;
  correlation: number;
  zScore: number;
  hedgeRatio: number;
  halfLife: number;
}

export function SpectrumBotPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPaperTrading, setIsPaperTrading] = useState(true);
  
  // Configuration state
  const [config, setConfig] = useState<Partial<SpectrumConfig>>({
    mode: "PAPER",
    exchange: "binance",
    exchanges: [{ exchange: "binance", symbols: ["BTCUSDT", "ETHUSDT"], credentialRef: "default", enabled: true }],
    strategy: {
      lookbackPeriod: 100,
      zScoreEntry: 2.0,
      zScoreExit: 0.5,
      zScoreStopLoss: 4.0,
      minCointegration: 0.05,
      maxHalfLife: 20,
      rebalanceInterval: 86400000,
      correlationThreshold: 0.7,
      adfTestEnabled: true,
    },
    riskConfig: {
      maxPositionSize: 10000,
      maxTotalExposure: 100000,
      maxDrawdownPct: 0.15,
      riskPerTrade: 0.02,
      maxLeverage: 5,
    },
  });
  
  // Mock data for demonstration
  const [pairs, setPairs] = useState<MockPairData[]>([
    { symbol1: "BTCUSDT", symbol2: "ETHUSDT", correlation: 0.85, zScore: 2.3, hedgeRatio: 15.2, halfLife: 12 },
    { symbol1: "SOLUSDT", symbol2: "AVAXUSDT", correlation: 0.78, zScore: -1.8, hedgeRatio: 2.5, halfLife: 8 },
    { symbol1: "DOGEUSDT", symbol2: "SHIBUSDT", correlation: 0.72, zScore: 1.5, hedgeRatio: 0.001, halfLife: 15 },
  ]);
  
  const [positions, setPositions] = useState<PairPosition[]>([]);
  const [signals, setSignals] = useState<PairSignal[]>([]);
  const [stats, setStats] = useState<PairStats>({
    totalTrades: 0,
    winRate: 0,
    avgPnL: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    correlationAvg: 0.78,
  });

  // Simulate real-time updates when running
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      // Update z-scores randomly
      setPairs(prev => prev.map(pair => ({
        ...pair,
        zScore: pair.zScore + (Math.random() - 0.5) * 0.2,
      })));
    }, 3000);
    
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsRunning(true);
      toast.success("Spectrum Bot успешно запущен");
      
      // Initialize mock stats
      setStats({
        totalTrades: 24,
        winRate: 0.72,
        avgPnL: 156.50,
        maxDrawdown: 0.08,
        sharpeRatio: 1.85,
        correlationAvg: 0.82,
      });
    } catch (error) {
      toast.error("Не удалось запустить Spectrum Bot");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRunning(false);
      toast.success("Spectrum Bot остановлен");
    } catch (error) {
      toast.error("Не удалось остановить Spectrum Bot");
    }
  };

  const updateConfig = (key: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateStrategyConfig = (key: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      strategy: {
        ...prev.strategy!,
        [key]: value,
      },
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RUNNING":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "STOPPED":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      case "STARTING":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getZScoreColor = (zScore: number) => {
    const abs = Math.abs(zScore);
    if (abs >= 3) return "text-red-500";
    if (abs >= 2) return "text-yellow-500";
    return "text-green-500";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            Spectrum
            <Badge variant="outline" className="ml-2">PR</Badge>
          </h2>
          <p className="text-muted-foreground">
            Парный трейдинг с анализом коинтеграции
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge className={cn(
            "text-sm",
            isRunning ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-gray-500/10 text-gray-500"
          )}>
            {isRunning ? "РАБОТАЕТ" : "ОСТАНОВЛЕН"}
          </Badge>
          
          <Dialog open={showConfig} onOpenChange={setShowConfig}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Настроить
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Конфигурация Spectrum</DialogTitle>
                <DialogDescription>
                  Настройка параметров парного трейдинга
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Strategy Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Параметры стратегии
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Порог входа Z-Score</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={config.strategy?.zScoreEntry}
                        onChange={(e) => updateStrategyConfig("zScoreEntry", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Порог выхода Z-Score</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={config.strategy?.zScoreExit}
                        onChange={(e) => updateStrategyConfig("zScoreExit", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Стоп-лосс Z-Score</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={config.strategy?.zScoreStopLoss}
                        onChange={(e) => updateStrategyConfig("zScoreStopLoss", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Макс. полураспад (периодов)</Label>
                      <Input
                        type="number"
                        value={config.strategy?.maxHalfLife}
                        onChange={(e) => updateStrategyConfig("maxHalfLife", parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Период ретроспективы</Label>
                      <Badge variant="outline">{config.strategy?.lookbackPeriod}</Badge>
                    </div>
                    <Slider
                      value={[config.strategy?.lookbackPeriod || 100]}
                      onValueChange={([v]) => updateStrategyConfig("lookbackPeriod", v)}
                      min={30}
                      max={250}
                      step={10}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Мин. коинтеграция (p-value)</Label>
                      <Badge variant="outline">{config.strategy?.minCointegration}</Badge>
                    </div>
                    <Slider
                      value={[config.strategy?.minCointegration || 0.05]}
                      onValueChange={([v]) => updateStrategyConfig("minCointegration", v)}
                      min={0.01}
                      max={0.15}
                      step={0.01}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label>ADF тест включен</Label>
                    <Switch
                      checked={config.strategy?.adfTestEnabled}
                      onCheckedChange={(checked) => updateStrategyConfig("adfTestEnabled", checked)}
                    />
                  </div>
                </div>
                
                {/* Risk Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Управление рисками
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Макс. размер позиции (USDT)</Label>
                      <Input
                        type="number"
                        value={config.riskConfig?.maxPositionSize}
                        onChange={(e) => setConfig(prev => ({
                          ...prev,
                          riskConfig: { ...prev.riskConfig!, maxPositionSize: parseFloat(e.target.value) }
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Макс. общий объем (USDT)</Label>
                      <Input
                        type="number"
                        value={config.riskConfig?.maxTotalExposure}
                        onChange={(e) => setConfig(prev => ({
                          ...prev,
                          riskConfig: { ...prev.riskConfig!, maxTotalExposure: parseFloat(e.target.value) }
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Макс. просадка (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={config.riskConfig?.maxDrawdownPct}
                        onChange={(e) => setConfig(prev => ({
                          ...prev,
                          riskConfig: { ...prev.riskConfig!, maxDrawdownPct: parseFloat(e.target.value) }
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Риск на сделку (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={config.riskConfig?.riskPerTrade}
                        onChange={(e) => setConfig(prev => ({
                          ...prev,
                          riskConfig: { ...prev.riskConfig!, riskPerTrade: parseFloat(e.target.value) }
                        }))}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Exchange Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Конфигурация биржи
                  </h4>
                  
                  <BotExchangeConfig
                    botType="Spectrum"
                    currentExchange={config.exchange as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
                    onConfigChange={(c) => {
                      setConfig({...config, exchange: c.exchange, mode: c.mode, exchanges: [{ exchange: c.exchange, symbols: ["BTCUSDT", "ETHUSDT"], credentialRef: "default", enabled: true }]})
                      setIsPaperTrading(c.mode === "PAPER")
                    }}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowConfig(false)}>
                  Отмена
                </Button>
                <Button onClick={() => {
                  setShowConfig(false);
                  toast.success("Конфигурация сохранена");
                }}>
                  Сохранить конфигурацию
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Pause className="h-4 w-4 mr-1" />
              Остановить
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={isStarting}>
              {isStarting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {isStarting ? "Запуск..." : "Запустить"}
            </Button>
          )}
        </div>
      </div>

      {/* Performance Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Всего сделок</div>
            <div className="text-2xl font-bold">{stats.totalTrades}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Процент побед</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.winRate >= 0.5 ? "text-green-500" : "text-red-500"
            )}>
              {(stats.winRate * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Средний PnL</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.avgPnL >= 0 ? "text-green-500" : "text-red-500"
            )}>
              ${stats.avgPnL.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Макс. просадка</div>
            <div className="text-2xl font-bold text-red-500">
              {(stats.maxDrawdown * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Коэф. Шарпа</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.sharpeRatio >= 1 ? "text-green-500" : ""
            )}>
              {stats.sharpeRatio.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Средняя корреляция</div>
            <div className="text-2xl font-bold">
              {stats.correlationAvg.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cointegrated Pairs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Коинтегрированные пары
          </CardTitle>
          <CardDescription>
            Обнаруженные пары со статистической коинтеграцией
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {pairs.map((pair, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{pair.symbol1}</Badge>
                    <span className="text-muted-foreground">/</span>
                    <Badge variant="outline">{pair.symbol2}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Корреляция: <span className="font-medium text-foreground">{pair.correlation.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    Z-Score: <span className={cn("font-medium", getZScoreColor(pair.zScore))}>
                      {pair.zScore.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Хедж: <span className="font-medium text-foreground">{pair.hedgeRatio.toFixed(2)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ПЖ: <span className="font-medium text-foreground">{pair.halfLife}</span>
                  </div>
                  {Math.abs(pair.zScore) >= 2 && (
                    <Button variant="outline" size="sm">
                      <Zap className="h-3 w-3 mr-1" />
                      Торговать
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Positions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Активные позиции
          </CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Нет активных парных позиций</p>
              <p className="text-sm">Позиции появятся при срабатывании сигналов входа</p>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((pos) => (
                <div key={pos.id} className="p-3 rounded-lg bg-muted/50 border">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{pos.pair.join(" / ")}</div>
                      <div className="text-sm text-muted-foreground">
                        {pos.leg1.side} {pos.leg1.symbol} + {pos.leg2.side} {pos.leg2.symbol}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        "font-medium",
                        pos.pnl >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        ${pos.pnl.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает Spectrum</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Spectrum</strong> использует возврат к среднему в коинтегрированных парах методом Engle-Granger.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Определяет пары с долгосрочным равновесным отношением</li>
            <li>Использует ADF тест для проверки коинтеграции</li>
            <li>Входит, когда z-score превышает порог (отклонение спреда)</li>
            <li>Выходит при возврате спреда к среднему</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            Рыночно-нейтральная стратегия - прибыль независимо от направления рынка
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
