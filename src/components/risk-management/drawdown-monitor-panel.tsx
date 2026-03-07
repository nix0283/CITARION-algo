"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  Settings,
  Activity,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  History,
  Shield,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// Types from backend
type DrawdownLevel = "none" | "warning" | "critical" | "breach";

interface DrawdownThresholds {
  warning: number;
  critical: number;
  breach: number;
  recoveryThreshold: number;
}

interface DrawdownState {
  currentDrawdown: number;
  peakEquity: number;
  currentEquity: number;
  level: DrawdownLevel;
  duration: number;
  startedAt: number | null;
  maxDrawdown: number;
  recoveryPct: number;
}

interface DrawdownMetrics {
  state: DrawdownState;
  daily: number;
  weekly: number;
  monthly: number;
  avgRecoveryTime: number;
  drawdownCount: number;
}

interface DrawdownMonitorPanelProps {
  thresholds?: DrawdownThresholds;
  metrics?: DrawdownMetrics;
  onUpdate?: (thresholds: DrawdownThresholds) => void;
  className?: string;
}

// Default thresholds
const defaultThresholds: DrawdownThresholds = {
  warning: 0.05,
  critical: 0.10,
  breach: 0.20,
  recoveryThreshold: 0.02,
};

// Generate mock equity curve with drawdowns
const generateEquityCurve = () => {
  const data = [];
  let equity = 100000;
  let peak = equity;
  const now = Date.now();

  for (let i = 60; i >= 0; i--) {
    const timestamp = now - i * 60 * 60 * 1000; // Hourly data
    const change = (Math.random() - 0.52) * 2000; // Slight negative bias
    equity = Math.max(equity + change, 50000);
    peak = Math.max(peak, equity);
    const drawdown = (peak - equity) / peak;

    data.push({
      timestamp,
      date: new Date(timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
      }),
      equity: Math.round(equity),
      peak: Math.round(peak),
      drawdown: (drawdown * 100).toFixed(2),
    });
  }

  return data;
};

// Generate drawdown history
const generateDrawdownHistory = () => {
  const data = [];
  const now = Date.now();

  for (let i = 30; i >= 0; i--) {
    const timestamp = now - i * 24 * 60 * 60 * 1000;
    data.push({
      date: new Date(timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      max: (Math.random() * 8 + 2).toFixed(2),
      avg: (Math.random() * 4 + 1).toFixed(2),
      min: (Math.random() * 2).toFixed(2),
    });
  }

  return data;
};

const getLevelColor = (level: DrawdownLevel): string => {
  switch (level) {
    case "none":
      return "text-green-600";
    case "warning":
      return "text-yellow-600";
    case "critical":
      return "text-orange-600";
    case "breach":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
};

const getLevelBgColor = (level: DrawdownLevel): string => {
  switch (level) {
    case "none":
      return "bg-green-100 dark:bg-green-900";
    case "warning":
      return "bg-yellow-100 dark:bg-yellow-900";
    case "critical":
      return "bg-orange-100 dark:bg-orange-900";
    case "breach":
      return "bg-red-100 dark:bg-red-900";
    default:
      return "bg-gray-100 dark:bg-gray-900";
  }
};

const getLevelBadgeVariant = (level: DrawdownLevel): "default" | "secondary" | "destructive" | "outline" => {
  switch (level) {
    case "none":
      return "secondary";
    case "warning":
      return "outline";
    case "critical":
      return "default";
    case "breach":
      return "destructive";
    default:
      return "secondary";
  }
};

const formatDuration = (ms: number): string => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days > 0) {
    return `${days}d ${remainingHours}h`;
  }
  return `${hours}h`;
};

