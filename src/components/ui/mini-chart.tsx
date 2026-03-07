"use client";

import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface MiniChartProps {
  data: number[];
  height?: number;
  width?: number | string;
  className?: string;
  color?: "primary" | "success" | "error" | "auto";
  showBars?: boolean;
  animated?: boolean;
}

export function MiniChart({
  data,
  height = 40,
  width = "100%",
  className,
  color = "auto",
  showBars = false,
  animated = true,
}: MiniChartProps) {
  const { min, max, range, isPositive } = useMemo(() => {
    if (data.length === 0) {
      return { min: 0, max: 0, range: 1, isPositive: true };
    }
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const rangeVal = maxVal - minVal || 1;
    const isPositiveVal = data[data.length - 1] >= data[0];
    return { min: minVal, max: maxVal, range: rangeVal, isPositive: isPositiveVal };
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-xs", className)}
        style={{ height, width }}
      >
        No data
      </div>
    );
  }

  const getColor = () => {
    if (color !== "auto") {
      const colorMap = {
        primary: "text-primary",
        success: "text-green-500",
        error: "text-red-500",
      };
      return colorMap[color];
    }
    return isPositive ? "text-green-500" : "text-red-500";
  };

  const getStrokeColor = () => {
    if (color !== "auto") {
      const colorMap = {
        primary: "hsl(var(--primary))",
        success: "#22c55e",
        error: "#ef4444",
      };
      return colorMap[color];
    }
    return isPositive ? "#22c55e" : "#ef4444";
  };

  // Calculate points for the line
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return { x, y };
  });

  // Create path for the line
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Create path for the fill area
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  if (showBars) {
    return (
      <div
        className={cn("mini-chart-container", className)}
        style={{ height }}
      >
        {data.map((value, index) => {
          const barHeight = ((value - min) / range) * 100;
          return (
            <div
              key={index}
              className={cn(
                "mini-chart-bar",
                animated && "transition-all duration-200"
              )}
              style={{
                height: `${Math.max(2, barHeight)}%`,
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <svg
      className={cn("mini-chart", className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ height, width }}
    >
      {/* Gradient fill */}
      <defs>
        <linearGradient id={`gradient-${className}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop
            offset="0%"
            stopColor={getStrokeColor()}
            stopOpacity={0.3}
          />
          <stop
            offset="100%"
            stopColor={getStrokeColor()}
            stopOpacity={0}
          />
        </linearGradient>
      </defs>

      {/* Fill area */}
      <path
        d={areaPath}
        fill={`url(#gradient-${className})`}
        className={animated ? "transition-all duration-300" : ""}
      />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={getStrokeColor()}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className={animated ? "transition-all duration-300" : ""}
      />
    </svg>
  );
}

// Sparkline Component - simpler inline chart
interface SparklineProps {
  data: number[];
  className?: string;
  color?: "primary" | "success" | "error" | "auto";
}

export function Sparkline({ data, className, color = "auto" }: SparklineProps) {
  return (
    <MiniChart
      data={data}
      height={20}
      width={60}
      className={className}
      color={color}
    />
  );
}

// Progress Ring Component
interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: "primary" | "success" | "error" | "warning";
  showValue?: boolean;
}

export function ProgressRing({
  value,
  size = 40,
  strokeWidth = 4,
  className,
  color = "primary",
  showValue = false,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  const colorClasses = {
    primary: "stroke-primary",
    success: "stroke-green-500",
    error: "stroke-red-500",
    warning: "stroke-yellow-500",
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <svg
        width={size}
        height={size}
        className="progress-ring"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn("progress-ring-circle", colorClasses[color])}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold">{Math.round(value)}%</span>
        </div>
      )}
    </div>
  );
}

// Bar Chart Component for metrics
interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  className?: string;
  showLabels?: boolean;
  showValues?: boolean;
}

export function BarChart({
  data,
  height = 150,
  className,
  showLabels = true,
  showValues = true,
}: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className={cn("flex items-end gap-2", className)} style={{ height }}>
      {data.map((item, index) => {
        const barHeight = (item.value / maxValue) * 100;
        return (
          <div
            key={index}
            className="flex-1 flex flex-col items-center gap-1"
          >
            {showValues && (
              <span className="text-xs font-medium">{item.value}</span>
            )}
            <div
              className="w-full bg-primary/20 rounded-t transition-all duration-300 hover:bg-primary/30"
              style={{ height: `${barHeight}%` }}
            />
            {showLabels && (
              <span className="text-[10px] text-muted-foreground text-center truncate w-full">
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
