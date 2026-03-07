/**
 * CITARION Genetic Algorithm Engine
 * 
 * Core implementation of evolutionary optimization for trading bots.
 */

import {
  Individual,
  Population,
  Chromosome,
  Gene,
  GAConfig,
  GAResult,
  FitnessFunction,
  FitnessContext,
  DEFAULT_GA_CONFIG,
  generateId,
  clamp,
  randomInRange,
  randomInt,
  gaussianRandom,
  calculateDiversity,
  chromosomeToParams,
} from './types'

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Create a random gene value within bounds
 */
function randomizeGene(gene: Gene): number {
  if (gene.type === 'categorical' && gene.categories) {
    return randomInt(0, gene.categories.length - 1)
  }
  return randomInRange(gene.min, gene.max)
}

/**
 * Create a random chromosome from template
 */
function createRandomChromosome(template: Chromosome): Chromosome {
  return template.map(gene => ({
    ...gene,
    value: randomizeGene(gene),
  }))
}

/**
 * Create a new individual
 */
function createIndividual(chromosome: Chromosome): Individual {
  return {
    id: generateId(),
    chromosome,
    fitness: -Infinity,
    objectives: [],
    age: 0,
    history: {
      fitnessHistory: [],
      bestFitness: -Infinity,
      avgFitness: 0,
    },
  }
}

/**
 * Initialize population
 */
function initializePopulation(config: GAConfig): Population {
  const individuals: Individual[] = []
  
  for (let i = 0; i < config.populationSize; i++) {
    const chromosome = createRandomChromosome(config.chromosomeTemplate)
    individuals.push(createIndividual(chromosome))
  }
  
  return {
    generation: 0,
    individuals,
    stats: {
      bestFitness: -Infinity,
      avgFitness: 0,
      worstFitness: Infinity,
      diversity: 1,
      stagnationCount: 0,
    },
  }
}

// ============================================================================
// SELECTION OPERATORS
// ============================================================================

/**
 * Tournament selection
 */
function tournamentSelection(
  population: Individual[],
  tournamentSize: number
): Individual {
  let best: Individual | null = null
  
  for (let i = 0; i < tournamentSize; i++) {
    const idx = randomInt(0, population.length - 1)
    const candidate = population[idx]
    
    if (!best || candidate.fitness > best.fitness) {
      best = candidate
    }
  }
  
  return best!
}

/**
 * Roulette wheel selection (fitness proportionate)
 */
function rouletteSelection(population: Individual[]): Individual {
  // Shift fitness to positive values
  const minFitness = Math.min(...population.map(i => i.fitness))
  const shiftedFitness = population.map(i => i.fitness - minFitness + 1)
  const totalFitness = shiftedFitness.reduce((a, b) => a + b, 0)
  
  let random = Math.random() * totalFitness
  let cumulative = 0
  
  for (let i = 0; i < population.length; i++) {
    cumulative += shiftedFitness[i]
    if (random <= cumulative) {
      return population[i]
    }
  }
  
  return population[population.length - 1]
}

/**
 * Rank selection
 */
function rankSelection(population: Individual[]): Individual {
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness)
  const n = sorted.length
  const totalRank = (n * (n + 1)) / 2
  
  const random = Math.random() * totalRank
  let cumulative = 0
  
  for (let i = 0; i < n; i++) {
    cumulative += n - i
    if (random <= cumulative) {
      return sorted[i]
    }
  }
  
  return sorted[0]
}

/**
 * Stochastic Universal Sampling (SUS)
 */
function susSelection(population: Individual[], count: number): Individual[] {
  const selected: Individual[] = []
  const minFitness = Math.min(...population.map(i => i.fitness))
  const shiftedFitness = population.map(i => i.fitness - minFitness + 1)
  const totalFitness = shiftedFitness.reduce((a, b) => a + b, 0)
  
  const distance = totalFitness / count
  const start = Math.random() * distance
  const pointers = Array.from({ length: count }, (_, i) => start + i * distance)
  
  let cumulative = 0
  let idx = 0
  
  for (const pointer of pointers) {
    while (cumulative < pointer && idx < population.length) {
      cumulative += shiftedFitness[idx]
      idx++
    }
    selected.push(population[Math.max(0, idx - 1)])
  }
  
  return selected
}

/**
 * Select parent based on method
 */
