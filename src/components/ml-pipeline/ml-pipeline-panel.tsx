'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Brain, 
  Database,
  Cpu,
  BarChart3,
  Play,
  Pause,
  RefreshCw
} from 'lucide-react'

interface MLPipelineStatus {
  dataCollector: { cacheSize: number }
  featureEngineer: { enabledFeatures: string[] }
  autoML: { trialsCount: number; bestModel: string | null }
  modelRegistry: {
    totalModels: number
    totalVersions: number
    activeABTests: number
  }
}

const initialStatus: MLPipelineStatus = {
  dataCollector: { cacheSize: 150 },
  featureEngineer: { enabledFeatures: ['rsi_14', 'macd', 'atr_14', 'bb_width', 'adx_14'] },
  autoML: { trialsCount: 25, bestModel: 'forest_50_7' },
  modelRegistry: {
    totalModels: 3,
    totalVersions: 12,
    activeABTests: 1
  }
}

export function MLPipelinePanel() {
  const [status] = useState<MLPipelineStatus>(initialStatus)
  const [isTraining, setIsTraining] = useState(false)
  const [trainingProgress, setTrainingProgress] = useState(0)

  const startTraining = () => {
    setIsTraining(true)
    setTrainingProgress(0)
    
    // Simulate training progress
    let progress = 0
    const interval = setInterval(() => {
      progress += 10
      setTrainingProgress(progress)
      
      if (progress >= 100) {
        clearInterval(interval)
        setIsTraining(false)
      }
    }, 500)
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">ML Pipeline</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button 
              size="sm" 
              onClick={startTraining}
              disabled={isTraining}
            >
              {isTraining ? (
                <>
                  <Pause className="h-4 w-4 mr-1" />
                  Training...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Train
                </>
              )}
            </Button>
          </div>
        </div>
        <CardDescription>
          AutoML infrastructure for trading models
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="status" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="space-y-4 mt-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Data Collector</span>
              </div>
              <Badge variant="outline">
                {status.dataCollector.cacheSize} cached
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">AutoML Engine</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {status.autoML.trialsCount} trials
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">Model Registry</span>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">
                  {status.modelRegistry.totalModels} models
                </Badge>
              </div>
            </div>

            {isTraining && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Training Progress</span>
                  <span>{trainingProgress}%</span>
                </div>
                <Progress value={trainingProgress} className="h-2" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="features" className="mt-4">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {status.featureEngineer.enabledFeatures.map((feature) => (
                <div 
                  key={feature} 
                  className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                >
                  <span className="font-mono">{feature}</span>
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="models" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Best Model</span>
                <Badge variant="default">
                  {status.autoML.bestModel || 'None'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Versions</span>
                <span className="text-sm font-medium">{status.modelRegistry.totalVersions}</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
