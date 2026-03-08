/**
 * Genetic Algorithm & Particle Swarm Optimization
 *
 * Advanced optimization methods for strategy parameters:
 * - GA: Population-based evolution with crossover/mutation
 * - PSO: Swarm intelligence for continuous parameter optimization
 *
 * @module lib/optimization/evolutionary
 */

// ==================== TYPES ====================

export interface OptimizationResult {
  bestPosition: number[];
  bestFitness: number;
  history: number[];
  iterations: number;
  convergenceRate: number;
}

// ==================== PARTICLE SWARM OPTIMIZER ====================

export class PSOOptimizer {
  private config: {
    swarmSize: number;
    maxIterations: number;
    inertiaWeight: number;
    cognitive: number;
    social: number;
  };

  constructor(config?: Partial<typeof this.config>) {
    this.config = {
      swarmSize: 30,
      maxIterations: 50,
      inertiaWeight: 0.7,
      cognitive: 1.5,
      social: 1.5,
      ...config,
    };
  }

  async optimize(
    fitnessFunction: (position: number[]) => Promise<number>,
    dimensions: number,
    bounds: { min: number[]; max: number[] }
  ): Promise<OptimizationResult> {
    const swarm: Particle[] = [];
    let globalBest = { position: new Array(dimensions).fill(0), fitness: -Infinity };

    // Initialize swarm
    for (let i = 0; i < this.config.swarmSize; i++) {
      const position = bounds.min.map((min, d) => min + Math.random() * (bounds.max[d] - min));
      const velocity = bounds.min.map((min, d) => (Math.random() * 2 - 1) * (bounds.max[d] - min) * 0.1);
      swarm.push({ position, velocity, bestPosition: [...position], bestFitness: -Infinity, fitness: -Infinity });
    }

    const history: number[] = [];

    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      for (const p of swarm) {
        p.fitness = await fitnessFunction(p.position);
        if (p.fitness > p.bestFitness) { p.bestFitness = p.fitness; p.bestPosition = [...p.position]; }
        if (p.fitness > globalBest.fitness) { globalBest = { position: [...p.position], fitness: p.fitness }; }
      }
      history.push(globalBest.fitness);

      for (const p of swarm) {
        for (let d = 0; d < dimensions; d++) {
          const r1 = Math.random(), r2 = Math.random();
          p.velocity[d] = this.config.inertiaWeight * p.velocity[d] +
            this.config.cognitive * r1 * (p.bestPosition[d] - p.position[d]) +
            this.config.social * r2 * (globalBest.position[d] - p.position[d]);
          p.position[d] = Math.max(bounds.min[d], Math.min(bounds.max[d], p.position[d] + p.velocity[d]));
        }
      }
    }

    return { bestPosition: globalBest.position, bestFitness: globalBest.fitness, history, iterations: this.config.maxIterations, convergenceRate: history.length > 10 ? (history[history.length - 1] - history[0]) / history.length : 0 };
  }
}

interface Particle { position: number[]; velocity: number[]; bestPosition: number[]; bestFitness: number; fitness: number; }

// ==================== GENETIC ALGORITHM OPTIMIZER ====================

export class GAOptimizer {
  private config: { populationSize: number; generations: number; mutationRate: number; crossoverRate: number; elitismCount: number };

  constructor(config?: Partial<typeof this.config>) {
    this.config = { populationSize: 50, generations: 100, mutationRate: 0.1, crossoverRate: 0.7, elitismCount: 5, ...config };
  }

