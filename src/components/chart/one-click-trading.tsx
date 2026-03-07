"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Time, IChartApi, ISeriesApi, MouseEventParams } from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  TrendingUp, 
  TrendingDown, 
  X, 
  Check, 
  Loader2,
  Settings,
  ShoppingCart,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface OneClickTradeParams {
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  type: "MARKET" | "LIMIT";
  stopLoss?: number;
  takeProfit?: number;
  reduceOnly?: boolean;
}

export interface OneClickTradingConfig {
  enabled: boolean;
  defaultQuantity: number;
  defaultType: "MARKET" | "LIMIT";
  slippageTolerance: number; // percent
  showConfirmation: boolean;
  quickSizes: number[]; // percentages of balance
  defaultStopLossPercent?: number;
  defaultTakeProfitPercent?: number;
}

const DEFAULT_CONFIG: OneClickTradingConfig = {
  enabled: false, // Disabled by default for safety
  defaultQuantity: 0.001,
  defaultType: "MARKET",
  slippageTolerance: 0.5,
  showConfirmation: true,
  quickSizes: [1, 5, 10, 25, 50, 100],
  defaultStopLossPercent: 2,
  defaultTakeProfitPercent: 4,
};

export interface OneClickTradingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: OneClickTradeParams | null;
  onConfirm: (params: OneClickTradeParams) => Promise<void>;
  currentPrice: number;
  balance: number;
  config?: Partial<OneClickTradingConfig>;
}

export function OneClickTradingDialog({
  open,
  onOpenChange,
  params,
  onConfirm,
  currentPrice,
  balance,
  config: userConfig,
}: OneClickTradingDialogProps) {
  // Memoize config to prevent recreating on every render
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...userConfig }), [userConfig]);
  const [quantity, setQuantity] = useState(params?.quantity || config.defaultQuantity);
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">(params?.type || config.defaultType);
  const [limitPrice, setLimitPrice] = useState(params?.price || currentPrice);
  const [stopLoss, setStopLoss] = useState<number | undefined>();
  const [takeProfit, setTakeProfit] = useState<number | undefined>();
  const [reduceOnly, setReduceOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (params) {
      setQuantity(params.quantity);
      setOrderType(params.type);
      setLimitPrice(params.price);
      setStopLoss(params.stopLoss);
      setTakeProfit(params.takeProfit);
      setReduceOnly(params.reduceOnly || false);
    }
  }, [params]);

  const handleQuickSize = (percent: number) => {
    const qty = (balance * (percent / 100)) / currentPrice;
    setQuantity(parseFloat(qty.toFixed(8)));
  };

  const handleConfirm = async () => {
    if (!params) return;

    setIsSubmitting(true);
    try {
      await onConfirm({
        ...params,
        quantity,
        type: orderType,
        price: orderType === "LIMIT" ? limitPrice : currentPrice,
        stopLoss,
        takeProfit,
        reduceOnly,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("One-click trade failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const estimatedTotal = quantity * (orderType === "LIMIT" ? limitPrice : currentPrice);
  const isBuy = params?.side === "BUY";

  // Calculate suggested SL/TP
  const suggestedSL = isBuy
    ? currentPrice * (1 - (config.defaultStopLossPercent || 2) / 100)
    : currentPrice * (1 + (config.defaultStopLossPercent || 2) / 100);
  
  const suggestedTP = isBuy
    ? currentPrice * (1 + (config.defaultTakeProfitPercent || 4) / 100)
    : currentPrice * (1 - (config.defaultTakeProfitPercent || 4) / 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isBuy ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            One-Click {params?.side || "Trade"}
          </DialogTitle>
          <DialogDescription>
            {params?.symbol} @ ${params?.price.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick Size Buttons */}
          <div className="space-y-2">
            <Label>Quick Size</Label>
            <div className="flex flex-wrap gap-2">
              {config.quickSizes.map((size) => (
                <Button
                  key={size}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickSize(size)}
                  className="text-xs"
                >
                  {size}%
                </Button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              step="0.00000001"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
            />
          </div>

          {/* Order Type */}
          <div className="space-y-2">
            <Label>Order Type</Label>
            <Select value={orderType} onValueChange={(v) => setOrderType(v as "MARKET" | "LIMIT")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKET">Market</SelectItem>
                <SelectItem value="LIMIT">Limit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Limit Price */}
          {orderType === "LIMIT" && (
            <div className="space-y-2">
              <Label htmlFor="limitPrice">Limit Price</Label>
              <Input
                id="limitPrice"
                type="number"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
              />
            </div>
          )}

          {/* Stop Loss */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="stopLoss">Stop Loss</Label>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6"
                onClick={() => setStopLoss(suggestedSL)}
              >
                Use suggested ({suggestedSL.toFixed(2)})
              </Button>
            </div>
            <Input
              id="stopLoss"
              type="number"
              step="0.01"
              value={stopLoss || ""}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || undefined)}
              placeholder="Optional"
            />
          </div>

          {/* Take Profit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="takeProfit">Take Profit</Label>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6"
                onClick={() => setTakeProfit(suggestedTP)}
              >
                Use suggested ({suggestedTP.toFixed(2)})
              </Button>
            </div>
            <Input
              id="takeProfit"
              type="number"
              step="0.01"
              value={takeProfit || ""}
              onChange={(e) => setTakeProfit(parseFloat(e.target.value) || undefined)}
              placeholder="Optional"
            />
          </div>

          {/* Reduce Only */}
          <div className="flex items-center justify-between">
            <Label htmlFor="reduceOnly">Reduce Only</Label>
            <Switch
              id="reduceOnly"
              checked={reduceOnly}
              onCheckedChange={setReduceOnly}
            />
          </div>

          {/* Summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated Total</span>
              <span className="font-medium">${estimatedTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span>${balance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">After Trade</span>
              <span className={cn(
                "font-medium",
                isBuy ? "text-red-500" : "text-green-500"
              )}>
                ${(balance - (isBuy ? estimatedTotal : -estimatedTotal)).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              className={cn(
                "flex-1",
                isBuy ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              )}
              onClick={handleConfirm}
              disabled={isSubmitting || quantity <= 0}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShoppingCart className="h-4 w-4 mr-2" />
              )}
              {isBuy ? "Buy" : "Sell"} {params?.symbol}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to setup one-click trading on chart
export function useOneClickTrading(
  chart: IChartApi | null,
  candleSeries: ISeriesApi<"Candlestick"> | null,
  config: OneClickTradingConfig
) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tradeParams, setTradeParams] = useState<OneClickTradeParams | null>(null);
  const currentPriceRef = useRef<number>(0);

  useEffect(() => {
    if (!chart || !candleSeries || !config.enabled) return;

    const handleClick = (param: MouseEventParams) => {
      if (!param.point || !param.time) return;

      const price = param.point.y;
      currentPriceRef.current = price;

      // Determine suggested side based on click position relative to current price
      const candleData = param.seriesData.get(candleSeries);
      const currentCandlePrice = candleData && "close" in candleData ? candleData.close : price;
      
      const suggestedSide: "BUY" | "SELL" = price < currentCandlePrice ? "BUY" : "SELL";

      setTradeParams({
        symbol: "BTCUSDT", // Default, should be passed from parent
        side: suggestedSide,
        price: price,
        quantity: config.defaultQuantity,
        type: config.defaultType,
      });
      setDialogOpen(true);
    };

    chart.subscribeClick(handleClick);

    return () => {
      chart.unsubscribeClick(handleClick);
    };
  }, [chart, candleSeries, config]);

  return {
    dialogOpen,
    setDialogOpen,
    tradeParams,
    setTradeParams,
  };
}
