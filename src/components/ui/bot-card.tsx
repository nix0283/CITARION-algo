"use client";

import { cn } from "@/lib/utils";
import { 
  MoreVertical, 
  Play, 
  Pause, 
  Square, 
  Settings, 
  Trash2,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge, RiskMeter, MetricDisplay } from "./config-section";
import { MiniChart } from "./mini-chart";

// Bot Card Types
export type BotStatus = "running" | "paused" | "stopped" | "error";

export interface BotConfig {
  symbol: string;
  exchange: string;
  leverage?: number;
  positionSize?: string;
  [key: string]: any;
}

export interface BotStatistics {
  roi: number;
  profit: number;
  trades: number;
  winRate: number;
  maxDrawdown?: number;
  sharpeRatio?: number;
}

export interface BotCardProps {
  id: string;
  name: string;
  type: string;
  status: BotStatus;
  config: BotConfig;
  statistics: BotStatistics;
  performanceData?: number[];
  createdAt?: Date;
  className?: string;
  onStart?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewDetails?: () => void;
}

export function BotCard({
  name,
  type,
  status,
  config,
  statistics,
  performanceData,
  className,
  onStart,
  onPause,
  onStop,
  onEdit,
  onDelete,
  onViewDetails,
}: BotCardProps) {
  const isRunning = status === "running";
  const isPaused = status === "paused";

  return (
    <div className={cn("bot-card", className)}>
      {/* Header */}
      <div className="bot-card-header">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">{name}</h3>
              <Badge variant="outline" className="text-xs font-mono">
                {type}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{config.symbol}</span>
              <span>•</span>
              <span>{config.exchange}</span>
              {config.leverage && (
                <>
                  <span>•</span>
                  <span>{config.leverage}x</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={
              status === "running"
                ? "active"
                : status === "paused"
                ? "pending"
                : status === "error"
                ? "error"
                : "inactive"
            }
          >
            {status === "running"
              ? "Running"
              : status === "paused"
              ? "Paused"
              : status === "error"
              ? "Error"
              : "Stopped"}
          </StatusBadge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isRunning ? (
                <DropdownMenuItem onClick={onPause}>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onStart}>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </DropdownMenuItem>
              )}
              {(isRunning || isPaused) && (
                <DropdownMenuItem onClick={onStop}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onEdit}>
                <Settings className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-500 focus:text-red-500"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="bot-card-body">
        {/* Performance Chart */}
        {performanceData && performanceData.length > 0 && (
          <div className="mb-4">
            <MiniChart data={performanceData} height={60} />
          </div>
        )}

        {/* Statistics Grid */}
        <div className="metrics-grid-4">
          <MetricDisplay
            label="ROI"
            value={`${statistics.roi >= 0 ? "+" : ""}${statistics.roi.toFixed(2)}%`}
            color={statistics.roi >= 0 ? "success" : "error"}
          />
          <MetricDisplay
            label="Profit"
            value={`${statistics.profit >= 0 ? "+" : ""}$${Math.abs(statistics.profit).toFixed(2)}`}
            color={statistics.profit >= 0 ? "success" : "error"}
          />
          <MetricDisplay
            label="Trades"
            value={statistics.trades}
          />
          <MetricDisplay
            label="Win Rate"
            value={`${statistics.winRate.toFixed(1)}%`}
          />
        </div>

        {/* Additional Stats Row */}
        {(statistics.maxDrawdown !== undefined || statistics.sharpeRatio !== undefined) && (
          <div className="metrics-grid-2 mt-4 pt-4 border-t border-border">
            {statistics.maxDrawdown !== undefined && (
              <MetricDisplay
                label="Max Drawdown"
                value={`${statistics.maxDrawdown.toFixed(1)}%`}
                color="error"
              />
            )}
            {statistics.sharpeRatio !== undefined && (
              <MetricDisplay
                label="Sharpe Ratio"
                value={statistics.sharpeRatio.toFixed(2)}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bot-card-footer">
        <Button
          variant="outline"
          size="sm"
          onClick={onViewDetails}
          className="gap-2"
        >
          <BarChart3 className="h-4 w-4" />
          Details
        </Button>
        {isRunning ? (
          <Button variant="secondary" size="sm" onClick={onPause} className="gap-2">
            <Pause className="h-4 w-4" />
            Pause
          </Button>
        ) : (
          <Button size="sm" onClick={onStart} className="gap-2">
            <Play className="h-4 w-4" />
            Start
          </Button>
        )}
      </div>
    </div>
  );
}

// Compact Bot Card for grids
export interface CompactBotCardProps {
  name: string;
  type: string;
  status: BotStatus;
  roi: number;
  profit: number;
  className?: string;
  onClick?: () => void;
}

export function CompactBotCard({
  name,
  type,
  status,
  roi,
  profit,
  className,
  onClick,
}: CompactBotCardProps) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg border border-border bg-card hover:shadow-md transition-all cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "bot-status-dot",
              status === "running" && "bot-status-running",
              status === "paused" && "bot-status-paused",
              status === "stopped" && "bot-status-stopped",
              status === "error" && "bot-status-error"
            )}
          />
          <span className="font-medium text-sm">{name}</span>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          {type}
        </Badge>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span
          className={cn(
            "font-semibold",
            roi >= 0 ? "text-green-500" : "text-red-500"
          )}
        >
          {roi >= 0 ? "+" : ""}
          {roi.toFixed(1)}%
        </span>
        <span
          className={cn(
            profit >= 0 ? "text-green-500" : "text-red-500"
          )}
        >
          {profit >= 0 ? "+" : ""}${Math.abs(profit).toFixed(0)}
        </span>
      </div>
    </div>
  );
}

// Bot List Item for tables
export interface BotListItemProps {
  name: string;
  type: string;
  status: BotStatus;
  symbol: string;
  exchange: string;
  roi: number;
  profit: number;
  trades: number;
  className?: string;
  onClick?: () => void;
}

export function BotListItem({
  name,
  type,
  status,
  symbol,
  exchange,
  roi,
  profit,
  trades,
  className,
  onClick,
}: BotListItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-muted/50 cursor-pointer transition-colors",
        className
      )}
      onClick={onClick}
    >
      {/* Status */}
      <span
        className={cn(
          "bot-status-dot",
          status === "running" && "bot-status-running",
          status === "paused" && "bot-status-paused",
          status === "stopped" && "bot-status-stopped",
          status === "error" && "bot-status-error"
        )}
      />

      {/* Name & Type */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{name}</span>
          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
            {type}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {symbol} • {exchange}
        </div>
      </div>

      {/* ROI */}
      <div className="text-right">
        <div
          className={cn(
            "font-semibold",
            roi >= 0 ? "text-green-500" : "text-red-500"
          )}
        >
          {roi >= 0 ? "+" : ""}
          {roi.toFixed(2)}%
        </div>
      </div>

      {/* Profit */}
      <div className="text-right w-20">
        <div
          className={cn(
            "font-medium",
            profit >= 0 ? "text-green-500" : "text-red-500"
          )}
        >
          {profit >= 0 ? "+" : ""}${Math.abs(profit).toFixed(2)}
        </div>
      </div>

      {/* Trades */}
      <div className="text-right w-16 text-muted-foreground">
        {trades}
      </div>
    </div>
  );
}
