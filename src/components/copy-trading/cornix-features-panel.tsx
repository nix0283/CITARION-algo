"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Link, Unlink, RefreshCw, Settings, Zap, Activity, Bell,
  CheckCircle2, XCircle, AlertCircle, ExternalLink, Webhook,
  Signal, Bot, Loader2, Key, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface ConnectedExchange {
  id: string;
  name: string;
  connected: boolean;
  apiKeyConfigured: boolean;
  permissions: string[];
  lastSync?: Date;
  accountType: 'spot' | 'futures' | 'both';
}

interface SignalStats {
  totalSignals: number;
  activeSignals: number;
  executedSignals: number;
  pendingSignals: number;
  failedSignals: number;
}

interface CornixFeatures {
  autoTrading: boolean;
  signalParsing: boolean;
  webhookEnabled: boolean;
  notificationsEnabled: boolean;
  riskManagement: boolean;
  tpSlCopy: boolean;
  leverageLimit: number;
  maxPositions: number;
}

// Supported exchanges for Cornix integration
const SUPPORTED_EXCHANGES = [
  { id: 'binance', name: 'Binance', hasFutures: true, hasSpot: true },
  { id: 'bybit', name: 'Bybit', hasFutures: true, hasSpot: true },
  { id: 'okx', name: 'OKX', hasFutures: true, hasSpot: true },
  { id: 'bitget', name: 'Bitget', hasFutures: true, hasSpot: true },
  { id: 'bingx', name: 'BingX', hasFutures: true, hasSpot: true },
];

