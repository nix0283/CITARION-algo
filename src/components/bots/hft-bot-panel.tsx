'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Play, 
  Square, 
  Settings, 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Zap,
  RefreshCw,
  Cpu,
  Signal,
  AlertTriangle,
  BarChart3,
  Exchange,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BotExchangeConfig } from '@/components/exchange/bot-exchange-config'

// ============================================================================
// TYPES
// ============================================================================

type BotStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error' | 'paused'

interface HFTConfig {
  symbol: string
  exchange: string
  imbalanceThreshold: number
  entryThreshold: number
  stopLossPercent: number
  takeProfitPercent: number
  maxPositionSize: number
  maxOrdersPerMinute: number
  enableMomentumSignals: boolean
}

interface HFTStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  totalPnl: number
  winRate: number
  avgLatency: number
  signalsGenerated: number
  uptime: number
  currentImbalance: number
  currentSpread: number
  momentum: number
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

const DEFAULT_HFT_CONFIG: HFTConfig = {
  symbol: 'BTCUSDT',
  exchange: 'binance',
  imbalanceThreshold: 0.3,
  entryThreshold: 0.5,
  stopLossPercent: 0.5,
  takeProfitPercent: 1.0,
  maxPositionSize: 100,
  maxOrdersPerMinute: 10,
  enableMomentumSignals: true,
}

// ============================================================================
// ORDERBOOK VISUALIZATION
// ============================================================================

