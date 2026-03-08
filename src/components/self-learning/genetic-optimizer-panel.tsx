"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Settings,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Dna,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Download,
  Users,
  GitBranch,
  Shuffle,
  Trophy,
  BarChart3,
  Timer,
  Gauge,
  Bot,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { GeneticConfig, PopulationStats } from "@/lib/self-learning/types";

// ==================== TYPES ====================

type OptimizerStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";

interface Gene {
  name: string;
  value: number;
  min: number;
  max: number;
  mutationRate: number;
}

interface Chromosome {
  fitness: number;
  genes: Gene[];
}

interface OptimizationJob {
  id: string;
  botCode: string;
  botType: string;
  symbol: string;
  status: string;
  generation: number;
  progress: number;
  bestChromosome: Chromosome | null;
  history: PopulationStats[];
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number;
  error: string | null;
  volatilityRegime: string | null;
  gaGarchConfig: {
    fitnessMultiplier: number;
    explorationBoost: number;
    regimeScore: number;
    trend: string;
  } | null;
}

interface ApplyResult {
  success: boolean;
  botCode: string;
  appliedParams: Record<string, number>;
  fitness: number;
  message: string;
}

// ==================== DEFAULT VALUES ====================

const DEFAULT_GENETIC_CONFIG: GeneticConfig = {
  populationSize: 50,
  maxGenerations: 100,
  eliteCount: 2,
  selectionMethod: "tournament",
  tournamentSize: 3,
  crossoverMethod: "blend",
  crossoverRate: 0.8,
  mutationMethod: "adaptive",
  mutationRate: 0.1,
  adaptiveMutationIncrease: 1.5,
  earlyStoppingPatience: 20,
  improvementThreshold: 0.001,
  parallelEvaluation: false,
};

const BOT_TYPES = [
  { value: "DCA", label: "DCA Bot", description: "Dollar Cost Averaging" },
  { value: "BB", label: "BB Bot", description: "Bollinger Bands" },
  { value: "ORION", label: "ORION Bot", description: "Multi-indicator" },
  { value: "LOGOS", label: "LOGOS Bot", description: "Meta strategy" },
  { value: "GRID", label: "GRID Bot", description: "Grid trading" },
  { value: "MFT", label: "MFT Bot", description: "Momentum Flow" },
];

const CHART_CONFIG: ChartConfig = {
  bestFitness: { label: "Best Fitness", color: "hsl(var(--chart-1))" },
  avgFitness: { label: "Avg Fitness", color: "hsl(var(--chart-2))" },
  diversity: { label: "Diversity", color: "hsl(var(--chart-4))" },
};

// ==================== MAIN COMPONENT ====================

