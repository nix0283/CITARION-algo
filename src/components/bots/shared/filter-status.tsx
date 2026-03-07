/**
 * FilterStatus Component
 *
 * A shared component for displaying signal filter status in bot manager UIs.
 * Shows filter toggle, signal direction, confidence bar, regime badge, and disagreement warning.
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Brain,
  Gauge,
  LineChart,
  RefreshCw,
  Zap,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterResult } from "@/lib/bot-filters";

// ==================== TYPES ====================

export interface FilterStatusProps {
  /** Whether filter is enabled */
  enabled: boolean;
  /** Toggle filter enabled */
  onToggle: (enabled: boolean) => void;
  /** Current filter result */
  result?: FilterResult | null;
  /** Loading state */
  loading?: boolean;
  /** Current signal direction */
  signalDirection?: "LONG" | "SHORT" | "NEUTRAL";
  /** Signal confidence (0-1) */
  signalConfidence?: number;
  /** Market regime */
  regime?: "TRENDING" | "RANGING" | "NEUTRAL";
  /** Ensemble scores for multi-component filters */
  ensembleScores?: {
    lawrence?: number;
    ml?: number;
    forecast?: number;
    overall?: number;
  };
  /** Show disagreement warning */
  showDisagreement?: boolean;
  /** Disagreement details */
  disagreementDetails?: string;
  /** Custom test button handler */
  onTest?: () => void;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Bot type for context */
  botType?: "BB" | "DCA" | "VISION" | "ORION";
  /** Additional config options to display */
  configOptions?: {
    label: string;
    value: number | string;
    onChange?: (value: number | string) => void;
  }[];
}

// ==================== COMPONENT ====================