function selectParent(
  population: Individual[],
  config: GAConfig
): Individual {
  const { method, tournamentSize } = config.operators.selection
  
  switch (method) {
    case 'tournament':
      return tournamentSelection(population, tournamentSize || 3)
    case 'roulette':
      return rouletteSelection(population)
    case 'rank':
      return rankSelection(population)
    case 'sus':
      return susSelection(population, 1)[0]
    default:
      return tournamentSelection(population, 3)
  }
}

// ============================================================================
// CROSSOVER OPERATORS
// ============================================================================

/**
 * Single-point crossover
 */
function singlePointCrossover(p1: Chromosome, p2: Chromosome): [Chromosome, Chromosome] {
  const point = randomInt(1, p1.length - 2)
  
  const c1: Chromosome = [
    ...p1.slice(0, point).map(g => ({ ...g })),
    ...p2.slice(point).map(g => ({ ...g })),
  ]
  
  const c2: Chromosome = [
    ...p2.slice(0, point).map(g => ({ ...g })),
    ...p1.slice(point).map(g => ({ ...g })),
  ]
  
  return [c1, c2]
}

/**
 * Two-point crossover
 */
function twoPointCrossover(p1: Chromosome, p2: Chromosome): [Chromosome, Chromosome] {
  let point1 = randomInt(1, p1.length - 2)
  let point2 = randomInt(1, p1.length - 2)
  
  if (point1 > point2) {
    [point1, point2] = [point2, point1]
  }
  
  const c1: Chromosome = [
    ...p1.slice(0, point1).map(g => ({ ...g })),
    ...p2.slice(point1, point2).map(g => ({ ...g })),
    ...p1.slice(point2).map(g => ({ ...g })),
  ]
  
  const c2: Chromosome = [
    ...p2.slice(0, point1).map(g => ({ ...g })),
    ...p1.slice(point1, point2).map(g => ({ ...g })),
    ...p2.slice(point2).map(g => ({ ...g })),
  ]
  
  return [c1, c2]
}

/**
 * Uniform crossover
 */
function uniformCrossover(p1: Chromosome, p2: Chromosome, rate: number = 0.5): [Chromosome, Chromosome] {
  const c1: Chromosome = []
  const c2: Chromosome = []
  
  for (let i = 0; i < p1.length; i++) {
    if (Math.random() < rate) {
      c1.push({ ...p2[i] })
      c2.push({ ...p1[i] })
    } else {
      c1.push({ ...p1[i] })
      c2.push({ ...p2[i] })
    }
  }
  
  return [c1, c2]
}

/**
 * Blend crossover (BLX-α) for continuous genes
 */
function blendCrossover(p1: Chromosome, p2: Chromosome, alpha: number = 0.5): [Chromosome, Chromosome] {
  const c1: Chromosome = []
  const c2: Chromosome = []
  
  for (let i = 0; i < p1.length; i++) {
    const gene1 = p1[i]
    const gene2 = p2[i]
    
    if (gene1.type === 'continuous') {
      const min = Math.min(gene1.value, gene2.value)
      const max = Math.max(gene1.value, gene2.value)
      const range = max - min
      
      const newValue1 = randomInRange(min - alpha * range, max + alpha * range)
      const newValue2 = randomInRange(min - alpha * range, max + alpha * range)
      
      c1.push({ ...gene1, value: clamp(newValue1, gene1.min, gene1.max) })
      c2.push({ ...gene2, value: clamp(newValue2, gene2.min, gene2.max) })
    } else {
      // For discrete/categorical, use uniform crossover
      if (Math.random() < 0.5) {
        c1.push({ ...gene1 })
        c2.push({ ...gene2 })
      } else {
        c1.push({ ...gene2 })
        c2.push({ ...gene1 })
      }
    }
  }
  
  return [c1, c2]
}

/**
 * Simulated Binary Crossover (SBX)
 */
