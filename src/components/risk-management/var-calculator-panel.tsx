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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  TrendingDown,
  Calculator,
  BarChart3,
  Activity,
  RefreshCw,
  Info,
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
} from "recharts";

// Types from backend
type VaRMethod = "historical" | "parametric" | "monte_carlo";

interface VaRConfig {
  confidenceLevel: number;
  timeHorizon: number;
  method: VaRMethod;
  monteCarloSimulations?: number;
  lookbackPeriod: number;
}

interface VaRResult {
  var: number;
  expectedShortfall: number;
  confidenceLevel: number;
  timeHorizon: number;
  method: VaRMethod;
  timestamp: number;
  portfolioValue: number;
  riskPercentage: number;
}

interface VaRCalculatorPanelProps {
  portfolioValue?: number;
  returns?: number[];
  onCalculate?: (config: VaRConfig) => Promise<VaRResult>;
  className?: string;
}

// Mock function to simulate VaR calculation
const calculateMockVaR = (config: VaRConfig, portfolioValue: number): VaRResult => {
  const riskPerUnit = {
    historical: 0.025,
    parametric: 0.022,
    monte_carlo: 0.028,
  };

  const baseRisk = riskPerUnit[config.method] || 0.025;
  const scaleFactor = Math.sqrt(config.timeHorizon);
  const confidenceMultiplier = (config.confidenceLevel - 0.9) * 10 + 1;

  const riskPercentage = baseRisk * scaleFactor * confidenceMultiplier;
  const varValue = portfolioValue * riskPercentage;
  const esValue = varValue * 1.3; // Expected Shortfall is typically higher

  return {
    var: varValue,
    expectedShortfall: esValue,
    confidenceLevel: config.confidenceLevel,
    timeHorizon: config.timeHorizon,
    method: config.method,
    timestamp: Date.now(),
    portfolioValue,
    riskPercentage: riskPercentage * 100,
  };
};

// Generate mock distribution data
const generateDistributionData = (varValue: number, esValue: number) => {
  const data = [];
  const mean = 0;
  const std = Math.abs(varValue) / 1.645;

  for (let i = -4; i <= 4; i += 0.2) {
    const x = mean + i * std;
    const y = (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / std, 2));

    data.push({
      x: x.toFixed(2),
      y: y * 100,
      isVar: x <= -Math.abs(varValue / 1000),
      isEs: x <= -Math.abs(esValue / 1000),
    });
  }

  return data;
};

// Generate historical VaR trend
const generateHistoricalTrend = () => {
  const data = [];
  const now = Date.now();

  for (let i = 30; i >= 0; i--) {
    const timestamp = now - i * 24 * 60 * 60 * 1000;
    data.push({
      date: new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      var: 2.1 + Math.random() * 1.5,
      es: 2.8 + Math.random() * 2.0,
    });
  }

  return data;
};

const methodDescriptions: Record<VaRMethod, string> = {
  historical: "Uses actual historical returns distribution without assuming normality",
  parametric: "Assumes returns follow a normal distribution (Variance-Covariance)",
  monte_carlo: "Simulates future returns using historical parameters (10,000 simulations)",
};