function OrderbookVisualization({ 
  imbalance, 
  spread, 
  momentum 
}: { 
  imbalance: number
  spread: number
  momentum: number
}) {
  const bidPercent = ((1 + imbalance) / 2) * 100
  const askPercent = ((1 - imbalance) / 2) * 100
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-orange-400" />
          Микроструктура ордербука
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Imbalance Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-green-400">Биды {bidPercent.toFixed(1)}%</span>
            <span className="text-muted-foreground">Дисбаланс</span>
            <span className="text-red-400">Аски {askPercent.toFixed(1)}%</span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden flex">
            <div 
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${bidPercent}%` }}
            />
            <div 
              className="bg-red-500 transition-all duration-300"
              style={{ width: `${askPercent}%` }}
            />
          </div>
        </div>
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center p-2 rounded bg-background/50">
            <div className="text-muted-foreground">Спред</div>
            <div className="font-mono font-bold">{spread.toFixed(4)}%</div>
          </div>
          <div className="text-center p-2 rounded bg-background/50">
            <div className="text-muted-foreground">Моментум</div>
            <div className={cn(
              "font-mono font-bold",
              momentum > 0 ? "text-green-400" : momentum < 0 ? "text-red-400" : ""
            )}>
              {momentum.toFixed(3)}
            </div>
          </div>
          <div className="text-center p-2 rounded bg-background/50">
            <div className="text-muted-foreground">Сигнал</div>
            <div className={cn(
              "font-mono font-bold",
              Math.abs(imbalance) > 0.3 ? (imbalance > 0 ? "text-green-400" : "text-red-400") : ""
            )}>
              {Math.abs(imbalance) > 0.3 ? (imbalance > 0 ? "LONG" : "SHORT") : "NEUTRAL"}
            </div>
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
            <Signal className="h-4 w-4 text-orange-400" />
            <CardTitle className="text-base">HFT Сигналы</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {signals.length} сигналов
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Сигналов пока нет. Запустите бота для генерации сигналов.
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
                  <span className="font-mono">{signal.entryPrice.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{(signal.confidence * 100).toFixed(0)}%</span>
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

export function HFTBotPanel() {
  const [status, setStatus] = useState<BotStatus>('idle')
  const [config, setConfig] = useState<HFTConfig>(DEFAULT_HFT_CONFIG)
  const [stats, setStats] = useState<HFTStats | null>(null)
  const [signals, setSignals] = useState<SignalInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [isPaperTrading, setIsPaperTrading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/bots/frequency?botCode=HFT')
      if (response.ok) {
        const data = await response.json()
        setStatus(data.bot?.status || 'idle')
        setStats(data.bot?.stats || null)
        setSignals(data.bot?.signals || [])
      }
    } catch (error) {
      console.error('Error fetching HFT status:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleToggle = async () => {
    const action = status === 'running' ? 'stop' : 'start'
    try {
      const response = await fetch('/api/bots/frequency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, botCode: 'HFT' }),
      })
      if (response.ok) {
        setStatus(action === 'start' ? 'starting' : 'stopping')
        setTimeout(fetchStatus, 1000)
      }
    } catch (error) {
      console.error('Error toggling HFT:', error)
    }
  }

  const handleConfigUpdate = async () => {
    try {
      await fetch('/api/bots/frequency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botCode: 'HFT', config }),
      })
      setShowConfig(false)
    } catch (error) {
      console.error('Error updating HFT config:', error)
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
            <Zap className="h-6 w-6 text-orange-400" />
            Helios
            <span className="text-sm font-normal text-muted-foreground">(HFT Bot)</span>
          </h2>
          <p className="text-muted-foreground">
            Высокочастотная торговля • Целевая задержка: &lt;10мс
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
            <CardTitle className="text-base">HFT Конфигурация</CardTitle>
            <CardDescription>Настройте параметры торговли</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Exchange Configuration */}
            <BotExchangeConfig
              botType="HFT"
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
                <Label>Биржа</Label>
                <Select value={config.exchange} onValueChange={(v) => setConfig({...config, exchange: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="binance">Binance</SelectItem>
                    <SelectItem value="bybit">Bybit</SelectItem>
                    <SelectItem value="okx">OKX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Порог дисбаланса</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  value={config.imbalanceThreshold}
                  onChange={(e) => setConfig({...config, imbalanceThreshold: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Порог входа</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  value={config.entryThreshold}
                  onChange={(e) => setConfig({...config, entryThreshold: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Стоп-лосс %</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  value={config.stopLossPercent}
                  onChange={(e) => setConfig({...config, stopLossPercent: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Тейк-профит %</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  value={config.takeProfitPercent}
                  onChange={(e) => setConfig({...config, takeProfitPercent: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Макс. размер позиции</Label>
                <Input 
                  type="number" 
                  value={config.maxPositionSize}
                  onChange={(e) => setConfig({...config, maxPositionSize: parseFloat(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>Макс. ордеров/мин</Label>
                <Input 
                  type="number" 
                  value={config.maxOrdersPerMinute}
                  onChange={(e) => setConfig({...config, maxOrdersPerMinute: parseInt(e.target.value)})}
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
              <div className={cn(
                "text-2xl font-bold font-mono",
                (stats?.avgLatency ?? 0) < 10 ? "text-green-400" : 
                (stats?.avgLatency ?? 0) < 100 ? "text-yellow-400" : "text-red-400"
              )}>
                {(stats?.avgLatency ?? 0).toFixed(1)}ms
              </div>
              <div className="text-xs text-muted-foreground">Ср. задержка</div>
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
          Биржа: <span className="font-mono font-bold">{config.exchange}</span>
        </span>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orderbook Visualization */}
        <OrderbookVisualization 
          imbalance={stats?.currentImbalance ?? 0}
          spread={stats?.currentSpread ?? 0}
          momentum={stats?.momentum ?? 0}
        />
        
        {/* Signal Feed */}
        <SignalFeed signals={signals} />
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает Helios</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Helios</strong> — это высокочастотный торговый бот, который анализирует микроструктуру ордербука 
            для обнаружения торговых возможностей в реальном времени.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Анализирует дисбаланс бидов/асков для направленных сигналов</li>
            <li>Вычисляет моментум на основе изменений ордербука</li>
            <li>Целевая задержка: &lt;10мс на цикл анализа</li>
            <li>Лучше всего для: Ликвидных пар с узкими спредами</li>
          </ul>
          <p className="text-xs italic mt-2 text-orange-400/70">
            "Я вижу пульс ордербука. Каждый дисбаланс — это возможность." — Helios
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