function sbxCrossover(
  p1: Chromosome,
  p2: Chromosome,
  distributionIndex: number = 2
): [Chromosome, Chromosome] {
  const c1: Chromosome = []
  const c2: Chromosome = []
  
  for (let i = 0; i < p1.length; i++) {
    const gene1 = p1[i]
    const gene2 = p2[i]
    
    if (gene1.type === 'continuous') {
      if (Math.abs(gene1.value - gene2.value) < 1e-10) {
        c1.push({ ...gene1 })
        c2.push({ ...gene2 })
        continue
      }
      
      const y1 = Math.min(gene1.value, gene2.value)
      const y2 = Math.max(gene1.value, gene2.value)
      
      const rand = Math.random()
      let beta: number
      
      if (rand <= 0.5) {
        beta = Math.pow(2 * rand, 1 / (distributionIndex + 1))
      } else {
        beta = Math.pow(1 / (2 * (1 - rand)), 1 / (distributionIndex + 1))
      }
      
      const child1 = 0.5 * ((y1 + y2) - beta * (y2 - y1))
      const child2 = 0.5 * ((y1 + y2) + beta * (y2 - y1))
      
      c1.push({ ...gene1, value: clamp(child1, gene1.min, gene1.max) })
      c2.push({ ...gene2, value: clamp(child2, gene2.min, gene2.max) })
    } else {
      // For discrete/categorical
      if (Math.random() < 0.5) {
        c1.push({ ...gene1 })
        c2.push({ ...gene2 })
      } else {
        c1.push({ ...gene2 })
        c2.push({ ...gene1 })
      }
    }
  }
  
  return [c1, c2]
}

/**
 * Perform crossover based on method
 */
function crossover(
  p1: Chromosome,
  p2: Chromosome,
  config: GAConfig
): [Chromosome, Chromosome] {
  const { method, blendAlpha, sbxDistributionIndex } = config.operators.crossover
  
  switch (method) {
    case 'single-point':
      return singlePointCrossover(p1, p2)
    case 'two-point':
      return twoPointCrossover(p1, p2)
    case 'uniform':
      return uniformCrossover(p1, p2)
    case 'blend':
      return blendCrossover(p1, p2, blendAlpha || 0.5)
    case 'sbx':
      return sbxCrossover(p1, p2, sbxDistributionIndex || 2)
    default:
      return blendCrossover(p1, p2, 0.5)
  }
}

// ============================================================================
// MUTATION OPERATORS
// ============================================================================

/**
 * Gaussian mutation
 */
function gaussianMutation(chromosome: Chromosome, rate: number, strength: number): Chromosome {
  return chromosome.map(gene => {
    if (Math.random() > rate) return gene
    
    if (gene.type === 'continuous') {
      const range = gene.max - gene.min
      const mutation = gaussianRandom(0, strength * range)
      const newValue = gene.value + mutation
      return { ...gene, value: clamp(newValue, gene.min, gene.max) }
    } else if (gene.type === 'discrete') {
      const range = gene.max - gene.min
      const mutation = Math.round(gaussianRandom(0, strength * range))
      const newValue = gene.value + mutation
      return { ...gene, value: clamp(newValue, gene.min, gene.max) }
    } else if (gene.categories) {
      // Categorical: random change
      return { ...gene, value: randomInt(0, gene.categories.length - 1) }
    }
    
    return gene
  })
}

/**
 * Uniform mutation
 */
function uniformMutation(chromosome: Chromosome, rate: number): Chromosome {
  return chromosome.map(gene => {
    if (Math.random() > rate) return gene
    return { ...gene, value: randomizeGene(gene) }
  })
}

/**
 * Polynomial mutation
 */
function polynomialMutation(
  chromosome: Chromosome,
  rate: number,
  distributionIndex: number = 20
): Chromosome {
  return chromosome.map(gene => {
    if (Math.random() > rate) return gene
    
    if (gene.type !== 'continuous') {
      return { ...gene, value: randomizeGene(gene) }
    }
    
    const rand = Math.random()
    let delta: number
    
    if (rand < 0.5) {
      delta = Math.pow(2 * rand, 1 / (distributionIndex + 1)) - 1
    } else {
      delta = 1 - Math.pow(2 * (1 - rand), 1 / (distributionIndex + 1))
    }
    
    const newValue = gene.value + delta * (gene.max - gene.min)
    return { ...gene, value: clamp(newValue, gene.min, gene.max) }
  })
}

/**
 * Non-uniform mutation (time-dependent)
 */
function nonUniformMutation(
  chromosome: Chromosome,
  rate: number,
  strength: number,
  generation: number,
  maxGenerations: number,
  decayRate: number = 0.5
): Chromosome {
  const timeFactor = 1 - Math.pow(generation / maxGenerations, decayRate)
  
  return chromosome.map(gene => {
    if (Math.random() > rate) return gene
    
    if (gene.type === 'continuous') {
      const range = gene.max - gene.min
      const mutation = gaussianRandom(0, strength * range * timeFactor)
      const newValue = gene.value + mutation
      return { ...gene, value: clamp(newValue, gene.min, gene.max) }
    } else if (gene.type === 'discrete') {
      const range = gene.max - gene.min
      const mutation = Math.round(gaussianRandom(0, strength * range * timeFactor))
      const newValue = gene.value + mutation
      return { ...gene, value: clamp(newValue, gene.min, gene.max) }
    } else if (gene.categories) {
      return { ...gene, value: randomInt(0, gene.categories.length - 1) }
    }
    
    return gene
  })
}

