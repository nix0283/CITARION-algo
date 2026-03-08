/**
 * Chart Types Index
 *
 * This module exports all chart type implementations:
 * - Heikin-Ashi: Smoothed candlesticks
 * - Renko: Brick-based price chart
 * - Kagi: Supply/demand line chart
 * - Line Break: Three-line reversal chart
 * - Range Bars: Fixed range price bars
 * - Point & Figure: X/O price chart
 * - Hollow Candles: Trend-relative candles
 * - Volume Candles: Volume-weighted candles
 */

// Re-export existing implementations
export * from '../heikin-ashi';
export * from '../renko';
export * from '../fractals';

// Export new chart types
export * from './kagi';
export * from './line-break';
export * from './range-bars';
export * from './point-figure';
export * from './hollow-candles';
export * from './volume-candles';

// Chart type metadata for UI
export const CHART_TYPES = [
  // Standard chart types
  {
    id: 'bars',
    name: 'Bars (OHLC)',
    category: 'chart_types',
    description: 'Standard OHLC bar chart showing open, high, low, close for each period',
    overlay: true,
    hasOHLC: true,
  },
  {
    id: 'line',
    name: 'Line Chart',
    category: 'chart_types',
    description: 'Simple line chart connecting closing prices',
    overlay: true,
    hasOHLC: false,
  },
  {
    id: 'area',
    name: 'Area Chart',
    category: 'chart_types',
    description: 'Line chart with filled area below the line',
    overlay: true,
    hasOHLC: false,
  },
  {
    id: 'candles',
    name: 'Candlesticks',
    category: 'chart_types',
    description: 'Traditional Japanese candlestick chart',
    overlay: true,
    hasOHLC: true,
  },
  {
    id: 'crosses',
    name: 'Crosses',
    category: 'chart_types',
    description: 'Cross markers at each price point (useful for scatter analysis)',
    overlay: true,
    hasOHLC: false,
  },
  {
    id: 'columns',
    name: 'Columns (HLC)',
    category: 'chart_types',
    description: 'Vertical columns showing high-low range with close marker',
    overlay: true,
    hasOHLC: true,
  },

  // Advanced chart types
  {
    id: 'heikin_ashi',
    name: 'Heikin-Ashi',
    category: 'chart_types',
    description: 'Smoothed candlesticks that filter out market noise',
    overlay: true,
    hasOHLC: true,
  },
  {
    id: 'renko',
    name: 'Renko',
    category: 'chart_types',
    description: 'Brick-based chart that filters noise using fixed price movements',
    overlay: true,
    hasOHLC: false,
  },
  {
    id: 'kagi',
    name: 'Kagi',
    category: 'chart_types',
    description: 'Supply and demand chart with reversal-based lines',
    overlay: true,
    hasOHLC: false,
  },
  {
    id: 'line_break',
    name: 'Line Break (Three Line)',
    category: 'chart_types',
    description: 'Reversal chart based on breaking previous line highs/lows',
    overlay: true,
    hasOHLC: false,
  },
  {
    id: 'range_bars',
    name: 'Range Bars',
    category: 'chart_types',
    description: 'Price-based bars with fixed range, independent of time',
    overlay: true,
    hasOHLC: true,
  },
  {
    id: 'point_figure',
    name: 'Point & Figure',
    category: 'chart_types',
    description: 'X/O chart showing only significant price movements',
    overlay: true,
    hasOHLC: false,
  },
  {
    id: 'hollow_candles',
    name: 'Hollow Candles',
    category: 'chart_types',
    description: 'Candlesticks with fill based on trend direction',
    overlay: true,
    hasOHLC: true,
  },
  {
    id: 'volume_candles',
    name: 'Volume Candles',
    category: 'chart_types',
    description: 'Candlesticks with volume-encoded width or intensity',
    overlay: true,
    hasOHLC: true,
  },
] as const;

export type ChartTypeId = typeof CHART_TYPES[number]['id'];
