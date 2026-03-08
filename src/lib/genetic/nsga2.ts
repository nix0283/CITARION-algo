/**
 * CITARION NSGA-II Implementation
 * 
 * Non-dominated Sorting Genetic Algorithm II for multi-objective optimization.
 * Implements Pareto-based multi-objective optimization for trading strategies.
 * 
 * CIT-026: Multi-objective GA implementation
 */

import {
  Individual,
  Population,
  Chromosome,
  GAConfig,
  GAResult,
  FitnessContext,
  MultiObjectiveFitnessFunction,
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
// NSGA-II SPECIFIC TYPES
// ============================================================================

export interface NSGA2Config extends GAConfig {
  multiObjective: true
  objectiveCount: number
  objectiveNames?: string[]
  objectiveDirections?: ('maximize' | 'minimize')[] // Default all maximize
}

export interface NSGA2Result extends GAResult {
  paretoFront: Individual[]
  paretoFronts: Individual[][]
  hypervolume: number
  objectiveValues: Record<string, number>[]
}

export interface ObjectiveFunction {
  name: string
  direction: 'maximize' | 'minimize'
  weight?: number
  target?: number
}

// ============================================================================
// NON-DOMINATED SORTING
// ============================================================================

/**
 * Check if individual p dominates individual q
 * p dominates q if p is no worse than q in all objectives and strictly better in at least one
 */
function dominates(
  p: Individual,
  q: Individual,
  directions: ('maximize' | 'minimize')[]
): boolean {
  const pObjectives = p.objectives
  const qObjectives = q.objectives
  
  if (pObjectives.length !== qObjectives.length) {
    throw new Error('Individuals must have same number of objectives')
  }
  
  let dominated = false
  
  for (let i = 0; i < pObjectives.length; i++) {
    const pVal = pObjectives[i]
    const qVal = qObjectives[i]
    const direction = directions[i] || 'maximize'
    
    if (direction === 'maximize') {
      if (pVal < qVal) return false // p is worse in this objective
      if (pVal > qVal) dominated = true // p is strictly better
    } else {
      if (pVal > qVal) return false // p is worse (minimize)
      if (pVal < qVal) dominated = true // p is strictly better (minimize)
    }
  }
  
  return dominated
}

/**
 * Perform non-dominated sorting
 * Returns array of fronts, where front[0] is the Pareto front
 */
function nonDominatedSort(
  population: Individual[],
  directions: ('maximize' | 'minimize')[]
): Individual[][] {
  const fronts: Individual[][] = []
  const dominationCount: Map<string, number> = new Map()
  const dominatedSet: Map<string, Set<string>> = new Map()
  
  // Initialize
  for (const p of population) {
    dominationCount.set(p.id, 0)
    dominatedSet.set(p.id, new Set())
  }
  
  // Calculate domination counts
  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      const p = population[i]
      const q = population[j]
      
      if (dominates(p, q, directions)) {
        dominatedSet.get(p.id)!.add(q.id)
        dominationCount.set(q.id, dominationCount.get(q.id)! + 1)
      } else if (dominates(q, p, directions)) {
        dominatedSet.get(q.id)!.add(p.id)
        dominationCount.set(p.id, dominationCount.get(p.id)! + 1)
      }
    }
  }
  
  // Find first front (non-dominated individuals)
  const firstFront = population.filter(p => dominationCount.get(p.id) === 0)
  fronts.push(firstFront)
  
  // Find subsequent fronts
  let currentFront = firstFront
  while (currentFront.length > 0) {
    const nextFront: Individual[] = []
    
    for (const p of currentFront) {
      for (const qId of dominatedSet.get(p.id)!) {
        const count = dominationCount.get(qId)! - 1
        dominationCount.set(qId, count)
        
        if (count === 0) {
          const q = population.find(ind => ind.id === qId)
          if (q) nextFront.push(q)
        }
      }
    }
    
    if (nextFront.length > 0) {
      fronts.push(nextFront)
    }
    currentFront = nextFront
  }
  
  // Assign ranks to individuals
  for (let rank = 0; rank < fronts.length; rank++) {
    for (const ind of fronts[rank]) {
      ind.rank = rank
    }
  }
  
  return fronts
}

// ============================================================================
// CROWDING DISTANCE
// ============================================================================

/**
 * Calculate crowding distance for individuals in a front
 * Higher crowding distance = more diverse solution
 */
