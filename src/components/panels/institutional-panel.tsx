'use client';

/**
 * Institutional Bots Panel
 * 
 * UI for managing and monitoring institutional trading bots.
 * Bots:
 * - Reed (STA): Statistical Arbitrage
 * - Architect (MM): Market Making
 * - Equilibrist (MR): Mean Reversion
 * - Kron (TRF): Trend Following
 * - Spectrum (PR): Pairs Trading
 */

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot,
  Play,
  Square,
  Pause,
  RefreshCw,
  Activity,
  TrendingUp,
  TrendingDown,
  BarChart3,
  LineChart,
  Target,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  Scale,
  Compass,
} from 'lucide-react';

// Types
interface BotStatus {
  status: 'STOPPED' | 'STARTING' | 'RUNNING' | 'HALTED' | 'ERROR';
  stats: Record<string, number>;
}

interface BotSignal {
  id: string;
  timestamp: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  expectedReturn?: number;
  zScore?: number;
  strength?: number;
}

interface BotInfo {
  code: string;
  name: string;
  strategy: string;
  icon: React.ReactNode;
  color: string;
  status: BotStatus;
  signals: BotSignal[];
}

const BOT_CONFIGS = [
  {
    code: 'STA',
    name: 'Reed',
    strategy: 'Statistical Arbitrage',
    icon: <BarChart3 className="h-4 w-4" />,
    color: 'text-blue-500',
    description: 'Multi-factor statistical arbitrage using PCA and factor models',
  },
  {
    code: 'MM',
    name: 'Architect',
    strategy: 'Market Making',
    icon: <Scale className="h-4 w-4" />,
    color: 'text-purple-500',
    description: 'Provides liquidity with inventory-based pricing',
  },
  {
    code: 'MR',
    name: 'Equilibrist',
    strategy: 'Mean Reversion',
    icon: <Target className="h-4 w-4" />,
    color: 'text-orange-500',
    description: 'Trades mean reversion using Bollinger Bands and Z-score',
  },
  {
    code: 'TRF',
    name: 'Kron',
    strategy: 'Trend Following',
    icon: <Compass className="h-4 w-4" />,
    color: 'text-green-500',
    description: 'Systematic trend following with EMA, ADX, Supertrend',
  },
];

export function InstitutionalPanel() {
  const [selectedBot, setSelectedBot] = useState('STA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bots, setBots] = useState<BotInfo[]>([]);

  // Fetch bot statuses
  const fetchBots = useCallback(async () => {
    try {
      const response = await fetch('/api/institutional-bots/status');
      if (response.ok) {
        const data = await response.json();
        setBots(data.bots || []);
      }
    } catch (err) {
      console.error('Failed to fetch bots:', err);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    // Use RAF to batch initial fetch with other updates
    const rafId = requestAnimationFrame(() => {
      fetchBots();
    });
    const interval = setInterval(fetchBots, 5000);
    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
    };
  }, [fetchBots]);

  // Start bot
  const startBot = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/institutional-bots/${code}/start`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        setError('Failed to start bot');
      }
      fetchBots();
    } catch (err) {
      setError('Service unavailable');
    }
    setLoading(false);
  };

  // Stop bot
  const stopBot = async (code: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/institutional-bots/${code}/stop`, {
        method: 'POST',
      });
      fetchBots();
    } catch (err) {
      setError('Failed to stop bot');
    }
    setLoading(false);
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Running</Badge>;
      case 'STARTING':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Starting</Badge>;
      case 'STOPPED':
        return <Badge variant="secondary"><Square className="h-3 w-3 mr-1" />Stopped</Badge>;
      case 'ERROR':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Get current bot
  const currentBot = bots.find(b => b.code === selectedBot) || BOT_CONFIGS.find(b => b.code === selectedBot);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>Institutional Bots</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={fetchBots}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Professional algorithmic trading strategies
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs value={selectedBot} onValueChange={setSelectedBot}>
          <TabsList className="grid w-full grid-cols-4">
            {BOT_CONFIGS.map((bot) => (
              <TabsTrigger key={bot.code} value={bot.code} className="text-xs">
                <span className={bot.color}>{bot.icon}</span>
                <span className="ml-1 hidden sm:inline">{bot.name}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          
          {BOT_CONFIGS.map((config) => {
            const bot = bots.find(b => b.code === config.code);
            const status = bot?.status?.status || 'STOPPED';
            const stats = bot?.status?.stats || {};
            const signals = bot?.signals || [];
            
            return (
              <TabsContent key={config.code} value={config.code} className="space-y-4">
                {/* Bot Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-semibold text-lg ${config.color}`}>
                      {config.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{config.strategy}</p>
                  </div>
                  {getStatusBadge(status)}
                </div>
                
                {/* Description */}
                <p className="text-sm text-muted-foreground">
                  {config.description}
                </p>
                
                {/* Control Buttons */}
                <div className="flex gap-2">
                  {status !== 'RUNNING' ? (
                    <Button 
                      onClick={() => startBot(config.code)} 
                      disabled={loading}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => stopBot(config.code)} 
                      disabled={loading}
                      variant="destructive"
                    >
                      <Square className="h-4 w-4 mr-2" />
                      Stop
                    </Button>
                  )}
                </div>
                
                {/* Stats Grid */}
                {status === 'RUNNING' && (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-2 rounded bg-muted text-center">
                      <div className="text-xs text-muted-foreground">Trades</div>
                      <div className="font-bold">{stats.totalTrades || 0}</div>
                    </div>
                    <div className="p-2 rounded bg-muted text-center">
                      <div className="text-xs text-muted-foreground">Win Rate</div>
                      <div className="font-bold">
                        {stats.winRate ? `${(stats.winRate * 100).toFixed(1)}%` : 'N/A'}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-muted text-center">
                      <div className="text-xs text-muted-foreground">PnL</div>
                      <div className={`font-bold ${(stats.avgPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {stats.avgPnL?.toFixed(2) || '0.00'}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-muted text-center">
                      <div className="text-xs text-muted-foreground">Sharpe</div>
                      <div className="font-bold">{stats.sharpeRatio?.toFixed(2) || 'N/A'}</div>
                    </div>
                  </div>
                )}
                
                {/* Recent Signals */}
                {signals.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Recent Signals</div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {signals.slice(0, 5).map((signal) => (
                        <div 
                          key={signal.id}
                          className="flex items-center justify-between p-2 rounded bg-muted text-sm"
                        >
                          <div className="flex items-center gap-2">
                            {signal.direction === 'LONG' ? (
                              <TrendingUp className="h-4 w-4 text-green-500" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                            <span className="font-medium">{signal.symbol}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {signal.direction}
                            </Badge>
                            <span className="text-muted-foreground">
                              {(signal.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
        
        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 rounded bg-destructive/10 text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default InstitutionalPanel;
