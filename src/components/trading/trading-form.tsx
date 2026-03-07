"use client";

import { useState } from "react";
import { useCryptoStore } from "@/stores/crypto-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  Percent,
  AlertTriangle,
  Building2,
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Format number consistently to avoid hydration mismatch
function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

const TRADING_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
];

const LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100];
const ASTER_LEVERAGE_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000];

const EXCHANGES = [
  { id: "binance", name: "Binance", hasTestnet: true, hasDemo: false },
  { id: "bybit", name: "Bybit", hasTestnet: true, hasDemo: false },
  { id: "okx", name: "OKX", hasTestnet: false, hasDemo: true },
  { id: "bitget", name: "Bitget", hasTestnet: false, hasDemo: true },
  { id: "kucoin", name: "KuCoin", hasTestnet: true, hasDemo: false },
  { id: "bingx", name: "BingX", hasTestnet: false, hasDemo: true },
  { id: "huobi", name: "HTX (Huobi)", hasTestnet: true, hasDemo: false },
  { id: "hyperliquid", name: "HyperLiquid", hasTestnet: true, hasDemo: false },
  { id: "bitmex", name: "BitMEX", hasTestnet: true, hasDemo: false },
  { id: "blofin", name: "BloFin", hasTestnet: false, hasDemo: true },
  { id: "coinbase", name: "Coinbase", hasTestnet: true, hasDemo: false },
  { id: "aster", name: "Aster DEX", hasTestnet: true, hasDemo: true },
];

