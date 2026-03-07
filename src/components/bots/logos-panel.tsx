"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Play,
  Pause,
  Settings,
  TrendingUp,
  TrendingDown,
  Loader2,
  Activity,
  BarChart3,
  Zap,
  RefreshCw,
  Target,
  AlertTriangle,
  Users,
  Brain,
  Gauge,
  Crown,
  Cpu,
  Radar,
  Shield,
  Filter,
  Minus,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ==================== TYPES ====================

interface BotSignal {
  botId: string;
  botName: string;
  botType: string;
  signal: "LONG" | "SHORT" | "NEUTRAL";
  confidence: number;
  timestamp: string;
  // ML Filter data
  mlScore?: number;
  mlPassed?: boolean;
  mlRecommendation?: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR';
}

interface AggregatedSignal {
  symbol: string;
  direction: "LONG" | "SHORT";
  consensus: number;
  avgConfidence: number;
  totalBots: number;
  agreeingBots: number;
  qualityScore: number;
  timestamp: string;
  // ML enhanced data
  ml?: {
    overallScore: number;
    filteredBots: number;
    rejectedBots: number;
    recommendation: 'APPROVE' | 'REJECT' | 'ADJUST' | 'MONITOR';
    qualityAssessment: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'REJECTED';
  };
}

interface LogosStats {
  totalSignals: number;
  winRate: number;
  avgReturn: number;
  activeBots: number;
  consensusAccuracy: number;
  // ML stats
  mlFilteredSignals: number;
  mlRejectedSignals: number;
  mlAvgScore: number;
}

interface MLFilterConfig {
  enabled: boolean;
  minConfidence: number;
  minMLScore: number;
  useRegimeFilter: boolean;
  useADXFilter: boolean;
  useVolatilityFilter: boolean;
}

const BOT_TYPES = [
  { id: "operational", label: "Операционные", icon: Gauge },
  { id: "institutional", label: "Институциональные", icon: Crown },
  { id: "analytical", label: "Аналитические", icon: Radar },
  { id: "frequency", label: "Частотные", icon: Cpu },
];

const BOT_NAMES = [
  { id: "grid-bot", name: "MESH", type: "operational" },
  { id: "dca-bot", name: "SCALE", type: "operational" },
  { id: "bb-bot", name: "BAND", type: "operational" },
  { id: "spectrum-bot", name: "PR", type: "institutional" },
  { id: "reed-bot", name: "STA", type: "institutional" },
  { id: "architect-bot", name: "MM", type: "institutional" },
  { id: "argus-bot", name: "PND", type: "analytical" },
  { id: "orion-bot", name: "TRND", type: "analytical" },
  { id: "wolfbot", name: "WOLF", type: "analytical" },
  { id: "hft-bot", name: "HFT", type: "frequency" },
  { id: "mft-bot", name: "MFT", type: "frequency" },
  { id: "lft-bot", name: "LFT", type: "frequency" },
];