/**
 * Perform mutation based on method
 */
function mutate(
  chromosome: Chromosome,
  config: GAConfig,
  generation: number,
  maxGenerations: number
): Chromosome {
  const { method, rate, strength, polynomialDistributionIndex, decayRate } = config.operators.mutation
  
  switch (method) {
    case 'gaussian':
      return gaussianMutation(chromosome, rate, strength)
    case 'uniform':
      return uniformMutation(chromosome, rate)
    case 'polynomial':
      return polynomialMutation(chromosome, rate, polynomialDistributionIndex || 20)
    case 'non-uniform':
      return nonUniformMutation(chromosome, rate, strength, generation, maxGenerations, decayRate)
    default:
      return gaussianMutation(chromosome, rate, strength)
  }
}

// ============================================================================
// POPULATION STATISTICS
// ============================================================================

/**
 * Calculate population statistics
 */
function calculateStats(population: Individual[]): Population['stats'] {
  const fitnesses = population.map(i => i.fitness)
  const bestFitness = Math.max(...fitnesses)
  const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length
  const worstFitness = Math.min(...fitnesses)
  const diversity = calculateDiversity(population)
  
  return {
    bestFitness,
    avgFitness,
    worstFitness,
    diversity,
    stagnationCount: 0,  // Updated by caller
  }
}

// ============================================================================
// GENETIC ALGORITHM ENGINE
// ============================================================================

export class GeneticEngine {
  private config: GAConfig
  private population: Population | null = null
  private fitnessFunction: FitnessFunction
  private history: Population['stats'][] = []
  private startTime: number = 0
  private evaluations: number = 0

  constructor(
    config: Partial<GAConfig> & { chromosomeTemplate: Chromosome },
    fitnessFunction: FitnessFunction
  ) {
    this.config = {
      ...DEFAULT_GA_CONFIG,
      ...config,
    } as GAConfig
    this.fitnessFunction = fitnessFunction
  }

  /**
   * Initialize the population
   */
  initialize(): void {
    this.population = initializePopulation(this.config)
    this.history = []
    this.evaluations = 0
    this.startTime = Date.now()
  }

  /**
   * Evaluate fitness for all individuals
   */
  async evaluateFitness(): Promise<void> {
    if (!this.population) return

    const context: FitnessContext = {
      generation: this.population.generation,
      maxGenerations: this.config.termination.maxGenerations,
      populationStats: this.population.stats,
    }

    for (const individual of this.population.individuals) {
      const fitness = await this.fitnessFunction(individual.chromosome, context)
      individual.fitness = fitness
      individual.history.fitnessHistory.push(fitness)
      individual.history.bestFitness = Math.max(individual.history.bestFitness, fitness)
      individual.history.avgFitness = 
        individual.history.fitnessHistory.reduce((a, b) => a + b, 0) / individual.history.fitnessHistory.length
      this.evaluations++
    }

    this.population.stats = calculateStats(this.population.individuals)
    this.history.push({ ...this.population.stats })
  }

