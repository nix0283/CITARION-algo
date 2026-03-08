"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Settings2,
  Zap,
  Gauge,
  Info,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GARCHType, GARCHParams, GARCHResult } from "@/lib/volatility";

// =============================================================================
// TYPES
// =============================================================================

interface VolatilityState {
  symbol: string;
  modelType: GARCHType;
  params: GARCHParams;
  result: GARCHResult | null;
  currentVolatility: number | null;
  regime: 'low' | 'normal' | 'high' | 'extreme';
  historicalVolatility: number[];
  forecastDays: number;
  isLoading: boolean;
  error: string | null;
}

interface VolatilityApiResponse {
  success: boolean;
  result?: GARCHResult;
  currentVolatility?: number;
  regime?: VolatilityState['regime'];
  historicalVolatility?: number[];
  error?: string;
}

// Default GARCH parameters for each model type
const DEFAULT_PARAMS: Record<GARCHType, GARCHParams> = {
  GARCH: { omega: 0.1, alpha: 0.1, beta: 0.8 },
  'GJR-GARCH': { omega: 0.1, alpha: 0.05, beta: 0.8, gamma: 0.1 },
  EGARCH: { omega: -0.1, alpha: 0.1, beta: 0.9, gamma: 0 },
};

// Popular trading symbols
const TRADING_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "DOTUSDT",
  "MATICUSDT",
  "LINKUSDT",
  "ATOMUSDT",
];

// Model type options
const MODEL_TYPES: { value: GARCHType; label: string; description: string }[] = [
  { value: "GARCH", label: "GARCH(1,1)", description: "Стандартная модель GARCH" },
  { value: "GJR-GARCH", label: "GJR-GARCH", description: "Асимметричная модель волатильности" },
  { value: "EGARCH", label: "EGARCH", description: "Экспоненциальная модель GARCH" },
];

// Volatility regime colors
const REGIME_COLORS: Record<VolatilityState['regime'], string> = {
  low: "#22c55e",
  normal: "#3b82f6",
  high: "#f59e0b",
  extreme: "#ef4444",
};

const REGIME_LABELS: Record<VolatilityState['regime'], string> = {
  low: "Низкая Волатильность",
  normal: "Нормальная",
  high: "Высокая Волатильность",
  extreme: "Экстремальная Волатильность",
};

// =============================================================================
// COMPONENT
// =============================================================================

