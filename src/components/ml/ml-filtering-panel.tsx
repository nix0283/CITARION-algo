'use client'

/**
 * ML Filtering Panel
 * 
 * UI for managing ML-based signal filtering
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Brain,
  Filter,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Settings,
  BarChart3,
  Zap,
  Activity,
  AlertTriangle,
} from 'lucide-react'

// Types
interface MLFilterStats {
  totalSignals: number
  passedSignals: number
  rejectedSignals: number
  adjustedSignals: number
  avgOriginalConfidence: number
  avgFilteredConfidence: number
  avgMLScore: number
  avgQualityScore: number
  longApprovals: number
  shortApprovals: number
  neutralSignals: number
  rejectionReasons: Record<string, number>
  lastReset: number
}

interface MLFilterConfig {
  enabled: boolean
  minConfidence: number
  minMLAgreement: number
  useRegimeFilter: boolean
  useADXFilter: boolean
  useVolatilityFilter: boolean
  requireDirectionConfirmation: boolean
  directionConfirmationThreshold: number
  adjustConfidence: boolean
  confidenceBlendWeight: number
  autoTrain: boolean
  trainingThreshold: number
  highQualityThreshold: number
  lowQualityThreshold: number
}

interface ClassifierStats {
  totalSamples: number
  longCount: number
  shortCount: number
  neutralCount: number
  avgConfidence: number
  winRate: number
  lastUpdated: number
}

interface FilterResult {
  passed: boolean
  adjustedDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
  adjustedConfidence: number
  mlScore: number
  qualityScore: number
  riskScore: number
  recommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR'
  rejectionReasons: string[]
}

export function MLFilteringPanel() {
  // State
  const [stats, setStats] = useState<MLFilterStats | null>(null)
  const [config, setConfig] = useState<MLFilterConfig | null>(null)
  const [classifierStats, setClassifierStats] = useState<ClassifierStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState<FilterResult | null>(null)
  const [testSignal, setTestSignal] = useState({
    botCode: 'HFT',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    confidence: 0.7,
  })
  
  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [filterRes, statsRes] = await Promise.all([
        fetch('/api/ml/filter'),
        fetch('/api/ml/stats?detailed=true'),
      ])
      
      const filterData = await filterRes.json()
      const statsData = await statsRes.json()
      
      if (filterData.success) {
        setConfig(filterData.config)
      }
      
      if (statsData.success) {
        setStats(statsData.filter)
        setClassifierStats(statsData.classifier)
      }
    } catch (error) {
      console.error('Failed to fetch ML data:', error)
    } finally {
      setLoading(false)
    }
  }, [])
  
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])
  
  // Update config
  const updateConfig = async (updates: Partial<MLFilterConfig>) => {
    if (!config) return
    
    try {
      const res = await fetch('/api/ml/filter', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { ...config, ...updates } }),
      })
      
      const data = await res.json()
      if (data.success) {
        setConfig(data.config)
      }
    } catch (error) {
      console.error('Failed to update config:', error)
    }
  }
  
  // Test filter
  const testFilter = async () => {
    try {
      const res = await fetch('/api/ml/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal: {
            botCode: testSignal.botCode,
            symbol: testSignal.symbol,
            exchange: 'binance',
            direction: testSignal.direction,
            confidence: testSignal.confidence,
          },
        }),
      })
      
      const data = await res.json()
      if (data.success) {
        setTestResult(data.result)
      }
    } catch (error) {
      console.error('Failed to test filter:', error)
    }
  }
  
  // Reset stats
  const resetStats = async () => {
    try {
      await fetch('/api/ml/stats', { method: 'DELETE' })
      fetchData()
    } catch (error) {
      console.error('Failed to reset stats:', error)
    }
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
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Brain className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-lg">ML Фильтр Сигналов</CardTitle>
                <CardDescription>Интеграция классификатора Lawrence</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={config?.enabled ?? true}
                onCheckedChange={(checked) => updateConfig({ enabled: checked })}
              />
              <Badge variant={config?.enabled ? 'default' : 'secondary'}>
                {config?.enabled ? 'Активен' : 'Отключён'}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="config">Конфигурация</TabsTrigger>
          <TabsTrigger value="test">Тест Фильтра</TabsTrigger>
          <TabsTrigger value="training">Обучение</TabsTrigger>
          <TabsTrigger value="integration">Интеграции</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{stats?.totalSignals || 0}</div>
                <div className="text-sm text-muted-foreground">Всего Сигналов</div>
                <Progress 
                  value={stats?.totalSignals ? Math.min(100, stats.totalSignals / 10) : 0} 
                  className="mt-2 h-1" 
                />
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-500">{stats?.passedSignals || 0}</div>
                <div className="text-sm text-muted-foreground">Прошло</div>
                <Progress 
                  value={stats?.totalSignals ? (stats.passedSignals / stats.totalSignals) * 100 : 0} 
                  className="mt-2 h-1" 
                />
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-red-500">{stats?.rejectedSignals || 0}</div>
                <div className="text-sm text-muted-foreground">Отклонено</div>
                <Progress 
                  value={stats?.totalSignals ? (stats.rejectedSignals / stats.totalSignals) * 100 : 0} 
                  className="mt-2 h-1" 
                />
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-yellow-500">{stats?.adjustedSignals || 0}</div>
                <div className="text-sm text-muted-foreground">Скорректировано</div>
                <Progress 
                  value={stats?.totalSignals ? (stats.adjustedSignals / stats.totalSignals) * 100 : 0} 
                  className="mt-2 h-1" 
                />
              </CardContent>
            </Card>
          </div>
          
          {/* Quality Metrics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Метрики Качества
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Исходная Уверенность</Label>
                    <div className="text-lg font-semibold">
                      {((stats?.avgOriginalConfidence || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Отфильтрованная Уверенность</Label>
                    <div className="text-lg font-semibold">
                      {((stats?.avgFilteredConfidence || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Средняя ML Оценка</Label>
                    <div className="text-lg font-semibold">
                      {((stats?.avgMLScore || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Оценка Качества</Label>
                    <div className="text-lg font-semibold">
                      {((stats?.avgQualityScore || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Long Одобрения</Label>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="text-lg font-semibold">{stats?.longApprovals || 0}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Short Одобрения</Label>
                    <div className="flex items-center gap-1">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      <span className="text-lg font-semibold">{stats?.shortApprovals || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Rejection Reasons */}
          {stats?.rejectionReasons && Object.keys(stats.rejectionReasons).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Причины Отклонения</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(stats.rejectionReasons).map(([reason, count]) => (
                    <div key={reason} className="flex items-center justify-between">
                      <span className="text-sm">{reason}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Настройки Фильтра
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Minimum Confidence */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Минимальная Уверенность</Label>
                  <span className="text-sm text-muted-foreground">
                    {((config?.minConfidence || 0.3) * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[(config?.minConfidence || 0.3) * 100]}
                  onValueChange={([value]) => updateConfig({ minConfidence: value / 100 })}
                  max={100}
                  step={5}
                />
              </div>
              
              {/* Minimum ML Agreement */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Минимальное ML Согласие</Label>
                  <span className="text-sm text-muted-foreground">
                    {((config?.minMLAgreement || 0.4) * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[(config?.minMLAgreement || 0.4) * 100]}
                  onValueChange={([value]) => updateConfig({ minMLAgreement: value / 100 })}
                  max={100}
                  step={5}
                />
              </div>
              
              {/* Confidence Blend Weight */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Вес ML Уверенности</Label>
                  <span className="text-sm text-muted-foreground">
                    {((config?.confidenceBlendWeight || 0.3) * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[(config?.confidenceBlendWeight || 0.3) * 100]}
                  onValueChange={([value]) => updateConfig({ confidenceBlendWeight: value / 100 })}
                  max={100}
                  step={5}
                />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Компоненты Фильтра</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <Label>Фильтр Режима</Label>
                </div>
                <Switch
                  checked={config?.useRegimeFilter ?? true}
                  onCheckedChange={(checked) => updateConfig({ useRegimeFilter: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <Label>ADX Фильтр</Label>
                </div>
                <Switch
                  checked={config?.useADXFilter ?? true}
                  onCheckedChange={(checked) => updateConfig({ useADXFilter: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <Label>Фильтр Волатильности</Label>
                </div>
                <Switch
                  checked={config?.useVolatilityFilter ?? true}
                  onCheckedChange={(checked) => updateConfig({ useVolatilityFilter: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label>Подтверждение Направления</Label>
                </div>
                <Switch
                  checked={config?.requireDirectionConfirmation ?? false}
                  onCheckedChange={(checked) => updateConfig({ requireDirectionConfirmation: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <Label>Коррекция Уверенности</Label>
                </div>
                <Switch
                  checked={config?.adjustConfidence ?? true}
                  onCheckedChange={(checked) => updateConfig({ adjustConfidence: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  <Label>Авто-Обучение</Label>
                </div>
                <Switch
                  checked={config?.autoTrain ?? true}
                  onCheckedChange={(checked) => updateConfig({ autoTrain: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Test Filter Tab */}
        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Тест Фильтра Сигналов</CardTitle>
              <CardDescription>Проверьте как ML фильтр обрабатывает сигнал</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Код Бота</Label>
                  <Select
                    value={testSignal.botCode}
                    onValueChange={(value) => setTestSignal({ ...testSignal, botCode: value })}
                  >
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
                  <Select
                    value={testSignal.symbol}
                    onValueChange={(value) => setTestSignal({ ...testSignal, symbol: value })}
                  >
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
                
                <div className="space-y-2">
                  <Label>Направление</Label>
                  <Select
                    value={testSignal.direction}
                    onValueChange={(value) => setTestSignal({ ...testSignal, direction: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LONG">LONG</SelectItem>
                      <SelectItem value="SHORT">SHORT</SelectItem>
                      <SelectItem value="NEUTRAL">NEUTRAL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Уверенность: {(testSignal.confidence * 100).toFixed(0)}%</Label>
                  <Slider
                    value={[testSignal.confidence * 100]}
                    onValueChange={([value]) => setTestSignal({ ...testSignal, confidence: value / 100 })}
                    max={100}
                    step={5}
                  />
                </div>
              </div>
              
              <Button onClick={testFilter} className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                Тест Фильтра
              </Button>
              
              {/* Test Result */}
              {testResult && (
                <div className="mt-4 p-4 rounded-lg border bg-muted/50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-semibold">Результат Фильтра</span>
                    <Badge variant={testResult.passed ? 'default' : 'destructive'}>
                      {testResult.passed ? 'ПРОШЁЛ' : 'ОТКЛОНЁН'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Скорректированное Направление:</span>
                      <div className="flex items-center gap-1 mt-1">
                        {testResult.adjustedDirection === 'LONG' && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {testResult.adjustedDirection === 'SHORT' && <TrendingDown className="h-4 w-4 text-red-500" />}
                        {testResult.adjustedDirection === 'NEUTRAL' && <Minus className="h-4 w-4 text-yellow-500" />}
                        <span className="font-medium">{testResult.adjustedDirection}</span>
                      </div>
                    </div>
                    
                    <div>
                      <span className="text-muted-foreground">Скорректированная Уверенность:</span>
                      <div className="font-medium mt-1">
                        {(testResult.adjustedConfidence * 100).toFixed(1)}%
                      </div>
                    </div>
                    
                    <div>
                      <span className="text-muted-foreground">ML Оценка:</span>
                      <Progress value={testResult.mlScore * 100} className="mt-1 h-2" />
                    </div>
                    
                    <div>
                      <span className="text-muted-foreground">Оценка Качества:</span>
                      <Progress value={testResult.qualityScore * 100} className="mt-1 h-2" />
                    </div>
                    
                    <div>
                      <span className="text-muted-foreground">Оценка Риска:</span>
                      <Progress 
                        value={testResult.riskScore * 100} 
                        className="mt-1 h-2" 
                      />
                    </div>
                    
                    <div>
                      <span className="text-muted-foreground">Рекомендация:</span>
                      <div className="mt-1">
                        <Badge variant={
                          testResult.recommendation === 'APPROVE' ? 'default' :
                          testResult.recommendation === 'REJECT' ? 'destructive' :
                          testResult.recommendation === 'ADJUST' ? 'secondary' : 'outline'
                        }>
                          {testResult.recommendation}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  {testResult.rejectionReasons.length > 0 && (
                    <div className="mt-4">
                      <span className="text-sm text-muted-foreground">Причины Отклонения:</span>
                      <ul className="mt-2 space-y-1">
                        {testResult.rejectionReasons.map((reason, i) => (
                          <li key={i} className="text-sm flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Training Tab */}
        <TabsContent value="training" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Обучение Классификатора</CardTitle>
              <CardDescription>
                Статистика и данные обучения классификатора Lawrence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold">{classifierStats?.totalSamples || 0}</div>
                  <div className="text-xs text-muted-foreground">Всего Образцов</div>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10">
                  <div className="text-2xl font-bold text-green-500">{classifierStats?.longCount || 0}</div>
                  <div className="text-xs text-muted-foreground">Long Образцы</div>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10">
                  <div className="text-2xl font-bold text-red-500">{classifierStats?.shortCount || 0}</div>
                  <div className="text-xs text-muted-foreground">Short Образцы</div>
                </div>
                <div className="p-3 rounded-lg bg-yellow-500/10">
                  <div className="text-2xl font-bold text-yellow-500">{classifierStats?.neutralCount || 0}</div>
                  <div className="text-xs text-muted-foreground">Neutral Образцы</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Win Rate</Label>
                  <div className="text-xl font-semibold">
                    {((classifierStats?.winRate || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Средняя Уверенность</Label>
                  <div className="text-xl font-semibold">
                    {((classifierStats?.avgConfidence || 0) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchData}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Обновить
                </Button>
                <Button variant="outline" onClick={resetStats}>
                  Сбросить Статистику
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Настройки Обучения</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Авто-Обучение</Label>
                  <p className="text-xs text-muted-foreground">
                    Автоматическое обучение на качественных сигналах
                  </p>
                </div>
                <Switch
                  checked={config?.autoTrain ?? true}
                  onCheckedChange={(checked) => updateConfig({ autoTrain: checked })}
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Порог Обучения</Label>
                  <span className="text-sm text-muted-foreground">
                    {((config?.trainingThreshold || 0.7) * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  value={[(config?.trainingThreshold || 0.7) * 100]}
                  onValueChange={([value]) => updateConfig({ trainingThreshold: value / 100 })}
                  max={100}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">
                  Обучать только на сигналах с оценкой качества выше этого порога
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Integration Tab */}
        <TabsContent value="integration" className="space-y-4">
          {/* Integration Pipeline */}
          <Card className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-cyan-400" />
                ML Integration Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pipeline Flow */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 p-3 rounded-lg border bg-purple-500/10 border-purple-500/50 text-center">
                  <Filter className="h-4 w-4 text-purple-400 mx-auto mb-1" />
                  <span className="text-xs font-medium text-purple-400">ML Filter</span>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <Badge variant="outline" className="text-xs bg-purple-500/20 border-purple-500/50">
                      {config?.enabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div className="text-slate-600">→</div>
                <div className="flex-1 p-3 rounded-lg border bg-blue-500/10 border-blue-500/50 text-center">
                  <BarChart3 className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                  <span className="text-xs font-medium text-blue-400">LOGOS Engine</span>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <Badge variant="outline" className="text-xs bg-blue-500/20 border-blue-500/50">
                      Connected
                    </Badge>
                  </div>
                </div>
                <div className="text-slate-600">→</div>
                <div className="flex-1 p-3 rounded-lg border bg-green-500/10 border-green-500/50 text-center">
                  <TrendingUp className="h-4 w-4 text-green-400 mx-auto mb-1" />
                  <span className="text-xs font-medium text-green-400">Backtesting</span>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <Badge variant="outline" className="text-xs bg-green-500/20 border-green-500/50">
                      Ready
                    </Badge>
                  </div>
                </div>
              </div>
              
              {/* Data Flow Description */}
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
                <div className="text-xs text-slate-400">
                  <span className="text-purple-400 font-medium">ML Filter</span> filters signals using Lawrence Classifier
                  <span className="text-slate-500 mx-1">→</span>
                  <span className="text-blue-400 font-medium">LOGOS</span> aggregates with ML-weighted scoring
                  <span className="text-slate-500 mx-1">→</span>
                  <span className="text-green-400 font-medium">Backtesting</span> validates on historical data
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Bot Integrations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* DCA Bot Integration */}
            <Card className="bg-slate-900/80 border-slate-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-orange-400" />
                    DCA Bot
                  </CardTitle>
                  <Badge className="bg-green-600">Integrated</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-400 mb-2">
                  ML фильтрация для определения оптимального момента первого входа и выхода
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-500">Entry Timing</div>
                    <div className="text-green-400 font-medium">Optimal/Good/Suboptimal</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-500">Exit Analysis</div>
                    <div className="text-blue-400 font-medium">Reversal Detection</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* BB Bot Integration */}
            <Card className="bg-slate-900/80 border-slate-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-400" />
                    BB Bot
                  </CardTitle>
                  <Badge className="bg-green-600">Integrated</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-400 mb-2">
                  Классификация пробоев: Genuine, False, Squeeze
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-500">Breakout Type</div>
                    <div className="text-purple-400 font-medium">ML Classification</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-500">Confirmation</div>
                    <div className="text-yellow-400 font-medium">Stoch + Volume</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* ORION Bot Integration */}
            <Card className="bg-slate-900/80 border-slate-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    ORION Bot
                  </CardTitle>
                  <Badge className="bg-green-600">Integrated</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-400 mb-2">
                  Подтверждение тренда и определение качества тренда
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-500">Trend Quality</div>
                    <div className="text-cyan-400 font-medium">Strong/Moderate/Weak</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-500">EMA Alignment</div>
                    <div className="text-green-400 font-medium">Confirmation</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Zenbot Integration */}
            <Card className="bg-slate-900/80 border-slate-700">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Zenbot Engine
                  </CardTitle>
                  <Badge className="bg-green-600">Integrated</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-400 mb-2">
                  Фильтрация сигналов стратегии и корректировка уверенности
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-500">Signal Quality</div>
                    <div className="text-yellow-400 font-medium">High/Medium/Low</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <div className="text-slate-500">Strategy Confirm</div>
                    <div className="text-green-400 font-medium">ML Alignment</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Not Integrated */}
          <Card className="bg-slate-900/80 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Без ML Интеграции</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="flex items-center gap-2 p-2 rounded bg-slate-800/50">
                  <Badge variant="secondary" className="bg-slate-700">GRID</Badge>
                  <span className="text-slate-400">Direction-agnostic</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-slate-800/50">
                  <Badge variant="secondary" className="bg-slate-700">HFT</Badge>
                  <span className="text-slate-400">Latency critical</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-slate-800/50">
                  <Badge variant="secondary" className="bg-slate-700">REED</Badge>
                  <span className="text-slate-400">Stat methods</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default MLFilteringPanel
