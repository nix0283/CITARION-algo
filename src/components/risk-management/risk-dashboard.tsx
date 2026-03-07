"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Shield,
  Gauge,
  Power,
  TrendingDown,
  Activity,
  BarChart3,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
  Lock,
  Unlock,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type KillSwitchState = 'ARMED' | 'TRIGGERED' | 'RECOVERING' | 'DISARMED';

// =============================================================================
// VAR CALCULATOR PANEL
// =============================================================================

function VaRCalculatorPanel() {
  const [config, setConfig] = useState({
    confidenceLevel: 0.95,
    timeHorizon: 1,
    method: 'historical' as 'historical' | 'parametric' | 'monte_carlo',
    lookbackPeriod: 252,
    portfolioValue: 100000,
  });

  const [varResult, setVarResult] = useState({
    var: 2847.50,
    expectedShortfall: 3912.30,
    riskPercentage: 2.85,
    lastCalculated: new Date(),
  });

  const getRiskLevel = (riskPct: number): RiskLevel => {
    if (riskPct < 2) return 'LOW';
    if (riskPct < 5) return 'MEDIUM';
    if (riskPct < 10) return 'HIGH';
    return 'CRITICAL';
  };

  const riskLevel = getRiskLevel(varResult.riskPercentage);

  return (
    <div className="space-y-6">
      {/* VaR Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Стоимость под Риском</div>
              <div className="text-4xl font-bold text-red-500">
                ${varResult.var.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {config.confidenceLevel * 100}% уверенность, {config.timeHorizon}д горизонт
              </div>
              <Badge
                variant={riskLevel === 'LOW' ? 'secondary' : riskLevel === 'CRITICAL' ? 'destructive' : 'default'}
                className={cn(
                  "mt-4",
                  riskLevel === 'LOW' && "bg-green-500/10 text-green-500",
                  riskLevel === 'MEDIUM' && "bg-yellow-500/10 text-yellow-500",
                  riskLevel === 'HIGH' && "bg-orange-500/10 text-orange-500",
                  riskLevel === 'CRITICAL' && "bg-red-500/10 text-red-500"
                )}
              >
                {riskLevel} РИСК
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-sm text-muted-foreground">Ожидаемый Дефицит (CVaR)</div>
                <div className="text-2xl font-bold">${varResult.expectedShortfall.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Средняя потеря за VaR</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Процент Риска</div>
                <div className="text-2xl font-bold">{varResult.riskPercentage.toFixed(2)}%</div>
                <div className="text-xs text-muted-foreground">От стоимости портфеля</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Стоимость Портфеля</div>
                <div className="text-2xl font-bold">${config.portfolioValue.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Метод</div>
                <div className="text-2xl font-bold capitalize">{config.method.replace('_', ' ')}</div>
              </div>
            </div>

            {/* Risk Gauge */}
            <div className="mt-6">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Низкий</span>
                <span>Средний</span>
                <span>Высокий</span>
                <span>Критический</span>
              </div>
              <div className="h-4 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 via-orange-500 to-red-500 relative">
                <div
                  className="absolute top-0 w-1 h-6 bg-foreground rounded-full -translate-y-1"
                  style={{ left: `${Math.min(varResult.riskPercentage * 5, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Конфигурация VaR</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label>Уровень Доверия</Label>
            <Select 
              value={(config.confidenceLevel * 100).toString()} 
              onValueChange={(v) => setConfig({...config, confidenceLevel: Number(v) / 100})}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="90">90%</SelectItem>
                <SelectItem value="95">95%</SelectItem>
                <SelectItem value="99">99%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Временной Горизонт (дней)</Label>
            <Input 
              type="number" 
              value={config.timeHorizon} 
              onChange={(e) => setConfig({...config, timeHorizon: Number(e.target.value)})} 
            />
          </div>
          <div className="space-y-2">
            <Label>Метод</Label>
            <Select value={config.method} onValueChange={(v: any) => setConfig({...config, method: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="historical">Historical</SelectItem>
                <SelectItem value="parametric">Parametric</SelectItem>
                <SelectItem value="monte_carlo">Monte Carlo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Период Огляждения</Label>
            <Input 
              type="number" 
              value={config.lookbackPeriod} 
              onChange={(e) => setConfig({...config, lookbackPeriod: Number(e.target.value)})} 
            />
          </div>
          <div className="space-y-2">
            <Label>Стоимость Портфеля ($)</Label>
            <Input 
              type="number" 
              value={config.portfolioValue} 
              onChange={(e) => setConfig({...config, portfolioValue: Number(e.target.value)})} 
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// POSITION LIMITER PANEL
// =============================================================================

function PositionLimiterPanel() {
  const [config, setConfig] = useState({
    maxPositionSize: 5000,
    maxTotalExposure: 25000,
    maxPositionsPerSymbol: 1,
    maxTotalPositions: 5,
    maxLeverage: 10,
    maxCorrelation: 0.7,
    maxSectorExposure: 30,
    maxSingleAssetExposure: 20,
  });

  const [currentExposure] = useState({
    total: 18500,
    positions: 3,
    maxLeverageUsed: 5,
    bySymbol: { 'BTCUSDT': 8000, 'ETHUSDT': 6500, 'SOLUSDT': 4000 },
    bySector: { 'Layer1': 14500, 'DeFi': 4000 },
  });

  const exposurePercentage = (currentExposure.total / config.maxTotalExposure) * 100;

  return (
    <div className="space-y-6">
      {/* Exposure Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Exposure</div>
            <div className="text-2xl font-bold">${currentExposure.total.toLocaleString()}</div>
            <Progress value={exposurePercentage} className="mt-2 h-2" />
            <div className="text-xs text-muted-foreground mt-1">
              {exposurePercentage.toFixed(0)}% of limit
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Open Positions</div>
            <div className="text-2xl font-bold">{currentExposure.positions} / {config.maxTotalPositions}</div>
            <Progress value={(currentExposure.positions / config.maxTotalPositions) * 100} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Max Leverage Used</div>
            <div className="text-2xl font-bold">{currentExposure.maxLeverageUsed}x</div>
            <div className="text-xs text-muted-foreground">Limit: {config.maxLeverage}x</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Available Margin</div>
            <div className="text-2xl font-bold text-green-500">
              ${(config.maxTotalExposure - currentExposure.total).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exposure by Symbol */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Exposure by Symbol</CardTitle>
          <CardDescription>Current position sizes as percentage of limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(currentExposure.bySymbol).map(([symbol, exposure]) => (
              <div key={symbol} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-mono">{symbol}</span>
                  <span>${exposure.toLocaleString()} ({((exposure / config.maxPositionSize) * 100).toFixed(0)}%)</span>
                </div>
                <Progress 
                  value={(exposure / config.maxPositionSize) * 100} 
                  className="h-2"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Limits Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Position Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Max Position Size ($)</Label>
            <Input type="number" value={config.maxPositionSize} onChange={(e) => setConfig({...config, maxPositionSize: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Total Exposure ($)</Label>
            <Input type="number" value={config.maxTotalExposure} onChange={(e) => setConfig({...config, maxTotalExposure: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Positions/Symbol</Label>
            <Input type="number" value={config.maxPositionsPerSymbol} onChange={(e) => setConfig({...config, maxPositionsPerSymbol: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Total Positions</Label>
            <Input type="number" value={config.maxTotalPositions} onChange={(e) => setConfig({...config, maxTotalPositions: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Leverage</Label>
            <Input type="number" value={config.maxLeverage} onChange={(e) => setConfig({...config, maxLeverage: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Correlation</Label>
            <Input type="number" step="0.1" value={config.maxCorrelation} onChange={(e) => setConfig({...config, maxCorrelation: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Sector Exposure (%)</Label>
            <Input type="number" value={config.maxSectorExposure} onChange={(e) => setConfig({...config, maxSectorExposure: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Single Asset (%)</Label>
            <Input type="number" value={config.maxSingleAssetExposure} onChange={(e) => setConfig({...config, maxSingleAssetExposure: Number(e.target.value)})} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// DRAWDOWN MONITOR PANEL
// =============================================================================

function DrawdownMonitorPanel() {
  const [thresholds, setThresholds] = useState({
    warning: 5,
    critical: 10,
    breach: 20,
    recoveryThreshold: 3,
  });

  const [drawdownState] = useState({
    current: 3.2,
    max: 8.5,
    duration: 120000,
    level: 'none' as 'none' | 'warning' | 'critical' | 'breach',
    daily: 1.2,
    weekly: 3.2,
    monthly: 5.8,
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'none': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-orange-500';
      case 'breach': return 'text-red-500';
      default: return 'text-green-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Drawdown */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Current Drawdown</div>
                <div className={cn("text-5xl font-bold", getLevelColor(drawdownState.level))}>
                  {drawdownState.current.toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <Badge
                  variant={drawdownState.level === 'none' ? 'secondary' : 'destructive'}
                  className={cn(
                    "text-lg px-4 py-2",
                    drawdownState.level === 'none' && "bg-green-500/10 text-green-500",
                    drawdownState.level === 'warning' && "bg-yellow-500/10 text-yellow-500",
                    drawdownState.level === 'critical' && "bg-orange-500/10 text-orange-500",
                    drawdownState.level === 'breach' && "bg-red-500/10 text-red-500"
                  )}
                >
                  {drawdownState.level.toUpperCase()}
                </Badge>
                <div className="text-sm text-muted-foreground mt-2">
                  Duration: {Math.floor(drawdownState.duration / 60000)}m
                </div>
              </div>
            </div>

            {/* Drawdown Gauge */}
            <div className="mt-6">
              <div className="flex justify-between text-xs mb-1">
                <span>0%</span>
                <span className="text-yellow-500">Warning {thresholds.warning}%</span>
                <span className="text-orange-500">Critical {thresholds.critical}%</span>
                <span className="text-red-500">Breach {thresholds.breach}%</span>
              </div>
              <div className="h-6 rounded-full bg-muted relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-1/4 bg-green-500/20" />
                <div className="absolute inset-y-0 left-1/4 w-1/4 bg-yellow-500/20" />
                <div className="absolute inset-y-0 left-2/4 w-1/4 bg-orange-500/20" />
                <div className="absolute inset-y-0 left-3/4 w-1/4 bg-red-500/20" />
                <div
                  className="absolute top-0 w-1 h-8 bg-foreground rounded-full"
                  style={{ left: `${Math.min(drawdownState.current * 4, 99)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Max Drawdown</div>
            <div className="text-3xl font-bold text-red-500">{drawdownState.max.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-2">Historical maximum</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Recovery Required</div>
            <div className="text-3xl font-bold">{(drawdownState.current / (1 - drawdownState.current / 100)).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-2">To break even</div>
          </CardContent>
        </Card>
      </div>

      {/* Time-based Drawdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Drawdown by Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg border border-border">
              <div className="text-sm text-muted-foreground">Daily</div>
              <div className={cn(
                "text-2xl font-bold",
                drawdownState.daily > thresholds.warning ? "text-yellow-500" : "text-foreground"
              )}>
                {drawdownState.daily.toFixed(1)}%
              </div>
            </div>
            <div className="text-center p-4 rounded-lg border border-border">
              <div className="text-sm text-muted-foreground">Weekly</div>
              <div className={cn(
                "text-2xl font-bold",
                drawdownState.weekly > thresholds.warning ? "text-yellow-500" : "text-foreground"
              )}>
                {drawdownState.weekly.toFixed(1)}%
              </div>
            </div>
            <div className="text-center p-4 rounded-lg border border-border">
              <div className="text-sm text-muted-foreground">Monthly</div>
              <div className={cn(
                "text-2xl font-bold",
                drawdownState.monthly > thresholds.critical ? "text-orange-500" : "text-foreground"
              )}>
                {drawdownState.monthly.toFixed(1)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Drawdown Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              Warning (%)
            </Label>
            <Input type="number" value={thresholds.warning} onChange={(e) => setThresholds({...thresholds, warning: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              Critical (%)
            </Label>
            <Input type="number" value={thresholds.critical} onChange={(e) => setThresholds({...thresholds, critical: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              Breach (%)
            </Label>
            <Input type="number" value={thresholds.breach} onChange={(e) => setThresholds({...thresholds, breach: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Recovery Threshold (%)</Label>
            <Input type="number" value={thresholds.recoveryThreshold} onChange={(e) => setThresholds({...thresholds, recoveryThreshold: Number(e.target.value)})} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// KILL SWITCH PANEL
// =============================================================================

function KillSwitchPanel() {
  const [state, setState] = useState<KillSwitchState>('ARMED');
  const [config, setConfig] = useState({
    autoTrigger: true,
    drawdownTrigger: true,
    varBreachTrigger: true,
    correlationTrigger: false,
    liquidityTrigger: true,
    drawdownThreshold: 15,
    varMultiplier: 2,
    correlationLimit: 0.9,
    liquidityMin: 1000,
    recoveryMode: 'manual' as 'automatic' | 'manual',
    recoveryCooldown: 300000,
  });

  const [stats] = useState({
    positionsClosed: 0,
    pnlSaved: 0,
    triggerHistory: [
      { id: '1', timestamp: Date.now() - 86400000, trigger: 'drawdown', recovered: true },
    ],
  });

  const handleArm = () => setState('ARMED');
  const handleDisarm = () => setState('DISARMED');
  const handleTrigger = () => setState('TRIGGERED');
  const handleRecover = () => {
    setState('RECOVERING');
    setTimeout(() => setState('ARMED'), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Kill Switch Status */}
      <Card className={cn(
        "border-2",
        state === 'ARMED' && "border-green-500/50",
        state === 'TRIGGERED' && "border-red-500/50",
        state === 'RECOVERING' && "border-yellow-500/50",
        state === 'DISARMED' && "border-gray-500/50"
      )}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-4 rounded-full",
                state === 'ARMED' && "bg-green-500/10",
                state === 'TRIGGERED' && "bg-red-500/10",
                state === 'RECOVERING' && "bg-yellow-500/10",
                state === 'DISARMED' && "bg-gray-500/10"
              )}>
                {state === 'ARMED' && <Lock className="h-8 w-8 text-green-500" />}
                {state === 'TRIGGERED' && <AlertCircle className="h-8 w-8 text-red-500" />}
                {state === 'RECOVERING' && <RefreshCw className="h-8 w-8 text-yellow-500 animate-spin" />}
                {state === 'DISARMED' && <Unlock className="h-8 w-8 text-gray-500" />}
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Kill Switch State</div>
                <div className={cn(
                  "text-3xl font-bold",
                  state === 'ARMED' && "text-green-500",
                  state === 'TRIGGERED' && "text-red-500",
                  state === 'RECOVERING' && "text-yellow-500",
                  state === 'DISARMED' && "text-gray-500"
                )}>
                  {state}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {state === 'ARMED' && (
                <>
                  <Button variant="destructive" onClick={handleTrigger}>
                    <Power className="h-4 w-4 mr-2" />
                    TRIGGER
                  </Button>
                  <Button variant="outline" onClick={handleDisarm}>
                    <Unlock className="h-4 w-4 mr-2" />
                    Disarm
                  </Button>
                </>
              )}
              {state === 'TRIGGERED' && (
                <Button onClick={handleRecover}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recover
                </Button>
              )}
              {state === 'DISARMED' && (
                <Button onClick={handleArm}>
                  <Lock className="h-4 w-4 mr-2" />
                  Arm
                </Button>
              )}
              {state === 'RECOVERING' && (
                <Badge variant="secondary">Recovering...</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Positions Closed</div>
            <div className="text-2xl font-bold">{stats.positionsClosed}</div>
            <div className="text-xs text-muted-foreground">Total by kill switch</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">PnL Saved</div>
            <div className="text-2xl font-bold text-green-500">${stats.pnlSaved}</div>
            <div className="text-xs text-muted-foreground">By early termination</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Trigger History</div>
            <div className="text-2xl font-bold">{stats.triggerHistory.length}</div>
            <div className="text-xs text-muted-foreground">Total triggers</div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kill Switch Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Label>Auto Trigger Enabled</Label>
            <Switch checked={config.autoTrigger} onCheckedChange={(v) => setConfig({...config, autoTrigger: v})} />
          </div>

          <Separator />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={config.drawdownTrigger} onCheckedChange={(v) => setConfig({...config, drawdownTrigger: v})} />
              <Label>Drawdown</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={config.varBreachTrigger} onCheckedChange={(v) => setConfig({...config, varBreachTrigger: v})} />
              <Label>VaR Breach</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={config.correlationTrigger} onCheckedChange={(v) => setConfig({...config, correlationTrigger: v})} />
              <Label>Correlation</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={config.liquidityTrigger} onCheckedChange={(v) => setConfig({...config, liquidityTrigger: v})} />
              <Label>Liquidity</Label>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Drawdown Threshold (%)</Label>
              <Input type="number" value={config.drawdownThreshold} onChange={(e) => setConfig({...config, drawdownThreshold: Number(e.target.value)})} />
            </div>
            <div className="space-y-2">
              <Label>VaR Multiplier</Label>
              <Input type="number" value={config.varMultiplier} onChange={(e) => setConfig({...config, varMultiplier: Number(e.target.value)})} />
            </div>
            <div className="space-y-2">
              <Label>Correlation Limit</Label>
              <Input type="number" step="0.1" value={config.correlationLimit} onChange={(e) => setConfig({...config, correlationLimit: Number(e.target.value)})} />
            </div>
            <div className="space-y-2">
              <Label>Min Liquidity ($)</Label>
              <Input type="number" value={config.liquidityMin} onChange={(e) => setConfig({...config, liquidityMin: Number(e.target.value)})} />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Recovery Mode</Label>
              <Select value={config.recoveryMode} onValueChange={(v: any) => setConfig({...config, recoveryMode: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recovery Cooldown (ms)</Label>
              <Input type="number" value={config.recoveryCooldown} onChange={(e) => setConfig({...config, recoveryCooldown: Number(e.target.value)})} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// MAIN RISK DASHBOARD
// =============================================================================

export function RiskDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold">Управление Рисками</h1>
            <p className="text-muted-foreground">Мониторинг и контроль торговых рисков</p>
          </div>
        </div>
        <Badge variant="outline" className="px-4 py-2 bg-green-500/10 text-green-500 border-green-500/30">
          Система Защищена
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="var" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            VaR
          </TabsTrigger>
          <TabsTrigger value="limits" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Лимиты
          </TabsTrigger>
          <TabsTrigger value="drawdown" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Просадка
          </TabsTrigger>
          <TabsTrigger value="killswitch" className="flex items-center gap-2">
            <Power className="h-4 w-4" />
            Kill Switch
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Оценка Риска</div>
                    <div className="text-2xl font-bold">32/100</div>
                  </div>
                  <Badge className="bg-green-500/10 text-green-500">НИЗКИЙ</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">VaR (95%)</div>
                    <div className="text-2xl font-bold">$2,847</div>
                  </div>
                  <BarChart3 className="h-6 w-6 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Просадка</div>
                    <div className="text-2xl font-bold">3.2%</div>
                  </div>
                  <TrendingDown className="h-6 w-6 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Kill Switch</div>
                    <div className="text-2xl font-bold text-green-500">ВКЛЮЧЁН</div>
                  </div>
                  <Lock className="h-6 w-6 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Access */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <VaRCalculatorPanel />
            <KillSwitchPanel />
          </div>
        </TabsContent>

        <TabsContent value="var" className="mt-6">
          <VaRCalculatorPanel />
        </TabsContent>

        <TabsContent value="limits" className="mt-6">
          <PositionLimiterPanel />
        </TabsContent>

        <TabsContent value="drawdown" className="mt-6">
          <DrawdownMonitorPanel />
        </TabsContent>

        <TabsContent value="killswitch" className="mt-6">
          <KillSwitchPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default RiskDashboard;
