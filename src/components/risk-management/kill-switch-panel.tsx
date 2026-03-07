"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Power,
  PowerOff,
  Shield,
  AlertTriangle,
  Zap,
  Settings,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  History,
  RefreshCw,
  Lock,
  Unlock,
  Radio,
  Activity,
  TrendingDown,
} from "lucide-react";

// Types from backend
type KillSwitchTrigger = "manual" | "drawdown" | "var_breach" | "correlation" | "liquidity" | "error";
type KillSwitchState = "armed" | "triggered" | "recovering" | "disarmed";

interface KillSwitchConfig {
  autoTrigger: boolean;
  triggers: {
    drawdown: boolean;
    varBreach: boolean;
    correlation: boolean;
    liquidity: boolean;
  };
  thresholds: {
    drawdownPct: number;
    varMultiplier: number;
    correlationLimit: number;
    liquidityMin: number;
  };
  recoveryMode: "automatic" | "manual";
  recoveryCooldown: number;
}

interface KillSwitchStatus {
  state: KillSwitchState;
  trigger?: KillSwitchTrigger;
  triggeredAt?: number;
  canRecoverAt?: number;
  positionsClosed: number;
  pnlSaved: number;
  triggerHistory: KillSwitchEvent[];
}

interface KillSwitchEvent {
  id: string;
  timestamp: number;
  trigger: KillSwitchTrigger;
  equity: number;
  drawdown: number;
  positionsClosed: number;
  recovered: boolean;
  recoveredAt?: number;
}

interface KillSwitchPanelProps {
  config?: KillSwitchConfig;
  status?: KillSwitchStatus;
  onArm?: () => Promise<void>;
  onDisarm?: () => Promise<void>;
  onTrigger?: (trigger: KillSwitchTrigger) => Promise<void>;
  onRecover?: () => Promise<void>;
  onConfigChange?: (config: KillSwitchConfig) => void;
  className?: string;
}

// Default config
const defaultConfig: KillSwitchConfig = {
  autoTrigger: true,
  triggers: {
    drawdown: true,
    varBreach: true,
    correlation: true,
    liquidity: false,
  },
  thresholds: {
    drawdownPct: 0.20,
    varMultiplier: 3.0,
    correlationLimit: 0.9,
    liquidityMin: 1000,
  },
  recoveryMode: "manual",
  recoveryCooldown: 24 * 60 * 60 * 1000, // 24 hours
};

// Default status
const defaultStatus: KillSwitchStatus = {
  state: "disarmed",
  positionsClosed: 0,
  pnlSaved: 0,
  triggerHistory: [],
};

const triggerLabels: Record<KillSwitchTrigger, string> = {
  manual: "Manual Trigger",
  drawdown: "Drawdown Breach",
  var_breach: "VaR Breach",
  correlation: "High Correlation",
  liquidity: "Low Liquidity",
  error: "System Error",
};

const stateColors: Record<KillSwitchState, { bg: string; text: string; border: string }> = {
  armed: { bg: "bg-green-100 dark:bg-green-900", text: "text-green-700 dark:text-green-300", border: "border-green-500" },
  triggered: { bg: "bg-red-100 dark:bg-red-900", text: "text-red-700 dark:text-red-300", border: "border-red-500" },
  recovering: { bg: "bg-yellow-100 dark:bg-yellow-900", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-500" },
  disarmed: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", border: "border-gray-500" },
};

const formatCooldownTime = (ms: number): string => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  return `${hours} hour${hours > 1 ? "s" : ""}`;
};

const formatTimeRemaining = (targetTime: number): string => {
  const remaining = targetTime - Date.now();
  if (remaining <= 0) return "Ready";

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
};