function calculateCrowdingDistance(
  front: Individual[],
  directions: ('maximize' | 'minimize')[]
): void {
  if (front.length === 0) return
  
  const n = front.length
  const m = front[0].objectives.length
  
  // Initialize crowding distances
  for (const ind of front) {
    ind.crowdingDistance = 0
  }
  
  // For each objective
  for (let obj = 0; obj < m; obj++) {
    // Sort by objective value
    const sorted = [...front].sort((a, b) => {
      const dir = directions[obj] || 'maximize'
      return dir === 'maximize' 
        ? a.objectives[obj] - b.objectives[obj]
        : b.objectives[obj] - a.objectives[obj]
    })
    
    // Boundary individuals get infinite distance
    sorted[0].crowdingDistance = Infinity
    sorted[n - 1].crowdingDistance = Infinity
    
    // Calculate crowding distance for middle individuals
    const objMin = sorted[0].objectives[obj]
    const objMax = sorted[n - 1].objectives[obj]
    const range = Math.abs(objMax - objMin)
    
    if (range > 0) {
      for (let i = 1; i < n - 1; i++) {
        const distance = Math.abs(sorted[i + 1].objectives[obj] - sorted[i - 1].objectives[obj])
        sorted[i].crowdingDistance = (sorted[i].crowdingDistance || 0) + distance / range
      }
    }
  }
}

// ============================================================================
// SELECTION OPERATORS FOR NSGA-II
// ============================================================================

/**
 * Crowded tournament selection
 * Select individual with:
 * 1. Lower (better) rank, or
 * 2. Higher crowding distance if same rank
 */
function crowdedTournamentSelection(
  population: Individual[],
  tournamentSize: number = 2
): Individual {
  const candidates: Individual[] = []
  
  for (let i = 0; i < tournamentSize; i++) {
    const idx = randomInt(0, population.length - 1)
    candidates.push(population[idx])
  }
  
  // Sort by rank (ascending), then by crowding distance (descending)
  candidates.sort((a, b) => {
    if (a.rank !== b.rank) {
      return (a.rank || Infinity) - (b.rank || Infinity)
    }
    return (b.crowdingDistance || 0) - (a.crowdingDistance || 0)
  })
  
  return candidates[0]
}

// ============================================================================
// HYPERVOLUME CALCULATION
// ============================================================================

/**
 * Calculate hypervolume indicator
 * Measures the volume of objective space dominated by the Pareto front
 */
function calculateHypervolume(
  front: Individual[],
  referencePoint: number[],
  directions: ('maximize' | 'minimize')[]
): number {
  if (front.length === 0) return 0
  
  // Convert all objectives to maximization problem
  const normalizedFront = front.map(ind => 
    ind.objectives.map((val, i) => 
      directions[i] === 'minimize' ? -val : val
    )
  )
  
  const normalizedRef = referencePoint.map((val, i) =>
    directions[i] === 'minimize' ? -val : val
  )
  
  // Simple 2D hypervolume calculation (for higher dimensions, use more sophisticated algorithms)
  const m = normalizedFront[0].length
  
  if (m === 2) {
    // Sort by first objective
    const sorted = [...normalizedFront].sort((a, b) => b[0] - a[0])
    
    let volume = 0
    let prevX = normalizedRef[0]
    
    for (const point of sorted) {
      if (point[0] > normalizedRef[0] && point[1] > normalizedRef[1]) {
        const dx = Math.max(0, prevX - point[0])
        const dy = Math.max(0, point[1] - normalizedRef[1])
        volume += dx * dy
        prevX = point[0]
      }
    }
    
    return volume
  }
  
  // For higher dimensions, use Monte Carlo approximation
  return calculateHypervolumeMonteCarlo(normalizedFront, normalizedRef)
}

/**
 * Monte Carlo hypervolume approximation for higher dimensions
 */
function calculateHypervolumeMonteCarlo(
  front: number[][],
  referencePoint: number[],
  samples: number = 10000
): number {
  if (front.length === 0) return 0
  
  const m = referencePoint.length
  const mins: number[] = []
  const maxs: number[] = []
  
  // Find bounding box
  for (let i = 0; i < m; i++) {
    const objValues = front.map(p => p[i])
    mins.push(Math.min(...objValues, referencePoint[i]))
    maxs.push(Math.max(...objValues, referencePoint[i]))
  }
  
  // Calculate bounding box volume
  let boundingVolume = 1
  for (let i = 0; i < m; i++) {
    boundingVolume *= maxs[i] - mins[i]
  }
  
  // Monte Carlo sampling
  let dominatedSamples = 0
  for (let s = 0; s < samples; s++) {
    const point: number[] = []
    for (let i = 0; i < m; i++) {
      point.push(mins[i] + Math.random() * (maxs[i] - mins[i]))
    }
    
    // Check if point is dominated by any solution
    for (const solution of front) {
      let dominated = true
      for (let i = 0; i < m; i++) {
        if (point[i] > solution[i]) {
          dominated = false
          break
        }
      }
      if (dominated) {
        dominatedSamples++
        break
      }
    }
  }
  
  return boundingVolume * (dominatedSamples / samples)
}