export function VolatilityPanel() {
  const [state, setState] = useState<VolatilityState>({
    symbol: "BTCUSDT",
    modelType: "GARCH",
    params: DEFAULT_PARAMS.GARCH,
    result: null,
    currentVolatility: null,
    regime: "normal",
    historicalVolatility: [],
    forecastDays: 10,
    isLoading: false,
    error: null,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch volatility data
  const fetchVolatilityData = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch("/api/volatility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: state.symbol,
          modelType: state.modelType,
          params: state.params,
          forecastDays: state.forecastDays,
        }),
      });

      const data: VolatilityApiResponse = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          result: data.result || null,
          currentVolatility: data.currentVolatility || null,
          regime: data.regime || "normal",
          historicalVolatility: data.historicalVolatility || [],
          isLoading: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: data.error || "Failed to fetch volatility data",
          isLoading: false,
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
        isLoading: false,
      }));
    }
  }, [state.symbol, state.modelType, state.params, state.forecastDays]);

  // Auto-fetch on symbol/model change
  useEffect(() => {
    fetchVolatilityData();
  }, [fetchVolatilityData]);

  // Handle model type change
  const handleModelTypeChange = (modelType: GARCHType) => {
    setState(prev => ({
      ...prev,
      modelType,
      params: DEFAULT_PARAMS[modelType],
    }));
  };

  // Handle parameter change
  const handleParamChange = (param: keyof GARCHParams, value: number) => {
    setState(prev => ({
      ...prev,
      params: { ...prev.params, [param]: value },
    }));
  };

  // Prepare chart data
  const volatilityChartData = useMemo(() => {
    if (!state.result) return [];

    const historical = state.historicalVolatility.map((vol, i) => ({
      index: i,
      type: "historical" as const,
      volatility: vol * 100, // Convert to percentage
    }));

    const forecast = state.result.forecast.map((vol, i) => ({
      index: historical.length + i,
      type: "forecast" as const,
      volatility: vol * 100,
    }));

    return [...historical, ...forecast];
  }, [state.result, state.historicalVolatility]);

  // Conditional volatility chart data
  const conditionalVolatilityData = useMemo(() => {
    if (!state.result?.conditionalVolatility) return [];
    
    // Take last 100 points for visualization
    const lastPoints = state.result.conditionalVolatility.slice(-100);
    return lastPoints.map((vol, i) => ({
      index: i,
      volatility: vol * 100,
    }));
  }, [state.result]);

  // Format percentage
  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return "0.00%";
    return `${(value * 100).toFixed(4)}%`;
  };

  // Format number
  const formatNumber = (value: number | null | undefined, decimals: number = 4) => {
    if (value === null || value === undefined || isNaN(value)) return "0";
    return value.toFixed(decimals);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">GARCH Анализ Волатильности</h2>
          {state.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Symbol Selector */}
          <Select value={state.symbol} onValueChange={(v) => setState(prev => ({ ...prev, symbol: v }))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Символ" />
            </SelectTrigger>
            <SelectContent>
              {TRADING_SYMBOLS.map((symbol) => (
                <SelectItem key={symbol} value={symbol}>
                  {symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Model Type Selector */}
          <Select value={state.modelType} onValueChange={(v) => handleModelTypeChange(v as GARCHType)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Модель" />
            </SelectTrigger>
            <SelectContent>
              {MODEL_TYPES.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Forecast Days */}
          <Select
            value={state.forecastDays.toString()}
            onValueChange={(v) => setState(prev => ({ ...prev, forecastDays: parseInt(v) }))}
          >
            <SelectTrigger className="w-[120px]">
              <Zap className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 30, 60].map((days) => (
                <SelectItem key={days} value={days.toString()}>
                  {days} дней
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button variant="outline" size="icon" onClick={fetchVolatilityData} disabled={state.isLoading}>
            <RefreshCw className={cn("h-4 w-4", state.isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Current Volatility Display */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Current Volatility */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Текущая Волатильность</p>
                <p className="text-2xl font-bold">
                  {formatPercent(state.currentVolatility)}
                </p>
              </div>
              <Gauge className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        {/* Volatility Regime */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Режим Волатильности</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    style={{ backgroundColor: REGIME_COLORS[state.regime] + "20", color: REGIME_COLORS[state.regime] }}
                  >
                    {REGIME_LABELS[state.regime]}
                  </Badge>
                </div>
              </div>
              <Activity
                className="h-8 w-8"
                style={{ color: REGIME_COLORS[state.regime] + "40" }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Model Convergence */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Статус Модели</p>
                <div className="flex items-center gap-2 mt-1">
                  {state.result?.converged ? (
                    <>
                      <Badge variant="default" className="bg-green-500/10 text-green-500">
                        Сошлась
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="destructive" className="bg-red-500/10 text-red-500">
                      Не Сошлась
                    </Badge>
                  )}
                </div>
              </div>
              <Settings2 className="h-8 w-8 text-muted-foreground/20" />
            </div>
          </CardContent>
        </Card>

        {/* Data Points */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Исторические Точки</p>
                <p className="text-2xl font-bold">{state.historicalVolatility.length}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-muted-foreground/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Volatility Regime Indicator */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Индикатор Режима Волатильности
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Низкая</span>
              <span>Нормальная</span>
              <span>Высокая</span>
              <span>Экстремальная</span>
            </div>
            <div className="relative h-3 rounded-full overflow-hidden bg-gradient-to-r from-green-500 via-blue-500 via-yellow-500 to-red-500">
              {/* Current position indicator */}
              {state.currentVolatility !== null && (
                <div
                  className="absolute top-0 w-1 h-full bg-foreground shadow-lg"
                  style={{
                    left: `${Math.min(
                      Math.max((state.currentVolatility / 0.1) * 100, 0),
                      100
                    )}%`,
                  }}
                />
              )}
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">Текущая:</span>
              <Badge
                style={{ backgroundColor: REGIME_COLORS[state.regime] + "20", color: REGIME_COLORS[state.regime] }}
              >
                {REGIME_LABELS[state.regime]}
              </Badge>
              <span className="text-sm font-medium">{formatPercent(state.currentVolatility)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parameters Configuration */}
      <Card>
        <CardHeader className="pb-2">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Параметры Модели
            </CardTitle>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <CardDescription>
            {MODEL_TYPES.find(m => m.value === state.modelType)?.description}
          </CardDescription>
        </CardHeader>
        {showAdvanced && (
          <CardContent className="pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Omega */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Omega (ω)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={state.params.omega}
                  onChange={(e) => handleParamChange("omega", parseFloat(e.target.value) || 0)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Constant term</p>
              </div>

              {/* Alpha */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Alpha (α)</Label>
                <div className="space-y-2">
                  <Slider
                    value={[state.params.alpha * 100]}
                    onValueChange={(v) => handleParamChange("alpha", v[0] / 100)}
                    min={1}
                    max={50}
                    step={1}
                  />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">0.01</span>
                    <span className="font-mono">{formatNumber(state.params.alpha, 2)}</span>
                    <span className="text-muted-foreground">0.50</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">ARCH coefficient</p>
              </div>

              {/* Beta */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Beta (β)</Label>
                <div className="space-y-2">
                  <Slider
                    value={[state.params.beta * 100]}
                    onValueChange={(v) => handleParamChange("beta", v[0] / 100)}
                    min={1}
                    max={99}
                    step={1}
                  />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">0.01</span>
                    <span className="font-mono">{formatNumber(state.params.beta, 2)}</span>
                    <span className="text-muted-foreground">0.99</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">GARCH coefficient</p>
              </div>

              {/* Gamma (for GJR-GARCH and EGARCH) */}
              {(state.modelType === "GJR-GARCH" || state.modelType === "EGARCH") && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Gamma (γ)</Label>
                  <div className="space-y-2">
                    <Slider
                      value={[(state.params.gamma || 0) * 100]}
                      onValueChange={(v) => handleParamChange("gamma", v[0] / 100)}
                      min={-50}
                      max={50}
                      step={1}
                    />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">-0.50</span>
                      <span className="font-mono">{formatNumber(state.params.gamma || 0, 2)}</span>
                      <span className="text-muted-foreground">0.50</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Asymmetry coefficient</p>
                </div>
              )}
            </div>

            {/* Persistence Check */}
            <Separator className="my-4" />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Persistence (α + β):</span>
                <Badge
                  variant={(state.params.alpha + state.params.beta) < 1 ? "default" : "destructive"}
                  className={
                    (state.params.alpha + state.params.beta) < 1
                      ? "bg-green-500/10 text-green-500"
                      : "bg-red-500/10 text-red-500"
                  }
                >
                  {formatNumber(state.params.alpha + state.params.beta, 3)}
                </Badge>
              </div>
              {(state.params.alpha + state.params.beta) >= 1 && (
                <div className="flex items-center gap-1 text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs">Persistence ≥ 1 indicates non-stationary process</span>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Error Display */}
      {state.error && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{state.error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <Tabs defaultValue="forecast" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="forecast">Volatility Forecast</TabsTrigger>
          <TabsTrigger value="conditional">Conditional Volatility</TabsTrigger>
          <TabsTrigger value="stats">Model Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {state.forecastDays}-Day Volatility Forecast
              </CardTitle>
              <CardDescription>
                Historical and forecasted volatility for {state.symbol}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {volatilityChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={volatilityChartData}>
                    <defs>
                      <linearGradient id="colorHistorical" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="index"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(v) => `${v.toFixed(1)}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`${value.toFixed(4)}%`, "Volatility"]}
                      labelFormatter={(label, payload) => {
                        const data = payload[0]?.payload;
                        return data?.type === "forecast" ? `Forecast Day ${label - state.historicalVolatility.length + 1}` : `Point ${label}`;
                      }}
                    />
                    <ReferenceLine
                      x={state.historicalVolatility.length}
                      stroke="#f59e0b"
                      strokeDasharray="5 5"
                      label={{ value: "Forecast Start", position: "top", fontSize: 10 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="volatility"
                      stroke="hsl(var(--primary))"
                      fill="url(#colorHistorical)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  {state.isLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    "No data available. Select a symbol to analyze."
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conditional" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Conditional Volatility</CardTitle>
              <CardDescription>
                Estimated conditional volatility from GARCH model (last 100 points)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {conditionalVolatilityData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={conditionalVolatilityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="index"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(v) => `${v.toFixed(1)}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`${value.toFixed(4)}%`, "Volatility"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="volatility"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  {state.isLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    "No data available"
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Model Fit Statistics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Model Fit Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                {state.result ? (
                  <div className="space-y-4">
                    {/* AIC */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">AIC</p>
                        <p className="text-xs text-muted-foreground">Akaike Information Criterion</p>
                      </div>
                      <span className="font-mono text-lg">{formatNumber(state.result.aic, 2)}</span>
                    </div>
                    <Separator />

                    {/* BIC */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">BIC</p>
                        <p className="text-xs text-muted-foreground">Bayesian Information Criterion</p>
                      </div>
                      <span className="font-mono text-lg">{formatNumber(state.result.bic, 2)}</span>
                    </div>
                    <Separator />

                    {/* Log-Likelihood */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Log-Likelihood</p>
                        <p className="text-xs text-muted-foreground">Model log-likelihood</p>
                      </div>
                      <span className="font-mono text-lg">{formatNumber(state.result.logLikelihood, 2)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    No model fitted
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Estimated Parameters */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Estimated Parameters
                </CardTitle>
              </CardHeader>
              <CardContent>
                {state.result ? (
                  <div className="space-y-4">
                    {/* Omega */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Omega (ω)</p>
                        <p className="text-xs text-muted-foreground">Constant term</p>
                      </div>
                      <span className="font-mono text-lg">{formatNumber(state.result.params.omega)}</span>
                    </div>
                    <Separator />

                    {/* Alpha */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Alpha (α)</p>
                        <p className="text-xs text-muted-foreground">ARCH coefficient</p>
                      </div>
                      <span className="font-mono text-lg">{formatNumber(state.result.params.alpha)}</span>
                    </div>
                    <Separator />

                    {/* Beta */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Beta (β)</p>
                        <p className="text-xs text-muted-foreground">GARCH coefficient</p>
                      </div>
                      <span className="font-mono text-lg">{formatNumber(state.result.params.beta)}</span>
                    </div>

                    {/* Gamma (if applicable) */}
                    {state.result.params.gamma !== undefined && (
                      <>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Gamma (γ)</p>
                            <p className="text-xs text-muted-foreground">Asymmetry coefficient</p>
                          </div>
                          <span className="font-mono text-lg">{formatNumber(state.result.params.gamma)}</span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    No model fitted
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Forecast Values */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Volatility Forecast ({state.forecastDays} days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {state.result?.forecast ? (
                  <ScrollArea className="h-[150px]">
                    <div className="grid grid-cols-5 md:grid-cols-10 gap-2 p-1">
                      {state.result.forecast.map((vol, i) => (
                        <div
                          key={i}
                          className="flex flex-col items-center p-2 rounded-lg bg-muted/50"
                        >
                          <span className="text-xs text-muted-foreground">Day {i + 1}</span>
                          <span className="font-mono text-sm">{formatPercent(vol)}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center h-[150px] text-muted-foreground">
                    No forecast available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Historical Volatility Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Historical Volatility Summary</CardTitle>
          <CardDescription>Recent volatility measurements</CardDescription>
        </CardHeader>
        <CardContent>
          {state.historicalVolatility.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Min</p>
                  <p className="font-mono text-sm">{formatPercent(Math.min(...state.historicalVolatility))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Max</p>
                  <p className="font-mono text-sm">{formatPercent(Math.max(...state.historicalVolatility))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mean</p>
                  <p className="font-mono text-sm">
                    {formatPercent(
                      state.historicalVolatility.reduce((a, b) => a + b, 0) /
                        state.historicalVolatility.length
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Std Dev</p>
                  <p className="font-mono text-sm">
                    {formatPercent(
                      Math.sqrt(
                        state.historicalVolatility.reduce(
                          (sum, v) => sum + Math.pow(v - state.historicalVolatility.reduce((a, b) => a + b, 0) / state.historicalVolatility.length, 2),
                          0
                        ) / state.historicalVolatility.length
                      )
                    )}
                  </p>
                </div>
              </div>

              {/* Mini volatility chart */}
              <div className="mt-4 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={state.historicalVolatility.slice(-50).map((v, i) => ({ i, v: v * 100 }))}>
                    <Bar dataKey="v" fill="hsl(var(--primary))" opacity={0.5} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[100px] text-muted-foreground">
              No historical data
            </div>
          )}
        </CardContent>
      </Card>

      {/* Integrations Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Интеграции GARCH
          </CardTitle>
          <CardDescription>
            Статус интеграций с торговыми ботами и ML моделями
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Trading Bots Integration */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">Trading Bots (DCA/BB/ORION)</span>
              </div>
              <Badge variant="default" className="bg-green-500/10 text-green-500 text-xs">
                Активно
              </Badge>
            </div>

            {/* LOGOS Integration */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">LOGOS Signal Weighting</span>
              </div>
              <Badge variant="default" className="bg-green-500/10 text-green-500 text-xs">
                Активно
              </Badge>
            </div>

            {/* Gradient Boosting Features */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">Gradient Boosting Features</span>
              </div>
              <Badge variant="default" className="bg-green-500/10 text-green-500 text-xs">
                Активно
              </Badge>
            </div>

            {/* Training Data Collector */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">Training Data Collector</span>
              </div>
              <Badge variant="default" className="bg-green-500/10 text-green-500 text-xs">
                Активно
              </Badge>
            </div>

            {/* Risk Management */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">AI Risk Management</span>
              </div>
              <Badge variant="default" className="bg-green-500/10 text-green-500 text-xs">
                Активно
              </Badge>
            </div>

            {/* Binance API */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">Binance Real-time Data</span>
              </div>
              <Badge variant="default" className="bg-green-500/10 text-green-500 text-xs">
                Подключено
              </Badge>
            </div>
          </div>

          {/* Risk Adjustment Preview */}
          {state.result && (
            <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-sm font-medium mb-2">Рекомендации по управлению рисками:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Размер позиции:</span>
                  <p className="font-mono">
                    {state.regime === 'low' ? '+20%' : state.regime === 'high' ? '-40%' : state.regime === 'extreme' ? '-80%' : '0%'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Stop Loss:</span>
                  <p className="font-mono">
                    {state.regime === 'low' ? '0.8x' : state.regime === 'high' ? '1.5x' : state.regime === 'extreme' ? '2.0x' : '1.0x'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Макс. позиция:</span>
                  <p className="font-mono">
                    {state.regime === 'low' ? '50%' : state.regime === 'high' ? '25%' : state.regime === 'extreme' ? '10%' : '40%'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Действие:</span>
                  <p className="font-mono">
                    {state.regime === 'extreme' ? 'HALT' : state.regime === 'high' ? 'REDUCE' : 'TRADE'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default VolatilityPanel;
