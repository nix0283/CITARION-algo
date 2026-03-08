"use client";

import { useState, useCallback } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Shield,
  AlertTriangle,
  Settings2,
  ChevronDown,
  ChevronUp,
  Calculator,
  TrendingUp,
  Percent,
  DollarSign,
  Info,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// Types from backend
interface PositionLimits {
  maxPositionSize: number;
  maxTotalExposure: number;
  maxPositionsPerSymbol: number;
  maxTotalPositions: number;
  maxLeverage: number;
  maxCorrelation: number;
  maxSectorExposure: number;
  maxSingleAssetExposure: number;
}

interface KellyParams {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  fraction?: number;
  maxRisk?: number;
}

interface KellyResult {
  kellyFraction: number;
  adjustedFraction: number;
  riskAmount: number;
  suggestedSize: number;
  edge: number;
  odds: number;
}

interface PositionCheckResult {
  allowed: boolean;
  reason?: string;
  suggestions?: PositionSuggestion[];
  exposureAfter: number;
  riskLevel: number;
}

interface PositionSuggestion {
  type: "reduce_size" | "reduce_leverage" | "reject" | "accept";
  message: string;
  suggestedValue?: number;
}

interface PositionLimiterPanelProps {
  limits?: PositionLimits;
  currentExposure?: number;
  currentPositions?: number;
  onLimitsChange?: (limits: PositionLimits) => void;
  className?: string;
}

// Default limits
const defaultLimits: PositionLimits = {
  maxPositionSize: 10000,
  maxTotalExposure: 100000,
  maxPositionsPerSymbol: 2,
  maxTotalPositions: 20,
  maxLeverage: 10,
  maxCorrelation: 0.7,
  maxSectorExposure: 0.3,
  maxSingleAssetExposure: 0.2,
};

// Calculate Kelly Criterion
const calculateKelly = (params: KellyParams): KellyResult => {
  const { winRate, avgWin, avgLoss, fraction = 0.25, maxRisk = 0.02 } = params;

  const odds = avgWin / avgLoss;
  const kellyFraction = winRate - (1 - winRate) / odds;
  let adjustedFraction = kellyFraction * fraction;
  adjustedFraction = Math.max(0, Math.min(adjustedFraction, maxRisk));

  const edge = winRate * avgWin - (1 - winRate) * avgLoss;

  return {
    kellyFraction,
    adjustedFraction,
    riskAmount: adjustedFraction,
    suggestedSize: adjustedFraction,
    edge,
    odds,
  };
};

