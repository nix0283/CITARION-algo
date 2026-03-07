'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Shield, 
  AlertTriangle,
  AlertCircle,
  Gauge,
  BarChart3,
  TrendingDown,
  Activity,
  CheckCircle,
  XCircle,
  AlertOctagon
} from 'lucide-react'

interface RiskMetrics {
  overall: number
  components: {
    market: number
    liquidity: number
    volatility: number
    correlation: number
    tail: number
  }
  recommendation: 'reduce' | 'maintain' | 'increase'
}

interface Anomaly {
  type: string
  severity: string
  score: number
  description: string
}

interface PositionSizing {
  recommended: number
  maxAllowed: number
  current: number
}

export function AIRiskPanel() {
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>({
    overall: 45,
    components: {
      market: 42,
      liquidity: 28,
      volatility: 55,
      correlation: 38,
      tail: 52
    },
    recommendation: 'maintain'
  })

  const [anomalies, setAnomalies] = useState<Anomaly[]>([
    { type: 'volume', severity: 'medium', score: 0.65, description: 'Unusual volume spike detected' },
    { type: 'volatility', severity: 'low', score: 0.35, description: 'Elevated volatility regime' }
  ])

  const [positionSizing, setPositionSizing] = useState<PositionSizing>({
    recommended: 8,
    maxAllowed: 15,
    current: 6
  })

  const [hedging, setHedging] = useState({
    ratio: 0.45,
    recommendations: ['Consider adding BTC hedge'],
    cost: 0.12
  })

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'text-red-500'
    if (score >= 50) return 'text-orange-500'
    if (score >= 30) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getRiskBgColor = (score: number) => {
    if (score >= 70) return 'bg-red-500/10 border-red-500/20'
    if (score >= 50) return 'bg-orange-500/10 border-orange-500/20'
    if (score >= 30) return 'bg-yellow-500/10 border-yellow-500/20'
    return 'bg-green-500/10 border-green-500/20'
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertOctagon className="h-4 w-4 text-red-500" />
      case 'high': return <AlertCircle className="h-4 w-4 text-orange-500" />
      case 'medium': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      default: return <AlertCircle className="h-4 w-4 text-blue-500" />
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Risk Manager</CardTitle>
          </div>
          <Badge 
            variant="outline"
            className={`${getRiskBgColor(riskMetrics.overall)}`}
          >
            Risk: {riskMetrics.overall}%
          </Badge>
        </div>
        <CardDescription>
          Real-time risk monitoring & management
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
            <TabsTrigger value="sizing">Sizing</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Risk Score */}
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Overall Risk Score</div>
              <div className={`text-4xl font-bold ${getRiskColor(riskMetrics.overall)}`}>
                {riskMetrics.overall}
              </div>
              <Progress 
                value={riskMetrics.overall} 
                className="h-2 mt-2"
              />
              <Badge 
                className={`mt-2 ${
                  riskMetrics.recommendation === 'reduce' ? 'bg-red-500' :
                  riskMetrics.recommendation === 'increase' ? 'bg-green-500' : 'bg-blue-500'
                }`}
              >
                {riskMetrics.recommendation === 'reduce' ? '⚠️ Reduce Positions' :
                 riskMetrics.recommendation === 'increase' ? '✓ Can Increase' : '→ Maintain'}
              </Badge>
            </div>

            {/* Risk Components */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Risk Components</span>
              {Object.entries(riskMetrics.components).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-sm capitalize text-muted-foreground w-24">{key}</span>
                  <Progress value={value} className="h-2 flex-1" />
                  <span className={`text-sm font-medium w-10 text-right ${getRiskColor(value)}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="anomalies" className="mt-4">
            {anomalies.length > 0 ? (
              <div className="space-y-2">
                {anomalies.map((anomaly, i) => (
                  <div 
                    key={i}
                    className="flex items-start gap-2 p-3 bg-muted rounded-lg"
                  >
                    {getSeverityIcon(anomaly.severity)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">{anomaly.type}</span>
                        <Badge variant="outline" className="text-xs">
                          {(anomaly.score * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {anomaly.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <span className="text-sm text-muted-foreground">No anomalies detected</span>
              </div>
            )}

            {/* Anomaly Score Summary */}
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Anomaly Score</span>
                <div className="flex items-center gap-2">
                  <Progress value={25} className="h-2 w-20" />
                  <span className="text-sm text-green-500">Low</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sizing" className="mt-4 space-y-4">
            {/* Position Sizing */}
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Position Sizing</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Recommended</span>
                  <span className="font-medium">{positionSizing.recommended}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current</span>
                  <span className="font-medium">{positionSizing.current}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Maximum Allowed</span>
                  <span className="font-medium">{positionSizing.maxAllowed}%</span>
                </div>
              </div>
            </div>

            {/* Hedging Status */}
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">Hedging Status</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Hedge Ratio</span>
                  <span className="font-medium">{(hedging.ratio * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Hedge Cost</span>
                  <span className="font-medium">{hedging.cost.toFixed(2)}%</span>
                </div>
              </div>
              {hedging.recommendations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground">Recommendations:</span>
                  <ul className="text-xs mt-1 space-y-1">
                    {hedging.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3 text-blue-500" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Kelly Criterion */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Kelly Criterion</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Optimal position size based on win rate & risk/reward
              </div>
              <div className="text-lg font-bold mt-1">8.5%</div>
              <Badge variant="outline" className="mt-1">Half-Kelly Applied</Badge>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
