'use client'

import { useState, useEffect, useCallback } from 'react'
import { BotExchangeConfig } from "@/components/exchange/bot-exchange-config";
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  Play, 
  Square, 
  Settings, 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Zap,
  Clock,
  BarChart3,
  Crown,
  Cpu,
  RefreshCw,
  Signal,
  Brain,
  Layers,
  AlertTriangle,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

type BotCategory = 'operational' | 'institutional' | 'frequency' | 'meta'
type BotStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error' | 'paused'

interface BotStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  winRate: number
  avgLatency: number
  lastSignalTime?: number
  signalsGenerated: number
  uptime: number
  startedAt?: number
}

interface BotInfo {
  code: string
  name: string
  fullName: string
  category: BotCategory
  description: string
  status: BotStatus
  enabled: boolean
  config: Record<string, unknown>
  stats: BotStats | null
  lastError?: string
  lastErrorTime?: number
}

interface SignalInfo {
  id: string
  timestamp: number
  botCode: string
  symbol: string
  exchange: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
}

interface LogosStatus {
  status: string
  config: {
    minSignals: number
    minConfidence: number
    minConsensus: number
  }
  performances: Array<{
    botCode: string
    accuracy: number
    totalSignals: number
  }>
}

// ============================================================================
// CATEGORY STYLING
// ============================================================================

