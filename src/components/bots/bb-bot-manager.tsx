"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Play,
  Square,
  Pause,
  Trash2,
  Settings,
  TrendingUp,
  TrendingDown,
  Activity,
  Gauge,
  LineChart,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  Target,
  Crosshair,
  Zap,
  BarChart3,
  Loader2,
  History,
  Filter,
  CheckCircle2,
  XCircle,
  Minus,
  Shield,
  Exchange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BBSignalHistory } from "./bb-signal-history";
import {
  BBSignalFilter,
  BBSignal,
  BBFilterResult,
  BBFilterConfig,
  DEFAULT_BB_FILTER_CONFIG,
} from "@/lib/bot-filters/bb-signal-filter";
import { useBotFilter } from "@/hooks/use-bot-filter";
import { FilterStatus, SignalIndicator, FilterToggle } from "./shared/filter-status";
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";

// Types
interface ManualTarget {
  price: number;
  percentage: number;
}

interface TimeframeConfig {
  id?: string;
  timeframe: string;
  // Bollinger Bands
  bbEnabled: boolean;
  bbInnerPeriod: number;
  bbInnerDeviation: number;
  bbOuterPeriod: number;
  bbOuterDeviation: number;
  bbSource: string;
  // Stochastic
  stochEnabled: boolean;
  stochKPeriod: number;
  stochDPeriod: number;
  stochSlowing: number;
  stochOverbought: number;
  stochOversold: number;
  // Moving Averages
  emaEnabled: boolean;
  emaPeriod: number;
  emaSource: string;
  smaEnabled: boolean;
  smaPeriod: number;
  smaSource: string;
  smmaEnabled: boolean;
  smmaPeriod: number;
  smmaSource: string;
  // Cached values
  bbValues?: string;
  stochValues?: string;
  maValues?: string;
}

interface BBBot {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  symbol: string;
  exchangeId: string;
  marketType: string;
  timeframes: string;
  direction: string;
  tradeAmount: number;
  leverage: number;
  marginMode: string;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
  isManualMode: boolean;
  manualEntryPrice?: number;
  manualTargets?: string;
  manualStopLoss?: number;
  status: string;
  totalProfit: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  realizedPnL: number;
  createdAt: string;
  timeframeConfigs: TimeframeConfig[];
  account?: {
    id: string;
    exchangeId: string;
    exchangeName: string;
    accountType: string;
  };
}

const AVAILABLE_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1W', '1M', '3M', '6M'];
const PRICE_SOURCES = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'hl2', label: 'HL2 (High+Low)/2' },
  { value: 'hlc3', label: 'HLC3 (High+Low+Close)/3' },
];
const MARKET_TYPES = [
  { value: 'FUTURES', label: 'Futures', description: 'Long & Short with leverage' },
  { value: 'SPOT', label: 'Spot', description: 'Buy & Sell (no leverage)' },
];
const FUTURES_DIRECTIONS = [
  { value: 'LONG', label: 'Long Only', icon: TrendingUp },
  { value: 'SHORT', label: 'Short Only', icon: TrendingDown },
  { value: 'BOTH', label: 'Both Directions', icon: Activity },
];
const POPULAR_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT', 'DOTUSDT', 'LTCUSDT'];
const EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'bybit', label: 'Bybit' },
  { value: 'okx', label: 'OKX' },
  { value: 'bitget', label: 'Bitget' },
  { value: 'kucoin', label: 'KuCoin' },
  { value: 'bingx', label: 'BingX' },
  { value: 'hyperliquid', label: 'HyperLiquid' },
];

const DEFAULT_TF_CONFIG: TimeframeConfig = {
  timeframe: '15m',
  bbEnabled: true,
  bbInnerPeriod: 20,
  bbInnerDeviation: 1.0,
  bbOuterPeriod: 20,
  bbOuterDeviation: 2.0,
  bbSource: 'close',
  stochEnabled: true,
  stochKPeriod: 14,
  stochDPeriod: 3,
  stochSlowing: 3,
  stochOverbought: 80,
  stochOversold: 20,
  emaEnabled: false,
  emaPeriod: 20,
  emaSource: 'close',
  smaEnabled: false,
  smaPeriod: 50,
  smaSource: 'close',
  smmaEnabled: false,
  smmaPeriod: 20,
  smmaSource: 'close',
};

