"use client";

import { useCryptoStore } from "@/stores/crypto-store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  History,
  Settings,
  Bot,
  LineChart,
  Wallet,
  Bell,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Building2,
  MessageSquare,
  BarChart3,
  Grid3X3,
  Layers,
  Activity,
  Eye,
  Radar,
  CandlestickChart,
  Users,
  FlaskConical,
  FolderCode,
  MonitorPlay,
  Sparkles,
  Brain,
  Minimize2,
  Target,
  Zap,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Gauge,
  Crown,
  Cpu,
  Filter,
  Sigma,
  AlertCircle,
  Shield,
  ArrowLeftRight,
  Scale,
  Building,
  Compass,
  PawPrint,
  Copy,
  X,
  Menu,
  BookOpen,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";

// ============================================================================
// TYPES
// ============================================================================

interface MenuItem {
  id: string
  label: string
  code?: string
  icon: React.ComponentType<{ className?: string }>
  isNew?: boolean
  badge?: string
}

interface BotCategory {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  bots: MenuItem[]
}

interface CopyTradingSubItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// ============================================================================
// BOT DATA
// ============================================================================

const botCategories: BotCategory[] = [
  {
    id: 'meta',
    label: 'Мета',
    icon: Sparkles,
    bots: [
      { id: "logos", label: "LOGOS", code: "Агрегатор", icon: Sparkles },
    ]
  },
  {
    id: 'operational',
    label: 'Операционные',
    icon: Gauge,
    bots: [
      { id: "grid-bot", label: "MESH", code: "Сетка", icon: Grid3X3 },
      { id: "dca-bot", label: "SCALE", code: "Усреднение", icon: Layers },
      { id: "bb-bot", label: "BAND", code: "Полосы", icon: Activity },
    ]
  },
  {
    id: 'institutional',
    label: 'Институциональные',
    icon: Crown,
    bots: [
      { id: "institutional-bots", label: "ПАНЕЛЬ", code: "Обзор", icon: Crown },
      { id: "spectrum-bot", label: "PR", code: "Спектр", icon: ArrowLeftRight },
      { id: "reed-bot", label: "STA", code: "Рид", icon: Scale },
      { id: "architect-bot", label: "MM", code: "Архитектор", icon: Building },
      { id: "equilibrist-bot", label: "MR", code: "Эквилибрист", icon: Minimize2 },
      { id: "kron-bot", label: "TRF", code: "Крон", icon: TrendingUp },
    ]
  },
  {
    id: 'analytical',
    label: 'Аналитические',
    icon: Radar,
    bots: [
      { id: "argus-bot", label: "PND", code: "Аргус", icon: Radar },
      { id: "orion-bot", label: "TRND", code: "Орион", icon: Target },
      { id: "vision-bot", label: "FCST", code: "Видение", icon: Eye },
      { id: "range-bot", label: "RNG", code: "Диапазон", icon: Minimize2 },
      { id: "lumibot", label: "LMB", code: "Люми", icon: Brain },
      { id: "wolfbot", label: "WOLF", code: "Волк", icon: PawPrint },
    ]
  },
  {
    id: 'frequency',
    label: 'Частотные',
    icon: Cpu,
    bots: [
      { id: "frequency-bots", label: "ДАШБОРД", code: "Обзор", icon: Cpu },
      { id: "hft-bot", label: "HFT", code: "Гелиос", icon: Zap },
      { id: "mft-bot", label: "MFT", code: "Селена", icon: Clock },
      { id: "lft-bot", label: "LFT", code: "Атлас", icon: Compass },
    ]
  }
]

// ============================================================================
// COPY TRADING DATA
// ============================================================================

const copyTradingItems: CopyTradingSubItem[] = [
  { id: "copy-trading", label: "Копирование сделок", icon: Copy },
  { id: "master-trading", label: "Master Trader", icon: Crown },
]

// ============================================================================
// MENU DATA
// ============================================================================

const mainMenuItems: MenuItem[] = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard },
  { id: "chart", label: "График", icon: CandlestickChart },
  { id: "portfolio", label: "Портфель", icon: Wallet },
  { id: "bots", label: "Боты", icon: Bot, badge: "6" },
  { id: "signals", label: "Сигналы", icon: Zap, badge: "4" },
  { id: "positions", label: "Позиции", icon: Target },
  { id: "trades", label: "Сделки", icon: History },
  { id: "funding", label: "Фандинг", icon: Percent },
  { id: "analytics", label: "Аналитика", icon: BarChart3 },
  { id: "journal", label: "Журнал", icon: BookOpen },
  { id: "news", label: "Новости", icon: Bell, badge: "3" },
]