  /**
   * Evolve to next generation
   */
  async evolve(): Promise<void> {
    if (!this.population) return

    const newIndividuals: Individual[] = []
    const { rate: crossoverRate } = this.config.operators.crossover
    const { count: eliteCount, percentage, enabled: elitismEnabled } = this.config.operators.elitism

    // Elitism - preserve best individuals
    if (elitismEnabled) {
      const numElites = percentage 
        ? Math.ceil(this.config.populationSize * percentage)
        : eliteCount
      
      const sorted = [...this.population.individuals]
        .sort((a, b) => b.fitness - a.fitness)
      
      for (let i = 0; i < numElites && i < sorted.length; i++) {
        const elite: Individual = {
          ...sorted[i],
          age: sorted[i].age + 1,
        }
        newIndividuals.push(elite)
      }
    }

    // Generate offspring
    while (newIndividuals.length < this.config.populationSize) {
      // Selection
      const parent1 = selectParent(this.population.individuals, this.config)
      const parent2 = selectParent(this.population.individuals, this.config)

      // Crossover
      let child1Chromosome: Chromosome
      let child2Chromosome: Chromosome

      if (Math.random() < crossoverRate) {
        [child1Chromosome, child2Chromosome] = crossover(
          parent1.chromosome,
          parent2.chromosome,
          this.config
        )
      } else {
        child1Chromosome = parent1.chromosome.map(g => ({ ...g }))
        child2Chromosome = parent2.chromosome.map(g => ({ ...g }))
      }

      // Mutation
      child1Chromosome = mutate(
        child1Chromosome,
        this.config,
        this.population.generation,
        this.config.termination.maxGenerations
      )
      child2Chromosome = mutate(
        child2Chromosome,
        this.config,
        this.population.generation,
        this.config.termination.maxGenerations
      )

      // Create children
      newIndividuals.push(createIndividual(child1Chromosome))
      if (newIndividuals.length < this.config.populationSize) {
        newIndividuals.push(createIndividual(child2Chromosome))
      }
    }

    // Update population
    this.population.individuals = newIndividuals.slice(0, this.config.populationSize)
    this.population.generation++

    // Evaluate new population
    await this.evaluateFitness()
  }

  /**
   * Check termination criteria
   */
  checkTermination(): { terminated: boolean; reason: string } {
    if (!this.population) {
      return { terminated: true, reason: 'Population not initialized' }
    }

    const { termination } = this.config

    // Max generations
    if (this.population.generation >= termination.maxGenerations) {
      return { terminated: true, reason: 'Maximum generations reached' }
    }

    // Target fitness
    if (termination.targetFitness && 
        this.population.stats.bestFitness >= termination.targetFitness) {
      return { terminated: true, reason: 'Target fitness achieved' }
    }

    // Max stagnation
    if (termination.maxStagnation && this.history.length >= termination.maxStagnation) {
      const recent = this.history.slice(-termination.maxStagnation)
      const improving = recent.some((h, i) => 
        i > 0 && h.bestFitness > recent[i - 1].bestFitness
      )
      if (!improving) {
        return { terminated: true, reason: 'Maximum stagnation reached' }
      }
    }

    // Min diversity
    if (termination.minDiversity && 
        this.population.stats.diversity < termination.minDiversity) {
      return { terminated: true, reason: 'Minimum diversity threshold reached' }
    }

    // Time limit
    if (termination.timeLimit && 
        Date.now() - this.startTime > termination.timeLimit) {
      return { terminated: true, reason: 'Time limit reached' }
    }

    return { terminated: false, reason: '' }
  }

  /**
   * Run the genetic algorithm
   */
  async run(): Promise<GAResult> {
    this.initialize()
    await this.evaluateFitness()

    let terminated = false
    let reason = ''

    while (!terminated) {
      await this.evolve()
      
      const result = this.checkTermination()
      terminated = result.terminated
      reason = result.reason

      // Logging
      if (this.config.verbose && 
          this.population!.generation % (this.config.logInterval || 10) === 0) {
        console.log(
          `[GA] Gen ${this.population!.generation}: ` +
          `Best=${this.population!.stats.bestFitness.toFixed(4)}, ` +
          `Avg=${this.population!.stats.avgFitness.toFixed(4)}, ` +
          `Div=${this.population!.stats.diversity.toFixed(4)}`
        )
      }
    }

    // Find best individual
    const best = this.population!.individuals
      .reduce((best, ind) => ind.fitness > best.fitness ? ind : best)

    return {
      success: true,
      bestIndividual: best,
      finalPopulation: this.population!,
      history: this.history.map((stats, gen) => ({
        generation: gen,
        ...stats,
      })),
      statistics: {
        totalEvaluations: this.evaluations,
        totalGenerations: this.population!.generation,
        elapsedMs: Date.now() - this.startTime,
      },
      message: reason,
    }
  }

  /**
   * Get current population
   */
  getPopulation(): Population | null {
    return this.population
  }

  /**
   * Get best individual
   */
  getBest(): Individual | null {
    if (!this.population) return null
    return this.population.individuals
      .reduce((best, ind) => ind.fitness > best.fitness ? ind : best)
  }

  /**
   * Get optimization parameters from best individual
   */
  getBestParams(): Record<string, number | string> | null {
    const best = this.getBest()
    return best ? chromosomeToParams(best.chromosome) : null
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  chromosomeToParams,
  calculateDiversity,
}
