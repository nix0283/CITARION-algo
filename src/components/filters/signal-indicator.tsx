"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  MinusCircle,
  AlertTriangle,
  Zap,
  Gauge,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SignalState {
  direction: "LONG" | "SHORT" | "NONE";
  confidence: number;
  strength: number;
  disagreement: boolean;
  regime: "LOW" | "MEDIUM" | "HIGH";
}

export interface SignalIndicatorProps {
  signal: SignalState;
  showDetails?: boolean;
  className?: string;
}

export function SignalIndicator({
  signal,
  showDetails = true,
  className,
}: SignalIndicatorProps) {
  // Get signal colors based on direction
  const signalColors = useMemo(() => {
    switch (signal.direction) {
      case "LONG":
        return {
          bg: "bg-green-500/10",
          border: "border-green-500/30",
          text: "text-green-500",
          icon: TrendingUp,
        };
      case "SHORT":
        return {
          bg: "bg-red-500/10",
          border: "border-red-500/30",
          text: "text-red-500",
          icon: TrendingDown,
        };
      case "NONE":
      default:
        return {
          bg: "bg-gray-500/10",
          border: "border-gray-500/30",
          text: "text-gray-500",
          icon: MinusCircle,
        };
    }
  }, [signal.direction]);

  // Get confidence color
  const confidenceColor = useMemo(() => {
    if (signal.confidence >= 70) return "text-green-500";
    if (signal.confidence >= 50) return "text-yellow-500";
    return "text-red-500";
  }, [signal.confidence]);

  // Get confidence progress color
  const confidenceProgressColor = useMemo(() => {
    if (signal.confidence >= 70) return "[&>div]:bg-green-500";
    if (signal.confidence >= 50) return "[&>div]:bg-yellow-500";
    return "[&>div]:bg-red-500";
  }, [signal.confidence]);

  // Get strength color
  const strengthColor = useMemo(() => {
    if (signal.strength >= 80) return "bg-emerald-500";
    if (signal.strength >= 60) return "bg-blue-500";
    if (signal.strength >= 40) return "bg-yellow-500";
    return "bg-orange-500";
  }, [signal.strength]);

  // Get regime colors and badge
  const regimeConfig = useMemo(() => {
    switch (signal.regime) {
      case "HIGH":
        return {
          color: "bg-red-500/10 text-red-500 border-red-500/20",
          label: "HIGH",
        };
      case "MEDIUM":
        return {
          color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
          label: "MEDIUM",
        };
      case "LOW":
      default:
        return {
          color: "bg-green-500/10 text-green-500 border-green-500/20",
          label: "LOW",
        };
    }
  }, [signal.regime]);

  const SignalIcon = signalColors.icon;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4">
        {/* Main Signal Display */}
        <div className="flex items-center gap-4">
          {/* Signal Icon */}
          <div
            className={cn(
              "relative w-16 h-16 rounded-xl flex items-center justify-center",
              signalColors.bg,
              signalColors.border,
              "border-2"
            )}
          >
            <SignalIcon className={cn("h-8 w-8", signalColors.text)} />
            {/* Pulse animation for active signals */}
            {signal.direction !== "NONE" && (
              <div
                className={cn(
                  "absolute inset-0 rounded-xl animate-ping opacity-20",
                  signalColors.bg
                )}
              />
            )}
          </div>

          {/* Signal Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={cn(
                  "text-xl font-bold",
                  signalColors.text
                )}
              >
                {signal.direction}
              </span>
              {signal.disagreement && (
                <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Disagreement
                </Badge>
              )}
            </div>

            {/* Regime Badge */}
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn("text-xs", regimeConfig.color)}
              >
                <Activity className="h-3 w-3 mr-1" />
                {regimeConfig.label} VOL
              </Badge>
            </div>
          </div>

          {/* Confidence Meter */}
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-1">Confidence</div>
            <div className={cn("text-2xl font-bold", confidenceColor)}>
              {signal.confidence}%
            </div>
          </div>
        </div>

        {showDetails && (
          <>
            {/* Confidence Progress Bar */}
            <div className="mt-4 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3 w-3" />
                  Confidence Level
                </span>
                <span className={confidenceColor}>
                  {signal.confidence >= 70
                    ? "High"
                    : signal.confidence >= 50
                      ? "Medium"
                      : "Low"}
                </span>
              </div>
              <Progress
                value={signal.confidence}
                className={cn("h-2", confidenceProgressColor)}
              />
            </div>

            {/* Signal Strength Bar */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Signal Strength
                </span>
                <span className="font-medium">{signal.strength}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    strengthColor
                  )}
                  style={{ width: `${signal.strength}%` }}
                />
              </div>
            </div>

            {/* Mini Stats Row */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-secondary/50">
                <div className="text-[10px] text-muted-foreground">Direction</div>
                <div className={cn("text-xs font-semibold", signalColors.text)}>
                  {signal.direction}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-secondary/50">
                <div className="text-[10px] text-muted-foreground">Strength</div>
                <div className="text-xs font-semibold">{signal.strength}%</div>
              </div>
              <div className="p-2 rounded-lg bg-secondary/50">
                <div className="text-[10px] text-muted-foreground">Regime</div>
                <div className="text-xs font-semibold">{signal.regime}</div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
