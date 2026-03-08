'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  BarChart3,
  DollarSign,
} from 'lucide-react';
import type { BacktestResult } from '@/lib/lumibot/types';

interface BacktestResultsProps {
  result: BacktestResult | null;
  isLoading: boolean;
}

export function BacktestResults({ result, isLoading }: BacktestResultsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Результаты</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Результаты</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
            <p>Запустите бэктест для получения результатов</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isProfitable = result.total_return_pct > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Результаты</CardTitle>
          <Badge
            variant={isProfitable ? 'default' : 'destructive'}
            className={isProfitable ? 'bg-green-500' : ''}
          >
            {isProfitable ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {result.total_return_pct > 0 ? '+' : ''}
            {result.total_return_pct.toFixed(2)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted p-3 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Финальный капитал
            </div>
            <div className="text-xl font-bold">
              ${result.final_value.toLocaleString()}
            </div>
          </div>
          <div className="bg-muted p-3 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              Макс. просадка
            </div>
            <div className="text-xl font-bold text-red-500">
              -{result.max_drawdown.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-muted p-2 rounded text-center">
            <div className="text-xs text-muted-foreground">Sharpe</div>
            <div className="font-bold">{result.sharpe_ratio.toFixed(2)}</div>
          </div>
          <div className="bg-muted p-2 rounded text-center">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className="font-bold">{result.win_rate.toFixed(1)}%</div>
          </div>
          <div className="bg-muted p-2 rounded text-center">
            <div className="text-xs text-muted-foreground">Trades</div>
            <div className="font-bold">{result.total_trades}</div>
          </div>
          <div className="bg-muted p-2 rounded text-center">
            <div className="text-xs text-muted-foreground">W/L</div>
            <div className="font-bold">
              {result.winning_trades}/{result.losing_trades}
            </div>
          </div>
        </div>

        {/* Strategy Info */}
        <div className="text-sm text-muted-foreground border-t pt-3">
          <div className="flex justify-between">
            <span>Стратегия: {result.strategy}</span>
            <span>Символ: {result.symbol}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Начало: {result.start_date}</span>
            <span>Конец: {result.end_date}</span>
          </div>
        </div>

        {/* Signals Preview */}
        {result.signals && result.signals.length > 0 && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <Target className="h-4 w-4" />
              Сигналы ({result.signals.length})
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {result.signals.slice(0, 10).map((signal) => (
                <div
                  key={signal.id}
                  className="flex items-center justify-between text-xs p-2 bg-muted rounded"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={signal.type === 'BUY' ? 'default' : 'secondary'}
                      className={
                        signal.type === 'BUY' ? 'bg-green-500' : 'bg-red-500'
                      }
                    >
                      {signal.type}
                    </Badge>
                    <span>${signal.data?.price?.toFixed(2)}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(signal.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
