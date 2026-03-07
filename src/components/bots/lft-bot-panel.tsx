'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Play, 
  Square, 
  Settings, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Clock,
  Signal,
  Activity,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BotExchangeConfig } from '@/components/exchange/bot-exchange-config'

// ============================================================================
// TYPES
// ============================================================================

type BotStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error' | 'paused'

interface LFTConfig {
  symbol: string
  exchange: string
  timeframe: string
  macroLookback: number
  minHoldingHours: number
  maxHoldingHours: number
  stopLossPercent: number
  takeProfitPercent: number
  positionSize: number
  useFundamentalFilter: boolean
  riskPerTrade: number
}

interface LFTStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  winRate: number
  avgHoldingTime: number
  signalsGenerated: number
  macroTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  marketCondition: string
  activePosition: boolean
}

interface PositionInfo {
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entryPrice: number
  size: number
  pnl: number
  pnlPercent: number
  openedAt: number
  stopLoss: number
  takeProfit: number
}

interface SignalInfo {
  id: string
  timestamp: number
  type: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  entryPrice: number
  reason: string
  macroContext: string
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_LFT_CONFIG: LFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  timeframe: '4h',
  macroLookback: 30,
  minHoldingHours: 4,
  maxHoldingHours: 72,
  stopLossPercent: 5.0,
  takeProfitPercent: 15.0,
  positionSize: 500,
  useFundamentalFilter: true,
  riskPerTrade: 2.0,
}

// ============================================================================
// MACRO TREND INDICATOR
// ============================================================================