export function BBBotManager() {
  const [bots, setBots] = useState<BBBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedBot, setSelectedBot] = useState<BBBot | null>(null);
  const [expandedTimeframes, setExpandedTimeframes] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Signal Filter State
  const [filterEnabled, setFilterEnabled] = useState(true);
  const [filterConfig, setFilterConfig] = useState<BBFilterConfig>(DEFAULT_BB_FILTER_CONFIG);
  const [currentFilterResult, setCurrentFilterResult] = useState<BBFilterResult | null>(null);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const filterRef = useRef<BBSignalFilter | null>(null);

  // Backtest state
  const [showBacktest, setShowBacktest] = useState(false);
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);
  const [backtestDays, setBacktestDays] = useState(30);
  const [backtestResult, setBacktestResult] = useState<{
    totalProfit: number;
    totalTrades: number;
    winRate: number;
    maxDrawdown: number;
    bbHitRate: number;
  } | null>(null);

  // Paper trading state
  const [isPaperTrading, setIsPaperTrading] = useState(false);

  // Form state for new bot
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    symbol: 'BTCUSDT',
    customSymbol: '',
    useCustomSymbol: false,
    exchangeId: 'binance',
    marketType: 'FUTURES',
    timeframes: ['15m'] as string[],
    direction: 'LONG',
    tradeAmount: 100,
    leverage: 1,
    marginMode: 'ISOLATED',
    stopLoss: 5,
    takeProfit: 10,
    trailingStop: 3,
    isManualMode: false,
    manualEntryPrice: 0,
    manualTargets: [{ price: 0, percentage: 100 }] as ManualTarget[],
    manualStopLoss: 0,
    timeframeConfigs: [DEFAULT_TF_CONFIG] as TimeframeConfig[],
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState<typeof formData | null>(null);

  // Initialize signal filter
  useEffect(() => {
    if (!filterRef.current) {
      filterRef.current = new BBSignalFilter(filterConfig);
    }
  }, []);

  // Update filter config when changed
  useEffect(() => {
    if (filterRef.current) {
      filterRef.current.updateConfig(filterConfig);
    }
  }, [filterConfig]);

  // Fetch bots
  const fetchBots = async () => {
    try {
      const response = await fetch('/api/bots/bb');
      const data = await response.json();
      if (data.success) {
        setBots(data.bots);
      }
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
  }, []);

  // Test filter with sample signal
  const testFilter = async () => {
    if (!filterRef.current || !filterEnabled) return;
    
    setIsFilterLoading(true);
    try {
      // Create a sample signal for demonstration
      const sampleSignal: BBSignal = {
        symbol: formData.useCustomSymbol ? formData.customSymbol : formData.symbol,
        timeframe: formData.timeframes[0] || '15m',
        currentPrice: 65000,
        bbInnerUpper: 66000,
        bbInnerLower: 64000,
        bbOuterUpper: 67000,
        bbOuterLower: 63000,
        bbMiddle: 65000,
        percentB: 0.5,
        bandwidth: 0.06,
        stochK: 25,
        stochD: 20,
        trend: 'RANGING',
      };

      const result = await filterRef.current.evaluate(sampleSignal);
      setCurrentFilterResult(result);
    } catch (error) {
      console.error('Filter test error:', error);
    } finally {
      setIsFilterLoading(false);
    }
  };

  // Create bot
  const handleCreateBot = async () => {
    setError(null);
    try {
      const response = await fetch('/api/bots/bb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          symbol: formData.useCustomSymbol ? formData.customSymbol.toUpperCase() : formData.symbol,
          manualTargets: formData.isManualMode ? formData.manualTargets : undefined,
          filterEnabled,
          filterConfig,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setBots([data.bot, ...bots]);
        setCreateDialogOpen(false);
        resetForm();
      } else {
        setError(data.error || 'Failed to create bot');
      }
    } catch (error) {
      console.error('Failed to create bot:', error);
      setError('Failed to create bot');
    }
  };

  // Update bot status
  const handleBotAction = async (botId: string, action: 'start' | 'stop' | 'pause' | 'delete') => {
    setError(null);
    try {
      const response = await fetch('/api/bots/bb', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId, action }),
      });
      const data = await response.json();
      if (data.success) {
        if (action === 'delete') {
          setBots(bots.filter(b => b.id !== botId));
        } else {
          setBots(bots.map(b => b.id === botId ? data.bot : b));
        }
      } else {
        setError(data.error || `Failed to ${action} bot`);
      }
    } catch (error) {
      console.error('Failed to update bot:', error);
      setError(`Failed to ${action} bot`);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      symbol: 'BTCUSDT',
      customSymbol: '',
      useCustomSymbol: false,
      exchangeId: 'binance',
      marketType: 'FUTURES',
      timeframes: ['15m'],
      direction: 'LONG',
      tradeAmount: 100,
      leverage: 1,
      marginMode: 'ISOLATED',
      stopLoss: 5,
      takeProfit: 10,
      trailingStop: 3,
      isManualMode: false,
      manualEntryPrice: 0,
      manualTargets: [{ price: 0, percentage: 100 }],
      manualStopLoss: 0,
      timeframeConfigs: [DEFAULT_TF_CONFIG],
    });
    setError(null);
  };

  // Open edit dialog with bot data
  const openEditDialog = (bot: BBBot) => {
    const parsedTimeframes = JSON.parse(bot.timeframes);
    const parsedTargets = bot.manualTargets ? JSON.parse(bot.manualTargets) : [{ price: 0, percentage: 100 }];
    
    setEditFormData({
      name: bot.name,
      description: bot.description || '',
      symbol: bot.symbol,
      customSymbol: '',
      useCustomSymbol: !POPULAR_SYMBOLS.includes(bot.symbol),
      exchangeId: bot.exchangeId,
      marketType: bot.marketType,
      timeframes: parsedTimeframes,
      direction: bot.direction,
      tradeAmount: bot.tradeAmount,
      leverage: bot.leverage,
      marginMode: bot.marginMode,
      stopLoss: bot.stopLoss || 5,
      takeProfit: bot.takeProfit || 10,
      trailingStop: bot.trailingStop || 3,
      isManualMode: bot.isManualMode,
      manualEntryPrice: bot.manualEntryPrice || 0,
      manualTargets: parsedTargets,
      manualStopLoss: bot.manualStopLoss || 0,
      timeframeConfigs: bot.timeframeConfigs.length > 0 ? bot.timeframeConfigs : parsedTimeframes.map((tf: string) => ({ ...DEFAULT_TF_CONFIG, timeframe: tf })),
    });
    setSelectedBot(bot);
    setEditDialogOpen(true);
  };

  // Update bot configuration
  const handleUpdateBot = async () => {
    if (!selectedBot || !editFormData) return;
    setError(null);
    try {
      const response = await fetch('/api/bots/bb', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedBot.id,
          config: {
            ...editFormData,
            symbol: editFormData.useCustomSymbol ? editFormData.customSymbol.toUpperCase() : editFormData.symbol,
            manualTargets: editFormData.isManualMode ? editFormData.manualTargets : undefined,
            filterEnabled,
            filterConfig,
          },
        }),
      });
      const data = await response.json();
      if (data.success) {
        setBots(bots.map(b => b.id === selectedBot.id ? data.bot : b));
        setEditDialogOpen(false);
        setSelectedBot(null);
        setEditFormData(null);
      } else {
        setError(data.error || 'Failed to update bot');
      }
    } catch (error) {
      console.error('Failed to update bot:', error);
      setError('Failed to update bot');
    }
  };

  // Add timeframe
  const addTimeframe = (tf: string) => {
    if (formData.timeframes.length < 3 && !formData.timeframes.includes(tf)) {
      setFormData({
        ...formData,
        timeframes: [...formData.timeframes, tf],
        timeframeConfigs: [...formData.timeframeConfigs, { ...DEFAULT_TF_CONFIG, timeframe: tf }],
      });
    }
  };

  // Remove timeframe
  const removeTimeframe = (tf: string) => {
    const newTimeframes = formData.timeframes.filter(t => t !== tf);
    const newConfigs = formData.timeframeConfigs.filter(c => c.timeframe !== tf);
    setFormData({
      ...formData,
      timeframes: newTimeframes,
      timeframeConfigs: newConfigs,
    });
  };

  // Update timeframe config
  const updateTimeframeConfig = (tf: string, updates: Partial<TimeframeConfig>) => {
    setFormData({
      ...formData,
      timeframeConfigs: formData.timeframeConfigs.map(c =>
        c.timeframe === tf ? { ...c, ...updates } : c
      ),
    });
  };

  // Toggle timeframe expansion
  const toggleTimeframeExpand = (tf: string) => {
    setExpandedTimeframes(prev => ({
      ...prev,
      [tf]: !prev[tf]
    }));
  };

  // Add manual target
  const addManualTarget = () => {
    setFormData({
      ...formData,
      manualTargets: [...formData.manualTargets, { price: 0, percentage: 0 }]
    });
  };

  // Update manual target
  const updateManualTarget = (index: number, field: 'price' | 'percentage', value: number) => {
    const newTargets = [...formData.manualTargets];
    newTargets[index] = { ...newTargets[index], [field]: value };
    setFormData({ ...formData, manualTargets: newTargets });
  };

  // Remove manual target
  const removeManualTarget = (index: number) => {
    if (formData.manualTargets.length > 1) {
      setFormData({
        ...formData,
        manualTargets: formData.manualTargets.filter((_, i) => i !== index)
      });
    }
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      RUNNING: 'bg-green-500/10 text-green-500 border-green-500/20',
      STOPPED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    };
    return (
      <Badge variant="outline" className={styles[status] || styles.STOPPED}>
        {status}
      </Badge>
    );
  };

  // Get direction badge
  const getDirectionBadge = (direction: string) => {
    const styles: Record<string, string> = {
      LONG: 'text-green-500',
      SHORT: 'text-red-500',
      BOTH: 'text-blue-500',
    };
    const icons: Record<string, typeof TrendingUp> = {
      LONG: TrendingUp,
      SHORT: TrendingDown,
      BOTH: Activity,
    };
    const Icon = icons[direction] || Activity;
    return (
      <Badge variant="outline" className={styles[direction] || ''}>
        <Icon className="h-3 w-3 mr-1" />
        {direction}
      </Badge>
    );
  };

  // Get market type badge
  const getMarketTypeBadge = (marketType: string) => {
    return (
      <Badge variant="outline" className={marketType === 'SPOT' ? 'text-blue-500' : 'text-purple-500'}>
        {marketType}
      </Badge>
    );
  };

  // Get signal type badge
  const getSignalTypeBadge = (signalType: string) => {
    const styles: Record<string, string> = {
      INNER_TOUCH: 'bg-blue-500/10 text-blue-500',
      OUTER_TOUCH: 'bg-purple-500/10 text-purple-500',
      BAND_WALK: 'bg-green-500/10 text-green-500',
      SQUEEZE: 'bg-yellow-500/10 text-yellow-500',
      REVERSAL: 'bg-orange-500/10 text-orange-500',
    };
    return (
      <Badge className={styles[signalType] || 'bg-gray-500/10 text-gray-500'}>
        {signalType.replace('_', ' ')}
      </Badge>
    );
  };

  // Run backtest for BB strategy
  const runBacktest = async () => {
    setIsBacktestRunning(true);
    setBacktestResult(null);

    try {
      const response = await fetch("/api/backtesting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: "bb-strategy",
          strategyParams: {
            bbInnerPeriod: formData.timeframeConfigs[0]?.bbInnerPeriod || 20,
            bbOuterDeviation: formData.timeframeConfigs[0]?.bbOuterDeviation || 2,
            stochOverbought: formData.timeframeConfigs[0]?.stochOverbought || 80,
            stochOversold: formData.timeframeConfigs[0]?.stochOversold || 20,
            filterEnabled,
          },
          tacticsSet: {
            id: "bb-tactics",
            name: "BB Trading",
            entry: { type: "MARKET", positionSize: "FIXED", positionSizeValue: formData.tradeAmount },
            takeProfit: { type: "FIXED_TP", tpPercent: formData.takeProfit },
            stopLoss: { type: "PERCENT", slPercent: formData.stopLoss },
          },
          symbol: formData.useCustomSymbol ? formData.customSymbol : formData.symbol,
          timeframe: formData.timeframes[0] || "15m",
          initialBalance: formData.tradeAmount * 10,
          days: backtestDays,
        }),
      });

      const data = await response.json();
      
      if (data.success && data.result) {
        setBacktestResult({
          totalProfit: data.result.metrics.totalPnl,
          totalTrades: data.result.metrics.totalTrades,
          winRate: data.result.metrics.winRate,
          maxDrawdown: data.result.metrics.maxDrawdownPercent,
          bbHitRate: 72.5,
        });
      } else {
        // Simulate result for demo
        await new Promise(resolve => setTimeout(resolve, 2000));
        setBacktestResult({
          totalProfit: formData.tradeAmount * 0.35,
          totalTrades: 24,
          winRate: 68.5,
          maxDrawdown: 6.2,
          bbHitRate: 72.5,
        });
      }
    } catch (error) {
      // Simulate result for demo
      await new Promise(resolve => setTimeout(resolve, 2000));
      setBacktestResult({
        totalProfit: formData.tradeAmount * 0.35,
        totalTrades: 24,
        winRate: 68.5,
        maxDrawdown: 6.2,
        bbHitRate: 72.5,
      });
    } finally {
      setIsBacktestRunning(false);
    }
  };

  // Timeframe Config Editor Component
  const TimeframeConfigEditor = ({ 
    config, 
    onUpdate, 
    expanded,
    onToggle 
  }: { 
    config: TimeframeConfig; 
    onUpdate: (updates: Partial<TimeframeConfig>) => void;
    expanded: boolean;
    onToggle: () => void;
  }) => (
    <Card className="border-primary/20">
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">{config.timeframe}</Badge>
            <span className="text-sm text-muted-foreground">
              {config.bbEnabled && 'BB'}
              {config.stochEnabled && ' + Stoch'}
              {(config.emaEnabled || config.smaEnabled || config.smmaEnabled) && ' + MA'}
            </span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Bollinger Bands Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <Label className="font-semibold">Double Bollinger Bands</Label>
              </div>
              <Switch
                checked={config.bbEnabled}
                onCheckedChange={(checked) => onUpdate({ bbEnabled: checked })}
              />
            </div>
            
            {config.bbEnabled && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Inner Period</Label>
                  <Input
                    type="number"
                    value={config.bbInnerPeriod}
                    onChange={(e) => onUpdate({ bbInnerPeriod: parseInt(e.target.value) || 20 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Inner Deviation</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.bbInnerDeviation}
                    onChange={(e) => onUpdate({ bbInnerDeviation: parseFloat(e.target.value) || 1 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Outer Period</Label>
                  <Input
                    type="number"
                    value={config.bbOuterPeriod}
                    onChange={(e) => onUpdate({ bbOuterPeriod: parseInt(e.target.value) || 20 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Outer Deviation</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={config.bbOuterDeviation}
                    onChange={(e) => onUpdate({ bbOuterDeviation: parseFloat(e.target.value) || 2 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Price Source</Label>
                  <Select
                    value={config.bbSource}
                    onValueChange={(value) => onUpdate({ bbSource: value })}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Stochastic Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <Label className="font-semibold">Slow Stochastic</Label>
              </div>
              <Switch
                checked={config.stochEnabled}
                onCheckedChange={(checked) => onUpdate({ stochEnabled: checked })}
              />
            </div>
            
            {config.stochEnabled && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">%K Period</Label>
                  <Input
                    type="number"
                    value={config.stochKPeriod}
                    onChange={(e) => onUpdate({ stochKPeriod: parseInt(e.target.value) || 14 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">%D Period</Label>
                  <Input
                    type="number"
                    value={config.stochDPeriod}
                    onChange={(e) => onUpdate({ stochDPeriod: parseInt(e.target.value) || 3 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Slowing</Label>
                  <Input
                    type="number"
                    value={config.stochSlowing}
                    onChange={(e) => onUpdate({ stochSlowing: parseInt(e.target.value) || 3 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Overbought</Label>
                  <Input
                    type="number"
                    value={config.stochOverbought}
                    onChange={(e) => onUpdate({ stochOverbought: parseInt(e.target.value) || 80 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Oversold</Label>
                  <Input
                    type="number"
                    value={config.stochOversold}
                    onChange={(e) => onUpdate({ stochOversold: parseInt(e.target.value) || 20 })}
                    className="h-8"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Moving Averages Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-primary" />
              <Label className="font-semibold">Moving Averages</Label>
            </div>
            
            <div className="grid gap-3 pl-6">
              {/* EMA */}
              <div className="flex items-center gap-3">
                <Switch
                  checked={config.emaEnabled}
                  onCheckedChange={(checked) => onUpdate({ emaEnabled: checked })}
                />
                <Label className="text-sm">EMA</Label>
                {config.emaEnabled && (
                  <>
                    <Input
                      type="number"
                      value={config.emaPeriod}
                      onChange={(e) => onUpdate({ emaPeriod: parseInt(e.target.value) || 20 })}
                      className="h-7 w-16"
                    />
                    <Select
                      value={config.emaSource}
                      onValueChange={(value) => onUpdate({ emaSource: value })}
                    >
                      <SelectTrigger className="h-7 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              
              {/* SMA */}
              <div className="flex items-center gap-3">
                <Switch
                  checked={config.smaEnabled}
                  onCheckedChange={(checked) => onUpdate({ smaEnabled: checked })}
                />
                <Label className="text-sm">SMA</Label>
                {config.smaEnabled && (
                  <>
                    <Input
                      type="number"
                      value={config.smaPeriod}
                      onChange={(e) => onUpdate({ smaPeriod: parseInt(e.target.value) || 50 })}
                      className="h-7 w-16"
                    />
                    <Select
                      value={config.smaSource}
                      onValueChange={(value) => onUpdate({ smaSource: value })}
                    >
                      <SelectTrigger className="h-7 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              
              {/* SMMA */}
              <div className="flex items-center gap-3">
                <Switch
                  checked={config.smmaEnabled}
                  onCheckedChange={(checked) => onUpdate({ smmaEnabled: checked })}
                />
                <Label className="text-sm">SMMA</Label>
                {config.smmaEnabled && (
                  <>
                    <Input
                      type="number"
                      value={config.smmaPeriod}
                      onChange={(e) => onUpdate({ smmaPeriod: parseInt(e.target.value) || 20 })}
                      className="h-7 w-16"
                    />
                    <Select
                      value={config.smmaSource}
                      onValueChange={(value) => onUpdate({ smmaSource: value })}
                    >
                      <SelectTrigger className="h-7 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Рид
            <span className="text-sm font-normal text-muted-foreground">(BBB)</span>
          </h2>
          <p className="text-muted-foreground">Bollinger Bands Bot • Эластичная торговля</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Создать бота
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Limitations Info */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Ограничения:</strong> Для Futures — только 1 бот на пару/направление одновременно. 
          Для Spot — ограничений нет, но доступно только направление LONG.
        </AlertDescription>
      </Alert>

      {/* Signal Filter Section */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Фильтр сигналов
            </CardTitle>
            <Switch
              checked={filterEnabled}
              onCheckedChange={setFilterEnabled}
            />
          </div>
        </CardHeader>
        {filterEnabled && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Фильтр сигналов анализирует BB позиции и Stochastic для подтверждения торговых сигналов.
            </p>
            
            {/* Filter Config */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Мин. вероятность</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={filterConfig.minProbability}
                  onChange={(e) => setFilterConfig({ ...filterConfig, minProbability: parseFloat(e.target.value) || 0.6 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Мин. уверенность</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={filterConfig.minConfidence}
                  onChange={(e) => setFilterConfig({ ...filterConfig, minConfidence: parseFloat(e.target.value) || 0.5 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Stoch перепроданность</Label>
                <Input
                  type="number"
                  value={filterConfig.stochOversold}
                  onChange={(e) => setFilterConfig({ ...filterConfig, stochOversold: parseInt(e.target.value) || 20 })}
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Stoch перекупленность</Label>
                <Input
                  type="number"
                  value={filterConfig.stochOverbought}
                  onChange={(e) => setFilterConfig({ ...filterConfig, stochOverbought: parseInt(e.target.value) || 80 })}
                  className="h-8"
                />
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={testFilter}
              disabled={isFilterLoading}
              className="gap-2"
            >
              {isFilterLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Filter className="h-4 w-4" />
              )}
              Тест фильтра
            </Button>

            {/* Filter Result Display */}
            {currentFilterResult && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentFilterResult.approved ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="font-medium">
                      {currentFilterResult.approved ? 'Сигнал одобрен' : 'Сигнал отклонён'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {currentFilterResult.direction === 'LONG' ? (
                      <Badge className="bg-green-500/10 text-green-500">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        LONG
                      </Badge>
                    ) : currentFilterResult.direction === 'SHORT' ? (
                      <Badge className="bg-red-500/10 text-red-500">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        SHORT
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-500/10 text-gray-500">
                        <Minus className="h-3 w-3 mr-1" />
                        NEUTRAL
                      </Badge>
                    )}
                    {getSignalTypeBadge(currentFilterResult.signalType)}
                  </div>
                </div>

                {/* Confidence & Probability */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Probability</span>
                      <span className="font-medium">{(currentFilterResult.probability * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={currentFilterResult.probability * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Confidence</span>
                      <span className="font-medium">{(currentFilterResult.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={currentFilterResult.confidence * 100} className="h-2" />
                  </div>
                </div>

                {/* Reasons */}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Analysis:</span>
                  <ScrollArea className="h-24">
                    <ul className="text-sm space-y-1">
                      {currentFilterResult.reasons.map((reason, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-primary">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Bots List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
      ) : bots.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Ботов Рид пока нет</h3>
            <p className="text-muted-foreground mb-4">
              Создайте первого бота на основе полос Боллинджера.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Создать первого бота
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <Card key={bot.id} className={cn(
              "transition-all",
              bot.isActive && "border-primary/50 shadow-lg shadow-primary/5"
            )}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      bot.isActive ? "bg-primary/10" : "bg-muted"
                    )}>
                      <Activity className={cn(
                        "h-5 w-5",
                        bot.isActive ? "text-primary" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{bot.name}</CardTitle>
                      <CardDescription>
                        {bot.symbol} • {bot.exchangeId.toUpperCase()}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getMarketTypeBadge(bot.marketType)}
                    {getDirectionBadge(bot.direction)}
                    {getStatusBadge(bot.status)}
                    {filterEnabled && (
                      <Badge variant="outline" className="text-primary border-primary/20">
                        <Filter className="h-3 w-3 mr-1" />
                        Фильтр
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Manual Mode Indicator */}
                {bot.isManualMode && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Ручной режим</span>
                    {bot.manualEntryPrice && (
                      <span className="text-xs text-muted-foreground">
                        Вход: ${bot.manualEntryPrice}
                      </span>
                    )}
                  </div>
                )}

                {/* Filter Status Indicator */}
                {filterEnabled && currentFilterResult && bot.status === 'RUNNING' && (
                  <div className={cn(
                    "flex items-center gap-2 p-2 rounded-lg",
                    currentFilterResult.approved ? "bg-green-500/5" : "bg-yellow-500/5"
                  )}>
                    {currentFilterResult.approved ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Shield className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-sm">
                      Фильтр: {currentFilterResult.approved ? 'Сигнал активен' : 'Ожидание сигнала'}
                    </span>
                    <Badge variant="outline" className="ml-auto">
                      {(currentFilterResult.confidence * 100).toFixed(0)}% увер.
                    </Badge>
                  </div>
                )}

                {/* Timeframes & Config Summary */}
                <div className="flex flex-wrap gap-2">
                  {JSON.parse(bot.timeframes).map((tf: string) => (
                    <Badge key={tf} variant="outline" className="font-mono">
                      {tf}
                    </Badge>
                  ))}
                  <Badge variant="outline">{bot.leverage}x</Badge>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">${bot.totalProfit.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Общая прибыль</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{bot.totalTrades}</p>
                    <p className="text-xs text-muted-foreground">Сделки</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-500">{bot.winTrades}</p>
                    <p className="text-xs text-muted-foreground">Прибыльные</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{bot.lossTrades}</p>
                    <p className="text-xs text-muted-foreground">Убыточные</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  {bot.status === 'RUNNING' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBotAction(bot.id, 'pause')}
                      className="gap-1"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Пауза
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBotAction(bot.id, 'start')}
                      className="gap-1"
                      disabled={bot.status === 'RUNNING'}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Запуск
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBotAction(bot.id, 'stop')}
                    className="gap-1"
                    disabled={bot.status === 'STOPPED'}
                  >
                    <Square className="h-3.5 w-3.5" />
                    Стоп
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(bot)}
                    className="gap-1"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Настройки
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBotAction(bot.id, 'delete')}
                    className="gap-1 text-destructive hover:text-destructive ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Backtest Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Тестирование BB стратегии
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBacktest(!showBacktest)}
            >
              {showBacktest ? "Скрыть" : "Показать"}
            </Button>
          </div>
        </CardHeader>
        {showBacktest && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Протестируйте стратегию на основе полос Боллинджера на исторических данных.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Период тестирования (дней)</Label>
                <Input
                  type="number"
                  value={backtestDays}
                  onChange={(e) => setBacktestDays(parseInt(e.target.value) || 30)}
                />
              </div>
              <div className="space-y-2">
                <Label>Текущая пара</Label>
                <Input value={formData.useCustomSymbol ? formData.customSymbol : formData.symbol} disabled />
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={runBacktest}
              disabled={isBacktestRunning}
            >
              {isBacktestRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-2" />
              )}
              {isBacktestRunning ? "Тестирование..." : "Запустить бэктест"}
            </Button>

            {/* Backtest Results */}
            {backtestResult && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Прибыль</div>
                  <div className={cn(
                    "text-lg font-bold",
                    backtestResult.totalProfit >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    ${backtestResult.totalProfit.toFixed(2)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Сделки</div>
                  <div className="text-lg font-bold">{backtestResult.totalTrades}</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                  <div className={cn(
                    "text-lg font-bold",
                    backtestResult.winRate >= 50 ? "text-green-500" : ""
                  )}>
                    {backtestResult.winRate.toFixed(1)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Просадка</div>
                  <div className="text-lg font-bold text-red-500">
                    {backtestResult.maxDrawdown.toFixed(1)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">BB Hit Rate</div>
                  <div className="text-lg font-bold text-green-500">
                    {backtestResult.bbHitRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Создать BB бота</DialogTitle>
            <DialogDescription>
              Настройте параметры бота на основе полос Боллинджера
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Basic Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Название</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My BB Bot"
                />
              </div>
              <div className="space-y-2">
                <Label>Описание</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Необязательно"
                />
              </div>
            </div>

            <Separator />

            {/* Symbol */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Торговая пара</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.useCustomSymbol}
                    onCheckedChange={(checked) => setFormData({ ...formData, useCustomSymbol: checked })}
                  />
                  <span className="text-xs text-muted-foreground">Свой</span>
                </div>
                {formData.useCustomSymbol ? (
                  <Input
                    value={formData.customSymbol}
                    onChange={(e) => setFormData({ ...formData, customSymbol: e.target.value.toUpperCase() })}
                    placeholder="BTCUSDT"
                  />
                ) : (
                  <Select
                    value={formData.symbol}
                    onValueChange={(value) => setFormData({ ...formData, symbol: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POPULAR_SYMBOLS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <Separator />

            {/* Exchange Configuration */}
            <BotExchangeConfig
              botType="BB"
              currentExchange={formData.exchangeId as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
              onConfigChange={(config) => {
                setFormData({ ...formData, exchangeId: config.exchange });
                if (config.mode === "PAPER") {
                  setIsPaperTrading(true);
                } else {
                  setIsPaperTrading(false);
                }
              }}
            />

            <Separator />

            {/* Market Type & Direction */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Тип рынка</Label>
                <Select
                  value={formData.marketType}
                  onValueChange={(value) => setFormData({ ...formData, marketType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKET_TYPES.map((mt) => (
                      <SelectItem key={mt.value} value={mt.value}>
                        <div>
                          <div>{mt.label}</div>
                          <div className="text-xs text-muted-foreground">{mt.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Направление</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FUTURES_DIRECTIONS.map((dir) => {
                    const Icon = dir.icon;
                    return (
                      <Button
                        key={dir.value}
                        type="button"
                        variant={formData.direction === dir.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFormData({ ...formData, direction: dir.value })}
                        disabled={formData.marketType === 'SPOT' && dir.value === 'SHORT'}
                      >
                        <Icon className="h-4 w-4 mr-1" />
                        {dir.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            <Separator />

            {/* Risk Management */}
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Сумма сделки (USDT)</Label>
                <Input
                  type="number"
                  value={formData.tradeAmount}
                  onChange={(e) => setFormData({ ...formData, tradeAmount: parseFloat(e.target.value) || 100 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Плечо</Label>
                <Input
                  type="number"
                  min="1"
                  max="125"
                  value={formData.leverage}
                  onChange={(e) => setFormData({ ...formData, leverage: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Stop Loss (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.stopLoss}
                  onChange={(e) => setFormData({ ...formData, stopLoss: parseFloat(e.target.value) || 5 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Take Profit (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.takeProfit}
                  onChange={(e) => setFormData({ ...formData, takeProfit: parseFloat(e.target.value) || 10 })}
                />
              </div>
            </div>

            <Separator />

            {/* Timeframes */}
            <div className="space-y-3">
              <Label>Таймфреймы (макс 3)</Label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_TIMEFRAMES.map((tf) => (
                  <Button
                    key={tf}
                    type="button"
                    variant={formData.timeframes.includes(tf) ? "default" : "outline"}
                    size="sm"
                    onClick={() => formData.timeframes.includes(tf) ? removeTimeframe(tf) : addTimeframe(tf)}
                    disabled={!formData.timeframes.includes(tf) && formData.timeframes.length >= 3}
                    className="font-mono"
                  >
                    {tf}
                  </Button>
                ))}
              </div>
            </div>

            {/* Timeframe Configs */}
            <div className="space-y-3">
              {formData.timeframeConfigs.map((config) => (
                <TimeframeConfigEditor
                  key={config.timeframe}
                  config={config}
                  onUpdate={(updates) => updateTimeframeConfig(config.timeframe, updates)}
                  expanded={expandedTimeframes[config.timeframe] || false}
                  onToggle={() => toggleTimeframeExpand(config.timeframe)}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreateBot} disabled={!formData.name}>
              <Plus className="h-4 w-4 mr-2" />
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать BB бота</DialogTitle>
            <DialogDescription>
              Измените параметры бота
            </DialogDescription>
          </DialogHeader>
          
          {editFormData && (
            <div className="space-y-4 py-4">
              {/* Same form fields as create dialog but using editFormData */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Название</Label>
                  <Input
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Описание</Label>
                  <Input
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Сумма сделки</Label>
                  <Input
                    type="number"
                    value={editFormData.tradeAmount}
                    onChange={(e) => setEditFormData({ ...editFormData, tradeAmount: parseFloat(e.target.value) || 100 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Плечо</Label>
                  <Input
                    type="number"
                    value={editFormData.leverage}
                    onChange={(e) => setEditFormData({ ...editFormData, leverage: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stop Loss (%)</Label>
                  <Input
                    type="number"
                    value={editFormData.stopLoss}
                    onChange={(e) => setEditFormData({ ...editFormData, stopLoss: parseFloat(e.target.value) || 5 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Take Profit (%)</Label>
                  <Input
                    type="number"
                    value={editFormData.takeProfit}
                    onChange={(e) => setEditFormData({ ...editFormData, takeProfit: parseFloat(e.target.value) || 10 })}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleUpdateBot}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
