"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Pause,
  Square,
  Settings,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Gauge,
  BarChart3,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

type BotStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'HALTED' | 'ERROR';
type BotMode = 'PAPER' | 'LIVE';

interface BotStats {
  totalTrades: number;
  winRate: number;
  avgPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalPnL: number;
}

interface BotConfig {
  enabled: boolean;
  mode: BotMode;
  symbol: string;
  exchange: string;
}

// =============================================================================
// SPECTRUM BOT PANEL (PR - Pairs Trading)
// =============================================================================

interface SpectrumConfig extends BotConfig {
  lookbackPeriod: number;
  zScoreEntry: number;
  zScoreExit: number;
  zScoreStopLoss: number;
  minCointegration: number;
  maxHalfLife: number;
  correlationThreshold: number;
}

function SpectrumBotPanel() {
  const [status, setStatus] = useState<BotStatus>('STOPPED');
  const [config, setConfig] = useState<SpectrumConfig>({
    enabled: false,
    mode: 'PAPER',
    symbol: 'BTCUSDT',
    exchange: 'binance',
    lookbackPeriod: 100,
    zScoreEntry: 2.0,
    zScoreExit: 0.5,
    zScoreStopLoss: 3.0,
    minCointegration: 0.95,
    maxHalfLife: 20,
    correlationThreshold: 0.7,
  });

  const [stats, setStats] = useState<BotStats>({
    totalTrades: 47,
    winRate: 68.4,
    avgPnL: 124.50,
    maxDrawdown: 8.2,
    sharpeRatio: 1.85,
    totalPnL: 5845.50,
  });

  const [pairs, setPairs] = useState([
    { pair: 'BTC/ETH', correlation: 0.87, zScore: 1.2, status: 'WATCHING' },
    { pair: 'SOL/AVAX', correlation: 0.82, zScore: -2.1, status: 'ACTIVE' },
    { pair: 'MATIC/ARB', correlation: 0.91, zScore: 0.3, status: 'WATCHING' },
  ]);

  const handleStart = () => {
    setStatus('STARTING');
    setTimeout(() => setStatus('RUNNING'), 1500);
  };

  const handleStop = () => {
    setStatus('STOPPED');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Target className="h-6 w-6 text-purple-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Spectrum
              <Badge variant="outline" className="text-xs">PR</Badge>
              <Badge variant="secondary" className="text-xs">Pairs Trading</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">Cointegration-based pairs trading</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={status === 'RUNNING' ? 'default' : status === 'ERROR' ? 'destructive' : 'secondary'}
            className={cn(
              "px-3 py-1",
              status === 'RUNNING' && "bg-green-500/10 text-green-500 border-green-500/30"
            )}
          >
            {status}
          </Badge>
          {status === 'RUNNING' ? (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={status === 'STARTING'}>
              <Play className="h-4 w-4 mr-2" />
              Start
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Trades</div>
            <div className="text-2xl font-bold">{stats.totalTrades}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Win Rate</div>
            <div className="text-2xl font-bold text-green-500">{stats.winRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Avg PnL</div>
            <div className="text-2xl font-bold">${stats.avgPnL}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Max DD</div>
            <div className="text-2xl font-bold text-red-500">{stats.maxDrawdown}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Sharpe</div>
            <div className="text-2xl font-bold">{stats.sharpeRatio}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total PnL</div>
            <div className="text-2xl font-bold text-green-500">${stats.totalPnL}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="pairs" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pairs">Active Pairs</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
        </TabsList>

        <TabsContent value="pairs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monitored Pairs</CardTitle>
              <CardDescription>Cointegrated pairs with active signals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pairs.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-4">
                      <div className="font-mono font-semibold">{p.pair}</div>
                      <Badge variant={p.status === 'ACTIVE' ? 'default' : 'secondary'}
                        className={cn(p.status === 'ACTIVE' && "bg-green-500/10 text-green-500")}>
                        {p.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-muted-foreground">Corr: </span>
                        <span className="font-mono">{p.correlation.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Z-Score: </span>
                        <span className={cn(
                          "font-mono font-bold",
                          p.zScore > 2 || p.zScore < -2 ? "text-green-500" : "text-foreground"
                        )}>{p.zScore.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Strategy Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Lookback Period</Label>
                  <Input
                    type="number"
                    value={config.lookbackPeriod}
                    onChange={(e) => setConfig({...config, lookbackPeriod: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Z-Score Entry Threshold</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.zScoreEntry}
                    onChange={(e) => setConfig({...config, zScoreEntry: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Z-Score Exit Threshold</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.zScoreExit}
                    onChange={(e) => setConfig({...config, zScoreExit: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Z-Score Stop Loss</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.zScoreStopLoss}
                    onChange={(e) => setConfig({...config, zScoreStopLoss: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min Cointegration</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.minCointegration}
                    onChange={(e) => setConfig({...config, minCointegration: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Half-Life (periods)</Label>
                  <Input
                    type="number"
                    value={config.maxHalfLife}
                    onChange={(e) => setConfig({...config, maxHalfLife: Number(e.target.value)})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Correlation Threshold: {config.correlationThreshold}</Label>
                <Slider
                  value={[config.correlationThreshold]}
                  onValueChange={([v]) => setConfig({...config, correlationThreshold: v})}
                  min={0.5}
                  max={0.99}
                  step={0.01}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                No active positions
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// REED BOT PANEL (STA - Statistical Arbitrage)
// =============================================================================

function ReedBotPanel() {
  const [status, setStatus] = useState<BotStatus>('STOPPED');
  const [config, setConfig] = useState({
    lookbackPeriod: 60,
    minExpectedReturn: 0.02,
    maxHoldingPeriod: 24,
    pcaComponents: 3,
    sectorNeutral: true,
    marketNeutral: true,
  });

  const [stats] = useState<BotStats>({
    totalTrades: 128,
    winRate: 58.5,
    avgPnL: 87.30,
    maxDrawdown: 5.4,
    sharpeRatio: 2.12,
    totalPnL: 11174.40,
  });

  const [factors] = useState([
    { name: 'Momentum', weight: 0.35, value: 0.12 },
    { name: 'Value', weight: 0.25, value: -0.08 },
    { name: 'Mean Reversion', weight: 0.20, value: 0.15 },
    { name: 'Volatility', weight: 0.20, value: -0.03 },
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <BarChart3 className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Reed
              <Badge variant="outline" className="text-xs">STA</Badge>
              <Badge variant="secondary" className="text-xs">Stat Arb</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">PCA-based statistical arbitrage</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={status === 'RUNNING' ? 'default' : 'secondary'}
            className={cn(status === 'RUNNING' && "bg-green-500/10 text-green-500")}
          >
            {status}
          </Badge>
          <Button size="sm" onClick={() => setStatus(status === 'RUNNING' ? 'STOPPED' : 'RUNNING')}>
            {status === 'RUNNING' ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {status === 'RUNNING' ? 'Stop' : 'Start'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Trades</div><div className="text-2xl font-bold">{stats.totalTrades}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Win Rate</div><div className="text-2xl font-bold text-green-500">{stats.winRate}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Avg PnL</div><div className="text-2xl font-bold">${stats.avgPnL}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Max DD</div><div className="text-2xl font-bold text-red-500">{stats.maxDrawdown}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Sharpe</div><div className="text-2xl font-bold">{stats.sharpeRatio}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total PnL</div><div className="text-2xl font-bold text-green-500">${stats.totalPnL}</div></CardContent></Card>
      </div>

      {/* Factor Model */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Factor Model</CardTitle>
          <CardDescription>Current factor weights and values</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {factors.map((f, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-32 font-medium">{f.name}</div>
                <div className="flex-1">
                  <Progress value={f.weight * 100} className="h-2" />
                </div>
                <div className="w-16 text-right font-mono">{(f.weight * 100).toFixed(0)}%</div>
                <div className={cn(
                  "w-16 text-right font-mono font-bold",
                  f.value > 0 ? "text-green-500" : "text-red-500"
                )}>
                  {f.value > 0 ? '+' : ''}{f.value.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Lookback Period</Label>
            <Input type="number" value={config.lookbackPeriod} onChange={(e) => setConfig({...config, lookbackPeriod: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Min Expected Return</Label>
            <Input type="number" step="0.01" value={config.minExpectedReturn} onChange={(e) => setConfig({...config, minExpectedReturn: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Holding (h)</Label>
            <Input type="number" value={config.maxHoldingPeriod} onChange={(e) => setConfig({...config, maxHoldingPeriod: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>PCA Components</Label>
            <Input type="number" value={config.pcaComponents} onChange={(e) => setConfig({...config, pcaComponents: Number(e.target.value)})} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={config.sectorNeutral} onCheckedChange={(v) => setConfig({...config, sectorNeutral: v})} />
            <Label>Sector Neutral</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={config.marketNeutral} onCheckedChange={(v) => setConfig({...config, marketNeutral: v})} />
            <Label>Market Neutral</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// ARCHITECT BOT PANEL (MM - Market Making)
// =============================================================================

function ArchitectBotPanel() {
  const [status, setStatus] = useState<BotStatus>('STOPPED');
  const [config, setConfig] = useState({
    baseSpreadPct: 0.1,
    minSpreadPct: 0.05,
    maxSpreadPct: 0.5,
    orderSize: 100,
    maxInventory: 1000,
    inventorySkewFactor: 0.5,
    refreshRate: 1000,
  });

  const [stats] = useState({
    totalVolume: 1250000,
    capturedSpread: 2340,
    inventoryPnl: -120,
    totalPnl: 2220,
    fillRate: 78.5,
    avgSpread: 0.12,
  });

  const [quotes] = useState([
    { symbol: 'BTCUSDT', bid: 43250.50, ask: 43252.00, spread: 0.035, skew: 0.02 },
    { symbol: 'ETHUSDT', bid: 2285.10, ask: 2285.80, spread: 0.031, skew: -0.01 },
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Activity className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Architect
              <Badge variant="outline" className="text-xs">MM</Badge>
              <Badge variant="secondary" className="text-xs">Market Making</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">Inventory-skewed market making</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={status === 'RUNNING' ? 'default' : 'secondary'}
            className={cn(status === 'RUNNING' && "bg-green-500/10 text-green-500")}
          >
            {status}
          </Badge>
          <Button size="sm" onClick={() => setStatus(status === 'RUNNING' ? 'STOPPED' : 'RUNNING')}>
            {status === 'RUNNING' ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {status === 'RUNNING' ? 'Stop' : 'Start'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Volume</div><div className="text-2xl font-bold">${(stats.totalVolume / 1000).toFixed(0)}K</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Spread Captured</div><div className="text-2xl font-bold text-green-500">${stats.capturedSpread}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Inventory PnL</div><div className={cn("text-2xl font-bold", stats.inventoryPnl < 0 ? "text-red-500" : "text-green-500")}>${stats.inventoryPnl}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total PnL</div><div className="text-2xl font-bold text-green-500">${stats.totalPnl}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Fill Rate</div><div className="text-2xl font-bold">{stats.fillRate}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Avg Spread</div><div className="text-2xl font-bold">{stats.avgSpread}%</div></CardContent></Card>
      </div>

      {/* Active Quotes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Quotes</CardTitle>
          <CardDescription>Current market making quotes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {quotes.map((q, i) => (
              <div key={i} className="grid grid-cols-6 gap-4 p-3 rounded-lg border border-border bg-muted/30">
                <div className="font-mono font-semibold">{q.symbol}</div>
                <div className="text-green-500 font-mono">{q.bid.toFixed(2)}</div>
                <div className="text-red-500 font-mono">{q.ask.toFixed(2)}</div>
                <div className="font-mono">{q.spread.toFixed(3)}%</div>
                <div className={cn("font-mono", q.skew > 0 ? "text-red-500" : "text-green-500")}>
                  Skew: {q.skew > 0 ? '+' : ''}{q.skew.toFixed(2)}
                </div>
                <Badge variant="outline" className="justify-self-end">ACTIVE</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Base Spread (%)</Label>
            <Input type="number" step="0.01" value={config.baseSpreadPct} onChange={(e) => setConfig({...config, baseSpreadPct: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Min Spread (%)</Label>
            <Input type="number" step="0.01" value={config.minSpreadPct} onChange={(e) => setConfig({...config, minSpreadPct: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Spread (%)</Label>
            <Input type="number" step="0.01" value={config.maxSpreadPct} onChange={(e) => setConfig({...config, maxSpreadPct: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Order Size</Label>
            <Input type="number" value={config.orderSize} onChange={(e) => setConfig({...config, orderSize: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Max Inventory</Label>
            <Input type="number" value={config.maxInventory} onChange={(e) => setConfig({...config, maxInventory: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Inventory Skew</Label>
            <Input type="number" step="0.1" value={config.inventorySkewFactor} onChange={(e) => setConfig({...config, inventorySkewFactor: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Refresh Rate (ms)</Label>
            <Input type="number" value={config.refreshRate} onChange={(e) => setConfig({...config, refreshRate: Number(e.target.value)})} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// EQUILIBRIST BOT PANEL (MR - Mean Reversion)
// =============================================================================

function EquilibristBotPanel() {
  const [status, setStatus] = useState<BotStatus>('STOPPED');
  const [config, setConfig] = useState({
    lookbackPeriod: 50,
    zScoreEntry: 2.5,
    zScoreExit: 0.5,
    meanCalcMethod: 'KAMA',
    stdCalcMethod: 'EWMA',
    bollingerBands: true,
    rsiConfirmation: true,
  });

  const [stats] = useState<BotStats>({
    totalTrades: 89,
    winRate: 71.2,
    avgPnL: 156.40,
    maxDrawdown: 6.8,
    sharpeRatio: 1.95,
    totalPnL: 13919.60,
  });

  const [signals] = useState([
    { symbol: 'BTCUSDT', price: 43200, fairValue: 43500, zScore: -2.3, direction: 'LONG', confidence: 0.85 },
    { symbol: 'SOLUSDT', price: 98.50, fairValue: 95.00, zScore: 2.1, direction: 'SHORT', confidence: 0.72 },
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Gauge className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Equilibrist
              <Badge variant="outline" className="text-xs">MR</Badge>
              <Badge variant="secondary" className="text-xs">Mean Reversion</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">KAMA-based mean reversion</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={status === 'RUNNING' ? 'default' : 'secondary'}
            className={cn(status === 'RUNNING' && "bg-green-500/10 text-green-500")}
          >
            {status}
          </Badge>
          <Button size="sm" onClick={() => setStatus(status === 'RUNNING' ? 'STOPPED' : 'RUNNING')}>
            {status === 'RUNNING' ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {status === 'RUNNING' ? 'Stop' : 'Start'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Trades</div><div className="text-2xl font-bold">{stats.totalTrades}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Win Rate</div><div className="text-2xl font-bold text-green-500">{stats.winRate}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Avg PnL</div><div className="text-2xl font-bold">${stats.avgPnL}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Max DD</div><div className="text-2xl font-bold text-red-500">{stats.maxDrawdown}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Sharpe</div><div className="text-2xl font-bold">{stats.sharpeRatio}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total PnL</div><div className="text-2xl font-bold text-green-500">${stats.totalPnL}</div></CardContent></Card>
      </div>

      {/* Signals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Signals</CardTitle>
          <CardDescription>Mean reversion opportunities detected</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {signals.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="font-mono font-semibold">{s.symbol}</div>
                  <Badge variant={s.direction === 'LONG' ? 'default' : 'destructive'}
                    className={cn(s.direction === 'LONG' && "bg-green-500/10 text-green-500")}>
                    {s.direction}
                  </Badge>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div><span className="text-muted-foreground">Price: </span>${s.price}</div>
                  <div><span className="text-muted-foreground">Fair Value: </span>${s.fairValue}</div>
                  <div className={cn("font-mono font-bold", Math.abs(s.zScore) > 2 ? "text-green-500" : "")}>
                    Z: {s.zScore.toFixed(2)}
                  </div>
                  <div className="text-muted-foreground">Conf: {(s.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Lookback Period</Label>
            <Input type="number" value={config.lookbackPeriod} onChange={(e) => setConfig({...config, lookbackPeriod: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Z-Score Entry</Label>
            <Input type="number" step="0.1" value={config.zScoreEntry} onChange={(e) => setConfig({...config, zScoreEntry: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Z-Score Exit</Label>
            <Input type="number" step="0.1" value={config.zScoreExit} onChange={(e) => setConfig({...config, zScoreExit: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>Mean Method</Label>
            <Select value={config.meanCalcMethod} onValueChange={(v) => setConfig({...config, meanCalcMethod: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SMA">SMA</SelectItem>
                <SelectItem value="EMA">EMA</SelectItem>
                <SelectItem value="KAMA">KAMA</SelectItem>
                <SelectItem value="REGRESSION">Regression</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={config.bollingerBands} onCheckedChange={(v) => setConfig({...config, bollingerBands: v})} />
            <Label>Bollinger Bands</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={config.rsiConfirmation} onCheckedChange={(v) => setConfig({...config, rsiConfirmation: v})} />
            <Label>RSI Confirmation</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// KRON BOT PANEL (TRF - Trend Following)
// =============================================================================

function KronBotPanel() {
  const [status, setStatus] = useState<BotStatus>('STOPPED');
  const [config, setConfig] = useState({
    trendMethod: 'COMBINED',
    emaFast: 9,
    emaMedium: 21,
    emaSlow: 55,
    adxThreshold: 25,
    supertrendPeriod: 10,
    supertrendMultiplier: 3,
    trailingStopEnabled: true,
    atrMultiplier: 2.5,
    pyramidEnabled: true,
    maxPyramidLevels: 3,
  });

  const [stats] = useState<BotStats>({
    totalTrades: 34,
    winRate: 42.5,
    avgPnL: 520.80,
    maxDrawdown: 12.4,
    sharpeRatio: 1.45,
    totalPnL: 17707.20,
  });

  const [trends] = useState([
    { symbol: 'BTCUSDT', direction: 'UPTREND', strength: 68, adx: 32.5, position: true },
    { symbol: 'ETHUSDT', direction: 'UPTREND', strength: 55, adx: 28.1, position: false },
    { symbol: 'SOLUSDT', direction: 'SIDEWAYS', strength: 22, adx: 18.5, position: false },
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <TrendingUp className="h-6 w-6 text-cyan-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Kron
              <Badge variant="outline" className="text-xs">TRF</Badge>
              <Badge variant="secondary" className="text-xs">Trend Following</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">Multi-indicator trend following with pyramiding</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={status === 'RUNNING' ? 'default' : 'secondary'}
            className={cn(status === 'RUNNING' && "bg-green-500/10 text-green-500")}
          >
            {status}
          </Badge>
          <Button size="sm" onClick={() => setStatus(status === 'RUNNING' ? 'STOPPED' : 'RUNNING')}>
            {status === 'RUNNING' ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {status === 'RUNNING' ? 'Stop' : 'Start'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Trades</div><div className="text-2xl font-bold">{stats.totalTrades}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Win Rate</div><div className="text-2xl font-bold">{stats.winRate}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Avg PnL</div><div className="text-2xl font-bold text-green-500">${stats.avgPnL}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Max DD</div><div className="text-2xl font-bold text-red-500">{stats.maxDrawdown}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Sharpe</div><div className="text-2xl font-bold">{stats.sharpeRatio}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total PnL</div><div className="text-2xl font-bold text-green-500">${stats.totalPnL}</div></CardContent></Card>
      </div>

      {/* Trend Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Trend Analysis</CardTitle>
          <CardDescription>Current trend status across monitored symbols</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {trends.map((t, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="font-mono font-semibold">{t.symbol}</div>
                  <Badge
                    variant={t.direction === 'UPTREND' ? 'default' : t.direction === 'DOWNTREND' ? 'destructive' : 'secondary'}
                    className={cn(
                      t.direction === 'UPTREND' && "bg-green-500/10 text-green-500",
                      t.direction === 'DOWNTREND' && "bg-red-500/10 text-red-500"
                    )}
                  >
                    {t.direction === 'UPTREND' && <TrendingUp className="h-3 w-3 mr-1" />}
                    {t.direction === 'DOWNTREND' && <TrendingDown className="h-3 w-3 mr-1" />}
                    {t.direction}
                  </Badge>
                  {t.position && <Badge variant="outline" className="text-xs">IN POSITION</Badge>}
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Strength: </span>
                    <span className={cn("font-bold", t.strength > 50 ? "text-green-500" : "")}>{t.strength}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">ADX: </span>
                    <span className={cn("font-mono", t.adx > 25 ? "text-green-500" : "")}>{t.adx}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Trend Method</Label>
            <Select value={config.trendMethod} onValueChange={(v) => setConfig({...config, trendMethod: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EMA_CROSS">EMA Cross</SelectItem>
                <SelectItem value="SUPERTREND">Supertrend</SelectItem>
                <SelectItem value="ADX">ADX</SelectItem>
                <SelectItem value="COMBINED">Combined</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>EMA Fast</Label>
            <Input type="number" value={config.emaFast} onChange={(e) => setConfig({...config, emaFast: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>EMA Medium</Label>
            <Input type="number" value={config.emaMedium} onChange={(e) => setConfig({...config, emaMedium: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>EMA Slow</Label>
            <Input type="number" value={config.emaSlow} onChange={(e) => setConfig({...config, emaSlow: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>ADX Threshold</Label>
            <Input type="number" value={config.adxThreshold} onChange={(e) => setConfig({...config, adxThreshold: Number(e.target.value)})} />
          </div>
          <div className="space-y-2">
            <Label>ATR Multiplier</Label>
            <Input type="number" step="0.1" value={config.atrMultiplier} onChange={(e) => setConfig({...config, atrMultiplier: Number(e.target.value)})} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={config.trailingStopEnabled} onCheckedChange={(v) => setConfig({...config, trailingStopEnabled: v})} />
            <Label>Trailing Stop</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={config.pyramidEnabled} onCheckedChange={(v) => setConfig({...config, pyramidEnabled: v})} />
            <Label>Pyramiding</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// MAIN PANEL
// =============================================================================

export function InstitutionalBotsPanel() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-8 w-8 text-yellow-500" />
          <div>
            <h1 className="text-2xl font-bold">Institutional Bots</h1>
            <p className="text-muted-foreground">Advanced trading strategies for professional traders</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="spectrum" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="spectrum" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden md:inline">Spectrum</span>
            <Badge variant="outline" className="text-xs">PR</Badge>
          </TabsTrigger>
          <TabsTrigger value="reed" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden md:inline">Reed</span>
            <Badge variant="outline" className="text-xs">STA</Badge>
          </TabsTrigger>
          <TabsTrigger value="architect" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden md:inline">Architect</span>
            <Badge variant="outline" className="text-xs">MM</Badge>
          </TabsTrigger>
          <TabsTrigger value="equilibrist" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            <span className="hidden md:inline">Equilibrist</span>
            <Badge variant="outline" className="text-xs">MR</Badge>
          </TabsTrigger>
          <TabsTrigger value="kron" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden md:inline">Kron</span>
            <Badge variant="outline" className="text-xs">TRF</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spectrum" className="mt-6">
          <SpectrumBotPanel />
        </TabsContent>
        <TabsContent value="reed" className="mt-6">
          <ReedBotPanel />
        </TabsContent>
        <TabsContent value="architect" className="mt-6">
          <ArchitectBotPanel />
        </TabsContent>
        <TabsContent value="equilibrist" className="mt-6">
          <EquilibristBotPanel />
        </TabsContent>
        <TabsContent value="kron" className="mt-6">
          <KronBotPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default InstitutionalBotsPanel;