  async optimize(
    fitnessFunction: (genome: number[]) => Promise<number>,
    dimensions: number,
    bounds: { min: number[]; max: number[] }
  ): Promise<OptimizationResult> {
    let population: Individual[] = [];
    let bestEver = { genome: new Array(dimensions).fill(0), fitness: -Infinity };

    for (let i = 0; i < this.config.populationSize; i++) {
      const genome = bounds.min.map((min, d) => min + Math.random() * (bounds.max[d] - min));
      population.push({ genome, fitness: -Infinity });
    }

    const history: number[] = [];

    for (let gen = 0; gen < this.config.generations; gen++) {
      for (const ind of population) {
        ind.fitness = await fitnessFunction(ind.genome);
        if (ind.fitness > bestEver.fitness) bestEver = { genome: [...ind.genome], fitness: ind.fitness };
      }
      population.sort((a, b) => b.fitness - a.fitness);
      history.push(bestEver.fitness);

      const newPop: Individual[] = population.slice(0, this.config.elitismCount).map(i => ({ ...i }));
      while (newPop.length < this.config.populationSize) {
        const p1 = this.tournament(population), p2 = this.tournament(population);
        let child = Math.random() < this.config.crossoverRate ? this.crossover(p1.genome, p2.genome) : [...p1.genome];
        child = this.mutate(child, bounds);
        newPop.push({ genome: child, fitness: -Infinity });
      }
      population = newPop;
    }

    return { bestPosition: bestEver.genome, bestFitness: bestEver.fitness, history, iterations: this.config.generations, convergenceRate: history.length > 10 ? (history[history.length - 1] - history[0]) / history.length : 0 };
  }

  private tournament(pop: Individual[]): Individual {
    const t = Array(5).fill(0).map(() => pop[Math.floor(Math.random() * pop.length)]);
    return t.reduce((b, c) => c.fitness > b.fitness ? c : b);
  }

  private crossover(p1: number[], p2: number[]): number[] {
    const cp = Math.floor(Math.random() * p1.length);
    return p1.slice(0, cp).concat(p2.slice(cp));
  }

  private mutate(g: number[], b: { min: number[]; max: number[] }): number[] {
    return g.map((gene, i) => {
      if (Math.random() < this.config.mutationRate) {
        const range = b.max[i] - b.min[i];
        return Math.max(b.min[i], Math.min(b.max[i], gene + (Math.random() - 0.5) * range * 0.1));
      }
      return gene;
    });
  }
}

interface Individual { genome: number[]; fitness: number; }

// ==================== COMBINED OPTIMIZER ====================

export class EvolutionaryOptimizer {
  private pso = new PSOOptimizer();
  private ga = new GAOptimizer();

  async optimizePSO(fn: (p: number[]) => Promise<number>, d: number, b: { min: number[]; max: number[] }): Promise<OptimizationResult> {
    return this.pso.optimize(fn, d, b);
  }

  async optimizeGA(fn: (p: number[]) => Promise<number>, d: number, b: { min: number[]; max: number[] }): Promise<OptimizationResult> {
    return this.ga.optimize(fn, d, b);
  }

  async optimizeHybrid(fn: (p: number[]) => Promise<number>, d: number, b: { min: number[]; max: number[] }): Promise<OptimizationResult> {
    const psoRes = await this.pso.optimize(fn, d, b);
    const narrow = {
      min: psoRes.bestPosition.map((p, i) => Math.max(b.min[i], p - (b.max[i] - b.min[i]) * 0.2)),
      max: psoRes.bestPosition.map((p, i) => Math.min(b.max[i], p + (b.max[i] - b.min[i]) * 0.2)),
    };
    const gaRes = await this.ga.optimize(fn, d, narrow);
    return { bestPosition: gaRes.bestPosition, bestFitness: Math.max(psoRes.bestFitness, gaRes.bestFitness), history: [...psoRes.history, ...gaRes.history], iterations: psoRes.iterations + gaRes.iterations, convergenceRate: gaRes.convergenceRate };
  }
}

export function getEvolutionaryOptimizer(): EvolutionaryOptimizer {
  return new EvolutionaryOptimizer();
}

export default { PSOOptimizer, GAOptimizer, EvolutionaryOptimizer, getEvolutionaryOptimizer };