export function VaRCalculatorPanel({
  portfolioValue = 100000,
  returns = [],
  onCalculate,
  className,
}: VaRCalculatorPanelProps) {
  const [config, setConfig] = useState<VaRConfig>({
    confidenceLevel: 0.95,
    timeHorizon: 1,
    method: "historical",
    lookbackPeriod: 252,
    monteCarloSimulations: 10000,
  });

  const [result, setResult] = useState<VaRResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [distributionData, setDistributionData] = useState<Array<{ x: string; y: number; isVar: boolean; isEs: boolean }>>([]);
  const [historicalTrend] = useState(generateHistoricalTrend);

  const handleCalculate = useCallback(async () => {
    setIsCalculating(true);

    try {
      let vaRResult: VaRResult;

      if (onCalculate) {
        vaRResult = await onCalculate(config);
      } else {
        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        vaRResult = calculateMockVaR(config, portfolioValue);
      }

      setResult(vaRResult);
      setDistributionData(generateDistributionData(vaRResult.var, vaRResult.expectedShortfall));
    } catch (error) {
      console.error("VaR calculation error:", error);
    } finally {
      setIsCalculating(false);
    }
  }, [config, portfolioValue, onCalculate]);

  const getRiskLevel = (riskPct: number): { level: string; color: string; bgColor: string } => {
    if (riskPct < 3) return { level: "Low", color: "text-green-600", bgColor: "bg-green-100" };
    if (riskPct < 6) return { level: "Medium", color: "text-yellow-600", bgColor: "bg-yellow-100" };
    if (riskPct < 10) return { level: "High", color: "text-orange-600", bgColor: "bg-orange-100" };
    return { level: "Critical", color: "text-red-600", bgColor: "bg-red-100" };
  };

  const riskInfo = result ? getRiskLevel(result.riskPercentage) : null;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">VaR Calculator</CardTitle>
          </div>
          <Button
            size="sm"
            onClick={handleCalculate}
            disabled={isCalculating}
          >
            {isCalculating ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Activity className="h-4 w-4 mr-2" />
            )}
            Calculate
          </Button>
        </div>
        <CardDescription>
          Value at Risk calculation using three methods
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Method</Label>
            <Select
              value={config.method}
              onValueChange={(value: VaRMethod) =>
                setConfig((prev) => ({ ...prev, method: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="historical">Historical</SelectItem>
                <SelectItem value="parametric">Parametric</SelectItem>
                <SelectItem value="monte_carlo">Monte Carlo</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {methodDescriptions[config.method]}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Confidence Level: {(config.confidenceLevel * 100).toFixed(0)}%</Label>
            <Slider
              value={[config.confidenceLevel * 100]}
              onValueChange={([value]) =>
                setConfig((prev) => ({ ...prev, confidenceLevel: value / 100 }))
              }
              min={90}
              max={99}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>90%</span>
              <span>99%</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Time Horizon: {config.timeHorizon} day(s)</Label>
            <Slider
              value={[config.timeHorizon]}
              onValueChange={([value]) =>
                setConfig((prev) => ({ ...prev, timeHorizon: value }))
              }
              min={1}
              max={10}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 day</span>
              <span>10 days</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Portfolio Value</Label>
            <Input
              type="number"
              value={portfolioValue.toLocaleString()}
              readOnly
              className="bg-muted"
            />
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* VaR Value */}
              <Card className="border-2">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Value at Risk</span>
                    <Badge variant={riskInfo?.bgColor === "bg-red-100" ? "destructive" : "secondary"}>
                      {result.method}
                    </Badge>
                  </div>
                  <div className={`text-2xl font-bold ${riskInfo?.color}`}>
                    ${result.var.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {result.riskPercentage.toFixed(2)}% of portfolio
                  </div>
                  {riskInfo && (
                    <div className="mt-2">
                      <Badge className={`${riskInfo.bgColor} ${riskInfo.color}`}>
                        {riskInfo.level} Risk
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Expected Shortfall */}
              <Card className="border-2">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Expected Shortfall (CVaR)</span>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold text-orange-600">
                    ${result.expectedShortfall.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Average loss beyond VaR
                  </div>
                  <Progress
                    value={(result.var / result.expectedShortfall) * 100}
                    className="mt-2 h-2"
                  />
                </CardContent>
              </Card>

              {/* Risk Metrics */}
              <Card className="border-2">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Risk Metrics</span>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className="font-medium">{(result.confidenceLevel * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Horizon:</span>
                      <span className="font-medium">{result.timeHorizon} day(s)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Calculated:</span>
                      <span className="font-medium">
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <Tabs defaultValue="distribution" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="distribution">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Distribution
                </TabsTrigger>
                <TabsTrigger value="trend">
                  <Activity className="h-4 w-4 mr-2" />
                  Historical Trend
                </TabsTrigger>
              </TabsList>

              <TabsContent value="distribution" className="mt-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={distributionData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="x" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="y"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded" />
                    <span>VaR threshold ({result.confidenceLevel * 100}%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-orange-500 rounded" />
                    <span>Expected Shortfall region</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="trend" className="mt-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="var"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                        name="VaR %"
                      />
                      <Line
                        type="monotone"
                        dataKey="es"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={false}
                        name="ES %"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-primary rounded" />
                    <span>VaR (%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-orange-500 rounded" />
                    <span>Expected Shortfall (%)</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Warning for high risk */}
            {result.riskPercentage > 5 && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">
                    High Risk Warning
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    VaR exceeds 5% of portfolio value. Consider reducing position sizes
                    or adjusting risk parameters.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default VaRCalculatorPanel;
