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
  Moon,
  Signal,
  Activity,
  BarChart3,
  Exchange,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BotExchangeConfig } from '@/components/exchange/bot-exchange-config'

// ============================================================================
// TYPES
// ============================================================================

type BotStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error' | 'paused'

interface MFTConfig {
  symbol: string
  exchange: string
  timeframe: string
  swingLookback: number
  trendConfirmation: number
  stopLossPercent: number
  takeProfitPercent: number
  positionSize: number
  useTrailingStop: boolean
  trailingStopPercent: number
}

interface MFTStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  winRate: number
  avgHoldingTime: number
  signalsGenerated: number
  currentSwingHigh: number
  currentSwingLow: number
  trend: 'UP' | 'DOWN' | 'SIDEWAYS'
}

interface SwingPoint {
  type: 'HIGH' | 'LOW'
  price: number
  timestamp: number
  strength: number
}

interface SignalInfo {
  id: string
  timestamp: number
  type: string
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  confidence: number
  entryPrice: number
  reason: string
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_MFT_CONFIG: MFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  timeframe: '15m',
  swingLookback: 10,
  trendConfirmation: 3,
  stopLossPercent: 2.0,
  takeProfitPercent: 5.0,
  positionSize: 100,
  useTrailingStop: true,
  trailingStopPercent: 1.5,
}

// ============================================================================
// SWING POINTS VISUALIZATION
// ============================================================================

function SwingPointsVisualization({ 
  swingHigh, 
  swingLow, 
  trend 
}: { 
  swingHigh: number
  swingLow: number
  trend: 'UP' | 'DOWN' | 'SIDEWAYS'
}) {
  const range = swingHigh - swingLow
  const midPrice = (swingHigh + swingLow) / 2
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Свинг-анализ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Price Range */}
        <div className="relative h-20 bg-muted/50 rounded-lg overflow-hidden">
          {/* Resistance Line */}
          <div className="absolute top-2 left-0 right-0 border-t-2 border-dashed border-red-500/50" />
          <div className="absolute top-1 right-2 text-xs text-red-400 font-mono">
            R: ${swingHigh.toFixed(2)}
          </div>
          
          {/* Support Line */}
          <div className="absolute bottom-2 left-0 right-0 border-t-2 border-dashed border-green-500/50" />
          <div className="absolute bottom-1 right-2 text-xs text-green-400 font-mono">
            S: ${swingLow.toFixed(2)}
          </div>
          
          {/* Trend Arrow */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn(
              "text-3xl",
              trend === 'UP' ? "text-green-400" : 
              trend === 'DOWN' ? "text-red-400 rotate-180" : 
              "text-gray-400 rotate-90"
            )}>
              {trend === 'UP' ? '↑' : trend === 'DOWN' ? '↓' : '→'}
            </div>
          </div>
        </div>
        
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center p-2 rounded bg-background/50">
            <div className="text-muted-foreground">Диапазон</div>
            <div className="font-mono font-bold">${range.toFixed(2)}</div>
          </div>
          <div className="text-center p-2 rounded bg-background/50">
            <div className="text-muted-foreground">Диапазон %</div>
            <div className="font-mono font-bold">{((range / swingLow) * 100).toFixed(2)}%</div>
          </div>
          <div className="text-center p-2 rounded bg-background/50">
            <div className="text-muted-foreground">Тренд</div>
            <div className={cn(
              "font-mono font-bold",
              trend === 'UP' ? "text-green-400" : 
              trend === 'DOWN' ? "text-red-400" : 
              "text-gray-400"
            )}>
              {trend}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// TREND INDICATOR
// ============================================================================

