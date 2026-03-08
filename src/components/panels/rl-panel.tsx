'use client';

/**
 * RL Service Panel
 * 
 * UI for interacting with the RL Python service.
 * Features:
 * - Training control (start/stop)
 * - Agent selection (PPO, SAC, DQN)
 * - Training progress and metrics
 * - Action predictions
 */

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Play,
  Square,
  Pause,
  RefreshCw,
  Bot,
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  Clock,
  BarChart3,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

// Types
interface TrainingStatus {
  status: 'idle' | 'training' | 'stopped';
  agent: string | null;
  episode: number;
  total_episodes: number;
  metrics: Record<string, number>;
}

interface AgentInfo {
  name: string;
  is_trained: boolean;
  metrics: {
    algorithm: string;
    learning_rate: number;
    is_trained: boolean;
  };
}

interface ActionPrediction {
  action: number;
  state: number[] | null;
}

export function RLPanel() {
  const [selectedAgent, setSelectedAgent] = useState('ppo');
  const [totalTimesteps, setTotalTimesteps] = useState(10000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus>({
    status: 'idle',
    agent: null,
    episode: 0,
    total_episodes: 0,
    metrics: {},
  });
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [actionPrediction, setActionPrediction] = useState<ActionPrediction | null>(null);

  // Fetch training status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/rl/train/status?XTransformPort=3007');
      if (response.ok) {
        const data = await response.json();
        setTrainingStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    try {
      const response = await fetch('/api/rl/agents?XTransformPort=3007');
      if (response.ok) {
        const data = await response.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, []);

  // Poll status when training
  useEffect(() => {
    // Use RAF to batch initial fetch with other updates
    const rafId = requestAnimationFrame(() => {
      fetchAgents();
    });
    const interval = setInterval(() => {
      if (trainingStatus.status === 'training') {
        fetchStatus();
      }
    }, 2000);
    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(interval);
    };
  }, [trainingStatus.status, fetchStatus, fetchAgents]);

  // Start training
  const startTraining = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rl/train/start?XTransformPort=3007', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: selectedAgent,
          total_timesteps: totalTimesteps,
        }),
      });
      
      if (response.ok) {
        setTrainingStatus(prev => ({ ...prev, status: 'training', agent: selectedAgent }));
      } else {
        setError('Failed to start training');
      }
    } catch (err) {
      setError('RL service unavailable');
    }
    setLoading(false);
  };

  // Stop training
  const stopTraining = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/rl/train/stop?XTransformPort=3007', {
        method: 'POST',
      });
      
      if (response.ok) {
        setTrainingStatus(prev => ({ ...prev, status: 'stopped' }));
      }
    } catch (err) {
      setError('Failed to stop training');
    }
    setLoading(false);
  };

  // Get action prediction
  const getPrediction = async () => {
    setLoading(true);
    setError(null);
    try {
      // Generate sample observation
      const observation = [[/* sample observation data */]];
      const response = await fetch('/api/rl/predict?XTransformPort=3007', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: selectedAgent,
          observation,
          deterministic: true,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setActionPrediction(data);
      } else {
        setError('Failed to get prediction');
      }
    } catch (err) {
      setError('RL service unavailable');
    }
    setLoading(false);
  };

  // Get action label
  const getActionLabel = (action: number) => {
    const actions = ['HOLD', 'BUY', 'SELL', 'CLOSE'];
    return actions[action] || 'UNKNOWN';
  };

  // Get action color
  const getActionColor = (action: number) => {
    switch (action) {
      case 1: return 'text-green-500';
      case 2: return 'text-red-500';
      case 3: return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  // Calculate progress
  const progress = trainingStatus.total_episodes > 0
    ? (trainingStatus.episode / trainingStatus.total_episodes) * 100
    : 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>RL Service</CardTitle>
          </div>
          <Badge variant={
            trainingStatus.status === 'training' ? 'default' :
            trainingStatus.status === 'stopped' ? 'destructive' : 'secondary'
          }>
            {trainingStatus.status === 'training' ? (
              <Activity className="h-3 w-3 mr-1" />
            ) : trainingStatus.status === 'stopped' ? (
              <Square className="h-3 w-3 mr-1" />
            ) : (
              <Pause className="h-3 w-3 mr-1" />
            )}
            {trainingStatus.status.toUpperCase()}
          </Badge>
        </div>
        <CardDescription>
          Reinforcement Learning training and predictions
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Agent Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Agent</label>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ppo">PPO (Proximal Policy Optimization)</SelectItem>
              <SelectItem value="sac">SAC (Soft Actor-Critic)</SelectItem>
              <SelectItem value="dqn">DQN (Deep Q-Network)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Training Progress */}
        {trainingStatus.status === 'training' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Training Progress</span>
              <span>{trainingStatus.episode} / {trainingStatus.total_episodes}</span>
            </div>
            <Progress value={progress} />
            
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="p-2 rounded bg-muted text-center">
                <div className="text-xs text-muted-foreground">Episode</div>
                <div className="font-bold">{trainingStatus.episode}</div>
              </div>
              <div className="p-2 rounded bg-muted text-center">
                <div className="text-xs text-muted-foreground">Reward</div>
                <div className="font-bold">
                  {trainingStatus.metrics.avg_reward?.toFixed(2) || 'N/A'}
                </div>
              </div>
              <div className="p-2 rounded bg-muted text-center">
                <div className="text-xs text-muted-foreground">Win Rate</div>
                <div className="font-bold">
                  {trainingStatus.metrics.win_rate 
                    ? `${(trainingStatus.metrics.win_rate * 100).toFixed(1)}%` 
                    : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Control Buttons */}
        <div className="flex gap-2">
          {trainingStatus.status !== 'training' ? (
            <Button onClick={startTraining} disabled={loading} className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              Start Training
            </Button>
          ) : (
            <Button onClick={stopTraining} disabled={loading} variant="destructive" className="flex-1">
              <Square className="h-4 w-4 mr-2" />
              Stop Training
            </Button>
          )}
          
          <Button onClick={getPrediction} disabled={loading || !agents.find(a => a.name === selectedAgent)?.is_trained}>
            <Target className="h-4 w-4 mr-2" />
            Predict
          </Button>
        </div>
        
        {/* Action Prediction */}
        {actionPrediction && (
          <div className="p-4 rounded-lg bg-muted">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Predicted Action</div>
              <div className={`text-2xl font-bold ${getActionColor(actionPrediction.action)}`}>
                {getActionLabel(actionPrediction.action)}
              </div>
            </div>
          </div>
        )}
        
        {/* Error Display */}
        {error && (
          <div className="p-3 rounded bg-destructive/10 text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        
        {/* Agents Status */}
        <div className="pt-4 border-t">
          <div className="text-sm font-medium mb-2">Trained Agents</div>
          <div className="grid grid-cols-3 gap-2">
            {agents.map((agent) => (
              <div 
                key={agent.name} 
                className={`p-2 rounded border text-center ${
                  agent.is_trained ? 'border-green-500/50 bg-green-500/10' : 'border-muted'
                }`}
              >
                <div className="text-xs font-medium uppercase">{agent.name}</div>
                <div className="text-xs text-muted-foreground">
                  {agent.is_trained ? (
                    <span className="text-green-500">Trained</span>
                  ) : (
                    <span>Not trained</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default RLPanel;
