"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Settings,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Dna,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Download,
  Users,
  GitBranch,
  Shuffle,
  Trophy,
  BarChart3,
  Timer,
  Gauge,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Area,
  AreaChart,
  ComposedChart,
  Bar,
} from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  Gene,
  Chromosome,
  GeneticConfig,
  PopulationStats,
  OptimizationResult,
  SelectionMethod,
  CrossoverMethod,
  MutationMethod,
} from "@/lib/self-learning/types";

// ==================== TYPES ====================

type OptimizerStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";

interface GeneConfig {
  name: string;
  min: number;
  max: number;
  mutationRate: number;
}

interface OptimizerState {
  status: OptimizerStatus;
  generation: number;
  progress: number;
  currentPopulation: Chromosome[];
  bestChromosome: Chromosome | null;
  history: PopulationStats[];
  evaluationsCount: number;
  startTime: number | null;
  elapsedTime: number;
  converged: boolean;
}

// ==================== DEFAULT VALUES ====================

const DEFAULT_GENETIC_CONFIG: GeneticConfig = {
  populationSize: 50,
  maxGenerations: 100,
  eliteCount: 2,
  selectionMethod: "tournament",
  tournamentSize: 3,
  crossoverMethod: "blend",
  crossoverRate: 0.8,
  mutationMethod: "adaptive",
  mutationRate: 0.1,
  adaptiveMutationIncrease: 1.5,
  earlyStoppingPatience: 20,
  improvementThreshold: 0.001,
  parallelEvaluation: false,
};

const DEFAULT_GENE_CONFIGS: GeneConfig[] = [
  { name: "riskPerTrade", min: 0.005, max: 0.05, mutationRate: 0.1 },
  { name: "stopLossAtr", min: 1.0, max: 4.0, mutationRate: 0.15 },
  { name: "takeProfitRR", min: 1.0, max: 5.0, mutationRate: 0.15 },
  { name: "trailingActivation", min: 0.5, max: 5.0, mutationRate: 0.1 },
  { name: "trailingDistance", min: 0.3, max: 3.0, mutationRate: 0.1 },
  { name: "positionMultiplier", min: 0.5, max: 2.0, mutationRate: 0.1 },
  { name: "signalThreshold", min: 0.3, max: 0.9, mutationRate: 0.1 },
];

const DEFAULT_OPTIMIZER_STATE: OptimizerState = {
  status: "IDLE",
  generation: 0,
  progress: 0,
  currentPopulation: [],
  bestChromosome: null,
  history: [],
  evaluationsCount: 0,
  startTime: null,
  elapsedTime: 0,
  converged: false,
};

// ==================== SELECTION METHOD OPTIONS ====================

const SELECTION_OPTIONS = [
  {
    value: "tournament",
    label: "Tournament",
    description: "Select best from random subset",
    icon: Trophy,
  },
  {
    value: "roulette",
    label: "Roulette Wheel",
    description: "Probability proportional to fitness",
    icon: Target,
  },
  {
    value: "rank",
    label: "Rank Selection",
    description: "Select based on fitness ranking",
    icon: BarChart3,
  },
  {
    value: "elitist",
    label: "Elitist",
    description: "Prefer top performers",
    icon: Trophy,
  },
] as const;

// ==================== CROSSOVER METHOD OPTIONS ====================

const CROSSOVER_OPTIONS = [
  {
    value: "single_point",
    label: "Single Point",
    description: "One crossover point",
    icon: GitBranch,
  },
  {
    value: "two_point",
    label: "Two Point",
    description: "Two crossover points",
    icon: GitBranch,
  },
  {
    value: "uniform",
    label: "Uniform",
    description: "Random gene selection",
    icon: Shuffle,
  },
  {
    value: "blend",
    label: "Blend (BLX-α)",
    description: "Interpolate between parents",
    icon: Activity,
  },
] as const;

// ==================== MUTATION METHOD OPTIONS ====================

