/**
 * GENETIC OPTIMIZER
 *
 * Genetic Algorithm implementation for parameter optimization.
 * NO NEURAL NETWORKS - uses classical evolutionary methods.
 */

import type {
  Gene,
  Chromosome,
  GeneticConfig,
  PopulationStats,
  OptimizationResult,
  FitnessFunction,
  Constraint,
  SelectionMethod,
  CrossoverMethod,
  MutationMethod,
} from './types';

export class GeneticOptimizer {
  private config: GeneticConfig;
  private population: Chromosome[] = [];
  private generation: number = 0;
  private history: PopulationStats[] = [];
  private bestFitness: number = -Infinity;
  private stagnationCount: number = 0;
  private currentMutationRate: number;
  private evaluationsCount: number = 0;

  constructor(config: Partial<GeneticConfig> = {}) {
    this.config = {
      populationSize: 50,
      maxGenerations: 100,
      eliteCount: 2,
      selectionMethod: 'tournament',
      tournamentSize: 3,
      crossoverMethod: 'blend',
      crossoverRate: 0.8,
      mutationMethod: 'adaptive',
      mutationRate: 0.1,
      adaptiveMutationIncrease: 1.5,
      earlyStoppingPatience: 20,
      improvementThreshold: 0.001,
      parallelEvaluation: false,
      ...config,
    };
    this.currentMutationRate = this.config.mutationRate;
  }

  /**
   * Initialize population with genes
   */
  public initialize(template: Gene[]): void {
    this.population = [];
    this.generation = 0;
    this.history = [];
    this.bestFitness = -Infinity;
    this.stagnationCount = 0;
    this.currentMutationRate = this.config.mutationRate;
    this.evaluationsCount = 0;

    for (let i = 0; i < this.config.populationSize; i++) {
      const chromosome: Chromosome = {
        id: `chr-${i}`,
        genes: template.map(gene => ({
          ...gene,
          value: this.randomInRange(gene.min, gene.max),
        })),
        fitness: -Infinity,
        age: 0,
        generation: 0,
      };
      this.population.push(chromosome);
    }
  }

  /**
   * Run optimization
   */
  public async optimize(
    template: Gene[],
    fitnessFunction: FitnessFunction,
    constraints: Constraint[] = []
  ): Promise<OptimizationResult> {
    const startTime = Date.now();

    // Initialize population
    this.initialize(template);

    // Evaluate initial population
    await this.evaluatePopulation(fitnessFunction, constraints);

    // Evolve
    while (this.generation < this.config.maxGenerations) {
      // Record stats
      const stats = this.getStats();
      this.history.push(stats);

      // Check early stopping
      if (this.checkEarlyStopping(stats)) {
        break;
      }

      // Evolve to next generation
      await this.evolve(fitnessFunction, constraints);

      this.generation++;
    }

    // Get best chromosome
    const best = this.getBestChromosome();

    return {
      bestChromosome: best,
      finalPopulation: [...this.population],
      history: this.history,
      generations: this.generation,
      converged: this.stagnationCount >= this.config.earlyStoppingPatience,
      durationMs: Date.now() - startTime,
      evaluationsCount: this.evaluationsCount,
    };
  }

  /**
   * Evaluate fitness for entire population
   */
  private async evaluatePopulation(
    fitnessFunction: FitnessFunction,
    constraints: Constraint[]
  ): Promise<void> {
    const evaluate = async (chromosome: Chromosome): Promise<number> => {
      // Check constraints
      if (!this.checkConstraints(chromosome.genes, constraints)) {
        return -Infinity;
      }

      try {
        const fitness = await fitnessFunction(chromosome.genes);
        this.evaluationsCount++;
        return isFinite(fitness) ? fitness : -Infinity;
      } catch {
        return -Infinity;
      }
    };

    if (this.config.parallelEvaluation) {
      const fitnesses = await Promise.all(this.population.map(evaluate));
      this.population.forEach((chr, i) => {
        chr.fitness = fitnesses[i];
      });
    } else {
      for (const chromosome of this.population) {
        chromosome.fitness = await evaluate(chromosome);
      }
    }
  }

