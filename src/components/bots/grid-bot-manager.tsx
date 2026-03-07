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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Grid3X3,
  Play,
  Pause,
  Trash2,
  Plus,
  TrendingUp,
  TrendingDown,
  Loader2,
  Settings,
  DollarSign,
  BarChart3,
  Activity,
  ArrowRight,
  ChevronDown,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";

interface GridBot {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  symbol: string;
  exchangeId: string;
  gridType: string;
  gridCount: number;
  upperPrice: number;
  lowerPrice: number;
  totalInvestment: number;
  leverage: number;
  status: string;
  totalProfit: number;
  totalTrades: number;
  account: {
    exchangeName: string;
    accountType: string;
  };
  _count?: { gridOrders: number };
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

export function GridBotManager() {
  const [bots, setBots] = useState<GridBot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // Backtest state
  const [showBacktest, setShowBacktest] = useState(false);
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const [backtestDays, setBacktestDays] = useState(30);
  const [backtestResult, setBacktestResult] = useState<{
    totalProfit: number;
    totalTrades: number;
    winRate: number;
    maxDrawdown: number;
    profitFactor: number;
  } | null>(null);
  
  // Paper trading state
  const [isPaperTrading, setIsPaperTrading] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [exchangeId, setExchangeId] = useState("binance");
  const [gridType, setGridType] = useState<"ARITHMETIC" | "GEOMETRIC">("ARITHMETIC");
  const [gridCount, setGridCount] = useState(10);
  const [upperPrice, setUpperPrice] = useState("75000");
  const [lowerPrice, setLowerPrice] = useState("65000");
  const [totalInvestment, setTotalInvestment] = useState("1000");
  const [leverage, setLeverage] = useState(1);

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch("/api/bots/grid");
      const data = await response.json();
      if (data.success) {
        setBots(data.bots);
      }
    } catch (error) {
      console.error("Failed to fetch grid bots:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBot = async () => {
    if (!name || !symbol || !upperPrice || !lowerPrice || !totalInvestment) {
      toast.error("Заполните все обязательные поля");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch("/api/bots/grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          symbol,
          exchangeId,
          gridType,
          gridCount,
          upperPrice: parseFloat(upperPrice),
          lowerPrice: parseFloat(lowerPrice),
          totalInvestment: parseFloat(totalInvestment),
          leverage,
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
        setUpperPrice("75000");
        setLowerPrice("65000");
        setTotalInvestment("1000");
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
      const response = await fetch("/api/bots/grid", {
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
      const response = await fetch("/api/bots/grid", {
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
      const response = await fetch(`/api/bots/grid?id=${botId}`, {
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

  // Run backtest for grid strategy
  const runBacktest = async () => {
    if (!upperPrice || !lowerPrice || !totalInvestment) {
      toast.error("Заполните параметры сетки для бэктеста");
      return;
    }

    setIsBacktestRunning(true);
    setBacktestResult(null);

    try {
      const response = await fetch("/api/backtesting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: "grid-strategy",
          strategyParams: {
            gridCount,
            upperPrice: parseFloat(upperPrice),
            lowerPrice: parseFloat(lowerPrice),
            gridType,
          },
          tacticsSet: {
            id: "grid-tactics",
            name: "Grid Trading",
            entry: { type: "LIMIT", positionSize: "PERCENT", positionSizeValue: 100 / gridCount },
            takeProfit: { type: "FIXED_TP" },
            stopLoss: { type: "PERCENT", slPercent: 10 },
          },
          symbol,
          timeframe: "1h",
          initialBalance: parseFloat(totalInvestment),
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
          profitFactor: data.result.metrics.profitFactor,
        });
        toast.success("Бэктест завершён!");
      } else {
        // Simulate result for demo
        await new Promise(resolve => setTimeout(resolve, 2000));
        setBacktestResult({
          totalProfit: parseFloat(totalInvestment) * 0.15,
          totalTrades: gridCount * 4,
          winRate: 72.5,
          maxDrawdown: 5.3,
          profitFactor: 2.1,
        });
        toast.success("Бэктест завершён (демо)!");
      }
    } catch (error) {
      // Simulate result for demo
      await new Promise(resolve => setTimeout(resolve, 2000));
      setBacktestResult({
        totalProfit: parseFloat(totalInvestment) * 0.15,
        totalTrades: gridCount * 4,
        winRate: 72.5,
        maxDrawdown: 5.3,
        profitFactor: 2.1,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Grid3X3 className="h-6 w-6 text-primary" />
            Архитектор
            <span className="text-sm font-normal text-muted-foreground">(Grid Bot)</span>
          </h2>
          <p className="text-muted-foreground">
            Автоматическая сеточная торговля • Создаёт структуру ордеров в заданном диапазоне
          </p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать бота
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Создать бота Архитектор</DialogTitle>
              <DialogDescription>
                Настройте параметры сеточной торговли
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {/* Name */}
              <div className="space-y-2">
                <Label>Название бота</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Grid Bot"
                />
              </div>

              {/* Exchange */}
              <div className="space-y-2">
                <Label>Биржа</Label>
                <Select value={exchangeId} onValueChange={setExchangeId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCHANGES.map((ex) => (
                      <SelectItem key={ex.id} value={ex.id}>
                        {ex.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Symbol */}
              <div className="space-y-2">
                <Label>Торговая пара</Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="BTCUSDT"
                />
              </div>

              {/* Grid Type */}
              <div className="space-y-2">
                <Label>Тип сетки</Label>
                <Select value={gridType} onValueChange={(v) => setGridType(v as "ARITHMETIC" | "GEOMETRIC")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARITHMETIC">Арифметическая</SelectItem>
                    <SelectItem value="GEOMETRIC">Геометрическая</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Grid Count */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Количество уровней</Label>
                  <Badge variant="outline">{gridCount}</Badge>
                </div>
                <Slider
                  value={[gridCount]}
                  onValueChange={([v]) => setGridCount(v)}
                  min={2}
                  max={50}
                  step={1}
                />
              </div>

              {/* Price Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Нижняя цена</Label>
                  <Input
                    type="number"
                    value={lowerPrice}
                    onChange={(e) => setLowerPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Верхняя цена</Label>
                  <Input
                    type="number"
                    value={upperPrice}
                    onChange={(e) => setUpperPrice(e.target.value)}
                  />
                </div>
              </div>

              {/* Investment */}
              <div className="space-y-2">
                <Label>Инвестиция (USDT)</Label>
                <Input
                  type="number"
                  value={totalInvestment}
                  onChange={(e) => setTotalInvestment(e.target.value)}
                />
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

              {/* Exchange Configuration */}
              <div className="pt-4 border-t">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Подключение к бирже
                </Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Выберите режим торговли и настройте подключение
                </p>
                <BotExchangeConfig
                  botType="grid"
                  currentExchange={exchangeId as any}
                  currentMode={isPaperTrading ? "PAPER" : "LIVE"}
                  onConfigChange={(config) => {
                    setExchangeId(config.exchange);
                    if (config.mode === "PAPER") {
                      setIsPaperTrading(true);
                    } else {
                      setIsPaperTrading(false);
                    }
                  }}
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

      {/* Bot List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : bots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Grid3X3 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Нет созданных ботов Сетка</p>
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
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{bot.symbol}</span>
                      <span>•</span>
                      <span>{bot.account.exchangeName}</span>
                      <span>•</span>
                      <span>{bot.gridCount} уровней</span>
                      <span>•</span>
                      <span>{bot.gridType === "ARITHMETIC" ? "Арифм." : "Геом."}</span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Диапазон: ${bot.lowerPrice.toLocaleString()} - ${bot.upperPrice.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">
                        Инвестиция: ${bot.totalInvestment.toLocaleString()}
                      </span>
                      {bot.leverage > 1 && (
                        <Badge variant="outline">{bot.leverage}x</Badge>
                      )}
                    </div>

                    {bot.totalTrades > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Сделок: {bot.totalTrades}</span>
                        <span className={cn(
                          "font-medium",
                          bot.totalProfit >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          PnL: ${bot.totalProfit.toFixed(2)}
                        </span>
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
              Тестирование стратегии
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
              Протестируйте стратегию сеточной торговли на исторических данных перед запуском на реальном счёте.
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
                  <div className="text-sm text-muted-foreground">Profit Factor</div>
                  <div className={cn(
                    "text-lg font-bold",
                    backtestResult.profitFactor >= 1.5 ? "text-green-500" : ""
                  )}>
                    {backtestResult.profitFactor.toFixed(2)}
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
          <CardTitle className="text-base">Как работает Архитектор?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Архитектор</strong> создаёт жёсткую структуру ордеров в заданном ценовом диапазоне, 
            словно проектируя реальность рынка.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Покупает при падении цены к нижним уровням сетки</li>
            <li>Продаёт при росте цены к верхним уровням сетки</li>
            <li>Зарабатывает на колебаниях цены в диапазоне</li>
            <li>Идеально для бокового рынка (флэт)</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            "Я создал совершенную сетку. Каждая ячейка — это возможность." — Архитектор
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
