'use client';

/**
 * Risk Dashboard Panel
 * 
 * Real-time risk monitoring and alerts.
 * Features:
 * - Portfolio exposure
 * - Drawdown tracking
 * - Position limits
 * - Risk alerts
 */

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle,
  Shield,
  TrendingDown,
  Activity,
  PieChart,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Percent,
  Layers,
} from 'lucide-react';

// Types
interface RiskMetrics {
  totalExposure: number;
  maxExposure: number;
  currentDrawdown: number;
  maxDrawdown: number;
  leverage: number;
  maxLeverage: number;
  openPositions: number;
  maxPositions: number;
  dailyPnL: number;
  dailyLossLimit: number;
}

interface RiskAlert {
  id: string;
  type: 'warning' | 'critical';
  message: string;
  timestamp: Date;
}

interface PositionRisk {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  liquidationPrice: number | null;
}

// Default metrics for initialization
const DEFAULT_METRICS: RiskMetrics = {
  totalExposure: 0,
  maxExposure: 100000,
  currentDrawdown: 0,
  maxDrawdown: 20,
  leverage: 1,
  maxLeverage: 10,
  openPositions: 0,
  maxPositions: 10,
  dailyPnL: 0,
  dailyLossLimit: 5,
};

export function RiskDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<RiskMetrics>(DEFAULT_METRICS);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [positions, setPositions] = useState<PositionRisk[]>([]);

  // Fetch risk data
  const fetchRiskData = useCallback(async () => {
    try {
      const response = await fetch('/api/risk/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics || DEFAULT_METRICS);
        setAlerts(data.alerts || []);
        setPositions(data.positions || []);
      }
    } catch (err) {
      console.error('Failed to fetch risk data:', err);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Use RAF to batch initial fetch with other updates
    const rafId = requestAnimationFrame(() => {
      fetchRiskData();
    });
    const interval = setInterval(fetchRiskData, 3000);
    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
    };
  }, [fetchRiskData]);

  // Calculate percentages
  const exposurePercent = (metrics.totalExposure / metrics.maxExposure) * 100;
  const drawdownPercent = metrics.currentDrawdown;
  const leveragePercent = (metrics.leverage / metrics.maxLeverage) * 100;
  const positionPercent = (metrics.openPositions / metrics.maxPositions) * 100;

  // Get status color
  const getStatusColor = (percent: number, warning: number = 70, critical: number = 90) => {
    if (percent >= critical) return 'text-red-500';
    if (percent >= warning) return 'text-yellow-500';
    return 'text-green-500';
  };

  // Get progress color
  const getProgressClass = (percent: number, warning: number = 70, critical: number = 90) => {
    if (percent >= critical) return 'bg-red-500';
    if (percent >= warning) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <CardTitle>Risk Dashboard</CardTitle>
            </div>
            {alerts.length > 0 && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {alerts.length} Alert{alerts.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Exposure */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total Exposure</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={`text-2xl font-bold ${getStatusColor(exposurePercent)}`}>
              ${metrics.totalExposure.toLocaleString()}
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>of ${metrics.maxExposure.toLocaleString()}</span>
                <span>{exposurePercent.toFixed(1)}%</span>
              </div>
              <Progress value={exposurePercent} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Drawdown */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Current Drawdown</span>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={`text-2xl font-bold ${getStatusColor(metrics.currentDrawdown, 10, 15)}`}>
              {metrics.currentDrawdown.toFixed(2)}%
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Max: {metrics.maxDrawdown}%</span>
                <span>{((metrics.currentDrawdown / metrics.maxDrawdown) * 100).toFixed(0)}%</span>
              </div>
              <Progress 
                value={(metrics.currentDrawdown / metrics.maxDrawdown) * 100} 
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Leverage */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Leverage</span>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={`text-2xl font-bold ${getStatusColor(leveragePercent, 60, 80)}`}>
              {metrics.leverage.toFixed(1)}x
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Max: {metrics.maxLeverage}x</span>
                <span>{leveragePercent.toFixed(0)}%</span>
              </div>
              <Progress value={leveragePercent} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Open Positions */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Open Positions</span>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className={`text-2xl font-bold ${getStatusColor(positionPercent)}`}>
              {metrics.openPositions}
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Max: {metrics.maxPositions}</span>
                <span>{positionPercent.toFixed(0)}%</span>
              </div>
              <Progress value={positionPercent} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Risk Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className={`p-3 rounded flex items-center gap-2 ${
                    alert.type === 'critical' 
                      ? 'bg-red-500/10 border border-red-500/20' 
                      : 'bg-yellow-500/10 border border-yellow-500/20'
                  }`}
                >
                  {alert.type === 'critical' ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                  <span className={alert.type === 'critical' ? 'text-red-500' : 'text-yellow-500'}>
                    {alert.message}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Positions Table */}
      {positions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Position Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Symbol</th>
                    <th className="text-left p-2">Side</th>
                    <th className="text-right p-2">Size</th>
                    <th className="text-right p-2">PnL</th>
                    <th className="text-right p-2">Leverage</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 font-medium">{pos.symbol}</td>
                      <td className="p-2">
                        <Badge variant={pos.side === 'LONG' ? 'default' : 'destructive'}>
                          {pos.side}
                        </Badge>
                      </td>
                      <td className="p-2 text-right">{pos.size.toFixed(4)}</td>
                      <td className={`p-2 text-right ${pos.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)} ({pos.pnlPercent.toFixed(2)}%)
                      </td>
                      <td className="p-2 text-right">{pos.leverage}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default RiskDashboard;
