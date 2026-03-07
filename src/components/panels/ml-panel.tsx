'use client';

/**
 * ML Service Panel
 * 
 * UI for interacting with the ML Python service.
 * Features:
 * - Price prediction with confidence intervals
 * - Signal classification (BUY/SELL/HOLD)
 * - Market regime detection (Bull/Bear/Sideways)
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Brain,
  Target,
  BarChart3,
  LineChart,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react';

// Types
interface PricePrediction {
  predictions: number[][];
  confidence_intervals?: {
    std: number[][];
    lower: number[][];
    upper: number[][];
  };
}

interface SignalPrediction {
  signals: Array<{
    signal: string;
    confidence: number;
    probabilities: {
      HOLD: number;
      BUY: number;
      SELL: number;
    };
  }>;
}

interface RegimePrediction {
  regime: string;
  regime_id: number;
  confidence: number;
  probabilities: {
    BEAR: number;
    SIDEWAYS: number;
    BULL: number;
  };
  transition_matrix?: number[][];
}

interface MLModelStatus {
  name: string;
  is_trained: boolean;
  metrics: Record<string, any>;
}

export function MLPanel() {
  const [activeTab, setActiveTab] = useState('prediction');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Prediction states
  const [pricePrediction, setPricePrediction] = useState<PricePrediction | null>(null);
  const [signalPrediction, setSignalPrediction] = useState<SignalPrediction | null>(null);
  const [regimePrediction, setRegimePrediction] = useState<RegimePrediction | null>(null);
  const [models, setModels] = useState<MLModelStatus[]>([]);

  // Fetch model status
  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch('/api/ml/models?XTransformPort=3006');
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  }, []);

  // Price prediction
  const predictPrice = async () => {
    setLoading(true);
    setError(null);
    try {
      // Generate sample features (in production, use real data)
      const features = [[[/* sample OHLCV features */]]];
      const response = await fetch('/api/ml/predict/price?XTransformPort=3006', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features, return_confidence: true }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setPricePrediction(data);
      } else {
        setError('Failed to get price prediction');
      }
    } catch (err) {
      setError('ML service unavailable');
    }
    setLoading(false);
  };

  // Signal classification
  const predictSignal = async () => {
    setLoading(true);
    setError(null);
    try {
      const features = [[/* sample features */]];
      const response = await fetch('/api/ml/predict/signal?XTransformPort=3006', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setSignalPrediction(data);
      } else {
        setError('Failed to classify signal');
      }
    } catch (err) {
      setError('ML service unavailable');
    }
    setLoading(false);
  };

  // Regime detection
  const detectRegime = async () => {
    setLoading(true);
    setError(null);
    try {
      const observations = [[/* sample observations */]];
      const response = await fetch('/api/ml/predict/regime?XTransformPort=3006', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observations }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setRegimePrediction(data);
      } else {
        setError('Failed to detect regime');
      }
    } catch (err) {
      setError('ML service unavailable');
    }
    setLoading(false);
  };

  // Get signal color
  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY': return 'text-green-500';
      case 'SELL': return 'text-red-500';
      default: return 'text-yellow-500';
    }
  };

  // Get regime color
  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'BULL': return 'text-green-500';
      case 'BEAR': return 'text-red-500';
      default: return 'text-yellow-500';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            <CardTitle>ML Service</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={fetchModels}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
        <CardDescription>
          Machine Learning predictions and analysis
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="prediction">Price</TabsTrigger>
            <TabsTrigger value="signal">Signal</TabsTrigger>
            <TabsTrigger value="regime">Regime</TabsTrigger>
          </TabsList>
          
          {/* Price Prediction Tab */}
          <TabsContent value="prediction" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LineChart className="h-4 w-4" />
                <span className="font-medium">Price Prediction</span>
              </div>
              <Button onClick={predictPrice} disabled={loading}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Predict'}
              </Button>
            </div>
            
            {pricePrediction && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {['1m', '5m', '15m', '1h'].map((horizon, i) => (
                    <div key={horizon} className="p-3 rounded-lg bg-muted">
                      <div className="text-xs text-muted-foreground">{horizon}</div>
                      <div className="text-lg font-bold">
                        {pricePrediction.predictions[0]?.[i]?.toFixed(4) || 'N/A'}
                      </div>
                      {pricePrediction.confidence_intervals && (
                        <div className="text-xs text-muted-foreground">
                          ±{pricePrediction.confidence_intervals.std[0]?.[i]?.toFixed(4)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          
          {/* Signal Classification Tab */}
          <TabsContent value="signal" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                <span className="font-medium">Signal Classification</span>
              </div>
              <Button onClick={predictSignal} disabled={loading}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Classify'}
              </Button>
            </div>
            
            {signalPrediction && signalPrediction.signals[0] && (
              <div className="space-y-3">
                <div className="flex items-center justify-center p-4 rounded-lg bg-muted">
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${getSignalColor(signalPrediction.signals[0].signal)}`}>
                      {signalPrediction.signals[0].signal}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Confidence: {(signalPrediction.signals[0].confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(signalPrediction.signals[0].probabilities).map(([key, value]) => (
                    <div key={key} className="p-2 rounded bg-muted text-center">
                      <div className="text-xs text-muted-foreground">{key}</div>
                      <div className="font-medium">{(value * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
          
          {/* Regime Detection Tab */}
          <TabsContent value="regime" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="font-medium">Market Regime</span>
              </div>
              <Button onClick={detectRegime} disabled={loading}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Detect'}
              </Button>
            </div>
            
            {regimePrediction && (
              <div className="space-y-3">
                <div className="flex items-center justify-center p-4 rounded-lg bg-muted">
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${getRegimeColor(regimePrediction.regime)}`}>
                      {regimePrediction.regime}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Confidence: {(regimePrediction.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(regimePrediction.probabilities).map(([key, value]) => (
                    <div key={key} className="p-2 rounded bg-muted text-center">
                      <div className="text-xs text-muted-foreground">{key}</div>
                      <div className="font-medium">{(value * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 rounded bg-destructive/10 text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        
        {/* Models Status */}
        <div className="mt-4 pt-4 border-t">
          <div className="text-sm font-medium mb-2">Models Status</div>
          <div className="flex gap-2">
            {models.map((model) => (
              <Badge key={model.name} variant={model.is_trained ? 'default' : 'secondary'}>
                {model.is_trained ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                {model.name}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default MLPanel;
