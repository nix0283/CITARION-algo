"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: number;
  icon?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  color?: "default" | "success" | "error" | "warning" | "primary";
}

export function StatCard({
  label,
  value,
  subValue,
  trend,
  icon,
  className,
  size = "md",
  color = "default",
}: StatCardProps) {
  const sizeClasses = {
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
  };

  const valueSizeClasses = {
    sm: "text-lg font-semibold",
    md: "text-2xl font-bold",
    lg: "text-3xl font-bold",
  };

  const colorClasses = {
    default: "text-foreground",
    success: "text-green-500",
    error: "text-red-500",
    warning: "text-yellow-500",
    primary: "text-primary",
  };

  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) {
      return <Minus className="h-3 w-3" />;
    }
    return trend > 0 ? (
      <TrendingUp className="h-3 w-3" />
    ) : (
      <TrendingDown className="h-3 w-3" />
    );
  };

  const getTrendColor = () => {
    if (trend === undefined || trend === 0) return "text-muted-foreground";
    return trend > 0 ? "text-green-500" : "text-red-500";
  };

  return (
    <div className={cn("stat-card", sizeClasses[size], className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="stat-label">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn(valueSizeClasses[size], colorClasses[color])}>
          {value}
        </span>
        {subValue && (
          <span className="text-sm text-muted-foreground">{subValue}</span>
        )}
      </div>
      {trend !== undefined && (
        <div className={cn("flex items-center gap-1 mt-1", getTrendColor())}>
          {getTrendIcon()}
          <span className="text-sm">
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        </div>
      )}
    </div>
  );
}

// Compact metric display for use in cards
interface MetricDisplayProps {
  label: string;
  value: string | number;
  className?: string;
  color?: "default" | "success" | "error" | "warning" | "primary";
}

export function MetricDisplay({
  label,
  value,
  className,
  color = "default",
}: MetricDisplayProps) {
  const colorClasses = {
    default: "text-foreground",
    success: "text-green-500",
    error: "text-red-500",
    warning: "text-yellow-500",
    primary: "text-primary",
  };

  return (
    <div className={cn("text-center", className)}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-lg font-semibold", colorClasses[color])}>
        {value}
      </div>
    </div>
  );
}

// Mini metric for inline display
interface MiniMetricProps {
  label: string;
  value: string | number;
}

export function MiniMetric({ label, value }: MiniMetricProps) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}
