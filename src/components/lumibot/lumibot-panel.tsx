'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  Play,
  Square,
  RefreshCw,
  TrendingUp,
  Settings,
  BarChart3,
  Zap,
} from 'lucide-react';

import type {
  ServiceStatus,
  Strategy,
  BacktestResult,
  ActiveStrategy,
} from '@/lib/lumibot/types';
import { PREDEFINED_STRATEGIES, SUPPORTED_TIMEFRAMES } from '@/lib/lumibot/types';

// Sub-components
import { BacktestResults } from './backtest-results';
import { StrategySelector } from './strategy-selector';
import { ActiveStrategiesList } from './active-strategies-list';

export function LumibotPanel() {
  const { toast } = useToast();
  
  // State
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Backtest form state
  const [selectedStrategy, setSelectedStrategy] = useState<string>('rsi_reversal');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/USDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1h');
  const [startDate, setStartDate] = useState<string>('2023-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [initialCash, setInitialCash] = useState<number>(100000);
  const [paperTrading, setPaperTrading] = useState<boolean>(true);
  
  // Backtest results
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  // Fetch service status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/lumibot/status');
      const data = await response.json();
      setServiceStatus(data);
    } catch {
      setServiceStatus({
        service: 'Lumibot Trading Service',
        version: '1.0.0',
        status: 'unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  }, []);

  // Fetch strategies
  const fetchStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/lumibot/strategies');
      const data = await response.json();
      setStrategies(data.strategies || []);
    } catch {
      // Use predefined strategies as fallback
      setStrategies(
        PREDEFINED_STRATEGIES.map(s => ({
          name: s.id,
          class: s.name,
          description: s.description,
        }))
      );
    }
  }, []);

  // Fetch active strategies
  const fetchActiveStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/lumibot/live');
      const data = await response.json();
      setActiveStrategies(data.active_strategies || []);
    } catch {
      setActiveStrategies([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchStrategies();
    fetchActiveStrategies();
  }, [fetchStatus, fetchStrategies, fetchActiveStrategies]);

  // Run backtest
  const runBacktest = async () => {
    setIsBacktesting(true);
    try {
      const response = await fetch('/api/lumibot/backtest?simulate=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: selectedStrategy,
          symbol: selectedSymbol,
          start_date: startDate,
          end_date: endDate,
          initial_cash: initialCash,
          parameters: {},
        }),
      });

      const result = await response.json();
      setBacktestResult(result);

      toast({
        title: 'Бэктест завершён',
        description: `Доходность: ${result.total_return_pct?.toFixed(2)}%`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Ошибка бэктеста',
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    } finally {
      setIsBacktesting(false);
    }
  };

  // Start live trading
  const startLiveTrading = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/lumibot/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: selectedStrategy,
          symbol: selectedSymbol,
          broker: 'ccxt',
          paper_trading: paperTrading,
          parameters: {},
        }),
      });

      const result = await response.json();

      toast({
        title: 'Стратегия запущена',
        description: result.message || `Strategy ${selectedStrategy} started`,
      });

      fetchActiveStrategies();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Ошибка запуска',
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Stop live trading
  const stopLiveTrading = async (strategyId: string) => {
    try {
      await fetch(`/api/lumibot/live?strategy_id=${strategyId}`, {
        method: 'DELETE',
      });

      toast({
        title: 'Стратегия остановлена',
        description: `Strategy ${strategyId} stopped`,
      });

      fetchActiveStrategies();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Ошибка остановки',
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Service Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              <CardTitle className="text-lg">Lumibot Service</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={serviceStatus?.status === 'running' ? 'default' : 'secondary'}
                className={
                  serviceStatus?.status === 'running'
                    ? 'bg-green-500'
                    : serviceStatus?.status === 'unavailable'
                    ? 'bg-red-500'
                    : ''
                }
              >
                {serviceStatus?.status || 'unknown'}
              </Badge>
              <Button variant="ghost" size="icon" onClick={fetchStatus}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardDescription>
            Python-сервис для алгоритмической торговли
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="font-medium">Version:</span>{' '}
              {serviceStatus?.version || '-'}
            </div>
            <div>
              <span className="font-medium">Host:</span> localhost:8001
            </div>
            <div>
              <span className="font-medium">Strategies:</span>{' '}
              {strategies.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="backtest" className="space-y-4">
        <TabsList>
          <TabsTrigger value="backtest" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Бэктестинг
          </TabsTrigger>
          <TabsTrigger value="live" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Live Trading
          </TabsTrigger>
          <TabsTrigger value="strategies" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Стратегии
          </TabsTrigger>
        </TabsList>

        {/* Backtest Tab */}
        <TabsContent value="backtest" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Параметры бэктеста</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Стратегия</Label>
                    <StrategySelector
                      value={selectedStrategy}
                      onChange={setSelectedStrategy}
                      strategies={strategies}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Символ</Label>
                    <Input
                      value={selectedSymbol}
                      onChange={(e) => setSelectedSymbol(e.target.value)}
                      placeholder="BTC/USDT"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Начало</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Конец</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Начальный капитал ($)</Label>
                    <Input
                      type="number"
                      value={initialCash}
                      onChange={(e) => setInitialCash(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Таймфрейм</Label>
                    <Select
                      value={selectedTimeframe}
                      onValueChange={setSelectedTimeframe}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_TIMEFRAMES.map((tf) => (
                          <SelectItem key={tf.id} value={tf.id}>
                            {tf.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <Button
                  className="w-full"
                  onClick={runBacktest}
                  disabled={isBacktesting}
                >
                  {isBacktesting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Выполняется...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Запустить бэктест
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            <BacktestResults result={backtestResult} isLoading={isBacktesting} />
          </div>
        </TabsContent>

        {/* Live Trading Tab */}
        <TabsContent value="live" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Start New Strategy */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Запуск стратегии
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Стратегия</Label>
                    <StrategySelector
                      value={selectedStrategy}
                      onChange={setSelectedStrategy}
                      strategies={strategies}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Символ</Label>
                    <Input
                      value={selectedSymbol}
                      onChange={(e) => setSelectedSymbol(e.target.value)}
                      placeholder="BTC/USDT"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <div className="font-medium">Paper Trading</div>
                    <div className="text-sm text-muted-foreground">
                      Без реальных сделок
                    </div>
                  </div>
                  <Switch
                    checked={paperTrading}
                    onCheckedChange={setPaperTrading}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={startLiveTrading}
                  disabled={isLoading || !paperTrading}
                  variant={paperTrading ? 'default' : 'destructive'}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {paperTrading ? 'Запустить' : '⚠️ Real Trading Disabled'}
                </Button>
              </CardContent>
            </Card>

            {/* Active Strategies */}
            <ActiveStrategiesList
              strategies={activeStrategies}
              onStop={stopLiveTrading}
              onRefresh={fetchActiveStrategies}
            />
          </div>
        </TabsContent>

        {/* Strategies Tab */}
        <TabsContent value="strategies" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PREDEFINED_STRATEGIES.map((strategy) => (
              <Card key={strategy.id} className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setSelectedStrategy(strategy.id)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{strategy.name}</CardTitle>
                    {selectedStrategy === strategy.id && (
                      <Badge variant="default">Selected</Badge>
                    )}
                  </div>
                  <CardDescription>{strategy.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4" />
                      {strategy.category}
                    </div>
                    <div>TF: {strategy.timeframe}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default LumibotPanel;
