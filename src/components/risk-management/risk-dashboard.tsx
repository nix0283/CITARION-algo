"use client";

import { useState, useEffect, useCallback } from "react";
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
  Bot,
  Radio,
  Signal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRiskMonitor, type RiskState, type KillSwitchState, type RiskAlert, type BotSummary } from "@/hooks/use-risk-monitor";

// =============================================================================
// TYPES
// =============================================================================

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type KillSwitchStateType = 'ARMED' | 'TRIGGERED' | 'RECOVERING' | 'DISARMED';

interface ApiRiskReport {
  timestamp: number;
  var: {
    var: number;
    expectedShortfall: number;
    confidenceLevel: number;
    riskPercentage: number;
  };
  exposure: {
    total: number;
    bySymbol: Record<string, number>;
    byExchange: Record<string, number>;
  };
  drawdown: {
    state: {
      currentDrawdown: number;
      level: string;
      duration: number;
    };
    daily: number;
    weekly: number;
    monthly: number;
  };
  riskScore: number;
  recommendations: string[];
  volatilityRegime: string;
  garchAdjustments: {
    varMultiplier: number;
    positionSizeMultiplier: number;
    stopLossMultiplier: number;
  };
  bots: {
    total: number;
    running: number;
    stopped: number;
    riskLevel: string;
  };
  killSwitch: {
    isArmed: boolean;
    isTriggered: boolean;
    triggerReason?: string;
    botsStopped: number;
  };
}

// =============================================================================
// VAR CALCULATOR PANEL
// =============================================================================

