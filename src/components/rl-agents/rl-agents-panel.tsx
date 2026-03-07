'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Bot, 
  Play, 
  Square, 
  Activity,
  Target,
  Trophy,
  TrendingUp,
  TrendingDown,
  Zap,
  Settings
} from 'lucide-react'

interface RLAgent {
  id: string
  name: string
  type: 'DQN' | 'PPO' | 'SAC'
  status: 'idle' | 'training' | 'trading' | 'paused'
  metrics: {
    totalReward: number
    winRate: number
    sharpeRatio: number
    trades: number
    pnl: number
  }
  training: {
    episode: number
    totalEpisodes: number
    epsilon: number
  }
}

export function RLAgentsPanel() {
  const [agents, setAgents] = useState<RLAgent[]>([
    {
      id: '1',
      name: 'DQN-BTC-1',
      type: 'DQN',
      status: 'idle',
      metrics: { totalReward: 125.5, winRate: 0.58, sharpeRatio: 1.45, trades: 156, pnl: 2450 },
      training: { episode: 0, totalEpisodes: 100, epsilon: 0.1 }
    },
    {
      id: '2',
      name: 'PPO-ETH-1',
      type: 'PPO',
      status: 'training',
      metrics: { totalReward: 89.3, winRate: 0.52, sharpeRatio: 1.12, trades: 89, pnl: 1200 },
      training: { episode: 45, totalEpisodes: 100, epsilon: 0 }
    },
    {
      id: '3',
      name: 'SAC-Multi-1',
      type: 'SAC',
      status: 'trading',
      metrics: { totalReward: 210.8, winRate: 0.62, sharpeRatio: 1.85, trades: 234, pnl: 4200 },
      training: { episode: 100, totalEpisodes: 100, epsilon: 0 }
    }
  ])

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const toggleAgent = (id: string) => {
    setAgents((prev) => 
      prev.map((agent) => 
        agent.id === id 
          ? { 
              ...agent, 
              status: agent.status === 'trading' ? 'paused' : 
                     agent.status === 'paused' ? 'trading' : 
                     agent.status === 'idle' ? 'training' : 'idle'
            }
          : agent
      )
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'trading': return 'bg-green-500'
      case 'training': return 'bg-blue-500'
      case 'paused': return 'bg-yellow-500'
      default: return 'bg-gray-400'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'DQN': return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
      case 'PPO': return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
      case 'SAC': return 'bg-green-500/10 text-green-500 border-green-500/20'
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">RL Agents</CardTitle>
          </div>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Reinforcement Learning Trading Agents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="agents" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="space-y-3 mt-4">
            {agents.map((agent) => (
              <div 
                key={agent.id}
                className="p-3 bg-muted rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(agent.status)}`} />
                    <span className="font-medium text-sm">{agent.name}</span>
                    <Badge variant="outline" className={getTypeColor(agent.type)}>
                      {agent.type}
                    </Badge>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => toggleAgent(agent.id)}
                  >
                    {agent.status === 'trading' ? (
                      <Square className="h-4 w-4 text-red-500" />
                    ) : (
                      <Play className="h-4 w-4 text-green-500" />
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Win Rate</span>
                    <span className="font-medium">{(agent.metrics.winRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Sharpe</span>
                    <span className="font-medium">{agent.metrics.sharpeRatio.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">PnL</span>
                    <span className={`font-medium ${agent.metrics.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${agent.metrics.pnl.toFixed(0)}
                    </span>
                  </div>
                </div>

                {agent.status === 'training' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Episode {agent.training.episode}/{agent.training.totalEpisodes}</span>
                      <span>{((agent.training.episode / agent.training.totalEpisodes) * 100).toFixed(0)}%</span>
                    </div>
                    <Progress 
                      value={(agent.training.episode / agent.training.totalEpisodes) * 100} 
                      className="h-1.5" 
                    />
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="performance" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Trophy className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">Best Agent</span>
                </div>
                <span className="text-lg font-bold">SAC-Multi-1</span>
                <p className="text-xs text-muted-foreground">Sharpe: 1.85</p>
              </div>

              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Total Trades</span>
                </div>
                <span className="text-lg font-bold">479</span>
                <p className="text-xs text-muted-foreground">All agents</p>
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Combined PnL</span>
                <Badge className="bg-green-500/10 text-green-500">
                  +$7,850
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500">+15.7%</span>
                <span className="text-xs text-muted-foreground">this month</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