const otherMenuItems: MenuItem[] = [
  { id: "auto-trading-settings", label: "Настройки автоторговли", icon: Settings },
  { id: "multi-chart", label: "Мульти-график", icon: Grid3X3 },
  { id: "trading", label: "Торговля", icon: LineChart },
  { id: "strategy-lab", label: "Лаборатория", icon: FlaskConical },
  { id: "hyperopt", label: "Гипероптим", icon: Sparkles },
  { id: "ml-filter", label: "ML Фильтр", icon: Filter },
  { id: "signal-scorer", label: "Оценка сигналов", icon: Gauge },
  { id: "volatility", label: "Волатильность", icon: Sigma },
  { id: "self-learning", label: "Самообучение", icon: Brain },
  { id: "risk-management", label: "Риск-менеджмент", icon: Shield },
  { id: "chat", label: "Оракул", icon: MessageSquare },
  { id: "exchanges", label: "Биржи", icon: Building2 },
]

const bottomMenuItems: MenuItem[] = [
  { id: "preview", label: "Превью", icon: MonitorPlay },
  { id: "workspace", label: "Рабочая область", icon: FolderCode },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "telegram", label: "Telegram", icon: MessageSquare },
  { id: "alerts", label: "Алерты", icon: AlertCircle },
  { id: "help", label: "Помощь", icon: HelpCircle },
]

