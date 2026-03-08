"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FundingRate {
  symbol: string;
  exchange: string;
  rate: number;
  markPrice: number;
  timestamp: string;
}

interface FundingPayment {
  symbol: string;
  direction: string;
  payment: number;
  fundingTime: string;
}

export function FundingRateWidget() {
  const [fundingRates, setFundingRates] = useState<FundingRate[]>([]);
  const [totalFunding, setTotalFunding] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    fetchFundingRates();
    // Refresh every 10 minutes
    const interval = setInterval(fetchFundingRates, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchFundingRates = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/funding?rates=true");
      const data = await response.json();
      if (data.success) {
        setFundingRates(data.rates || []);
        setTotalFunding(data.totalFunding || 0);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch funding rates:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFundingColor = (rate: number) => {
    if (rate > 0.001) return "text-green-500";
    if (rate < -0.001) return "text-red-500";
    return "text-muted-foreground";
  };

  const getFundingBadge = (rate: number) => {
    const ratePercent = rate * 100;
    if (ratePercent > 0.1) {
      return <Badge className="bg-green-500/10 text-green-500">High Long</Badge>;
    }
    if (ratePercent < -0.1) {
      return <Badge className="bg-red-500/10 text-red-500">High Short</Badge>;
    }
    return <Badge variant="outline">Normal</Badge>;
  };

  const formatRate = (rate: number) => {
    const percent = rate * 100;
    return `${percent >= 0 ? "+" : ""}${percent.toFixed(4)}%`;
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    return `$${price.toFixed(4)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Funding Rates
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={fetchFundingRates}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {fundingRates.length > 0 ? (
          <>
            {/* Total Funding */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <span className="text-xs text-muted-foreground">Total Funding (24h)</span>
              <span className={cn(
                "text-sm font-bold",
                totalFunding >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {totalFunding >= 0 ? "+" : ""}${totalFunding.toFixed(2)}
              </span>
            </div>

            {/* Funding Rates List */}
            <div className="space-y-2">
              {fundingRates.slice(0, 5).map((fr, index) => (
                <div
                  key={`${fr.symbol}-${index}`}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-xs font-medium">{fr.symbol}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatPrice(fr.markPrice)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-xs font-medium", getFundingColor(fr.rate))}>
                      {formatRate(fr.rate)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {fr.exchange}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Warning if high funding */}
            {fundingRates.some(fr => Math.abs(fr.rate) > 0.001) && (
              <div className="flex items-start gap-2 p-2 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="text-xs">
                  Высокий funding rate. Проверьте позиции.
                </span>
              </div>
            )}

            {lastUpdate && (
              <div className="text-[10px] text-muted-foreground text-right">
                Updated: {lastUpdate.toLocaleTimeString("ru-RU")}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">Нет данных о funding rate</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
