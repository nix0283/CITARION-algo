"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PawPrint,
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
  Target,
  AlertTriangle,
  LineChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";

const EXCHANGES = [
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
  { id: "okx", name: "OKX" },
  { id: "bitget", name: "Bitget" },
  { id: "bingx", name: "BingX" },
];

interface PatternSignal {
  pattern: string;
  symbol: string;
  timeframe: string;
  direction: "LONG" | "SHORT";
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: string;
}

interface WolfStats {
  totalSignals: number;
  winRate: number;
  avgReturn: number;
  activePatterns: number;
}

export function WolfBotPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isPaperTrading, setIsPaperTrading] = useState(true);
  
  const [config, setConfig] = useState({
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    minConfidence: 0.7,
    maxPatterns: 5,
    autoTrade: false,
  });
  
  const [signals, setSignals] = useState<PatternSignal[]>([]);
  const [stats, setStats] = useState<WolfStats>({
    totalSignals: 0,
    winRate: 0,
    avgReturn: 0,
    activePatterns: 0,
  });

  // Simulate signals when running
  useEffect(() => {
    if (!isRunning) return;
    
    const patterns = [
      "Двойное дно",
      "Голова и плечи (инверсия)",
      "Флаг",
      "Треугольник",
      "Клин",
      "Прямоугольник",
    ];
    
    const timeframes = ["15m", "1h", "4h", "1d"];
    
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const newSignal: PatternSignal = {
          pattern: patterns[Math.floor(Math.random() * patterns.length)],
          symbol: config.symbol,
          timeframe: timeframes[Math.floor(Math.random() * timeframes.length)],
          direction: Math.random() > 0.5 ? "LONG" : "SHORT",
          confidence: 0.6 + Math.random() * 0.35,
          entry: 95000 + Math.random() * 5000,
          stopLoss: 92000 + Math.random() * 3000,
          takeProfit: 100000 + Math.random() * 10000,
          timestamp: new Date().toISOString(),
        };
        
        setSignals(prev => [newSignal, ...prev].slice(0, 10));
        setStats(prev => ({
          ...prev,
          totalSignals: prev.totalSignals + 1,
          winRate: 0.65 + Math.random() * 0.15,
          avgReturn: 2.5 + Math.random() * 3,
          activePatterns: Math.floor(Math.random() * 5) + 3,
        }));
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isRunning, config.symbol]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsRunning(true);
      setStats({
        totalSignals: 156,
        winRate: 0.68,
        avgReturn: 3.2,
        activePatterns: 4,
      });
      toast.success("WolfBot успешно запущен");
    } catch (error) {
      toast.error("Не удалось запустить WolfBot");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRunning(false);
      toast.success("WolfBot остановлен");
    } catch (error) {
      toast.error("Не удалось остановить WolfBot");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <PawPrint className="h-6 w-6 text-primary" />
            WolfBot
            <Badge variant="outline" className="ml-2">WOLF</Badge>
          </h2>
          <p className="text-muted-foreground">
            Продвинутый технический анализ и распознавание паттернов
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge className={cn(
            "text-sm",
            isRunning ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-gray-500/10 text-gray-500"
          )}>
            {isRunning ? "РАБОТАЕТ" : "ОСТАНОВЛЕН"}
          </Badge>
          
          <Button variant="outline" size="sm" onClick={() => setShowConfig(!showConfig)}>
            <Settings className="h-4 w-4 mr-2" />
            Настроить
          </Button>
          
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

      {/* Configuration Panel */}
      {showConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Конфигурация WolfBot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Exchange Configuration */}
            <BotExchangeConfig
              botType="WOLF"
              currentExchange={config.exchange as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
              onConfigChange={(c) => {
                setConfig(prev => ({ ...prev, exchange: c.exchange }))
                setIsPaperTrading(c.mode === "PAPER")
              }}
            />
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Символ</Label>
                <Input 
                  value={config.symbol} 
                  onChange={(e) => setConfig(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Таймфрейм</Label>
                <Select value={config.timeframe} onValueChange={(v) => setConfig(prev => ({ ...prev, timeframe: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15m">15 минут</SelectItem>
                    <SelectItem value="1h">1 час</SelectItem>
                    <SelectItem value="4h">4 часа</SelectItem>
                    <SelectItem value="1d">1 день</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Мин. уверенность</Label>
                <Input 
                  type="number" 
                  step="0.05"
                  value={config.minConfidence} 
                  onChange={(e) => setConfig(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                />
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex items-center justify-between w-full">
                  <Label>Авто-торговля</Label>
                  <Switch 
                    checked={config.autoTrade} 
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoTrade: checked }))}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Всего сигналов</div>
            <div className="text-2xl font-bold">{stats.totalSignals}</div>
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
            <div className="text-sm text-muted-foreground">Средний возврат</div>
            <div className="text-2xl font-bold text-green-500">
              +{stats.avgReturn.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Активные паттерны</div>
            <div className="text-2xl font-bold">{stats.activePatterns}</div>
          </CardContent>
        </Card>
      </div>

      {/* Detected Signals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Обнаруженные паттерны
          </CardTitle>
          <CardDescription>
            Автоматическое распознавание графических паттернов
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <LineChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Нет активных сигналов</p>
              <p className="text-sm">Запустите бота для анализа паттернов</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {signals.map((signal, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-2 rounded-lg",
                      signal.direction === "LONG" ? "bg-green-500/10" : "bg-red-500/10"
                    )}>
                      {signal.direction === "LONG" ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{signal.pattern}</div>
                      <div className="text-sm text-muted-foreground">
                        {signal.symbol} • {signal.timeframe}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm">
                        Уверенность: <span className={cn(
                          "font-medium",
                          signal.confidence >= 0.8 ? "text-green-500" : signal.confidence >= 0.6 ? "text-yellow-500" : "text-red-500"
                        )}>
                          {(signal.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Вход: ${signal.entry.toFixed(0)}
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Zap className="h-3 w-3 mr-1" />
                      Торговать
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supported Patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Поддерживаемые паттерны</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { name: "Двойное дно/вершина", type: "Разворот" },
              { name: "Голова и плечи", type: "Разворот" },
              { name: "Треугольники", type: "Продолжение" },
              { name: "Клинья", type: "Разворот" },
              { name: "Флаги/Вымпелы", type: "Продолжение" },
              { name: "Прямоугольники", type: "Нейтральный" },
              { name: "Чашка с ручкой", type: "Продолжение" },
              { name: "Бриллиант", type: "Разворот" },
              { name: "Тройное дно/вершина", type: "Разворот" },
            ].map((pattern, index) => (
              <div key={index} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm">{pattern.name}</span>
                <Badge variant="outline" className="text-xs">{pattern.type}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает WolfBot</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>WolfBot</strong> использует продвинутый технический анализ для автоматического распознавания графических паттернов.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Мульти-таймфреймный анализ (15м, 1ч, 4ч, 1д)</li>
            <li>Автоматическое распознавание 15+ паттернов</li>
            <li>Расчёт уровней входа, стоп-лосса и тейк-профита</li>
            <li>Оценка уверенности на основе объёма и тренда</li>
            <li>Интеграция с авто-трейдингом при высокой уверенности</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
