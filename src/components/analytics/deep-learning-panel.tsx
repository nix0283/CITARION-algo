"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  Play,
  Pause,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  BarChart3,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ==================== TYPES ====================

interface Prediction {
  symbol: string;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  confidence: number;
  predictedChange: number;
  currentPrice: number;
  predictedPrice: number;
  timestamp: Date;
}

interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalPredictions: number;
  accuratePredictions: number;
  lastRetrain: Date;
}

interface TrainingProgress {
  epoch: number;
  totalEpochs: number;
  loss: number;
  accuracy: number;
  isTraining: boolean;
}

// ==================== DEEP LEARNING PANEL ====================

export function DeepLearningPanel() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [metrics] = useState<ModelMetrics>({
    accuracy: 0.67,
    precision: 0.65,
    recall: 0.69,
    f1Score: 0.67,
    totalPredictions: 234,
    accuratePredictions: 157,
    lastRetrain: new Date(Date.now() - 86400000),
  });
  const [training, setTraining] = useState<TrainingProgress | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');

  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

  const startTraining = async (symbol: string) => {
    setIsTraining(true);
    setTraining({ epoch: 0, totalEpochs: 50, loss: 1, accuracy: 0, isTraining: true });

    // Simulate training progress
    for (let epoch = 1; epoch <= 50; epoch++) {
      await new Promise(r => setTimeout(r, 100));
      setTraining({
        epoch,
        totalEpochs: 50,
        loss: 0.5 * Math.exp(-epoch * 0.05) + 0.1 + Math.random() * 0.05,
        accuracy: 0.5 + epoch * 0.01 + Math.random() * 0.02,
        isTraining: true,
      });
    }

    setIsTraining(false);
    setTraining(null);
    toast.success(`Model trained for ${symbol}`);
  };

  const runPrediction = async (symbol: string) => {
    // Simulate prediction
    const prediction: Prediction = {
      symbol,
      direction: Math.random() > 0.5 ? 'UP' : 'DOWN',
      confidence: 0.5 + Math.random() * 0.4,
      predictedChange: (Math.random() - 0.5) * 10,
      currentPrice: symbol === 'BTCUSDT' ? 67000 + Math.random() * 1000 :
                   symbol === 'ETHUSDT' ? 3500 + Math.random() * 100 :
                   100 + Math.random() * 50,
      predictedPrice: 0,
      timestamp: new Date(),
    };
    prediction.predictedPrice = prediction.currentPrice * (1 + prediction.predictedChange / 100);

    setPredictions(prev => [prediction, ...prev.slice(0, 9)]);
    toast.info(`${symbol}: ${prediction.direction} (${(prediction.confidence * 100).toFixed(0)}%)`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Deep Learning Engine
          </h2>
          <p className="text-muted-foreground mt-1">
            LSTM neural network for price direction prediction
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => startTraining(selectedSymbol)}
            disabled={isTraining}
          >
            {isTraining ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Training...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Train Model
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Training Progress */}
      {training && (
        <Card className="border-primary/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Training Progress</span>
              <span className="text-sm text-muted-foreground">
                Epoch {training.epoch}/{training.totalEpochs}
              </span>
            </div>
            <Progress value={(training.epoch / training.totalEpochs) * 100} className="h-2 mb-3" />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Loss:</span>
                <span className="ml-2 font-mono">{training.loss.toFixed(4)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Accuracy:</span>
                <span className="ml-2 font-mono">{(training.accuracy * 100).toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">
                  {metrics ? (metrics.accuracy * 100).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Accuracy</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">
                  {metrics ? (metrics.precision * 100).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Precision</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">
                  {metrics ? (metrics.f1Score * 100).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">F1 Score</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <div>
                <div className="text-2xl font-bold">{metrics?.totalPredictions || 0}</div>
                <div className="text-xs text-muted-foreground">Predictions</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">
                  {metrics ? (metrics.recall * 100).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Recall</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Symbol Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run Prediction</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {symbols.map(symbol => (
              <Button
                key={symbol}
                variant={selectedSymbol === symbol ? "default" : "outline"}
                onClick={() => setSelectedSymbol(symbol)}
                className="flex-1 min-w-[100px]"
              >
                {symbol}
              </Button>
            ))}
            <Button
              onClick={() => runPrediction(selectedSymbol)}
              className="min-w-[120px]"
            >
              <Play className="h-4 w-4 mr-2" />
              Predict
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Predictions History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Predictions</CardTitle>
        </CardHeader>
        <CardContent>
          {predictions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No predictions yet</p>
              <p className="text-sm">Select a symbol and click Predict</p>
            </div>
          ) : (
            <div className="space-y-3">
              {predictions.map((pred, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      pred.direction === 'UP' ? "bg-green-500/10" : "bg-red-500/10"
                    )}>
                      {pred.direction === 'UP' ? (
                        <TrendingUp className="h-5 w-5 text-green-500" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{pred.symbol}</div>
                      <div className="text-xs text-muted-foreground">
                        {pred.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "font-bold",
                      pred.direction === 'UP' ? "text-green-500" : "text-red-500"
                    )}>
                      {pred.direction === 'UP' ? '+' : ''}{pred.predictedChange.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(pred.confidence * 100).toFixed(0)}% confidence
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default { DeepLearningPanel };