// ============================================================================
// SIDEBAR COMPONENT
// ============================================================================

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen, account } = useCryptoStore();
  const isDemo = account?.accountType === "DEMO";
  
  // Bots section expansion state
  const [botsExpanded, setBotsExpanded] = useState(true)
  
  // Copy Trading section expansion state
  const [copyTradingExpanded, setCopyTradingExpanded] = useState(true)
  
  // Category expansion states (all expanded by default)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['meta', 'operational', 'institutional', 'analytical', 'frequency'])
  );

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile drawer when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const isCategoryExpanded = (categoryId: string) => expandedCategories.has(categoryId)
  
  // Check if any bot is active
  const isBotActive = botCategories.some(cat => cat.bots.some(bot => bot.id === activeTab))
  
  // Check if any copy trading item is active
  const isCopyTradingActive = copyTradingItems.some(item => item.id === activeTab)

  return (
    <>
      {/* Mobile Drawer Overlay */}
      <div 
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      
      {/* Mobile Menu Toggle Button */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={cn(
          "fixed top-4 left-4 z-50 md:hidden flex items-center justify-center",
          "h-11 w-11 rounded-lg border border-border bg-card shadow-sm",
          "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
          "touch-target"
        )}
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
        aria-expanded={sidebarOpen}
      >
        {sidebarOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r border-border bg-card transition-all duration-300 flex flex-col",
          // Desktop: fixed sidebar
          "md:z-50",
          sidebarOpen ? "md:w-64" : "md:w-16",
          // Mobile: drawer mode
          isMobile && [
            "w-72 max-w-[85vw]",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          ]
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4 flex-shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#F0B90B] to-[#D4A00A] shadow-lg shadow-primary/25">
                <span className="text-black font-bold text-sm tracking-tight">C</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground tracking-tight">CITARION</h1>
              </div>
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#F0B90B] to-[#D4A00A] shadow-lg shadow-primary/25 mx-auto hidden md:flex">
              <span className="text-black font-bold text-sm tracking-tight">C</span>
            </div>
          )}
          
          {/* Mobile close button */}
          {isMobile && sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="h-11 w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent touch-target"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Mode Badge */}
        {sidebarOpen && (
          <div className="px-4 py-3 border-b border-border flex-shrink-0">
            <Badge
              variant="outline"
              className={cn(
                "w-full justify-center py-1.5 text-xs font-medium",
                isDemo ? "demo-badge" : "real-badge"
              )}
            >
              {isDemo ? "🔷 DEMO РЕЖИМ" : "🟢 REAL РЕЖИМ"}
            </Badge>
          </div>
        )}

        {/* Main Menu */}
        <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto" role="menu">
          {/* Main navigation items */}
          {mainMenuItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer",
                  "min-h-11 touch-target", // Touch-friendly size
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                role="menuitem"
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && item.badge && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0.5 bg-[#0ECB81]/20 text-[#0ECB81] border-[#0ECB81]/30">
                    {item.badge}
                  </Badge>
                )}
                {sidebarOpen && item.isNew && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-500 border-purple-500/30">
                    NEW
                  </Badge>
                )}
              </button>
            );
          })}

          {/* Advanced Section Header */}
          {sidebarOpen && (
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setBotsExpanded(!botsExpanded)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer",
                  "min-h-11 touch-target",
                  isBotActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                role="menuitem"
                aria-expanded={botsExpanded}
              >
                <FlaskConical className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">Расширенные</span>
                {botsExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {/* Advanced Items */}
              {botsExpanded && (
                <div className="mt-1 ml-2 space-y-0.5">
                  {otherMenuItems.map((item) => {
                    const isActive = activeTab === item.id;
                    const Icon = item.icon;
                    
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTabChange(item.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                          "hover:bg-accent active:scale-[0.98] cursor-pointer",
                          "min-h-11 touch-target",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        role="menuitem"
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Collapsed sidebar - show advanced icon */}
          {!sidebarOpen && (
            <div className="pt-2 hidden md:block">
              <button
                type="button"
                onClick={() => setBotsExpanded(!botsExpanded)}
                className={cn(
                  "flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer",
                  "min-h-11",
                  isBotActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Расширенные"
                aria-label="Расширенные"
              >
                <FlaskConical className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Bots Section Header - Moved Below */}
          {sidebarOpen && (
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setCopyTradingExpanded(!copyTradingExpanded)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer",
                  "min-h-11 touch-target", // Touch-friendly size
                  isCopyTradingActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                role="menuitem"
                aria-expanded={copyTradingExpanded}
              >
                <Bot className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">Все боты</span>
                {copyTradingExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {/* Bot Categories (nested under Bots) */}
              {copyTradingExpanded && (
                <div className="mt-1 space-y-1">
                  {botCategories.map((category) => {
                    const CategoryIcon = category.icon
                    const isExpanded = isCategoryExpanded(category.id)
                    const hasActiveBot = category.bots.some(bot => bot.id === activeTab)
                    
                    return (
                      <div key={category.id} className="ml-2">
                        {/* Category Header */}
                        <button
                          type="button"
                          onClick={() => toggleCategory(category.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200",
                            "hover:bg-accent cursor-pointer",
                            "min-h-11 touch-target", // Touch-friendly size
                            hasActiveBot
                              ? "text-primary bg-primary/5"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          role="menuitem"
                          aria-expanded={isExpanded}
                        >
                          <CategoryIcon className="h-3.5 w-3.5" />
                          <span className="flex-1 text-left">{category.label}</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                        
                        {/* Bots in Category */}
                        {isExpanded && (
                          <div className="mt-1 ml-2 space-y-0.5">
                            {category.bots.map((bot) => {
                              const isActive = activeTab === bot.id
                              const BotIcon = bot.icon
                              
                              return (
                                <button
                                  key={bot.id}
                                  type="button"
                                  onClick={() => handleTabChange(bot.id)}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                                    "hover:bg-accent active:scale-[0.98] cursor-pointer",
                                    "min-h-11 touch-target", // Touch-friendly size
                                    isActive
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                  role="menuitem"
                                  aria-current={isActive ? "page" : undefined}
                                >
                                  <BotIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                  <span className="font-mono font-semibold">{bot.label}</span>
                                  {bot.code && (
                                    <span className="text-xs text-muted-foreground ml-auto">{bot.code}</span>
                                  )}
                                  {bot.isNew && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-500 border-green-500/30">
                                      NEW
                                    </Badge>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Collapsed sidebar - show bot icon */}
          {!sidebarOpen && (
            <div className="pt-2 hidden md:block">
              <button
                type="button"
                onClick={() => setCopyTradingExpanded(!copyTradingExpanded)}
                className={cn(
                  "flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer",
                  "min-h-11",
                  isCopyTradingActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Все боты"
                aria-label="Все боты"
              >
                <Bot className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Copy Trading Section Header */}
          {sidebarOpen && (
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setCopyTradingExpanded(!copyTradingExpanded)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer",
                  "min-h-11 touch-target", // Touch-friendly size
                  isCopyTradingActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                role="menuitem"
                aria-expanded={copyTradingExpanded}
              >
                <Users className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">Копитрейдинг</span>
                {copyTradingExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {/* Copy Trading Items */}
              {copyTradingExpanded && (
                <div className="mt-1 ml-2 space-y-0.5">
                  {copyTradingItems.map((item) => {
                    const isActive = activeTab === item.id
                    const ItemIcon = item.icon
                    
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleTabChange(item.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                          "hover:bg-accent active:scale-[0.98] cursor-pointer",
                          "min-h-11 touch-target", // Touch-friendly size
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        role="menuitem"
                        aria-current={isActive ? "page" : undefined}
                      >
                        <ItemIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Collapsed sidebar - show copy trading icon */}
          {!sidebarOpen && (
            <div className="pt-2 hidden md:block">
              <button
                type="button"
                onClick={() => setCopyTradingExpanded(!copyTradingExpanded)}
                className={cn(
                  "flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer",
                  "min-h-11",
                  isCopyTradingActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Копитрейдинг"
                aria-label="Копитрейдинг"
              >
                <Users className="h-5 w-5" />
              </button>
            </div>
          )}
        </nav>

        {/* Bottom Menu */}
        <div className="border-t border-border px-2 py-4 flex-shrink-0">
          {bottomMenuItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  "hover:bg-accent active:scale-[0.98] cursor-pointer",
                  "min-h-11 touch-target", // Touch-friendly size
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                role="menuitem"
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Collapse Button - Desktop only */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden md:flex absolute -right-3 top-20 h-6 w-6 rounded-full border border-border bg-card shadow-sm cursor-pointer hover:bg-accent z-50"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </aside>
    </>
  );
}
