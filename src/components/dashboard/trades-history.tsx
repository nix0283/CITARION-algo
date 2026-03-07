"use client";

import { useCryptoStore, Trade } from "@/stores/crypto-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  History,
  TrendingUp,
  TrendingDown,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ShareCard } from "@/components/share/share-card";

export function TradesHistory() {
  const { trades, account } = useCryptoStore();
  const [filter, setFilter] = useState<"all" | "DEMO" | "REAL">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "OPEN" | "CLOSED">(
    "all"
  );
  const [showShareCard, setShowShareCard] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  const isDemo = account?.accountType === "DEMO";

  const filteredTrades = trades.filter((trade) => {
    if (filter === "DEMO" && !trade.isDemo) return false;
    if (filter === "REAL" && trade.isDemo) return false;
    if (statusFilter === "OPEN" && trade.status !== "OPEN") return false;
    if (statusFilter === "CLOSED" && trade.status !== "CLOSED") return false;
    return true;
  });

  const formatPrice = (price: number | undefined) => {
    if (!price) return "-";
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: price < 1 ? 4 : 2,
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleShareTrade = (trade: Trade) => {
    setSelectedTrade(trade);
    setShowShareCard(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-5 w-5 text-primary" />
              История сделок
              {trades.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {trades.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as typeof filter)}
              >
                <SelectTrigger className="w-[120px] h-8">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="DEMO">Demo</SelectItem>
                  <SelectItem value="REAL">Real</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="OPEN">Открытые</SelectItem>
                  <SelectItem value="CLOSED">Закрытые</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <History className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Нет сделок для отображения
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                История ваших trades появится здесь
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Пара</TableHead>
                    <TableHead className="w-[70px]">Сторона</TableHead>
                    <TableHead className="w-[80px]">Статус</TableHead>
                    <TableHead className="w-[90px]">Вход</TableHead>
                    <TableHead className="w-[90px]">Выход</TableHead>
                    <TableHead className="w-[80px]">PnL</TableHead>
                    <TableHead className="w-[70px]">Режим</TableHead>
                    <TableHead className="w-[100px]">Дата</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades.map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell className="font-medium">
                        {trade.symbol.replace("USDT", "/USDT")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            trade.direction === "LONG"
                              ? "bg-green-500/10 text-green-500 border-green-500/20"
                              : "bg-red-500/10 text-red-500 border-red-500/20"
                          )}
                        >
                          {trade.direction === "LONG" ? (
                            <ArrowUpRight className="mr-1 h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="mr-1 h-3 w-3" />
                          )}
                          {trade.direction}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-xs",
                            trade.status === "CLOSED" &&
                              trade.pnl >= 0 &&
                              "bg-green-500/10 text-green-500",
                            trade.status === "CLOSED" &&
                              trade.pnl < 0 &&
                              "bg-red-500/10 text-red-500"
                          )}
                        >
                          {trade.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        ${formatPrice(trade.entryPrice)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {trade.exitPrice ? `$${formatPrice(trade.exitPrice)}` : "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "font-mono text-sm font-medium",
                            trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                          )}
                        >
                          {trade.pnl >= 0 ? "+" : ""}
                          ${formatPrice(trade.pnl)}
                          <span className="text-xs text-muted-foreground ml-1">
                            ({(trade.pnlPercent ?? 0) >= 0 ? "+" : ""}
                            {(trade.pnlPercent ?? 0).toFixed(2)}%)
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            trade.isDemo ? "demo-badge" : "real-badge"
                          )}
                        >
                          {trade.isDemo ? "DEMO" : "REAL"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(trade.createdAt)}
                      </TableCell>
                      <TableCell>
                        {trade.status === "CLOSED" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleShareTrade(trade)}
                          >
                            <Share2 className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Share Card Dialog */}
      <ShareCard
        open={showShareCard}
        onOpenChange={setShowShareCard}
        tradeData={selectedTrade ? {
          symbol: selectedTrade.symbol,
          direction: selectedTrade.direction,
          entryPrice: selectedTrade.entryPrice || 0,
          exitPrice: selectedTrade.exitPrice || 0,
          pnl: selectedTrade.pnl,
          pnlPercent: selectedTrade.pnlPercent || 0,
          leverage: selectedTrade.leverage || 1,
          amount: selectedTrade.amount,
          exchange: account?.exchangeName || "Binance",
        } : undefined}
      />
    </>
  );
}