function VaRCalculatorPanel({ report }: { report: ApiRiskReport | null }) {
  const [config, setConfig] = useState({
    confidenceLevel: 0.95,
    timeHorizon: 1,
    method: 'historical' as 'historical' | 'parametric' | 'monte_carlo',
    portfolioValue: 100000,
  });

  const varData = report?.var;
  const riskPct = varData?.riskPercentage || 2.85;
  
  const getRiskLevel = (riskPct: number): RiskLevel => {
    if (riskPct < 2) return 'LOW';
    if (riskPct < 5) return 'MEDIUM';
    if (riskPct < 10) return 'HIGH';
    return 'CRITICAL';
  };

  const riskLevel = getRiskLevel(riskPct);

  return (
    <div className="space-y-6">
      {/* VaR Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Стоимость под Риском</div>
              <div className="text-4xl font-bold text-red-500">
                ${(varData?.var || 2847.50).toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {((varData?.confidenceLevel || 0.95) * 100)}% уверенность, {config.timeHorizon}д горизонт
              </div>
              <Badge
                variant="outline"
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
                <div className="text-2xl font-bold">${(varData?.expectedShortfall || 3912.30).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Средняя потеря за VaR</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Процент Риска</div>
                <div className="text-2xl font-bold">{riskPct.toFixed(2)}%</div>
                <div className="text-xs text-muted-foreground">От стоимости портфеля</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Волатильность (GARCH)</div>
                <div className={cn(
                  "text-2xl font-bold",
                  report?.volatilityRegime === 'extreme' && "text-red-500",
                  report?.volatilityRegime === 'high' && "text-orange-500",
                  report?.volatilityRegime === 'low' && "text-green-500",
                )}>
                  {(report?.volatilityRegime || 'normal').toUpperCase()}
                </div>
                <div className="text-xs text-muted-foreground">Текущий режим</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">VaR Множитель</div>
                <div className="text-2xl font-bold">{(report?.garchAdjustments?.varMultiplier || 1.0).toFixed(2)}x</div>
                <div className="text-xs text-muted-foreground">Скорректированный</div>
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
                  style={{ left: `${Math.min(riskPct * 5, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GARCH Adjustments Card */}
      {report?.garchAdjustments && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Signal className="h-5 w-5 text-primary" />
              GARCH Регулировки Риска
            </CardTitle>
            <CardDescription>
              Автоматические корректировки на основе прогноза волатильности
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-secondary/50 text-center">
                <div className="text-sm text-muted-foreground">VaR Множитель</div>
                <div className="text-2xl font-bold">{report.garchAdjustments.varMultiplier.toFixed(2)}x</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 text-center">
                <div className="text-sm text-muted-foreground">Размер Позиции</div>
                <div className="text-2xl font-bold">{(report.garchAdjustments.positionSizeMultiplier * 100).toFixed(0)}%</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/50 text-center">
                <div className="text-sm text-muted-foreground">Stop-Loss</div>
                <div className="text-2xl font-bold">{report.garchAdjustments.stopLossMultiplier.toFixed(2)}x</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Конфигурация VaR</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

function PositionLimiterPanel({ report }: { report: ApiRiskReport | null }) {
  const [config, setConfig] = useState({
    maxPositionSize: 5000,
    maxTotalExposure: 25000,
    maxPositionsPerSymbol: 1,
    maxTotalPositions: 5,
    maxLeverage: 10,
  });

  const exposure = report?.exposure;
  const totalExposure = exposure?.total || 0;
  const exposurePercentage = (totalExposure / config.maxTotalExposure) * 100;

  return (
    <div className="space-y-6">
      {/* Exposure Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Exposure</div>
            <div className="text-2xl font-bold">${totalExposure.toLocaleString()}</div>
            <Progress value={exposurePercentage} className="mt-2 h-2" />
            <div className="text-xs text-muted-foreground mt-1">
              {exposurePercentage.toFixed(0)}% of limit
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active Bots</div>
            <div className="text-2xl font-bold">{report?.bots?.running || 0} / {report?.bots?.total || 0}</div>
            <Progress value={((report?.bots?.running || 0) / Math.max(report?.bots?.total || 1, 1)) * 100} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Bot Risk Level</div>
            <div className={cn(
              "text-2xl font-bold capitalize",
              report?.bots?.riskLevel === 'critical' && "text-red-500",
              report?.bots?.riskLevel === 'high' && "text-orange-500",
              report?.bots?.riskLevel === 'medium' && "text-yellow-500",
              report?.bots?.riskLevel === 'low' && "text-green-500",
            )}>
              {(report?.bots?.riskLevel || 'low').toUpperCase()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Available Margin</div>
            <div className="text-2xl font-bold text-green-500">
              ${(config.maxTotalExposure - totalExposure).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exposure by Symbol */}
      {exposure?.bySymbol && Object.keys(exposure.bySymbol).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Exposure by Symbol</CardTitle>
            <CardDescription>Current position sizes as percentage of limits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(exposure.bySymbol).map(([symbol, exp]) => (
                <div key={symbol} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-mono">{symbol}</span>
                    <span>${exp.toLocaleString()} ({((exp / config.maxPositionSize) * 100).toFixed(0)}%)</span>
                  </div>
                  <Progress 
                    value={(exp / config.maxPositionSize) * 100} 
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Limits Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Position Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// DRAWDOWN MONITOR PANEL
// =============================================================================

function DrawdownMonitorPanel({ report }: { report: ApiRiskReport | null }) {
  const [thresholds, setThresholds] = useState({
    warning: 5,
    critical: 10,
    breach: 20,
    recoveryThreshold: 3,
  });

  const drawdown = report?.drawdown;
  const currentDrawdown = drawdown?.state?.currentDrawdown || 0;
  const level = drawdown?.state?.level || 'none';

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
                <div className={cn("text-5xl font-bold", getLevelColor(level))}>
                  {currentDrawdown.toFixed(1)}%
                </div>
              </div>
              <div className="text-right">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-lg px-4 py-2",
                    level === 'none' && "bg-green-500/10 text-green-500",
                    level === 'warning' && "bg-yellow-500/10 text-yellow-500",
                    level === 'critical' && "bg-orange-500/10 text-orange-500",
                    level === 'breach' && "bg-red-500/10 text-red-500"
                  )}
                >
                  {level.toUpperCase()}
                </Badge>
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
                  style={{ left: `${Math.min(currentDrawdown * 4, 99)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Daily Drawdown</div>
            <div className={cn(
              "text-3xl font-bold",
              (drawdown?.daily || 0) > thresholds.warning ? "text-yellow-500" : "text-foreground"
            )}>
              {((drawdown?.daily || 0) * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Recovery Required</div>
            <div className="text-3xl font-bold">
              {currentDrawdown > 0 ? (currentDrawdown / (1 - currentDrawdown / 100)).toFixed(1) : 0}%
            </div>
            <div className="text-xs text-muted-foreground">To break even</div>
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
                ((drawdown?.daily || 0) * 100) > thresholds.warning ? "text-yellow-500" : "text-foreground"
              )}>
                {((drawdown?.daily || 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="text-center p-4 rounded-lg border border-border">
              <div className="text-sm text-muted-foreground">Weekly</div>
              <div className={cn(
                "text-2xl font-bold",
                ((drawdown?.weekly || 0) * 100) > thresholds.warning ? "text-yellow-500" : "text-foreground"
              )}>
                {((drawdown?.weekly || 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="text-center p-4 rounded-lg border border-border">
              <div className="text-sm text-muted-foreground">Monthly</div>
              <div className={cn(
                "text-2xl font-bold",
                ((drawdown?.monthly || 0) * 100) > thresholds.critical ? "text-orange-500" : "text-foreground"
              )}>
                {((drawdown?.monthly || 0) * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// KILL SWITCH PANEL
// =============================================================================

function KillSwitchPanel({ 
  report, 
  wsKillSwitch, 
  onTrigger, 
  onArm, 
  onDisarm, 
  onRecover,
  isConnected 
}: { 
  report: ApiRiskReport | null;
  wsKillSwitch: KillSwitchState | null;
  onTrigger: (reason?: string) => void;
  onArm: () => void;
  onDisarm: () => void;
  onRecover: () => void;
  isConnected: boolean;
}) {
  const [triggerReason, setTriggerReason] = useState("");

  // Use WebSocket data if available, else use API data
  const killSwitch = wsKillSwitch || report?.killSwitch || {
    isArmed: true,
    isTriggered: false,
    botsStopped: 0,
  };

  const getStateDisplay = (): KillSwitchStateType => {
    if (killSwitch.isTriggered) return 'TRIGGERED';
    if (!killSwitch.isArmed) return 'DISARMED';
    return 'ARMED';
  };

  const state = getStateDisplay();

  const handleTrigger = () => {
    onTrigger(triggerReason || "Manual trigger from dashboard");
    setTriggerReason("");
  };

  return (
    <div className="space-y-6">
      {/* WebSocket Status */}
      <div className="flex items-center gap-2">
        <Radio className={cn("h-4 w-4", isConnected ? "text-green-500" : "text-red-500")} />
        <span className="text-sm text-muted-foreground">
          {isConnected ? "WebSocket подключен" : "WebSocket отключен"}
        </span>
      </div>

      {/* Kill Switch Status */}
      <Card className={cn(
        "border-2",
        state === 'ARMED' && "border-green-500/50",
        state === 'TRIGGERED' && "border-red-500/50",
        state === 'DISARMED' && "border-gray-500/50"
      )}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-4 rounded-full",
                state === 'ARMED' && "bg-green-500/10",
                state === 'TRIGGERED' && "bg-red-500/10",
                state === 'DISARMED' && "bg-gray-500/10"
              )}>
                {state === 'ARMED' && <Lock className="h-8 w-8 text-green-500" />}
                {state === 'TRIGGERED' && <AlertCircle className="h-8 w-8 text-red-500" />}
                {state === 'DISARMED' && <Unlock className="h-8 w-8 text-gray-500" />}
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Kill Switch State</div>
                <div className={cn(
                  "text-3xl font-bold",
                  state === 'ARMED' && "text-green-500",
                  state === 'TRIGGERED' && "text-red-500",
                  state === 'DISARMED' && "text-gray-500"
                )}>
                  {state}
                </div>
                {killSwitch.triggerReason && (
                  <div className="text-sm text-red-500 mt-1">
                    Reason: {killSwitch.triggerReason}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {state === 'ARMED' && (
                <>
                  <Button variant="destructive" onClick={handleTrigger}>
                    <Power className="h-4 w-4 mr-2" />
                    TRIGGER
                  </Button>
                  <Button variant="outline" onClick={onDisarm}>
                    <Unlock className="h-4 w-4 mr-2" />
                    Disarm
                  </Button>
                </>
              )}
              {state === 'TRIGGERED' && (
                <Button onClick={onRecover}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recover
                </Button>
              )}
              {state === 'DISARMED' && (
                <Button onClick={onArm}>
                  <Lock className="h-4 w-4 mr-2" />
                  Arm
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Bots Stopped</div>
            <div className="text-2xl font-bold">{killSwitch.botsStopped}</div>
            <div className="text-xs text-muted-foreground">By kill switch</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Running Bots</div>
            <div className="text-2xl font-bold text-green-500">{report?.bots?.running || 0}</div>
            <div className="text-xs text-muted-foreground">Currently active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Bots</div>
            <div className="text-2xl font-bold">{report?.bots?.total || 0}</div>
            <div className="text-xs text-muted-foreground">All bots</div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Trigger Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manual Trigger</CardTitle>
          <CardDescription>Optionally provide a reason for manual trigger</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={triggerReason}
            onChange={(e) => setTriggerReason(e.target.value)}
            placeholder="Reason for triggering kill switch (optional)"
          />
        </CardContent>
      </Card>

      {/* Auto-Trigger Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Auto-Trigger Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full",
                (report?.drawdown?.state?.currentDrawdown || 0) >= 15 ? "bg-red-500" : "bg-green-500"
              )} />
              <span>Drawdown ≥ 15%</span>
            </div>
            <span className="text-sm text-muted-foreground">
              Current: {((report?.drawdown?.state?.currentDrawdown || 0)).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full",
                (report?.riskScore || 0) >= 80 ? "bg-red-500" : "bg-green-500"
              )} />
              <span>Risk Score ≥ 80</span>
            </div>
            <span className="text-sm text-muted-foreground">
              Current: {report?.riskScore || 0}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-3 h-3 rounded-full",
                report?.volatilityRegime === 'extreme' && (report?.riskScore || 0) >= 50 ? "bg-red-500" : "bg-green-500"
              )} />
              <span>Extreme Volatility + Risk ≥ 50</span>
            </div>
            <span className="text-sm text-muted-foreground">
              Regime: {(report?.volatilityRegime || 'normal').toUpperCase()}
            </span>
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
  const [report, setReport] = useState<ApiRiskReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket hook
  const {
    riskState,
    killSwitch: wsKillSwitch,
    botSummary,
    alerts,
    isConnected,
    triggerKillSwitch,
    armKillSwitch,
    disarmKillSwitch,
    recoverKillSwitch,
    acknowledgeAlert,
  } = useRiskMonitor();

  // Fetch risk report from API
  const fetchRiskReport = useCallback(async () => {
    try {
      const response = await fetch("/api/risk");
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setReport(data.data);
          setError(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch risk report:", err);
      setError("Failed to load risk data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRiskReport();
    const interval = setInterval(fetchRiskReport, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchRiskReport]);

  // Sync WebSocket state with report
  useEffect(() => {
    if (riskState) {
      setReport(prev => prev ? {
        ...prev,
        riskScore: riskState.riskScore,
        volatilityRegime: riskState.volatilityRegime,
        drawdown: {
          ...prev.drawdown,
          state: {
            ...prev.drawdown.state,
            currentDrawdown: riskState.drawdown,
            level: riskState.riskLevel === 'critical' ? 'breach' : 
                   riskState.riskLevel === 'high' ? 'critical' :
                   riskState.riskLevel === 'medium' ? 'warning' : 'none',
          }
        }
      } : null);
    }
  }, [riskState]);

  const riskScore = report?.riskScore || 0;
  const riskLevel = riskScore >= 70 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW';

  // Get kill switch state from WebSocket or API report
  const killSwitch = wsKillSwitch || report?.killSwitch || {
    isArmed: true,
    isTriggered: false,
    botsStopped: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-red-500" />
          <div>
            <h1 className="text-2xl font-bold">Управление Рисками</h1>
            <p className="text-muted-foreground">Мониторинг и контроль торговых рисков в реальном времени</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Radio className={cn("h-4 w-4", isConnected ? "text-green-500" : "text-red-500")} />
          <Badge
            variant="outline"
            className={cn(
              "px-4 py-2",
              !killSwitch?.isTriggered && killSwitch?.isArmed
                ? "bg-green-500/10 text-green-500 border-green-500/30"
                : "bg-red-500/10 text-red-500 border-red-500/30"
            )}
          >
            {killSwitch?.isTriggered ? "KILL SWITCH TRIGGERED" : killSwitch?.isArmed ? "Система Защищена" : "Защита Отключена"}
          </Badge>
        </div>
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
                    <div className="text-2xl font-bold">{riskScore}/100</div>
                  </div>
                  <Badge className={cn(
                    riskLevel === 'LOW' && "bg-green-500/10 text-green-500",
                    riskLevel === 'MEDIUM' && "bg-yellow-500/10 text-yellow-500",
                    riskLevel === 'HIGH' && "bg-orange-500/10 text-orange-500",
                    riskLevel === 'CRITICAL' && "bg-red-500/10 text-red-500",
                  )}>{riskLevel}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">VaR (95%)</div>
                    <div className="text-2xl font-bold">${(report?.var?.var || 0).toLocaleString()}</div>
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
                    <div className="text-2xl font-bold">{((report?.drawdown?.state?.currentDrawdown || 0)).toFixed(1)}%</div>
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
                    <div className={cn(
                      "text-2xl font-bold",
                      killSwitch?.isArmed && !killSwitch?.isTriggered ? "text-green-500" : "text-red-500"
                    )}>
                      {killSwitch?.isTriggered ? "TRIGGERED" : killSwitch?.isArmed ? "ВКЛЮЧЁН" : "ОТКЛЮЧЕН"}
                    </div>
                  </div>
                  <Lock className={cn(
                    "h-6 w-6",
                    killSwitch?.isArmed && !killSwitch?.isTriggered ? "text-green-500" : "text-red-500"
                  )} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          {report?.recommendations && report.recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Рекомендации</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Quick Access */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <VaRCalculatorPanel report={report} />
            <KillSwitchPanel 
              report={report}
              wsKillSwitch={wsKillSwitch}
              onTrigger={triggerKillSwitch}
              onArm={armKillSwitch}
              onDisarm={disarmKillSwitch}
              onRecover={recoverKillSwitch}
              isConnected={isConnected}
            />
          </div>
        </TabsContent>

        <TabsContent value="var" className="mt-6">
          <VaRCalculatorPanel report={report} />
        </TabsContent>

        <TabsContent value="limits" className="mt-6">
          <PositionLimiterPanel report={report} />
        </TabsContent>

        <TabsContent value="drawdown" className="mt-6">
          <DrawdownMonitorPanel report={report} />
        </TabsContent>

        <TabsContent value="killswitch" className="mt-6">
          <KillSwitchPanel 
            report={report}
            wsKillSwitch={wsKillSwitch}
            onTrigger={triggerKillSwitch}
            onArm={armKillSwitch}
            onDisarm={disarmKillSwitch}
            onRecover={recoverKillSwitch}
            isConnected={isConnected}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default RiskDashboard;
