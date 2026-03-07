"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  TrendingUp,
  TrendingDown,
  XCircle,
  CalendarIcon,
  Download,
  Filter,
  RefreshCw,
  Activity,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// Types
interface BBSignal {
  id: string;
  bbBotId: string;
  symbol: string;
  timeframe: string;
  type: 'LONG' | 'SHORT' | 'CLOSE';
  price: number;
  timestamp: string;
  bbUpper: number;
  bbLower: number;
  bbMiddle: number;
  stochK: number;
  stochD: number;
  reason?: string;
  executed: boolean;
  positionId?: string;
  createdAt: string;
}

interface BBSignalHistoryProps {
  botId?: string;
  showBotFilter?: boolean;
}

const SIGNAL_TYPES = [
  { value: 'ALL', label: 'All Types' },
  { value: 'LONG', label: 'Long', icon: TrendingUp, color: 'text-green-500' },
  { value: 'SHORT', label: 'Short', icon: TrendingDown, color: 'text-red-500' },
  { value: 'CLOSE', label: 'Close', icon: XCircle, color: 'text-blue-500' },
];

const TIMEFRAMES = [
  { value: 'ALL', label: 'All Timeframes' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' },
];

export function BBSignalHistory({ botId, showBotFilter = false }: BBSignalHistoryProps) {
  const [signals, setSignals] = useState<BBSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [timeframeFilter, setTimeframeFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  // Fetch signals
  const fetchSignals = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (botId) params.append('botId', botId);
      if (typeFilter !== 'ALL') params.append('type', typeFilter);
      if (timeframeFilter !== 'ALL') params.append('timeframe', timeframeFilter);
      if (dateFrom) params.append('dateFrom', dateFrom.toISOString());
      if (dateTo) params.append('dateTo', dateTo.toISOString());

      const response = await fetch(`/api/bots/bb/signals?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setSignals(data.signals);
      } else {
        setError(data.error || 'Failed to fetch signals');
      }
    } catch (err) {
      console.error('Failed to fetch signals:', err);
      setError('Failed to fetch signals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
  }, [botId, typeFilter, timeframeFilter, dateFrom, dateTo]);

  // Filtered signals (client-side additional filtering if needed)
  const filteredSignals = useMemo(() => {
    return signals;
  }, [signals]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      'ID',
      'Symbol',
      'Type',
      'Timeframe',
      'Price',
      'Timestamp',
      'BB Upper',
      'BB Lower',
      'BB Middle',
      'Stoch K',
      'Stoch D',
      'Reason',
      'Executed',
      'Position ID',
    ];

    const rows = filteredSignals.map(signal => [
      signal.id,
      signal.symbol,
      signal.type,
      signal.timeframe,
      signal.price.toString(),
      format(new Date(signal.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      signal.bbUpper.toString(),
      signal.bbLower.toString(),
      signal.bbMiddle.toString(),
      signal.stochK.toString(),
      signal.stochD.toString(),
      signal.reason || '',
      signal.executed ? 'Yes' : 'No',
      signal.positionId || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bb-signals-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
    link.click();
  };

  // Get signal type badge
  const getTypeBadge = (type: string) => {
    const config = SIGNAL_TYPES.find(t => t.value === type);
    if (!config) return <Badge variant="outline">{type}</Badge>;

    const Icon = config.icon;
    const styles: Record<string, string> = {
      LONG: 'bg-green-500/10 text-green-500 border-green-500/20',
      SHORT: 'bg-red-500/10 text-red-500 border-red-500/20',
      CLOSE: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    };

    return (
      <Badge variant="outline" className={cn("gap-1", styles[type])}>
        <Icon className="h-3 w-3" />
        {type}
      </Badge>
    );
  };

  // Get executed badge
  const getExecutedBadge = (executed: boolean) => {
    return executed ? (
      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Executed
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20 gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  };

  // Reset filters
  const resetFilters = () => {
    setTypeFilter('ALL');
    setTimeframeFilter('ALL');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  // Format price
  const formatPrice = (price: number) => {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    });
  };

  // Format indicator value
  const formatIndicator = (value: number) => {
    return value.toFixed(2);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              История сигналов
            </CardTitle>
            <CardDescription>
              {filteredSignals.length} сигналов найдено
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1"
            >
              <Filter className="h-4 w-4" />
              Фильтры
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSignals}
              disabled={loading}
              className="gap-1"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={filteredSignals.length === 0}
              className="gap-1"
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t mt-4">
            {/* Type Filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Тип сигнала</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIGNAL_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.value === 'ALL' ? type.label : (
                        <span className={cn("flex items-center gap-1", type.color)}>
                          {type.icon && <type.icon className="h-3 w-3" />}
                          {type.label}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timeframe Filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Таймфрейм</Label>
              <Select value={timeframeFilter} onValueChange={setTimeframeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAMES.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">С даты</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd.MM.yyyy') : 'Выберите'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date To */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">По дату</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd.MM.yyyy') : 'Выберите'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Reset Filters Button */}
            <div className="col-span-2 md:col-span-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Сбросить фильтры
              </Button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {error && (
          <div className="text-center py-4 text-red-500">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Загрузка сигналов...
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Сигналов не найдено</p>
            <p className="text-sm mt-1">Попробуйте изменить фильтры</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Тип</TableHead>
                  <TableHead>Пара</TableHead>
                  <TableHead>TF</TableHead>
                  <TableHead className="text-right">Цена</TableHead>
                  <TableHead className="text-right">BB Upper</TableHead>
                  <TableHead className="text-right">BB Middle</TableHead>
                  <TableHead className="text-right">BB Lower</TableHead>
                  <TableHead className="text-right">Stoch K</TableHead>
                  <TableHead className="text-right">Stoch D</TableHead>
                  <TableHead>Время</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Причина</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSignals.map((signal) => (
                  <TableRow key={signal.id} className={cn(
                    signal.type === 'LONG' && 'hover:bg-green-500/5',
                    signal.type === 'SHORT' && 'hover:bg-red-500/5',
                    signal.type === 'CLOSE' && 'hover:bg-blue-500/5'
                  )}>
                    <TableCell>
                      {getTypeBadge(signal.type)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {signal.symbol}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {signal.timeframe}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${formatPrice(signal.price)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatIndicator(signal.bbUpper)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatIndicator(signal.bbMiddle)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatIndicator(signal.bbLower)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      <span className={cn(
                        signal.stochK >= 80 && 'text-red-500',
                        signal.stochK <= 20 && 'text-green-500'
                      )}>
                        {formatIndicator(signal.stochK)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatIndicator(signal.stochD)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(signal.timestamp), 'dd.MM HH:mm')}
                    </TableCell>
                    <TableCell>
                      {getExecutedBadge(signal.executed)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {signal.reason || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        {/* Stats Summary */}
        {filteredSignals.length > 0 && (
          <div className="grid grid-cols-4 gap-4 pt-4 border-t mt-4">
            <div className="text-center">
              <div className="text-lg font-bold text-green-500">
                {filteredSignals.filter(s => s.type === 'LONG').length}
              </div>
              <div className="text-xs text-muted-foreground">LONG</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-500">
                {filteredSignals.filter(s => s.type === 'SHORT').length}
              </div>
              <div className="text-xs text-muted-foreground">SHORT</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-500">
                {filteredSignals.filter(s => s.type === 'CLOSE').length}
              </div>
              <div className="text-xs text-muted-foreground">CLOSE</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-500">
                {filteredSignals.filter(s => s.executed).length}
                <span className="text-muted-foreground font-normal">
                  /{filteredSignals.length}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">Выполнено</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
