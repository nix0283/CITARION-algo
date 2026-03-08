"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface EnsembleWeights {
  superTrend: number;
  npc: number;
  squeeze: number;
}

export interface EnsembleThresholds {
  signalThreshold: number;
  minConfidence: number;
}

export interface EnsembleConfigProps {
  weights: EnsembleWeights;
  thresholds: EnsembleThresholds;
  optimizeWeights: boolean;
  regimeFilter: boolean;
  onWeightsChange?: (weights: EnsembleWeights) => void;
  onThresholdsChange?: (thresholds: EnsembleThresholds) => void;
  onOptimizeWeightsChange?: (enabled: boolean) => void;
  onRegimeFilterChange?: (enabled: boolean) => void;
}

const WEIGHT_COLORS: Record<keyof EnsembleWeights, string> = {
  superTrend: "bg-blue-500",
  npc: "bg-purple-500",
  squeeze: "bg-emerald-500",
};

const WEIGHT_LABELS: Record<keyof EnsembleWeights, string> = {
  superTrend: "SuperTrend",
  npc: "NPC",
  squeeze: "Squeeze",
};

export function EnsembleConfig({
  weights,
  thresholds,
  optimizeWeights,
  regimeFilter,
  onWeightsChange,
  onThresholdsChange,
  onOptimizeWeightsChange,
  onRegimeFilterChange,
}: EnsembleConfigProps) {
  // Calculate total weight for validation
  const totalWeight = useMemo(() => {
    return weights.superTrend + weights.npc + weights.squeeze;
  }, [weights]);

  const isWeightValid = Math.abs(totalWeight - 1) < 0.01;

  // Handle individual weight change and auto-normalize
  const handleWeightChange = (key: keyof EnsembleWeights, value: number) => {
    const newWeights = { ...weights, [key]: value };

    // Auto-normalize to sum to 1
    const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
    if (total > 0) {
      const normalizedWeights = {
        superTrend: Number((newWeights.superTrend / total).toFixed(3)),
        npc: Number((newWeights.npc / total).toFixed(3)),
        squeeze: Number((newWeights.squeeze / total).toFixed(3)),
      };
      onWeightsChange?.(normalizedWeights);
    }
  };

  const handleThresholdChange = (key: keyof EnsembleThresholds, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
      onThresholdsChange?.({ ...thresholds, [key]: numValue });
    }
  };

  return (
    <Card>
      <CardHeader className="py-4 px-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Ensemble Configuration</CardTitle>
            <CardDescription className="text-xs">
              Adjust weights and thresholds
            </CardDescription>
          </div>
          <Badge
            variant={isWeightValid ? "default" : "destructive"}
            className="text-xs"
          >
            Sum: {(totalWeight * 100).toFixed(0)}%
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-4 pb-4">
        {/* Weight Sliders */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Strategy Weights</Label>
            <Switch
              checked={optimizeWeights}
              onCheckedChange={onOptimizeWeightsChange}
            />
          </div>

          {(Object.keys(weights) as Array<keyof EnsembleWeights>).map((key) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  {WEIGHT_LABELS[key]}
                </Label>
                <span className="text-xs font-mono">
                  {(weights[key] * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[weights[key] * 100]}
                min={0}
                max={100}
                step={1}
                disabled={optimizeWeights}
                onValueChange={([value]) => handleWeightChange(key, value / 100)}
                className={cn(optimizeWeights && "opacity-50")}
              />
            </div>
          ))}

          {/* Visual Weight Distribution */}
          <div className="mt-3">
            <Label className="text-xs text-muted-foreground mb-2 block">
              Weight Distribution
            </Label>
            <div className="h-4 rounded-full overflow-hidden flex bg-secondary">
              {(Object.keys(weights) as Array<keyof EnsembleWeights>).map((key) => (
                <div
                  key={key}
                  className={cn(
                    "h-full transition-all duration-300",
                    WEIGHT_COLORS[key]
                  )}
                  style={{ width: `${weights[key] * 100}%` }}
                  title={`${WEIGHT_LABELS[key]}: ${(weights[key] * 100).toFixed(0)}%`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {(Object.keys(weights) as Array<keyof EnsembleWeights>).map((key) => (
                <div key={key} className="flex items-center gap-1">
                  <div
                    className={cn("w-2 h-2 rounded-full", WEIGHT_COLORS[key])}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {WEIGHT_LABELS[key]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Thresholds */}
        <div className="space-y-3 pt-3 border-t">
          <Label className="text-xs font-medium">Thresholds</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Signal Threshold
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={thresholds.signalThreshold}
                onChange={(e) =>
                  handleThresholdChange("signalThreshold", e.target.value)
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Min Confidence
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={thresholds.minConfidence}
                onChange={(e) =>
                  handleThresholdChange("minConfidence", e.target.value)
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Regime Filter Toggle */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="space-y-0.5">
            <Label className="text-xs font-medium">Regime Filter</Label>
            <p className="text-xs text-muted-foreground">
              Filter signals based on market volatility
            </p>
          </div>
          <Switch checked={regimeFilter} onCheckedChange={onRegimeFilterChange} />
        </div>

        {/* Optimization Note */}
        {optimizeWeights && (
          <div className="p-2 rounded-md bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-500">
              Auto-optimization enabled. Weights are automatically adjusted based on
              recent performance.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