const categoryStyles: Record<BotCategory, { icon: React.ElementType; color: string; bgColor: string }> = {
  operational: { icon: Activity, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  institutional: { icon: Crown, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  frequency: { icon: Cpu, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  meta: { icon: Brain, color: 'text-green-400', bgColor: 'bg-green-500/10' },
}

const statusStyles: Record<BotStatus, { color: string; label: string }> = {
  idle: { color: 'bg-gray-500', label: 'Ожидание' },
  starting: { color: 'bg-yellow-500', label: 'Запуск' },
  running: { color: 'bg-green-500', label: 'Работает' },
  stopping: { color: 'bg-yellow-500', label: 'Остановка' },
  error: { color: 'bg-red-500', label: 'Ошибка' },
  paused: { color: 'bg-orange-500', label: 'Пауза' },
}

// ============================================================================
// FREQUENCY BOT CARD
// ============================================================================

function FrequencyBotCard({ 
  bot, 
  onToggle, 
  onConfig 
}: { 
  bot: BotInfo
  onToggle: (code: string, enable: boolean) => void
  onConfig: (code: string) => void
}) {
  const style = categoryStyles[bot.category]
  const status = statusStyles[bot.status]
  const Icon = style.icon
  const isRunning = bot.status === 'running'
  const isLoading = bot.status === 'starting' || bot.status === 'stopping'

  // Latency indicator
  const avgLatency = bot.stats?.avgLatency ?? 0
  const latencyClass = avgLatency < 10 
    ? 'text-green-400' 
    : avgLatency < 100 
      ? 'text-yellow-400' 
      : 'text-red-400'

  return (
    <Card className={`relative overflow-hidden border-border/50 ${style.bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${style.color}`} />
            <div>
              <CardTitle className="text-base font-mono">{bot.code}</CardTitle>
              <CardDescription className="text-xs">{bot.name}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={`text-xs ${isRunning ? 'border-green-500 text-green-400' : 'border-gray-500 text-gray-400'}`}
            >
              <span className={`mr-1 h-2 w-2 rounded-full ${status.color}`} />
              {status.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground line-clamp-2">{bot.description}</p>
        
        {/* Stats Grid */}
        {isRunning && bot.stats && (
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="text-center p-2 rounded bg-background/50">
              <div className="text-muted-foreground">Сделки</div>
              <div className="font-mono font-bold">{bot.stats.totalTrades}</div>
            </div>
            <div className="text-center p-2 rounded bg-background/50">
              <div className="text-muted-foreground">Win Rate</div>
              <div className={`font-mono font-bold ${bot.stats.winRate >= 0.5 ? 'text-green-400' : 'text-red-400'}`}>
                {(bot.stats.winRate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="text-center p-2 rounded bg-background/50">
              <div className="text-muted-foreground">PnL</div>
              <div className={`font-mono font-bold ${bot.stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {bot.stats.totalPnl >= 0 ? '+' : ''}{bot.stats.totalPnl.toFixed(2)}
              </div>
            </div>
            <div className="text-center p-2 rounded bg-background/50">
              <div className="text-muted-foreground">Задержка</div>
              <div className={`font-mono font-bold ${latencyClass}`}>
                {avgLatency.toFixed(1)}ms
              </div>
            </div>
          </div>
        )}
        
        {/* Win Rate Progress */}
        {isRunning && bot.stats && bot.stats.totalTrades > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-mono">{(bot.stats.winRate * 100).toFixed(1)}%</span>
            </div>
            <Progress value={bot.stats.winRate * 100} className="h-1" />
          </div>
        )}
        
        {/* Error Display */}
        {bot.status === 'error' && bot.lastError && (
          <div className="p-2 rounded bg-red-500/10 text-red-400 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{bot.lastError}</span>
          </div>
        )}
        
        {/* Controls */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={isRunning}
              disabled={isLoading}
              onCheckedChange={(checked) => onToggle(bot.code, checked)}
            />
            <span className="text-xs text-muted-foreground">
              {isLoading ? 'Обработка...' : isRunning ? 'Работает' : 'Остановлен'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onConfig(bot.code)}
            className="h-7 px-2"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// LOGOS PANEL
// ============================================================================

function LogosPanel({ 
  status, 
  signals,
  onStart, 
  onStop 
}: { 
  status: LogosStatus | null
  signals: SignalInfo[]
  onStart: () => void
  onStop: () => void
}) {
  const isRunning = status?.status === 'running'

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-green-400" />
            <div>
              <CardTitle className="text-base font-mono">LOGOS</CardTitle>
              <CardDescription className="text-xs">Мета-бот - Агрегатор сигналов</CardDescription>
            </div>
          </div>
          <Badge 
            variant="outline" 
            className={`text-xs ${isRunning ? 'border-green-500 text-green-400' : 'border-gray-500 text-gray-400'}`}
          >
            <span className={`mr-1 h-2 w-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-500'}`} />
            {isRunning ? 'Работает' : 'Ожидание'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Агрегирует сигналы от всех ботов и принимает единые торговые решения на основе консенсуса.
        </p>
        
        {/* Config Display */}
        {status && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-2 rounded bg-background/50">
              <div className="text-muted-foreground">Мин. сигналов</div>
              <div className="font-mono font-bold">{status.config.minSignals}</div>
            </div>
            <div className="text-center p-2 rounded bg-background/50">
              <div className="text-muted-foreground">Мин. уверенность</div>
              <div className="font-mono font-bold">{(status.config.minConfidence * 100).toFixed(0)}%</div>
            </div>
            <div className="text-center p-2 rounded bg-background/50">
              <div className="text-muted-foreground">Мин. консенсус</div>
              <div className="font-mono font-bold">{(status.config.minConsensus * 100).toFixed(0)}%</div>
            </div>
          </div>
        )}
        
        {/* Bot Performances */}
        {status && status.performances.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Отслеживание точности ботов</div>
            <div className="flex flex-wrap gap-1">
              {status.performances.slice(0, 6).map(p => (
                <Badge key={p.botCode} variant="secondary" className="text-xs">
                  {p.botCode}: {(p.accuracy * 100).toFixed(0)}%
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {/* Recent Signals */}
        {signals.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Недавние агрегированные сигналы</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {signals.slice(0, 5).map(signal => (
                <div key={signal.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-background/30">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${signal.direction === 'LONG' ? 'text-green-400' : signal.direction === 'SHORT' ? 'text-red-400' : 'text-gray-400'}`}>
                      {signal.direction}
                    </Badge>
                    <span className="font-mono">{signal.symbol}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {(signal.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Controls */}
        <div className="flex items-center gap-2 pt-2">
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={onStop}>
              <Square className="h-4 w-4 mr-2" />
              Остановить LOGOS
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={onStart}>
              <Play className="h-4 w-4 mr-2" />
              Запустить LOGOS
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// SIGNAL FEED
// ============================================================================

function SignalFeed({ signals }: { signals: SignalInfo[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Signal className="h-5 w-5 text-blue-400" />
            <CardTitle className="text-base">Лента сигналов</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {signals.length} сигналов
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Сигналов пока нет. Запустите боты для генерации сигналов.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {signals.map(signal => (
              <div key={signal.id} className="flex items-center justify-between p-2 rounded bg-background/50 text-xs">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${signal.direction === 'LONG' ? 'text-green-400 border-green-500' : 'text-red-400 border-red-500'}`}
                  >
                    {signal.direction}
                  </Badge>
                  <div>
                    <span className="font-mono">{signal.symbol}</span>
                    <span className="text-muted-foreground ml-1">({signal.botCode})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-muted-foreground">
                    {(signal.confidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(signal.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FrequencyBotPanel() {
  const [bots, setBots] = useState<BotInfo[]>([])
  const [logosStatus, setLogosStatus] = useState<LogosStatus | null>(null)
  const [signals, setSignals] = useState<SignalInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [selectedBotCode, setSelectedBotCode] = useState<string | null>(null)
  const [selectedExchange, setSelectedExchange] = useState<"binance" | "bybit" | "okx" | "bitget" | "bingx">("binance")
  const [isPaperTrading, setIsPaperTrading] = useState(true)

  const fetchBots = useCallback(async () => {
    try {
      // Fetch frequency bots
      const freqResponse = await fetch('/api/bots/frequency')
      if (freqResponse.ok) {
        const data = await freqResponse.json()
        setBots(data.bots || [])
      }
    } catch (error) {
      console.error('Error fetching bots:', error)
    }
  }, [])

  const fetchLogos = useCallback(async () => {
    try {
      const response = await fetch('/api/bots/logos')
      if (response.ok) {
        const data = await response.json()
        setLogosStatus(data.bot ? {
          status: data.bot.status,
          config: data.bot.config,
          performances: data.bot.performances || [],
        } : null)
      }
    } catch (error) {
      console.error('Error fetching LOGOS:', error)
    }
  }, [])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchBots(), fetchLogos()])
    setLoading(false)
    setRefreshing(false)
  }, [fetchBots, fetchLogos])

  useEffect(() => {
    // Initial fetch
    let mounted = true
    
    const doFetch = async () => {
      if (!mounted) return
      try {
        // Fetch frequency bots
        const freqResponse = await fetch('/api/bots/frequency')
        if (freqResponse.ok && mounted) {
          const data = await freqResponse.json()
          setBots(data.bots || [])
        }
      } catch (error) {
        console.error('Error fetching bots:', error)
      }
      
      try {
        const response = await fetch('/api/bots/logos')
        if (response.ok && mounted) {
          const data = await response.json()
          if (mounted) {
            setLogosStatus(data.bot ? {
              status: data.bot.status,
              config: data.bot.config,
              performances: data.bot.performances || [],
            } : null)
          }
        }
      } catch (error) {
        console.error('Error fetching LOGOS:', error)
      }
      
      if (mounted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
    
    doFetch()
    const interval = setInterval(doFetch, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const handleToggle = async (code: string, enable: boolean) => {
    try {
      const response = await fetch('/api/bots/frequency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: enable ? 'start' : 'stop', 
          botCode: code 
        }),
      })
      
      if (response.ok) {
        await fetchBots()
      }
    } catch (error) {
      console.error('Error toggling bot:', error)
    }
  }

  const handleConfig = (code: string) => {
    setSelectedBotCode(code)
    setShowConfigDialog(true)
  }

  const handleStartLogos = async () => {
    try {
      await fetch('/api/bots/logos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      await fetchLogos()
    } catch (error) {
      console.error('Error starting LOGOS:', error)
    }
  }

  const handleStopLogos = async () => {
    try {
      await fetch('/api/bots/logos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      await fetchLogos()
    } catch (error) {
      console.error('Error stopping LOGOS:', error)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAll()
  }

  const handleStartAll = async () => {
    for (const bot of bots.filter(b => b.status !== 'running')) {
      await handleToggle(bot.code, true)
    }
  }

  const handleStopAll = async () => {
    for (const bot of bots.filter(b => b.status === 'running')) {
      await handleToggle(bot.code, false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Дашборд частотных ботов</h2>
          <p className="text-muted-foreground">Управление HFT, MFT, LFT торговыми движками</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleStartAll}
          >
            <Play className="h-4 w-4 mr-2" />
            Запустить все
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopAll}
          >
            <Square className="h-4 w-4 mr-2" />
            Остановить все
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bots Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* System Status */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono">{bots.length}</div>
                  <div className="text-xs text-muted-foreground">Всего ботов</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-green-400">
                    {bots.filter(b => b.status === 'running').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Работает</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono">
                    {bots.reduce((sum, b) => sum + (b.stats?.signalsGenerated ?? 0), 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Сигналов</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold font-mono ${bots.reduce((sum, b) => sum + (b.stats?.totalPnl ?? 0), 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {bots.reduce((sum, b) => sum + (b.stats?.totalPnl ?? 0), 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">Общий PnL</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Frequency Bots Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bots.map(bot => (
              <FrequencyBotCard
                key={bot.code}
                bot={bot}
                onToggle={handleToggle}
                onConfig={handleConfig}
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* LOGOS Panel */}
          <LogosPanel 
            status={logosStatus}
            signals={signals.filter(s => s.botCode === 'LOGOS')}
            onStart={handleStartLogos}
            onStop={handleStopLogos}
          />
          
          {/* Signal Feed */}
          <SignalFeed signals={signals} />
        </div>
      </div>

      {/* Config Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Конфигурация {selectedBotCode}</DialogTitle>
          </DialogHeader>
          <BotExchangeConfig
            botType={selectedBotCode || 'HFT'}
            currentExchange={selectedExchange}
            onConfigChange={(c) => {
              setSelectedExchange(c.exchange as "binance" | "bybit" | "okx" | "bitget" | "bingx")
              setIsPaperTrading(c.mode === "PAPER")
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