const MUTATION_OPTIONS = [
  {
    value: "random",
    label: "Random",
    description: "Random value in range",
    icon: Shuffle,
  },
  {
    value: "gaussian",
    label: "Gaussian",
    description: "Normal distribution perturbation",
    icon: Activity,
  },
  {
    value: "adaptive",
    label: "Adaptive",
    description: "Self-adjusting rate",
    icon: Gauge,
  },
] as const;

// ==================== CHART CONFIG ====================

const chartConfig: ChartConfig = {
  bestFitness: {
    label: "Best Fitness",
    color: "hsl(var(--chart-1))",
  },
  avgFitness: {
    label: "Avg Fitness",
    color: "hsl(var(--chart-2))",
  },
  worstFitness: {
    label: "Worst Fitness",
    color: "hsl(var(--chart-3))",
  },
  diversity: {
    label: "Diversity",
    color: "hsl(var(--chart-4))",
  },
};

// ==================== MAIN COMPONENT ====================

export function GeneticOptimizerPanel() {
  // Configuration state
  const [config, setConfig] = useState<GeneticConfig>(DEFAULT_GENETIC_CONFIG);
  const [geneConfigs, setGeneConfigs] = useState<GeneConfig[]>(DEFAULT_GENE_CONFIGS);

  // Optimizer state
  const [state, setState] = useState<OptimizerState>(DEFAULT_OPTIMIZER_STATE);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Animation frame ref for simulation
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Timer for elapsed time
  useEffect(() => {
    if (isRunning && !isPaused && state.startTime) {
      const interval = setInterval(() => {
        setState((prev) => ({
          ...prev,
          elapsedTime: Date.now() - (prev.startTime || Date.now()),
        }));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isRunning, isPaused, state.startTime]);

  // Update config helper
  const updateConfig = useCallback(<K extends keyof GeneticConfig>(
    key: K,
    value: GeneticConfig[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Update gene config helper
  const updateGeneConfig = useCallback((
    index: number,
    updates: Partial<GeneConfig>
  ) => {
    setGeneConfigs((prev) =>
      prev.map((g, i) => (i === index ? { ...g, ...updates } : g))
    );
  }, []);

  // Add new gene
  const addGene = useCallback(() => {
    setGeneConfigs((prev) => [
      ...prev,
      { name: `param${prev.length + 1}`, min: 0, max: 100, mutationRate: 0.1 },
    ]);
  }, []);

  // Remove gene
  const removeGene = useCallback((index: number) => {
    setGeneConfigs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Generate random chromosome
  const generateRandomChromosome = useCallback((
    genes: GeneConfig[],
    generation: number
  ): Chromosome => {
    return {
      id: `chr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      genes: genes.map((g) => ({
        name: g.name,
        value: g.min + Math.random() * (g.max - g.min),
        min: g.min,
        max: g.max,
        mutationRate: g.mutationRate,
      })),
      fitness: -Infinity,
      age: 0,
      generation,
    };
  }, []);

  // Simulate fitness evaluation
  const evaluateFitness = useCallback((chromosome: Chromosome): number => {
    // Simulated fitness function - in real implementation this would call backtesting
    const baseFitness = chromosome.genes.reduce((sum, gene) => {
      const normalized = (gene.value - gene.min) / (gene.max - gene.min);
      return sum + normalized * Math.random();
    }, 0);

    // Add some noise
    return baseFitness / chromosome.genes.length + (Math.random() - 0.5) * 0.2;
  }, []);

  // Selection methods
  const selectParent = useCallback((
    population: Chromosome[],
    method: SelectionMethod,
    tournamentSize: number
  ): Chromosome => {
    switch (method) {
      case "tournament": {
        const tournament: Chromosome[] = [];
        for (let i = 0; i < tournamentSize; i++) {
          const idx = Math.floor(Math.random() * population.length);
          tournament.push(population[idx]);
        }
        tournament.sort((a, b) => b.fitness - a.fitness);
        return tournament[0];
      }
      case "roulette": {
        const minFitness = Math.min(...population.map((c) => c.fitness));
        const adjustedFitnesses = population.map((c) => c.fitness - minFitness + 1);
        const totalFitness = adjustedFitnesses.reduce((sum, f) => sum + f, 0);
        let random = Math.random() * totalFitness;
        for (let i = 0; i < population.length; i++) {
          random -= adjustedFitnesses[i];
          if (random <= 0) return population[i];
        }
        return population[0];
      }
      case "rank": {
        const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
        const ranks = sorted.map((_, i) => sorted.length - i);
        const totalRank = ranks.reduce((sum, r) => sum + r, 0);
        let random = Math.random() * totalRank;
        for (let i = 0; i < sorted.length; i++) {
          random -= ranks[i];
          if (random <= 0) return sorted[i];
        }
        return sorted[0];
      }
      case "elitist":
        if (Math.random() < 0.7) {
          const top20 = Math.floor(population.length * 0.2);
          return population[Math.floor(Math.random() * top20)];
        }
        return population[Math.floor(Math.random() * population.length)];
      default:
        return population[Math.floor(Math.random() * population.length)];
    }
  }, []);

  // Crossover methods
  const crossover = useCallback((
    parent1: Chromosome,
    parent2: Chromosome,
    method: CrossoverMethod
  ): Chromosome => {
    const genes: Gene[] = [];

    switch (method) {
      case "single_point": {
        const point = Math.floor(Math.random() * parent1.genes.length);
        genes.push(
          ...parent1.genes.slice(0, point).map((g) => ({ ...g })),
          ...parent2.genes.slice(point).map((g) => ({ ...g }))
        );
        break;
      }
      case "two_point": {
        const point1 = Math.floor(Math.random() * parent1.genes.length);
        const point2 = Math.floor(Math.random() * parent1.genes.length);
        const [start, end] = point1 < point2 ? [point1, point2] : [point2, point1];
        genes.push(
          ...parent1.genes.slice(0, start).map((g) => ({ ...g })),
          ...parent2.genes.slice(start, end).map((g) => ({ ...g })),
          ...parent1.genes.slice(end).map((g) => ({ ...g }))
        );
        break;
      }
      case "uniform": {
        genes.push(
          ...parent1.genes.map((gene, i) =>
            Math.random() < 0.5 ? { ...gene } : { ...parent2.genes[i] }
          )
        );
        break;
      }
      case "blend": {
        const alpha = 0.5;
        genes.push(
          ...parent1.genes.map((gene, i) => {
            const min = Math.min(gene.value, parent2.genes[i].value);
            const max = Math.max(gene.value, parent2.genes[i].value);
            const range = max - min;
            const value = min - range * alpha + Math.random() * range * (1 + 2 * alpha);
            return {
              ...gene,
              value: Math.max(gene.min, Math.min(gene.max, value)),
            };
          })
        );
        break;
      }
    }

    return {
      id: "",
      genes,
      fitness: -Infinity,
      age: 0,
      generation: 0,
    };
  }, []);

  // Mutation
  const mutate = useCallback((
    chromosome: Chromosome,
    mutationRate: number,
    method: MutationMethod
  ): void => {
    for (const gene of chromosome.genes) {
      if (Math.random() < mutationRate) {
        switch (method) {
          case "random":
            gene.value = gene.min + Math.random() * (gene.max - gene.min);
            break;
          case "gaussian": {
            const range = gene.max - gene.min;
            const std = range * 0.1;
            gene.value += (Math.random() - 0.5) * 2 * std;
            gene.value = Math.max(gene.min, Math.min(gene.max, gene.value));
            break;
          }
          case "adaptive": {
            const adaptiveRange = (gene.max - gene.min) * mutationRate;
            gene.value += (Math.random() - 0.5) * 2 * adaptiveRange;
            gene.value = Math.max(gene.min, Math.min(gene.max, gene.value));
            break;
          }
        }
      }
    }
  }, []);

  // Calculate diversity
  const calculateDiversity = useCallback((population: Chromosome[]): number => {
    if (population.length === 0) return 0;

    let totalDiff = 0;
    let comparisons = 0;

    for (let i = 0; i < population.length; i++) {
      for (let j = i + 1; j < population.length; j++) {
        for (let k = 0; k < population[i].genes.length; k++) {
          const range = population[i].genes[k].max - population[i].genes[k].min;
          if (range > 0) {
            const diff =
              Math.abs(
                population[i].genes[k].value - population[j].genes[k].value
              ) / range;
            totalDiff += diff;
            comparisons++;
          }
        }
      }
    }

    return comparisons > 0 ? totalDiff / comparisons : 0;
  }, []);

  // Run one generation
  const runGeneration = useCallback(() => {
    setState((prev) => {
      if (prev.status !== "RUNNING") return prev;

      const newGeneration = prev.generation + 1;
      let newPopulation = [...prev.currentPopulation];
      let currentMutationRate = config.mutationRate;

      // Check for stagnation
      if (prev.history.length > 0) {
        const lastImprovement = prev.history[prev.history.length - 1];
        const improvement =
          lastImprovement.bestFitness - prev.bestChromosome!.fitness;
        if (improvement < config.improvementThreshold) {
          currentMutationRate = Math.min(
            currentMutationRate * config.adaptiveMutationIncrease,
            0.5
          );
        }
      }

      // Sort by fitness
      newPopulation.sort((a, b) => b.fitness - a.fitness);

      // Elitism - preserve best chromosomes
      const newPop: Chromosome[] = [];
      for (let i = 0; i < config.eliteCount; i++) {
        if (newPopulation[i]) {
          newPop.push({
            ...newPopulation[i],
            age: newPopulation[i].age + 1,
          });
        }
      }

      // Generate offspring
      while (newPop.length < config.populationSize) {
        const parent1 = selectParent(
          newPopulation,
          config.selectionMethod,
          config.tournamentSize
        );
        const parent2 = selectParent(
          newPopulation,
          config.selectionMethod,
          config.tournamentSize
        );

        let offspring: Chromosome;
        if (Math.random() < config.crossoverRate) {
          offspring = crossover(parent1, parent2, config.crossoverMethod);
        } else {
          offspring = Math.random() < 0.5 ? { ...parent1 } : { ...parent2 };
        }

        mutate(offspring, currentMutationRate, config.mutationMethod);
        offspring.id = `chr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        offspring.generation = newGeneration;

        newPop.push(offspring);
      }

      // Evaluate fitness
      for (const chromosome of newPop) {
        if (chromosome.fitness === -Infinity) {
          chromosome.fitness = evaluateFitness(chromosome);
        }
      }

      // Find best
      const best = newPop.reduce((b, c) => (c.fitness > b.fitness ? c : b));

      // Calculate stats
      const fitnesses = newPop.map((c) => c.fitness);
      const avgFitness = fitnesses.reduce((sum, f) => sum + f, 0) / fitnesses.length;
      const diversity = calculateDiversity(newPop);

      const stats: PopulationStats = {
        generation: newGeneration,
        bestFitness: Math.max(...fitnesses),
        avgFitness,
        worstFitness: Math.min(...fitnesses),
        diversity,
        stagnationCount:
          best.fitness <= (prev.bestChromosome?.fitness || -Infinity)
            ? (prev.history[prev.history.length - 1]?.stagnationCount || 0) + 1
            : 0,
      };

      // Check convergence
      const converged =
        stats.stagnationCount >= config.earlyStoppingPatience ||
        newGeneration >= config.maxGenerations;

      return {
        ...prev,
        generation: newGeneration,
        progress: (newGeneration / config.maxGenerations) * 100,
        currentPopulation: newPop,
        bestChromosome:
          best.fitness > (prev.bestChromosome?.fitness || -Infinity)
            ? best
            : prev.bestChromosome,
        history: [...prev.history, stats],
        evaluationsCount: prev.evaluationsCount + newPop.length,
        converged,
        status: converged ? "COMPLETED" : prev.status,
      };
    });
  }, [
    config,
    selectParent,
    crossover,
    mutate,
    evaluateFitness,
    calculateDiversity,
  ]);

  // Animation loop
  useEffect(() => {
    if (isRunning && !isPaused) {
      const animate = (timestamp: number) => {
        if (timestamp - lastUpdateRef.current >= 100) {
          runGeneration();
          lastUpdateRef.current = timestamp;
        }

        if (state.status === "RUNNING") {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      animationRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [isRunning, isPaused, runGeneration, state.status]);

  // Start optimization
  const startOptimization = useCallback(() => {
    if (geneConfigs.length === 0) {
      toast.error("Add at least one gene to optimize");
      return;
    }

    setIsRunning(true);
    setIsPaused(false);

    // Initialize population
    const initialPopulation: Chromosome[] = [];
    for (let i = 0; i < config.populationSize; i++) {
      const chromosome = generateRandomChromosome(geneConfigs, 0);
      chromosome.fitness = evaluateFitness(chromosome);
      initialPopulation.push(chromosome);
    }

    // Find initial best
    const best = initialPopulation.reduce((b, c) =>
      c.fitness > b.fitness ? c : b
    );

    // Calculate initial stats
    const fitnesses = initialPopulation.map((c) => c.fitness);
    const avgFitness = fitnesses.reduce((sum, f) => sum + f, 0) / fitnesses.length;

    const stats: PopulationStats = {
      generation: 0,
      bestFitness: Math.max(...fitnesses),
      avgFitness,
      worstFitness: Math.min(...fitnesses),
      diversity: calculateDiversity(initialPopulation),
      stagnationCount: 0,
    };

    setState({
      status: "RUNNING",
      generation: 0,
      progress: 0,
      currentPopulation: initialPopulation,
      bestChromosome: best,
      history: [stats],
      evaluationsCount: initialPopulation.length,
      startTime: Date.now(),
      elapsedTime: 0,
      converged: false,
    });

    toast.success("Genetic optimization started");
  }, [config.populationSize, geneConfigs, generateRandomChromosome, evaluateFitness]);

  // Pause optimization
  const pauseOptimization = useCallback(() => {
    setIsPaused(true);
    setState((prev) => ({ ...prev, status: "PAUSED" }));
    toast.info("Optimization paused");
  }, []);

  // Resume optimization
  const resumeOptimization = useCallback(() => {
    setIsPaused(false);
    setState((prev) => ({ ...prev, status: "RUNNING" }));
    toast.info("Optimization resumed");
  }, []);

  // Stop optimization
  const stopOptimization = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setState((prev) => ({
      ...prev,
      status: prev.converged ? "COMPLETED" : "CANCELLED",
    }));
    toast.warning("Optimization stopped");
  }, []);

  // Reset optimization
  const resetOptimization = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setState(DEFAULT_OPTIMIZER_STATE);
    toast.info("Optimization reset");
  }, []);

  // Copy best genes to clipboard
  const copyBestGenes = useCallback(() => {
    if (!state.bestChromosome) return;

    const genes = state.bestChromosome.genes.reduce(
      (obj, gene) => ({
        ...obj,
        [gene.name]: gene.value,
      }),
      {} as Record<string, number>
    );

    navigator.clipboard.writeText(JSON.stringify(genes, null, 2));
    toast.success("Best genes copied to clipboard");
  }, [state.bestChromosome]);

  // Export results
  const exportResults = useCallback(() => {
    const result: OptimizationResult = {
      bestChromosome: state.bestChromosome!,
      finalPopulation: state.currentPopulation,
      history: state.history,
      generations: state.generation,
      converged: state.converged,
      durationMs: state.elapsedTime,
      evaluationsCount: state.evaluationsCount,
    };

    const json = JSON.stringify(result, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `genetic-optimization-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Results exported");
  }, [state]);

  // Format time
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  // Get status badge
  const getStatusBadge = (status: OptimizerStatus) => {
    const styles: Record<
      OptimizerStatus,
      { color: string; icon: React.ReactNode; label: string }
    > = {
      IDLE: {
        color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
        icon: <Clock className="h-3 w-3" />,
        label: "Ready",
      },
      RUNNING: {
        color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        icon: <RefreshCw className="h-3 w-3 animate-spin" />,
        label: "Running",
      },
      PAUSED: {
        color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        icon: <Pause className="h-3 w-3" />,
        label: "Paused",
      },
      COMPLETED: {
        color: "bg-green-500/20 text-green-400 border-green-500/30",
        icon: <CheckCircle className="h-3 w-3" />,
        label: "Completed",
      },
      CANCELLED: {
        color: "bg-red-500/20 text-red-400 border-red-500/30",
        icon: <XCircle className="h-3 w-3" />,
        label: "Cancelled",
      },
      FAILED: {
        color: "bg-red-500/20 text-red-400 border-red-500/30",
        icon: <AlertTriangle className="h-3 w-3" />,
        label: "Failed",
      },
    };
    const { color, icon, label } = styles[status];
    return (
      <Badge variant="outline" className={cn("gap-1", color)}>
        {icon}
        {label}
      </Badge>
    );
  };

  // Get top chromosomes
  const topChromosomes = [...state.currentPopulation]
    .sort((a, b) => b.fitness - a.fitness)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Dna className="h-6 w-6 text-primary" />
            Genetic Algorithm Optimizer
          </h2>
          <p className="text-sm text-muted-foreground">
            Evolve optimal parameters through natural selection
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(state.status)}
          {state.bestChromosome && (
            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
              <Trophy className="h-3 w-3 mr-1" />
              Best: {state.bestChromosome.fitness.toFixed(4)}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: Configuration */}
        <div className="xl:col-span-1 space-y-6">
          {/* Population Configuration */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Population Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Population Size</Label>
                  <Input
                    type="number"
                    value={config.populationSize}
                    onChange={(e) => updateConfig("populationSize", Number(e.target.value))}
                    disabled={isRunning}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Max Generations</Label>
                  <Input
                    type="number"
                    value={config.maxGenerations}
                    onChange={(e) => updateConfig("maxGenerations", Number(e.target.value))}
                    disabled={isRunning}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Elite Count</Label>
                  <Input
                    type="number"
                    value={config.eliteCount}
                    onChange={(e) => updateConfig("eliteCount", Number(e.target.value))}
                    disabled={isRunning}
                    min={1}
                    max={Math.floor(config.populationSize / 4)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Tournament Size</Label>
                  <Input
                    type="number"
                    value={config.tournamentSize}
                    onChange={(e) => updateConfig("tournamentSize", Number(e.target.value))}
                    disabled={isRunning}
                    min={2}
                    max={10}
                    className="h-9"
                  />
                </div>
              </div>

              <Separator />

              {/* Mutation Rate Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Mutation Rate</Label>
                  <Badge variant="outline" className="text-xs">
                    {(config.mutationRate * 100).toFixed(0)}%
                  </Badge>
                </div>
                <Slider
                  value={[config.mutationRate]}
                  onValueChange={([v]) => updateConfig("mutationRate", v)}
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  disabled={isRunning}
                />
              </div>

              {/* Crossover Rate Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Crossover Rate</Label>
                  <Badge variant="outline" className="text-xs">
                    {(config.crossoverRate * 100).toFixed(0)}%
                  </Badge>
                </div>
                <Slider
                  value={[config.crossoverRate]}
                  onValueChange={([v]) => updateConfig("crossoverRate", v)}
                  min={0.1}
                  max={1}
                  step={0.05}
                  disabled={isRunning}
                />
              </div>

              <Separator />

              {/* Early Stopping */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div>
                  <p className="text-sm font-medium">Early Stopping</p>
                  <p className="text-xs text-muted-foreground">Stop if no improvement</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={config.earlyStoppingPatience > 0}
                    onCheckedChange={(v) =>
                      updateConfig("earlyStoppingPatience", v ? 20 : 0)
                    }
                    disabled={isRunning}
                  />
                  {config.earlyStoppingPatience > 0 && (
                    <Input
                      type="number"
                      value={config.earlyStoppingPatience}
                      onChange={(e) =>
                        updateConfig("earlyStoppingPatience", Number(e.target.value))
                      }
                      disabled={isRunning}
                      className="w-16 h-7 text-xs"
                    />
                  )}
                </div>
              </div>

              {/* Parallel Evaluation */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Parallel Evaluation</p>
                  <p className="text-xs text-muted-foreground">Evaluate fitness in parallel</p>
                </div>
                <Switch
                  checked={config.parallelEvaluation}
                  onCheckedChange={(v) => updateConfig("parallelEvaluation", v)}
                  disabled={isRunning}
                />
              </div>
            </CardContent>
          </Card>

          {/* Selection Method */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                Selection Method
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={config.selectionMethod}
                onValueChange={(v) => updateConfig("selectionMethod", v as SelectionMethod)}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {opt.description}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SELECTION_OPTIONS.find((o) => o.value === config.selectionMethod)?.description}
              </p>
            </CardContent>
          </Card>

          {/* Crossover Method */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                Crossover Method
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={config.crossoverMethod}
                onValueChange={(v) => updateConfig("crossoverMethod", v as CrossoverMethod)}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CROSSOVER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {opt.description}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {CROSSOVER_OPTIONS.find((o) => o.value === config.crossoverMethod)?.description}
              </p>
            </CardContent>
          </Card>

          {/* Mutation Method */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shuffle className="h-4 w-4 text-primary" />
                Mutation Method
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={config.mutationMethod}
                onValueChange={(v) => updateConfig("mutationMethod", v as MutationMethod)}
                disabled={isRunning}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUTATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {opt.description}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {MUTATION_OPTIONS.find((o) => o.value === config.mutationMethod)?.description}
              </p>
            </CardContent>
          </Card>

          {/* Control Buttons */}
          <Card className="bg-card border-border">
            <CardContent className="pt-4">
              <div className="flex gap-2">
                {!isRunning ? (
                  <Button
                    className="flex-1 gradient-primary text-background font-semibold"
                    onClick={startOptimization}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start Evolution
                  </Button>
                ) : (
                  <>
                    {isPaused ? (
                      <Button
                        className="flex-1 gradient-primary text-background"
                        onClick={resumeOptimization}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Resume
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={pauseOptimization}
                      >
                        <Pause className="h-4 w-4 mr-2" />
                        Pause
                      </Button>
                    )}
                    <Button variant="destructive" onClick={stopOptimization}>
                      <Square className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={resetOptimization} disabled={isRunning && !isPaused}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Columns: Progress & Results */}
        <div className="xl:col-span-2 space-y-6">
          {/* Progress & Statistics */}
          {(isRunning || state.status !== "IDLE") && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Evolution Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Generation {state.generation} / {config.maxGenerations}
                    </span>
                    <span className="font-mono">{state.progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={state.progress} className="h-2" />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Timer className="h-3 w-3" /> Elapsed
                    </p>
                    <p className="text-lg font-mono font-semibold">
                      {formatTime(state.elapsedTime)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Evaluations
                    </p>
                    <p className="text-lg font-mono font-semibold">
                      {state.evaluationsCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" /> Diversity
                    </p>
                    <p className="text-lg font-mono font-semibold">
                      {state.history.length > 0
                        ? (state.history[state.history.length - 1].diversity * 100).toFixed(1)
                        : "0"}
                      %
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Stagnation
                    </p>
                    <p className="text-lg font-mono font-semibold">
                      {state.history.length > 0
                        ? state.history[state.history.length - 1].stagnationCount
                        : 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Best Genome Display */}
          {state.bestChromosome && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    Best Genome
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={copyBestGenes}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                    <Button variant="ghost" size="sm" onClick={exportResults}>
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {state.bestChromosome.genes.map((gene) => (
                    <div
                      key={gene.name}
                      className="p-2 rounded-lg bg-green-500/10 border border-green-500/20"
                    >
                      <p className="text-xs text-muted-foreground truncate">{gene.name}</p>
                      <p className="font-mono font-semibold text-green-400">
                        {gene.value.toFixed(4)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <Badge variant="outline" className="gap-1">
                    Fitness: <span className="font-mono">{state.bestChromosome.fitness.toFixed(4)}</span>
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    Generation: <span className="font-mono">{state.bestChromosome.generation}</span>
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    Age: <span className="font-mono">{state.bestChromosome.age}</span>
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fitness Evolution Chart */}
          {state.history.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Fitness Evolution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ComposedChart data={state.history.slice(-50)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis
                      dataKey="generation"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `G${v}`}
                      className="text-xs"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => v.toFixed(2)}
                      className="text-xs"
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="bestFitness"
                      stroke="var(--color-bestFitness)"
                      fill="var(--color-bestFitness)"
                      fillOpacity={0.2}
                      strokeWidth={2}
                      name="Best"
                    />
                    <Line
                      type="monotone"
                      dataKey="avgFitness"
                      stroke="var(--color-avgFitness)"
                      strokeWidth={2}
                      dot={false}
                      name="Average"
                    />
                    <Line
                      type="monotone"
                      dataKey="worstFitness"
                      stroke="var(--color-worstFitness)"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Worst"
                    />
                  </ComposedChart>
                </ChartContainer>
                <div className="mt-3 flex items-center justify-center gap-6 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-[var(--color-bestFitness)]" />
                    <span className="text-muted-foreground">Best Fitness</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-1 bg-[var(--color-avgFitness)]" />
                    <span className="text-muted-foreground">Average</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 border-t border-dashed border-[var(--color-worstFitness)]" />
                    <span className="text-muted-foreground">Worst</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Diversity Chart */}
          {state.history.length > 1 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Population Diversity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-32 w-full">
                  <AreaChart data={state.history.slice(-50)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="generation" tickLine={false} axisLine={false} hide />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 1]}
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      className="text-xs"
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="diversity"
                      stroke="var(--color-diversity)"
                      fill="var(--color-diversity)"
                      fillOpacity={0.3}
                      strokeWidth={2}
                      name="Diversity"
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Top Chromosomes Table */}
          {topChromosomes.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Top Chromosomes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Genes</TableHead>
                        <TableHead className="text-right">Fitness</TableHead>
                        <TableHead className="text-right">Gen</TableHead>
                        <TableHead className="text-right">Age</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topChromosomes.map((chromosome, index) => (
                        <TableRow key={chromosome.id}>
                          <TableCell className="font-mono">
                            {index === 0 ? (
                              <Trophy className="h-4 w-4 text-yellow-500" />
                            ) : (
                              index + 1
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {chromosome.genes.slice(0, 4).map((gene) => (
                                <Badge
                                  key={gene.name}
                                  variant="outline"
                                  className="text-xs font-mono"
                                >
                                  {gene.name.slice(0, 6)}: {gene.value.toFixed(2)}
                                </Badge>
                              ))}
                              {chromosome.genes.length > 4 && (
                                <Badge variant="outline" className="text-xs">
                                  +{chromosome.genes.length - 4}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span
                              className={cn(
                                index === 0 ? "text-green-400 font-semibold" : ""
                              )}
                            >
                              {chromosome.fitness.toFixed(4)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {chromosome.generation}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {chromosome.age}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Gene Configuration */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4 text-primary" />
                  Gene Configuration
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addGene} disabled={isRunning}>
                  + Add Gene
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-64">
                <div className="space-y-3 pr-4">
                  {geneConfigs.map((gene, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border border-border bg-secondary/30"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 grid grid-cols-5 gap-2">
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">Name</Label>
                            <Input
                              value={gene.name}
                              onChange={(e) =>
                                updateGeneConfig(index, { name: e.target.value })
                              }
                              disabled={isRunning}
                              className="h-8 mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Min</Label>
                            <Input
                              type="number"
                              value={gene.min}
                              onChange={(e) =>
                                updateGeneConfig(index, { min: Number(e.target.value) })
                              }
                              disabled={isRunning}
                              className="h-8 mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Max</Label>
                            <Input
                              type="number"
                              value={gene.max}
                              onChange={(e) =>
                                updateGeneConfig(index, { max: Number(e.target.value) })
                              }
                              disabled={isRunning}
                              className="h-8 mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Mut. Rate</Label>
                            <Input
                              type="number"
                              value={gene.mutationRate}
                              onChange={(e) =>
                                updateGeneConfig(index, {
                                  mutationRate: Number(e.target.value),
                                })
                              }
                              disabled={isRunning}
                              min={0}
                              max={1}
                              step={0.05}
                              className="h-8 mt-1"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeGene(index)}
                          disabled={isRunning}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {geneConfigs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Dna className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No genes configured</p>
                      <p className="text-xs">Add genes to optimize</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default GeneticOptimizerPanel;