// ============================================================================
// NSGA-II ENGINE
// ============================================================================

export class NSGA2Engine {
  private config: NSGA2Config
  private population: Population | null = null
  private fitnessFunction: MultiObjectiveFitnessFunction
  private history: { generation: number; hypervolume: number; paretoSize: number }[] = []
  private startTime: number = 0
  private evaluations: number = 0
  private directions: ('maximize' | 'minimize')[]

  constructor(
    config: Partial<NSGA2Config> & { 
      chromosomeTemplate: Chromosome
      objectiveCount: number 
    },
    fitnessFunction: MultiObjectiveFitnessFunction
  ) {
    this.config = {
      ...DEFAULT_GA_CONFIG,
      ...config,
      multiObjective: true,
      objectiveCount: config.objectiveCount,
    } as NSGA2Config
    
    this.fitnessFunction = fitnessFunction
    this.directions = config.objectiveDirections || 
      Array(config.objectiveCount).fill('maximize')
  }

  /**
   * Create a random chromosome
   */
  private createRandomChromosome(template: Chromosome): Chromosome {
    return template.map(gene => ({
      ...gene,
      value: gene.type === 'categorical' && gene.categories
        ? randomInt(0, gene.categories.length - 1)
        : randomInRange(gene.min, gene.max),
    }))
  }