export function TradingForm() {
  const { account, positions, addPosition, addTrade, marketPrices } =
    useCryptoStore();
  const [exchange, setExchange] = useState("binance");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [amount, setAmount] = useState("100");
  const [marginPercent, setMarginPercent] = useState(2);
  const [leverage, setLeverage] = useState(10);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  const balance = account?.virtualBalance?.USDT || 0;
  const isDemo = account?.accountType === "DEMO";
  const currentPrice = marketPrices[symbol]?.price || 0;
  const selectedExchange = EXCHANGES.find(e => e.id === exchange);

  // Calculate position details
  const positionSize = parseFloat(amount) || 0;
  const leveragedSize = positionSize * leverage;
  const marginRequired = positionSize;
  const estimatedFee = leveragedSize * 0.0004; // 0.04% taker fee

  const handleTrade = async () => {
    if (positionSize <= 0) {
      toast.error("Введите сумму сделки");
      return;
    }

    if (positionSize > balance) {
      toast.error("Недостаточно средств");
      return;
    }

    if (currentPrice <= 0) {
      toast.error("Не удалось получить текущую цену");
      return;
    }

    // Show confirmation dialog
    setShowConfirmDialog(true);
  };

  const confirmTrade = async () => {
    setShowConfirmDialog(false);
    setIsSubmitting(true);

    try {
      // Create position
      const position = {
        id: `pos-${Date.now()}`,
        symbol,
        direction,
        totalAmount: leveragedSize / currentPrice,
        avgEntryPrice: currentPrice,
        currentPrice,
        leverage,
        unrealizedPnl: 0,
        stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        isDemo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Call API
      const response = await fetch("/api/trade/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          direction,
          amount: positionSize,
          leverage,
          stopLoss: stopLoss || null,
          takeProfit: takeProfit || null,
          isDemo,
          exchangeId: exchange,
        }),
      });

      if (response.ok) {
        addPosition(position);

        // Create trade record
        const trade = {
          id: `trade-${Date.now()}`,
          symbol,
          direction,
          status: "OPEN" as const,
          entryPrice: currentPrice,
          amount: positionSize,
          leverage,
          pnl: 0,
          pnlPercent: 0,
          fee: estimatedFee,
          isDemo,
          createdAt: new Date().toISOString(),
        };
        addTrade(trade);

        toast.success(
          `Позиция ${direction} открыта: ${symbol} ${isDemo ? "[DEMO]" : "[REAL]"}`
        );
      }
    } catch (error) {
      console.error("Trade error:", error);
      toast.error("Ошибка при открытии позиции");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Новая сделка
              {isDemo && (
                <Badge variant="outline" className="demo-badge text-xs ml-2">
                  DEMO
                </Badge>
              )}
            </div>
            {/* Keyboard shortcuts button - Desktop only */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex h-7 w-7"
              onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          </CardTitle>
          
          {/* Keyboard shortcuts info */}
          {showKeyboardShortcuts && (
            <div className="hidden md:block text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 mt-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span><kbd className="px-1 bg-muted rounded">L</kbd> Long</span>
                <span><kbd className="px-1 bg-muted rounded">S</kbd> Short</span>
                <span><kbd className="px-1 bg-muted rounded">Enter</kbd> Submit</span>
                <span><kbd className="px-1 bg-muted rounded">Esc</kbd> Clear</span>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Exchange Selection */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              Биржа
            </Label>
            <Select value={exchange} onValueChange={setExchange}>
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGES.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    <span className="flex items-center gap-2">
                      {ex.name}
                      {ex.hasDemo && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">Demo</Badge>
                      )}
                      {ex.hasTestnet && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">Testnet</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Trading Pair */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Торговая пара</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRADING_PAIRS.map((pair) => (
                  <SelectItem key={pair} value={pair}>
                    {pair.replace("USDT", "/USDT")}
                    {marketPrices[pair] && (
                      <span className="ml-2 text-muted-foreground">
                        ${formatNumber(marketPrices[pair].price)}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Direction Toggle */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Направление</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={direction === "LONG" ? "default" : "outline"}
                className={cn(
                  "h-12 min-h-11 touch-target",
                  direction === "LONG" &&
                    "bg-green-500 hover:bg-green-600 text-white"
                )}
                onClick={() => setDirection("LONG")}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                LONG
              </Button>
              <Button
                type="button"
                variant={direction === "SHORT" ? "default" : "outline"}
                className={cn(
                  "h-12 min-h-11 touch-target",
                  direction === "SHORT" && "bg-red-500 hover:bg-red-600 text-white"
                )}
                onClick={() => setDirection("SHORT")}
              >
                <TrendingDown className="mr-2 h-4 w-4" />
                SHORT
              </Button>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Сумма (USDT)</Label>
              <span className="text-xs text-muted-foreground">
                Доступно: ${formatNumber(balance)}
              </span>
            </div>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              className="font-mono min-h-11"
            />
            <div className="grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((percent) => (
                <Button
                  key={percent}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs min-h-11 touch-target"
                  onClick={() => setAmount(((balance * percent) / 100).toFixed(2))}
                >
                  {percent}%
                </Button>
              ))}
            </div>
          </div>

          {/* Margin Percentage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Percent className="h-3 w-3" />
                Процент маржи
              </Label>
              <span className="text-sm font-mono font-medium text-primary">
                {marginPercent.toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[marginPercent]}
              onValueChange={(value) => setMarginPercent(value[0])}
              min={0.5}
              max={10}
              step={0.5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.5%</span>
              <span>10%</span>
            </div>
          </div>

          {/* Leverage */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Плечо
              {exchange === "aster" && (
                <span className="ml-2 text-[10px] text-amber-500">до 1001x</span>
              )}
            </Label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
              {(exchange === "aster" ? ASTER_LEVERAGE_OPTIONS : LEVERAGE_OPTIONS).map((lev) => (
                <Button
                  key={lev}
                  type="button"
                  variant={leverage === lev ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-9 text-xs min-h-11 touch-target",
                    leverage === lev && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => setLeverage(lev)}
                >
                  {lev}x
                </Button>
              ))}
            </div>
          </div>

          <Separator className="my-2" />

          {/* Stop Loss / Take Profit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Stop Loss
              </Label>
              <Input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Цена"
                className="font-mono min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Percent className="h-3 w-3" />
                Take Profit
              </Label>
              <Input
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Цена"
                className="font-mono min-h-11"
              />
            </div>
          </div>

          {/* Position Summary */}
          <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Размер позиции</span>
              <span className="font-mono">${leveragedSize.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Маржа</span>
              <span className="font-mono">${marginRequired.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Процент маржи</span>
              <span className="font-mono text-primary">{marginPercent.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Комиссия (est.)</span>
              <span className="font-mono">${estimatedFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Цена входа</span>
              <span className="font-mono">
                ${formatNumber(currentPrice)}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            className={cn(
              "w-full h-12 text-base font-medium min-h-11 touch-target",
              direction === "LONG" && "bg-green-500 hover:bg-green-600",
              direction === "SHORT" && "bg-red-500 hover:bg-red-600"
            )}
            onClick={handleTrade}
            disabled={isSubmitting || positionSize > balance}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Обработка...
              </span>
            ) : (
              <>
                {direction === "LONG" ? (
                  <TrendingUp className="mr-2 h-5 w-5" />
                ) : (
                  <TrendingDown className="mr-2 h-5 w-5" />
                )}
                Открыть {direction} {isDemo ? "[DEMO]" : ""}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {direction === "LONG" ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
              Подтвердите сделку
            </DialogTitle>
            <DialogDescription>
              Проверьте параметры перед открытием позиции
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">Пара:</div>
              <div className="font-medium">{symbol}</div>
              
              <div className="text-muted-foreground">Направление:</div>
              <div className={cn(
                "font-medium",
                direction === "LONG" ? "text-green-500" : "text-red-500"
              )}>
                {direction}
              </div>
              
              <div className="text-muted-foreground">Размер:</div>
              <div className="font-mono">${positionSize.toFixed(2)}</div>
              
              <div className="text-muted-foreground">Плечо:</div>
              <div className="font-mono">{leverage}x</div>
              
              <div className="text-muted-foreground">Позиция:</div>
              <div className="font-mono">${leveragedSize.toFixed(2)}</div>

              <div className="text-muted-foreground">Процент маржи:</div>
              <div className="font-mono text-primary">{marginPercent.toFixed(1)}%</div>

              <div className="text-muted-foreground">Цена входа:</div>
              <div className="font-mono">${formatNumber(currentPrice)}</div>
              
              {stopLoss && (
                <>
                  <div className="text-muted-foreground">Stop Loss:</div>
                  <div className="font-mono text-red-500">${stopLoss}</div>
                </>
              )}
              
              {takeProfit && (
                <>
                  <div className="text-muted-foreground">Take Profit:</div>
                  <div className="font-mono text-green-500">${takeProfit}</div>
                </>
              )}
              
              <div className="text-muted-foreground">Комиссия:</div>
              <div className="font-mono">${estimatedFee.toFixed(2)}</div>
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              className="w-full sm:w-auto min-h-11 touch-target"
            >
              Отмена
            </Button>
            <Button
              onClick={confirmTrade}
              className={cn(
                "w-full sm:w-auto min-h-11 touch-target",
                direction === "LONG" && "bg-green-500 hover:bg-green-600",
                direction === "SHORT" && "bg-red-500 hover:bg-red-600"
              )}
            >
              {direction === "LONG" ? (
                <TrendingUp className="mr-2 h-4 w-4" />
              ) : (
                <TrendingDown className="mr-2 h-4 w-4" />
              )}
              Подтвердить {direction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
