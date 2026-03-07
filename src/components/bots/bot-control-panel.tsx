'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
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
  stats: BotStats
  lastError?: string
  lastErrorTime?: number
}

interface SystemStatus {
  totalBots: number
  runningBots: number
  totalSignals: number
  totalPnl: number
  avgWinRate: number
}

// ============================================================================
// CATEGORY STYLING
// ============================================================================

const categoryStyles: Record<BotCategory, { icon: React.ElementType; color: string; bgColor: string }> = {
  operational: { icon: Activity, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  institutional: { icon: Crown, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  frequency: { icon: Cpu, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  meta: { icon: BarChart3, color: 'text-green-400', bgColor: 'bg-green-500/10' },
}

const statusStyles: Record<BotStatus, { color: string; label: string }> = {
  idle: { color: 'bg-gray-500', label: 'Idle' },
  starting: { color: 'bg-yellow-500', label: 'Starting' },
  running: { color: 'bg-green-500', label: 'Running' },
  stopping: { color: 'bg-yellow-500', label: 'Stopping' },
  error: { color: 'bg-red-500', label: 'Error' },
  paused: { color: 'bg-orange-500', label: 'Paused' },
}

// ============================================================================
// BOT CARD COMPONENT
// ============================================================================

function BotCard({ 
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
        {isRunning && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-2 rounded bg-background/50">
              <div className="text-muted-foreground">Trades</div>
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
          </div>
        )}
        
        {/* Win Rate Progress */}
        {isRunning && bot.stats.totalTrades > 0 && (
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
          <div className="p-2 rounded bg-red-500/10 text-red-400 text-xs">
            {bot.lastError}
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
              {isLoading ? 'Processing...' : isRunning ? 'Running' : 'Stopped'}
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
// CATEGORY SECTION
// ============================================================================

function CategorySection({ 
  title, 
  bots, 
  onToggle, 
  onConfig 
}: { 
  title: string
  bots: BotInfo[]
  onToggle: (code: string, enable: boolean) => void
  onConfig: (code: string) => void
}) {
  if (bots.length === 0) return null
  
  const runningCount = bots.filter(b => b.status === 'running').length
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        <Badge variant="secondary" className="text-xs">
          {runningCount}/{bots.length} running
        </Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {bots.map(bot => (
          <BotCard 
            key={bot.code} 
            bot={bot} 
            onToggle={onToggle}
            onConfig={onConfig}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BotControlPanel() {
  const [bots, setBots] = useState<BotInfo[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchBots = useCallback(async () => {
    try {
      const response = await fetch('/api/bots')
      if (!response.ok) throw new Error('Failed to fetch bots')
      const data = await response.json()
      setBots(data.bots)
      setSystemStatus(data.systemStatus)
    } catch (error) {
      console.error('Error fetching bots:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchBots()
    // Refresh every 5 seconds
    const interval = setInterval(fetchBots, 5000)
    return () => clearInterval(interval)
  }, [fetchBots])

  const handleToggle = async (code: string, enable: boolean) => {
    try {
      const action = enable ? 'start' : 'stop'
      const response = await fetch(`/api/bots/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        console.error('Error toggling bot:', error)
        return
      }
      
      // Refresh after toggle
      await fetchBots()
    } catch (error) {
      console.error('Error toggling bot:', error)
    }
  }

  const handleConfig = (code: string) => {
    // TODO: Open config modal
    console.log('Config bot:', code)
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchBots()
  }

  const handleStartAll = async (category?: BotCategory) => {
    const botsToStart = category 
      ? bots.filter(b => b.category === category && b.status !== 'running')
      : bots.filter(b => b.status !== 'running')
    
    for (const bot of botsToStart) {
      await handleToggle(bot.code, true)
    }
  }

  const handleStopAll = async (category?: BotCategory) => {
    const botsToStop = category 
      ? bots.filter(b => b.category === category && b.status === 'running')
      : bots.filter(b => b.status === 'running')
    
    for (const bot of botsToStop) {
      await handleToggle(bot.code, false)
    }
  }

  // Group bots by category
  const operationalBots = bots.filter(b => b.category === 'operational')
  const institutionalBots = bots.filter(b => b.category === 'institutional')
  const frequencyBots = bots.filter(b => b.category === 'frequency')
  const metaBots = bots.filter(b => b.category === 'meta')

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
          <h2 className="text-2xl font-bold">Bot Control Center</h2>
          <p className="text-muted-foreground">Manage and monitor all trading bots</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => handleStartAll()}
          >
            <Play className="h-4 w-4 mr-2" />
            Start All
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleStopAll()}
          >
            <Square className="h-4 w-4 mr-2" />
            Stop All
          </Button>
        </div>
      </div>

      {/* System Status */}
      {systemStatus && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold font-mono">{systemStatus.totalBots}</div>
                <div className="text-xs text-muted-foreground">Total Bots</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-green-400">{systemStatus.runningBots}</div>
                <div className="text-xs text-muted-foreground">Running</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono">{systemStatus.totalSignals}</div>
                <div className="text-xs text-muted-foreground">Signals</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold font-mono ${systemStatus.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {systemStatus.totalPnl >= 0 ? '+' : ''}{systemStatus.totalPnl.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">Total PnL</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold font-mono ${(systemStatus.avgWinRate * 100) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                  {(systemStatus.avgWinRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Avg Win Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bot Categories */}
      <CategorySection 
        title="Operational Bots" 
        bots={operationalBots}
        onToggle={handleToggle}
        onConfig={handleConfig}
      />
      
      <CategorySection 
        title="Institutional Bots" 
        bots={institutionalBots}
        onToggle={handleToggle}
        onConfig={handleConfig}
      />
      
      <CategorySection 
        title="Frequency Bots" 
        bots={frequencyBots}
        onToggle={handleToggle}
        onConfig={handleConfig}
      />
      
      <CategorySection 
        title="Meta Bots" 
        bots={metaBots}
        onToggle={handleToggle}
        onConfig={handleConfig}
      />
    </div>
  )
}
