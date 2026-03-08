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
  BarChart2,
  Play,
  Pause,
  Settings,
  TrendingUp,
  TrendingDown,
  Loader2,
  Activity,
  Layers,
  PieChart,
  RefreshCw,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ReedConfig, StatArbStats, StatArbFactor, StatArbSignal, StatArbPosition } from "@/lib/institutional-bots/types";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
  { id: "okx", name: "OKX" },
  { id: "bitget", name: "Bitget" },
  { id: "bingx", name: "BingX" },
];

const FACTOR_MODELS = [
  { id: "MOMENTUM", name: "Моментум", description: "Фактор ценового моментума" },
  { id: "MEAN_REVERSION", name: "Возврат к среднему", description: "Краткосрочный разворот" },
  { id: "VOLUME", name: "Объем", description: "Сигналы на основе объема" },
  { id: "VOLATILITY", name: "Волатильность", description: "Фактор волатильности" },
];

interface MockSignal {
  symbol: string;
  expectedReturn: number;
  direction: "LONG" | "SHORT";
  confidence: number;
  factors: { name: string; value: number }[];
}

export function ReedBotPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  
  // Configuration state
  const [config, setConfig] = useState<Partial<ReedConfig>>({
    mode: "PAPER",
    exchanges: [{ exchange: "binance", symbols: [], credentialRef: "default", enabled: true }],
    strategy: {
      factorModels: ["MOMENTUM", "MEAN_REVERSION", "VOLUME", "VOLATILITY"],
      lookbackPeriod: 60,
      minExpectedReturn: 0.02,
      maxHoldingPeriod: 432000000,
      rebalanceFrequency: 86400000,
      universeSize: 50,
      sectorNeutral: true,
      marketNeutral: true,
      pcaComponents: 3,
    },
    riskConfig: {
      maxPositionSize: 5000,
      maxTotalExposure: 50000,
      maxDrawdownPct: 0.10,
      riskPerTrade: 0.01,
      maxLeverage: 3,
    },
  });
  
  // Mock data
  const [signals, setSignals] = useState<MockSignal[]>([
    { 
      symbol: "SOLUSDT", 
      expectedReturn: 0.042, 
      direction: "LONG", 
      confidence: 0.85,
      factors: [
        { name: "Моментум", value: 0.12 },
        { name: "Возврат к среднему", value: -0.05 },
        { name: "Объем", value: 0.08 },
        { name: "Волатильность", value: 0.15 },
      ]
    },
    { 
      symbol: "AVAXUSDT", 
      expectedReturn: -0.038, 
      direction: "SHORT", 
      confidence: 0.78,
      factors: [
        { name: "Моментум", value: -0.08 },
        { name: "Возврат к среднему", value: 0.02 },
        { name: "Объем", value: -0.10 },
        { name: "Волатильность", value: 0.22 },
      ]
    },
    { 
      symbol: "DOGEUSDT", 
      expectedReturn: 0.028, 
      direction: "LONG", 
      confidence: 0.72,
      factors: [
        { name: "Моментум", value: 0.05 },
        { name: "Возврат к среднему", value: -0.08 },
        { name: "Объем", value: 0.15 },
        { name: "Волатильность", value: 0.30 },
      ]
    },
  ]);
  
  const [positions, setPositions] = useState<StatArbPosition[]>([]);
  const [stats, setStats] = useState<StatArbStats>({
    totalTrades: 0,
    winRate: 0,
    avgPnL: 0,
    factorReturns: new Map([
      ["MOMENTUM", 0.085],
      ["MEAN_REVERSION", 0.042],
      ["VOLUME", 0.028],
      ["VOLATILITY", -0.015],
    ]),
    informationRatio: 0,
    trackingError: 0,
  });

  // Simulate real-time updates
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setSignals(prev => prev.map(s => ({
        ...s,
        expectedReturn: s.expectedReturn + (Math.random() - 0.5) * 0.01,
        confidence: Math.min(1, Math.max(0.5, s.confidence + (Math.random() - 0.5) * 0.1)),
      })));
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isRunning]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsRunning(true);
      toast.success("Reed Bot успешно запущен");
      
      setStats({
        totalTrades: 156,
        winRate: 0.68,
        avgPnL: 89.30,
        factorReturns: new Map([
          ["MOMENTUM", 0.092],
          ["MEAN_REVERSION", 0.055],
          ["VOLUME", 0.031],
          ["VOLATILITY", -0.012],
        ]),
        informationRatio: 1.42,
        trackingError: 0.08,
      });
    } catch (error) {
      toast.error("Не удалось запустить Reed Bot");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRunning(false);
      toast.success("Reed Bot остановлен");
    } catch (error) {
      toast.error("Не удалось остановить Reed Bot");
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

  const toggleFactorModel = (factor: string) => {
    const current = config.strategy?.factorModels || [];
    if (current.includes(factor)) {
      updateStrategyConfig("factorModels", current.filter(f => f !== factor));
    } else {
      updateStrategyConfig("factorModels", [...current, factor]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            Reed
            <Badge variant="outline" className="ml-2">STA</Badge>
          </h2>
          <p className="text-muted-foreground">
            Статистический арбитраж с PCA и факторными моделями
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
                <DialogTitle>Конфигурация Reed</DialogTitle>
                <DialogDescription>
                  Настройка параметров статистического арбитража
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Factor Models */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Факторные модели
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {FACTOR_MODELS.map((factor) => (
                      <div
                        key={factor.id}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-colors",
                          config.strategy?.factorModels.includes(factor.id)
                            ? "bg-primary/10 border-primary"
                            : "bg-muted/50 hover:bg-muted"
                        )}
                        onClick={() => toggleFactorModel(factor.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{factor.name}</div>
                          <Switch
                            checked={config.strategy?.factorModels.includes(factor.id)}
                            onCheckedChange={() => toggleFactorModel(factor.id)}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {factor.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Strategy Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Параметры стратегии
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Мин. ожидаемая доходность</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={config.strategy?.minExpectedReturn}
                        onChange={(e) => updateStrategyConfig("minExpectedReturn", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Макс. период удержания (дней)</Label>
                      <Input
                        type="number"
                        value={(config.strategy?.maxHoldingPeriod || 432000000) / 86400000}
                        onChange={(e) => updateStrategyConfig("maxHoldingPeriod", parseInt(e.target.value) * 86400000)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Размер выборки</Label>
                      <Input
                        type="number"
                        value={config.strategy?.universeSize}
                        onChange={(e) => updateStrategyConfig("universeSize", parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Компоненты PCA</Label>
                      <Input
                        type="number"
                        value={config.strategy?.pcaComponents}
                        onChange={(e) => updateStrategyConfig("pcaComponents", parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Период ретроспективы</Label>
                      <Badge variant="outline">{config.strategy?.lookbackPeriod}</Badge>
                    </div>
                    <Slider
                      value={[config.strategy?.lookbackPeriod || 60]}
                      onValueChange={([v]) => updateStrategyConfig("lookbackPeriod", v)}
                      min={20}
                      max={120}
                      step={5}
                    />
                  </div>
                </div>
                
                {/* Neutral Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Ограничения портфеля
                  </h4>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <div className="font-medium">Нейтральность по секторам</div>
                        <div className="text-xs text-muted-foreground">Балансировка экспозиции по секторам</div>
                      </div>
                      <Switch
                        checked={config.strategy?.sectorNeutral}
                        onCheckedChange={(checked) => updateStrategyConfig("sectorNeutral", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <div className="font-medium">Рыночная нейтральность</div>
                        <div className="text-xs text-muted-foreground">Нулевая чистая рыночная экспозиция</div>
                      </div>
                      <Switch
                        checked={config.strategy?.marketNeutral}
                        onCheckedChange={(checked) => updateStrategyConfig("marketNeutral", checked)}
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
                  </div>
                </div>
                
                {/* Exchange Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Конфигурация биржи
                  </h4>
                  
                  <BotExchangeConfig
                    botType="REED"
                    currentExchange={config.exchanges?.[0]?.exchange as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
                    onConfigChange={(c) => {
                      setConfig(prev => ({
                        ...prev,
                        exchanges: [{ exchange: c.exchange, symbols: [], credentialRef: "default", enabled: true }],
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
            <div className="text-sm text-muted-foreground">Info Ratio</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.informationRatio >= 0.5 ? "text-green-500" : ""
            )}>
              {stats.informationRatio.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Ошибка слежения</div>
            <div className="text-2xl font-bold">
              {(stats.trackingError * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Factor Returns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Доходность факторов
          </CardTitle>
          <CardDescription>
            Атрибуция доходности по факторам
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from(stats.factorReturns.entries()).map(([factor, value]) => (
              <div key={factor} className="p-3 rounded-lg bg-muted/50 border">
                <div className="text-sm text-muted-foreground">{factor}</div>
                <div className={cn(
                  "text-xl font-bold",
                  value >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {(value * 100).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trading Signals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Активные сигналы
          </CardTitle>
          <CardDescription>
            Лучшие торговые возможности, ранжированные по ожидаемой доходности
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {signals.map((signal, index) => (
              <div
                key={index}
                className="p-3 rounded-lg bg-muted/50 border"
              >
                <div className="flex items-center justify-between mb-2">
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
                        "font-medium",
                        signal.expectedReturn >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {(signal.expectedReturn * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Увер.: <span className="font-medium text-foreground">{(signal.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <Button variant="outline" size="sm">
                      <Zap className="h-3 w-3 mr-1" />
                      Торговать
                    </Button>
                  </div>
                </div>
                
                {/* Factor breakdown */}
                <div className="flex gap-2 flex-wrap">
                  {signal.factors.map((factor) => (
                    <div key={factor.name} className="text-xs px-2 py-1 rounded bg-muted">
                      {factor.name}: <span className={cn(
                        "font-medium",
                        factor.value >= 0 ? "text-green-500" : "text-red-500"
                      )}>{factor.value.toFixed(3)}</span>
                    </div>
                  ))}
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
              <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
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
          <CardTitle className="text-base">Как работает Reed</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Reed</strong> использует многофакторные модели и PCA для статистического арбитража.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Анализирует множество факторов: моментум, возврат к среднему, объем, волатильность</li>
            <li>Использует PCA для снижения размерности</li>
            <li>Формирует рыночно-нейтральный портфель</li>
            <li>Получает прибыль от неверных цен коррелированных активов</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            Классические статистические методы - без нейронных сетей
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