export function CornixFeaturesPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [exchanges, setExchanges] = useState<ConnectedExchange[]>([]);
  const [signalStats, setSignalStats] = useState<SignalStats | null>(null);
  const [features, setFeatures] = useState<CornixFeatures>({
    autoTrading: false,
    signalParsing: true,
    webhookEnabled: false,
    notificationsEnabled: true,
    riskManagement: true,
    tpSlCopy: true,
    leverageLimit: 10,
    maxPositions: 5,
  });

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cornix/features');
      const result = await response.json();

      if (result.success) {
        setExchanges(result.data.exchanges || []);
        setSignalStats(result.data.signalStats || null);
        if (result.data.features) {
          setFeatures(result.data.features);
        }
      }
    } catch (error) {
      console.error('[CornixFeaturesPanel] Error:', error);
      // Use mock data for demo
      setExchanges(SUPPORTED_EXCHANGES.map(ex => ({
        id: ex.id,
        name: ex.name,
        connected: false,
        apiKeyConfigured: false,
        permissions: [],
        accountType: 'both',
      })));
      setSignalStats({
        totalSignals: 0,
        activeSignals: 0,
        executedSignals: 0,
        pendingSignals: 0,
        failedSignals: 0,
      });
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleFeature = async (feature: keyof CornixFeatures, value: boolean) => {
    setFeatures(prev => ({ ...prev, [feature]: value }));

    try {
      await fetch('/api/cornix/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, value }),
      });

      toast({
        title: value ? "Функция включена" : "Функция отключена",
        description: `${feature} успешно ${value ? 'включена' : 'отключена'}`,
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
      // Revert on error
      setFeatures(prev => ({ ...prev, [feature]: !value }));
    }
  };

  const handleConnectExchange = async (exchangeId: string) => {
    toast({
      title: "Подключение биржи",
      description: `Перейдите в настройки Exchange для подключения ${exchangeId.toUpperCase()}`,
    });
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cornix/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Сохранено",
          description: "Настройки Cornix успешно сохранены",
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Cornix Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Cornix Integration
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Интеграция с Cornix для копитрейдинга и парсинга сигналов
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {signalStats?.activeSignals || 0} активных сигналов
          </Badge>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>О Cornix Integration</AlertTitle>
        <AlertDescription>
          Cornix — это платформа для копитрейдинга. CITARION поддерживает Cornix-совместимый формат сигналов
          и может работать как внешняя интеграция для получения и исполнения сигналов.
          <a
            href="https://help.cornix.io/en/articles/5814956-signal-posting"
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-2 text-sm underline"
          >
            <ExternalLink className="h-3 w-3 inline mr-1" />
            Документация Cornix Signal Format
          </a>
        </AlertDescription>
      </Alert>

      {/* Connected Exchanges */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Link className="h-5 w-5" />
            Подключённые биржи
          </CardTitle>
          <CardDescription>
            Биржи, настроенные для работы с Cornix сигналами
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {exchanges.map((exchange) => (
              <div
                key={exchange.id}
                className={cn(
                  "p-4 border rounded-lg",
                  exchange.connected ? "border-green-500/50 bg-green-500/5" : "border-border"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">{exchange.name}</span>
                  {exchange.connected ? (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Подключено
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      Не подключено
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mb-2">
                  {exchange.accountType === 'both' ? 'Spot + Futures' : exchange.accountType.toUpperCase()}
                </div>
                <Button
                  variant={exchange.connected ? "outline" : "default"}
                  size="sm"
                  className="w-full"
                  onClick={() => handleConnectExchange(exchange.id)}
                >
                  {exchange.connected ? (
                    <>
                      <Settings className="h-3 w-3 mr-1" />
                      Настроить
                    </>
                  ) : (
                    <>
                      <Link className="h-3 w-3 mr-1" />
                      Подключить
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Signal Statistics */}
      {signalStats && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Signal className="h-5 w-5" />
              Статистика сигналов
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{signalStats.totalSignals}</div>
                <div className="text-xs text-muted-foreground">Всего</div>
              </div>
              <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                <div className="text-2xl font-bold text-blue-500">{signalStats.activeSignals}</div>
                <div className="text-xs text-muted-foreground">Активных</div>
              </div>
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <div className="text-2xl font-bold text-green-500">{signalStats.executedSignals}</div>
                <div className="text-xs text-muted-foreground">Исполнено</div>
              </div>
              <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
                <div className="text-2xl font-bold text-yellow-500">{signalStats.pendingSignals}</div>
                <div className="text-xs text-muted-foreground">В ожидании</div>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-lg">
                <div className="text-2xl font-bold text-red-500">{signalStats.failedSignals}</div>
                <div className="text-xs text-muted-foreground">Ошибок</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Features Settings */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Функции интеграции
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Auto Trading */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-primary" />
                <div>
                  <Label className="font-semibold">Авто-торговля</Label>
                  <p className="text-xs text-muted-foreground">
                    Автоматическое исполнение сигналов
                  </p>
                </div>
              </div>
              <Switch
                checked={features.autoTrading}
                onCheckedChange={(checked) => handleToggleFeature('autoTrading', checked)}
              />
            </div>

            {/* Signal Parsing */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Signal className="h-5 w-5 text-primary" />
                <div>
                  <Label className="font-semibold">Парсинг сигналов</Label>
                  <p className="text-xs text-muted-foreground">
                    Распознавание Cornix формата
                  </p>
                </div>
              </div>
              <Switch
                checked={features.signalParsing}
                onCheckedChange={(checked) => handleToggleFeature('signalParsing', checked)}
              />
            </div>

            {/* Webhook */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Webhook className="h-5 w-5 text-primary" />
                <div>
                  <Label className="font-semibold">Webhook</Label>
                  <p className="text-xs text-muted-foreground">
                    Приём сигналов через webhook
                  </p>
                </div>
              </div>
              <Switch
                checked={features.webhookEnabled}
                onCheckedChange={(checked) => handleToggleFeature('webhookEnabled', checked)}
              />
            </div>

            {/* Notifications */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-primary" />
                <div>
                  <Label className="font-semibold">Уведомления</Label>
                  <p className="text-xs text-muted-foreground">
                    Telegram уведомления о сигналах
                  </p>
                </div>
              </div>
              <Switch
                checked={features.notificationsEnabled}
                onCheckedChange={(checked) => handleToggleFeature('notificationsEnabled', checked)}
              />
            </div>

            {/* Risk Management */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <Label className="font-semibold">Риск-менеджмент</Label>
                  <p className="text-xs text-muted-foreground">
                    Проверка лимитов перед исполнением
                  </p>
                </div>
              </div>
              <Switch
                checked={features.riskManagement}
                onCheckedChange={(checked) => handleToggleFeature('riskManagement', checked)}
              />
            </div>

            {/* TP/SL Copy */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-primary" />
                <div>
                  <Label className="font-semibold">Копировать TP/SL</Label>
                  <p className="text-xs text-muted-foreground">
                    Автоматически устанавливать TP/SL из сигнала
                  </p>
                </div>
              </div>
              <Switch
                checked={features.tpSlCopy}
                onCheckedChange={(checked) => handleToggleFeature('tpSlCopy', checked)}
              />
            </div>
          </div>

          <Separator />

          {/* Numeric Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Максимальный leverage</Label>
              <Input
                type="number"
                value={features.leverageLimit}
                onChange={(e) => setFeatures(prev => ({ ...prev, leverageLimit: Number(e.target.value) }))}
                min={1}
                max={125}
              />
              <p className="text-xs text-muted-foreground">
                Сигналы с большим leverage будут отклонены
              </p>
            </div>
            <div className="space-y-2">
              <Label>Максимум позиций</Label>
              <Input
                type="number"
                value={features.maxPositions}
                onChange={(e) => setFeatures(prev => ({ ...prev, maxPositions: Number(e.target.value) }))}
                min={1}
                max={50}
              />
              <p className="text-xs text-muted-foreground">
                Ограничение одновременных позиций
              </p>
            </div>
          </div>

          <Button onClick={handleSaveSettings} disabled={loading} className="w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Сохранить настройки
          </Button>
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook URL
          </CardTitle>
          <CardDescription>
            Используйте этот URL для приёма сигналов из внешних источников
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-muted/50 rounded-lg font-mono text-sm break-all">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/tradingview
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Поддерживает TradingView alerts и Cornix-совместимый формат сигналов
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
