"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Users, TrendingUp, TrendingDown, Crown, Star, Copy, Settings, 
  RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  ExternalLink, Activity, DollarSign, Target, Percent
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCryptoStore } from "@/stores/crypto-store";

// Types
interface CopyTrader {
  traderId: string;
  nickname: string;
  avatar?: string;
  exchange: string;
  roi: number;
  winRate: number;
  totalTrades: number;
  followersCount: number;
  totalPnl: number;
  tradingDays: number;
  maxDrawdown: number;
  avgLeverage: number;
  lastTradeTime?: Date;
  rank?: number;
}

interface CopyTraderPosition {
  positionId: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  openedAt: Date;
}

interface CopySubscription {
  traderId: string;
  nickname: string;
  exchange: string;
  copyMode: 'fixed' | 'ratio' | 'percentage';
  amount: number;
  active: boolean;
  subscribedAt: Date;
  totalPnl: number;
}

// Exchange API support status
const EXCHANGE_API_SUPPORT: Record<string, {
  publicApi: boolean;
  subscribe: boolean;
  manageFollowers: boolean;
}> = {
  okx: { publicApi: true, subscribe: true, manageFollowers: true },
  bitget: { publicApi: true, subscribe: true, manageFollowers: true },
  binance: { publicApi: false, subscribe: false, manageFollowers: false },
  bybit: { publicApi: false, subscribe: false, manageFollowers: false },
  bingx: { publicApi: false, subscribe: false, manageFollowers: false },
};

// Mock data for demo
const MOCK_TRADERS: CopyTrader[] = [
  {
    traderId: '1',
    nickname: 'CryptoKing_OKX',
    exchange: 'okx',
    roi: 156.8,
    winRate: 68.5,
    totalTrades: 342,
    followersCount: 1250,
    totalPnl: 125680,
    tradingDays: 180,
    maxDrawdown: 12.5,
    avgLeverage: 5.2,
    rank: 1,
  },
  {
    traderId: '2',
    nickname: 'BitgetMaster',
    exchange: 'bitget',
    roi: 89.3,
    winRate: 72.1,
    totalTrades: 218,
    followersCount: 890,
    totalPnl: 89450,
    tradingDays: 120,
    maxDrawdown: 8.3,
    avgLeverage: 3.8,
    rank: 2,
  },
  {
    traderId: '3',
    nickname: 'SafeTrader_Pro',
    exchange: 'okx',
    roi: 45.2,
    winRate: 81.2,
    totalTrades: 156,
    followersCount: 2100,
    totalPnl: 45200,
    tradingDays: 90,
    maxDrawdown: 5.1,
    avgLeverage: 2.1,
    rank: 3,
  },
  {
    traderId: '4',
    nickname: 'HighRoller_X',
    exchange: 'bitget',
    roi: 245.6,
    winRate: 55.8,
    totalTrades: 567,
    followersCount: 456,
    totalPnl: 245600,
    tradingDays: 365,
    maxDrawdown: 35.2,
    avgLeverage: 12.5,
    rank: 4,
  },
];

const MOCK_POSITIONS: CopyTraderPosition[] = [
  {
    positionId: 'p1',
    symbol: 'BTCUSDT',
    side: 'long',
    quantity: 0.5,
    entryPrice: 98500,
    markPrice: 99200,
    unrealizedPnl: 350,
    leverage: 5,
    openedAt: new Date(Date.now() - 3600000 * 4),
  },
  {
    positionId: 'p2',
    symbol: 'ETHUSDT',
    side: 'short',
    quantity: 5,
    entryPrice: 3450,
    markPrice: 3420,
    unrealizedPnl: 150,
    leverage: 3,
    openedAt: new Date(Date.now() - 3600000 * 12),
  },
];

const MOCK_SUBSCRIPTIONS: CopySubscription[] = [
  {
    traderId: '1',
    nickname: 'CryptoKing_OKX',
    exchange: 'okx',
    copyMode: 'fixed',
    amount: 100,
    active: true,
    subscribedAt: new Date(Date.now() - 86400000 * 30),
    totalPnl: 1568,
  },
];

