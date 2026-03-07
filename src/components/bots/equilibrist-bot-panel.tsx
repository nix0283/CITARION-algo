"use client";

import { useState, useEffect } from "react";
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
  Scale,
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
  RotateCcw,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EquilibristConfig, MeanReversionStats, MeanReversionSignal, MeanReversionPosition } from "@/lib/institutional-bots/types";

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
  { id: "okx", name: "OKX" },
  { id: "bitget", name: "Bitget" },
  { id: "bingx", name: "BingX" },
];

const MEAN_METHODS = [
  { id: "SMA", name: "Простая скользящая средняя", description: "Стандартный расчет среднего" },
  { id: "EMA", name: "Эксп. скользящая средняя", description: "Взвешивание недавних цен" },
  { id: "KAMA", name: "Адаптивная MA Кауфмана", description: "Адаптируется к волатильности" },
  { id: "REGRESSION", name: "Линейная регрессия", description: "Скорректированное по тренду среднее" },
];

const STD_METHODS = [
  { id: "SIMPLE", name: "Простой", description: "Стандартное отклонение" },
  { id: "EWMA", name: "EWMA", description: "Экспоненциально взвешенный" },
  { id: "PARKINSON", name: "Паркинсон", description: "Оценщик волатильности" },
];

interface MockSignal {
  symbol: string;
  price: number;
  fairValue: number;
  zScore: number;
  direction: "LONG" | "SHORT";
  confidence: number;
  expectedReturn: number;
}