// Generate exposure breakdown
const generateExposureData = (exposure: number, maxExposure: number) => {
  const symbols = ["BTC", "ETH", "SOL", "AVAX", "MATIC"];
  const data = [];
  let remaining = exposure;

  for (const symbol of symbols.slice(0, Math.min(4, Math.ceil(exposure / 20000)))) {
    const value = Math.min(remaining, exposure / (symbols.length - 1) * (1 + Math.random() * 0.5));
    data.push({
      symbol,
      value: Math.round(value),
      percentage: (value / maxExposure) * 100,
    });
    remaining -= value;
  }

  if (remaining > 0) {
    data.push({
      symbol: "Others",
      value: Math.round(remaining),
      percentage: (remaining / maxExposure) * 100,
    });
  }

  return data;
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#6b7280"];

export function PositionLimiterPanel({
  limits: initialLimits = defaultLimits,
  currentExposure = 45000,
  currentPositions = 8,
  onLimitsChange,
  className,
}: PositionLimiterPanelProps) {
  const [limits, setLimits] = useState<PositionLimits>(initialLimits);
  const [isOpen, setIsOpen] = useState(false);
  const [showKellyDialog, setShowKellyDialog] = useState(false);
  const [kellyParams, setKellyParams] = useState<KellyParams>({
    winRate: 0.55,
    avgWin: 500,
    avgLoss: 300,
    fraction: 0.25,
    maxRisk: 0.02,
  });
  const [kellyResult, setKellyResult] = useState<KellyResult | null>(null);

  const exposureData = generateExposureData(currentExposure, limits.maxTotalExposure);
  const exposurePercentage = (currentExposure / limits.maxTotalExposure) * 100;
  const positionPercentage = (currentPositions / limits.maxTotalPositions) * 100;

  const handleLimitChange = useCallback(
    (key: keyof PositionLimits, value: number) => {
      const newLimits = { ...limits, [key]: value };
      setLimits(newLimits);
      onLimitsChange?.(newLimits);
    },
    [limits, onLimitsChange]
  );

  const handleKellyCalculate = useCallback(() => {
    const result = calculateKelly(kellyParams);
    setKellyResult(result);
  }, [kellyParams]);

  const getExposureStatus = (percentage: number) => {
    if (percentage < 50) return { color: "text-green-600", status: "Safe" };
    if (percentage < 75) return { color: "text-yellow-600", status: "Moderate" };
    if (percentage < 90) return { color: "text-orange-600", status: "High" };
    return { color: "text-red-600", status: "Critical" };
  };

  const exposureStatus = getExposureStatus(exposurePercentage);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Position Limiter</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowKellyDialog(true)}>
              <Calculator className="h-4 w-4 mr-2" />
              Kelly Criterion
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(!isOpen)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Configure
              {isOpen ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </Button>
          </div>
        </div>
        <CardDescription>
          Position size limits with Kelly Criterion optimization
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Current Exposure Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Exposure Gauge */}
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Exposure</span>
                <Badge className={exposureStatus.color}>{exposureStatus.status}</Badge>
              </div>
              <div className="text-2xl font-bold">
                ${currentExposure.toLocaleString()}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / ${limits.maxTotalExposure.toLocaleString()}
                </span>
              </div>
              <Progress value={exposurePercentage} className="mt-2 h-2" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0%</span>
                <span>{exposurePercentage.toFixed(1)}%</span>
                <span>100%</span>
              </div>
            </CardContent>
          </Card>

          {/* Position Count */}
          <Card className="border-2">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Active Positions</span>
                <Badge variant="secondary">{positionPercentage.toFixed(0)}% of max</Badge>
              </div>
              <div className="text-2xl font-bold">
                {currentPositions}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {limits.maxTotalPositions} max
                </span>
              </div>
              <Progress value={positionPercentage} className="mt-2 h-2" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0</span>
                <span>{currentPositions} positions</span>
                <span>{limits.maxTotalPositions}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Exposure Breakdown Chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Exposure by Asset</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={exposureData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {exposureData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Value"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {exposureData.map((item, index) => (
                <div key={item.symbol} className="flex items-center gap-2 text-xs">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span>{item.symbol}</span>
                  <span className="text-muted-foreground">
                    ({item.percentage.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Limits Utilization</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Position", current: currentExposure, max: limits.maxPositionSize },
                    { name: "Exposure", current: currentExposure, max: limits.maxTotalExposure },
                    { name: "Positions", current: currentPositions * 1000, max: limits.maxTotalPositions * 1000 },
                    { name: "Leverage", current: 5 * 1000, max: limits.maxLeverage * 1000 },
                  ]}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={60} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="current" fill="hsl(var(--primary))" name="Current" />
                  <Bar dataKey="max" fill="#e5e7eb" name="Max" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Limits Configuration */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleContent>
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Position Limits Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Max Position Size */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Max Position Size
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={limits.maxPositionSize}
                        onChange={(e) =>
                          handleLimitChange("maxPositionSize", parseInt(e.target.value) || 0)
                        }
                        className="w-full"
                      />
                      <span className="text-sm text-muted-foreground">USD</span>
                    </div>
                  </div>

                  {/* Max Total Exposure */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Max Total Exposure
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={limits.maxTotalExposure}
                        onChange={(e) =>
                          handleLimitChange("maxTotalExposure", parseInt(e.target.value) || 0)
                        }
                        className="w-full"
                      />
                      <span className="text-sm text-muted-foreground">USD</span>
                    </div>
                  </div>

                  {/* Max Leverage */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Max Leverage
                    </Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[limits.maxLeverage]}
                        onValueChange={([value]) => handleLimitChange("maxLeverage", value)}
                        min={1}
                        max={100}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">
                        {limits.maxLeverage}x
                      </span>
                    </div>
                  </div>

                  {/* Max Positions Per Symbol */}
                  <div className="space-y-2">
                    <Label>Max Positions Per Symbol</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[limits.maxPositionsPerSymbol]}
                        onValueChange={([value]) =>
                          handleLimitChange("maxPositionsPerSymbol", value)
                        }
                        min={1}
                        max={10}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-8 text-right">
                        {limits.maxPositionsPerSymbol}
                      </span>
                    </div>
                  </div>

                  {/* Max Total Positions */}
                  <div className="space-y-2">
                    <Label>Max Total Positions</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[limits.maxTotalPositions]}
                        onValueChange={([value]) => handleLimitChange("maxTotalPositions", value)}
                        min={1}
                        max={50}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-8 text-right">
                        {limits.maxTotalPositions}
                      </span>
                    </div>
                  </div>

                  {/* Max Correlation */}
                  <div className="space-y-2">
                    <Label>Max Correlation</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[limits.maxCorrelation * 100]}
                        onValueChange={([value]) =>
                          handleLimitChange("maxCorrelation", value / 100)
                        }
                        min={0}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">
                        {(limits.maxCorrelation * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Max Sector Exposure */}
                  <div className="space-y-2">
                    <Label>Max Sector Exposure</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[limits.maxSectorExposure * 100]}
                        onValueChange={([value]) =>
                          handleLimitChange("maxSectorExposure", value / 100)
                        }
                        min={10}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">
                        {(limits.maxSectorExposure * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Max Single Asset Exposure */}
                  <div className="space-y-2">
                    <Label>Max Single Asset Exposure</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[limits.maxSingleAssetExposure * 100]}
                        onValueChange={([value]) =>
                          handleLimitChange("maxSingleAssetExposure", value / 100)
                        }
                        min={5}
                        max={50}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">
                        {(limits.maxSingleAssetExposure * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Warning for tight limits */}
                {limits.maxPositionSize < 5000 && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">
                        Tight Position Limit
                      </p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-300">
                        Max position size is below $5,000. This may limit trading opportunities.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Limits Summary Table */}
        <div>
          <h4 className="text-sm font-medium mb-2">Current Limits Summary</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Limit</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Max Position Size</TableCell>
                <TableCell>${limits.maxPositionSize.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Max Total Exposure</TableCell>
                <TableCell>${limits.maxTotalExposure.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={exposureStatus.color}>
                    {exposurePercentage < 90 ? (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    ) : (
                      <AlertCircle className="h-3 w-3 mr-1" />
                    )}
                    {exposureStatus.status}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Max Leverage</TableCell>
                <TableCell>{limits.maxLeverage}x</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Max Positions Per Symbol</TableCell>
                <TableCell>{limits.maxPositionsPerSymbol}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Kelly Criterion Dialog */}
        <Dialog open={showKellyDialog} onOpenChange={setShowKellyDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Kelly Criterion Calculator
              </DialogTitle>
              <DialogDescription>
                Calculate optimal position size using Kelly Criterion
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Win Rate</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={(kellyParams.winRate * 100).toFixed(0)}
                      onChange={(e) =>
                        setKellyParams((prev) => ({
                          ...prev,
                          winRate: parseFloat(e.target.value) / 100 || 0,
                        }))
                      }
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Fractional Kelly</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={(kellyParams.fraction || 0.25) * 100}
                      onChange={(e) =>
                        setKellyParams((prev) => ({
                          ...prev,
                          fraction: parseFloat(e.target.value) / 100 || 0.25,
                        }))
                      }
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Avg Win ($)</Label>
                  <Input
                    type="number"
                    value={kellyParams.avgWin}
                    onChange={(e) =>
                      setKellyParams((prev) => ({
                        ...prev,
                        avgWin: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avg Loss ($)</Label>
                  <Input
                    type="number"
                    value={kellyParams.avgLoss}
                    onChange={(e) =>
                      setKellyParams((prev) => ({
                        ...prev,
                        avgLoss: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>

              <Button onClick={handleKellyCalculate} className="w-full">
                Calculate Optimal Size
              </Button>

              {kellyResult && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Kelly Fraction:</span>
                    <span className="font-medium">
                      {(kellyResult.kellyFraction * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Adjusted Fraction:</span>
                    <span className="font-medium text-green-600">
                      {(kellyResult.adjustedFraction * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Edge:</span>
                    <span className="font-medium">
                      ${kellyResult.edge.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Odds Ratio:</span>
                    <span className="font-medium">
                      {kellyResult.odds.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground flex items-start gap-1">
                      <Info className="h-3 w-3 mt-0.5 shrink-0" />
                      Using quarter Kelly (25%) for safer position sizing. Adjust fraction based on risk tolerance.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default PositionLimiterPanel;
