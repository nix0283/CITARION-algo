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
  Minus,
  Play,
  Pause,
  RefreshCw,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  BarChart3,
  Exchange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";

interface RangeLevel {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE' | 'MID';
  touches: number;
  strength: number;
}

interface RangeState {
  symbol: string;
  rangeHigh: number;
  rangeLow: number;
  rangeMid: number;
  rangeWidth: number;
  inRange: boolean;
  position: 'TOP' | 'BOTTOM' | 'MIDDLE';
  breakout: 'UPSIDE' | 'DOWNSIDE' | null;
  timeInRange: number;
}

interface RangePosition {
  id: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  pnlPercent: number;
}

interface RangeSignal {
  type: 'BUY' | 'SELL' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'BREAKOUT_UP' | 'BREAKOUT_DOWN';
  price: number;
  confidence: number;
  reason: string;
  rangePosition: number;
  oscillatorConfirm: boolean;
}

interface RangeConfig {
  symbol: string;
  lookbackPeriod: number;
  minTouches: number;
  touchThreshold: number;
  maxRangeWidth: number;
  minRangeWidth: number;
  entryFromSupport: number;
  entryFromResistance: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  useRSI: boolean;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  useStochastic: boolean;
  breakoutConfirmation: number;
  positionSize: number;
  maxPositions: number;
}

const DEFAULT_CONFIG: RangeConfig = {
  symbol: 'BTCUSDT',
  lookbackPeriod: 50,
  minTouches: 2,
  touchThreshold: 0.3,
  maxRangeWidth: 5,
  minRangeWidth: 0.5,
  entryFromSupport: 0.2,
  entryFromResistance: 0.2,
  takeProfitPercent: 1.5,
  stopLossPercent: 1.0,
  useRSI: true,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  useStochastic: false,
  breakoutConfirmation: 0.5,
  positionSize: 100,
  maxPositions: 3,
};

