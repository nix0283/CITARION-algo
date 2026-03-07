"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Eye,
  Plus,
  Play,
  Pause,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ArgusBot {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  exchange: string;
  enable5Long: boolean;
  enable5Short: boolean;
  enable12Long: boolean;
  enable12Short: boolean;
  pumpThreshold5m: number;
  dumpThreshold5m: number;
  leverage: number;
  positionSize: number;
  useMarketForecast: boolean;
  forecastWeight: number;
  createdAt: string;
}

interface ArgusSignal {
  id: string;
  botId: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  type: "PUMP_5M" | "PUMP_15M" | "DUMP_5M" | "DUMP_15M";
  priceChange: number;
  confidence: number;
  executed: boolean;
  createdAt: string;
}

const EXCHANGES = [
  { id: "bingx", name: "BingX" },
  { id: "binance", name: "Binance" },
  { id: "bybit", name: "Bybit" },
];

export function ArgusBotManager() {
  const [bots, setBots] = useState<ArgusBot[]>([]);
  const [signals, setSignals] = useState<ArgusSignal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // New bot form state
  const [newBot, setNewBot] = useState({
    name: "",
    exchange: "bingx",
    leverage: 10,
    positionSize: 50,
    pumpThreshold5m: 0.05,
    dumpThreshold5m: 0.05,
    useMarketForecast: false,
    forecastWeight: 0.3,
  });

  useEffect(() => {
    fetchBots();
    fetchSignals();
  }, []);

  const fetchBots = async () => {
    try {
      const response = await fetch("/api/bots/argus");
      const data = await response.json();
      if (data.success) {
        setBots(data.bots || []);
      }
    } catch (error) {
      console.error("Failed to fetch Argus bots:", error);
    }
  };

  const fetchSignals = async () => {
    try {
      const response = await fetch("/api/bots/argus?signals=true");
      const data = await response.json();
      if (data.success) {
        setSignals(data.signals || []);
      }
    } catch (error) {
      console.error("Failed to fetch Argus signals:", error);
    }
  };

  const handleCreateBot = async () => {
    if (!newBot.name) {
      toast.error("Введите имя бота");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/bots/argus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ...newBot,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`Бот "${newBot.name}" создан!`);
        setIsCreateOpen(false);
        setNewBot({
          name: "",
          exchange: "bingx",
          leverage: 10,
          positionSize: 50,
          pumpThreshold5m: 0.05,
          dumpThreshold5m: 0.05,
          useMarketForecast: false,
          forecastWeight: 0.3,
        });
        fetchBots();
      } else {
        toast.error(data.error || "Ошибка создания бота");
      }
    } catch (error) {
      toast.error("Ошибка при создании бота");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBot = async (botId: string, currentStatus: string) => {
    const action = currentStatus === "ACTIVE" ? "pause" : "start";
    try {
      const response = await fetch("/api/bots/argus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, botId }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(action === "start" ? "Бот запущен" : "Бот остановлен");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка переключения бота");
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!confirm("Удалить бота?")) return;
    
    try {
      const response = await fetch(`/api/bots/argus?id=${botId}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Бот удалён");
        fetchBots();
      }
    } catch (error) {
      toast.error("Ошибка удаления бота");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-500/10 text-green-500">Активен</Badge>;
      case "PAUSED":
        return <Badge className="bg-yellow-500/10 text-yellow-500">Пауза</Badge>;
      default:
        return <Badge className="bg-gray-500/10 text-gray-500">Остановлен</Badge>;
    }
  };

  const getSignalBadge = (type: string) => {
    if (type.includes("PUMP")) {
      return (
        <Badge className="bg-green-500/10 text-green-500">
          <TrendingUp className="h-3 w-3 mr-1" />
          {type}
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-500/10 text-red-500">
        <TrendingDown className="h-3 w-3 mr-1" />
        {type}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="h-6 w-6 text-primary" />
            Argus - Pump/Dump Detector
          </h2>
          <p className="text-muted-foreground mt-1">
            Автоматическая детекция и торговля pump/dump движений
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать бота
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Новый Argus Bot</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Имя бота</label>
                <Input
                  value={newBot.name}
                  onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
                  placeholder="Argus-BTC-1"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Биржа</label>
                <Select
                  value={newBot.exchange}
                  onValueChange={(v) => setNewBot({ ...newBot, exchange: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCHANGES.map((ex) => (
                      <SelectItem key={ex.id} value={ex.id}>
                        {ex.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Плечо</label>
                  <Input
                    type="number"
                    value={newBot.leverage}
                    onChange={(e) =>
                      setNewBot({ ...newBot, leverage: parseInt(e.target.value) || 1 })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Размер позиции (USDT)</label>
                  <Input
                    type="number"
                    value={newBot.positionSize}
                    onChange={(e) =>
                      setNewBot({ ...newBot, positionSize: parseFloat(e.target.value) || 50 })
                    }
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Pump порог 5m (%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(newBot.pumpThreshold5m * 100).toFixed(1)}
                    onChange={(e) =>
                      setNewBot({
                        ...newBot,
                        pumpThreshold5m: parseFloat(e.target.value) / 100 || 0.05,
                      })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Dump порог 5m (%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(newBot.dumpThreshold5m * 100).toFixed(1)}
                    onChange={(e) =>
                      setNewBot({
                        ...newBot,
                        dumpThreshold5m: parseFloat(e.target.value) / 100 || 0.05,
                      })
                    }
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <div className="text-sm font-medium">Market Forecast</div>
                  <div className="text-xs text-muted-foreground">
                    Использовать прогноз рынка для фильтрации сигналов
                  </div>
                </div>
                <Switch
                  checked={newBot.useMarketForecast}
                  onCheckedChange={(v) => setNewBot({ ...newBot, useMarketForecast: v })}
                />
              </div>

              {newBot.useMarketForecast && (
                <div>
                  <label className="text-sm font-medium">
                    Вес прогноза: {(newBot.forecastWeight * 100).toFixed(0)}%
                  </label>
                  <Slider
                    value={[newBot.forecastWeight * 100]}
                    onValueChange={(v) =>
                      setNewBot({ ...newBot, forecastWeight: v[0] / 100 })
                    }
                    min={0}
                    max={100}
                    step={5}
                    className="mt-2"
                  />
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleCreateBot}
                disabled={isLoading || !newBot.name}
              >
                {isLoading ? "Создание..." : "Создать бота"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{bots.length}</div>
                <div className="text-xs text-muted-foreground">Всего ботов</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">
                  {bots.filter((b) => b.status === "ACTIVE").length}
                </div>
                <div className="text-xs text-muted-foreground">Активных</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">
                  {signals.filter((s) => s.type.includes("PUMP")).length}
                </div>
                <div className="text-xs text-muted-foreground">Pump сигналов</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold">
                  {signals.filter((s) => s.type.includes("DUMP")).length}
                </div>
                <div className="text-xs text-muted-foreground">Dump сигналов</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bots Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Активные боты</CardTitle>
        </CardHeader>
        <CardContent>
          {bots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Нет созданных ботов</p>
              <p className="text-sm">Нажмите "Создать бота" для начала работы</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Биржа</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Плечо</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead>Forecast</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bots.map((bot) => (
                  <TableRow key={bot.id}>
                    <TableCell className="font-medium">{bot.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {EXCHANGES.find((e) => e.id === bot.exchange)?.name || bot.exchange}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(bot.status)}</TableCell>
                    <TableCell>{bot.leverage}x</TableCell>
                    <TableCell>${bot.positionSize}</TableCell>
                    <TableCell>
                      {bot.useMarketForecast ? (
                        <Badge className="bg-blue-500/10 text-blue-500">
                          <Zap className="h-3 w-3 mr-1" />
                          {(bot.forecastWeight * 100).toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleBot(bot.id, bot.status)}
                        >
                          {bot.status === "ACTIVE" ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => handleDeleteBot(bot.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Signals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Последние сигналы</CardTitle>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Нет сигналов</p>
              <p className="text-sm">Сигналы появятся при активном мониторинге</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Символ</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Изменение</TableHead>
                  <TableHead>Уверенность</TableHead>
                  <TableHead>Исполнен</TableHead>
                  <TableHead>Время</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.slice(0, 10).map((signal) => (
                  <TableRow key={signal.id}>
                    <TableCell className="font-medium">{signal.symbol}</TableCell>
                    <TableCell>{getSignalBadge(signal.type)}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          signal.priceChange > 0 ? "text-green-500" : "text-red-500"
                        )}
                      >
                        {signal.priceChange > 0 ? "+" : ""}
                        {(signal.priceChange * 100).toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell>{(signal.confidence * 100).toFixed(0)}%</TableCell>
                    <TableCell>
                      {signal.executed ? (
                        <Badge className="bg-green-500/10 text-green-500">Да</Badge>
                      ) : (
                        <Badge variant="outline">Нет</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(signal.createdAt).toLocaleString("ru-RU")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
