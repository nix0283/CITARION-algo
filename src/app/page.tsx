"use client";

// CITARION Trading Dashboard - Full Integration
import { useState, useMemo, useSyncExternalStore } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PriceChart } from "@/components/chart/price-chart";
import { PriceProvider, usePriceContext } from "@/components/providers/price-provider";
import { useRealtimePrice } from "@/hooks/use-realtime-prices";
import { useCryptoStore } from "@/stores/crypto-store";
import { cn } from "@/lib/utils";

// Functional Components
import { BotConfigForm } from "@/components/bot/bot-config-form";
import { MultiChartPanel } from "@/components/chart/multi-chart-panel";
import { MiniChart } from "@/components/chart/mini-chart";
import { TradingForm } from "@/components/trading/trading-form";
import { StrategyLab } from "@/components/strategy-lab/strategy-lab";
import { HyperoptPanel } from "@/components/hyperopt/hyperopt-panel";
import { MLFilteringPanel } from "@/components/ml/ml-filtering-panel";
import { SignalScorerPanel } from "@/components/ml/signal-scorer-panel";
import { VolatilityPanel } from "@/components/volatility/volatility-panel";
import { GeneticOptimizerPanel } from "@/components/self-learning/genetic-optimizer-panel";
import { RiskDashboard } from "@/components/risk-management/risk-dashboard";
import { ConnectedAccounts } from "@/components/exchanges/connected-accounts";
import { PreviewPanel } from "@/components/preview/preview-panel";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";
import { TelegramSettings } from "@/components/telegram/telegram-settings";
import { AlertSystemPanel } from "@/components/alerts/alert-system-panel";
import { CopyTradingPanel } from "@/components/copy-trading/copy-trading-panel";
import { MasterTraderPanel } from "@/components/copy-trading/master-trader-panel";
import { InstitutionalBotsPanel } from "@/components/institutional-bots/institutional-bots-panel";
import { LogosPanel } from "@/components/bots/logos-panel";
import { GridBotManager } from "@/components/bots/grid-bot-manager";
import { DcaBotManager } from "@/components/bots/dca-bot-manager";
import { BBBotManager } from "@/components/bots/bb-bot-manager";
import { SpectrumBotPanel } from "@/components/bots/spectrum-bot-panel";
import { ReedBotPanel } from "@/components/bots/reed-bot-panel";
import { ArchitectBotPanel } from "@/components/bots/architect-bot-panel";
import { EquilibristBotPanel } from "@/components/bots/equilibrist-bot-panel";
import { KronBotPanel } from "@/components/bots/kron-bot-panel";
import { ArgusBotManager } from "@/components/bots/argus-bot-manager";
import { OrionBotManager } from "@/components/bots/orion-bot-manager";
import { VisionBotManager } from "@/components/bots/vision-bot-manager";
import { RangeBotManager } from "@/components/bots/range-bot-manager";
import { LumibotPanel } from "@/components/lumibot/lumibot-panel";
import { WolfBotPanel } from "@/components/bots/wolfbot-panel";
import { FrequencyBotPanel } from "@/components/bots/frequency-bot-panel";
import { HFTBotPanel } from "@/components/bots/hft-bot-panel";
import { MFTBotPanel } from "@/components/bots/mft-bot-panel";
import { LFTBotPanel } from "@/components/bots/lft-bot-panel";
import { ChatBot } from "@/components/chat/chat-bot";
import { PositionsTable } from "@/components/dashboard/positions-table";
import { HelpPanel } from "@/components/help/help-panel";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Bot,
  Signal,
  Wallet,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  Settings,
  RefreshCw,
  ChevronRight,
  DollarSign,
  Percent,
  Zap,
  Shield,
  Brain,
  LineChart as LineChartIcon,
  BookOpen,
  Calendar,
  Bell,
  Users,
  Globe,
  Building2,
  Newspaper,
  AlertCircle,
  ExternalLink,
  Flame,
  Lock,
  Unlock,
  ArrowRight,
  PieChart as PieChartIcon,
  Layers,
  FlaskConical,
  Sparkles,
  Filter,
  Gauge,
  Sigma,
  MessageSquare,
  MonitorPlay,
  FolderCode,
  Copy,
  Crown,
  HelpCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  demoBots,
  demoSignals,
  demoPositions,
  demoTrades,
  demoJournalEntries,
  demoEquityCurve,
  demoMetrics,
  demoPerformanceData,
  demoAssetAllocation,
  demoExchangeStatus,
  demoExchangeBalances,
  demoFundingRates,
  demoNews,
  demoCalendarEvents,
  type DemoBot,
  type DemoSignal,
  type DemoPosition,
  type DemoTrade,
  type DemoJournalEntry,
  type DemoExchangeBalance,
  type DemoFundingRate,
  type DemoNewsItem,
  type DemoCalendarEvent,
} from "@/lib/demo-data";

// ============================================
// Utility Functions
// ============================================

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatPercent = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

// Hook to track if component is mounted (prevents hydration mismatch)
// Using useSyncExternalStore is the recommended React 18+ pattern
const emptySubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

// Component to safely render time-dependent content
function TimeAgo({ date }: { date: Date }) {
  const mounted = useMounted();
  
  if (!mounted) {
    return <span>-</span>;
  }
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return <span>{days}d ago</span>;
  if (hours > 0) return <span>{hours}h ago</span>;
  return <span>{minutes}m ago</span>;
}

// Component to safely render current time
function CurrentTime({ date }: { date: Date | null }) {
  const mounted = useMounted();
  
  if (!mounted || !date) {
    return <span>-</span>;
  }
  
  return <span>{date.toLocaleTimeString()}</span>;
}

const formatTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${minutes}m ago`;
};

// ============================================
// Color Constants (Binance-like)
// ============================================

const COLORS = {
  success: "#0ECB81",
  error: "#F6465D",
  warning: "#F0B90B",
  primary: "#F0B90B",
  blue: "#3272FE",
  purple: "#8B5CF6",
  orange: "#F59E0B",
  cyan: "#06B6D4",
};

const PIE_COLORS = [COLORS.primary, COLORS.blue, COLORS.purple, COLORS.success, COLORS.orange];

// ============================================
// Dashboard Content Component
// ============================================

function DashboardContent() {
  const { activeTab, sidebarOpen, account } = useCryptoStore();
  const { connectionStatus, lastUpdated } = usePriceContext();
  const btcPrice = useRealtimePrice("BTCUSDT");
  const isDemo = account?.accountType === "DEMO";

  const [timeRange, setTimeRange] = useState<"1D" | "1W" | "1M" | "3M" | "1Y">("1M");
  const [selectedBotType, setSelectedBotType] = useState<string>("all");
  const [selectedSignalStatus, setSelectedSignalStatus] = useState<string>("all");

  // Filter data based on selections
  const filteredBots = useMemo(() => {
    if (selectedBotType === "all") return demoBots;
    return demoBots.filter((bot) => bot.type === selectedBotType);
  }, [selectedBotType]);

  const filteredSignals = useMemo(() => {
    if (selectedSignalStatus === "all") return demoSignals;
    return demoSignals.filter((signal) => signal.status === selectedSignalStatus);
  }, [selectedSignalStatus]);

  // Render different content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardView />;
      case "bots":
        return <BotsView bots={filteredBots} selectedType={selectedBotType} onTypeChange={setSelectedBotType} />;
      case "signals":
        return (
          <SignalsView
            signals={filteredSignals}
            selectedStatus={selectedSignalStatus}
            onStatusChange={setSelectedSignalStatus}
          />
        );
      case "positions":
        return <PositionsTable />;
      case "trades":
        return <TradesView trades={demoTrades} />;
      case "analytics":
        return <AnalyticsView equityCurve={demoEquityCurve} performanceData={demoPerformanceData} timeRange={timeRange} onTimeRangeChange={setTimeRange} />;
      case "journal":
        return <JournalView entries={demoJournalEntries} />;
      case "portfolio":
        return <PortfolioView balances={demoExchangeBalances} />;
      case "funding":
        return <FundingView fundingRates={demoFundingRates} />;
      case "news":
        return <NewsView news={demoNews} events={demoCalendarEvents} />;
      case "chart":
        return (
          <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
            <PriceChart />
          </div>
        );
      // Advanced Menu Items - Using Real Functional Components
      case "auto-trading-settings":
        return <BotConfigForm />;
      case "multi-chart":
        return (
          <MultiChartPanel
            renderChart={(symbol, timeframe, chartId) => (
              <MiniChart
                key={chartId}
                symbol={symbol}
                timeframe={timeframe}
                chartId={chartId}
              />
            )}
          />
        );
      case "trading":
        return <TradingForm />;
      case "strategy-lab":
        return <StrategyLab />;
      case "hyperopt":
        return <HyperoptPanel />;
      case "ml-filter":
        return <MLFilteringPanel />;
      case "signal-scorer":
        return <SignalScorerPanel />;
      case "volatility":
        return <VolatilityPanel />;
      case "self-learning":
        return <GeneticOptimizerPanel />;
      case "risk-management":
        return <RiskDashboard />;
      case "chat":
        return <ChatView />;
      case "exchanges":
        return <ConnectedAccounts />;
      // Bottom Menu Items - Using Real Functional Components
      case "preview":
        return <PreviewPanel />;
      case "workspace":
        return <WorkspacePanel />;
      case "notifications":
        return <NotificationsPanel />;
      case "telegram":
        return <TelegramSettings />;
      case "alerts":
        return <AlertSystemPanel />;
      case "help":
        return <HelpView />;
      // Bot Items - Meta
      case "logos":
        return <LogosPanel />;
      // Bot Items - Operational
      case "grid-bot":
        return <GridBotManager />;
      case "dca-bot":
        return <DcaBotManager />;
      case "bb-bot":
        return <BBBotManager />;
      // Bot Items - Institutional
      case "institutional-bots":
        return <InstitutionalBotsPanel />;
      case "spectrum-bot":
        return <SpectrumBotPanel />;
      case "reed-bot":
        return <ReedBotPanel />;
      case "architect-bot":
        return <ArchitectBotPanel />;
      case "equilibrist-bot":
        return <EquilibristBotPanel />;
      case "kron-bot":
        return <KronBotPanel />;
      // Bot Items - Analytical
      case "argus-bot":
        return <ArgusBotManager />;
      case "orion-bot":
        return <OrionBotManager />;
      case "vision-bot":
        return <VisionBotManager />;
      case "range-bot":
        return <RangeBotManager />;
      case "lumibot":
        return <LumibotPanel />;
      case "wolfbot":
        return <WolfBotPanel />;
      // Bot Items - Frequency
      case "frequency-bots":
        return <FrequencyBotPanel />;
      case "hft-bot":
        return <HFTBotPanel />;
      case "mft-bot":
        return <MFTBotPanel />;
      case "lft-bot":
        return <LFTBotPanel />;
      // Copy Trading Items
      case "copy-trading":
        return <CopyTradingPanel />;
      case "master-trading":
        return <MasterTraderPanel />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sidebar - Desktop only */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar - Drawer */}
      <div className="md:hidden">
        <Sidebar />
      </div>

      {/* Main Content */}
      <div
        className={cn(
          "relative z-10 transition-all duration-300 flex flex-col flex-1",
          "md:transition-none",
          sidebarOpen ? "md:ml-64" : "md:ml-16",
          "ml-0"
        )}
      >
        {/* Header - Sticky */}
        <Header />

        {/* Connection Status Bar */}
        <ConnectionStatusBar
          btcPrice={btcPrice}
          connectionStatus={connectionStatus}
          lastUpdated={lastUpdated}
          exchanges={demoExchangeStatus}
        />

        {/* Page Content */}
        <main className="p-3 md:p-6 flex-1 flex flex-col min-h-0 pb-20 md:pb-6">
          {renderContent()}
        </main>

        {/* Footer - Sticky at bottom */}
        <footer className="hidden md:block border-t border-border py-3 px-6 text-center text-xs text-muted-foreground mt-auto">
          <div className="flex items-center justify-center gap-2">
            <span className="font-semibold text-primary">CITARION</span>
            <span>© 2025</span>
            <span>•</span>
            <span>v2.0.0</span>
            {isDemo && (
              <>
                <span>•</span>
                <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                  DEMO
                </Badge>
              </>
            )}
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
}

// ============================================
// Connection Status Bar Component
// ============================================

interface ConnectionStatusBarProps {
  btcPrice: ReturnType<typeof useRealtimePrice>;
  connectionStatus: string;
  lastUpdated: Date | null;
  exchanges: typeof demoExchangeStatus;
}

function ConnectionStatusBar({ btcPrice, connectionStatus, lastUpdated, exchanges }: ConnectionStatusBarProps) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex px-6 py-2 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                connectionStatus === "connected" ? "bg-[#0ECB81] animate-pulse" : "bg-[#F0B90B]"
              )} />
              <span className="text-xs text-muted-foreground">
                {connectionStatus === "connected" ? "Connected" : "Connecting..."}
              </span>
            </div>

            {/* BTC Price */}
            {btcPrice && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-muted/50">
                <span className="text-xs font-medium">BTC</span>
                <span className="text-sm font-semibold">
                  ${btcPrice.price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span className={cn(
                  "text-xs font-medium",
                  btcPrice.change24h >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                )}>
                  {btcPrice.change24h >= 0 ? "+" : ""}{btcPrice.change24h.toFixed(2)}%
                </span>
              </div>
            )}

            {/* Exchange Status */}
            <div className="flex items-center gap-1">
              {exchanges.slice(0, 4).map((exchange) => (
                <Badge
                  key={exchange.name}
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    exchange.status === "connected"
                      ? "border-[#0ECB81]/30 text-[#0ECB81]"
                      : "border-red-500/30 text-red-500"
                  )}
                >
                  {exchange.name}
                </Badge>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            <CurrentTime date={lastUpdated} />
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden px-3 py-1.5 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              connectionStatus === "connected" ? "bg-[#0ECB81]" : "bg-[#F0B90B]"
            )} />
            {btcPrice && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/50">
                <span className="text-[10px] font-medium">BTC</span>
                <span className="text-xs font-semibold">
                  ${btcPrice.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">
            <CurrentTime date={lastUpdated} />
          </span>
        </div>
      </div>
    </>
  );
}

// ============================================
// Dashboard View (Main Overview)
// ============================================

function DashboardView() {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Total Balance"
          value={formatCurrency(demoMetrics.totalBalance)}
          change={demoMetrics.totalPnLPercent}
          icon={<Wallet className="h-4 w-4" />}
          trend="up"
        />
        <StatCard
          title="Today's P&L"
          value={formatCurrency(demoMetrics.dailyPnL)}
          change={demoMetrics.dailyPnLPercent}
          icon={<TrendingUp className="h-4 w-4" />}
          trend={demoMetrics.dailyPnL >= 0 ? "up" : "down"}
        />
        <StatCard
          title="Active Bots"
          value={`${demoMetrics.activeBots}/${demoMetrics.totalBots}`}
          subtitle="Running"
          icon={<Bot className="h-4 w-4" />}
          trend="neutral"
        />
        <StatCard
          title="Win Rate"
          value={`${demoMetrics.winRate}%`}
          subtitle={`${demoMetrics.totalTrades} trades`}
          icon={<Target className="h-4 w-4" />}
          trend="up"
        />
      </div>

      {/* Main Content Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Left Column: Chart + Quick Actions */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          {/* Equity Curve Chart */}
          <Card className="flex-1 min-h-[300px]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Equity Curve</CardTitle>
                  <CardDescription>Portfolio performance over time</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[#0ECB81] border-[#0ECB81]/30">
                    +{demoMetrics.monthlyPnLPercent.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[calc(100%-80px)]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={demoEquityCurve}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Equity"]}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke={COLORS.success}
                    strokeWidth={2}
                    fill="url(#equityGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Active Positions Preview */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#0ECB81]" />
                  Active Positions
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs">
                  View All <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {demoPositions.slice(0, 3).map((position) => (
                  <PositionRow key={position.id} position={position} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Signals + Bots */}
        <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
          {/* Active Signals */}
          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Signal className="h-4 w-4 text-blue-500" />
                  Active Signals
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {demoSignals.filter((s) => s.status === "active" || s.status === "in_progress").length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[300px]">
                <div className="space-y-2 p-4 pt-0">
                  {demoSignals.filter((s) => s.status === "active" || s.status === "in_progress").slice(0, 5).map((signal) => (
                    <SignalRow key={signal.id} signal={signal} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Running Bots */}
          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[#F0B90B]" />
                  Running Bots
                </CardTitle>
                <Badge variant="outline" className="text-xs text-[#0ECB81] border-[#0ECB81]/30">
                  {demoMetrics.activeBots} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[200px]">
                <div className="space-y-2 p-4 pt-0">
                  {demoBots.filter((b) => b.status === "running").slice(0, 4).map((bot) => (
                    <BotRow key={bot.id} bot={bot} />
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Row: Journal Preview + Allocation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Journal */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-purple-500" />
                Trading Journal
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs">
                View All <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {demoJournalEntries[0] && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{demoJournalEntries[0].title}</span>
                  <Badge variant="outline" className="text-xs">
                    {demoJournalEntries[0].trades} trades
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {demoJournalEntries[0].content}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className={demoJournalEntries[0].pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}>
                    {formatCurrency(demoJournalEntries[0].pnl)}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground"><TimeAgo date={demoJournalEntries[0].date} /></span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Asset Allocation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-500" />
              Asset Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={demoAssetAllocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={40}
                      paddingAngle={2}
                      dataKey="percent"
                    >
                      {demoAssetAllocation.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1">
                {demoAssetAllocation.slice(0, 4).map((asset, index) => (
                  <div key={asset.symbol} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index] }}
                      />
                      <span className="font-medium">{asset.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{asset.percent}%</span>
                      <span className={asset.change >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}>
                        {asset.change >= 0 ? "+" : ""}{asset.change}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// Bots View
// ============================================

interface BotsViewProps {
  bots: DemoBot[];
  selectedType: string;
  onTypeChange: (type: string) => void;
}

function BotsView({ bots, selectedType, onTypeChange }: BotsViewProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header with Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Trading Bots</h2>
          <Badge variant="outline">{bots.length} bots</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedType} onValueChange={onTypeChange}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Bot Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="grid">Grid</SelectItem>
              <SelectItem value="dca">DCA</SelectItem>
              <SelectItem value="bb">BB</SelectItem>
              <SelectItem value="argus">Argus</SelectItem>
              <SelectItem value="vision">Vision</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8">
            <Bot className="h-3.5 w-3.5 mr-1" />
            New Bot
          </Button>
        </div>
      </div>

      {/* Bots Grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bots.map((bot) => (
            <BotCard key={bot.id} bot={bot} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Signals View
// ============================================

interface SignalsViewProps {
  signals: DemoSignal[];
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

function SignalsView({ signals, selectedStatus, onStatusChange }: SignalsViewProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header with Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Trading Signals</h2>
          <Badge variant="outline">{signals.length} signals</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedStatus} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="drawdown">Drawdown</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Signals Grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Positions View
// ============================================

interface PositionsViewProps {
  positions: DemoPosition[];
}

function PositionsView({ positions }: PositionsViewProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Active Positions</h2>
        <Badge variant="outline">{positions.length} positions</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Symbol</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Side</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Size</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Entry</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Current</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">P&L</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">ROE</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Bot</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium text-sm">{position.symbol}</div>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={position.side === "long" ? "text-[#0ECB81] border-[#0ECB81]/30" : "text-[#F6465D] border-[#F6465D]/30"}
                      >
                        {position.side.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-3 text-right text-sm">{position.size}</td>
                    <td className="p-3 text-right text-sm font-mono">{formatCurrency(position.entryPrice)}</td>
                    <td className="p-3 text-right text-sm font-mono">{formatCurrency(position.currentPrice)}</td>
                    <td className={`p-3 text-right text-sm font-medium ${position.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                      {formatCurrency(position.pnl)}
                      <span className="text-xs ml-1">({formatPercent(position.pnlPercent)})</span>
                    </td>
                    <td className={`p-3 text-right text-sm ${position.roe >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                      {formatPercent(position.roe)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{position.botName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Trades View
// ============================================

interface TradesViewProps {
  trades: DemoTrade[];
}

function TradesView({ trades }: TradesViewProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trade History</h2>
        <Badge variant="outline">{trades.length} trades</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Time</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Symbol</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Side</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Type</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Price</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Amount</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Total</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">P&L</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Exchange</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 text-xs text-muted-foreground"><TimeAgo date={trade.timestamp} /></td>
                    <td className="p-3 font-medium text-sm">{trade.symbol}</td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={trade.side === "buy" ? "text-[#0ECB81] border-[#0ECB81]/30" : "text-[#F6465D] border-[#F6465D]/30"}
                      >
                        {trade.side.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{trade.type.toUpperCase()}</td>
                    <td className="p-3 text-right text-sm font-mono">{formatCurrency(trade.price)}</td>
                    <td className="p-3 text-right text-sm">{trade.amount}</td>
                    <td className="p-3 text-right text-sm font-mono">{formatCurrency(trade.total)}</td>
                    <td className={`p-3 text-right text-sm font-medium ${trade.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>
                      {formatCurrency(trade.pnl)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{trade.exchange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Analytics View
// ============================================

interface AnalyticsViewProps {
  equityCurve: typeof demoEquityCurve;
  performanceData: typeof demoPerformanceData;
  timeRange: string;
  onTimeRangeChange: (range: "1D" | "1W" | "1M" | "3M" | "1Y") => void;
}

function AnalyticsView({ equityCurve, performanceData, timeRange, onTimeRangeChange }: AnalyticsViewProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="flex gap-1">
          {["1D", "1W", "1M", "3M", "1Y"].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onTimeRangeChange(range as "1D" | "1W" | "1M" | "3M" | "1Y")}
            >
              {range}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Total P&L</div>
            <div className="text-xl font-bold text-[#0ECB81]">{formatCurrency(demoMetrics.totalPnL)}</div>
            <div className="text-xs text-[#0ECB81]">+{demoMetrics.totalPnLPercent}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
            <div className="text-xl font-bold">{demoMetrics.winRate}%</div>
            <Progress value={demoMetrics.winRate} className="h-1 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Sharpe Ratio</div>
            <div className="text-xl font-bold">{demoMetrics.sharpeRatio}</div>
            <div className="text-xs text-[#0ECB81]">Excellent</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Max Drawdown</div>
            <div className="text-xl font-bold text-[#F6465D]">-{demoMetrics.maxDrawdown}%</div>
            <div className="text-xs text-muted-foreground">Historical</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily P&L */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily P&L</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData.weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [formatCurrency(value), "P&L"]}
                />
                <Bar
                  dataKey="pnl"
                  fill={COLORS.primary}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Equity Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portfolio Growth</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [formatCurrency(value), "Equity"]}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke={COLORS.success}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// Journal View
// ============================================

interface JournalViewProps {
  entries: DemoJournalEntry[];
}

function JournalView({ entries }: JournalViewProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trading Journal</h2>
        <Button size="sm">
          <BookOpen className="h-3.5 w-3.5 mr-1" />
          New Entry
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{entry.title}</CardTitle>
                    <CardDescription>
                      {entry.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={entry.pnl >= 0 ? "text-[#0ECB81] border-[#0ECB81]/30" : "text-[#F6465D] border-[#F6465D]/30"}
                    >
                      {formatCurrency(entry.pnl)}
                    </Badge>
                    <Badge variant="outline">{entry.winRate}% win</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{entry.content}</p>

                {entry.lessons.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs font-medium text-[#0ECB81] mb-1">Lessons:</div>
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                      {entry.lessons.slice(0, 2).map((lesson, i) => (
                        <li key={i}>{lesson}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.mistakes.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[#F6465D] mb-1">Mistakes:</div>
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                      {entry.mistakes.slice(0, 2).map((mistake, i) => (
                        <li key={i}>{mistake}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <div className="flex items-center gap-2 flex-wrap">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================
// Reusable Components
// ============================================

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  subtitle?: string;
  icon: React.ReactNode;
  trend: "up" | "down" | "neutral";
}

function StatCard({ title, value, change, subtitle, icon, trend }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground mb-1">{title}</div>
            <div className="text-xl font-bold">{value}</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
            {change !== undefined && (
              <div className={cn(
                "text-xs font-medium mt-1 flex items-center gap-1",
                trend === "up" ? "text-[#0ECB81]" : trend === "down" ? "text-[#F6465D]" : "text-muted-foreground"
              )}>
                {trend === "up" && <ArrowUpRight className="h-3 w-3" />}
                {trend === "down" && <ArrowDownRight className="h-3 w-3" />}
                {formatPercent(change)}
              </div>
            )}
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            trend === "up" ? "bg-[#0ECB81]/10 text-[#0ECB81]" :
            trend === "down" ? "bg-[#F6465D]/10 text-[#F6465D]" :
            "bg-muted text-muted-foreground"
          )}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface PositionRowProps {
  position: DemoPosition;
}

function PositionRow({ position }: PositionRowProps) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="font-medium text-sm">{position.symbol}</span>
          <span className="text-xs text-muted-foreground">{position.botName}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Badge
          variant="outline"
          className={position.side === "long" ? "text-[#0ECB81] border-[#0ECB81]/30" : "text-[#F6465D] border-[#F6465D]/30"}
        >
          {position.side.toUpperCase()} {position.leverage}x
        </Badge>
        <div className="text-right">
          <div className={cn("font-medium text-sm", position.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
            {formatCurrency(position.pnl)}
          </div>
          <div className={cn("text-xs", position.pnlPercent >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
            {formatPercent(position.pnlPercent)}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SignalRowProps {
  signal: DemoSignal;
}

function SignalRow({ signal }: SignalRowProps) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-1 h-8 rounded-full",
          signal.status === "active" ? "bg-blue-500" :
          signal.status === "in_progress" ? "bg-[#0ECB81]" :
          signal.status === "drawdown" ? "bg-[#F6465D]" :
          "bg-muted-foreground"
        )} />
        <div className="flex flex-col">
          <span className="font-medium text-sm">{signal.symbol}</span>
          <span className="text-xs text-muted-foreground">{signal.provider}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className={signal.side === "long" ? "text-[#0ECB81] border-[#0ECB81]/30" : "text-[#F6465D] border-[#F6465D]/30"}
        >
          {signal.side.toUpperCase()}
        </Badge>
        <div className="text-right">
          <div className={cn("font-medium text-sm", signal.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
            {formatCurrency(signal.pnl)}
          </div>
          <div className="text-xs text-muted-foreground">{signal.timeInTrade}</div>
        </div>
      </div>
    </div>
  );
}

interface BotRowProps {
  bot: DemoBot;
}

function BotRow({ bot }: BotRowProps) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-[#0ECB81] animate-pulse" />
        <div className="flex flex-col">
          <span className="font-medium text-sm">{bot.name}</span>
          <span className="text-xs text-muted-foreground">{bot.exchange}</span>
        </div>
      </div>
      <div className="text-right">
        <div className={cn("font-medium text-sm", bot.profit >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
          {formatCurrency(bot.profit)}
        </div>
        <div className={cn("text-xs", bot.profitPercent >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
          {formatPercent(bot.profitPercent)}
        </div>
      </div>
    </div>
  );
}

interface BotCardProps {
  bot: DemoBot;
}

function BotCard({ bot }: BotCardProps) {
  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      bot.status === "error" && "border-[#F6465D]/30"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              bot.status === "running" && "bg-[#0ECB81] animate-pulse",
              bot.status === "paused" && "bg-[#F0B90B]",
              bot.status === "stopped" && "bg-gray-400",
              bot.status === "error" && "bg-[#F6465D]"
            )} />
            <CardTitle className="text-base">{bot.name}</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              bot.status === "running" && "text-[#0ECB81] border-[#0ECB81]/30",
              bot.status === "paused" && "text-[#F0B90B] border-[#F0B90B]/30",
              bot.status === "stopped" && "text-gray-400 border-gray-400/30",
              bot.status === "error" && "text-[#F6465D] border-[#F6465D]/30"
            )}
          >
            {bot.status.toUpperCase()}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-2">
          <span>{bot.exchange}</span>
          <span>•</span>
          <span>{bot.symbol}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">ROI</div>
            <div className={cn("font-semibold", bot.ROI >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
              {formatPercent(bot.ROI)}
            </div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className="font-semibold">{bot.winRate}%</div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">Profit</div>
            <div className={cn("font-semibold", bot.profit >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
              {formatCurrency(bot.profit)}
            </div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">Drawdown</div>
            <div className={cn("font-semibold", bot.drawdown > 20 ? "text-[#F6465D]" : "text-[#F0B90B]")}>
              -{bot.drawdown}%
            </div>
          </div>
        </div>

        {/* Risk Meter */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Risk Level</span>
            <span className={cn(
              "font-medium",
              bot.riskLevel === "low" && "text-[#0ECB81]",
              bot.riskLevel === "medium" && "text-[#F0B90B]",
              bot.riskLevel === "high" && "text-orange-500",
              bot.riskLevel === "critical" && "text-[#F6465D]"
            )}>
              {bot.riskLevel.toUpperCase()}
            </span>
          </div>
          <Progress
            value={
              bot.riskLevel === "low" ? 25 :
              bot.riskLevel === "medium" ? 50 :
              bot.riskLevel === "high" ? 75 : 100
            }
            className={cn(
              "h-1",
              bot.riskLevel === "critical" && "[&>div]:bg-[#F6465D]"
            )}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <div className="text-xs text-muted-foreground">
          <Clock className="h-3 w-3 inline mr-1" />
          {bot.uptime}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            {bot.status === "running" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

interface SignalCardProps {
  signal: DemoSignal;
}

function SignalCard({ signal }: SignalCardProps) {
  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      signal.status === "drawdown" && "border-[#F6465D]/30"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              signal.status === "active" && "bg-blue-500",
              signal.status === "in_progress" && "bg-[#0ECB81] animate-pulse",
              signal.status === "drawdown" && "bg-[#F6465D] animate-pulse",
              signal.status === "completed" && "bg-gray-400"
            )} />
            <CardTitle className="text-base">{signal.symbol}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={signal.side === "long" ? "text-[#0ECB81] border-[#0ECB81]/30" : "text-[#F6465D] border-[#F6465D]/30"}
            >
              {signal.side.toUpperCase()} {signal.leverage}x
            </Badge>
          </div>
        </div>
        <CardDescription>{signal.provider}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Price Info */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Entry</div>
            <div className="font-mono">{formatCurrency(signal.entryPrice)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Target</div>
            <div className="font-mono text-[#0ECB81]">{formatCurrency(signal.targetPrice)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Stop</div>
            <div className="font-mono text-[#F6465D]">{formatCurrency(signal.stopLoss)}</div>
          </div>
        </div>

        {/* Progress */}
        {(signal.status === "active" || signal.status === "in_progress") && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{signal.progress}%</span>
            </div>
            <Progress value={signal.progress} className="h-1" />
          </div>
        )}

        {/* Drawdown Warning */}
        {signal.status === "drawdown" && signal.drawdownPercent && (
          <div className="flex items-center gap-2 p-2 rounded bg-[#F6465D]/10 text-xs text-[#F6465D]">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Drawdown: -{signal.drawdownPercent}% (Max: -{signal.maxDrawdown}%)</span>
          </div>
        )}

        {/* P&L */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            <Clock className="h-3 w-3 inline mr-1" />
            {signal.timeInTrade}
          </div>
          <div className="text-right">
            <div className={cn("font-semibold", signal.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
              {formatCurrency(signal.pnl)}
            </div>
            <div className={cn("text-xs", signal.pnlPercent >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
              {formatPercent(signal.pnlPercent)}
            </div>
          </div>
        </div>

        {/* Confidence */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <div className="flex items-center gap-2">
            <Progress value={signal.confidence * 100} className="w-16 h-1" />
            <span className="font-medium">{Math.round(signal.confidence * 100)}%</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <Badge variant="secondary" className="text-xs">{signal.source}</Badge>
        {signal.botName && (
          <span className="text-xs text-muted-foreground">via {signal.botName}</span>
        )}
      </CardFooter>
    </Card>
  );
}

// ============================================
// Portfolio View (Exchange Balances)
// ============================================

interface PortfolioViewProps {
  balances: DemoExchangeBalance[];
}

function PortfolioView({ balances }: PortfolioViewProps) {
  const [selectedExchange, setSelectedExchange] = useState<string>("all");

  const filteredBalances = useMemo(() => {
    if (selectedExchange === "all") return balances;
    return balances.filter((b) => b.exchange === selectedExchange);
  }, [balances, selectedExchange]);

  const totalBalance = useMemo(() => 
    balances.reduce((sum, b) => sum + b.totalBalanceUSDT, 0),
    [balances]
  );

  const totalPnl = useMemo(() => 
    balances.reduce((sum, b) => sum + b.todayPnl, 0),
    [balances]
  );

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Portfolio Overview</h2>
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrency(totalBalance)} • Today: <span className={totalPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}>{formatCurrency(totalPnl)}</span>
          </p>
        </div>
        <Select value={selectedExchange} onValueChange={setSelectedExchange}>
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue placeholder="Exchange" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Exchanges</SelectItem>
            {balances.map((b) => (
              <SelectItem key={b.exchange} value={b.exchange}>{b.exchange}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Exchange Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {filteredBalances.map((exchange) => (
          <Card key={exchange.exchange} className="overflow-hidden">
            <CardHeader className="pb-2 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">{exchange.exchange}</CardTitle>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    exchange.apiStatus === "connected" ? "text-[#0ECB81] border-[#0ECB81]/30" :
                    exchange.apiStatus === "rate_limited" ? "text-[#F0B90B] border-[#F0B90B]/30" :
                    "text-[#F6465D] border-[#F6465D]/30"
                  )}
                >
                  {exchange.apiStatus === "connected" ? "●" : exchange.apiStatus === "rate_limited" ? "◐" : "○"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Total Balance</div>
                  <div className="text-xl font-bold">{formatCurrency(exchange.totalBalanceUSDT)}</div>
                </div>
                <div className="text-right">
                  <div className={cn("text-sm font-medium", exchange.todayPnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                    {formatCurrency(exchange.todayPnl)}
                  </div>
                  <div className={cn("text-xs", exchange.todayPnlPercent >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                    {formatPercent(exchange.todayPnlPercent)}
                  </div>
                </div>
              </div>
              
              {/* Balance breakdown */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded bg-muted/30">
                  <div className="text-muted-foreground">Available</div>
                  <div className="font-medium">{formatCurrency(exchange.availableUSDT)}</div>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <div className="text-muted-foreground">In Orders</div>
                  <div className="font-medium">{formatCurrency(exchange.inOrderUSDT)}</div>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <div className="text-muted-foreground">In Positions</div>
                  <div className="font-medium">{formatCurrency(exchange.inPositionUSDT)}</div>
                </div>
              </div>

              {/* Top Assets */}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Top Assets</div>
                {exchange.assets.slice(0, 3).map((asset) => (
                  <div key={asset.symbol} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{asset.symbol}</span>
                      {asset.isStaking && (
                        <Badge variant="secondary" className="text-[8px] px-1 py-0">
                          {asset.stakingAPY}% APY
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{formatCurrency(asset.valueUSDT)}</span>
                      <span className={cn(
                        asset.change24h >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                      )}>
                        {formatPercent(asset.change24h)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Last Sync */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Sync: <TimeAgo date={exchange.lastSync} /></span>
                </div>
                <div className="flex items-center gap-1">
                  {exchange.permissions.includes("trade") ? (
                    <Unlock className="h-3 w-3 text-[#0ECB81]" />
                  ) : (
                    <Lock className="h-3 w-3 text-[#F0B90B]" />
                  )}
                  <span>{exchange.permissions.join(", ")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Assets Table */}
      <Card className="flex-1 min-h-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Asset Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[300px]">
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Asset</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Exchange</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Balance</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Value</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">24h</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">7d</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">ROI</th>
                </tr>
              </thead>
              <tbody>
                {balances.flatMap((exchange) => 
                  exchange.assets.map((asset) => (
                    <tr key={`${exchange.exchange}-${asset.symbol}`} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{asset.symbol}</span>
                          {asset.isStaking && (
                            <Badge variant="secondary" className="text-[8px]">Staking</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{exchange.exchange}</td>
                      <td className="p-3 text-right font-mono text-sm">{asset.total.toFixed(4)}</td>
                      <td className="p-3 text-right font-mono text-sm">{formatCurrency(asset.valueUSDT)}</td>
                      <td className={cn("p-3 text-right text-sm", asset.change24h >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                        {formatPercent(asset.change24h)}
                      </td>
                      <td className={cn("p-3 text-right text-sm", asset.change7d >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                        {formatPercent(asset.change7d)}
                      </td>
                      <td className="p-3 text-right">
                        {asset.roi !== undefined ? (
                          <span className={cn("text-sm font-medium", asset.roi >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                            {formatPercent(asset.roi)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Funding View
// ============================================

interface FundingViewProps {
  fundingRates: DemoFundingRate[];
}

function FundingView({ fundingRates }: FundingViewProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Funding Rates</h2>
          <p className="text-sm text-muted-foreground">Perpetual futures funding across exchanges</p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#0ECB81]/10 text-[#0ECB81]">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Positive Funding</div>
                <div className="font-semibold">{fundingRates.filter(f => f.fundingRate > 0).length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#F6465D]/10 text-[#F6465D]">
                <TrendingDown className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Negative Funding</div>
                <div className="font-semibold">{fundingRates.filter(f => f.fundingRate < 0).length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#F0B90B]/10 text-[#F0B90B]">
                <Flame className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">High Heat</div>
                <div className="font-semibold">{fundingRates.filter(f => f.liquidationHeat === "high" || f.liquidationHeat === "critical").length}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Next Funding</div>
                <div className="font-semibold text-sm">~1h</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funding Rates Table */}
      <Card className="flex-1 min-h-0">
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Symbol</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Exchange</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Funding Rate</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">Annualized</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">OI</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-3">L/S Ratio</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-3">Heat</th>
                </tr>
              </thead>
              <tbody>
                {fundingRates.map((rate, i) => (
                  <tr key={`${rate.symbol}-${rate.exchange}-${i}`} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-medium text-sm">{rate.symbol}</td>
                    <td className="p-3 text-xs text-muted-foreground">{rate.exchange}</td>
                    <td className={cn("p-3 text-right font-mono text-sm", rate.fundingRate >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                      {formatPercent(rate.fundingRate * 100)}
                    </td>
                    <td className={cn("p-3 text-right text-sm", rate.fundingRateAnnualized >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                      {formatPercent(rate.fundingRateAnnualized)}
                    </td>
                    <td className="p-3 text-right text-sm">
                      ${(rate.openInterest / 1e9).toFixed(1)}B
                      <span className={cn("text-xs ml-1", rate.openInterestChange24h >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                        ({formatPercent(rate.openInterestChange24h)})
                      </span>
                    </td>
                    <td className="p-3 text-right text-sm">
                      <span className={rate.longShortRatio > 1 ? "text-[#0ECB81]" : rate.longShortRatio < 1 ? "text-[#F6465D]" : ""}>
                        {rate.longShortRatio.toFixed(2)}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          rate.liquidationHeat === "low" && "text-[#0ECB81] border-[#0ECB81]/30",
                          rate.liquidationHeat === "medium" && "text-[#F0B90B] border-[#F0B90B]/30",
                          rate.liquidationHeat === "high" && "text-orange-500 border-orange-500/30",
                          rate.liquidationHeat === "critical" && "text-[#F6465D] border-[#F6465D]/30"
                        )}
                      >
                        {rate.liquidationHeat.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// News View
// ============================================

interface NewsViewProps {
  news: DemoNewsItem[];
  events: DemoCalendarEvent[];
}

function NewsView({ news, events }: NewsViewProps) {
  const [activeTab, setActiveTab] = useState<"news" | "calendar">("news");

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "ai": return <Brain className="h-3.5 w-3.5" />;
      case "market": return <TrendingUp className="h-3.5 w-3.5" />;
      case "regulation": return <Shield className="h-3.5 w-3.5" />;
      case "upgrade": return <Zap className="h-3.5 w-3.5" />;
      case "unlock": return <Unlock className="h-3.5 w-3.5" />;
      default: return <Newspaper className="h-3.5 w-3.5" />;
    }
  };

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case "critical": return "text-[#F6465D] border-[#F6465D]/30";
      case "high": return "text-[#F0B90B] border-[#F0B90B]/30";
      case "medium": return "text-blue-500 border-blue-500/30";
      default: return "text-muted-foreground border-muted-foreground/30";
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">News & Events</h2>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "news" | "calendar")}>
          <TabsList className="h-8">
            <TabsTrigger value="news" className="text-xs px-3">News</TabsTrigger>
            <TabsTrigger value="calendar" className="text-xs px-3">Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "news" ? (
        <ScrollArea className="flex-1">
          <div className="space-y-3">
            {news.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-lg shrink-0",
                      item.sentiment === "bullish" ? "bg-[#0ECB81]/10 text-[#0ECB81]" :
                      item.sentiment === "bearish" ? "bg-[#F6465D]/10 text-[#F6465D]" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn("text-[10px]", getImportanceColor(item.importance))}>
                          {item.importance.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{item.source}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground"><TimeAgo date={item.timestamp} /></span>
                      </div>
                      <h3 className="font-medium text-sm mb-1 line-clamp-2">{item.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.summary}</p>
                      {item.relatedSymbols && item.relatedSymbols.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          {item.relatedSymbols.map((symbol) => (
                            <Badge key={symbol} variant="secondary" className="text-[10px]">
                              {symbol}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {item.url && (
                      <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {events.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime()).map((event) => {
              const hoursUntil = Math.round((event.eventDate.getTime() - Date.now()) / (1000 * 60 * 60));
              const daysUntil = Math.round(hoursUntil / 24);
              
              return (
                <Card key={event.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0",
                        event.importance === "critical" ? "bg-[#F6465D]/10 text-[#F6465D]" :
                        event.importance === "high" ? "bg-[#F0B90B]/10 text-[#F0B90B]" :
                        "bg-muted text-muted-foreground"
                      )}>
                        <span className="text-lg font-bold">{event.eventDate.getDate()}</span>
                        <span className="text-[10px] uppercase">{event.eventDate.toLocaleString("en-US", { month: "short" })}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm">{event.title}</span>
                          <Badge variant="outline" className={cn("text-[10px]", getImportanceColor(event.importance))}>
                            {event.importance.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-[10px]">
                            {event.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {hoursUntil < 24 ? `In ${hoursUntil}h` : `In ${daysUntil}d`}
                          </span>
                          {event.relatedSymbols && event.relatedSymbols.map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ============================================
// Placeholder View Component
// ============================================

function PlaceholderView({ title, icon: Icon, description }: { title: string; icon: React.ComponentType<{ className?: string }>; description: string }) {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 p-8">
      <div className="p-4 rounded-full bg-muted">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <Badge variant="outline" className="mt-2">В разработке</Badge>
    </div>
  );
}

// ============================================
// Advanced Views
// ============================================

function AutoTradingSettingsView() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Настройки автоторговли</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Общие настройки</CardTitle>
          <CardDescription>Конфигурация автоматической торговли</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Автоматическое исполнение сигналов</span>
            <Badge className="bg-[#0ECB81]">Активно</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Максимальный размер позиции</span>
            <span className="text-sm font-medium">$1,000</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Максимальное количество позиций</span>
            <span className="text-sm font-medium">5</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Стоп-лосс по умолчанию</span>
            <span className="text-sm font-medium">2%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Тейк-профит по умолчанию</span>
            <span className="text-sm font-medium">4%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MultiChartView() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Мульти-график</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">2x2</Button>
          <Button variant="outline" size="sm">3x3</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1">
        <Card className="overflow-hidden">
          <CardHeader className="p-2 pb-0">
            <Badge variant="outline" className="w-fit text-xs">BTCUSDT</Badge>
          </CardHeader>
          <CardContent className="p-2 h-[calc(100%-40px)]">
            <PriceChart />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="p-2 pb-0">
            <Badge variant="outline" className="w-fit text-xs">ETHUSDT</Badge>
          </CardHeader>
          <CardContent className="p-2 h-[calc(100%-40px)]">
            <PriceChart />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="p-2 pb-0">
            <Badge variant="outline" className="w-fit text-xs">SOLUSDT</Badge>
          </CardHeader>
          <CardContent className="p-2 h-[calc(100%-40px)]">
            <PriceChart />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="p-2 pb-0">
            <Badge variant="outline" className="w-fit text-xs">BNBUSDT</Badge>
          </CardHeader>
          <CardContent className="p-2 h-[calc(100%-40px)]">
            <PriceChart />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TradingView() {
  return <PlaceholderView title="Торговля" icon={LineChart} description="Ручная торговля с графиками и ордерами" />;
}

function StrategyLabView() {
  return <PlaceholderView title="Лаборатория стратегий" icon={FlaskConical} description="Создание и тестирование торговых стратегий" />;
}

function HyperoptView() {
  return <PlaceholderView title="Гипероптимизация" icon={Sparkles} description="Оптимизация параметров стратегий" />;
}

function MLFilterView() {
  return <PlaceholderView title="ML Фильтр" icon={Filter} description="Машинное обучение для фильтрации сигналов" />;
}

function SignalScorerView() {
  return <PlaceholderView title="Оценка сигналов" icon={Gauge} description="Оценка качества торговых сигналов" />;
}

function VolatilityView() {
  return <PlaceholderView title="Волатильность" icon={Sigma} description="Анализ волатильности рынка" />;
}

function SelfLearningView() {
  return <PlaceholderView title="Самообучение" icon={Brain} description="Самообучающиеся алгоритмы" />;
}

function RiskManagementView() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Риск-менеджмент</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Текущий риск</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#0ECB81]">Низкий</div>
            <Progress value={25} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">Использовано 25% от максимального риска</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Дневной P&L лимит</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$500 / $1,000</div>
            <Progress value={50} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">Осталось $500 до ограничения</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ChatView() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Оракул
        </h2>
        <Badge variant="outline" className="text-xs">
          <Sparkles className="h-3 w-3 mr-1" />
          GPT-4
        </Badge>
      </div>
      <div className="flex-1 min-h-0">
        <ChatBot />
      </div>
    </div>
  );
}

function ExchangesView() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Подключенные биржи</h2>
        <Button size="sm">
          <Building2 className="h-4 w-4 mr-2" />
          Добавить биржу
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {demoExchangeStatus.map((exchange) => (
          <Card key={exchange.name}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-primary" />
                  <div>
                    <div className="font-semibold">{exchange.name}</div>
                    <div className="text-xs text-muted-foreground">{exchange.type}</div>
                  </div>
                </div>
                <Badge className={exchange.status === "connected" ? "bg-[#0ECB81]" : "bg-[#F6465D]"}>
                  {exchange.status === "connected" ? "Подключено" : "Отключено"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Bottom Menu Views
// ============================================

function PreviewView() {
  return <PlaceholderView title="Превью" icon={MonitorPlay} description="Предпросмотр торговых сценариев" />;
}

function WorkspaceView() {
  return <PlaceholderView title="Рабочая область" icon={FolderCode} description="Управление рабочим пространством" />;
}

function NotificationsView() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Уведомления</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">Отметить все</Button>
          <Button variant="outline" size="sm">Очистить</Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="w-2 h-2 rounded-full bg-primary mt-2" />
              <div className="flex-1">
                <div className="font-medium text-sm">Позиция BTCUSDT открыта</div>
                <p className="text-xs text-muted-foreground">LONG @ $67,432.50 • 5 мин. назад</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-2 h-2 rounded-full bg-muted-foreground mt-2" />
              <div className="flex-1">
                <div className="font-medium text-sm">Take Profit сработал</div>
                <p className="text-xs text-muted-foreground">ETHUSDT +$245.00 • 1 ч. назад</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-2 h-2 rounded-full bg-muted-foreground mt-2" />
              <div className="flex-1">
                <div className="font-medium text-sm">Новый сигнал от ARGUS</div>
                <p className="text-xs text-muted-foreground">SOLUSDT LONG • 2 ч. назад</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TelegramView() {
  return <PlaceholderView title="Telegram" icon={MessageSquare} description="Интеграция с Telegram ботом" />;
}

function AlertsView() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Алерты</h2>
        <Button size="sm">
          <AlertCircle className="h-4 w-4 mr-2" />
          Создать алерт
        </Button>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <div className="font-medium text-sm">BTCUSDT &gt; $70,000</div>
                <p className="text-xs text-muted-foreground">Ценовой алерт</p>
              </div>
              <Badge variant="outline">Активен</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div>
                <div className="font-medium text-sm">Funding Rate BTC &gt; 0.1%</div>
                <p className="text-xs text-muted-foreground">Фандинг алерт</p>
              </div>
              <Badge variant="outline">Активен</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HelpView() {
  return <HelpPanel />;
}

// ============================================
// Bot Detail View
// ============================================

function BotDetailView({ botId, title }: { botId: string; title: string }) {
  const bot = demoBots.find(b => b.id === botId);
  
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">ID: {botId}</p>
        </div>
        {bot && (
          <Badge className={bot.status === "running" ? "bg-[#0ECB81]" : bot.status === "paused" ? "bg-[#F0B90B]" : "bg-muted"}>
            {bot.status === "running" ? "Запущен" : bot.status === "paused" ? "Пауза" : "Остановлен"}
          </Badge>
        )}
      </div>
      
      {bot ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Статистика</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Пара</span>
                <span className="text-sm font-medium">{bot.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">P&L</span>
                <span className={cn("text-sm font-medium", bot.pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]")}>
                  {formatCurrency(bot.pnl)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Win Rate</span>
                <span className="text-sm font-medium">{bot.winRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Всего сделок</span>
                <span className="text-sm font-medium">{bot.totalTrades}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Действия</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" variant="outline">
                {bot.status === "running" ? "Пауза" : "Запуск"}
              </Button>
              <Button className="w-full" variant="outline">Настройки</Button>
              <Button className="w-full" variant="destructive">Остановить</Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-8">
            <PlaceholderView title={title} icon={Bot} description="Настройте бота для начала торговли" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// Copy Trading Views
// ============================================

function CopyTradingView() {
  return <PlaceholderView title="Копирование сделок" icon={Copy} description="Копируйте сделки успешных трейдеров" />;
}

function MasterTradingView() {
  return <PlaceholderView title="Master Trader" icon={Crown} description="Станьте мастер-трейдером для копирования" />;
}

// ============================================
// Main Export
// ============================================

export default function DashboardPage() {
  return (
    <PriceProvider>
      <DashboardContent />
    </PriceProvider>
  );
}
