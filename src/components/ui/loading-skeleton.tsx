"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface LoadingSkeletonProps {
  className?: string;
  variant?: "text" | "title" | "circle" | "card" | "rect";
  width?: string | number;
  height?: string | number;
  lines?: number;
  animate?: "pulse" | "shimmer" | "none";
}

/**
 * Reusable loading skeleton component with multiple variants
 * Supports accessibility with reduced motion preferences
 */
export function LoadingSkeleton({
  className,
  variant = "rect",
  width,
  height,
  lines = 1,
  animate = "shimmer",
}: LoadingSkeletonProps) {
  const baseClasses = cn(
    "bg-muted",
    animate === "shimmer" && "skeleton",
    animate === "pulse" && "animate-pulse"
  );

  const variantClasses: Record<string, string> = {
    text: "h-4 rounded",
    title: "h-6 rounded",
    circle: "rounded-full",
    card: "rounded-lg",
    rect: "rounded-md",
  };

  const style: React.CSSProperties = {
    width: width
      ? typeof width === "number"
        ? `${width}px`
        : width
      : undefined,
    height: height
      ? typeof height === "number"
        ? `${height}px`
        : height
      : undefined,
  };

  if (variant === "text" && lines > 1) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn(
              baseClasses,
              variantClasses[variant],
              i === lines - 1 && "w-3/4",
              className
            )}
            style={style}
          />
        ))}
      </div>
    );
  }

  return (
    <Skeleton
      className={cn(baseClasses, variantClasses[variant], className)}
      style={style}
      aria-busy="true"
      aria-live="polite"
    />
  );
}

// Pre-built skeleton layouts for common use cases

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-card p-4 space-y-4", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <LoadingSkeleton variant="title" width={120} />
        <LoadingSkeleton variant="circle" width={24} height={24} />
      </div>
      <LoadingSkeleton variant="title" width={180} height={32} />
      <div className="space-y-2">
        <LoadingSkeleton variant="text" lines={2} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <LoadingSkeleton variant="rect" height={60} />
        <LoadingSkeleton variant="rect" height={60} />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b border-border" aria-busy="true" aria-live="polite">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-4">
          <LoadingSkeleton variant="text" width={i === 0 ? 100 : 80} />
        </td>
      ))}
    </tr>
  );
}

export function BalanceWidgetSkeleton() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4 space-y-4"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading balance widget"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LoadingSkeleton variant="circle" width={20} height={20} />
          <LoadingSkeleton variant="text" width={80} />
        </div>
        <LoadingSkeleton variant="rect" width={70} height={20} />
      </div>

      {/* Main Balance */}
      <div className="space-y-2">
        <LoadingSkeleton variant="text" width={100} />
        <div className="flex items-baseline gap-2">
          <LoadingSkeleton variant="title" width={150} height={36} />
          <LoadingSkeleton variant="text" width={40} />
        </div>
      </div>

      {/* PnL Grid */}
      <div className="grid grid-cols-2 gap-4">
        <LoadingSkeleton variant="rect" height={80} />
        <LoadingSkeleton variant="rect" height={80} />
      </div>

      {/* Assets */}
      <div className="space-y-3">
        <LoadingSkeleton variant="text" width={60} />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LoadingSkeleton variant="circle" width={32} height={32} />
                <div className="space-y-1">
                  <LoadingSkeleton variant="text" width={40} />
                  <LoadingSkeleton variant="text" width={60} />
                </div>
              </div>
              <div className="text-right space-y-1">
                <LoadingSkeleton variant="text" width={70} />
                <LoadingSkeleton variant="text" width={40} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
        <div>
          <LoadingSkeleton variant="text" width={80} />
          <LoadingSkeleton variant="title" width={40} className="mt-1" />
        </div>
        <div>
          <LoadingSkeleton variant="text" width={80} />
          <div className="flex items-center gap-2 mt-1">
            <LoadingSkeleton variant="text" width={40} />
            <LoadingSkeleton variant="rect" height={8} className="flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TradingFormSkeleton() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4 space-y-4"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading trading form"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <LoadingSkeleton variant="circle" width={20} height={20} />
        <LoadingSkeleton variant="text" width={100} />
      </div>

      {/* Exchange Select */}
      <div className="space-y-2">
        <LoadingSkeleton variant="text" width={50} />
        <LoadingSkeleton variant="rect" height={40} />
      </div>

      {/* Pair Select */}
      <div className="space-y-2">
        <LoadingSkeleton variant="text" width={80} />
        <LoadingSkeleton variant="rect" height={40} />
      </div>

      {/* Direction Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <LoadingSkeleton variant="rect" height={48} />
        <LoadingSkeleton variant="rect" height={48} />
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <LoadingSkeleton variant="text" width={80} />
          <LoadingSkeleton variant="text" width={100} />
        </div>
        <LoadingSkeleton variant="rect" height={40} />
        <div className="grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map((i) => (
            <LoadingSkeleton key={i} variant="rect" height={28} />
          ))}
        </div>
      </div>

      {/* Leverage */}
      <div className="space-y-2">
        <LoadingSkeleton variant="text" width={50} />
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: 8 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="rect" width={48} height={32} />
          ))}
        </div>
      </div>

      {/* SL/TP */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <LoadingSkeleton variant="text" width={60} />
          <LoadingSkeleton variant="rect" height={36} />
        </div>
        <div className="space-y-2">
          <LoadingSkeleton variant="text" width={60} />
          <LoadingSkeleton variant="rect" height={36} />
        </div>
      </div>

      {/* Position Summary */}
      <LoadingSkeleton variant="rect" height={100} />

      {/* Submit Button */}
      <LoadingSkeleton variant="rect" height={48} />
    </div>
  );
}

export function PositionsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading positions"
    >
      <div className="p-4 border-b border-border">
        <LoadingSkeleton variant="title" width={120} />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-4">
            <LoadingSkeleton variant="circle" width={32} height={32} />
            <div className="flex-1 space-y-2">
              <LoadingSkeleton variant="text" width={100} />
              <LoadingSkeleton variant="text" width={150} />
            </div>
            <div className="text-right space-y-2">
              <LoadingSkeleton variant="text" width={80} />
              <LoadingSkeleton variant="text" width={60} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketOverviewSkeleton() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4 space-y-4"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading market data"
    >
      <LoadingSkeleton variant="title" width={140} />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LoadingSkeleton variant="circle" width={24} height={24} />
              <LoadingSkeleton variant="text" width={60} />
            </div>
            <div className="flex items-center gap-4">
              <LoadingSkeleton variant="text" width={80} />
              <LoadingSkeleton variant="rect" width={60} height={24} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
