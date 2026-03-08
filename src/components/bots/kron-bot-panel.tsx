"use client";

import { useState, useEffect } from "react";
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
  Crown,
  Play,
  Pause,
  Settings,
  TrendingUp,
  TrendingDown,
  Loader2,
  Activity,
  Target,
  BarChart3,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Gauge,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { KronConfig, TrendStats, TrendSignal, TrendPosition, TrendDirection } from "@/lib/institutional-bots/types";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
  { id: "okx", name: "OKX" },
  { id: "bitget", name: "Bitget" },
  { id: "bingx", name: "BingX" },
];

const TREND_METHODS = [
  { id: "EMA_CROSS", name: "Пересечение EMA", description: "Выравнивание быстрой/средней/медленной EMA" },
  { id: "SUPERTREND", name: "SuperTrend", description: "Индикатор тренда на основе ATR" },
  { id: "ADX", name: "ADX тренд", description: "Индекс направленного движения" },
  { id: "COMBINED", name: "Комбинированный", description: "Консенсус нескольких индикаторов" },
];

const POSITION_SIZING = [
  { id: "FIXED", name: "Фиксированный", description: "Фиксированный размер позиции" },
  { id: "VOLATILITY_ADJUSTED", name: "Скорректированный по волатильности", description: "Размер на основе ATR" },
  { id: "KELLY", name: "Критерий Келли", description: "Оптимальный размер по винрейту" },
];

interface MockTrendData {
  symbol: string;
  direction: TrendDirection;
  strength: number;
  adx: number;
  emaFast: number;
  emaMedium: number;
  emaSlow: number;
  price: number;
}