export function KillSwitchPanel({
  config: initialConfig = defaultConfig,
  status: externalStatus,
  onArm,
  onDisarm,
  onTrigger,
  onRecover,
  onConfigChange,
  className,
}: KillSwitchPanelProps) {
  const [config, setConfig] = useState<KillSwitchConfig>(initialConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [showConfirmTrigger, setShowConfirmTrigger] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<KillSwitchStatus>(
    externalStatus || defaultStatus
  );

  // Generate mock history if needed
  useEffect(() => {
    if (!externalStatus && status.triggerHistory.length === 0) {
      const mockHistory: KillSwitchEvent[] = [
        {
          id: "ks-1",
          timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
          trigger: "drawdown",
          equity: 85000,
          drawdown: 0.22,
          positionsClosed: 5,
          recovered: true,
          recoveredAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
        },
        {
          id: "ks-2",
          timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
          trigger: "var_breach",
          equity: 92000,
          drawdown: 0.08,
          positionsClosed: 3,
          recovered: true,
          recoveredAt: Date.now() - 28 * 24 * 60 * 60 * 1000,
        },
      ];
      setStatus((prev) => ({ ...prev, triggerHistory: mockHistory }));
    }
  }, [externalStatus, status.triggerHistory.length]);

  const handleArm = useCallback(async () => {
    setIsProcessing(true);
    try {
      await onArm?.();
      setStatus((prev) => ({ ...prev, state: "armed" }));
    } finally {
      setIsProcessing(false);
    }
  }, [onArm]);

  const handleDisarm = useCallback(async () => {
    setIsProcessing(true);
    try {
      await onDisarm?.();
      setStatus((prev) => ({ ...prev, state: "disarmed" }));
    } finally {
      setIsProcessing(false);
    }
  }, [onDisarm]);

  const handleTrigger = useCallback(async () => {
    setIsProcessing(true);
    setShowConfirmTrigger(false);
    try {
      await onTrigger?.("manual");
      setStatus((prev) => ({
        ...prev,
        state: "triggered",
        trigger: "manual",
        triggeredAt: Date.now(),
        canRecoverAt: Date.now() + config.recoveryCooldown,
        positionsClosed: prev.positionsClosed + 3,
        pnlSaved: prev.pnlSaved + 1250,
        triggerHistory: [
          {
            id: `ks-${Date.now()}`,
            timestamp: Date.now(),
            trigger: "manual",
            equity: 95000,
            drawdown: 0.05,
            positionsClosed: 3,
            recovered: false,
          },
          ...prev.triggerHistory,
        ],
      }));
    } finally {
      setIsProcessing(false);
    }
  }, [onTrigger, config.recoveryCooldown]);

  const handleRecover = useCallback(async () => {
    setIsProcessing(true);
    try {
      await onRecover?.();
      setStatus((prev) => {
        const lastEvent = prev.triggerHistory[0];
        if (lastEvent) {
          lastEvent.recovered = true;
          lastEvent.recoveredAt = Date.now();
        }
        return {
          ...prev,
          state: config.recoveryMode === "automatic" ? "armed" : "recovering",
          trigger: undefined,
        };
      });
    } finally {
      setIsProcessing(false);
    }
  }, [onRecover, config.recoveryMode]);

  const handleConfigChange = useCallback(
    (key: keyof KillSwitchConfig, value: unknown) => {
      const newConfig = { ...config, [key]: value };
      setConfig(newConfig);
      onConfigChange?.(newConfig);
    },
    [config, onConfigChange]
  );

  const stateStyle = stateColors[status.state];
  const canRecover = status.state === "triggered" && (status.canRecoverAt || 0) <= Date.now();

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Kill Switch</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={`${stateStyle.bg} ${stateStyle.text} border ${stateStyle.border}`}
            >
              {status.state.charAt(0).toUpperCase() + status.state.slice(1)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          Emergency position closer with automatic triggers
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Status Alert */}
        {status.state === "triggered" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Kill Switch Triggered!</AlertTitle>
            <AlertDescription>
              Triggered by {status.trigger ? triggerLabels[status.trigger] : "unknown"} at{" "}
              {status.triggeredAt ? new Date(status.triggeredAt).toLocaleString() : "unknown time"}.
              All trading operations are suspended.
            </AlertDescription>
          </Alert>
        )}

        {status.state === "recovering" && (
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Recovery Mode</AlertTitle>
            <AlertDescription>
              Kill switch is in recovery mode. Arm the switch to resume trading.
            </AlertDescription>
          </Alert>
        )}

        {/* Main Control Panel */}
        <Card className={`border-2 ${stateStyle.border}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {status.state === "armed" ? (
                  <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
                    <Lock className="h-6 w-6 text-green-600" />
                  </div>
                ) : status.state === "triggered" ? (
                  <div className="p-3 rounded-full bg-red-100 dark:bg-red-900">
                    <PowerOff className="h-6 w-6 text-red-600" />
                  </div>
                ) : (
                  <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800">
                    <Unlock className="h-6 w-6 text-gray-600" />
                  </div>
                )}
                <div>
                  <div className="font-semibold">Kill Switch Status</div>
                  <div className={`text-sm ${stateStyle.text}`}>
                    {status.state === "armed" && "Active - Monitoring for triggers"}
                    {status.state === "triggered" && "TRIGGERED - Trading suspended"}
                    {status.state === "recovering" && "Recovery mode - Ready to arm"}
                    {status.state === "disarmed" && "Inactive - Not monitoring"}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {status.state === "disarmed" && (
                  <Button onClick={handleArm} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
                    {isProcessing ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Power className="h-4 w-4 mr-2" />
                    )}
                    Arm Kill Switch
                  </Button>
                )}

                {status.state === "armed" && (
                  <>
                    <Button onClick={handleDisarm} disabled={isProcessing} variant="outline">
                      <PowerOff className="h-4 w-4 mr-2" />
                      Disarm
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={isProcessing}>
                          <Zap className="h-4 w-4 mr-2" />
                          Trigger Manually
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Trigger Kill Switch?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will immediately close all positions and suspend trading.
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleTrigger} className="bg-red-600 hover:bg-red-700">
                            Trigger Kill Switch
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}

                {status.state === "triggered" && (
                  <Button
                    onClick={handleRecover}
                    disabled={isProcessing || !canRecover}
                    variant={canRecover ? "default" : "outline"}
                  >
                    {isProcessing ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {canRecover ? "Initiate Recovery" : formatTimeRemaining(status.canRecoverAt || 0)}
                  </Button>
                )}

                {status.state === "recovering" && (
                  <Button onClick={handleArm} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
                    <Lock className="h-4 w-4 mr-2" />
                    Arm Kill Switch
                  </Button>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Positions Closed</div>
                <div className="text-2xl font-bold">{status.positionsClosed}</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">PnL Saved</div>
                <div className="text-2xl font-bold text-green-600">
                  ${status.pnlSaved.toLocaleString()}
                </div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Auto Trigger</div>
                <div className="text-2xl font-bold">
                  {config.autoTrigger ? (
                    <CheckCircle className="h-6 w-6 text-green-600 mx-auto" />
                  ) : (
                    <XCircle className="h-6 w-6 text-gray-400 mx-auto" />
                  )}
                </div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Recovery</div>
                <div className="text-lg font-bold capitalize">{config.recoveryMode}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Triggers */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Auto Trigger Configuration
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Drawdown</span>
                  <Switch
                    checked={config.triggers.drawdown}
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        triggers: { ...prev.triggers, drawdown: checked },
                      }))
                    }
                    disabled={status.state === "triggered"}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Trigger at {(config.thresholds.drawdownPct * 100).toFixed(0)}% drawdown
                </p>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">VaR Breach</span>
                  <Switch
                    checked={config.triggers.varBreach}
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        triggers: { ...prev.triggers, varBreach: checked },
                      }))
                    }
                    disabled={status.state === "triggered"}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Trigger at {config.thresholds.varMultiplier}x VaR
                </p>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Correlation</span>
                  <Switch
                    checked={config.triggers.correlation}
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        triggers: { ...prev.triggers, correlation: checked },
                      }))
                    }
                    disabled={status.state === "triggered"}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Trigger at {(config.thresholds.correlationLimit * 100).toFixed(0)}% correlation
                </p>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Liquidity</span>
                  <Switch
                    checked={config.triggers.liquidity}
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        triggers: { ...prev.triggers, liquidity: checked },
                      }))
                    }
                    disabled={status.state === "triggered"}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Trigger below ${config.thresholds.liquidityMin.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trigger History */}
        {status.triggerHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <History className="h-4 w-4" />
              Trigger History
            </h4>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Equity</TableHead>
                    <TableHead>Drawdown</TableHead>
                    <TableHead>Closed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.triggerHistory.slice(0, 5).map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-sm">
                        {new Date(event.timestamp).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{triggerLabels[event.trigger]}</Badge>
                      </TableCell>
                      <TableCell>${event.equity.toLocaleString()}</TableCell>
                      <TableCell>{(event.drawdown * 100).toFixed(1)}%</TableCell>
                      <TableCell>{event.positionsClosed}</TableCell>
                      <TableCell>
                        {event.recovered ? (
                          <Badge className="bg-green-100 text-green-700">Recovered</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700">Active</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Kill Switch Settings
              </DialogTitle>
              <DialogDescription>
                Configure automatic triggers and recovery options
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto Trigger</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically trigger when conditions are met
                  </p>
                </div>
                <Switch
                  checked={config.autoTrigger}
                  onCheckedChange={(checked) => handleConfigChange("autoTrigger", checked)}
                />
              </div>

              <div className="space-y-4">
                <Label>Thresholds</Label>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Drawdown Trigger</span>
                    <span>{(config.thresholds.drawdownPct * 100).toFixed(0)}%</span>
                  </div>
                  <Slider
                    value={[config.thresholds.drawdownPct * 100]}
                    onValueChange={([value]) =>
                      setConfig((prev) => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, drawdownPct: value / 100 },
                      }))
                    }
                    min={10}
                    max={50}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>VaR Multiplier</span>
                    <span>{config.thresholds.varMultiplier}x</span>
                  </div>
                  <Slider
                    value={[config.thresholds.varMultiplier]}
                    onValueChange={([value]) =>
                      setConfig((prev) => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, varMultiplier: value },
                      }))
                    }
                    min={1}
                    max={5}
                    step={0.5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Correlation Limit</span>
                    <span>{(config.thresholds.correlationLimit * 100).toFixed(0)}%</span>
                  </div>
                  <Slider
                    value={[config.thresholds.correlationLimit * 100]}
                    onValueChange={([value]) =>
                      setConfig((prev) => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, correlationLimit: value / 100 },
                      }))
                    }
                    min={50}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Min Liquidity</span>
                    <span>${config.thresholds.liquidityMin.toLocaleString()}</span>
                  </div>
                  <Slider
                    value={[config.thresholds.liquidityMin]}
                    onValueChange={([value]) =>
                      setConfig((prev) => ({
                        ...prev,
                        thresholds: { ...prev.thresholds, liquidityMin: value },
                      }))
                    }
                    min={100}
                    max={10000}
                    step={100}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Recovery Mode</Label>
                <div className="flex gap-2">
                  <Button
                    variant={config.recoveryMode === "manual" ? "default" : "outline"}
                    onClick={() => handleConfigChange("recoveryMode", "manual")}
                    className="flex-1"
                  >
                    Manual
                  </Button>
                  <Button
                    variant={config.recoveryMode === "automatic" ? "default" : "outline"}
                    onClick={() => handleConfigChange("recoveryMode", "automatic")}
                    className="flex-1"
                  >
                    Automatic
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Recovery Cooldown</Label>
                <div className="flex gap-2">
                  {[1, 6, 12, 24, 48].map((hours) => (
                    <Button
                      key={hours}
                      variant={config.recoveryCooldown === hours * 60 * 60 * 1000 ? "default" : "outline"}
                      onClick={() => handleConfigChange("recoveryCooldown", hours * 60 * 60 * 1000)}
                      size="sm"
                    >
                      {hours}h
                    </Button>
                  ))}
                </div>
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

export default KillSwitchPanel;
