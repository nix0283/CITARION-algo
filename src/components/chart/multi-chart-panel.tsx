"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import GridLayout, { Layout } from "react-grid-layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Minus, 
  Grid3X3, 
  Settings, 
  Maximize2, 
  RotateCcw,
  LayoutTemplate,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
// CSS is imported in globals.css for Turbopack compatibility

export interface ChartLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  symbol: string;
  timeframe: string;
}

export interface MultiChartConfig {
  cols: number;
  rowHeight: number;
  margin: [number, number];
  containerPadding: [number, number];
  verticalCompact: boolean;
  preventCollision: boolean;
}

const DEFAULT_CONFIG: MultiChartConfig = {
  cols: 12,
  rowHeight: 100,
  margin: [8, 8],
  containerPadding: [0, 0],
  verticalCompact: true,
  preventCollision: false,
};

const DEFAULT_CHARTS: ChartLayout[] = [
  { i: "chart-1", x: 0, y: 0, w: 6, h: 4, symbol: "BTCUSDT", timeframe: "1h" },
  { i: "chart-2", x: 6, y: 0, w: 6, h: 4, symbol: "ETHUSDT", timeframe: "1h" },
];

const POPULAR_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT",
];

const TIMEFRAMES = [
  { id: "1m", label: "1m" },
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1H" },
  { id: "4h", label: "4H" },
  { id: "1d", label: "1D" },
];

const LAYOUT_PRESETS: Record<string, ChartLayout[]> = {
  "2-horizontal": [
    { i: "chart-1", x: 0, y: 0, w: 6, h: 4, symbol: "BTCUSDT", timeframe: "1h" },
    { i: "chart-2", x: 6, y: 0, w: 6, h: 4, symbol: "ETHUSDT", timeframe: "1h" },
  ],
  "2-vertical": [
    { i: "chart-1", x: 0, y: 0, w: 12, h: 2, symbol: "BTCUSDT", timeframe: "1h" },
    { i: "chart-2", x: 0, y: 2, w: 12, h: 2, symbol: "ETHUSDT", timeframe: "1h" },
  ],
  "3-mixed": [
    { i: "chart-1", x: 0, y: 0, w: 8, h: 3, symbol: "BTCUSDT", timeframe: "1h" },
    { i: "chart-2", x: 8, y: 0, w: 4, h: 3, symbol: "ETHUSDT", timeframe: "1h" },
    { i: "chart-3", x: 8, y: 3, w: 4, h: 3, symbol: "SOLUSDT", timeframe: "1h" },
  ],
  "4-grid": [
    { i: "chart-1", x: 0, y: 0, w: 6, h: 3, symbol: "BTCUSDT", timeframe: "1h" },
    { i: "chart-2", x: 6, y: 0, w: 6, h: 3, symbol: "ETHUSDT", timeframe: "1h" },
    { i: "chart-3", x: 0, y: 3, w: 6, h: 3, symbol: "SOLUSDT", timeframe: "1h" },
    { i: "chart-4", x: 6, y: 3, w: 6, h: 3, symbol: "BNBUSDT", timeframe: "1h" },
  ],
  "6-grid": [
    { i: "chart-1", x: 0, y: 0, w: 4, h: 2, symbol: "BTCUSDT", timeframe: "1h" },
    { i: "chart-2", x: 4, y: 0, w: 4, h: 2, symbol: "ETHUSDT", timeframe: "1h" },
    { i: "chart-3", x: 8, y: 0, w: 4, h: 2, symbol: "SOLUSDT", timeframe: "1h" },
    { i: "chart-4", x: 0, y: 2, w: 4, h: 2, symbol: "BNBUSDT", timeframe: "1h" },
    { i: "chart-5", x: 4, y: 2, w: 4, h: 2, symbol: "XRPUSDT", timeframe: "1h" },
    { i: "chart-6", x: 8, y: 2, w: 4, h: 2, symbol: "DOGEUSDT", timeframe: "1h" },
  ],
};

export interface MultiChartPanelProps {
  renderChart: (symbol: string, timeframe: string, chartId: string) => React.ReactNode;
  initialLayouts?: ChartLayout[];
  onLayoutChange?: (layouts: ChartLayout[]) => void;
  config?: Partial<MultiChartConfig>;
  className?: string;
  containerWidth?: number;
}