export function FilterStatus({
  enabled,
  onToggle,
  result,
  loading = false,
  signalDirection,
  signalConfidence,
  regime,
  ensembleScores,
  showDisagreement = false,
  disagreementDetails,
  onTest,
  compact = false,
  botType = "BB",
  configOptions,
}: FilterStatusProps) {
  // Get direction icon and color
  const getDirectionDisplay = (direction?: string) => {
    switch (direction) {
      case "LONG":
        return {
          icon: TrendingUp,
          color: "text-green-500",
          bg: "bg-green-500/10",
        };
      case "SHORT":
        return {
          icon: TrendingDown,
          color: "text-red-500",
          bg: "bg-red-500/10",
        };
      default:
        return {
          icon: Minus,
          color: "text-yellow-500",
          bg: "bg-yellow-500/10",
        };
    }
  };

  // Get confidence color
  const getConfidenceColor = (confidence?: number) => {
    if (confidence === undefined) return "text-muted-foreground";
    if (confidence >= 0.7) return "text-green-500";
    if (confidence >= 0.5) return "text-yellow-500";
    return "text-red-500";
  };

  // Get regime badge style
  const getRegimeBadge = (regime?: string) => {
    switch (regime) {
      case "TRENDING":
        return (
          <Badge className="bg-green-500/10 text-green-500">
            <TrendingUp className="h-3 w-3 mr-1" />
            Trending
          </Badge>
        );
      case "RANGING":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500">
            <Minus className="h-3 w-3 mr-1" />
            Ranging
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Activity className="h-3 w-3 mr-1" />
            Neutral
          </Badge>
        );
    }
  };

  const directionDisplay = getDirectionDisplay(signalDirection);

  // Compact mode - inline display
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
        
        {enabled && signalDirection && (
          <>
            <Badge className={cn(directionDisplay.bg, directionDisplay.color)}>
              {signalDirection}
            </Badge>
            {signalConfidence !== undefined && (
              <span className={cn("text-sm font-medium", getConfidenceColor(signalConfidence))}>
                {(signalConfidence * 100).toFixed(0)}%
              </span>
            )}
          </>
        )}
        
        {showDisagreement && (
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        )}
      </div>
    );
  }

  // Full mode - card display
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Signal Filter
            {botType && (
              <Badge variant="outline" className="text-xs">
                {botType}
              </Badge>
            )}
          </CardTitle>
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </CardHeader>
      
      {enabled && (
        <CardContent className="space-y-4">
          {/* Recommended Action Banner */}
          {result && (
            <div
              className={cn(
                "p-4 rounded-lg border-2 flex items-center justify-between",
                result.approved
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-red-500/50 bg-red-500/5"
              )}
            >
              <div className="flex items-center gap-3">
                {result.approved ? (
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-500" />
                )}
                <div>
                  <div
                    className={cn(
                      "text-xl font-bold",
                      result.approved ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {result.approved ? "APPROVED" : "REJECTED"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {result.approved
                      ? "Signal passes filter criteria"
                      : "Signal does not meet requirements"}
                  </div>
                </div>
              </div>
              {signalDirection && (
                <Badge
                  className={cn(
                    "text-lg px-4 py-1",
                    directionDisplay.bg,
                    directionDisplay.color
                  )}
                >
                  {signalDirection}
                </Badge>
              )}
            </div>
          )}

          {/* Signal Direction & Confidence */}
          {signalDirection && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Direction</span>
                  <directionDisplay.icon
                    className={cn("h-5 w-5", directionDisplay.color)}
                  />
                </div>
                <Badge
                  className={cn("text-lg", directionDisplay.bg, directionDisplay.color)}
                >
                  {signalDirection}
                </Badge>
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Confidence</span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      getConfidenceColor(signalConfidence)
                    )}
                  >
                    {signalConfidence !== undefined
                      ? `${(signalConfidence * 100).toFixed(1)}%`
                      : "--"}
                  </span>
                </div>
                <Progress
                  value={(signalConfidence || 0) * 100}
                  className="h-2"
                />
              </div>
            </div>
          )}

          {/* Ensemble Scores (for VISION/ORION) */}
          {ensembleScores && (
            <div className="grid grid-cols-3 gap-4">
              {/* Lawrence Score */}
              {ensembleScores.lawrence !== undefined && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      <span className="text-sm text-muted-foreground">Lawrence</span>
                    </div>
                    <div
                      className={cn(
                        "text-2xl font-bold",
                        getConfidenceColor(ensembleScores.lawrence)
                      )}
                    >
                      {(ensembleScores.lawrence * 100).toFixed(0)}%
                    </div>
                    <Progress
                      value={ensembleScores.lawrence * 100}
                      className="h-1.5 mt-2"
                    />
                  </CardContent>
                </Card>
              )}

              {/* ML Score */}
              {ensembleScores.ml !== undefined && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Gauge className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-muted-foreground">ML Model</span>
                    </div>
                    <div
                      className={cn(
                        "text-2xl font-bold",
                        getConfidenceColor(ensembleScores.ml)
                      )}
                    >
                      {(ensembleScores.ml * 100).toFixed(0)}%
                    </div>
                    <Progress
                      value={ensembleScores.ml * 100}
                      className="h-1.5 mt-2"
                    />
                  </CardContent>
                </Card>
              )}

              {/* Forecast Score */}
              {ensembleScores.forecast !== undefined && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <LineChart className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-muted-foreground">Forecast</span>
                    </div>
                    <div
                      className={cn(
                        "text-2xl font-bold",
                        getConfidenceColor(ensembleScores.forecast)
                      )}
                    >
                      {(ensembleScores.forecast * 100).toFixed(0)}%
                    </div>
                    <Progress
                      value={ensembleScores.forecast * 100}
                      className="h-1.5 mt-2"
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Overall Ensemble Score */}
          {ensembleScores?.overall !== undefined && (
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Ensemble Score</span>
                <span
                  className={cn(
                    "text-lg font-bold",
                    getConfidenceColor(ensembleScores.overall)
                  )}
                >
                  {(ensembleScores.overall * 100).toFixed(1)}%
                </span>
              </div>
              <Progress
                value={ensembleScores.overall * 100}
                className="h-3"
              />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>Avoid</span>
                <span>Wait</span>
                <span>Enter</span>
              </div>
            </div>
          )}

          {/* Regime Badge */}
          {regime && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">Market Regime</span>
              {getRegimeBadge(regime)}
            </div>
          )}

          {/* Disagreement Warning */}
          {showDisagreement && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
              <div>
                <div className="text-sm font-medium text-yellow-500">
                  Signal Disagreement Detected
                </div>
                {disagreementDetails && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {disagreementDetails}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Filter Reasons */}
          {result?.reasons && result.reasons.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Analysis:</span>
              <ScrollArea className="h-24">
                <ul className="text-sm space-y-1">
                  {result.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {/* Test Button */}
          {onTest && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Filter className="h-4 w-4" />
              )}
              Test Filter
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ==================== SPECIALIZED COMPONENTS ====================

/**
 * Compact filter toggle for inline use
 */
export function FilterToggle({
  enabled,
  onToggle,
  hasFilter = false,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  hasFilter?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Filter className={cn("h-4 w-4", hasFilter ? "text-primary" : "text-muted-foreground")} />
      <Switch checked={enabled} onCheckedChange={onToggle} />
      {hasFilter && (
        <Badge variant="outline" className="text-xs text-primary border-primary/20">
          <Shield className="h-3 w-3 mr-1" />
          Filter
        </Badge>
      )}
    </div>
  );
}

/**
 * Quick signal indicator with direction and confidence
 */
export function SignalIndicator({
  direction,
  confidence,
  size = "default",
}: {
  direction: "LONG" | "SHORT" | "NEUTRAL";
  confidence?: number;
  size?: "sm" | "default" | "lg";
}) {
  const display = direction === "LONG"
    ? { icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10" }
    : direction === "SHORT"
    ? { icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10" }
    : { icon: Minus, color: "text-yellow-500", bg: "bg-yellow-500/10" };

  const Icon = display.icon;
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    default: "text-sm px-3 py-1",
    lg: "text-lg px-4 py-2",
  };

  return (
    <div className="flex items-center gap-2">
      <Badge className={cn(display.bg, display.color, sizeClasses[size])}>
        <Icon className={cn(size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4", "mr-1")} />
        {direction}
      </Badge>
      {confidence !== undefined && (
        <span className={cn(
          "font-medium",
          confidence >= 0.7 ? "text-green-500" : confidence >= 0.5 ? "text-yellow-500" : "text-red-500"
        )}>
          {(confidence * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

/**
 * Confidence bar component
 */
export function ConfidenceBar({
  confidence,
  label = "Confidence",
  showValue = true,
}: {
  confidence: number;
  label?: string;
  showValue?: boolean;
}) {
  const color = confidence >= 0.7 ? "green" : confidence >= 0.5 ? "yellow" : "red";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        {showValue && (
          <span
            className={cn(
              "font-medium",
              color === "green"
                ? "text-green-500"
                : color === "yellow"
                ? "text-yellow-500"
                : "text-red-500"
            )}
          >
            {(confidence * 100).toFixed(1)}%
          </span>
        )}
      </div>
      <Progress value={confidence * 100} className="h-2" />
    </div>
  );
}

export default FilterStatus;
