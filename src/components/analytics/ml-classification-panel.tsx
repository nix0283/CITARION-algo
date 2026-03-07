"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  Database,
  Target,
  Timer,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Zap,
  Clock,
  Globe,
  Layers,
  BarChart3,
  Play,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ==================== TYPES ====================

interface ClassifierState {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  probability: number;
  confidence: number;
  calibratedProbability: number;
  features: Record<string, number>;
  kernelEstimate?: {
    value: number;
    confidence: number;
    sampleCount: number;
  };
  sessionValid: boolean;
  activeSession?: string;
  featureImportance: Record<string, number>;
}

interface ClassifierConfig {
  neighborCount: number;
  lookbackWindow: number;
  minConfidence: number;
  minProbability: number;
  usePlattScaling: boolean;
  useKernelSmoothing: boolean;
  useSessionFilter: boolean;
  kernelType: 'gaussian' | 'epanechnikov' | 'uniform' | 'triangular';
  sessions: string[];
}

interface ClassifierStats {
  totalSamples: number;
  longCount: number;
  shortCount: number;
  neutralCount: number;
  avgConfidence: number;
  winRate: number;
  lastUpdated: string;
}

interface SignalState {
  type: number;
  direction: string;
  action: string;
  passed: boolean;
  reasons: string[];
}

// ==================== MAIN COMPONENT ====================