export function EquilibristBotPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isPaperTrading, setIsPaperTrading] = useState(true);
  
  // Configuration state
  const [config, setConfig] = useState<Partial<EquilibristConfig>>({
    mode: "PAPER",
    exchange: "binance",
    exchanges: [{ exchange: "binance", symbols: ["BTCUSDT"], credentialRef: "default", enabled: true }],
    strategy: {
      lookbackPeriod: 50,
      zScoreEntry: 2.0,
      zScoreExit: 0.5,
      zScoreStopLoss: 3.5,
      meanCalcMethod: "KAMA",
      stdCalcMethod: "EWMA",
      bollingerBands: true,
      rsiConfirmation: true,
      volumeConfirmation: true,
      maxHoldingPeriod: 86400000,
    },
    riskConfig: {
      maxPositionSize: 10000,
      maxTotalExposure: 100000,
      maxDrawdownPct: 0.15,
      riskPerTrade: 0.02,
      maxLeverage: 5,
    },
  });
  
  // Mock data
  const [signals, setSignals] = useState<MockSignal[]>([
    { symbol: "BTCUSDT", price: 65800, fairValue: 67500, zScore: -2.3, direction: "LONG", confidence: 0.85, expectedReturn: 0.025 },
    { symbol: "ETHUSDT", price: 3580, fairValue: 3450, zScore: 2.1, direction: "SHORT", confidence: 0.78, expectedReturn: 0.018 },
    { symbol: "SOLUSDT", price: 142, fairValue: 135, zScore: 1.8, direction: "SHORT", confidence: 0.72, expectedReturn: 0.015 },
  ]);
  
  const [positions, setPositions] = useState<MeanReversionPosition[]>([]);
  const [stats, setStats] = useState<MeanReversionStats>({
    totalTrades: 0,
    winRate: 0,
    avgPnL: 0,
    avgHoldingTime: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    avgZScoreEntry: 0,
    avgZScoreExit: 0,
  });

  // Simulate real-time updates
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setSignals(prev => prev.map(s => {
        const zScoreChange = (Math.random() - 0.5) * 0.2;
        const newZScore = s.zScore + zScoreChange;
        return {
          ...s,
          zScore: newZScore,
          price: s.fairValue * (1 + newZScore * 0.01),
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
      toast.success("Equilibrist Bot успешно запущен");
      
      setStats({
        totalTrades: 89,
        winRate: 0.74,
        avgPnL: 245.30,
        avgHoldingTime: 3600000 * 4.5,
        maxDrawdown: 0.08,
        sharpeRatio: 2.15,
        avgZScoreEntry: 2.25,
        avgZScoreExit: 0.35,
      });
    } catch (error) {
      toast.error("Не удалось запустить Equilibrist Bot");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRunning(false);
      toast.success("Equilibrist Bot остановлен");
    } catch (error) {
      toast.error("Не удалось остановить Equilibrist Bot");
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

  const getZScoreColor = (zScore: number) => {
    const abs = Math.abs(zScore);
    if (abs >= 3) return "text-red-500";
    if (abs >= 2) return "text-yellow-500";
    if (abs >= 1.5) return "text-orange-500";
    return "text-green-500";
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
            <Scale className="h-6 w-6 text-primary" />
            Equilibrist
            <Badge variant="outline" className="ml-2">MR</Badge>
          </h2>
          <p className="text-muted-foreground">
            Возврат к среднему с KAMA
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
                <DialogTitle>Конфигурация Equilibrist</DialogTitle>
                <DialogDescription>
                  Настройка параметров возврата к среднему
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Z-Score Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Пороги Z-Score
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Порог входа</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={config.strategy?.zScoreEntry}
                        onChange={(e) => updateStrategyConfig("zScoreEntry", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Порог выхода</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={config.strategy?.zScoreExit}
                        onChange={(e) => updateStrategyConfig("zScoreExit", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Стоп-лосс</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={config.strategy?.zScoreStopLoss}
                        onChange={(e) => updateStrategyConfig("zScoreStopLoss", parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Calculation Methods */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Методы расчета
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Расчет среднего</Label>
                      <Select 
                        value={config.strategy?.meanCalcMethod} 
                        onValueChange={(v) => updateStrategyConfig("meanCalcMethod", v as "SMA" | "EMA" | "KAMA" | "REGRESSION")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEAN_METHODS.map((method) => (
                            <SelectItem key={method.id} value={method.id}>
                              {method.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Расчет станд. отклонения</Label>
                      <Select 
                        value={config.strategy?.stdCalcMethod} 
                        onValueChange={(v) => updateStrategyConfig("stdCalcMethod", v as "SIMPLE" | "EWMA" | "PARKINSON")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STD_METHODS.map((method) => (
                            <SelectItem key={method.id} value={method.id}>
                              {method.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Период ретроспективы</Label>
                      <Badge variant="outline">{config.strategy?.lookbackPeriod}</Badge>
                    </div>
                    <Slider
                      value={[config.strategy?.lookbackPeriod || 50]}
                      onValueChange={([v]) => updateStrategyConfig("lookbackPeriod", v)}
                      min={20}
                      max={100}
                      step={5}
                    />
                  </div>
                </div>
                
                {/* Confirmation Indicators */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Подтверждающие индикаторы
                  </h4>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <div className="font-medium">Полосы Боллинджера</div>
                        <div className="text-xs text-muted-foreground">Подтвердить цену на полосах</div>
                      </div>
                      <Switch
                        checked={config.strategy?.bollingerBands}
                        onCheckedChange={(checked) => updateStrategyConfig("bollingerBands", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <div className="font-medium">Подтверждение RSI</div>
                        <div className="text-xs text-muted-foreground">Подтвердить с RSI перекупленности/перепроданности</div>
                      </div>
                      <Switch
                        checked={config.strategy?.rsiConfirmation}
                        onCheckedChange={(checked) => updateStrategyConfig("rsiConfirmation", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <div className="font-medium">Подтверждение объема</div>
                        <div className="text-xs text-muted-foreground">Требовать всплеск объема</div>
                      </div>
                      <Switch
                        checked={config.strategy?.volumeConfirmation}
                        onCheckedChange={(checked) => updateStrategyConfig("volumeConfirmation", checked)}
                      />
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
                      <Label>Макс. период удержания (часы)</Label>
                      <Input
                        type="number"
                        value={(config.strategy?.maxHoldingPeriod || 86400000) / 3600000}
                        onChange={(e) => updateStrategyConfig("maxHoldingPeriod", parseInt(e.target.value) * 3600000)}
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
                    botType="Equilibrist"
                    currentExchange={config.exchange as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
                    onConfigChange={(c) => {
                      setConfig({...config, exchange: c.exchange, mode: c.mode, exchanges: [{ exchange: c.exchange, symbols: ["BTCUSDT"], credentialRef: "default", enabled: true }]})
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <div className="text-sm text-muted-foreground">Ср. Z-Score входа</div>
            <div className="text-xl font-bold">{stats.avgZScoreEntry.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Ср. Z-Score выхода</div>
            <div className="text-xl font-bold text-green-500">{stats.avgZScoreExit.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Signals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5" />
            Активные сигналы
          </CardTitle>
          <CardDescription>
            Обнаруженные возможности возврата к среднему
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {signals.map((signal, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-muted/50 border"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{signal.symbol}</Badge>
                    <Badge className={cn(
                      signal.direction === "LONG" 
                        ? "bg-green-500/10 text-green-500" 
                        : "bg-red-500/10 text-red-500"
                    )}>
                      {signal.direction === "LONG" ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      )}
                      {signal.direction}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm">
                      Ож. доходность: <span className={cn(
                        "font-medium text-green-500"
                      )}>
                        {(signal.expectedReturn * 100).toFixed(2)}%
                      </span>
                    </div>
                    <Button variant="outline" size="sm">
                      <Zap className="h-3 w-3 mr-1" />
                      Торговать
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Цена</div>
                    <div className="font-medium">${signal.price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Справ. стоимость</div>
                    <div className="font-medium">${signal.fairValue.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Z-Score</div>
                    <div className={cn("font-medium", getZScoreColor(signal.zScore))}>
                      {signal.zScore.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Уверенность</div>
                    <div className="font-medium">{(signal.confidence * 100).toFixed(0)}%</div>
                  </div>
                </div>
                
                {/* Deviation bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Перепроданность</span>
                    <span>Справ. стоимость</span>
                    <span>Перекупленность</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted relative">
                    <div 
                      className="absolute w-2 h-2 rounded-full bg-primary"
                      style={{ 
                        left: `${Math.min(100, Math.max(0, 50 + signal.zScore * 15))}%`,
                        transform: "translateX(-50%)"
                      }}
                    />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-green-500/50" />
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
            <Activity className="h-5 w-5" />
            Активные позиции
          </CardTitle>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Scale className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Нет активных позиций</p>
              <p className="text-sm">Позиции появятся при исполнении сигналов</p>
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
          <CardTitle className="text-base">Как работает Equilibrist</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Equilibrist</strong> торгует возврат к среднему, используя статистическое отклонение от справедливой стоимости.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Вычисляет справедливую стоимость с помощью KAMA (адаптируется к волатильности)</li>
            <li>Измеряет отклонение с помощью Z-score</li>
            <li>Входит, когда цена значительно отклоняется от среднего</li>
            <li>Выходит, когда цена возвращается к справедливой стоимости</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            Лучше всего подходит для боковых рынков с четкими уровнями поддержки/сопротивления
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
