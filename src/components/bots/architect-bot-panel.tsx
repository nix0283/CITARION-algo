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
  Building2,
  Play,
  Pause,
  Settings,
  TrendingUp,
  TrendingDown,
  Loader2,
  Activity,
  DollarSign,
  BarChart3,
  RefreshCw,
  ArrowUpDown,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ArchitectConfig, MarketMakingStats, Quote, InventoryState } from "@/lib/institutional-bots/types";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
  { id: "okx", name: "OKX" },
  { id: "bitget", name: "Bitget" },
  { id: "bingx", name: "BingX" },
];

interface MockQuote extends Quote {
  symbol: string;
}

interface MockInventory extends InventoryState {
  symbol: string;
}

export function ArchitectBotPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  
  // Configuration state
  const [config, setConfig] = useState<Partial<ArchitectConfig>>({
    mode: "PAPER",
    exchanges: [{ exchange: "binance", symbols: ["BTCUSDT"], credentialRef: "default", enabled: true }],
    strategy: {
      baseSpreadPct: 0.002,
      minSpreadPct: 0.0005,
      maxSpreadPct: 0.01,
      orderSize: 100,
      maxInventory: 1000,
      inventorySkewFactor: 0.1,
      refreshRate: 1000,
      adverseSelectionProtection: true,
      latencyMs: 50,
      volatilityAdjustment: true,
    },
    riskConfig: {
      maxPositionSize: 5000,
      maxTotalExposure: 50000,
      maxDrawdownPct: 0.05,
      riskPerTrade: 0.005,
      maxLeverage: 1,
    },
  });
  
  // Mock data
  const [quotes, setQuotes] = useState<MockQuote[]>([
    { symbol: "BTCUSDT", bidPrice: 67250, bidSize: 0.15, askPrice: 67280, askSize: 0.15, spread: 0.00045, midPrice: 67265, timestamp: Date.now() },
    { symbol: "ETHUSDT", bidPrice: 3450.50, bidSize: 1.2, askPrice: 3452.00, askSize: 1.2, spread: 0.00043, midPrice: 3451.25, timestamp: Date.now() },
  ]);
  
  const [inventory, setInventory] = useState<MockInventory[]>([
    { symbol: "BTCUSDT", netPosition: 0.25, avgCost: 67100, unrealizedPnl: 375, targetInventory: 0, skew: 0.025 },
    { symbol: "ETHUSDT", netPosition: -2.5, avgCost: 3460, unrealizedPnl: -21.25, targetInventory: 0, skew: -0.083 },
  ]);
  
  const [stats, setStats] = useState<MarketMakingStats>({
    totalVolume: 0,
    capturedSpread: 0,
    inventoryPnl: 0,
    totalPnl: 0,
    fillRate: 0,
    avgSpread: 0,
    adverseSelectionCost: 0,
    sharpeRatio: 0,
  });

  // Simulate real-time quote updates
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setQuotes(prev => prev.map(q => {
        const priceChange = (Math.random() - 0.5) * 20;
        const newMid = q.midPrice + priceChange;
        const spread = q.spread * (1 + (Math.random() - 0.5) * 0.1);
        const halfSpread = newMid * spread / 2;
        return {
          ...q,
          bidPrice: newMid - halfSpread,
          askPrice: newMid + halfSpread,
          midPrice: newMid,
          spread,
          timestamp: Date.now(),
        };
      }));
      
      // Update inventory PnL
      setInventory(prev => prev.map(inv => {
        const quote = quotes.find(q => q.symbol === inv.symbol);
        if (!quote) return inv;
        const pnl = inv.netPosition * (quote.midPrice - inv.avgCost);
        return { ...inv, unrealizedPnl: pnl };
      }));
    }, 2000);
    
    return () => clearInterval(interval);
  }, [isRunning, quotes]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsRunning(true);
      toast.success("Architect Bot успешно запущен");
      
      setStats({
        totalVolume: 2584500,
        capturedSpread: 1245.50,
        inventoryPnl: 353.75,
        totalPnl: 1599.25,
        fillRate: 0.78,
        avgSpread: 0.00044,
        adverseSelectionCost: 125.30,
        sharpeRatio: 2.45,
      });
    } catch (error) {
      toast.error("Не удалось запустить Architect Bot");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRunning(false);
      toast.success("Architect Bot остановлен");
    } catch (error) {
      toast.error("Не удалось остановить Architect Bot");
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

  const getInventoryColor = (skew: number) => {
    const abs = Math.abs(skew);
    if (abs >= 0.7) return "text-red-500";
    if (abs >= 0.4) return "text-yellow-500";
    return "text-green-500";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Architect
            <Badge variant="outline" className="ml-2">MM</Badge>
          </h2>
          <p className="text-muted-foreground">
            Маркет-мейкинг с перекосом инвентаря
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
                <DialogTitle>Конфигурация Architect</DialogTitle>
                <DialogDescription>
                  Настройка параметров маркет-мейкинга
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {/* Spread Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Параметры спреда
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Базовый спред (%)</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={(config.strategy?.baseSpreadPct || 0) * 100}
                        onChange={(e) => updateStrategyConfig("baseSpreadPct", parseFloat(e.target.value) / 100)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Мин. спред (%)</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={(config.strategy?.minSpreadPct || 0) * 100}
                        onChange={(e) => updateStrategyConfig("minSpreadPct", parseFloat(e.target.value) / 100)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Макс. спред (%)</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={(config.strategy?.maxSpreadPct || 0) * 100}
                        onChange={(e) => updateStrategyConfig("maxSpreadPct", parseFloat(e.target.value) / 100)}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Order Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Параметры ордеров
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Размер ордера</Label>
                      <Input
                        type="number"
                        value={config.strategy?.orderSize}
                        onChange={(e) => updateStrategyConfig("orderSize", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Макс. инвентарь</Label>
                      <Input
                        type="number"
                        value={config.strategy?.maxInventory}
                        onChange={(e) => updateStrategyConfig("maxInventory", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Фактор перекоса инвентаря</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={config.strategy?.inventorySkewFactor}
                        onChange={(e) => updateStrategyConfig("inventorySkewFactor", parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Частота обновления (мс)</Label>
                      <Input
                        type="number"
                        value={config.strategy?.refreshRate}
                        onChange={(e) => updateStrategyConfig("refreshRate", parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Protection Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Настройки защиты
                  </h4>
                  
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <div className="font-medium">Защита от неблагоприятного отбора</div>
                        <div className="text-xs text-muted-foreground">Расширять спред при трендах цены</div>
                      </div>
                      <Switch
                        checked={config.strategy?.adverseSelectionProtection}
                        onCheckedChange={(checked) => updateStrategyConfig("adverseSelectionProtection", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <div className="font-medium">Корректировка волатильности</div>
                        <div className="text-xs text-muted-foreground">Корректировать спред на основе волатильности</div>
                      </div>
                      <Switch
                        checked={config.strategy?.volatilityAdjustment}
                        onCheckedChange={(checked) => updateStrategyConfig("volatilityAdjustment", checked)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Задержка (мс)</Label>
                    <Input
                      type="number"
                      value={config.strategy?.latencyMs}
                      onChange={(e) => updateStrategyConfig("latencyMs", parseInt(e.target.value))}
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
                  </div>
                </div>
                
                {/* Exchange Settings */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Конфигурация биржи
                  </h4>
                  
                  <BotExchangeConfig
                    botType="ARCHITECT"
                    currentExchange={config.exchanges?.[0]?.exchange as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
                    onConfigChange={(c) => {
                      setConfig(prev => ({
                        ...prev,
                        exchanges: [{ exchange: c.exchange, symbols: ["BTCUSDT"], credentialRef: "default", enabled: true }],
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Общий объем</div>
            <div className="text-2xl font-bold">${(stats.totalVolume / 1000000).toFixed(2)}M</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Захваченный спред</div>
            <div className="text-2xl font-bold text-green-500">${stats.capturedSpread.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Общий PnL</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.totalPnl >= 0 ? "text-green-500" : "text-red-500"
            )}>
              ${stats.totalPnl.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Коэф. Шарпа</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.sharpeRatio >= 2 ? "text-green-500" : ""
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
            <div className="text-sm text-muted-foreground">Коэф. исполнения</div>
            <div className="text-xl font-bold">{(stats.fillRate * 100).toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Средний спред</div>
            <div className="text-xl font-bold">{(stats.avgSpread * 100).toFixed(3)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">PnL инвентаря</div>
            <div className={cn(
              "text-xl font-bold",
              stats.inventoryPnl >= 0 ? "text-green-500" : "text-red-500"
            )}>
              ${stats.inventoryPnl.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Стоим. неблаг. отбора
            </div>
            <div className="text-xl font-bold text-red-500">${stats.adverseSelectionCost.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Quotes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Активные котировки
          </CardTitle>
          <CardDescription>
            Текущие котировки bid/ask
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {quotes.map((quote, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-muted/50 border"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="font-mono">{quote.symbol}</Badge>
                    <div className="text-sm text-muted-foreground">
                      Mid: <span className="font-medium text-foreground">${quote.midPrice.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-sm">
                    Spread: <span className="font-medium">{(quote.spread * 100).toFixed(3)}%</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                    <div className="text-xs text-muted-foreground mb-1">BID</div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-green-500">${quote.bidPrice.toFixed(2)}</span>
                      <span className="text-sm">{quote.bidSize}</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                    <div className="text-xs text-muted-foreground mb-1">ASK</div>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-red-500">${quote.askPrice.toFixed(2)}</span>
                      <span className="text-sm">{quote.askSize}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Inventory Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Статус инвентаря
          </CardTitle>
          <CardDescription>
            Текущие позиции и перекос
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {inventory.map((inv, index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-muted/50 border"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{inv.symbol}</Badge>
                    <Badge className={cn(
                      inv.netPosition >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {inv.netPosition >= 0 ? "Лонг" : "Шорт"}
                    </Badge>
                  </div>
                  <div className={cn(
                    "font-medium",
                    inv.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    PnL: ${inv.unrealizedPnl.toFixed(2)}
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Позиция</div>
                    <div className="font-medium">{Math.abs(inv.netPosition).toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Ср. стоимость</div>
                    <div className="font-medium">${inv.avgCost.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Перекос</div>
                    <div className={cn("font-medium", getInventoryColor(inv.skew))}>
                      {(inv.skew * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Цель</div>
                    <div className="font-medium">{inv.targetInventory}</div>
                  </div>
                </div>
                
                {/* Skew indicator */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Шорт</span>
                    <span>Нейтрально</span>
                    <span>Лонг</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted relative">
                    <div 
                      className="absolute h-full w-1 bg-primary rounded"
                      style={{ left: `${50 + inv.skew * 50}%`, transform: "translateX(-50%)" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает Architect</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Architect</strong> предоставляет ликвидность, постоянно котируя цены bid и ask.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Использует модель оптимального спреда Авелланеды-Стойкова</li>
            <li>Корректирует цены на основе уровня инвентаря (перекос)</li>
            <li>Защищает от неблагоприятного отбора</li>
            <li>Получает прибыль от захвата bid-ask спреда</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            Ценообразование на основе инвентаря с динамической корректировкой спреда
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
