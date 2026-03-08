"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

// Configuration Section with optional collapse
interface ConfigSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  indicator?: "blue" | "green" | "orange" | "purple";
}

export function ConfigSection({
  title,
  children,
  className,
  collapsible = false,
  defaultCollapsed = false,
  indicator,
}: ConfigSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const indicatorClasses = {
    blue: "panel-indicator-blue",
    green: "panel-indicator-green",
    orange: "panel-indicator-orange",
    purple: "panel-indicator-purple",
  };

  return (
    <div className={cn("config-section", className)}>
      <div
        className={cn(
          "flex items-center gap-2 mb-3",
          collapsible && "cursor-pointer select-none"
        )}
        onClick={() => collapsible && setCollapsed(!collapsed)}
      >
        {indicator && (
          <div className={indicatorClasses[indicator]} />
        )}
        <h4 className="config-section-title flex-1">{title}</h4>
        {collapsible && (
          <span className="text-muted-foreground">
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </span>
        )}
      </div>
      {(!collapsible || !collapsed) && <div className="space-y-3">{children}</div>}
    </div>
  );
}

// Configuration Row for key-value display
interface ConfigRowProps {
  label: string;
  value: string | number | React.ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

export function ConfigRow({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
}: ConfigRowProps) {
  return (
    <div className={cn("config-row", className)}>
      <span className={cn("config-label", labelClassName)}>{label}</span>
      <span className={cn("config-value", valueClassName)}>{value}</span>
    </div>
  );
}

// Configuration Grid for multiple values
interface ConfigGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function ConfigGrid({ children, columns = 2, className }: ConfigGridProps) {
  const gridClasses = {
    2: "config-grid-2",
    3: "config-grid-3",
    4: "config-grid-4",
  };

  return (
    <div className={cn(gridClasses[columns], className)}>
      {children}
    </div>
  );
}

// Configuration Item for grid display
interface ConfigItemProps {
  label: string;
  value: string | number;
  className?: string;
  size?: "sm" | "md";
}

export function ConfigItem({
  label,
  value,
  className,
  size = "md",
}: ConfigItemProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <div
        className={cn(
          "text-muted-foreground",
          size === "sm" ? "text-[10px]" : "text-xs"
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "font-medium",
          size === "sm" ? "text-xs" : "text-sm"
        )}
      >
        {value}
      </div>
    </div>
  );
}

// Time Range Selector
interface TimeRangeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  className?: string;
}

export function TimeRangeSelector({
  value,
  onChange,
  options = ["1D", "1W", "1M", "3M", "1Y", "All"],
  className,
}: TimeRangeSelectorProps) {
  return (
    <div className={cn("time-range-selector", className)}>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            "time-range-button",
            value === option
              ? "time-range-button-active"
              : "time-range-button-inactive"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// Filter Tabs
interface FilterTabsProps {
  tabs: string[];
  activeTab: string;
  onChange: (tab: string) => void;
  className?: string;
}

export function FilterTabs({
  tabs,
  activeTab,
  onChange,
  className,
}: FilterTabsProps) {
  return (
    <div className={cn("filter-tabs", className)}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={cn(
            "filter-tab",
            activeTab === tab && "filter-tab-active"
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

// Status Badge
interface StatusBadgeProps {
  status: "active" | "inactive" | "pending" | "error";
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({
  status,
  children,
  className,
}: StatusBadgeProps) {
  const statusClasses = {
    active: "status-badge-active",
    inactive: "status-badge-inactive",
    pending: "status-badge-pending",
    error: "status-badge-error",
  };

  return (
    <span className={cn("status-badge", statusClasses[status], className)}>
      <span
        className={cn(
          "bot-status-dot",
          status === "active" && "bot-status-running",
          status === "inactive" && "bot-status-stopped",
          status === "pending" && "bot-status-paused",
          status === "error" && "bot-status-error"
        )}
      />
      {children}
    </span>
  );
}

// Risk Meter
interface RiskMeterProps {
  value: number; // 0-100
  className?: string;
}

export function RiskMeter({ value, className }: RiskMeterProps) {
  const getRiskLevel = () => {
    if (value < 25) return "risk-low";
    if (value < 50) return "risk-medium";
    if (value < 75) return "risk-high";
    return "risk-critical";
  };

  return (
    <div className={cn("risk-meter", className)}>
      <div
        className={cn("risk-meter-fill", getRiskLevel())}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// Divider with Text
interface DividerTextProps {
  children: React.ReactNode;
  className?: string;
}

export function DividerText({ children, className }: DividerTextProps) {
  return (
    <div className={cn("divider-text", className)}>{children}</div>
  );
}