export function GeneticOptimizerPanel() {
  // Configuration state
  const [config, setConfig] = useState<GeneticConfig>(DEFAULT_GENETIC_CONFIG);
  const [botType, setBotType] = useState<string>("DCA");
  const [botCode, setBotCode] = useState<string>("DCA-BTC-001");
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [volatilityAware, setVolatilityAware] = useState<boolean>(true);

  // Job state
  const [currentJob, setCurrentJob] = useState<OptimizationJob | null>(null);
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  // Polling for progress
  useEffect(() => {
    if (!currentJob || currentJob.status !== "running") return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/ga/progress?jobId=${currentJob.id}`);
        if (response.ok) {
          const data = await response.json();
          setCurrentJob(data);

          if (data.status === "completed" || data.status === "failed") {
            await loadJobs();
          }
        }
      } catch (error) {
        console.error("Error polling progress:", error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJob]);

  // Load existing jobs on mount
  useEffect(() => {
    loadJobs();
  }, []);

  // Load jobs from API
  const loadJobs = async () => {
    try {
      const response = await fetch("/api/ga/optimize");
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Error loading jobs:", error);
    }
  };

  // Update config helper
  const updateConfig = useCallback(<K extends keyof GeneticConfig>(
    key: K,
    value: GeneticConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Start optimization
  const startOptimization = useCallback(async () => {
    if (!botCode || !botType || !symbol) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/ga/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botCode,
          botType,
          symbol,
          volatilityAware,
          config: {
            populationSize: config.populationSize,
            maxGenerations: config.maxGenerations,
            eliteCount: config.eliteCount,
            mutationRate: config.mutationRate,
            crossoverRate: config.crossoverRate,
            selectionMethod: config.selectionMethod,
            crossoverMethod: config.crossoverMethod,
            mutationMethod: config.mutationMethod,
            tournamentSize: config.tournamentSize,
            earlyStoppingPatience: config.earlyStoppingPatience,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCurrentJob({
          id: data.jobId,
          botCode,
          botType,
          symbol,
          status: data.status,
          generation: 0,
          progress: 0,
          bestChromosome: null,
          history: [],
          startedAt: Date.now(),
          completedAt: null,
          durationMs: 0,
          error: null,
          volatilityRegime: data.volatilityRegime,
          gaGarchConfig: data.gaGarchConfig,
        });
        toast.success(`Optimization started for ${botCode}`);
        await loadJobs();
      } else {
        toast.error(data.error || "Failed to start optimization");
      }
    } catch (error) {
      console.error("Error starting optimization:", error);
      toast.error("Failed to start optimization");
    } finally {
      setIsLoading(false);
    }
  }, [botCode, botType, symbol, volatilityAware, config]);

  // Apply optimized parameters to bot
  const applyToBot = useCallback(async (jobId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/ga/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      const data = await response.json();
      setApplyResult(data);

      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error("Error applying parameters:", error);
      toast.error("Failed to apply parameters");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Apply latest for bot
  const applyLatestForBot = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/ga/apply?botCode=${code}`, {
        method: "POST",
      });

      const data = await response.json();
      setApplyResult(data);

      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message || `No completed optimization for ${code}`);
      }
    } catch (error) {
      console.error("Error applying parameters:", error);
      toast.error("Failed to apply parameters");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Copy best genes to clipboard
  const copyBestGenes = useCallback(() => {
    if (!currentJob?.bestChromosome) return;

    const genes = currentJob.bestChromosome.genes.reduce(
      (obj, gene) => ({ ...obj, [gene.name]: gene.value }),
      {} as Record<string, number>
    );

    navigator.clipboard.writeText(JSON.stringify(genes, null, 2));
    toast.success("Best genes copied to clipboard");
  }, [currentJob]);

  // Export results
  const exportResults = useCallback(() => {
    if (!currentJob) return;

    const json = JSON.stringify(currentJob, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ga-optimization-${currentJob.botCode}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Results exported");
  }, [currentJob]);

  // Format time
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const styles: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      IDLE: { color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: <Clock className="h-3 w-3" />, label: "Ready" },
      pending: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <Clock className="h-3 w-3" />, label: "Pending" },
      running: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <RefreshCw className="h-3 w-3 animate-spin" />, label: "Running" },
      completed: { color: "bg-green-500/20 text-green-400 border-green-500/30", icon: <CheckCircle className="h-3 w-3" />, label: "Completed" },
      failed: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3" />, label: "Failed" },
      cancelled: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3" />, label: "Cancelled" },
    };
    const { color, icon, label } = styles[status] || styles.IDLE;
    return (
      <Badge variant="outline" className={cn("gap-1", color)}>
        {icon}
        {label}
      </Badge>
    );
  };

  // Get volatility badge
  const getVolatilityBadge = (regime: string | null) => {
    if (!regime) return null;
    const colors: Record<string, string> = {
      low: "bg-green-500/20 text-green-400 border-green-500/30",
      normal: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      high: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      extreme: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return (
      <Badge variant="outline" className={colors[regime] || colors.normal}>
        {regime.toUpperCase()} VOL
      </Badge>
    );
  };

  // Chart data
  const chartData = currentJob?.history?.map((h) => ({
    generation: h.generation,
    bestFitness: h.bestFitness,
    avgFitness: h.avgFitness,
    diversity: h.diversity,
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Dna className="h-6 w-6 text-primary" />
            Genetic Algorithm Optimizer
          </h2>
          <p className="text-sm text-muted-foreground">
            Optimize trading bot parameters using evolutionary algorithms
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentJob && getStatusBadge(currentJob.status)}
          {currentJob?.bestChromosome && (
            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
              <Trophy className="h-3 w-3 mr-1" />
              Fitness: {currentJob.bestChromosome.fitness.toFixed(4)}
            </Badge>
          )}
          {currentJob?.volatilityRegime && getVolatilityBadge(currentJob.volatilityRegime)}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Configuration */}
        <div className="xl:col-span-1 space-y-6">
          {/* Bot Selection */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Bot Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Bot Type</Label>
                <Select value={botType} onValueChange={setBotType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOT_TYPES.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value}>
                        <div>
                          <div className="font-medium">{bt.label}</div>
                          <div className="text-xs text-muted-foreground">{bt.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Bot Code</Label>
                <Input
                  value={botCode}
                  onChange={(e) => setBotCode(e.target.value)}
                  placeholder="e.g., DCA-BTC-001"
                  disabled={isLoading}
                />
                <p className="text-xs text-amber-500 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    <strong>Важно:</strong> Бот должен существовать в системе. Сначала создайте бота в соответствующем разделе (DCA Bot → Крон, BB Bot, Grid Bot, ORION Bot, MFT Bot), затем оптимизируйте параметры.
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Symbol</Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g., BTCUSDT"
                  disabled={isLoading}
                />
              </div>

              <Separator />

              {/* GARCH Integration Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm font-medium">Volatility-Aware</p>
                  <p className="text-xs text-muted-foreground">Use GARCH for adaptive optimization</p>
                </div>
                <Switch
                  checked={volatilityAware}
                  onCheckedChange={setVolatilityAware}
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Population Configuration */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Population Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Population Size</Label>
                  <Input
                    type="number"
                    value={config.populationSize}
                    onChange={(e) => updateConfig("populationSize", Number(e.target.value))}
                    disabled={isLoading}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Max Generations</Label>
                  <Input
                    type="number"
                    value={config.maxGenerations}
                    onChange={(e) => updateConfig("maxGenerations", Number(e.target.value))}
                    disabled={isLoading}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Mutation Rate Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Mutation Rate</Label>
                  <Badge variant="outline" className="text-xs">
                    {(config.mutationRate * 100).toFixed(0)}%
                  </Badge>
                </div>
                <Slider
                  value={[config.mutationRate]}
                  onValueChange={([v]) => updateConfig("mutationRate", v)}
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  disabled={isLoading}
                />
              </div>

              {/* Crossover Rate Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Crossover Rate</Label>
                  <Badge variant="outline" className="text-xs">
                    {(config.crossoverRate * 100).toFixed(0)}%
                  </Badge>
                </div>
                <Slider
                  value={[config.crossoverRate]}
                  onValueChange={([v]) => updateConfig("crossoverRate", v)}
                  min={0.1}
                  max={1}
                  step={0.05}
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Elite Count</Label>
                  <Input
                    type="number"
                    value={config.eliteCount}
                    onChange={(e) => updateConfig("eliteCount", Number(e.target.value))}
                    disabled={isLoading}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Early Stop</Label>
                  <Input
                    type="number"
                    value={config.earlyStoppingPatience}
                    onChange={(e) => updateConfig("earlyStoppingPatience", Number(e.target.value))}
                    disabled={isLoading}
                    className="h-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selection & Methods */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Methods</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={config.selectionMethod}
                onValueChange={(v) => updateConfig("selectionMethod", v as any)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tournament">Tournament</SelectItem>
                  <SelectItem value="roulette">Roulette Wheel</SelectItem>
                  <SelectItem value="rank">Rank Selection</SelectItem>
                  <SelectItem value="elitist">Elitist</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={config.crossoverMethod}
                onValueChange={(v) => updateConfig("crossoverMethod", v as any)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blend">Blend (BLX-α)</SelectItem>
                  <SelectItem value="single_point">Single Point</SelectItem>
                  <SelectItem value="two_point">Two Point</SelectItem>
                  <SelectItem value="uniform">Uniform</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={config.mutationMethod}
                onValueChange={(v) => updateConfig("mutationMethod", v as any)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adaptive">Adaptive</SelectItem>
                  <SelectItem value="gaussian">Gaussian</SelectItem>
                  <SelectItem value="random">Random</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Control Buttons */}
          <Card className="bg-card border-border">
            <CardContent className="pt-4">
              <Button
                className="w-full gradient-primary text-background font-semibold"
                onClick={startOptimization}
                disabled={isLoading || currentJob?.status === "running"}
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start Optimization
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Columns: Progress & Results */}
        <div className="xl:col-span-2 space-y-6">
          {/* Current Job Progress */}
          {currentJob && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Optimization Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Generation {currentJob.generation} / {config.maxGenerations}
                    </span>
                    <span className="font-mono">{currentJob.progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={currentJob.progress} className="h-2" />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Elapsed</p>
                    <p className="text-lg font-mono">
                      {formatTime(currentJob.durationMs || (currentJob.startedAt ? Date.now() - currentJob.startedAt : 0))}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Best Fitness</p>
                    <p className="text-lg font-mono text-green-400">
                      {currentJob.bestChromosome?.fitness?.toFixed(4) || "-"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Volatility</p>
                    <p className="text-lg font-mono">
                      {currentJob.volatilityRegime?.toUpperCase() || "-"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-lg">{getStatusBadge(currentJob.status)}</p>
                  </div>
                </div>

                {/* GARCH Config */}
                {currentJob.gaGarchConfig && (
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground mb-2">GARCH Adjustments</p>
                    <div className="flex gap-4 text-sm">
                      <span>Fitness Mult: {currentJob.gaGarchConfig.fitnessMultiplier}</span>
                      <span>Exploration: {currentJob.gaGarchConfig.explorationBoost}</span>
                      <span>Regime Score: {currentJob.gaGarchConfig.regimeScore}</span>
                    </div>
                  </div>
                )}

                {/* Best Chromosome */}
                {currentJob.bestChromosome && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Optimized Parameters</p>
                    <ScrollArea className="h-40 rounded border p-2">
                      <div className="grid grid-cols-2 gap-2">
                        {currentJob.bestChromosome.genes.map((gene) => (
                          <div key={gene.name} className="flex justify-between p-2 rounded bg-secondary/30">
                            <span className="text-xs text-muted-foreground">{gene.name}</span>
                            <span className="text-xs font-mono">{gene.value.toFixed(4)}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={copyBestGenes}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportResults}>
                        <Download className="h-3 w-3 mr-1" /> Export
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => applyToBot(currentJob.id)}
                        disabled={currentJob.status !== "completed"}
                        className="gradient-primary text-background"
                      >
                        <ArrowRight className="h-3 w-3 mr-1" /> Apply to Bot
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Fitness Chart */}
          {chartData.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Fitness Evolution</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={CHART_CONFIG} className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="generation" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area type="monotone" dataKey="bestFitness" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="avgFitness" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.1} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Job History */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Optimization History</span>
                <Button variant="ghost" size="sm" onClick={loadJobs}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bot Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Gen</TableHead>
                      <TableHead>Fitness</TableHead>
                      <TableHead>Vol</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No optimization jobs yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-mono text-xs">{job.botCode}</TableCell>
                          <TableCell>{job.botType}</TableCell>
                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                          <TableCell>{job.generation}</TableCell>
                          <TableCell className="font-mono">
                            {job.bestChromosome?.fitness?.toFixed(4) || "-"}
                          </TableCell>
                          <TableCell>{getVolatilityBadge(job.volatilityRegime) || "-"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCurrentJob(job)}
                            >
                              View
                            </Button>
                            {job.status === "completed" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => applyToBot(job.id)}
                              >
                                Apply
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Apply Result */}
          {applyResult && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {applyResult.success ? "Parameters Applied" : "Apply Result"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={applyResult.success ? "text-green-400" : "text-red-400"}>
                  {applyResult.message}
                </p>
                {applyResult.success && (
                  <ScrollArea className="h-32 mt-2 rounded border p-2">
                    <pre className="text-xs">{JSON.stringify(applyResult.appliedParams, null, 2)}</pre>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