  /**
   * Evolve to next generation
   */
  private async evolve(
    fitnessFunction: FitnessFunction,
    constraints: Constraint[]
  ): Promise<void> {
    // Sort by fitness
    this.population.sort((a, b) => b.fitness - a.fitness);

    // Track best fitness
    const currentBest = this.population[0]?.fitness || -Infinity;
    if (currentBest > this.bestFitness + this.config.improvementThreshold) {
      this.bestFitness = currentBest;
      this.stagnationCount = 0;
      this.currentMutationRate = this.config.mutationRate;
    } else {
      this.stagnationCount++;
      // Adaptive mutation increase
      this.currentMutationRate = Math.min(
        this.currentMutationRate * this.config.adaptiveMutationIncrease,
        0.5
      );
    }

    // Create new population
    const newPopulation: Chromosome[] = [];

    // Elitism - preserve best chromosomes
    for (let i = 0; i < this.config.eliteCount; i++) {
      if (this.population[i]) {
        newPopulation.push({
          ...this.population[i],
          age: this.population[i].age + 1,
        });
      }
    }

    // Generate offspring
    while (newPopulation.length < this.config.populationSize) {
      // Selection
      const parent1 = this.select();
      const parent2 = this.select();

      // Crossover
      let offspring: Chromosome;
      if (Math.random() < this.config.crossoverRate) {
        offspring = this.crossover(parent1, parent2);
      } else {
        offspring = Math.random() < 0.5 ? { ...parent1 } : { ...parent2 };
      }

      // Mutation
      this.mutate(offspring);

      offspring.id = `chr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      offspring.generation = this.generation + 1;

      newPopulation.push(offspring);
    }

    this.population = newPopulation;

    // Evaluate new population
    await this.evaluatePopulation(fitnessFunction, constraints);
  }

  /**
   * Selection method
   */
  private select(): Chromosome {
    switch (this.config.selectionMethod) {
      case 'tournament':
        return this.tournamentSelection();
      case 'roulette':
        return this.rouletteSelection();
      case 'rank':
        return this.rankSelection();
      case 'elitist':
        return this.elitistSelection();
      default:
        return this.tournamentSelection();
    }
  }

  private tournamentSelection(): Chromosome {
    const tournament: Chromosome[] = [];
    for (let i = 0; i < this.config.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * this.population.length);
      tournament.push(this.population[idx]);
    }
    tournament.sort((a, b) => b.fitness - a.fitness);
    return tournament[0];
  }

  private rouletteSelection(): Chromosome {
    const minFitness = Math.min(...this.population.map(c => c.fitness));
    const adjustedFitnesses = this.population.map(c => c.fitness - minFitness + 1);
    const totalFitness = adjustedFitnesses.reduce((sum, f) => sum + f, 0);
    
    let random = Math.random() * totalFitness;
    for (let i = 0; i < this.population.length; i++) {
      random -= adjustedFitnesses[i];
      if (random <= 0) {
        return this.population[i];
      }
    }
    return this.population[0];
  }

  private rankSelection(): Chromosome {
    const sorted = [...this.population].sort((a, b) => b.fitness - a.fitness);
    const ranks = sorted.map((_, i) => sorted.length - i);
    const totalRank = ranks.reduce((sum, r) => sum + r, 0);
    
    let random = Math.random() * totalRank;
    for (let i = 0; i < sorted.length; i++) {
      random -= ranks[i];
      if (random <= 0) {
        return sorted[i];
      }
    }
    return sorted[0];
  }

  private elitistSelection(): Chromosome {
    // 70% chance to pick from top 20%
    if (Math.random() < 0.7) {
      const top20 = Math.floor(this.population.length * 0.2);
      return this.population[Math.floor(Math.random() * top20)];
    }
    return this.population[Math.floor(Math.random() * this.population.length)];
  }

  /**
   * Crossover methods
   */
  private crossover(parent1: Chromosome, parent2: Chromosome): Chromosome {
    const genes: Gene[] = [];

    switch (this.config.crossoverMethod) {
      case 'single_point':
        return this.singlePointCrossover(parent1, parent2);
      case 'two_point':
        return this.twoPointCrossover(parent1, parent2);
      case 'uniform':
        return this.uniformCrossover(parent1, parent2);
      case 'blend':
        return this.blendCrossover(parent1, parent2);
      default:
        return this.blendCrossover(parent1, parent2);
    }
  }

  private singlePointCrossover(parent1: Chromosome, parent2: Chromosome): Chromosome {
    const point = Math.floor(Math.random() * parent1.genes.length);
    const genes = [
      ...parent1.genes.slice(0, point),
      ...parent2.genes.slice(point),
    ];
    return { id: '', genes, fitness: -Infinity, age: 0, generation: 0 };
  }

  private twoPointCrossover(parent1: Chromosome, parent2: Chromosome): Chromosome {
    const point1 = Math.floor(Math.random() * parent1.genes.length);
    const point2 = Math.floor(Math.random() * parent1.genes.length);
    const [start, end] = point1 < point2 ? [point1, point2] : [point2, point1];
    const genes = [
      ...parent1.genes.slice(0, start),
      ...parent2.genes.slice(start, end),
      ...parent1.genes.slice(end),
    ];
    return { id: '', genes, fitness: -Infinity, age: 0, generation: 0 };
  }

  private uniformCrossover(parent1: Chromosome, parent2: Chromosome): Chromosome {
    const genes = parent1.genes.map((gene, i) => {
      return Math.random() < 0.5 ? { ...gene } : { ...parent2.genes[i] };
    });
    return { id: '', genes, fitness: -Infinity, age: 0, generation: 0 };
  }

  private blendCrossover(parent1: Chromosome, parent2: Chromosome): Chromosome {
    const alpha = 0.5; // Blend factor
    const genes = parent1.genes.map((gene, i) => {
      const min = Math.min(gene.value, parent2.genes[i].value);
      const max = Math.max(gene.value, parent2.genes[i].value);
      const range = max - min;
      const value = min - range * alpha + Math.random() * range * (1 + 2 * alpha);
      return {
        ...gene,
        value: Math.max(gene.min, Math.min(gene.max, value)),
      };
    });
    return { id: '', genes, fitness: -Infinity, age: 0, generation: 0 };
  }

  /**
   * Mutation methods
   */
  private mutate(chromosome: Chromosome): void {
    for (const gene of chromosome.genes) {
      if (Math.random() < this.currentMutationRate) {
        switch (this.config.mutationMethod) {
          case 'random':
            gene.value = this.randomInRange(gene.min, gene.max);
            break;
          case 'gaussian':
            const range = gene.max - gene.min;
            const std = range * 0.1;
            gene.value += (Math.random() - 0.5) * 2 * std;
            gene.value = Math.max(gene.min, Math.min(gene.max, gene.value));
            break;
          case 'adaptive':
            const adaptiveRange = (gene.max - gene.min) * this.currentMutationRate;
            gene.value += (Math.random() - 0.5) * 2 * adaptiveRange;
            gene.value = Math.max(gene.min, Math.min(gene.max, gene.value));
            break;
        }
      }
    }
  }

  /**
   * Check constraints
   */
  private checkConstraints(genes: Gene[], constraints: Constraint[]): boolean {
    for (const constraint of constraints) {
      switch (constraint.type) {
        case 'range':
          // Already handled by gene min/max
          break;
        case 'sum':
          const sum = genes
            .filter(g => constraint.parameters.includes(g.name))
            .reduce((s, g) => s + g.value, 0);
          if (constraint.min !== undefined && sum < constraint.min) return false;
          if (constraint.max !== undefined && sum > constraint.max) return false;
          break;
        case 'ratio':
          if (constraint.parameters.length === 2) {
            const g1 = genes.find(g => g.name === constraint.parameters[0]);
            const g2 = genes.find(g => g.name === constraint.parameters[1]);
            if (g1 && g2 && g2.value !== 0) {
              const ratio = g1.value / g2.value;
              if (constraint.min !== undefined && ratio < constraint.min) return false;
              if (constraint.max !== undefined && ratio > constraint.max) return false;
            }
          }
          break;
        case 'custom':
          if (constraint.check && !constraint.check(genes)) return false;
          break;
      }
    }
    return true;
  }

  /**
   * Get population statistics
   */
  private getStats(): PopulationStats {
    const fitnesses = this.population.map(c => c.fitness);
    const avgFitness = fitnesses.reduce((sum, f) => sum + f, 0) / fitnesses.length;
    const diversity = this.calculateDiversity();

    return {
      generation: this.generation,
      bestFitness: Math.max(...fitnesses),
      avgFitness,
      worstFitness: Math.min(...fitnesses),
      diversity,
      stagnationCount: this.stagnationCount,
    };
  }

  private calculateDiversity(): number {
    if (this.population.length === 0) return 0;

    let totalDiff = 0;
    let comparisons = 0;

    for (let i = 0; i < this.population.length; i++) {
      for (let j = i + 1; j < this.population.length; j++) {
        for (let k = 0; k < this.population[i].genes.length; k++) {
          const range = this.population[i].genes[k].max - this.population[i].genes[k].min;
          if (range > 0) {
            const diff = Math.abs(
              this.population[i].genes[k].value - this.population[j].genes[k].value
            ) / range;
            totalDiff += diff;
            comparisons++;
          }
        }
      }
    }

    return comparisons > 0 ? totalDiff / comparisons : 0;
  }

  private checkEarlyStopping(stats: PopulationStats): boolean {
    return this.stagnationCount >= this.config.earlyStoppingPatience;
  }

  private getBestChromosome(): Chromosome {
    return this.population.reduce((best, current) =>
      current.fitness > best.fitness ? current : best
    );
  }

  private randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  /**
   * Get current configuration
   */
  public getConfig(): GeneticConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<GeneticConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const defaultGeneticConfig: GeneticConfig = {
  populationSize: 50,
  maxGenerations: 100,
  eliteCount: 2,
  selectionMethod: 'tournament',
  tournamentSize: 3,
  crossoverMethod: 'blend',
  crossoverRate: 0.8,
  mutationMethod: 'adaptive',
  mutationRate: 0.1,
  adaptiveMutationIncrease: 1.5,
  earlyStoppingPatience: 20,
  improvementThreshold: 0.001,
  parallelEvaluation: false,
};