export function KronBotPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  
  // Configuration state
  const [config, setConfig] = useState<Partial<KronConfig>>({
    mode: "PAPER",
    exchanges: [{ exchange: "binance", symbols: ["BTCUSDT"], credentialRef: "default", enabled: true }],
    strategy: {
      trendMethod: "COMBINED",
      emaPeriods: { fast: 9, medium: 21, slow: 55 },
      adxThreshold: 25,
      supertrendPeriod: 10,
      supertrendMultiplier: 3,
      minTrendStrength: 0.6,
      trailingStop: {
        enabled: true,
        atrPeriod: 14,
        atrMultiplier: 3,
      },
      pyramidEnabled: true,
      maxPyramidLevels: 3,
      positionSizing: "VOLATILITY_ADJUSTED",
    },
    riskConfig: {
      maxPositionSize: 15000,
      maxTotalExposure: 150000,
      maxDrawdownPct: 0.20,
      riskPerTrade: 0.03,
      maxLeverage: 10,
    },
  });
  
  // Mock data
  const [trendData, setTrendData] = useState<MockTrendData[]>([
    { symbol: "BTCUSDT", direction: "UPTREND", strength: 0.78, adx: 32, emaFast: 67800, emaMedium: 66500, emaSlow: 64200, price: 68500 },
    { symbol: "ETHUSDT", direction: "UPTREND", strength: 0.65, adx: 28, emaFast: 3520, emaMedium: 3450, emaSlow: 3350, price: 3580 },
    { symbol: "SOLUSDT", direction: "SIDEWAYS", strength: 0.35, adx: 18, emaFast: 145, emaMedium: 144, emaSlow: 142, price: 143 },
    { symbol: "DOGEUSDT", direction: "DOWNTREND", strength: 0.72, adx: 35, emaFast: 0.118, emaMedium: 0.125, emaSlow: 0.132, price: 0.115 },
  ]);
  
  const [signals, setSignals] = useState<TrendSignal[]>([]);
  const [positions, setPositions] = useState<TrendPosition[]>([]);
  const [stats, setStats] = useState<TrendStats>({
    totalTrades: 0,
    winRate: 0,
    avgPnL: 0,
    avgWin: 0,
    avgLoss: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    avgHoldingTime: 0,
    trendCapture: 0,
  });

  // Simulate real-time updates
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setTrendData(prev => prev.map(t => {
        const priceChange = (Math.random() - 0.5) * 100;
        const newPrice = t.price + priceChange;
        const directionChange = Math.random() > 0.95;
        let newDirection = t.direction;
        
        if (directionChange) {
          if (t.direction === "UPTREND") newDirection = Math.random() > 0.5 ? "SIDEWAYS" : "UPTREND";
          else if (t.direction === "DOWNTREND") newDirection = Math.random() > 0.5 ? "SIDEWAYS" : "DOWNTREND";
          else newDirection = Math.random() > 0.5 ? "UPTREND" : "DOWNTREND";
        }
        
        const adxChange = (Math.random() - 0.5) * 2;
        const newAdx = Math.max(0, Math.min(50, t.adx + adxChange));
        
        return {
          ...t,
          price: newPrice,
          adx: newAdx,
          strength: newAdx / 50,
          direction: newDirection,
        };
      }));
    }, 3000);
    
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsRunning(true);
      toast.success("Kron Bot успешно запущен");
      
      setStats({
        totalTrades: 67,
        winRate: 0.45,
        avgPnL: 520.80,
        avgWin: 1850.50,
        avgLoss: -680.30,
        maxDrawdown: 0.12,
        sharpeRatio: 1.95,
        avgHoldingTime: 3600000 * 72,
        trendCapture: 0.68,
      });
    } catch (error) {
      toast.error("Не удалось запустить Kron Bot");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRunning(false);
      toast.success("Kron Bot остановлен");
    } catch (error) {
      toast.error("Не удалось остановить Kron Bot");
    }
  };

  const updateConfig = (key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const updateStrategyConfig = (key: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      strategy: { ...prev.strategy!, [key]: value },
    }));
  };

  const getTrendIcon = (direction: TrendDirection) => {
    switch (direction) {
      case "UPTREND":
        return <ArrowUpRight className="h-4 w-4 text-green-500" />;
      case "DOWNTREND":
        return <ArrowDownRight className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getTrendColor = (direction: TrendDirection) => {
    switch (direction) {
      case "UPTREND":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "DOWNTREND":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    }
  };

  const formatHoldingTime = (ms: number) => {
    const hours = ms / (1000 * 60 * 60);
    if (hours >= 24) {
      return `${(hours / 24).toFixed(1)}d`;
    }
    return `${hours.toFixed(1)}h`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6 text-primary" />
            Kron
            <Badge variant="outline" className="ml-2">TRF</Badge>
          </h2>
          <p className="text-muted-foreground">
            Следование за трендом с пирамидингом
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
                <DialogTitle>Конфигурация Kron</DialogTitle>
                <DialogDescription>
                  Настройка параметров следования за трендом
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Trend Detection */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Определение тренда
                  </h4>
                  
                  <div className="space-y-2">
                    <Label>Метод определения тренда</Label>
                    <Select 
                      value={config.strategy?.trendMethod} 
                      onValueChange={(v) => updateStrategyConfig("trendMethod", v as "EMA_CROSS" | "SUPERTREND" | "ADX" | "COMBINED")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TREND_METHODS.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            <div>
                              <div>{method.name}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Быстрая EMA</Label>
                      <Input
                        type="number"
                        value={config.strategy?.emaPeriods.fast}
                        onChange={(e) => updateStrategyConfig("emaPeriods", { 
                          ...config.strategy!.emaPeriods, 
                          fast: parseInt(e.target.value) 
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Средняя EMA</Label>
                      <Input
                        type="number"
                        value={config.strategy?.emaPeriods.medium}
                        onChange={(e) => updateStrategyConfig("emaPeriods", { 
                          ...config.strategy!.emaPeriods, 
                          medium: parseInt(e.target.value) 
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Медленная EMA</Label>
                      <Input
                        type="number"
                        value={config.strategy?.emaPeriods.slow}
                        onChange={(e) => updateStrategyConfig("emaPeriods", { 
                          ...config.strategy!.emaPeriods, 
                          slow: parseInt(e.target.value) 
                        })}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Порог ADX</Label>
                      <Input
                        type="number"
                        value={config.strategy?.adxThreshold}
                        onChange={(e) => updateStrategyConfig("adxThreshold", parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Мин. сила тренда</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={config.strategy?.minTrendStrength}
                        onChange={(e) => updateStrategyConfig("minTrendStrength", parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                
                {/* SuperTrend Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Настройки SuperTrend
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Период</Label>
                      <Input
                        type="number"
                        value={config.strategy?.supertrendPeriod}
                        onChange={(e) => updateStrategyConfig("supertrendPeriod", parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Множитель</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={config.strategy?.supertrendMultiplier}
                        onChange={(e) => updateStrategyConfig("supertrendMultiplier", parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Trailing Stop */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Скользящий стоп
                  </h4>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">Скользящий стоп включен</div>
                      <div className="text-xs text-muted-foreground">Скользящий стоп на основе ATR</div>
                    </div>
                    <Switch
                      checked={config.strategy?.trailingStop.enabled}
                      onCheckedChange={(checked) => updateStrategyConfig("trailingStop", {
                        ...config.strategy!.trailingStop,
                        enabled: checked
                      })}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Период ATR</Label>
                      <Input
                        type="number"
                        value={config.strategy?.trailingStop.atrPeriod}
                        onChange={(e) => updateStrategyConfig("trailingStop", {
                          ...config.strategy!.trailingStop,
                          atrPeriod: parseInt(e.target.value)
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Множитель ATR</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={config.strategy?.trailingStop.atrMultiplier}
                        onChange={(e) => updateStrategyConfig("trailingStop", {
                          ...config.strategy!.trailingStop,
                          atrMultiplier: parseFloat(e.target.value)
                        })}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Pyramiding */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Пирамидинг
                  </h4>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">Пирамидинг включен</div>
                      <div className="text-xs text-muted-foreground">Добавлять к прибыльным позициям</div>
                    </div>
                    <Switch
                      checked={config.strategy?.pyramidEnabled}
                      onCheckedChange={(checked) => updateStrategyConfig("pyramidEnabled", checked)}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Макс. уровней пирамиды</Label>
                      <Input
                        type="number"
                        value={config.strategy?.maxPyramidLevels}
                        onChange={(e) => updateStrategyConfig("maxPyramidLevels", parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Размер позиции</Label>
                      <Select 
                        value={config.strategy?.positionSizing} 
                        onValueChange={(v) => updateStrategyConfig("positionSizing", v as "FIXED" | "VOLATILITY_ADJUSTED" | "KELLY")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {POSITION_SIZING.map((ps) => (
                            <SelectItem key={ps.id} value={ps.id}>
                              {ps.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                      <Label>Макс. плечо</Label>
                      <Input
                        type="number"
                        value={config.riskConfig?.maxLeverage}
                        onChange={(e) => setConfig(prev => ({
                          ...prev,
                          riskConfig: { ...prev.riskConfig!, maxLeverage: parseInt(e.target.value) }
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
                    botType="KRON"
                    currentExchange={config.exchanges?.[0]?.exchange as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
                    onConfigChange={(c) => {
                      setConfig(prev => ({
                        ...prev,
                        exchanges: [{ exchange: c.exchange, symbols: prev.exchanges?.[0]?.symbols || ["BTCUSDT"], credentialRef: "default", enabled: true }],
                        mode: c.mode as "PAPER" | "LIVE"
                      }))
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              stats.winRate >= 0.4 ? "text-green-500" : "text-red-500"
            )}>
              {(stats.winRate * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Средняя прибыль</div>
            <div className="text-2xl font-bold text-green-500">
              ${stats.avgWin.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Средний убыток</div>
            <div className="text-2xl font-bold text-red-500">
              ${stats.avgLoss.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Коэф. Шарпа</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.sharpeRatio >= 1.5 ? "text-green-500" : ""
            )}>
              {stats.sharpeRatio.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Ср. время удержания</div>
            <div className="text-xl font-bold">{formatHoldingTime(stats.avgHoldingTime)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Макс. просадка</div>
            <div className="text-xl font-bold text-red-500">{(stats.maxDrawdown * 100).toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Средний PnL</div>
            <div className={cn(
              "text-xl font-bold",
              stats.avgPnL >= 0 ? "text-green-500" : "text-red-500"
            )}>
              ${stats.avgPnL.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Захват тренда
            </div>
            <div className="text-xl font-bold text-green-500">{(stats.trendCapture * 100).toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Обзор трендов
          </CardTitle>
          <CardDescription>
            Текущее направление и сила тренда по отслеживаемым символам
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {trendData.map((trend, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-muted/50 border"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{trend.symbol}</Badge>
                    <Badge className={cn("flex items-center gap-1", getTrendColor(trend.direction))}>
                      {getTrendIcon(trend.direction)}
                      {trend.direction}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      Цена: <span className="font-medium">${trend.price.toFixed(2)}</span>
                    </div>
                    <div className="text-sm">
                      Сила: <span className={cn(
                        "font-medium",
                        trend.strength >= 0.6 ? "text-green-500" : trend.strength >= 0.4 ? "text-yellow-500" : "text-red-500"
                      )}>
                        {(trend.strength * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-sm">
                      ADX: <span className={cn(
                        "font-medium",
                        trend.adx >= 25 ? "text-green-500" : "text-yellow-500"
                      )}>
                        {trend.adx.toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* EMA alignment */}
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Быстрая EMA</div>
                    <div className="font-medium">${trend.emaFast.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Средняя EMA</div>
                    <div className="font-medium">${trend.emaMedium.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Медленная EMA</div>
                    <div className="font-medium">${trend.emaSlow.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Выравнивание</div>
                    <div className={cn(
                      "font-medium",
                      trend.emaFast > trend.emaMedium && trend.emaMedium > trend.emaSlow
                        ? "text-green-500"
                        : trend.emaFast < trend.emaMedium && trend.emaMedium < trend.emaSlow
                        ? "text-red-500"
                        : "text-yellow-500"
                    )}>
                      {trend.emaFast > trend.emaMedium && trend.emaMedium > trend.emaSlow
                        ? "Бычье"
                        : trend.emaFast < trend.emaMedium && trend.emaMedium < trend.emaSlow
                        ? "Медвежье"
                        : "Смешанное"}
                    </div>
                  </div>
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
            <Layers className="h-5 w-5" />
            Активные позиции
            {config.strategy?.pyramidEnabled && (
              <Badge variant="outline" className="ml-2">Пирамидинг</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Crown className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Нет активных позиций</p>
              <p className="text-sm">Позиции появятся при подтверждении трендов</p>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((pos) => (
                <div key={pos.id} className="p-3 rounded-lg bg-muted/50 border">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{pos.symbol}</Badge>
                      <Badge className={pos.side === "LONG" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}>
                        {pos.side}
                      </Badge>
                      {pos.pyramidLevel > 0 && (
                        <Badge variant="outline">Уровень {pos.pyramidLevel}</Badge>
                      )}
                    </div>
                    <div className={cn(
                      "font-medium",
                      pos.pnl >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                      ${pos.pnl.toFixed(2)}
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
          <CardTitle className="text-base">Как работает Kron</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Kron</strong> следует за трендами, используя множество методов подтверждения и пирамидинг.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Объединяет пересечения EMA, ADX, SuperTrend и MACD</li>
            <li>Требует минимальной силы тренда для входа</li>
            <li>Использует скользящие стопы на основе ATR</li>
            <li>Пирамидирует прибыльные позиции (добавляет к победителям)</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            Дайте прибыли расти, сокращайте убытки - тренд ваш друг
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