export function CopyTradingPanel() {
  const { account } = useCryptoStore();
  const [activeTab, setActiveTab] = useState<'traders' | 'positions' | 'subscriptions' | 'settings'>('traders');
  const [selectedExchange, setSelectedExchange] = useState<string>('okx');
  const [sortBy, setSortBy] = useState<'roi' | 'winRate' | 'followers' | 'pnl'>('roi');
  const [traders, setTraders] = useState<CopyTrader[]>(MOCK_TRADERS);
  const [positions, setPositions] = useState<CopyTraderPosition[]>(MOCK_POSITIONS);
  const [subscriptions, setSubscriptions] = useState<CopySubscription[]>(MOCK_SUBSCRIPTIONS);
  const [loading, setLoading] = useState(false);
  const [expandedTrader, setExpandedTrader] = useState<string | null>(null);

  // New subscription form
  const [newSubscription, setNewSubscription] = useState({
    copyMode: 'fixed' as 'fixed' | 'ratio' | 'percentage',
    amount: 100,
    maxAmount: 500,
    copyTpsl: true,
  });

  const getApiSupport = (exchange: string) => {
    return EXCHANGE_API_SUPPORT[exchange] || { publicApi: false, subscribe: false, manageFollowers: false };
  };

  const sortedTraders = [...traders].sort((a, b) => {
    switch (sortBy) {
      case 'roi': return b.roi - a.roi;
      case 'winRate': return b.winRate - a.winRate;
      case 'followers': return b.followersCount - a.followersCount;
      case 'pnl': return b.totalPnl - a.totalPnl;
      default: return 0;
    }
  });

  const filteredTraders = sortedTraders.filter(t => t.exchange === selectedExchange);

  const handleSubscribe = async (traderId: string) => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    const trader = traders.find(t => t.traderId === traderId);
    if (trader) {
      setSubscriptions(prev => [...prev, {
        traderId: trader.traderId,
        nickname: trader.nickname,
        exchange: trader.exchange,
        copyMode: newSubscription.copyMode,
        amount: newSubscription.amount,
        active: true,
        subscribedAt: new Date(),
        totalPnl: 0,
      }]);
    }
    setLoading(false);
  };

  const handleUnsubscribe = async (traderId: string) => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setSubscriptions(prev => prev.filter(s => s.traderId !== traderId));
    setLoading(false);
  };

  const formatNumber = (num: number, decimals = 2) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Копитрейдинг
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Автоматическое копирование сделок опытных трейдеров
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {subscriptions.filter(s => s.active).length} активных подписок
          </Badge>
          <Button variant="outline" size="icon" onClick={() => setLoading(true)}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* API Support Warning */}
      {!getApiSupport(selectedExchange).publicApi && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-yellow-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                Для {selectedExchange.toUpperCase()} публичный API недоступен. 
                Управление копитрейдингом доступно только через Web UI биржи.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="traders">Трейдеры</TabsTrigger>
          <TabsTrigger value="positions">Позиции</TabsTrigger>
          <TabsTrigger value="subscriptions">Подписки</TabsTrigger>
          <TabsTrigger value="settings">Настройки</TabsTrigger>
        </TabsList>

        {/* Traders Tab */}
        <TabsContent value="traders" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Биржа:</Label>
              <Select value={selectedExchange} onValueChange={setSelectedExchange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="okx">OKX</SelectItem>
                  <SelectItem value="bitget">Bitget</SelectItem>
                  <SelectItem value="binance">Binance</SelectItem>
                  <SelectItem value="bybit">Bybit</SelectItem>
                  <SelectItem value="bingx">BingX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Сортировка:</Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="roi">ROI</SelectItem>
                  <SelectItem value="winRate">Win Rate</SelectItem>
                  <SelectItem value="followers">Followers</SelectItem>
                  <SelectItem value="pnl">PnL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {getApiSupport(selectedExchange).publicApi && (
              <Badge variant="secondary" className="ml-auto">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                API доступен
              </Badge>
            )}
          </div>

          {/* Traders List */}
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {filteredTraders.map((trader, index) => {
                const isExpanded = expandedTrader === trader.traderId;
                const isSubscribed = subscriptions.some(s => s.traderId === trader.traderId);
                
                return (
                  <Card key={trader.traderId} className={cn(
                    "transition-all duration-200",
                    isSubscribed && "border-primary/50 bg-primary/5"
                  )}>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                            {trader.rank || index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{trader.nickname}</span>
                              {isSubscribed && (
                                <Badge variant="secondary" className="text-xs">
                                  <Copy className="h-3 w-3 mr-1" />
                                  Подписан
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{trader.exchange.toUpperCase()}</span>
                              <span>•</span>
                              <span>{trader.tradingDays} дней</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {/* ROI */}
                          <div className="text-right">
                            <div className={cn(
                              "text-lg font-bold flex items-center gap-1",
                              trader.roi >= 0 ? "text-green-500" : "text-red-500"
                            )}>
                              {trader.roi >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                              {trader.roi >= 0 ? '+' : ''}{formatNumber(trader.roi)}%
                            </div>
                            <div className="text-xs text-muted-foreground">ROI</div>
                          </div>
                          {/* Win Rate */}
                          <div className="text-right">
                            <div className="text-lg font-bold">{formatNumber(trader.winRate)}%</div>
                            <div className="text-xs text-muted-foreground">Win Rate</div>
                          </div>
                          {/* Followers */}
                          <div className="text-right">
                            <div className="text-lg font-bold flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {formatNumber(trader.followersCount, 0)}
                            </div>
                            <div className="text-xs text-muted-foreground">Followers</div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setExpandedTrader(isExpanded ? null : trader.traderId)}
                          >
                            {isExpanded ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent className="pt-0">
                        <Separator className="my-3" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <div className="text-sm text-muted-foreground">Total PnL</div>
                            <div className={cn(
                              "font-semibold",
                              trader.totalPnl >= 0 ? "text-green-500" : "text-red-500"
                            )}>
                              ${formatNumber(trader.totalPnl)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Max Drawdown</div>
                            <div className="font-semibold text-red-500">
                              -{formatNumber(trader.maxDrawdown)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Total Trades</div>
                            <div className="font-semibold">{trader.totalTrades}</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Avg Leverage</div>
                            <div className="font-semibold">{formatNumber(trader.avgLeverage)}x</div>
                          </div>
                        </div>
                        
                        {/* Subscribe Form */}
                        {getApiSupport(trader.exchange).subscribe && !isSubscribed && (
                          <div className="flex items-end gap-4 p-3 bg-muted/50 rounded-lg">
                            <div className="flex-1">
                              <Label className="text-xs">Режим копирования</Label>
                              <Select 
                                value={newSubscription.copyMode} 
                                onValueChange={(v) => setNewSubscription(prev => ({ ...prev, copyMode: v as typeof prev.copyMode }))}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fixed">
                                    <div className="flex items-center gap-2">
                                      <DollarSign className="h-3 w-3" />
                                      Фиксированная сумма
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="ratio">
                                    <div className="flex items-center gap-2">
                                      <Target className="h-3 w-3" />
                                      Пропорция
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="percentage">
                                    <div className="flex items-center gap-2">
                                      <Percent className="h-3 w-3" />
                                      % от баланса
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="w-24">
                              <Label className="text-xs">Сумма</Label>
                              <Input
                                type="number"
                                value={newSubscription.amount}
                                onChange={(e) => setNewSubscription(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                className="h-8"
                              />
                            </div>
                            <Button 
                              onClick={() => handleSubscribe(trader.traderId)}
                              disabled={loading}
                              size="sm"
                            >
                              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4 mr-1" />}
                              Подписаться
                            </Button>
                          </div>
                        )}
                        
                        {!getApiSupport(trader.exchange).subscribe && (
                          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                            <ExternalLink className="h-4 w-4" />
                            <span className="text-sm">
                              Для подписки перейдите в Web UI биржи {trader.exchange.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Открытые позиции трейдеров
              </CardTitle>
              <CardDescription>
                Текущие позиции трейдеров, на которых вы подписаны
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {positions.map((position) => (
                  <div 
                    key={position.positionId}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <Badge variant={position.side === 'long' ? 'default' : 'destructive'}>
                        {position.side.toUpperCase()}
                      </Badge>
                      <div>
                        <div className="font-semibold">{position.symbol}</div>
                        <div className="text-xs text-muted-foreground">
                          Entry: ${formatNumber(position.entryPrice)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="font-semibold">{formatNumber(position.quantity)}</div>
                        <div className="text-xs text-muted-foreground">Size</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{position.leverage}x</div>
                        <div className="text-xs text-muted-foreground">Leverage</div>
                      </div>
                      <div className={cn(
                        "text-right font-semibold",
                        position.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {position.unrealizedPnl >= 0 ? '+' : ''}${formatNumber(position.unrealizedPnl)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTimeAgo(position.openedAt)}
                      </div>
                    </div>
                  </div>
                ))}
                {positions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Нет открытых позиций у подписанных трейдеров
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Мои подписки
              </CardTitle>
              <CardDescription>
                Управление подписками на трейдеров
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {subscriptions.map((sub) => (
                  <div 
                    key={sub.traderId}
                    className={cn(
                      "p-4 border rounded-lg",
                      sub.active ? "border-primary/50 bg-primary/5" : "border-border"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Crown className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-semibold">{sub.nickname}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{sub.exchange.toUpperCase()}</span>
                            <span>•</span>
                            <span>
                              {sub.copyMode === 'fixed' && `$${sub.amount} на сделку`}
                              {sub.copyMode === 'ratio' && `${sub.amount}x пропорция`}
                              {sub.copyMode === 'percentage' && `${sub.amount}% от баланса`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className={cn(
                            "font-semibold",
                            sub.totalPnl >= 0 ? "text-green-500" : "text-red-500"
                          )}>
                            {sub.totalPnl >= 0 ? '+' : ''}${formatNumber(sub.totalPnl)}
                          </div>
                          <div className="text-xs text-muted-foreground">Total PnL</div>
                        </div>
                        <Badge variant={sub.active ? "default" : "secondary"}>
                          {sub.active ? 'Активно' : 'Приостановлено'}
                        </Badge>
                        {getApiSupport(sub.exchange).subscribe && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleUnsubscribe(sub.traderId)}
                            disabled={loading}
                          >
                            Отписаться
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {subscriptions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    У вас нет активных подписок. Найдите трейдеров во вкладке "Трейдеры"
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Настройки копитрейдинга
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Default Settings */}
              <div className="space-y-4">
                <h4 className="font-medium">Настройки по умолчанию</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Режим копирования</Label>
                    <Select value={newSubscription.copyMode} onValueChange={(v) => setNewSubscription(prev => ({ ...prev, copyMode: v as typeof prev.copyMode }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Фиксированная сумма</SelectItem>
                        <SelectItem value="ratio">Пропорция</SelectItem>
                        <SelectItem value="percentage">% от баланса</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Сумма по умолчанию (USDT)</Label>
                    <Input
                      type="number"
                      value={newSubscription.amount}
                      onChange={(e) => setNewSubscription(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Макс. сумма на сделку (USDT)</Label>
                    <Input
                      type="number"
                      value={newSubscription.maxAmount}
                      onChange={(e) => setNewSubscription(prev => ({ ...prev, maxAmount: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Копировать TP/SL</Label>
                      <p className="text-xs text-muted-foreground">
                        Автоматически копировать Take Profit и Stop Loss трейдера
                      </p>
                    </div>
                    <Switch
                      checked={newSubscription.copyTpsl}
                      onCheckedChange={(checked) => setNewSubscription(prev => ({ ...prev, copyTpsl: checked }))}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* API Support Table */}
              <div className="space-y-4">
                <h4 className="font-medium">Поддержка API по биржам</h4>
                <div className="rounded-md border">
                  <div className="grid grid-cols-4 text-sm font-medium bg-muted p-3">
                    <div>Биржа</div>
                    <div className="text-center">Публичный API</div>
                    <div className="text-center">Подписка</div>
                    <div className="text-center">Управление</div>
                  </div>
                  {Object.entries(EXCHANGE_API_SUPPORT).map(([exchange, support]) => (
                    <div key={exchange} className="grid grid-cols-4 text-sm p-3 border-t">
                      <div className="font-medium">{exchange.toUpperCase()}</div>
                      <div className="text-center">
                        {support.publicApi ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                      <div className="text-center">
                        {support.subscribe ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                      <div className="text-center">
                        {support.manageFollowers ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