export function DrawdownMonitorPanel({
  thresholds: initialThresholds = defaultThresholds,
  metrics: externalMetrics,
  onUpdate,
  className,
}: DrawdownMonitorPanelProps) {
  const [thresholds, setThresholds] = useState<DrawdownThresholds>(initialThresholds);
  const [showSettings, setShowSettings] = useState(false);
  const [equityCurve] = useState(generateEquityCurve);
  const [drawdownHistory] = useState(generateDrawdownHistory);

  const [metrics, setMetrics] = useState<DrawdownMetrics>(
    externalMetrics || {
      state: {
        currentDrawdown: 0.07,
        peakEquity: 105000,
        currentEquity: 97650,
        level: "warning",
        duration: 24 * 60 * 60 * 1000 * 2, // 2 days
        startedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        maxDrawdown: 0.12,
        recoveryPct: 0.42,
      },
      daily: 0.035,
      weekly: 0.07,
      monthly: 0.12,
      avgRecoveryTime: 72 * 60 * 60 * 1000, // 72 hours
      drawdownCount: 5,
    }
  );

  // Simulate real-time updates
  useEffect(() => {
    if (!externalMetrics) {
      const interval = setInterval(() => {
        setMetrics((prev) => {
          const newDrawdown = Math.max(
            0,
            Math.min(
              prev.state.currentDrawdown + (Math.random() - 0.5) * 0.005,
              0.25
            )
          );

          let level: DrawdownLevel = "none";
          if (newDrawdown >= thresholds.breach) {
            level = "breach";
          } else if (newDrawdown >= thresholds.critical) {
            level = "critical";
          } else if (newDrawdown >= thresholds.warning) {
            level = "warning";
          }

          return {
            ...prev,
            state: {
              ...prev.state,
              currentDrawdown: newDrawdown,
              level,
              currentEquity: prev.state.peakEquity * (1 - newDrawdown),
              duration: prev.state.duration + 60000,
            },
          };
        });
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [externalMetrics, thresholds]);

  const handleThresholdChange = useCallback(
    (key: keyof DrawdownThresholds, value: number) => {
      const newThresholds = { ...thresholds, [key]: value };
      setThresholds(newThresholds);
      onUpdate?.(newThresholds);
    },
    [thresholds, onUpdate]
  );

  const currentLevel = metrics.state.level;
  const drawdownPercentage = metrics.state.currentDrawdown * 100;
  const warningPercentage = thresholds.warning * 100;
  const criticalPercentage = thresholds.critical * 100;
  const breachPercentage = thresholds.breach * 100;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Drawdown Monitor</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getLevelBadgeVariant(currentLevel)} className="animate-pulse">
              {currentLevel === "none" ? "Normal" : currentLevel.charAt(0).toUpperCase() + currentLevel.slice(1)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          Real-time drawdown tracking with multi-level alerts
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Alert for Critical/Breach */}
        {(currentLevel === "critical" || currentLevel === "breach") && (
          <Alert variant={currentLevel === "breach" ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {currentLevel === "breach" ? "Breach Alert!" : "Critical Warning!"}
            </AlertTitle>
            <AlertDescription>
              {currentLevel === "breach"
                ? "Drawdown has exceeded the breach threshold. Consider activating kill switch."
                : "Drawdown is approaching critical levels. Review positions and consider reducing exposure."}
            </AlertDescription>
          </Alert>
        )}

        {/* Main Drawdown Gauge */}
        <Card className={`border-2 ${getLevelBgColor(currentLevel)}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Current Drawdown</span>
              <Badge className={getLevelColor(currentLevel)}>
                {drawdownPercentage.toFixed(2)}%
              </Badge>
            </div>

            {/* Drawdown Progress Bar with Thresholds */}
            <div className="relative">
              <Progress
                value={(drawdownPercentage / breachPercentage) * 100}
                className="h-4"
              />

              {/* Threshold markers */}
              <div className="absolute top-0 left-0 right-0 flex justify-between pointer-events-none">
                <div
                  className="h-4 w-0.5 bg-yellow-500"
                  style={{ marginLeft: `${(warningPercentage / breachPercentage) * 100}%` }}
                />
                <div
                  className="h-4 w-0.5 bg-orange-500"
                  style={{ marginLeft: `${(criticalPercentage / breachPercentage) * 100 - (warningPercentage / breachPercentage) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>0%</span>
              <span className="text-yellow-600">{warningPercentage.toFixed(0)}% Warning</span>
              <span className="text-orange-600">{criticalPercentage.toFixed(0)}% Critical</span>
              <span className="text-red-600">{breachPercentage.toFixed(0)}% Breach</span>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Activity className="h-4 w-4" />
                <span>Peak Equity</span>
              </div>
              <div className="text-xl font-bold mt-1">
                ${metrics.state.peakEquity.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingDown className="h-4 w-4" />
                <span>Current Equity</span>
              </div>
              <div className="text-xl font-bold mt-1">
                ${metrics.state.currentEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Clock className="h-4 w-4" />
                <span>Duration</span>
              </div>
              <div className="text-xl font-bold mt-1">
                {formatDuration(metrics.state.duration)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>Recovery</span>
              </div>
              <div className="text-xl font-bold mt-1 text-green-600">
                {(metrics.state.recoveryPct * 100).toFixed(0)}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Period Drawdowns */}
        <div>
          <h4 className="text-sm font-medium mb-3">Period Drawdowns</h4>
          <div className="grid grid-cols-3 gap-4">
            <Card className="border">
              <CardContent className="pt-4 pb-3">
                <div className="text-sm text-muted-foreground">Daily</div>
                <div className={`text-lg font-bold ${getLevelColor(
                  metrics.daily >= thresholds.breach ? "breach" :
                  metrics.daily >= thresholds.critical ? "critical" :
                  metrics.daily >= thresholds.warning ? "warning" : "none"
                )}`}>
                  {(metrics.daily * 100).toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="pt-4 pb-3">
                <div className="text-sm text-muted-foreground">Weekly</div>
                <div className={`text-lg font-bold ${getLevelColor(
                  metrics.weekly >= thresholds.breach ? "breach" :
                  metrics.weekly >= thresholds.critical ? "critical" :
                  metrics.weekly >= thresholds.warning ? "warning" : "none"
                )}`}>
                  {(metrics.weekly * 100).toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="pt-4 pb-3">
                <div className="text-sm text-muted-foreground">Monthly</div>
                <div className={`text-lg font-bold ${getLevelColor(
                  metrics.monthly >= thresholds.breach ? "breach" :
                  metrics.monthly >= thresholds.critical ? "critical" :
                  metrics.monthly >= thresholds.warning ? "warning" : "none"
                )}`}>
                  {(metrics.monthly * 100).toFixed(2)}%
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Equity Curve Chart */}
        <div>
          <h4 className="text-sm font-medium mb-2">Equity Curve</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} />
                <YAxis className="text-xs" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.2}
                />
                <Line
                  type="monotone"
                  dataKey="peak"
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-primary" />
              <span>Equity</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-slate-400 border-dashed" />
              <span>Peak</span>
            </div>
          </div>
        </div>

        {/* Drawdown History Bar Chart */}
        <div>
          <h4 className="text-sm font-medium mb-2">Daily Drawdown Range</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={drawdownHistory}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} />
                <YAxis className="text-xs" tick={{ fontSize: 10 }} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <ReferenceLine y={warningPercentage} stroke="#eab308" strokeDasharray="3 3" />
                <ReferenceLine y={criticalPercentage} stroke="#f97316" strokeDasharray="3 3" />
                <Bar dataKey="max" fill="#ef4444" name="Max DD" />
                <Bar dataKey="avg" fill="hsl(var(--primary))" name="Avg DD" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recovery Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <History className="h-4 w-4" />
                <span>Drawdown Count</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {metrics.drawdownCount}
              </div>
              <div className="text-xs text-muted-foreground">This period</div>
            </CardContent>
          </Card>

          <Card className="border">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <RefreshCw className="h-4 w-4" />
                <span>Avg Recovery Time</span>
              </div>
              <div className="text-2xl font-bold mt-1">
                {formatDuration(metrics.avgRecoveryTime)}
              </div>
              <div className="text-xs text-muted-foreground">Average</div>
            </CardContent>
          </Card>
        </div>

        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Drawdown Thresholds
              </DialogTitle>
              <DialogDescription>
                Configure warning and critical levels for drawdown monitoring
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label>Warning Level: {(thresholds.warning * 100).toFixed(0)}%</Label>
                <Slider
                  value={[thresholds.warning * 100]}
                  onValueChange={([value]) => handleThresholdChange("warning", value / 100)}
                  min={1}
                  max={20}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Alert when drawdown reaches this level
                </p>
              </div>

              <div className="space-y-2">
                <Label>Critical Level: {(thresholds.critical * 100).toFixed(0)}%</Label>
                <Slider
                  value={[thresholds.critical * 100]}
                  onValueChange={([value]) => handleThresholdChange("critical", value / 100)}
                  min={5}
                  max={25}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Strong warning and recommended action
                </p>
              </div>

              <div className="space-y-2">
                <Label>Breach Level: {(thresholds.breach * 100).toFixed(0)}%</Label>
                <Slider
                  value={[thresholds.breach * 100]}
                  onValueChange={([value]) => handleThresholdChange("breach", value / 100)}
                  min={10}
                  max={50}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Triggers kill switch if enabled
                </p>
              </div>

              <div className="space-y-2">
                <Label>Recovery Threshold: {(thresholds.recoveryThreshold * 100).toFixed(0)}%</Label>
                <Slider
                  value={[thresholds.recoveryThreshold * 100]}
                  onValueChange={([value]) => handleThresholdChange("recoveryThreshold", value / 100)}
                  min={1}
                  max={10}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Drawdown level to reset alerts
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setShowSettings(false)}>Save Settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default DrawdownMonitorPanel;
