'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Gauge,
  BarChart3,
  Target,
  AlertTriangle,
  Minus
} from 'lucide-react'

interface PricePrediction {
  horizon: string
  price: number
  direction: 'up' | 'down' | 'neutral'
  confidence: number
}

interface VolatilityForecast {
  current: number
  regime: 'low' | 'normal' | 'high' | 'extreme'
  forecast: number
}

interface MarketRegime {
  regime: string
  probability: number
  duration: number
}

export function PredictionPanel() {
  const [predictions, setPredictions] = useState<PricePrediction[]>([
    { horizon: '1h', price: 43500, direction: 'up', confidence: 0.72 },
    { horizon: '4h', price: 43800, direction: 'up', confidence: 0.65 },
    { horizon: '24h', price: 44200, direction: 'up', confidence: 0.58 },
    { horizon: '7d', price: 45500, direction: 'up', confidence: 0.45 }
  ])

  const [volatility, setVolatility] = useState<VolatilityForecast>({
    current: 0.024,
    regime: 'normal',
    forecast: 0.028
  })

  const [regime, setRegime] = useState<MarketRegime>({
    regime: 'trending_up',
    probability: 0.68,
    duration: 12
  })

  const currentPrice = 43250

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'down': return <TrendingDown className="h-4 w-4 text-red-500" />
      default: return <Minus className="h-4 w-4 text-gray-500" />
    }
  }

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'trending_up': return 'text-green-500'
      case 'trending_down': return 'text-red-500'
      case 'ranging': return 'text-yellow-500'
      case 'volatile': return 'text-orange-500'
      default: return 'text-gray-500'
    }
  }

  const getVolatilityColor = (regime: string) => {
    switch (regime) {
      case 'low': return 'bg-green-500'
      case 'normal': return 'bg-blue-500'
      case 'high': return 'bg-orange-500'
      case 'extreme': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Market Prediction</CardTitle>
        </div>
        <CardDescription>
          Multi-horizon price & volatility forecasts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="price" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="price">Price</TabsTrigger>
            <TabsTrigger value="volatility">Volatility</TabsTrigger>
            <TabsTrigger value="regime">Regime</TabsTrigger>
          </TabsList>

          <TabsContent value="price" className="space-y-3 mt-4">
            <div className="text-center pb-2 border-b">
              <span className="text-xs text-muted-foreground">Current Price</span>
              <div className="text-2xl font-bold">${currentPrice.toLocaleString()}</div>
            </div>

            {predictions.map((pred) => (
              <div 
                key={pred.horizon}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div className="flex items-center gap-2">
                  {getDirectionIcon(pred.direction)}
                  <div>
                    <span className="font-medium">{pred.horizon}</span>
                    <div className="text-xs text-muted-foreground">
                      {pred.confidence > 0.7 ? 'High' : pred.confidence > 0.5 ? 'Medium' : 'Low'} confidence
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-medium ${pred.price > currentPrice ? 'text-green-500' : 'text-red-500'}`}>
                    ${pred.price.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {((pred.price - currentPrice) / currentPrice * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}

            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Consensus</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500/10 text-green-500">Bullish</Badge>
                <span className="text-sm text-muted-foreground">68% confidence</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="volatility" className="mt-4 space-y-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Gauge className="h-5 w-5 text-blue-500" />
                <span className="text-sm font-medium">Current Volatility</span>
              </div>
              <div className="text-3xl font-bold">{(volatility.current * 100).toFixed(2)}%</div>
              <Badge className={`mt-2 ${getVolatilityColor(volatility.regime)}`}>
                {volatility.regime.toUpperCase()}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Forecast (24h)</span>
                <span className="font-medium">{(volatility.forecast * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Annualized</span>
                <span className="font-medium">{(volatility.current * Math.sqrt(365) * 100).toFixed(1)}%</span>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">Volatility Percentile</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: '65%' }}
                  />
                </div>
                <span className="text-sm font-medium">65th</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="regime" className="mt-4 space-y-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Current Regime</div>
              <div className={`text-xl font-bold capitalize ${getRegimeColor(regime.regime)}`}>
                {regime.regime.replace('_', ' ')}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {(regime.probability * 100).toFixed(0)}% probability
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['trending_up', 'trending_down', 'ranging', 'volatile'].map((r) => (
                <div 
                  key={r}
                  className={`p-2 rounded text-center text-sm ${
                    r === regime.regime ? 'bg-primary/10 border border-primary/20' : 'bg-muted'
                  }`}
                >
                  <div className={getRegimeColor(r)}>
                    {r.replace('_', ' ')}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between text-sm p-3 bg-muted rounded-lg">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">{regime.duration} candles</span>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