export function RangeBotManager() {
  const [config, setConfig] = useState<RangeConfig>(DEFAULT_CONFIG);
  const [rangeState, setRangeState] = useState<RangeState | null>(null);
  const [levels, setLevels] = useState<RangeLevel[]>([]);
  const [positions, setPositions] = useState<RangePosition[]>([]);
  const [signals, setSignals] = useState<RangeSignal[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isPaperTrading, setIsPaperTrading] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<string>("binance");

  const runScan = async () => {
    setIsScanning(true);
    try {
      // Generate simulated price data for demo
      const basePrice = 95000;
      const prices: number[] = [];
      for (let i = 0; i < 100; i++) {
        // Simulate ranging market
        const range = 500; // $500 range
        const noise = (Math.random() - 0.5) * 100;
        const oscillation = Math.sin(i / 10) * (range / 2);
        prices.push(basePrice + oscillation + noise);
      }

      const response = await fetch("/api/bots/range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", prices, config }),
      });
      
      const data = await response.json();
      if (data.success) {
        setRangeState(data.state.rangeState);
        setLevels(data.state.levels);
        toast.success("Range анализ завершён");
      }
    } catch (error) {
      toast.error("Ошибка сканирования");
    } finally {
      setIsScanning(false);
    }
  };

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'TOP': return 'text-red-500';
      case 'BOTTOM': return 'text-green-500';
      default: return 'text-muted-foreground';
    }
  };

  const getSignalBadge = (type: string) => {
    switch (type) {
      case 'BUY':
        return <Badge className="bg-green-500">BUY</Badge>;
      case 'SELL':
        return <Badge className="bg-red-500">SELL</Badge>;
      case 'BREAKOUT_UP':
        return <Badge className="bg-blue-500">BREAKOUT ↑</Badge>;
      case 'BREAKOUT_DOWN':
        return <Badge className="bg-orange-500">BREAKOUT ↓</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Minus className="h-6 w-6 text-primary" />
            Range Bot
            <span className="text-sm font-normal text-muted-foreground">(Range Trading)</span>
          </h2>
          <p className="text-muted-foreground">
            Автоматическая торговля в боковом рынке между поддержкой и сопротивлением
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isActive ? "default" : "outline"} className={isActive ? "bg-green-500" : ""}>
            {isActive ? "Активен" : "Остановлен"}
          </Badge>
          <Button onClick={() => setIsActive(!isActive)} variant="outline">
            {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isActive ? "Стоп" : "Старт"}
          </Button>
        </div>
      </div>

      {/* Range Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Текущий Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 relative border rounded-lg p-4 bg-muted/20">
            {/* Resistance Line */}
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-red-400" />
            <div className="absolute top-2 right-4 text-xs text-red-400 font-mono">
              R: ${rangeState?.rangeHigh.toFixed(2) ?? '---'}
            </div>
            
            {/* Mid Line */}
            <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-primary/50 border-dashed" />
            <div className="absolute top-1/2 right-4 text-xs text-primary/70 -translate-y-1/2 font-mono">
              Mid: ${rangeState?.rangeMid.toFixed(2) ?? '---'}
            </div>
            
            {/* Support Line */}
            <div className="absolute bottom-4 left-4 right-4 h-0.5 bg-green-400" />
            <div className="absolute bottom-2 right-4 text-xs text-green-400 font-mono">
              S: ${rangeState?.rangeLow.toFixed(2) ?? '---'}
            </div>

            {/* Current Price Indicator */}
            {rangeState && (
              <div 
                className={cn(
                  "absolute left-1/2 w-3 h-3 rounded-full -translate-x-1/2 animate-pulse",
                  rangeState.position === 'BOTTOM' ? "bg-green-500" :
                  rangeState.position === 'TOP' ? "bg-red-500" : "bg-primary"
                )}
                style={{
                  top: rangeState.position === 'TOP' ? '20%' :
                       rangeState.position === 'BOTTOM' ? '80%' : '50%'
                }}
              />
            )}

            {/* Range Width Indicator */}
            {rangeState && (
              <div className="absolute bottom-12 left-4 text-xs text-muted-foreground">
                Width: {rangeState.rangeWidth.toFixed(2)}% | Time in range: {rangeState.timeInRange} periods
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Range Stats */}
      {rangeState && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-sm text-muted-foreground">Position</div>
              <div className={cn("text-lg font-bold", getPositionColor(rangeState.position))}>
                {rangeState.position}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-sm text-muted-foreground">Range Width</div>
              <div className="text-lg font-bold">{rangeState.rangeWidth.toFixed(2)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-sm text-muted-foreground">In Range</div>
              <Badge className={rangeState.inRange ? "bg-green-500" : "bg-red-500"}>
                {rangeState.inRange ? "YES" : "NO"}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-sm text-muted-foreground">Breakout</div>
              <div className="text-lg font-bold">
                {rangeState.breakout ?? "None"}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scan Button */}
      <Button onClick={runScan} disabled={isScanning} className="w-full">
        {isScanning ? (
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Activity className="h-4 w-4 mr-2" />
        )}
        {isScanning ? "Анализ range..." : "Определить Range"}
      </Button>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Конфигурация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Exchange Configuration */}
          <BotExchangeConfig
            botType="RANGE"
            currentExchange={selectedExchange as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
            onConfigChange={(config) => {
              setSelectedExchange(config.exchange);
              if (config.mode === "PAPER") {
                setIsPaperTrading(true);
              } else {
                setIsPaperTrading(false);
              }
            }}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Lookback Period</Label>
              <Input
                type="number"
                value={config.lookbackPeriod}
                onChange={(e) => setConfig({ ...config, lookbackPeriod: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Min Touches</Label>
              <Input
                type="number"
                value={config.minTouches}
                onChange={(e) => setConfig({ ...config, minTouches: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Range Width %</Label>
              <Input
                type="number"
                step="0.1"
                value={config.maxRangeWidth}
                onChange={(e) => setConfig({ ...config, maxRangeWidth: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Position Size (USDT)</Label>
              <Input
                type="number"
                value={config.positionSize}
                onChange={(e) => setConfig({ ...config, positionSize: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Entry from Support %: {config.entryFromSupport}</Label>
              <Slider
                value={[config.entryFromSupport]}
                onValueChange={([v]) => setConfig({ ...config, entryFromSupport: v })}
                min={0.1} max={1} step={0.1}
              />
            </div>
            <div className="space-y-2">
              <Label>Take Profit %: {config.takeProfitPercent}</Label>
              <Slider
                value={[config.takeProfitPercent]}
                onValueChange={([v]) => setConfig({ ...config, takeProfitPercent: v })}
                min={0.5} max={5} step={0.1}
              />
            </div>
            <div className="space-y-2">
              <Label>Stop Loss %: {config.stopLossPercent}</Label>
              <Slider
                value={[config.stopLossPercent]}
                onValueChange={([v]) => setConfig({ ...config, stopLossPercent: v })}
                min={0.5} max={3} step={0.1}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.useRSI}
                onCheckedChange={(checked) => setConfig({ ...config, useRSI: checked })}
              />
              <Label>Use RSI</Label>
            </div>
            {config.useRSI && (
              <div className="flex gap-2">
                <span className="text-xs text-muted-foreground">
                  Oversold: {config.rsiOversold} | Overbought: {config.rsiOverbought}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Positions */}
      {positions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Активные позиции</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {positions.map((pos) => (
              <div key={pos.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className={pos.type === 'LONG' ? "bg-green-500" : "bg-red-500"}>
                      {pos.type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Entry: ${pos.entryPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    SL: ${pos.stopLoss.toFixed(2)} | TP: ${pos.takeProfit.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("text-lg font-bold", pos.pnl >= 0 ? "text-green-500" : "text-red-500")}>
                    ${pos.pnl.toFixed(2)}
                  </div>
                  <div className={cn("text-xs", pos.pnlPercent >= 0 ? "text-green-500" : "text-red-500")}>
                    {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Detected Levels */}
      {levels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Обнаруженные уровни</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {levels.map((level, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <Badge variant={level.type === 'SUPPORT' ? "default" : "destructive"}
                      className={level.type === 'SUPPORT' ? "bg-green-500" : ""}>
                      {level.type}
                    </Badge>
                    <span className="font-mono">${level.price.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Touches: {level.touches}</span>
                    <span>Strength: {(level.strength * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Как работает Range Bot
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Range Bot автоматически определяет границы бокового движения и торгует от поддержки к сопротивлению.</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Range Detection:</strong> Автоматическое определение support/resistance</li>
            <li><strong>Oscillator Confirmation:</strong> RSI и Stochastic для подтверждения</li>
            <li><strong>Buy at Support:</strong> Покупка у нижней границы range</li>
            <li><strong>Sell at Resistance:</strong> Продажа у верхней границы range</li>
            <li><strong>Breakout Detection:</strong> Обнаружение выхода из range</li>
            <li><strong>Auto SL/TP:</strong> Автоматические стоп-лоссы и тейк-профиты</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            Ideal for sideways/consolidation markets. Avoid using during strong trends.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
