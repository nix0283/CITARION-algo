"use client";

import { useCryptoStore, MarketPrice } from "@/stores/crypto-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, Settings, Plus, Trash2, Search, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { usePriceContext } from "@/components/providers/price-provider";

interface SelectedPair {
  symbol: string;
  exchange: string;
}

interface MarketSettingsType {
  id: string;
  selectedPairs: SelectedPair[];
  showExchangeColumn: boolean;
  show24hChange: boolean;
  showVolume: boolean;
  sortBy: string;
  sortDirection: string;
}

const AVAILABLE_EXCHANGES = [
  { value: 'binance', label: 'Binance' },
  { value: 'bybit', label: 'Bybit' },
  { value: 'okx', label: 'OKX' },
  { value: 'bitget', label: 'Bitget' },
  { value: 'kucoin', label: 'KuCoin' },
  { value: 'bingx', label: 'BingX' },
  { value: 'hyperliquid', label: 'HyperLiquid' },
];

const POPULAR_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT',
  'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'MATICUSDT', 'DOTUSDT', 'LTCUSDT',
  'UNIUSDT', 'ATOMUSDT', 'ETCUSDT', 'XLMUSDT', 'ALGOUSDT', 'VETUSDT',
  'FILUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT', 'INJUSDT',
  'SUIUSDT', 'SEIUSDT', 'TIAUSDT', 'WLDUSDT', 'PEPEUSDT', 'SHIBUSDT',
];

// Demo prices for fallback
const DEMO_PRICES: Record<string, MarketPrice> = {
  BTCUSDT: { symbol: "BTCUSDT", price: 67432.50, change24h: 2.45, high24h: 68100, low24h: 65800, volume24h: 28500000000 },
  ETHUSDT: { symbol: "ETHUSDT", price: 3521.80, change24h: -0.82, high24h: 3600, low24h: 3450, volume24h: 15200000000 },
  BNBUSDT: { symbol: "BNBUSDT", price: 598.45, change24h: 1.23, high24h: 610, low24h: 585, volume24h: 1850000000 },
  SOLUSDT: { symbol: "SOLUSDT", price: 172.30, change24h: 4.56, high24h: 178, low24h: 162, volume24h: 3200000000 },
  XRPUSDT: { symbol: "XRPUSDT", price: 0.5234, change24h: -1.15, high24h: 0.54, low24h: 0.51, volume24h: 1250000000 },
  DOGEUSDT: { symbol: "DOGEUSDT", price: 0.1542, change24h: 3.28, high24h: 0.16, low24h: 0.148, volume24h: 890000000 },
  ADAUSDT: { symbol: "ADAUSDT", price: 0.4521, change24h: -0.45, high24h: 0.47, low24h: 0.44, volume24h: 450000000 },
  AVAXUSDT: { symbol: "AVAXUSDT", price: 35.82, change24h: 1.89, high24h: 37, low24h: 34.5, volume24h: 380000000 },
};

