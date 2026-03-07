"use client";

import { useState, useEffect } from "react";
import { useCryptoStore, Position } from "@/stores/crypto-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  X,
  Layers,
  Clock,
  Loader2,
  Building2,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ShareCard } from "@/components/share/share-card";

interface ApiPosition {
  id: string;
  symbol: string;
  direction: string;
  totalAmount: number;
  avgEntryPrice: number;
  currentPrice: number;
  leverage: number;
  unrealizedPnl: number;
  stopLoss: number | null;
  takeProfit: number | null;
  createdAt: string;
  account: {
    exchangeId: string;
    exchangeName: string;
    isTestnet: boolean;
  };
}

export function PositionsTable() {
  const { account, removePosition } = useCryptoStore();
  const [apiPositions, setApiPositions] = useState<ApiPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [showShareCard, setShowShareCard] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<ApiPosition | null>(null);
  
  const isDemo = account?.accountType === "DEMO";

  // Fetch positions from API
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const response = await fetch("/api/trade/open?demo=true");
        const data = await response.json();
        if (data.success) {
          setApiPositions(data.positions || []);
        }
      } catch (error) {
        console.error("Failed to fetch positions:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPositions();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleClosePosition = async (positionId: string) => {
    try {
      setClosingId(positionId);
      
      const response = await fetch("/api/trade/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionId }),
      });

      const result = await response.json();
      
      if (result.success) {
        // Remove from local state
        setApiPositions(prev => prev.filter(p => p.id !== positionId));
        removePosition(positionId);
        
        const pnl = result.pnl?.value || 0;
        const pnlEmoji = pnl >= 0 ? "🟢" : "🔴";
        toast.success(`${pnlEmoji} Позиция закрыта. PnL: $${pnl.toFixed(2)}`);
      } else {
        toast.error(result.error || "Ошибка при закрытии позиции");
      }
    } catch (error) {
      console.error("Failed to close position:", error);
      toast.error("Ошибка при закрытии позиции");
    } finally {
      setClosingId(null);
    }
  };

  const handleSharePosition = (position: ApiPosition) => {
    setSelectedPosition(position);
    setShowShareCard(true);
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: price < 1 ? 4 : 2,
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-5 w-5 text-primary" />
              Открытые позиции
              {apiPositions.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {apiPositions.length}
                </Badge>
              )}
              {isDemo && (
                <span className="text-xs text-amber-500 ml-1">[DEMO]</span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Загрузка позиций...</p>
            </div>
          ) : apiPositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Layers className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Нет открытых позиций
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Активные сделки будут отображаться здесь
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Биржа</TableHead>
                    <TableHead className="w-[100px]">Пара</TableHead>
                    <TableHead className="w-[80px]">Сторона</TableHead>
                    <TableHead className="w-[100px]">Размер</TableHead>
                    <TableHead className="w-[100px]">Цена входа</TableHead>
                    <TableHead className="w-[100px]">Текущая</TableHead>
                    <TableHead className="w-[60px]">Плечо</TableHead>
                    <TableHead className="w-[100px]">PnL</TableHead>
                    <TableHead className="w-[80px]">Время</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiPositions.map((position) => (
                    <TableRow key={position.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs">{position.account?.exchangeName || position.account?.exchangeId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {position.symbol.replace("USDT", "/USDT")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            position.direction === "LONG"
                              ? "bg-green-500/10 text-green-500 border-green-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20"
                          )}
                        >
                          {position.direction === "LONG" ? (
                            <TrendingUp className="mr-1 h-3 w-3" />
                          ) : (
                            <TrendingDown className="mr-1 h-3 w-3" />
                          )}
                          {position.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {position.totalAmount.toFixed(4)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        ${formatPrice(position.avgEntryPrice)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        ${formatPrice(position.currentPrice)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {position.leverage}x
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "font-mono text-sm font-medium",
                            position.unrealizedPnl >= 0
                              ? "text-green-500"
                              : "text-red-500"
                          )}
                        >
                          {position.unrealizedPnl >= 0 ? "+" : ""}
                          ${formatPrice(position.unrealizedPnl)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(position.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleSharePosition(position)}
                            title="Поделиться"
                          >
                            <Share2 className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleClosePosition(position.id)}
                            disabled={closingId === position.id}
                            title="Закрыть позицию"
                          >
                            {closingId === position.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Share Card Dialog for Open Position */}
      <ShareCard
        open={showShareCard}
        onOpenChange={setShowShareCard}
        tradeData={selectedPosition ? {
          symbol: selectedPosition.symbol,
          direction: selectedPosition.direction as "LONG" | "SHORT",
          entryPrice: selectedPosition.avgEntryPrice,
          exitPrice: selectedPosition.currentPrice,
          pnl: selectedPosition.unrealizedPnl,
          pnlPercent: ((selectedPosition.currentPrice - selectedPosition.avgEntryPrice) / selectedPosition.avgEntryPrice) * 100 * selectedPosition.leverage,
          leverage: selectedPosition.leverage,
          amount: selectedPosition.totalAmount * selectedPosition.avgEntryPrice,
          exchange: selectedPosition.account?.exchangeName || "Binance",
        } : undefined}
      />
    </>
  );
}