  /**
   * Initialize population
   */
  initialize(): void {
    const individuals: Individual[] = []
    
    for (let i = 0; i < this.config.populationSize; i++) {
      const chromosome = this.createRandomChromosome(this.config.chromosomeTemplate)
      individuals.push({
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
      })
    }
    
    this.population = {
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
    
    this.history = []
    this.evaluations = 0
    this.startTime = Date.now()
  }

  /**
   * Evaluate objectives for all individuals
   */
  async evaluateObjectives(): Promise<void> {
    if (!this.population) return

    const context: FitnessContext = {
      generation: this.population.generation,
      maxGenerations: this.config.termination.maxGenerations,
      populationStats: this.population.stats,
    }

    for (const individual of this.population.individuals) {
      const objectives = await this.fitnessFunction(individual.chromosome, context)
      individual.objectives = objectives
      
      // Calculate aggregate fitness for compatibility
      individual.fitness = this.calculateAggregateFitness(objectives)
      
      individual.history.fitnessHistory.push(individual.fitness)
      individual.history.bestFitness = Math.max(individual.history.bestFitness, individual.fitness)
      individual.history.avgFitness = 
        individual.history.fitnessHistory.reduce((a, b) => a + b, 0) / 
        individual.history.fitnessHistory.length
      
      this.evaluations++
    }
  }

  /**
   * Calculate aggregate fitness from objectives (weighted sum)
   */
  private calculateAggregateFitness(objectives: number[]): number {
    return objectives.reduce((sum, obj, i) => {
      const dir = this.directions[i] || 'maximize'
      return sum + (dir === 'maximize' ? obj : -obj)
    }, 0)
  }

  /**
   * Perform non-dominated sorting and calculate crowding distances
   */
  private performSorting(): Individual[][] {
    if (!this.population) return []
    
    const fronts = nonDominatedSort(this.population.individuals, this.directions)
    
    for (const front of fronts) {
      calculateCrowdingDistance(front, this.directions)
    }
    
    return fronts
  }

  /**
   * Create offspring through selection, crossover, and mutation
   */
  private createOffspring(): Individual[] {
    if (!this.population) return []
    
    const offspring: Individual[] = []
    const { rate: crossoverRate, method, blendAlpha, sbxDistributionIndex } = this.config.operators.crossover
    const { rate: mutationRate, strength, method: mutationMethod } = this.config.operators.mutation
    
    while (offspring.length < this.config.populationSize) {
      // Selection
      const parent1 = crowdedTournamentSelection(this.population.individuals, 2)
      const parent2 = crowdedTournamentSelection(this.population.individuals, 2)
      
      // Crossover
      let child1Chromosome: Chromosome
      let child2Chromosome: Chromosome
      
      if (Math.random() < crossoverRate) {
        [child1Chromosome, child2Chromosome] = this.crossover(
          parent1.chromosome, 
          parent2.chromosome,
          method,
          blendAlpha,
          sbxDistributionIndex
        )
      } else {
        child1Chromosome = parent1.chromosome.map(g => ({ ...g }))
        child2Chromosome = parent2.chromosome.map(g => ({ ...g }))
      }
      
      // Mutation
      child1Chromosome = this.mutate(child1Chromosome, mutationMethod, mutationRate, strength)
      child2Chromosome = this.mutate(child2Chromosome, mutationMethod, mutationRate, strength)
      
      // Create children
      offspring.push({
        id: generateId(),
        chromosome: child1Chromosome,
        fitness: -Infinity,
        objectives: [],
        age: 0,
        history: { fitnessHistory: [], bestFitness: -Infinity, avgFitness: 0 },
      })
      
      if (offspring.length < this.config.populationSize) {
        offspring.push({
          id: generateId(),
          chromosome: child2Chromosome,
          fitness: -Infinity,
          objectives: [],
          age: 0,
          history: { fitnessHistory: [], bestFitness: -Infinity, avgFitness: 0 },
        })
      }
    }
    
    return offspring
  }

  /**
   * Crossover operation
   */
  private crossover(
    p1: Chromosome,
    p2: Chromosome,
    method: string,
    blendAlpha?: number,
    sbxDistIndex?: number
  ): [Chromosome, Chromosome] {
    switch (method) {
      case 'blend':
        return this.blendCrossover(p1, p2, blendAlpha || 0.5)
      case 'sbx':
        return this.sbxCrossover(p1, p2, sbxDistIndex || 2)
      case 'two-point':
        return this.twoPointCrossover(p1, p2)
      case 'uniform':
        return this.uniformCrossover(p1, p2)
      default:
        return this.singlePointCrossover(p1, p2)
    }
  }

  private singlePointCrossover(p1: Chromosome, p2: Chromosome): [Chromosome, Chromosome] {
    const point = randomInt(1, p1.length - 2)
    return [
      [...p1.slice(0, point).map(g => ({ ...g })), ...p2.slice(point).map(g => ({ ...g }))],
      [...p2.slice(0, point).map(g => ({ ...g })), ...p1.slice(point).map(g => ({ ...g }))],
    ]
  }

  private twoPointCrossover(p1: Chromosome, p2: Chromosome): [Chromosome, Chromosome] {
    let point1 = randomInt(1, p1.length - 2)
    let point2 = randomInt(1, p1.length - 2)
    if (point1 > point2) [point1, point2] = [point2, point1]
    
    return [
      [...p1.slice(0, point1).map(g => ({ ...g })), ...p2.slice(point1, point2).map(g => ({ ...g })), ...p1.slice(point2).map(g => ({ ...g }))],
      [...p2.slice(0, point1).map(g => ({ ...g })), ...p1.slice(point1, point2).map(g => ({ ...g })), ...p2.slice(point2).map(g => ({ ...g }))],
    ]
  }

  private uniformCrossover(p1: Chromosome, p2: Chromosome): [Chromosome, Chromosome] {
    const c1: Chromosome = []
    const c2: Chromosome = []
    
    for (let i = 0; i < p1.length; i++) {
      if (Math.random() < 0.5) {
        c1.push({ ...p2[i] })
        c2.push({ ...p1[i] })
      } else {
        c1.push({ ...p1[i] })
        c2.push({ ...p2[i] })
      }
    }
    
    return [c1, c2]
  }

  private blendCrossover(p1: Chromosome, p2: Chromosome, alpha: number): [Chromosome, Chromosome] {
    const c1: Chromosome = []
    const c2: Chromosome = []
    
    for (let i = 0; i < p1.length; i++) {
      if (p1[i].type === 'continuous') {
        const min = Math.min(p1[i].value, p2[i].value)
        const max = Math.max(p1[i].value, p2[i].value)
        const range = max - min
        
        c1.push({ ...p1[i], value: clamp(randomInRange(min - alpha * range, max + alpha * range), p1[i].min, p1[i].max) })
        c2.push({ ...p2[i], value: clamp(randomInRange(min - alpha * range, max + alpha * range), p2[i].min, p2[i].max) })
      } else {
        if (Math.random() < 0.5) {
          c1.push({ ...p1[i] })
          c2.push({ ...p2[i] })
        } else {
          c1.push({ ...p2[i] })
          c2.push({ ...p1[i] })
        }
      }
    }
    
    return [c1, c2]
  }

  private sbxCrossover(p1: Chromosome, p2: Chromosome, eta: number): [Chromosome, Chromosome] {
    const c1: Chromosome = []
    const c2: Chromosome = []
    
    for (let i = 0; i < p1.length; i++) {
      if (p1[i].type === 'continuous' && Math.abs(p1[i].value - p2[i].value) > 1e-10) {
        const y1 = Math.min(p1[i].value, p2[i].value)
        const y2 = Math.max(p1[i].value, p2[i].value)
        const rand = Math.random()
        const beta = rand <= 0.5
          ? Math.pow(2 * rand, 1 / (eta + 1))
          : Math.pow(1 / (2 * (1 - rand)), 1 / (eta + 1))
        
        c1.push({ ...p1[i], value: clamp(0.5 * ((y1 + y2) - beta * (y2 - y1)), p1[i].min, p1[i].max) })
        c2.push({ ...p2[i], value: clamp(0.5 * ((y1 + y2) + beta * (y2 - y1)), p2[i].min, p2[i].max) })
      } else {
        c1.push({ ...p1[i] })
        c2.push({ ...p2[i] })
      }
    }
    
    return [c1, c2]
  }

  /**
   * Mutation operation
   */
  private mutate(
    chromosome: Chromosome,
    method: string,
    rate: number,
    strength: number
  ): Chromosome {
    return chromosome.map(gene => {
      if (Math.random() > rate) return gene
      
      if (gene.type === 'continuous') {
        if (method === 'polynomial') {
          const rand = Math.random()
          const delta = rand < 0.5
            ? Math.pow(2 * rand, 1 / 21) - 1
            : 1 - Math.pow(2 * (1 - rand), 1 / 21)
          return { ...gene, value: clamp(gene.value + delta * (gene.max - gene.min), gene.min, gene.max) }
        }
        const range = gene.max - gene.min
        const mutation = gaussianRandom(0, strength * range)
        return { ...gene, value: clamp(gene.value + mutation, gene.min, gene.max) }
      } else if (gene.type === 'discrete') {
        const range = gene.max - gene.min
        const mutation = Math.round(gaussianRandom(0, strength * range))
        return { ...gene, value: clamp(gene.value + mutation, gene.min, gene.max) }
      } else if (gene.categories) {
        return { ...gene, value: randomInt(0, gene.categories.length - 1) }
      }
      
      return gene
    })
  }

  /**
   * Check termination criteria
   */
  private checkTermination(): { terminated: boolean; reason: string } {
    if (!this.population) {
      return { terminated: true, reason: 'Population not initialized' }
    }

    const { termination } = this.config

    if (this.population.generation >= termination.maxGenerations) {
      return { terminated: true, reason: 'Maximum generations reached' }
    }

    if (termination.timeLimit && Date.now() - this.startTime > termination.timeLimit) {
      return { terminated: true, reason: 'Time limit reached' }
    }

    return { terminated: false, reason: '' }
  }

  /**
   * Run NSGA-II optimization
   */
  async run(): Promise<NSGA2Result> {
    this.initialize()
    await this.evaluateObjectives()
    
    let terminated = false
    let reason = ''
    
    while (!terminated) {
      // Perform non-dominated sorting
      const fronts = this.performSorting()
      
      // Create offspring
      const offspring = this.createOffspring()
      
      // Evaluate offspring
      const context: FitnessContext = {
        generation: this.population!.generation,
        maxGenerations: this.config.termination.maxGenerations,
        populationStats: this.population!.stats,
      }
      
      for (const ind of offspring) {
        ind.objectives = await this.fitnessFunction(ind.chromosome, context)
        ind.fitness = this.calculateAggregateFitness(ind.objectives)
        this.evaluations++
      }
      
      // Combine parent and offspring populations
      const combinedPopulation = [...this.population!.individuals, ...offspring]
      
      // Perform non-dominated sorting on combined population
      const combinedFronts = nonDominatedSort(combinedPopulation, this.directions)
      
      // Select new population
      const newPopulation: Individual[] = []
      let frontIndex = 0
      
      while (newPopulation.length + combinedFronts[frontIndex].length <= this.config.populationSize) {
        calculateCrowdingDistance(combinedFronts[frontIndex], this.directions)
        newPopulation.push(...combinedFronts[frontIndex])
        frontIndex++
        
        if (frontIndex >= combinedFronts.length) break
      }
      
      // Fill remaining spots from next front
      if (newPopulation.length < this.config.populationSize && frontIndex < combinedFronts.length) {
        calculateCrowdingDistance(combinedFronts[frontIndex], this.directions)
        const sortedByCrowding = [...combinedFronts[frontIndex]].sort(
          (a, b) => (b.crowdingDistance || 0) - (a.crowdingDistance || 0)
        )
        
        const remaining = this.config.populationSize - newPopulation.length
        newPopulation.push(...sortedByCrowding.slice(0, remaining))
      }
      
      // Update population
      this.population!.individuals = newPopulation
      this.population!.generation++
      
      // Calculate statistics
      const paretoFront = combinedFronts[0]
      const hypervolume = this.calculateCurrentHypervolume(paretoFront)
      
      this.history.push({
        generation: this.population!.generation,
        hypervolume,
        paretoSize: paretoFront.length,
      })
      
      // Logging
      if (this.config.verbose && this.population!.generation % (this.config.logInterval || 10) === 0) {
        console.log(
          `[NSGA-II] Gen ${this.population!.generation}: ` +
          `Pareto Front=${paretoFront.length}, ` +
          `Hypervolume=${hypervolume.toFixed(4)}`
        )
      }
      
      // Check termination
      const result = this.checkTermination()
      terminated = result.terminated
      reason = result.reason
    }
    
    // Final sorting
    const fronts = this.performSorting()
    const paretoFront = fronts[0]
    const hypervolume = this.calculateCurrentHypervolume(paretoFront)
    
    // Get best individual (from Pareto front, highest crowding distance)
    const best = paretoFront.reduce((best, ind) => 
      (ind.crowdingDistance || 0) > (best.crowdingDistance || 0) ? ind : best
    )
    
    return {
      success: true,
      bestIndividual: best,
      finalPopulation: this.population!,
      history: this.history.map(h => ({
        generation: h.generation,
        bestFitness: h.hypervolume,
        avgFitness: 0,
        diversity: 0,
      })),
      statistics: {
        totalEvaluations: this.evaluations,
        totalGenerations: this.population!.generation,
        elapsedMs: Date.now() - this.startTime,
      },
      message: reason,
      paretoFront,
      paretoFronts: fronts,
      hypervolume,
      objectiveValues: paretoFront.map(ind => {
        const values: Record<string, number> = {}
        const names = this.config.objectiveNames || []
        ind.objectives.forEach((obj, i) => {
          values[names[i] || `objective_${i}`] = obj
        })
        return values
      }),
    }
  }

  /**
   * Calculate hypervolume for current Pareto front
   */
  private calculateCurrentHypervolume(front: Individual[]): number {
    if (front.length === 0) return 0
    
    // Estimate reference point from objective values
    const m = front[0].objectives.length
    const referencePoint: number[] = []
    
    for (let i = 0; i < m; i++) {
      const values = front.map(ind => ind.objectives[i])
      const dir = this.directions[i]
      
      if (dir === 'maximize') {
        referencePoint.push(Math.min(...values) - 1)
      } else {
        referencePoint.push(Math.max(...values) + 1)
      }
    }
    
    return calculateHypervolume(front, referencePoint, this.directions)
  }

  /**
   * Get Pareto front
   */
  getParetoFront(): Individual[] {
    if (!this.population) return []
    const fronts = nonDominatedSort(this.population.individuals, this.directions)
    return fronts[0]
  }

  /**
   * Get current population
   */
  getPopulation(): Population | null {
    return this.population
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create NSGA-II optimizer for trading strategy
 */
export function createNSGA2Optimizer(
  config: Partial<NSGA2Config> & {
    chromosomeTemplate: Chromosome
    objectiveCount: number
  },
  fitnessFunction: MultiObjectiveFitnessFunction
): NSGA2Engine {
  return new NSGA2Engine(config, fitnessFunction)
}

/**
 * Convert multi-objective result to single objective (for compatibility)
 */
export function selectBestFromPareto(
  front: Individual[],
  weights: number[]
): Individual {
  return front.reduce((best, ind) => {
    const bestScore = best.objectives.reduce((sum, obj, i) => sum + obj * (weights[i] || 1), 0)
    const indScore = ind.objectives.reduce((sum, obj, i) => sum + obj * (weights[i] || 1), 0)
    return indScore > bestScore ? ind : best
  })
}

export {
  nonDominatedSort,
  calculateCrowdingDistance,
  calculateHypervolume,
  dominates,
}