function MacroTrendIndicator({ trend, condition }: { trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL', condition: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-cyan-400" />
          Макро-анализ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trend Gauge */}
        <div className="flex items-center justify-between px-4">
          <div className={cn(
            "flex flex-col items-center",
            trend === 'BEARISH' ? "text-red-400" : "text-gray-600"
          )}>
            <TrendingDown className="h-6 w-6" />
            <span className="text-xs">Медвежий</span>
          </div>
          
          <div className="flex-1 mx-4">
            <div className="h-3 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 relative">
              <div 
                className={cn(
                  "absolute top-0 bottom-0 w-4 bg-background border-2 rounded-full transform -translate-x-1/2",
                  trend === 'BULLISH' ? "border-green-500 left-[85%]" : 
                  trend === 'BEARISH' ? "border-red-500 left-[15%]" : 
                  "border-yellow-500 left-[50%]"
                )}
              />
            </div>
          </div>
          
          <div className={cn(
            "flex flex-col items-center",
            trend === 'BULLISH' ? "text-green-400" : "text-gray-600"
          )}>
            <TrendingUp className="h-6 w-6" />
            <span className="text-xs">Бычий</span>
          </div>
        </div>
        
        {/* Market Condition */}
        <div className="text-center p-3 rounded bg-background/50">
          <div className="text-xs text-muted-foreground">Состояние рынка</div>
          <div className="font-mono font-bold">{condition}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// POSITION TIMELINE
// ============================================================================

function PositionTimeline({ position }: { position: PositionInfo | null }) {
  const holdingHours = position ? (Date.now() - position.openedAt) / 3600000 : 0
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          Таймлайн позиции
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!position ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Нет активной позиции
          </div>
        ) : (
          <div className="space-y-4">
            {/* Position Info */}
            <div className="flex items-center justify-between p-3 rounded bg-background/50">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline" 
                  className={cn(
                    position.direction === 'LONG' ? "text-green-400 border-green-500" : 
                    "text-red-400 border-red-500"
                  )}
                >
                  {position.direction}
                </Badge>
                <span className="font-mono">{position.symbol}</span>
              </div>
              <div className={cn(
                "font-mono font-bold",
                position.pnl >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {position.pnl >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
              </div>
            </div>
            
            {/* Timeline */}
            <div className="relative">
              <div className="h-2 bg-muted rounded-full">
                <div 
                  className="h-2 bg-cyan-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (holdingHours / 72) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0h</span>
                <span>{holdingHours.toFixed(1)}h</span>
                <span>72h</span>
              </div>
            </div>
            
            {/* Entry/SL/TP */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-2 rounded bg-background/50">
                <div className="text-muted-foreground">Вход</div>
                <div className="font-mono font-bold">${position.entryPrice.toFixed(2)}</div>
              </div>
              <div className="text-center p-2 rounded bg-red-500/10">
                <div className="text-muted-foreground">Стоп-лосс</div>
                <div className="font-mono font-bold text-red-400">${position.stopLoss.toFixed(2)}</div>
              </div>
              <div className="text-center p-2 rounded bg-green-500/10">
                <div className="text-muted-foreground">Тейк-профит</div>
                <div className="font-mono font-bold text-green-400">${position.takeProfit.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
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
            <Signal className="h-4 w-4 text-cyan-400" />
            <CardTitle className="text-base">LFT Сигналы</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {signals.length} сигналов
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Сигналов пока нет. Запустите бота для генерации макро-сигналов.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {signals.slice(0, 10).map(signal => (
              <div key={signal.id} className="p-3 rounded bg-background/50 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        signal.direction === 'LONG' ? "text-green-400 border-green-500" : 
                        signal.direction === 'SHORT' ? "text-red-400 border-red-500" : 
                        "text-gray-400"
                      )}
                    >
                      {signal.direction}
                    </Badge>
                    <span className="font-mono">${signal.entryPrice.toFixed(2)}</span>
                  </div>
                  <span className="text-muted-foreground">{new Date(signal.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground">
                  {signal.reason}
                </div>
                <div className="text-cyan-400">
                  Контекст: {signal.macroContext}
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

export function LFTBotPanel() {
  const [status, setStatus] = useState<BotStatus>('idle')
  const [config, setConfig] = useState<LFTConfig>(DEFAULT_LFT_CONFIG)
  const [stats, setStats] = useState<LFTStats | null>(null)
  const [signals, setSignals] = useState<SignalInfo[]>([])
  const [position, setPosition] = useState<PositionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [isPaperTrading, setIsPaperTrading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/bots/frequency?botCode=LFT')
      if (response.ok) {
        const data = await response.json()
        setStatus(data.bot?.status || 'idle')
        setStats(data.bot?.stats || null)
        setSignals(data.bot?.signals || [])
        setPosition(data.bot?.position || null)
      }
    } catch (error) {
      console.error('Error fetching LFT status:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleToggle = async () => {
    const action = status === 'running' ? 'stop' : 'start'
    try {
      const response = await fetch('/api/bots/frequency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, botCode: 'LFT' }),
      })
      if (response.ok) {
        setStatus(action === 'start' ? 'starting' : 'stopping')
        setTimeout(fetchStatus, 1000)
      }
    } catch (error) {
      console.error('Error toggling LFT:', error)
    }
  }

  const handleConfigUpdate = async () => {
    try {
      await fetch('/api/bots/frequency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botCode: 'LFT', config }),
      })
      setShowConfig(false)
    } catch (error) {
      console.error('Error updating LFT config:', error)
    }
  }

  const isRunning = status === 'running'
  const isLoading = status === 'starting' || status === 'stopping'

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
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-cyan-400" />
            Chronos
            <span className="text-sm font-normal text-muted-foreground">(LFT Bot)</span>
          </h2>
          <p className="text-muted-foreground">
            Низкочастотная торговля • Позиционная и макро-торговля
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshing(true) || fetchStatus()}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Обновить
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfig(!showConfig)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Настройки
          </Button>
          <Button
            variant={isRunning ? "destructive" : "default"}
            size="sm"
            onClick={handleToggle}
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : isRunning ? (
              <Square className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isLoading ? 'Обработка...' : isRunning ? 'Остановить' : 'Запустить'}
          </Button>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">LFT Конфигурация</CardTitle>
            <CardDescription>Настройте параметры позиционной торговли</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Exchange Configuration */}
            <BotExchangeConfig
              botType="LFT"
              currentExchange={config.exchange as "binance" | "bybit" | "okx" | "bitget" | "bingx"}
              onConfigChange={(c) => {
                setConfig({...config, exchange: c.exchange})
                setIsPaperTrading(c.mode === "PAPER")
              }}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Символ</Label>
                <Input 
                  value={config.symbol} 
                  onChange={(e) => setConfig({...config, symbol: e.target.value.toUpperCase()})}
                />
              </div>
              <div className="space-y-2">
                <Label>Таймфрейм</Label>
                <Select value={config.timeframe} onValueChange={(v) => setConfig({...config, timeframe: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 час</SelectItem>
                    <SelectItem value="4h">4 часа</SelectItem>
                    <SelectItem value="1d">1 день</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Мин. удержание (часы)</Label>
                <Input 
                  type="number" 
                  value={config.minHoldingHours}
                  onChange={(e) => setConfig({...config, minHoldingHours: parseInt(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Макс. удержание (часы)</Label>
                <Input 
                  type="number" 
                  value={config.maxHoldingHours}
                  onChange={(e) => setConfig({...config, maxHoldingHours: parseInt(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Стоп-лосс %</Label>
                <Input 
                  type="number" 
                  step="0.5"
                  value={config.stopLossPercent}
                  onChange={(e) => setConfig({...config, stopLossPercent: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Тейк-профит %</Label>
                <Input 
                  type="number" 
                  step="0.5"
                  value={config.takeProfitPercent}
                  onChange={(e) => setConfig({...config, takeProfitPercent: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Размер позиции</Label>
                <Input 
                  type="number" 
                  value={config.positionSize}
                  onChange={(e) => setConfig({...config, positionSize: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Риск на сделку %</Label>
                <Input 
                  type="number" 
                  step="0.5"
                  value={config.riskPerTrade}
                  onChange={(e) => setConfig({...config, riskPerTrade: parseFloat(e.target.value)})}
                />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleConfigUpdate}>Сохранить конфигурацию</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">{stats?.totalTrades || 0}</div>
              <div className="text-xs text-muted-foreground">Сделки</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className={cn(
                "text-2xl font-bold font-mono",
                (stats?.winRate ?? 0) >= 0.5 ? "text-green-400" : "text-red-400"
              )}>
                {((stats?.winRate ?? 0) * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className={cn(
                "text-2xl font-bold font-mono",
                (stats?.totalPnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {(stats?.totalPnl ?? 0) >= 0 ? '+' : ''}{(stats?.totalPnl ?? 0).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">PnL</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">
                {Math.floor((stats?.avgHoldingTime ?? 0) / 3600000)}h
              </div>
              <div className="text-xs text-muted-foreground">Ср. удержание</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">{stats?.signalsGenerated || 0}</div>
              <div className="text-xs text-muted-foreground">Сигналы</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-4">
        <Badge 
          variant="outline" 
          className={cn(
            "text-sm",
            isRunning ? "border-green-500 text-green-400" : 
            status === 'error' ? "border-red-500 text-red-400" : 
            "border-gray-500 text-gray-400"
          )}
        >
          <span className={cn(
            "mr-2 h-2 w-2 rounded-full",
            isRunning ? "bg-green-500 animate-pulse" : 
            status === 'error' ? "bg-red-500" : 
            "bg-gray-500"
          )} />
          {status.toUpperCase()}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Символ: <span className="font-mono font-bold">{config.symbol}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          ТФ: <span className="font-mono font-bold">{config.timeframe}</span>
        </span>
        {stats?.activePosition && (
          <Badge variant="secondary" className="text-xs">
            <Activity className="h-3 w-3 mr-1" />
            Активная позиция
          </Badge>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Macro Trend */}
        <MacroTrendIndicator 
          trend={stats?.macroTrend ?? 'NEUTRAL'} 
          condition={stats?.marketCondition ?? 'Загрузка...'}
        />
        
        {/* Position Timeline */}
        <PositionTimeline position={position} />
      </div>

      {/* Signal Feed */}
      <SignalFeed signals={signals} />

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает Chronos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Chronos</strong> — это низкочастотный торговый бот, который фокусируется на макро-трендах 
            и позиционной торговле с длительными периодами удержания.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Анализирует макро-рыночные условия и тренды</li>
            <li>Период удержания: от 4 часов до 3 дней</li>
            <li>Фильтрует сигналы через фундаментальный анализ</li>
            <li>Лучше всего для: Захвата крупных движений рынка</li>
          </ul>
          <p className="text-xs italic mt-2 text-cyan-400/70">
            "Время — мой союзник. Я вижу общую картину, которую другие упускают." — Chronos
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