export function MultiChartPanel({
  renderChart,
  initialLayouts,
  onLayoutChange,
  config: userConfig,
  className,
  containerWidth = 1200,
}: MultiChartPanelProps) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  const [layouts, setLayouts] = useState<ChartLayout[]>(initialLayouts || DEFAULT_CHARTS);
  const [selectedPreset, setSelectedPreset] = useState<string>("2-horizontal");
  const [isEditing, setIsEditing] = useState(false);
  
  // Use ref to prevent infinite loop - GridLayout calls onLayoutChange on every render
  const prevLayoutRef = useRef<string>("");

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      // Prevent infinite loop by checking if layout actually changed
      const layoutKey = newLayout.map(l => `${l.i}:${l.x},${l.y},${l.w},${l.h}`).join("|");
      if (prevLayoutRef.current === layoutKey) {
        return;
      }
      prevLayoutRef.current = layoutKey;
      
      // Use functional update to avoid dependency on layouts
      setLayouts((prevLayouts) => {
        // Only update if positions actually changed
        const hasChanges = prevLayouts.some((chart) => {
          const layout = newLayout.find((l) => l.i === chart.i);
          if (!layout) return false;
          return (
            chart.x !== layout.x ||
            chart.y !== layout.y ||
            chart.w !== layout.w ||
            chart.h !== layout.h
          );
        });
        
        if (!hasChanges) return prevLayouts;
        
        const updated = prevLayouts.map((chart) => {
          const layout = newLayout.find((l) => l.i === chart.i);
          if (layout) {
            return { ...chart, x: layout.x, y: layout.y, w: layout.w, h: layout.h };
          }
          return chart;
        });
        
        onLayoutChange?.(updated);
        return updated;
      });
    },
    [onLayoutChange]
  );

  const addChart = useCallback(() => {
    const newId = `chart-${Date.now()}`;
    const maxY = Math.max(...layouts.map((l) => l.y + l.h));
    
    const newChart: ChartLayout = {
      i: newId,
      x: 0,
      y: maxY,
      w: 6,
      h: 4,
      symbol: POPULAR_SYMBOLS[layouts.length % POPULAR_SYMBOLS.length],
      timeframe: "1h",
      minW: 3,
      minH: 2,
    };

    setLayouts([...layouts, newChart]);
  }, [layouts]);

  const removeChart = useCallback(
    (chartId: string) => {
      if (layouts.length <= 1) return; // Keep at least one chart
      setLayouts(layouts.filter((l) => l.i !== chartId));
    },
    [layouts]
  );

  const updateChartSymbol = useCallback((chartId: string, symbol: string) => {
    setLayouts((prev) =>
      prev.map((chart) => (chart.i === chartId ? { ...chart, symbol } : chart))
    );
  }, []);

  const updateChartTimeframe = useCallback((chartId: string, timeframe: string) => {
    setLayouts((prev) =>
      prev.map((chart) => (chart.i === chartId ? { ...chart, timeframe } : chart))
    );
  }, []);

  const applyPreset = useCallback((presetName: string) => {
    const preset = LAYOUT_PRESETS[presetName];
    if (preset) {
      setLayouts(preset);
      setSelectedPreset(presetName);
      onLayoutChange?.(preset);
    }
  }, [onLayoutChange]);

  const resetLayout = useCallback(() => {
    setLayouts(DEFAULT_CHARTS);
    setSelectedPreset("2-horizontal");
  }, []);

  const gridLayout = useMemo(
    () =>
      layouts.map((chart) => ({
        i: chart.i,
        x: chart.x,
        y: chart.y,
        w: chart.w,
        h: chart.h,
        minW: chart.minW || 3,
        minH: chart.minH || 2,
        maxW: chart.maxW || 12,
        maxH: chart.maxH || 8,
      })),
    [layouts]
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-border bg-card/50 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {layouts.length} chart{layouts.length > 1 ? "s" : ""}
          </Badge>

          {/* Preset Selector */}
          <Select value={selectedPreset} onValueChange={applyPreset}>
            <SelectTrigger className="w-[140px] h-8">
              <LayoutTemplate className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Preset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2-horizontal">2 Horizontal</SelectItem>
              <SelectItem value="2-vertical">2 Vertical</SelectItem>
              <SelectItem value="3-mixed">3 Mixed</SelectItem>
              <SelectItem value="4-grid">4 Grid</SelectItem>
              <SelectItem value="6-grid">6 Grid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            className="h-8"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Settings className="h-3 w-3 mr-1" />
            Edit
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={addChart}
            disabled={layouts.length >= 9}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={resetLayout}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="flex-1 overflow-auto">
        <GridLayout
          className="layout"
          layout={gridLayout}
          cols={config.cols}
          rowHeight={config.rowHeight}
          width={containerWidth}
          margin={config.margin}
          containerPadding={config.containerPadding}
          verticalCompact={config.verticalCompact}
          preventCollision={config.preventCollision}
          onLayoutChange={handleLayoutChange}
          isDraggable={isEditing}
          isResizable={isEditing}
          draggableHandle=".chart-drag-handle"
        >
          {layouts.map((chart) => (
            <div
              key={chart.i}
              className="border border-border rounded-lg overflow-hidden bg-card flex flex-col"
            >
              {/* Chart Header */}
              <div className="flex items-center justify-between px-2 py-1 bg-muted/50 border-b border-border">
                <div className="flex items-center gap-2">
                  {isEditing && (
                    <div className="chart-drag-handle cursor-move p-1 hover:bg-muted rounded">
                      <Grid3X3 className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <Select
                    value={chart.symbol}
                    onValueChange={(v) => updateChartSymbol(chart.i, v)}
                  >
                    <SelectTrigger className="w-[100px] h-6 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POPULAR_SYMBOLS.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s.replace("USDT", "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={chart.timeframe}
                    onValueChange={(v) => updateChartTimeframe(chart.i, v)}
                  >
                    <SelectTrigger className="w-[50px] h-6 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEFRAMES.map((tf) => (
                        <SelectItem key={tf.id} value={tf.id} className="text-xs">
                          {tf.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isEditing && layouts.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => removeChart(chart.i)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Chart Content */}
              <div className="flex-1 min-h-0">
                {renderChart(chart.symbol, chart.timeframe, chart.i)}
              </div>
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}

// Export presets for external use
export { LAYOUT_PRESETS, POPULAR_SYMBOLS, TIMEFRAMES };
