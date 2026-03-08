"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { FilterStatsCard } from "./filter-stats-card";
import { SignalIndicator } from "./signal-indicator";
import { EnsembleConfig } from "./ensemble-config";
import { LawrenceCalibration } from "./lawrence-calibration";
import {
  Settings2,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignalFilterPanelProps {
  filterType?: "ENHANCED" | "BB" | "DCA" | "VISION";
  symbol?: string;
  onConfigChange?: (config: FilterConfig) => void;
}

export interface FilterConfig {
  enabled: boolean;
  filterType: "ENHANCED" | "BB" | "DCA" | "VISION";
  weights: {
    superTrend: number;
    npc: number;
    squeeze: number;
  };
  thresholds: {
    signalThreshold: number;
    minConfidence: number;
  };
  optimizeWeights: boolean;
  regimeFilter: boolean;
}

export interface SignalPreview {
  direction: "LONG" | "SHORT" | "NONE";
  confidence: number;
  strength: number;
  timestamp: string;
  disagreement: boolean;
  regime: "LOW" | "MEDIUM" | "HIGH";
}

export interface FilterStats {
  totalSignals: number;
  winRate: number;
  avgConfidence: number;
  recentSignals: Array<{
    id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    confidence: number;
    timestamp: string;
    result?: "WIN" | "LOSS";
  }>;
  performanceTrend: number[];
}

// Demo data for display
const DEMO_STATS: Record<string, FilterStats> = {
  ENHANCED: {
    totalSignals: 1247,
    winRate: 68.5,
    avgConfidence: 72.3,
    recentSignals: [
      {
        id: "1",
        symbol: "BTCUSDT",
        direction: "LONG",
        confidence: 85,
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        result: "WIN",
      },
      {
        id: "2",
        symbol: "ETHUSDT",
        direction: "SHORT",
        confidence: 62,
        timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        result: "LOSS",
      },
      {
        id: "3",
        symbol: "SOLUSDT",
        direction: "LONG",
        confidence: 78,
        timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
        result: "WIN",
      },
      {
        id: "4",
        symbol: "DOGEUSDT",
        direction: "LONG",
        confidence: 71,
        timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      },
      {
        id: "5",
        symbol: "XRPUSDT",
        direction: "SHORT",
        confidence: 55,
        timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        result: "WIN",
      },
    ],
    performanceTrend: [65, 67, 64, 70, 68, 72, 69, 71, 68, 69],
  },
  BB: {
    totalSignals: 856,
    winRate: 72.1,
    avgConfidence: 75.8,
    recentSignals: [
      {
        id: "1",
        symbol: "BTCUSDT",
        direction: "LONG",
        confidence: 82,
        timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
        result: "WIN",
      },
    ],
    performanceTrend: [70, 71, 73, 72, 74, 71, 73, 75, 72, 72],
  },
  DCA: {
    totalSignals: 423,
    winRate: 81.2,
    avgConfidence: 68.4,
    recentSignals: [
      {
        id: "1",
        symbol: "ETHUSDT",
        direction: "LONG",
        confidence: 76,
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        result: "WIN",
      },
    ],
    performanceTrend: [78, 80, 79, 82, 81, 83, 80, 82, 81, 81],
  },
  VISION: {
    totalSignals: 312,
    winRate: 65.4,
    avgConfidence: 79.2,
    recentSignals: [
      {
        id: "1",
        symbol: "SOLUSDT",
        direction: "SHORT",
        confidence: 88,
        timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      },
    ],
    performanceTrend: [62, 64, 66, 63, 67, 65, 68, 66, 65, 65],
  },
};

const DEMO_PREVIEW: SignalPreview = {
  direction: "LONG",
  confidence: 78,
  strength: 85,
  timestamp: new Date().toISOString(),
  disagreement: false,
  regime: "MEDIUM",
};

export function SignalFilterPanel({
  filterType = "ENHANCED",
  symbol,
  onConfigChange,
}: SignalFilterPanelProps) {
  const [activeTab, setActiveTab] = useState<string>(filterType);
  const [config, setConfig] = useState<FilterConfig>({
    enabled: true,
    filterType: filterType,
    weights: {
      superTrend: 0.35,
      npc: 0.35,
      squeeze: 0.3,
    },
    thresholds: {
      signalThreshold: 0.6,
      minConfidence: 0.5,
    },
    optimizeWeights: true,
    regimeFilter: true,
  });

  const [preview] = useState<SignalPreview>(DEMO_PREVIEW);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleConfigUpdate = useCallback(
    (updates: Partial<FilterConfig>) => {
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      onConfigChange?.(newConfig);
    },
    [config, onConfigChange]
  );

  const handleWeightChange = useCallback(
    (key: keyof FilterConfig["weights"], value: number) => {
      handleConfigUpdate({
        weights: { ...config.weights, [key]: value },
      });
    },
    [config.weights, handleConfigUpdate]
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1500);
  }, []);

  const currentStats = DEMO_STATS[activeTab] || DEMO_STATS.ENHANCED;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Signal Filter Panel</CardTitle>
              <CardDescription className="text-sm">
                Configure and monitor signal filtering
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              {symbol || "All Symbols"}
            </Badge>
            <div className="flex items-center gap-2">
              <Label htmlFor="filter-toggle" className="text-xs text-muted-foreground">
                {config.enabled ? "Enabled" : "Disabled"}
              </Label>
              <Switch
                id="filter-toggle"
                checked={config.enabled}
                onCheckedChange={(checked) => handleConfigUpdate({ enabled: checked })}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="ENHANCED" className="text-xs">
              Enhanced
            </TabsTrigger>
            <TabsTrigger value="BB" className="text-xs">
              BB
            </TabsTrigger>
            <TabsTrigger value="DCA" className="text-xs">
              DCA
            </TabsTrigger>
            <TabsTrigger value="VISION" className="text-xs">
              Vision
            </TabsTrigger>
          </TabsList>

          {["ENHANCED", "BB", "DCA", "VISION"].map((type) => (
            <TabsContent key={type} value={type} className="space-y-4 mt-4">
              {/* Signal Indicator Row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <SignalIndicator signal={preview} />
                </div>
                <div className="flex-1">
                  <FilterStatsCard
                    stats={DEMO_STATS[type] || DEMO_STATS.ENHANCED}
                    compact
                  />
                </div>
              </div>

              {/* Configuration Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Ensemble Config */}
                <EnsembleConfig
                  weights={config.weights}
                  thresholds={config.thresholds}
                  optimizeWeights={config.optimizeWeights}
                  regimeFilter={config.regimeFilter}
                  onWeightsChange={(weights) => handleConfigUpdate({ weights })}
                  onThresholdsChange={(thresholds) => handleConfigUpdate({ thresholds })}
                  onOptimizeWeightsChange={(optimizeWeights) =>
                    handleConfigUpdate({ optimizeWeights })
                  }
                  onRegimeFilterChange={(regimeFilter) =>
                    handleConfigUpdate({ regimeFilter })
                  }
                />

                {/* Lawrence Calibration */}
                <LawrenceCalibration filterType={type as "ENHANCED" | "BB" | "DCA" | "VISION"} />
              </div>

              {/* Last Signal Preview */}
              <Card className="bg-secondary/30">
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Last Signal Preview
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                    >
                      <RefreshCw
                        className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                      />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center",
                          preview.direction === "LONG"
                            ? "bg-green-500/20"
                            : preview.direction === "SHORT"
                              ? "bg-red-500/20"
                              : "bg-gray-500/20"
                        )}
                      >
                        {preview.direction === "LONG" ? (
                          <TrendingUp className="h-6 w-6 text-green-500" />
                        ) : preview.direction === "SHORT" ? (
                          <TrendingDown className="h-6 w-6 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-6 w-6 text-gray-500" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-lg">
                            {preview.direction}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              preview.regime === "HIGH"
                                ? "bg-red-500/10 text-red-500"
                                : preview.regime === "MEDIUM"
                                  ? "bg-yellow-500/10 text-yellow-500"
                                  : "bg-green-500/10 text-green-500"
                            )}
                          >
                            {preview.regime} VOL
                          </Badge>
                          {preview.disagreement && (
                            <Badge className="bg-orange-500/10 text-orange-500 text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Disagreement
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {symbol || "BTCUSDT"} • {new Date(preview.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Confidence</div>
                      <div className="text-2xl font-bold">{preview.confidence}%</div>
                      <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden mt-1">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            preview.confidence >= 70
                              ? "bg-green-500"
                              : preview.confidence >= 50
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          )}
                          style={{ width: `${preview.confidence}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
