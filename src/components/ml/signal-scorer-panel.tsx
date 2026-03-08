'use client'

/**
 * Signal Scorer Panel
 * 
 * UI component for Gradient Boosting Signal Quality Scoring
 * Displays signal quality scores, feature importance, and model statistics
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Brain,
  BarChart3,
  Target,
  Zap,
  Activity,
  Database,
  TreeDeciduous,
  History,
  Info,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'

// Types from gradient-boosting
interface SignalFeatures {
  return_1: number
  return_5: number
  return_10: number
  volatility_10: number
  volatility_20: number
  rsi_14: number
  macd: number
  macd_signal: number
  bollinger_position: number
  adx: number
  volume_ratio: number
  volume_trend: number
  ema_cross: number
  supertrend_direction: number
  trend_strength: number
  funding_rate: number
  basis: number
  open_interest_change: number
}

interface SignalScore {
  score: number
  confidence: number
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  quality: 'HIGH' | 'MEDIUM' | 'LOW'
  features: Partial<SignalFeatures>
}

interface ModelStats {
  treesCount: number
  trained: boolean
  trainScore: number
  validationScore: number
  featureCount: number
  learningRate: number
  maxDepth: number
}

interface HistoricalScore {
  id: string
  timestamp: number
  score: number
  confidence: number
  direction: 'LONG' | 'SHORT' | 'NEUTRAL'
  quality: 'HIGH' | 'MEDIUM' | 'LOW'
  symbol: string
}

interface FeatureImportance {
  name: string
  importance: number
}

// Feature labels for display
const FEATURE_LABELS: Record<keyof SignalFeatures, string> = {
  return_1: 'Return (1)',
  return_5: 'Return (5)',
  return_10: 'Return (10)',
  volatility_10: 'Volatility (10)',
  volatility_20: 'Volatility (20)',
  rsi_14: 'RSI (14)',
  macd: 'MACD',
  macd_signal: 'MACD Signal',
  bollinger_position: 'Bollinger Position',
  adx: 'ADX',
  volume_ratio: 'Volume Ratio',
  volume_trend: 'Volume Trend',
  ema_cross: 'EMA Cross',
  supertrend_direction: 'SuperTrend Direction',
  trend_strength: 'Trend Strength',
  funding_rate: 'Funding Rate',
  basis: 'Basis',
  open_interest_change: 'Open Interest Change',
}

// Feature groups
const FEATURE_GROUPS = {
  'Price Features': ['return_1', 'return_5', 'return_10', 'volatility_10', 'volatility_20'],
  'Technical Indicators': ['rsi_14', 'macd', 'macd_signal', 'bollinger_position', 'adx'],
  'Volume Features': ['volume_ratio', 'volume_trend'],
  'Trend Features': ['ema_cross', 'supertrend_direction', 'trend_strength'],
  'Market Context': ['funding_rate', 'basis', 'open_interest_change'],
}

// Get score color
const getScoreColor = (score: number): string => {
  if (score >= 70) return 'text-green-500'
  if (score >= 40) return 'text-yellow-500'
  return 'text-red-500'
}

// Get score background
const getScoreBgColor = (score: number): string => {
  if (score >= 70) return 'bg-green-500'
  if (score >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

// Get quality badge variant
const getQualityVariant = (quality: string): 'default' | 'secondary' | 'destructive' => {
  if (quality === 'HIGH') return 'default'
  if (quality === 'MEDIUM') return 'secondary'
  return 'destructive'
}

// Get direction icon
const DirectionIcon = ({ direction }: { direction: string }) => {
  if (direction === 'LONG') return <TrendingUp className="h-4 w-4 text-green-500" />
  if (direction === 'SHORT') return <TrendingDown className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-yellow-500" />
}

// Circular Gauge Component
function CircularGauge({ value, size = 120, strokeWidth = 10 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className={getScoreColor(value)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        <span className={`text-2xl font-bold ${getScoreColor(value)}`}>
          {value.toFixed(0)}
        </span>
        <span className="text-xs text-muted-foreground">Score</span>
      </div>
    </div>
  )
}

export function SignalScorerPanel() {
  // State
  const [modelStats, setModelStats] = useState<ModelStats | null>(null)
  const [featureImportance, setFeatureImportance] = useState<FeatureImportance[]>([])
  const [historicalScores, setHistoricalScores] = useState<HistoricalScore[]>([])
  const [currentScore, setCurrentScore] = useState<SignalScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)

  // Input state
  const [inputMode, setInputMode] = useState<'manual' | 'auto'>('manual')
  const [signalSource, setSignalSource] = useState('HFT')
  const [signalSymbol, setSignalSymbol] = useState('BTCUSDT')

  // Feature inputs
  const [features, setFeatures] = useState<Partial<SignalFeatures>>({
    return_1: 0,
    return_5: 0,
    return_10: 0,
    volatility_10: 0.02,
    volatility_20: 0.02,
    rsi_14: 50,
    macd: 0,
    macd_signal: 0,
    bollinger_position: 0,
    adx: 25,
    volume_ratio: 1,
    volume_trend: 0,
    ema_cross: 0,
    supertrend_direction: 0,
    trend_strength: 0,
    funding_rate: 0,
    basis: 0,
    open_interest_change: 0,
  })

  // Fetch model stats
  const fetchModelStats = useCallback(async () => {
    try {
      const res = await fetch('/api/ml/gradient-boosting/stats')
      const data = await res.json()
      if (data.success) {
        setModelStats(data.stats)
        setFeatureImportance(data.featureImportance || [])
      }
    } catch (error) {
      console.error('Failed to fetch model stats:', error)
    }
  }, [])

  // Fetch historical scores
  const fetchHistoricalScores = useCallback(async () => {
    try {
      const res = await fetch('/api/ml/gradient-boosting/history')
      const data = await res.json()
      if (data.success) {
        setHistoricalScores(data.history || [])
      }
    } catch (error) {
      console.error('Failed to fetch history:', error)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([fetchModelStats(), fetchHistoricalScores()])
      setLoading(false)
    }
    init()

    // Refresh every 30 seconds
    const interval = setInterval(fetchModelStats, 30000)
    return () => clearInterval(interval)
  }, [fetchModelStats, fetchHistoricalScores])

  // Score signal
  const scoreSignal = async () => {
    setScoring(true)
    try {
      const res = await fetch('/api/ml/gradient-boosting/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features,
          source: inputMode === 'auto' ? signalSource : undefined,
          symbol: inputMode === 'auto' ? signalSymbol : undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        // Normalize score to 0-100 range
        const normalizedScore = {
          ...data.score,
          score: Math.max(0, Math.min(100, (data.score.score + 1) * 50)), // Assuming raw score is -1 to 1
          confidence: data.score.confidence * 100,
        }
        setCurrentScore(normalizedScore)

        // Refresh history
        fetchHistoricalScores()
      }
    } catch (error) {
      console.error('Failed to score signal:', error)
    } finally {
      setScoring(false)
    }
  }

  // Update feature
  const updateFeature = (key: keyof SignalFeatures, value: number) => {
    setFeatures(prev => ({ ...prev, [key]: value }))
  }

  // Reset to defaults
  const resetFeatures = () => {
    setFeatures({
      return_1: 0,
      return_5: 0,
      return_10: 0,
      volatility_10: 0.02,
      volatility_20: 0.02,
      rsi_14: 50,
      macd: 0,
      macd_signal: 0,
      bollinger_position: 0,
      adx: 25,
      volume_ratio: 1,
      volume_trend: 0,
      ema_cross: 0,
      supertrend_direction: 0,
      trend_strength: 0,
      funding_rate: 0,
      basis: 0,
      open_interest_change: 0,
    })
    setCurrentScore(null)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Brain className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Gradient Boosting Оценщик Сигналов</CardTitle>
                <CardDescription>Прогнозирование качества сигнала с использованием ансамблей деревьев решений</CardDescription>
              </div>
            </div>
            <Badge variant={modelStats?.trained ? 'default' : 'secondary'}>
              {modelStats?.trained ? 'Обучен' : 'Не Обучен'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="scorer" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="scorer">
            <Gauge className="h-4 w-4 mr-1" />
            Оценка
          </TabsTrigger>
          <TabsTrigger value="features">
            <BarChart3 className="h-4 w-4 mr-1" />
            Признаки
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1" />
            История
          </TabsTrigger>
          <TabsTrigger value="model">
            <TreeDeciduous className="h-4 w-4 mr-1" />
            Модель
          </TabsTrigger>
        </TabsList>

        {/* Scorer Tab */}
        <TabsContent value="scorer" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Score Display */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Оценка Качества Сигнала
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-4">
                  {currentScore ? (
                    <div className="flex flex-col items-center gap-4">
                      <CircularGauge value={currentScore.score} size={150} strokeWidth={12} />
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <DirectionIcon direction={currentScore.direction} />
                          <span className="font-medium">{currentScore.direction}</span>
                        </div>
                        <Badge variant={getQualityVariant(currentScore.quality)}>
                          {currentScore.quality} Качество
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Уверенность: <span className="font-medium text-foreground">{currentScore.confidence.toFixed(1)}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Gauge className="h-16 w-16 opacity-50" />
                      <span>Настройте признаки и нажмите Оценить для анализа</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Input */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Ввод Сигнала
                </CardTitle>
                <CardDescription>Настройте источник сигнала или введите признаки вручную</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Input Mode */}
                <div className="flex items-center gap-2">
                  <Button
                    variant={inputMode === 'manual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInputMode('manual')}
                  >
                    Ручной
                  </Button>
                  <Button
                    variant={inputMode === 'auto' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInputMode('auto')}
                  >
                    Из Источника
                  </Button>
                </div>

                {inputMode === 'auto' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Источник Сигнала</Label>
                      <Select value={signalSource} onValueChange={setSignalSource}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HFT">HFT (Helios)</SelectItem>
                          <SelectItem value="MFT">MFT (Selene)</SelectItem>
                          <SelectItem value="LFT">LFT (Atlas)</SelectItem>
                          <SelectItem value="TRND">TRND</SelectItem>
                          <SelectItem value="FCST">FCST</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Символ</Label>
                      <Select value={signalSymbol} onValueChange={setSignalSymbol}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BTCUSDT">BTCUSDT</SelectItem>
                          <SelectItem value="ETHUSDT">ETHUSDT</SelectItem>
                          <SelectItem value="SOLUSDT">SOLUSDT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Key Feature Inputs */}
                <div className="space-y-3">
                  <Label className="text-sm text-muted-foreground">Ключевые Признаки</Label>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>RSI (14)</span>
                        <span className="text-muted-foreground">{features.rsi_14?.toFixed(0)}</span>
                      </div>
                      <Slider
                        value={[features.rsi_14 || 50]}
                        onValueChange={([v]) => updateFeature('rsi_14', v)}
                        min={0}
                        max={100}
                        step={1}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>ADX</span>
                        <span className="text-muted-foreground">{features.adx?.toFixed(0)}</span>
                      </div>
                      <Slider
                        value={[features.adx || 25]}
                        onValueChange={([v]) => updateFeature('adx', v)}
                        min={0}
                        max={100}
                        step={1}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Соотношение Объёма</span>
                        <span className="text-muted-foreground">{features.volume_ratio?.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[(features.volume_ratio || 1) * 50]}
                        onValueChange={([v]) => updateFeature('volume_ratio', v / 50)}
                        min={0}
                        max={200}
                        step={1}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Сила Тренда</span>
                        <span className="text-muted-foreground">{features.trend_strength?.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[(features.trend_strength || 0) + 1]}
                        onValueChange={([v]) => updateFeature('trend_strength', v - 1)}
                        min={0}
                        max={200}
                        step={1}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button onClick={scoreSignal} disabled={scoring} className="flex-1">
                    {scoring ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Gauge className="h-4 w-4 mr-2" />
                    )}
                    Оценить Сигнал
                  </Button>
                  <Button variant="outline" onClick={resetFeatures}>
                    Сбросить
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Score Breakdown */}
          {currentScore && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Разбивка Оценки
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Сила Направления</Label>
                    <div className="flex items-center gap-2">
                      <DirectionIcon direction={currentScore.direction} />
                      <Progress
                        value={currentScore.direction === 'NEUTRAL' ? 33 :
                               currentScore.direction === 'LONG' ? 100 : 100}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Уровень Уверенности</Label>
                    <div className="flex items-center gap-2">
                      <span className={getScoreColor(currentScore.confidence)}>
                        {currentScore.confidence >= 70 ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : currentScore.confidence >= 40 ? (
                          <Info className="h-4 w-4" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                      </span>
                      <Progress value={currentScore.confidence} className="flex-1" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Оценка Качества</Label>
                    <Badge variant={getQualityVariant(currentScore.quality)} className="w-full justify-center">
                      {currentScore.quality}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Сырая Оценка</Label>
                    <div className="text-lg font-semibold">
                      {currentScore.score.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-4">
          {/* Feature Importance Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Важность Признаков
              </CardTitle>
              <CardDescription>Относительная важность каждого признака в модели</CardDescription>
            </CardHeader>
            <CardContent>
              {featureImportance.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={featureImportance} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="name" type="category" width={120} className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                        {featureImportance.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.importance >= 0.1 ? 'hsl(var(--chart-1))' :
                              entry.importance >= 0.05 ? 'hsl(var(--chart-2))' :
                              'hsl(var(--chart-3))'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  <span>Нет данных о важности признаков</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feature Input Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Конфигурация Признаков</CardTitle>
              <CardDescription>Настройте все 18 признаков сигнала вручную</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-6 pr-4">
                  {Object.entries(FEATURE_GROUPS).map(([group, featureKeys]) => (
                    <div key={group}>
                      <h4 className="text-sm font-medium mb-3 text-muted-foreground">{group}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {featureKeys.map(key => {
                          const featureKey = key as keyof SignalFeatures
                          const label = FEATURE_LABELS[featureKey]
                          const value = features[featureKey] ?? 0

                          return (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>{label}</span>
                                <span className="text-muted-foreground">{value.toFixed(4)}</span>
                              </div>
                              <Input
                                type="number"
                                step="any"
                                value={value}
                                onChange={(e) => updateFeature(featureKey, parseFloat(e.target.value) || 0)}
                                className="h-8"
                              />
                            </div>
                          )
                        })}
                      </div>
                      <Separator className="mt-4" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                История Результатов
              </CardTitle>
              <CardDescription>Предыдущие результаты оценки сигналов</CardDescription>
            </CardHeader>
            <CardContent>
              {historicalScores.length > 0 ? (
                <ScrollArea className="h-96">
                  <div className="space-y-2 pr-4">
                    {historicalScores.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${getScoreBgColor(item.score)} bg-opacity-10`}>
                            <DirectionIcon direction={item.direction} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.symbol}</span>
                              <Badge variant={getQualityVariant(item.quality)} className="text-xs">
                                {item.quality}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(item.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${getScoreColor(item.score)}`}>
                            {item.score.toFixed(0)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Увер.: {item.confidence.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 opacity-50 mb-2" />
                  <span>Нет истории оценок</span>
                  <span className="text-xs">Оцените сигналы для создания истории</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Model Tab */}
        <TabsContent value="model" className="space-y-4">
          {/* Model Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <TreeDeciduous className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Trees</span>
                </div>
                <div className="text-2xl font-bold mt-1">{modelStats?.treesCount || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Features</span>
                </div>
                <div className="text-2xl font-bold mt-1">{modelStats?.featureCount || 18}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Learning Rate</span>
                </div>
                <div className="text-2xl font-bold mt-1">{modelStats?.learningRate || 0.1}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Max Depth</span>
                </div>
                <div className="text-2xl font-bold mt-1">{modelStats?.maxDepth || 5}</div>
              </CardContent>
            </Card>
          </div>

          {/* Training Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Training Metrics
              </CardTitle>
              <CardDescription>Model performance metrics from training</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Training Score (R²)</Label>
                    <span className="text-sm">
                      {((modelStats?.trainScore || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, Math.min(100, (modelStats?.trainScore || 0) * 100))}
                    className="h-2"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Validation Score (R²)</Label>
                    <span className="text-sm">
                      {((modelStats?.validationScore || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, Math.min(100, (modelStats?.validationScore || 0) * 100))}
                    className="h-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Model Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Model Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-muted-foreground">Estimators</div>
                  <div className="font-medium">{modelStats?.treesCount || 100}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-muted-foreground">Learning Rate</div>
                  <div className="font-medium">{modelStats?.learningRate || 0.1}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-muted-foreground">Max Depth</div>
                  <div className="font-medium">{modelStats?.maxDepth || 5}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-muted-foreground">Min Samples Split</div>
                  <div className="font-medium">10</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-muted-foreground">Min Samples Leaf</div>
                  <div className="font-medium">5</div>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-muted-foreground">Subsample</div>
                  <div className="font-medium">0.8</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default SignalScorerPanel
