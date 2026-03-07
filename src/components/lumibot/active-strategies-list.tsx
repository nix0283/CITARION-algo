'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Play,
  Square,
  RefreshCw,
  Clock,
  Activity,
} from 'lucide-react';
import type { ActiveStrategy } from '@/lib/lumibot/types';

interface ActiveStrategiesListProps {
  strategies: ActiveStrategy[];
  onStop: (strategyId: string) => void;
  onRefresh: () => void;
}

export function ActiveStrategiesList({
  strategies,
  onStop,
  onRefresh,
}: ActiveStrategiesListProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'starting':
        return 'bg-yellow-500';
      case 'paused':
        return 'bg-orange-500';
      case 'stopped':
        return 'bg-gray-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play className="h-3 w-3" />;
      case 'starting':
        return <RefreshCw className="h-3 w-3 animate-spin" />;
      case 'stopped':
        return <Square className="h-3 w-3" />;
      default:
        return <Activity className="h-3 w-3" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Активные стратегии
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {strategies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Нет активных стратегий</p>
            <p className="text-sm">Запустите стратегию для начала торговли</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Стратегия</TableHead>
                <TableHead>Символ</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Запущена</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {strategies.map((strategy, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    {strategy.strategy}
                  </TableCell>
                  <TableCell>{strategy.symbol}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`${getStatusColor(strategy.status)} text-white`}
                    >
                      {getStatusIcon(strategy.status)}
                      <span className="ml-1">{strategy.status}</span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(strategy.started_at).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onStop(strategy.strategy)}
                      disabled={strategy.status === 'stopped'}
                    >
                      <Square className="h-4 w-4 mr-1" />
                      Стоп
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