function TrendIndicator({ trend, confidence }: { trend: 'UP' | 'DOWN' | 'SIDEWAYS', confidence: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-purple-400" />
          Направление тренда
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center gap-8">
          {/* Down Arrow */}
          <div className={cn(
            "flex flex-col items-center",
            trend === 'DOWN' ? "text-red-400" : "text-gray-600"
          )}>
            <TrendingDown className="h-8 w-8" />
            <span className="text-xs mt-1">Медвежий</span>
          </div>
          
          {/* Center Indicator */}
          <div className="flex flex-col items-center">
            <div className={cn(
              "w-16 h-16 rounded-full border-4 flex items-center justify-center",
              trend === 'UP' ? "border-green-500" : 
              trend === 'DOWN' ? "border-red-500" : 
              "border-gray-500"
            )}>
              <span className={cn(
                "text-lg font-bold",
                trend === 'UP' ? "text-green-400" : 
                trend === 'DOWN' ? "text-red-400" : 
                "text-gray-400"
              )}>
                {trend === 'UP' ? '↑' : trend === 'DOWN' ? '↓' : '–'}
              </span>
            </div>
            <span className="text-xs mt-2 text-muted-foreground">
              {(confidence * 100).toFixed(0)}% уверенность
            </span>
          </div>
          
          {/* Up Arrow */}
          <div className={cn(
            "flex flex-col items-center",
            trend === 'UP' ? "text-green-400" : "text-gray-600"
          )}>
            <TrendingUp className="h-8 w-8" />
            <span className="text-xs mt-1">Бычий</span>
          </div>
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
            <Signal className="h-4 w-4 text-purple-400" />
            <CardTitle className="text-base">MFT Сигналы</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {signals.length} сигналов
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Сигналов пока нет. Запустите бота для генерации свинг-сигналов.
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {signals.slice(0, 10).map(signal => (
              <div key={signal.id} className="flex items-center justify-between p-2 rounded bg-background/50 text-xs">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      signal.direction === 'LONG' ? "text-green-400 border-green-500" : 
                      signal.direction === 'SHORT' ? "text-red-400 border-red-500" : 
                      "text-gray-400"
                    )}
                  >
                    {signal.direction}
                  </Badge>
                  <span className="font-mono">${signal.entryPrice.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{signal.reason}</span>
                  <span className="text-muted-foreground">{new Date(signal.timestamp).toLocaleTimeString()}</span>
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

export function MFTBotPanel() {
  const [status, setStatus] = useState<BotStatus>('idle')
  const [config, setConfig] = useState<MFTConfig>(DEFAULT_MFT_CONFIG)
  const [stats, setStats] = useState<MFTStats | null>(null)
  const [signals, setSignals] = useState<SignalInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [isPaperTrading, setIsPaperTrading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/bots/frequency?botCode=MFT')
      if (response.ok) {
        const data = await response.json()
        setStatus(data.bot?.status || 'idle')
        setStats(data.bot?.stats || null)
        setSignals(data.bot?.signals || [])
      }
    } catch (error) {
      console.error('Error fetching MFT status:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleToggle = async () => {
    const action = status === 'running' ? 'stop' : 'start'
    try {
      const response = await fetch('/api/bots/frequency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, botCode: 'MFT' }),
      })
      if (response.ok) {
        setStatus(action === 'start' ? 'starting' : 'stopping')
        setTimeout(fetchStatus, 1000)
      }
    } catch (error) {
      console.error('Error toggling MFT:', error)
    }
  }

  const handleConfigUpdate = async () => {
    try {
      await fetch('/api/bots/frequency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botCode: 'MFT', config }),
      })
      setShowConfig(false)
    } catch (error) {
      console.error('Error updating MFT config:', error)
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
            <Moon className="h-6 w-6 text-purple-400" />
            Selene
            <span className="text-sm font-normal text-muted-foreground">(MFT Bot)</span>
          </h2>
          <p className="text-muted-foreground">
            Среднечастотная торговля • Свинг и позиционная торговля
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
            <CardTitle className="text-base">MFT Конфигурация</CardTitle>
            <CardDescription>Настройте параметры свинг-торговли</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Exchange Configuration */}
            <BotExchangeConfig
              botType="MFT"
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
                    <SelectItem value="5m">5 минут</SelectItem>
                    <SelectItem value="15m">15 минут</SelectItem>
                    <SelectItem value="1h">1 час</SelectItem>
                    <SelectItem value="4h">4 часа</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Свинг-откат</Label>
                <Input 
                  type="number" 
                  value={config.swingLookback}
                  onChange={(e) => setConfig({...config, swingLookback: parseInt(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Подтверждение тренда</Label>
                <Input 
                  type="number" 
                  value={config.trendConfirmation}
                  onChange={(e) => setConfig({...config, trendConfirmation: parseInt(e.target.value)})}
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
                <Label>Трейлинг-стоп %</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  value={config.trailingStopPercent}
                  onChange={(e) => setConfig({...config, trailingStopPercent: parseFloat(e.target.value)})}
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
                {Math.floor((stats?.avgHoldingTime ?? 0) / 60000)}m
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
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Swing Points */}
        <SwingPointsVisualization 
          swingHigh={stats?.currentSwingHigh ?? 0}
          swingLow={stats?.currentSwingLow ?? 0}
          trend={stats?.trend ?? 'SIDEWAYS'}
        />
        
        {/* Trend Indicator */}
        <TrendIndicator 
          trend={stats?.trend ?? 'SIDEWAYS'} 
          confidence={0.75}
        />
      </div>

      {/* Signal Feed */}
      <SignalFeed signals={signals} />

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает Selene</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Selene</strong> — это среднечастотный торговый бот, который определяет точки разворота 
            и смены тренда для позиционной торговли.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Определяет свинг-максимумы и минимумы для поддержки/сопротивления</li>
            <li>Подтверждает тренды с помощью мультитаймфрейм анализа</li>
            <li>Период удержания: от 15 минут до нескольких часов</li>
            <li>Лучше всего для: Трендовых рынков с четким направлением</li>
          </ul>
          <p className="text-xs italic mt-2 text-purple-400/70">
            "Я вижу волны рынка. Каждый свинг — это история." — Selene
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