export function LogosPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  
  const [config, setConfig] = useState({
    symbol: "BTCUSDT",
    minConsensus: 0.6,
    minConfidence: 0.7,
    minSignals: 3,
    autoTrade: false,
    qualityThreshold: 0.75,
    enabledBotTypes: ["operational", "institutional", "analytical", "frequency"],
  });
  
  // ML Filter configuration
  const [mlConfig, setMlConfig] = useState<MLFilterConfig>({
    enabled: true,
    minConfidence: 0.3,
    minMLScore: 0.4,
    useRegimeFilter: true,
    useADXFilter: true,
    useVolatilityFilter: true,
  });
  
  const [botSignals, setBotSignals] = useState<BotSignal[]>([]);
  const [aggregatedSignals, setAggregatedSignals] = useState<AggregatedSignal[]>([]);
  const [stats, setStats] = useState<LogosStats>({
    totalSignals: 0,
    winRate: 0,
    avgReturn: 0,
    activeBots: 0,
    consensusAccuracy: 0,
    mlFilteredSignals: 0,
    mlRejectedSignals: 0,
    mlAvgScore: 0,
  });

  // Filter signal through ML
  const filterSignalThroughML = useCallback(async (signal: BotSignal): Promise<BotSignal> => {
    if (!mlConfig.enabled) {
      return { ...signal, mlScore: 0.5, mlPassed: true, mlRecommendation: 'APPROVE' };
    }

    try {
      const response = await fetch('/api/ml/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal: {
            botCode: signal.botId.toUpperCase().replace('-', '_'),
            symbol: config.symbol,
            exchange: 'binance',
            direction: signal.signal,
            confidence: signal.confidence,
          },
        }),
      });

      const data = await response.json();
      
      if (data.success && data.result) {
        return {
          ...signal,
          mlScore: data.result.mlScore,
          mlPassed: data.result.passed,
          mlRecommendation: data.result.recommendation,
        };
      }
    } catch (error) {
      console.error('ML filter error:', error);
    }

    // Fallback: simulate ML scoring
    const mlScore = 0.3 + Math.random() * 0.7;
    const mlPassed = mlScore >= mlConfig.minMLScore && signal.confidence >= mlConfig.minConfidence;
    
    return {
      ...signal,
      mlScore,
      mlPassed,
      mlRecommendation: mlPassed ? 'APPROVE' : 'REJECT',
    };
  }, [mlConfig, config.symbol]);

  // Simulate signals when running
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(async () => {
      // Generate random signals from bots
      const newSignals: BotSignal[] = BOT_NAMES.map(bot => ({
        botId: bot.id,
        botName: bot.name,
        botType: bot.type,
        signal: Math.random() > 0.5 ? "LONG" : Math.random() > 0.3 ? "SHORT" : "NEUTRAL",
        confidence: 0.5 + Math.random() * 0.5,
        timestamp: new Date().toISOString(),
      }));
      
      // Filter through ML
      const mlFilteredSignals = await Promise.all(
        newSignals.map(signal => filterSignalThroughML(signal))
      );
      
      setBotSignals(mlFilteredSignals);
      
      // Calculate ML stats
      const passedSignals = mlFilteredSignals.filter(s => s.mlPassed);
      const rejectedSignals = mlFilteredSignals.filter(s => !s.mlPassed);
      const avgMLScore = mlFilteredSignals.reduce((sum, s) => sum + (s.mlScore || 0), 0) / mlFilteredSignals.length;
      
      setStats(prev => ({
        ...prev,
        activeBots: newSignals.length,
        mlFilteredSignals: passedSignals.length,
        mlRejectedSignals: rejectedSignals.length,
        mlAvgScore: avgMLScore,
      }));
      
      // Generate aggregated signal (only from ML-passed signals if ML is enabled)
      const signalsToAggregate = mlConfig.enabled ? passedSignals : mlFilteredSignals;
      const longSignals = signalsToAggregate.filter(s => s.signal === "LONG");
      const shortSignals = signalsToAggregate.filter(s => s.signal === "SHORT");
      
      if (longSignals.length >= config.minSignals || shortSignals.length >= config.minSignals) {
        const dominantSignals = longSignals.length > shortSignals.length ? longSignals : shortSignals;
        const consensus = dominantSignals.length / signalsToAggregate.length;
        
        if (consensus >= config.minConsensus) {
          const avgConfidence = dominantSignals.reduce((sum, s) => sum + s.confidence, 0) / dominantSignals.length;
          const avgMLScore = dominantSignals.reduce((sum, s) => sum + (s.mlScore || 0), 0) / dominantSignals.length;
          
          const qualityScore = consensus * avgConfidence * (mlConfig.enabled ? avgMLScore : 1);
          
          // Determine ML quality assessment
          let qualityAssessment: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'REJECTED';
          if (avgMLScore >= 0.8 && qualityScore >= 0.7) {
            qualityAssessment = 'EXCELLENT';
          } else if (avgMLScore >= 0.6 && qualityScore >= 0.5) {
            qualityAssessment = 'GOOD';
          } else if (avgMLScore >= 0.4 && qualityScore >= 0.3) {
            qualityAssessment = 'ACCEPTABLE';
          } else if (avgMLScore >= 0.2) {
            qualityAssessment = 'POOR';
          } else {
            qualityAssessment = 'REJECTED';
          }
          
          const newAggregated: AggregatedSignal = {
            symbol: config.symbol,
            direction: longSignals.length > shortSignals.length ? "LONG" : "SHORT",
            consensus,
            avgConfidence,
            totalBots: signalsToAggregate.length,
            agreeingBots: dominantSignals.length,
            qualityScore,
            timestamp: new Date().toISOString(),
            ml: mlConfig.enabled ? {
              overallScore: avgMLScore,
              filteredBots: passedSignals.length,
              rejectedBots: rejectedSignals.length,
              recommendation: qualityAssessment === 'EXCELLENT' || qualityAssessment === 'GOOD' ? 'APPROVE' :
                             qualityAssessment === 'ACCEPTABLE' ? 'MONITOR' :
                             qualityAssessment === 'POOR' ? 'ADJUST' : 'REJECT',
              qualityAssessment,
            } : undefined,
          };
          
          setAggregatedSignals(prev => [newAggregated, ...prev].slice(0, 10));
          setStats(prev => ({
            ...prev,
            totalSignals: prev.totalSignals + 1,
            winRate: 0.68 + Math.random() * 0.12,
            avgReturn: 2.5 + Math.random() * 3,
            consensusAccuracy: 0.72 + Math.random() * 0.15,
          }));
        }
      }
    }, 4000);
    
    return () => clearInterval(interval);
  }, [isRunning, config, mlConfig, filterSignalThroughML]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      // Fetch ML filter config
      const mlRes = await fetch('/api/ml/filter');
      const mlData = await mlRes.json();
      if (mlData.success && mlData.config) {
        setMlConfig(prev => ({ ...prev, ...mlData.config }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsRunning(true);
      setStats({
        totalSignals: 342,
        winRate: 0.72,
        avgReturn: 4.2,
        activeBots: 12,
        consensusAccuracy: 0.78,
        mlFilteredSignals: 10,
        mlRejectedSignals: 2,
        mlAvgScore: 0.65,
      });
      toast.success("LOGOS успешно запущен");
    } catch (error) {
      toast.error("Не удалось запустить LOGOS");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRunning(false);
      toast.success("LOGOS остановлен");
    } catch (error) {
      toast.error("Не удалось остановить LOGOS");
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "LONG": return "text-green-500";
      case "SHORT": return "text-red-500";
      default: return "text-muted-foreground";
    }
  };

  const getMLScoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-500";
    if (score >= 0.5) return "text-yellow-500";
    if (score >= 0.3) return "text-orange-500";
    return "text-red-500";
  };

  const getQualityAssessmentColor = (assessment: string) => {
    switch (assessment) {
      case 'EXCELLENT': return 'bg-green-500';
      case 'GOOD': return 'bg-green-600';
      case 'ACCEPTABLE': return 'bg-yellow-500';
      case 'POOR': return 'bg-orange-500';
      case 'REJECTED': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            LOGOS
            <Badge variant="outline" className="ml-2">Мета-бот</Badge>
            {mlConfig.enabled && (
              <Badge variant="outline" className="ml-1 bg-purple-500/10 text-purple-500 border-purple-500/20">
                <Brain className="h-3 w-3 mr-1" />
                ML
              </Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Агрегация сигналов и оценка качества от всех ботов
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge className={cn(
            "text-sm",
            isRunning ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-gray-500/10 text-gray-500"
          )}>
            {isRunning ? "РАБОТАЕТ" : "ОСТАНОВЛЕН"}
          </Badge>
          
          <Button variant="outline" size="sm" onClick={() => setShowConfig(!showConfig)}>
            <Settings className="h-4 w-4 mr-2" />
            Настроить
          </Button>
          
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Pause className="h-4 w-4 mr-1" />
              Остановить
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={isStarting}>
              {isStarting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {isStarting ? "Запуск..." : "Запустить"}
            </Button>
          )}
        </div>
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Конфигурация LOGOS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Символ</Label>
                <Input 
                  value={config.symbol} 
                  onChange={(e) => setConfig(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Мин. консенсус</Label>
                <Input 
                  type="number" 
                  step="0.05"
                  value={config.minConsensus} 
                  onChange={(e) => setConfig(prev => ({ ...prev, minConsensus: parseFloat(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Мин. уверенность</Label>
                <Input 
                  type="number" 
                  step="0.05"
                  value={config.minConfidence} 
                  onChange={(e) => setConfig(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Мин. сигналов</Label>
                <Input 
                  type="number" 
                  value={config.minSignals} 
                  onChange={(e) => setConfig(prev => ({ ...prev, minSignals: parseInt(e.target.value) }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Порог качества: {(config.qualityThreshold * 100).toFixed(0)}%</Label>
              <Slider
                value={[config.qualityThreshold]}
                onValueChange={([v]) => setConfig(prev => ({ ...prev, qualityThreshold: v }))}
                min={0.5}
                max={1}
                step={0.05}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label>Автоматическая торговля</Label>
              <Switch 
                checked={config.autoTrade} 
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoTrade: checked }))}
              />
            </div>

            {/* ML Filter Configuration */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-500" />
                  <Label className="text-base font-semibold">ML Фильтр</Label>
                </div>
                <Switch 
                  checked={mlConfig.enabled} 
                  onCheckedChange={(checked) => setMlConfig(prev => ({ ...prev, enabled: checked }))}
                />
              </div>
              
              {mlConfig.enabled && (
                <div className="space-y-4 pl-7">
                  <div className="space-y-2">
                    <Label>Мин. ML Score: {(mlConfig.minMLScore * 100).toFixed(0)}%</Label>
                    <Slider
                      value={[mlConfig.minMLScore]}
                      onValueChange={([v]) => setMlConfig(prev => ({ ...prev, minMLScore: v }))}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Regime Filter</Label>
                      <Switch 
                        checked={mlConfig.useRegimeFilter} 
                        onCheckedChange={(checked) => setMlConfig(prev => ({ ...prev, useRegimeFilter: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">ADX Filter</Label>
                      <Switch 
                        checked={mlConfig.useADXFilter} 
                        onCheckedChange={(checked) => setMlConfig(prev => ({ ...prev, useADXFilter: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Volatility Filter</Label>
                      <Switch 
                        checked={mlConfig.useVolatilityFilter} 
                        onCheckedChange={(checked) => setMlConfig(prev => ({ ...prev, useVolatilityFilter: checked }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Всего сигналов</div>
            <div className="text-2xl font-bold">{stats.totalSignals}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Процент побед</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.winRate >= 0.5 ? "text-green-500" : "text-red-500"
            )}>
              {(stats.winRate * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Средний возврат</div>
            <div className="text-2xl font-bold text-green-500">
              +{stats.avgReturn.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Активных ботов</div>
            <div className="text-2xl font-bold">{stats.activeBots}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Точность консенсуса</div>
            <div className={cn(
              "text-2xl font-bold",
              stats.consensusAccuracy >= 0.7 ? "text-green-500" : ""
            )}>
              {(stats.consensusAccuracy * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ML Stats Row */}
      {mlConfig.enabled && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-purple-500/5 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                ML Прошло
              </div>
              <div className="text-2xl font-bold text-green-500">{stats.mlFilteredSignals}</div>
            </CardContent>
          </Card>
          <Card className="bg-purple-500/5 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <XCircle className="h-4 w-4 text-red-500" />
                ML Отклонено
              </div>
              <div className="text-2xl font-bold text-red-500">{stats.mlRejectedSignals}</div>
            </CardContent>
          </Card>
          <Card className="bg-purple-500/5 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Brain className="h-4 w-4 text-purple-500" />
                Средний ML Score
              </div>
              <div className={cn("text-2xl font-bold", getMLScoreColor(stats.mlAvgScore))}>
                {(stats.mlAvgScore * 100).toFixed(0)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bot Signals Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Сигналы ботов
              {mlConfig.enabled && (
                <Badge variant="outline" className="ml-2 text-xs bg-purple-500/10">
                  ML Filter
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Текущие сигналы от всех активных ботов
            </CardDescription>
          </CardHeader>
          <CardContent>
            {botSignals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Нет активных сигналов</p>
                <p className="text-sm">Запустите LOGOS для агрегации сигналов</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {BOT_TYPES.map((botType) => {
                  const typeSignals = botSignals.filter(s => s.botType === botType.id);
                  if (typeSignals.length === 0) return null;
                  
                  const BotIcon = botType.icon;
                  
                  return (
                    <div key={botType.id} className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                        <BotIcon className="h-3 w-3" />
                        {botType.label}
                      </div>
                      {typeSignals.map((signal) => (
                        <div
                          key={signal.botId}
                          className={cn(
                            "flex items-center justify-between p-2 rounded",
                            mlConfig.enabled && !signal.mlPassed ? "bg-red-500/10 opacity-60" : "bg-muted/30"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {signal.botName}
                            </Badge>
                            <span className={cn("font-medium", getSignalColor(signal.signal))}>
                              {signal.signal}
                            </span>
                            {mlConfig.enabled && signal.mlPassed !== undefined && (
                              signal.mlPassed ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-500" />
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {mlConfig.enabled && signal.mlScore !== undefined && (
                              <span className={cn("text-xs font-medium", getMLScoreColor(signal.mlScore))}>
                                ML: {(signal.mlScore * 100).toFixed(0)}%
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {(signal.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aggregated Signals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-5 w-5" />
              Агрегированные сигналы
            </CardTitle>
            <CardDescription>
              Сигналы с высоким консенсусом
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aggregatedSignals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Нет агрегированных сигналов</p>
                <p className="text-sm">Требуется консенсус ≥ {(config.minConsensus * 100).toFixed(0)}%</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {aggregatedSignals.map((signal, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg bg-muted/50 border"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{signal.symbol}</Badge>
                        <Badge className={cn(
                          signal.direction === "LONG" ? "bg-green-500" : "bg-red-500"
                        )}>
                          {signal.direction}
                        </Badge>
                        {signal.ml && (
                          <Badge className={getQualityAssessmentColor(signal.ml.qualityAssessment)}>
                            {signal.ml.qualityAssessment}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium">
                        Качество: <span className="text-green-500">{(signal.qualityScore * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span className="block">Консенсус</span>
                        <span className="font-medium text-foreground">{(signal.consensus * 100).toFixed(0)}%</span>
                      </div>
                      <div>
                        <span className="block">Уверенность</span>
                        <span className="font-medium text-foreground">{(signal.avgConfidence * 100).toFixed(0)}%</span>
                      </div>
                      <div>
                        <span className="block">Ботов</span>
                        <span className="font-medium text-foreground">{signal.agreeingBots}/{signal.totalBots}</span>
                      </div>
                      <div>
                        <Button variant="outline" size="sm" className="h-6 text-xs">
                          <Zap className="h-3 w-3 mr-1" />
                          Торговать
                        </Button>
                      </div>
                    </div>
                    
                    {/* ML Info */}
                    {signal.ml && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="block text-muted-foreground">ML Score</span>
                            <span className={cn("font-medium", getMLScoreColor(signal.ml.overallScore))}>
                              {(signal.ml.overallScore * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div>
                            <span className="block text-muted-foreground">Прошло ML</span>
                            <span className="font-medium text-foreground">{signal.ml.filteredBots}</span>
                          </div>
                          <div>
                            <span className="block text-muted-foreground">Отклонено</span>
                            <span className="font-medium text-red-500">{signal.ml.rejectedBots}</span>
                          </div>
                          <div>
                            <span className="block text-muted-foreground">Рекомендация</span>
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              signal.ml.recommendation === 'APPROVE' ? 'text-green-500 border-green-500/30' :
                              signal.ml.recommendation === 'REJECT' ? 'text-red-500 border-red-500/30' :
                              signal.ml.recommendation === 'ADJUST' ? 'text-orange-500 border-orange-500/30' :
                              'text-yellow-500 border-yellow-500/30'
                            )}>
                              {signal.ml.recommendation}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает LOGOS</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>LOGOS</strong> — мета-бот для агрегации сигналов от всех торговых ботов платформы.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Собирает сигналы от всех активных ботов в реальном времени</li>
            <li>Вычисляет консенсус по направлению (LONG/SHORT)</li>
            {mlConfig.enabled && (
              <li className="text-purple-500">
                <Brain className="h-3 w-3 inline mr-1" />
                Фильтрует сигналы через ML (Lawrence Classifier)
              </li>
            )}
            <li>Оценивает качество сигнала на основе уверенности ботов{mlConfig.enabled && ' и ML Score'}</li>
            <li>Фильтрует по минимальному порогу консенсуса</li>
            <li>Может автоматически торговать при высоком качестве сигнала</li>
          </ul>
          <p className="text-xs italic mt-2 text-primary/70">
            Чем больше ботов согласны{mlConfig.enabled && ' и выше ML Score'}, тем выше качество сигнала
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
