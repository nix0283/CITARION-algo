"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Share2,
  Download,
  Copy,
  BarChart3,
  LineChart,
  Loader2,
  Check,
  Wallet,
  Eye,
  EyeOff,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

// Card dimensions (Binance/Bybit style - same aspect ratios)
const CARD_SIZES = {
  equity: { width: 1080, height: 720 },
  stats: { width: 1080, height: 1080 },
};

interface ShareStatsCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statsData?: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    avgProfit: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
    period: string;
    balance?: number;
    initialBalance?: number;
  };
  equityData?: {
    balanceHistory: { date: string; balance: number }[];
    totalPnL: number;
    totalPnLPercent: number;
    period: string;
    trades: number;
    winRate: number;
    initialBalance?: number;
  };
}

// Helper function for rounded rectangles
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function ShareStatsCard({ open, onOpenChange, statsData, equityData }: ShareStatsCardProps) {
  const [activeTab, setActiveTab] = useState("equity");
  const [isLoading, setIsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showBalanceInEquity, setShowBalanceInEquity] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reset image when tab changes
  useEffect(() => {
    setImageUrl(null);
  }, [activeTab, showBalanceInEquity]);

  // Draw Stats Card with optional balance
  const drawStatsCard = useCallback((ctx: CanvasRenderingContext2D, data: NonNullable<ShareStatsCardProps['statsData']>, includeBalance: boolean) => {
    const { width, height } = CARD_SIZES.stats;
    
    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#0f0f23");
    bgGrad.addColorStop(0.5, "#1a1a2e");
    bgGrad.addColorStop(1, "#16213e");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const isProfit = data.totalPnL >= 0;
    const pnlColor = isProfit ? "#22c55e" : "#ef4444";

    // Logo
    const logoGrad = ctx.createLinearGradient(48, 48, 112, 112);
    logoGrad.addColorStop(0, "#6366f1");
    logoGrad.addColorStop(0.5, "#a855f7");
    logoGrad.addColorStop(1, "#ec4899");
    ctx.fillStyle = logoGrad;
    roundRect(ctx, 48, 48, 64, 64, 16);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 32px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("C", 80, 92);

    ctx.textAlign = "left";
    ctx.fillStyle = "white";
    ctx.font = "bold 28px Inter, system-ui, sans-serif";
    ctx.fillText("CITARION", 128, 80);
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Trading Statistics", 128, 100);

    // Period badge
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, width - 200, 48, 150, 40, 20);
    ctx.fill();
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(data.period, width - 125, 74);

    // Balance section (only if includeBalance is true)
    let currentY = 150;
    if (includeBalance && data.balance) {
      // Balance card
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(99, 102, 241, 0.1)";
      roundRect(ctx, 48, currentY, width - 96, 80, 16);
      ctx.fill();
      
      ctx.fillStyle = "#6b7280";
      ctx.font = "14px Inter, system-ui, sans-serif";
      ctx.fillText("Account Balance", 72, currentY + 28);
      
      ctx.fillStyle = "white";
      ctx.font = "bold 32px Inter, system-ui, sans-serif";
      ctx.fillText(`$${data.balance.toFixed(2)}`, 72, currentY + 62);
      
      // Balance change indicator
      const balanceChange = data.balance - (data.initialBalance || 10000);
      const changePercent = ((balanceChange / (data.initialBalance || 10000)) * 100);
      ctx.fillStyle = balanceChange >= 0 ? "#22c55e" : "#ef4444";
      ctx.font = "bold 16px Inter, system-ui, sans-serif";
      ctx.fillText(`${balanceChange >= 0 ? "+" : ""}$${balanceChange.toFixed(2)} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(1)}%)`, width - 280, currentY + 52);
      
      currentY = 260;
    } else {
      currentY = 160;
    }

    // Win Rate Circle
    const centerX = width / 2;
    const centerY = currentY + 130;
    const radius = 120;

    // Background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 16;
    ctx.stroke();

    // Progress arc
    const winRateAngle = (data.winRate / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + winRateAngle);
    const progressGrad = ctx.createLinearGradient(centerX - radius, centerY, centerX + radius, centerY);
    progressGrad.addColorStop(0, "#22c55e");
    progressGrad.addColorStop(1, "#16a34a");
    ctx.strokeStyle = progressGrad;
    ctx.lineWidth = 16;
    ctx.stroke();

    // Inner circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 30, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();

    // Win rate text
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 48px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${data.winRate.toFixed(1)}%`, centerX, centerY + 10);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "18px Inter, system-ui, sans-serif";
    ctx.fillText("Win Rate", centerX, centerY + 40);

    // Win/Loss/Total stats
    const statsY = currentY + 320;
    ctx.textAlign = "center";
    
    // Wins
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 48px Inter, system-ui, sans-serif";
    ctx.fillText(data.winningTrades.toString(), width / 4, statsY);
    ctx.fillStyle = "#6b7280";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText("Wins", width / 4, statsY + 28);

    // Losses
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 48px Inter, system-ui, sans-serif";
    ctx.fillText(data.losingTrades.toString(), width / 2, statsY);
    ctx.fillStyle = "#6b7280";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText("Losses", width / 2, statsY + 28);

    // Total
    ctx.fillStyle = "white";
    ctx.font = "bold 48px Inter, system-ui, sans-serif";
    ctx.fillText(data.totalTrades.toString(), (width * 3) / 4, statsY);
    ctx.fillStyle = "#6b7280";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText("Total", (width * 3) / 4, statsY + 28);

    // Total PnL Box
    ctx.textAlign = "left";
    ctx.fillStyle = `${pnlColor}22`;
    roundRect(ctx, 48, statsY + 80, width - 96, 100, 24);
    ctx.fill();
    ctx.strokeStyle = `${pnlColor}44`;
    ctx.lineWidth = 2;
    roundRect(ctx, 48, statsY + 80, width - 96, 100, 24);
    ctx.stroke();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText("Total PnL", 72, statsY + 115);
    ctx.fillStyle = pnlColor;
    ctx.font = "bold 40px Inter, system-ui, sans-serif";
    ctx.fillText(`${isProfit ? "+" : ""}${data.totalPnL.toFixed(2)} USDT`, 72, statsY + 160);

    // Detail stats grid
    const detailY = statsY + 210;
    const detailWidth = (width - 144) / 2;
    
    // Avg Profit
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, 48, detailY, detailWidth, 80, 16);
    ctx.fill();
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Average Profit", 72, detailY + 28);
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 24px Inter, system-ui, sans-serif";
    ctx.fillText(`+${data.avgProfit.toFixed(2)} USDT`, 72, detailY + 60);

    // Avg Loss
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, width / 2 + 24, detailY, detailWidth, 80, 16);
    ctx.fill();
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Average Loss", width / 2 + 48, detailY + 28);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 24px Inter, system-ui, sans-serif";
    ctx.fillText(`${data.avgLoss.toFixed(2)} USDT`, width / 2 + 48, detailY + 60);

    // Best Trade
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, 48, detailY + 100, detailWidth, 80, 16);
    ctx.fill();
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Best Trade", 72, detailY + 128);
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 24px Inter, system-ui, sans-serif";
    ctx.fillText(`+${data.bestTrade.toFixed(2)} USDT`, 72, detailY + 160);

    // Worst Trade
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, width / 2 + 24, detailY + 100, detailWidth, 80, 16);
    ctx.fill();
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Worst Trade", width / 2 + 48, detailY + 128);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 24px Inter, system-ui, sans-serif";
    ctx.fillText(`${data.worstTrade.toFixed(2)} USDT`, width / 2 + 48, detailY + 160);

    // Footer
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("", 48, height - 32);
    ctx.textAlign = "right";
    ctx.fillText("Generated by CITARION", width - 48, height - 32);
  }, []);

  // Draw Equity Curve Card
  const drawEquityCard = useCallback((ctx: CanvasRenderingContext2D, data: NonNullable<ShareStatsCardProps['equityData']>, includeBalance: boolean) => {
    const { width, height } = CARD_SIZES.equity;
    
    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#0f0f23");
    bgGrad.addColorStop(0.5, "#1a1a2e");
    bgGrad.addColorStop(1, "#16213e");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const isProfit = data.totalPnL >= 0;
    const pnlColor = isProfit ? "#22c55e" : "#ef4444";

    // Logo
    const logoGrad = ctx.createLinearGradient(48, 48, 104, 104);
    logoGrad.addColorStop(0, "#6366f1");
    logoGrad.addColorStop(0.5, "#a855f7");
    logoGrad.addColorStop(1, "#ec4899");
    ctx.fillStyle = logoGrad;
    roundRect(ctx, 48, 48, 56, 56, 14);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 28px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("C", 76, 88);

    ctx.textAlign = "left";
    ctx.fillStyle = "white";
    ctx.font = "bold 24px Inter, system-ui, sans-serif";
    ctx.fillText("CITARION", 120, 75);
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText(`Equity Curve • ${data.period}`, 120, 95);

    // Balance section (if included)
    let statsY = 140;
    if (includeBalance && data.balanceHistory.length > 0) {
      const currentBalance = data.balanceHistory[data.balanceHistory.length - 1].balance;
      
      ctx.fillStyle = "#9ca3af";
      ctx.font = "14px Inter, system-ui, sans-serif";
      ctx.fillText("Current Balance", 48, statsY);
      ctx.fillStyle = "white";
      ctx.font = "bold 32px Inter, system-ui, sans-serif";
      ctx.fillText(`$${currentBalance.toFixed(2)}`, 48, statsY + 38);
      
      statsY = 200;
    }

    // Total PnL
    ctx.fillStyle = "#9ca3af";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText("Total PnL", 48, statsY);
    ctx.fillStyle = pnlColor;
    ctx.font = "bold 48px Inter, system-ui, sans-serif";
    ctx.fillText(`${isProfit ? "+" : ""}${data.totalPnL.toFixed(2)} USDT`, 48, statsY + 50);
    ctx.font = "bold 24px Inter, system-ui, sans-serif";
    ctx.fillText(`${isProfit ? "+" : ""}${data.totalPnLPercent.toFixed(2)}%`, 48, statsY + 85);

    // Chart area
    const chartX = 48;
    const chartY = statsY + 120;
    const chartWidth = width - 96;
    const chartHeight = 280;

    // Chart background
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    roundRect(ctx, chartX, chartY, chartWidth, chartHeight, 16);
    ctx.fill();

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = chartY + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(chartX + 24, y);
      ctx.lineTo(chartX + chartWidth - 24, y);
      ctx.stroke();
    }

    // Draw equity curve
    if (data.balanceHistory.length > 1) {
      const balances = data.balanceHistory.map(b => b.balance);
      const minBalance = Math.min(...balances);
      const maxBalance = Math.max(...balances);
      const range = maxBalance - minBalance || 1;

      const points = data.balanceHistory.map((point, i) => ({
        x: chartX + 24 + (i / (data.balanceHistory.length - 1)) * (chartWidth - 48),
        y: chartY + chartHeight - 24 - ((point.balance - minBalance) / range) * (chartHeight - 48),
      }));

      // Area fill
      ctx.beginPath();
      ctx.moveTo(points[0].x, chartY + chartHeight - 24);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, chartY + chartHeight - 24);
      ctx.closePath();
      const areaGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartHeight);
      areaGrad.addColorStop(0, `${pnlColor}40`);
      areaGrad.addColorStop(1, `${pnlColor}00`);
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = pnlColor;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    // Stats row
    const bottomStatsY = chartY + chartHeight + 50;
    ctx.textAlign = "left";
    
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Total Trades", 48, bottomStatsY);
    ctx.fillStyle = "white";
    ctx.font = "bold 28px Inter, system-ui, sans-serif";
    ctx.fillText(data.trades.toString(), 48, bottomStatsY + 35);

    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Win Rate", width / 3, bottomStatsY);
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 28px Inter, system-ui, sans-serif";
    ctx.fillText(`${data.winRate.toFixed(1)}%`, width / 3, bottomStatsY + 35);

    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("Period", (width * 2) / 3, bottomStatsY);
    ctx.fillStyle = "white";
    ctx.font = "bold 28px Inter, system-ui, sans-serif";
    ctx.fillText(data.period, (width * 2) / 3, bottomStatsY + 35);

    // Footer
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillText("", 48, height - 32);
    ctx.textAlign = "right";
    ctx.fillText("Generated by CITARION", width - 48, height - 32);
  }, []);

  const generateCard = async () => {
    setIsLoading(true);
    
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      let size = CARD_SIZES.equity;
      if (activeTab === "stats" || activeTab === "stats_full") size = CARD_SIZES.stats;

      canvas.width = size.width;
      canvas.height = size.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Determine if balance should be shown
      const includeBalance = activeTab === "stats_full" || (activeTab === "equity" && showBalanceInEquity);

      if (activeTab === "stats" && statsData) {
        drawStatsCard(ctx, statsData, false);
      } else if (activeTab === "stats_full" && statsData) {
        drawStatsCard(ctx, statsData, true);
      } else if (activeTab === "equity" && equityData) {
        drawEquityCard(ctx, equityData, includeBalance);
      } else {
        // Demo data
        if (activeTab === "stats") {
          drawStatsCard(ctx, {
            totalTrades: 156,
            winningTrades: 107,
            losingTrades: 49,
            winRate: 68.6,
            totalPnL: 3428.75,
            avgProfit: 87.50,
            avgLoss: 42.30,
            bestTrade: 523.40,
            worstTrade: -187.20,
            period: "Last 30 Days",
            balance: undefined,
            initialBalance: 10000,
          }, false);
        } else if (activeTab === "stats_full") {
          drawStatsCard(ctx, {
            totalTrades: 156,
            winningTrades: 107,
            losingTrades: 49,
            winRate: 68.6,
            totalPnL: 3428.75,
            avgProfit: 87.50,
            avgLoss: 42.30,
            bestTrade: 523.40,
            worstTrade: -187.20,
            period: "Last 30 Days",
            balance: 13428.75,
            initialBalance: 10000,
          }, true);
        } else if (activeTab === "equity") {
          const days = 30;
          const balanceHistory: { date: string; balance: number }[] = [];
          let balance = 10000;
          for (let i = 0; i < days; i++) {
            balance += (Math.random() - 0.4) * 200;
            balanceHistory.push({
              date: new Date(Date.now() - (days - i) * 86400000).toISOString(),
              balance: balance,
            });
          }
          drawEquityCard(ctx, {
            balanceHistory,
            totalPnL: balance - 10000,
            totalPnLPercent: ((balance - 10000) / 10000) * 100,
            period: "30 Days",
            trades: 47,
            winRate: 68.5,
            initialBalance: 10000,
          }, includeBalance);
        }
      }

      setImageUrl(canvas.toDataURL("image/png"));
    } catch (error) {
      console.error("Error generating card:", error);
      toast.error("Ошибка при генерации карточки");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!imageUrl) return;

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `citarion-${activeTab}-card.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Изображение скачано");
  };

  const handleCopy = async () => {
    if (!imageUrl) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      toast.success("Изображение скопировано");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Не удалось скопировать");
    }
  };

  const handleShare = async () => {
    if (!imageUrl) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `citarion-${activeTab}-card.png`, { type: "image/png" });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "CITARION Trading",
          text: "My trading performance on CITARION",
          files: [file],
        });
      } else {
        handleCopy();
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        handleCopy();
      }
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setImageUrl(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Поделиться статистикой
          </DialogTitle>
          <DialogDescription>
            Создайте красивую карточку для публикации в социальных сетях
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="equity" className="flex items-center gap-1 text-xs sm:text-sm">
              <LineChart className="h-4 w-4" />
              <span className="hidden sm:inline">Кривая</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-1 text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Винрейт</span>
            </TabsTrigger>
            <TabsTrigger value="stats_full" className="flex items-center gap-1 text-xs sm:text-sm">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">С балансом</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="equity" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              График изменения баланса за выбранный период.
            </p>
            {/* Balance toggle for equity */}
            <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
              <Switch
                id="show-balance-equity"
                checked={showBalanceInEquity}
                onCheckedChange={setShowBalanceInEquity}
              />
              <Label htmlFor="show-balance-equity" className="flex items-center gap-2 cursor-pointer">
                {showBalanceInEquity ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                Показать баланс счёта
              </Label>
            </div>
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Статистика винрейта без отображения баланса.
            </p>
            <p className="text-xs text-muted-foreground/70">
              * Успешной считается сделка с положительным PnL (с учётом комиссий и фандинга)
            </p>
          </TabsContent>

          <TabsContent value="stats_full" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Полная статистика с текущим балансом и изменением.
            </p>
            <p className="text-xs text-muted-foreground/70">
              * Успешной считается сделка с положительным PnL (с учётом комиссий и фандинга)
            </p>
          </TabsContent>
        </Tabs>

        {/* Hidden canvas for rendering */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Preview Area */}
        <div className="bg-muted/30 rounded-lg p-4 min-h-[200px] flex items-center justify-center overflow-auto">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Генерация...</span>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Share card"
              className="max-w-full max-h-[400px] rounded-lg shadow-lg object-contain"
            />
          ) : (
            <div className="text-center text-muted-foreground">
              <Share2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Нажмите "Создать" для генерации карточки</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={generateCard}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Создать
          </Button>
          
          {imageUrl && (
            <>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Скачать
              </Button>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? "Скопировано" : "Копировать"}
              </Button>
              <Button variant="default" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Поделиться
              </Button>
            </>
          )}
        </div>

        {/* Watermark notice */}
        <p className="text-xs text-muted-foreground text-center">
          Карточки создаются с водяным знаком CITARION
        </p>
      </DialogContent>
    </Dialog>
  );
}