export function MarketOverview() {
  const { marketPrices, setMarketPrices } = useCryptoStore();
  const { prices: wsPrices, exchangeNames } = usePriceContext();
  const [settings, setSettings] = useState<MarketSettingsType | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [editPairs, setEditPairs] = useState<SelectedPair[]>([]);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/market-settings');
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to fetch market settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Initialize with demo prices if no websocket data
  useEffect(() => {
    if (Object.keys(marketPrices).length === 0) {
      setMarketPrices(DEMO_PRICES);
    }
  }, [marketPrices, setMarketPrices]);

  // Open settings dialog
  const openSettingsDialog = () => {
    setEditPairs(settings?.selectedPairs || []);
    setSettingsDialogOpen(true);
  };

  // Save settings
  const saveSettings = async () => {
    try {
      const response = await fetch('/api/market-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedPairs: editPairs,
          showExchangeColumn: true,
          show24hChange: true,
          showVolume: false,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setSettingsDialogOpen(false);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // Add pair
  const addPair = (symbol: string, exchange: string) => {
    if (editPairs.length >= 30) return;
    if (!editPairs.some(p => p.symbol === symbol && p.exchange === exchange)) {
      setEditPairs([...editPairs, { symbol, exchange }]);
    }
  };

  // Remove pair
  const removePair = (index: number) => {
    setEditPairs(editPairs.filter((_, i) => i !== index));
  };

  // Get price for a pair
  const getPrice = (symbol: string): MarketPrice | null => {
    // First try websocket prices
    if (wsPrices[symbol]) {
      return wsPrices[symbol];
    }
    // Then try store prices
    if (marketPrices[symbol]) {
      return marketPrices[symbol];
    }
    // Finally try demo prices
    return DEMO_PRICES[symbol] || null;
  };

  // Filter symbols for search
  const filteredSymbols = POPULAR_SYMBOLS.filter(s => 
    s.toLowerCase().includes(searchSymbol.toLowerCase())
  );

  // Get pairs to display
  const displayPairs = settings?.selectedPairs || [
    { symbol: 'BTCUSDT', exchange: 'binance' },
    { symbol: 'ETHUSDT', exchange: 'binance' },
    { symbol: 'BNBUSDT', exchange: 'binance' },
    { symbol: 'SOLUSDT', exchange: 'binance' },
    { symbol: 'XRPUSDT', exchange: 'binance' },
    { symbol: 'DOGEUSDT', exchange: 'binance' },
    { symbol: 'ADAUSDT', exchange: 'binance' },
    { symbol: 'AVAXUSDT', exchange: 'binance' },
  ];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" />
              Рынки
            </CardTitle>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                {displayPairs.length}/30
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={openSettingsDialog}
                className="h-8 w-8"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Пара
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                    Биржа
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                    Цена
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                    24ч
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayPairs.map((pair, index) => {
                  const data = getPrice(pair.symbol);
                  if (!data) return null;
                  const isPositive = data.change24h >= 0;

                  return (
                    <tr
                      key={`${pair.symbol}-${pair.exchange}-${index}`}
                      className="border-b border-border/50 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-sm">
                          {pair.symbol.replace("USDT", "/USDT")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground capitalize">
                            {exchangeNames[pair.exchange as keyof typeof exchangeNames] || pair.exchange}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-sm">
                          ${data.price.toLocaleString("en-US", {
                            minimumFractionDigits: data.price < 1 ? 4 : 2,
                            maximumFractionDigits: data.price < 1 ? 4 : 2,
                          })}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-mono",
                            isPositive
                              ? "bg-green-500/10 text-green-500 border-green-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20"
                          )}
                        >
                          {isPositive ? (
                            <TrendingUp className="mr-1 h-3 w-3" />
                          ) : (
                            <TrendingDown className="mr-1 h-3 w-3" />
                          )}
                          {isPositive ? "+" : ""}
                          {data.change24h.toFixed(2)}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Настройки Рынков</DialogTitle>
            <DialogDescription>
              Выберите до 30 торговых пар для отображения. Пары будут получать цены в реальном времени через WebSocket.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Add new pair */}
              <div className="space-y-3">
                <Label className="font-semibold">Добавить пару</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Поиск символа..."
                      value={searchSymbol}
                      onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                    />
                  </div>
                  <Select defaultValue="binance">
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_EXCHANGES.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Quick add symbols */}
                <div className="flex flex-wrap gap-1">
                  {filteredSymbols.slice(0, 12).map((symbol) => (
                    <Button
                      key={symbol}
                      variant="outline"
                      size="sm"
                      onClick={() => addPair(symbol, 'binance')}
                      disabled={editPairs.length >= 30 || editPairs.some(p => p.symbol === symbol)}
                      className="text-xs h-7"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {symbol}
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Selected pairs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Выбранные пары ({editPairs.length}/30)</Label>
                  {editPairs.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditPairs([])}
                      className="text-xs text-destructive"
                    >
                      Очистить все
                    </Button>
                  )}
                </div>
                
                {editPairs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Нет выбранных пар</p>
                    <p className="text-xs">Добавьте пары из списка выше</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editPairs.map((pair, index) => (
                      <div
                        key={`${pair.symbol}-${pair.exchange}-${index}`}
                        className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50"
                      >
                        <span className="font-medium text-sm flex-1">
                          {pair.symbol.replace('USDT', '/USDT')}
                        </span>
                        <Select
                          value={pair.exchange}
                          onValueChange={(value) => {
                            const newPairs = [...editPairs];
                            newPairs[index] = { ...newPairs[index], exchange: value };
                            setEditPairs(newPairs);
                          }}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_EXCHANGES.map((e) => (
                              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePair(index)}
                          className="h-8 w-8 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={saveSettings}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
