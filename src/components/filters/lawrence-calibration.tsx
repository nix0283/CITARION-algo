"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface LawrenceCalibrationProps {
  filterType: "ENHANCED" | "BB" | "DCA" | "VISION";
  className?: string;
}

export interface CalibrationState {
  isTraining: boolean;
  progress: number;
  samples: number;
  accuracy: {
    precision: number;
    recall: number;
    f1: number;
  };
  lastTraining: string | null;
  status: "idle" | "training" | "completed" | "error";
}

// Demo data for different filter types
const DEMO_CALIBRATION_DATA: Record<string, Partial<CalibrationState>> = {
  ENHANCED: {
    samples: 15420,
    accuracy: { precision: 0.72, recall: 0.68, f1: 0.70 },
    lastTraining: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  BB: {
    samples: 12350,
    accuracy: { precision: 0.75, recall: 0.71, f1: 0.73 },
    lastTraining: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  DCA: {
    samples: 8750,
    accuracy: { precision: 0.78, recall: 0.74, f1: 0.76 },
    lastTraining: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  VISION: {
    samples: 5200,
    accuracy: { precision: 0.69, recall: 0.65, f1: 0.67 },
    lastTraining: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
};

export function LawrenceCalibration({
  filterType,
  className,
}: LawrenceCalibrationProps) {
  const demoData = DEMO_CALIBRATION_DATA[filterType] || DEMO_CALIBRATION_DATA.ENHANCED;

  const [state, setState] = useState<CalibrationState>({
    isTraining: false,
    progress: 0,
    samples: demoData.samples || 0,
    accuracy: demoData.accuracy || { precision: 0, recall: 0, f1: 0 },
    lastTraining: demoData.lastTraining || null,
    status: "idle",
  });

  const handleRetrain = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isTraining: true,
      status: "training",
      progress: 0,
    }));

    // Simulate training progress
    const interval = setInterval(() => {
      setState((prev) => {
        const newProgress = prev.progress + Math.random() * 15;
        if (newProgress >= 100) {
          clearInterval(interval);
          return {
            ...prev,
            isTraining: false,
            progress: 100,
            status: "completed",
            lastTraining: new Date().toISOString(),
            samples: prev.samples + Math.floor(Math.random() * 100),
            accuracy: {
              precision: Math.min(0.95, prev.accuracy.precision + Math.random() * 0.05),
              recall: Math.min(0.95, prev.accuracy.recall + Math.random() * 0.05),
              f1: Math.min(0.95, prev.accuracy.f1 + Math.random() * 0.05),
            },
          };
        }
        return { ...prev, progress: newProgress };
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Get accuracy color
  const getAccuracyColor = (value: number) => {
    if (value >= 0.75) return "text-green-500";
    if (value >= 0.65) return "text-yellow-500";
    return "text-red-500";
  };

  // Get accuracy trend
  const getAccuracyTrend = (value: number) => {
    if (value >= 0.75) return { icon: TrendingUp, color: "text-green-500" };
    if (value >= 0.65) return { icon: Minus, color: "text-yellow-500" };
    return { icon: TrendingDown, color: "text-red-500" };
  };

  const TrendIcon = getAccuracyTrend(state.accuracy.f1).icon;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="py-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Brain className="h-4 w-4 text-purple-500" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">
                Lawrence Classifier
              </CardTitle>
              <CardDescription className="text-xs">
                Model calibration & stats
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              state.status === "training"
                ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                : state.status === "completed"
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : state.status === "error"
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : "bg-gray-500/10 text-gray-500 border-gray-500/20"
            )}
          >
            {state.status === "training" ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Training
              </>
            ) : state.status === "completed" ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Ready
              </>
            ) : state.status === "error" ? (
              <>
                <AlertCircle className="h-3 w-3 mr-1" />
                Error
              </>
            ) : (
              "Idle"
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4">
        {/* Training Progress */}
        {state.isTraining && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Training Progress</span>
              <span className="font-mono">{Math.round(state.progress)}%</span>
            </div>
            <Progress value={state.progress} className="h-2" />
          </div>
        )}

        {/* Sample Count */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Training Samples</span>
          </div>
          <span className="text-sm font-semibold font-mono">
            {state.samples.toLocaleString()}
          </span>
        </div>

        {/* Accuracy Metrics */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Accuracy Metrics</span>
            <TrendIcon
              className={cn(
                "h-4 w-4",
                getAccuracyTrend(state.accuracy.f1).color
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Precision */}
            <div className="p-3 rounded-lg bg-secondary/30 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">Precision</div>
              <div
                className={cn(
                  "text-lg font-bold",
                  getAccuracyColor(state.accuracy.precision)
                )}
              >
                {(state.accuracy.precision * 100).toFixed(0)}%
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden mt-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    state.accuracy.precision >= 0.75
                      ? "bg-green-500"
                      : state.accuracy.precision >= 0.65
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  )}
                  style={{ width: `${state.accuracy.precision * 100}%` }}
                />
              </div>
            </div>

            {/* Recall */}
            <div className="p-3 rounded-lg bg-secondary/30 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">Recall</div>
              <div
                className={cn(
                  "text-lg font-bold",
                  getAccuracyColor(state.accuracy.recall)
                )}
              >
                {(state.accuracy.recall * 100).toFixed(0)}%
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden mt-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    state.accuracy.recall >= 0.75
                      ? "bg-green-500"
                      : state.accuracy.recall >= 0.65
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  )}
                  style={{ width: `${state.accuracy.recall * 100}%` }}
                />
              </div>
            </div>

            {/* F1 Score */}
            <div className="p-3 rounded-lg bg-secondary/30 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">F1 Score</div>
              <div
                className={cn(
                  "text-lg font-bold",
                  getAccuracyColor(state.accuracy.f1)
                )}
              >
                {(state.accuracy.f1 * 100).toFixed(0)}%
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden mt-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    state.accuracy.f1 >= 0.75
                      ? "bg-green-500"
                      : state.accuracy.f1 >= 0.65
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  )}
                  style={{ width: `${state.accuracy.f1 * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Last Training Timestamp */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            <span>Last Training</span>
          </div>
          <span>{formatTimeAgo(state.lastTraining)}</span>
        </div>

        {/* Retrain Button */}
        <Button
          onClick={handleRetrain}
          disabled={state.isTraining}
          className="w-full"
          variant={state.isTraining ? "secondary" : "default"}
        >
          {state.isTraining ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Training...
            </>
          ) : (
            <>
              <Target className="h-4 w-4 mr-2" />
              Retrain Model
            </>
          )}
        </Button>

        {/* Model Status Info */}
        <div className="text-[10px] text-muted-foreground text-center">
          Filter type: <span className="font-medium">{filterType}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper component for neutral trend
function Minus({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-4 w-4", className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}