export function MLClassificationPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ClassifierState | null>(null);
  const [signal, setSignal] = useState<SignalState | null>(null);
  const [stats, setStats] = useState<ClassifierStats>({
    totalSamples: 15420,
    longCount: 5230,
    shortCount: 4980,
    neutralCount: 5210,
    avgConfidence: 0.68,
    winRate: 0.65,
    lastUpdated: new Date().toISOString(),
  });

  // Classifier configuration
  const [config, setConfig] = useState<ClassifierConfig>({
    neighborCount: 8,
    lookbackWindow: 2000,
    minConfidence: 0.6,
    minProbability: 0.55,
    usePlattScaling: true,
    useKernelSmoothing: true,
    useSessionFilter: true,
    kernelType: 'gaussian',
    sessions: ['LONDON', 'NEW_YORK'],
  });

  // Extended features state
  const [extendedFeatures, setExtendedFeatures] = useState<Record<string, number>>({});

  // Simulated market data (in real app would come from API)
  const symbol = 'BTCUSDT';
  const timeframe = '1h';

  // Run classification
  const runClassification = useCallback(async () => {
    setIsRunning(true);

    try {
      // In production, this would call the actual API
      // For demo, we simulate the classification result
      await new Promise(r => setTimeout(r, 500));

      const mockFeatures = {
        n_rsi: 0.65,
        n_cci: 0.45,
        n_wt: 0.58,
        n_adx: 0.72,
        momentum: 0.32,
        volatility_ratio: 1.15,
        trend_strength: 68,
        volume_profile: 1.45,
        price_velocity: 0.08,
        efficiency_ratio: 0.75,
        session_factor: 0.85,
        day_of_week_factor: 0.9,
      };

      const direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 
        Math.random() > 0.5 ? 'LONG' : Math.random() > 0.3 ? 'SHORT' : 'NEUTRAL';

      const probability = 0.55 + Math.random() * 0.35;
      const confidence = 0.5 + Math.random() * 0.4;

      const classifierResult: ClassifierState = {
        direction,
        probability,
        confidence,
        calibratedProbability: config.usePlattScaling 
          ? Math.min(0.95, probability + 0.05) 
          : probability,
        features: mockFeatures,
        kernelEstimate: config.useKernelSmoothing ? {
          value: probability * 0.9,
          confidence: 0.75,
          sampleCount: 10,
        } : undefined,
        sessionValid: config.useSessionFilter ? Math.random() > 0.2 : true,
        activeSession: 'LONDON, NEW_YORK',
        featureImportance: {
          momentum: 1.0,
          volatility_ratio: 1.0,
          trend_strength: 1.2,
          volume_profile: 0.8,
        },
      };

      setResult(classifierResult);
      setExtendedFeatures(mockFeatures);

      // Process signal through SignalAdapter
      const signalResult: SignalState = {
        type: direction === 'LONG' ? 1 : direction === 'SHORT' ? -1 : 0,
        direction,
        action: 'ENTER',
        passed: classifierResult.sessionValid && 
                confidence >= config.minConfidence &&
                probability >= config.minProbability,
        reasons: !classifierResult.sessionValid ? ['Outside trading session'] :
                 confidence < config.minConfidence ? ['Confidence below threshold'] :
                 probability < config.minProbability ? ['Probability below threshold'] : [],
      };

      setSignal(signalResult);

      toast.success(`Classification complete: ${direction} (${(probability * 100).toFixed(0)}%)`);
    } catch (error) {
      toast.error('Classification failed');
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  }, [config]);

  // Train classifier
  const trainClassifier = useCallback(async () => {
    toast.info('Training classifier...');

    // Simulate training
    await new Promise(r => setTimeout(r, 2000));

    setStats(prev => ({
      ...prev,
      totalSamples: prev.totalSamples + Math.floor(Math.random() * 500),
      lastUpdated: new Date().toISOString(),
      avgConfidence: Math.min(0.85, prev.avgConfidence + Math.random() * 0.05),
      winRate: Math.min(0.85, prev.winRate + Math.random() * 0.03),
    }));

    toast.success('Classifier trained successfully');
  }, []);

  // Get direction color
  const getDirectionColor = (dir: string) => {
    if (dir === 'LONG') return 'text-green-500';
    if (dir === 'SHORT') return 'text-red-500';
    return 'text-yellow-500';
  };

  // Get direction icon
  const DirectionIcon = result?.direction === 'LONG' ? TrendingUp : 
                        result?.direction === 'SHORT' ? TrendingDown : Activity;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-500" />
            ML Lorentzian Classification
          </h2>
          <p className="text-muted-foreground mt-1">
            Enhanced k-NN classifier with Lorentzian distance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-purple-500/10 text-purple-500">
            {symbol} / {timeframe}
          </Badge>
          <Button
            onClick={runClassification}
            disabled={isRunning}
            className="min-w-[140px]"
          >
            {isRunning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Classify
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Result Card */}
      {result && (
        <Card className={cn(
          "border-2",
          result.direction === 'LONG' ? "border-green-500/30" :
          result.direction === 'SHORT' ? "border-red-500/30" : "border-yellow-500/30"
        )}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center",
                  result.direction === 'LONG' ? "bg-green-500/10" :
                  result.direction === 'SHORT' ? "bg-red-500/10" : "bg-yellow-500/10"
                )}>
                  <DirectionIcon className={cn(
                    "h-8 w-8",
                    getDirectionColor(result.direction)
                  )} />
                </div>
                <div>
                  <div className={cn(
                    "text-3xl font-bold",
                    getDirectionColor(result.direction)
                  )}>
                    {result.direction}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    {new Date().toLocaleTimeString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 text-center">
                {/* Probability */}
                <div>
                  <div className="text-2xl font-bold">
                    {(result.probability * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Probability</div>
                  <Progress value={result.probability * 100} className="h-1 mt-1" />
                </div>

                {/* Calibrated Probability */}
                <div>
                  <div className="text-2xl font-bold text-blue-500">
                    {(result.calibratedProbability * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Calibrated</div>
                  <Progress value={result.calibratedProbability * 100} className="h-1 mt-1" />
                </div>

                {/* Confidence */}
                <div>
                  <div className="text-2xl font-bold text-purple-500">
                    {(result.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <Progress value={result.confidence * 100} className="h-1 mt-1" />
                </div>
              </div>
            </div>

            {/* Signal Status */}
            {signal && (
              <div className={cn(
                "mt-4 p-3 rounded-lg flex items-center justify-between",
                signal.passed ? "bg-green-500/10" : "bg-red-500/10"
              )}>
                <div className="flex items-center gap-2">
                  {signal.passed ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={signal.passed ? "text-green-500" : "text-red-500"}>
                    Signal {signal.passed ? 'Valid' : 'Filtered'}
                  </span>
                </div>
                {signal.reasons.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    {signal.reasons.join(', ')}
                  </div>
                )}
                {result.sessionValid && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
                    <Globe className="h-3 w-3 mr-1" />
                    {result.activeSession}
                  </Badge>
                )}
              </div>
            )}

            {/* Kernel Estimate */}
            {result.kernelEstimate && (
              <div className="mt-4 p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Kernel Smoothing</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Estimate: </span>
                    <span className="font-mono">{(result.kernelEstimate.value * 100).toFixed(0)}%</span>
                    <span className="text-muted-foreground ml-2">Confidence: </span>
                    <span className="font-mono">{(result.kernelEstimate.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* k-NN Settings */}
            <div className="space-y-2">
              <Label>Neighbors (k): {config.neighborCount}</Label>
              <Slider
                value={[config.neighborCount]}
                onValueChange={([v]) => setConfig(c => ({ ...c, neighborCount: v }))}
                min={3}
                max={15}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label>Min Confidence: {(config.minConfidence * 100).toFixed(0)}%</Label>
              <Slider
                value={[config.minConfidence * 100]}
                onValueChange={([v]) => setConfig(c => ({ ...c, minConfidence: v / 100 }))}
                min={40}
                max={90}
                step={5}
              />
            </div>

            <div className="space-y-2">
              <Label>Min Probability: {(config.minProbability * 100).toFixed(0)}%</Label>
              <Slider
                value={[config.minProbability * 100]}
                onValueChange={([v]) => setConfig(c => ({ ...c, minProbability: v / 100 }))}
                min={40}
                max={90}
                step={5}
              />
            </div>

            {/* Toggles */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Platt Scaling
                </Label>
                <Switch
                  checked={config.usePlattScaling}
                  onCheckedChange={(v) => setConfig(c => ({ ...c, usePlattScaling: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-500" />
                  Kernel Smoothing
                </Label>
                <Switch
                  checked={config.useKernelSmoothing}
                  onCheckedChange={(v) => setConfig(c => ({ ...c, useKernelSmoothing: v }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-green-500" />
                  Session Filter
                </Label>
                <Switch
                  checked={config.useSessionFilter}
                  onCheckedChange={(v) => setConfig(c => ({ ...c, useSessionFilter: v }))}
                />
              </div>
            </div>

            {/* Kernel Type */}
            {config.useKernelSmoothing && (
              <div className="space-y-2">
                <Label>Kernel Type</Label>
                <Select
                  value={config.kernelType}
                  onValueChange={(v) => setConfig(c => ({ ...c, kernelType: v as typeof config.kernelType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gaussian">Gaussian</SelectItem>
                    <SelectItem value="epanechnikov">Epanechnikov</SelectItem>
                    <SelectItem value="uniform">Uniform</SelectItem>
                    <SelectItem value="triangular">Triangular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Classifier Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sample Distribution */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-green-500/10 text-center">
                <div className="text-xl font-bold text-green-500">{stats.longCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">LONG</div>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 text-center">
                <div className="text-xl font-bold text-red-500">{stats.shortCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">SHORT</div>
              </div>
              <div className="p-3 rounded-lg bg-yellow-500/10 text-center">
                <div className="text-xl font-bold text-yellow-500">{stats.neutralCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">NEUTRAL</div>
              </div>
            </div>

            {/* Metrics */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Total Samples</span>
                </div>
                <span className="font-mono font-semibold">{stats.totalSamples.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Win Rate</span>
                </div>
                <span className="font-mono font-semibold text-green-500">
                  {(stats.winRate * 100).toFixed(1)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Avg Confidence</span>
                </div>
                <span className="font-mono font-semibold">
                  {(stats.avgConfidence * 100).toFixed(1)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Last Updated</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(stats.lastUpdated).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Train Button */}
            <Button onClick={trainClassifier} className="w-full" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retrain Classifier
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Extended Features */}
      {Object.keys(extendedFeatures).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Extended Features
            </CardTitle>
            <CardDescription>
              Additional market features for improved classification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(extendedFeatures).map(([name, value]) => (
                <div key={name} className="p-3 rounded-lg bg-secondary/30">
                  <div className="text-xs text-muted-foreground mb-1">{name.replace(/_/g, ' ')}</div>
                  <div className="font-mono font-semibold">
                    {typeof value === 'number' ? value.toFixed(3) : value}
                  </div>
                  <div className="h-1 bg-secondary rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, Math.abs(value) * 50)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Trading Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { name: 'Asian', hours: '00:00-08:00 UTC', active: true },
              { name: 'London', hours: '08:00-16:00 UTC', active: true },
              { name: 'New York', hours: '13:00-21:00 UTC', active: true },
              { name: 'London-NY', hours: '13:00-16:00 UTC', active: false },
              { name: 'Asian-London', hours: '07:00-09:00 UTC', active: false },
            ].map((session) => (
              <div
                key={session.name}
                className={cn(
                  "p-3 rounded-lg border",
                  session.active ? "border-green-500/30 bg-green-500/5" : "border-border"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{session.name}</span>
                  {session.active && (
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{session.hours}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default { MLClassificationPanel };
