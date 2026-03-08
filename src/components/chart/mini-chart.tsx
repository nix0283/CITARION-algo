"use client";

import { useState, useEffect, useRef } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  Time,
  CandlestickSeries,
} from "lightweight-charts";
import type { CandlestickData } from "lightweight-charts";
import { Loader2 } from "lucide-react";

interface MiniChartProps {
  exchangeId?: string;
  symbol?: string;
  timeframe?: string;
  chartId?: string;
}

// Map exchange IDs to their API endpoints
const EXCHANGE_API_MAP: Record<string, string> = {
  binance: "https://api.binance.com/api/v3/klines",
  bybit: "https://api.bybit.com/v5/derivatives/v3/public/kline",
  // Add more exchanges as needed
};

// Default symbols per exchange
const DEFAULT_SYMBOL = "BTCUSDT";

export function MiniChart({ 
  exchangeId = "binance", 
  symbol = DEFAULT_SYMBOL,
  timeframe = "1h",
  chartId 
}: MiniChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0b" },
        textColor: "#4c525e",
      },
      grid: {
        vertLines: { color: "#1a1a1d" },
        horzLines: { color: "#1a1a1d" },
      },
      rightPriceScale: {
        borderColor: "#1a1a1d",
        borderVisible: false,
      },
      timeScale: {
        borderColor: "#1a1a1d",
        borderVisible: false,
        visible: false,
      },
      handleScale: false,
      handleScroll: false,
      crosshair: {
        mode: 0, // Hidden
      },
    });

    chartRef.current = chart;

    // Create candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderDownColor: "#ef5350",
      borderUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      wickUpColor: "#26a69a",
    });
    candleSeriesRef.current = candleSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    handleResize();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Fetch data when exchange or symbol changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Use our API endpoint which handles different exchanges
        const response = await fetch(
          `/api/ohlcv?symbol=${symbol}&interval=${timeframe}&limit=100`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }

        const data = await response.json();

        if (data.success && data.ohlcv && data.ohlcv.length > 0) {
          const candleData = data.ohlcv.map((c: number[]) => ({
            time: Math.floor(c[0] / 1000) as Time,
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
          })) as CandlestickData<Time>[];

          if (candleSeriesRef.current) {
            candleSeriesRef.current.setData(candleData);
          }

          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }
        } else {
          // Generate synthetic data as fallback
          const syntheticData = generateSyntheticData(100);
          if (candleSeriesRef.current) {
            candleSeriesRef.current.setData(syntheticData);
          }
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }
        }
      } catch (err) {
        console.error("Mini chart error:", err);
        setError("Ошибка загрузки");
        
        // Generate synthetic data on error
        const syntheticData = generateSyntheticData(100);
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(syntheticData);
        }
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [exchangeId, symbol, timeframe]);

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      )}
      {error && !isLoading && (
        <div className="absolute top-1 right-1 text-[10px] text-muted-foreground z-10">
          {error}
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}

// Generate synthetic candlestick data for fallback
function generateSyntheticData(candles: number): CandlestickData<Time>[] {
  const data: CandlestickData<Time>[] = [];
  let price = 97000; // BTC price
  const now = Math.floor(Date.now() / 1000);
  const interval = 3600;

  for (let i = candles; i >= 0; i--) {
    const time = now - i * interval;
    const change = (Math.random() - 0.5) * 2 * 0.01 * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);

    data.push({
      time: time as Time,
      open,
      high,
      low,
      close,
    } as CandlestickData<Time>);
    price = close;
  }

  return data;
}
