/**
 * Genetic Algorithm Framework for Bot Optimization
 * Stage 2.1: Модернизация алгоритмов и ботов
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Gene<T = number | string | boolean> {
  name: string
  value: T
  min?: number
  max?: number
  options?: string[]
  type: 'numeric' | 'categorical' | 'boolean'
  mutationStrength?: number
}

export interface Chromosome {
  id: string
  botType: string
  genes: Gene[]
  fitness: number
  generation: number
  stats: ChromosomeStats
}

export interface ChromosomeStats {
  trades: number
  pnl: number
  winRate: number
  sharpe: number
  maxDrawdown: number
  profitFactor: number
  avgTrade: number
  avgWin: number
  avgLoss: number
}

export interface GeneticConfig {
  populationSize: number
  generations: number
  mutationRate: number
  crossoverRate: number
  eliteCount: number
  tournamentSize: number
  parallelEvaluations: number
  earlyStoppingPatience: number
  earlyStoppingThreshold: number
  objectives: OptimizationObjective[]
}

export interface OptimizationObjective {
  name: string
  weight: number
  direction: 'maximize' | 'minimize'
  transform?: (value: number) => number
}

export interface OptimizationResult {
  bestChromosome: Chromosome
  bestParams: Record<string, number | string | boolean>
  fitness: number
  stats: ChromosomeStats
  history: GenerationStats[]
}

export interface GenerationStats {
  generation: number
  bestFitness: number
  avgFitness: number
  worstFitness: number
  diversity: number
  bestStats: ChromosomeStats
}

// ============================================================================
// BOT GENE DEFINITIONS
// ============================================================================

export const BOT_GENE_TEMPLATES: Record<string, Gene[]> = {
  grid: [
    { name: 'gridSpacing', value: 0.02, min: 0.005, max: 0.05, type: 'numeric', mutationStrength: 0.2 },
    { name: 'gridCount', value: 20, min: 5, max: 50, type: 'numeric', mutationStrength: 0.15 },
    { name: 'tpPercent', value: 0.015, min: 0.005, max: 0.05, type: 'numeric', mutationStrength: 0.2 },
    { name: 'trailingGrid', value: false, type: 'boolean' },
    { name: 'adaptiveSpacing', value: true, type: 'boolean' },
  ],
  dca: [
    { name: 'entryCount', value: 5, min: 2, max: 10, type: 'numeric', mutationStrength: 0.2 },
    { name: 'entryStep', value: 0.02, min: 0.005, max: 0.05, type: 'numeric', mutationStrength: 0.2 },
    { name: 'tpPerLevel', value: true, type: 'boolean' },
    { name: 'tpPercent', value: 0.02, min: 0.01, max: 0.05, type: 'numeric', mutationStrength: 0.2 },
    { name: 'safetyOrders', value: 2, min: 0, max: 5, type: 'numeric', mutationStrength: 0.25 },
  ],
  bb: [
    { name: 'period', value: 20, min: 10, max: 30, type: 'numeric', mutationStrength: 0.15 },
    { name: 'stdDev', value: 2.0, min: 1.5, max: 3.0, type: 'numeric', mutationStrength: 0.2 },
    { name: 'stochPeriod', value: 14, min: 7, max: 21, type: 'numeric', mutationStrength: 0.2 },
    { name: 'useMtfConfirmation', value: true, type: 'boolean' },
  ],
  argus: [
    { name: 'volumeThreshold', value: 3.0, min: 2.0, max: 10.0, type: 'numeric', mutationStrength: 0.25 },
    { name: 'priceThreshold', value: 0.03, min: 0.01, max: 0.10, type: 'numeric', mutationStrength: 0.25 },
    { name: 'cooldownMinutes', value: 60, min: 30, max: 300, type: 'numeric', mutationStrength: 0.2 },
    { name: 'useOrderbookAnalysis', value: true, type: 'boolean' },
  ],
  vision: [
    { name: 'lookbackPeriod', value: 100, min: 50, max: 200, type: 'numeric', mutationStrength: 0.2 },
    { name: 'confidence', value: 0.7, min: 0.6, max: 0.9, type: 'numeric', mutationStrength: 0.15 },
    { name: 'featureCount', value: 15, min: 5, max: 30, type: 'numeric', mutationStrength: 0.25 },
  ],
  orion: [
    { name: 'emaPeriod', value: 20, min: 5, max: 50, type: 'numeric', mutationStrength: 0.2 },
    { name: 'supertrendPeriod', value: 10, min: 5, max: 30, type: 'numeric', mutationStrength: 0.2 },
    { name: 'supertrendMult', value: 3.0, min: 1.5, max: 4.0, type: 'numeric', mutationStrength: 0.2 },
    { name: 'riskPerTrade', value: 0.02, min: 0.01, max: 0.05, type: 'numeric', mutationStrength: 0.25 },
  ],
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

function gaussianRandom(mean: number = 0, stdDev: number = 1): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ============================================================================
// GENETIC OPERATORS
// ============================================================================

export class GeneticOperators {
  static randomizeGene(template: Gene): Gene {
    const gene = { ...template }
    
    switch (gene.type) {
      case 'numeric':
        if (gene.min !== undefined && gene.max !== undefined) {
          gene.value = gene.min + Math.random() * (gene.max - gene.min)
        }
        break
      case 'categorical':
        if (gene.options && gene.options.length > 0) {
          gene.value = gene.options[Math.floor(Math.random() * gene.options.length)]
        }
        break
      case 'boolean':
        gene.value = Math.random() < 0.5
        break
    }
    return gene
  }

  static mutate(gene: Gene, rate: number): Gene {
    if (Math.random() >= rate) return { ...gene }

    const mutated = { ...gene }
    switch (gene.type) {
      case 'numeric':
        if (gene.min !== undefined && gene.max !== undefined) {
          const range = gene.max - gene.min
          const strength = gene.mutationStrength || 0.1
          const mutation = gaussianRandom(0, range * strength)
          mutated.value = clamp((gene.value as number) + mutation, gene.min, gene.max)
        }
        break
      case 'categorical':
        if (gene.options && gene.options.length > 1) {
          const currentIdx = gene.options.indexOf(gene.value as string)
          let newIdx = Math.floor(Math.random() * gene.options.length)
          if (newIdx === currentIdx) newIdx = (newIdx + 1) % gene.options.length
          mutated.value = gene.options[newIdx]
        }
        break
      case 'boolean':
        mutated.value = !gene.value
        break
    }
    return mutated
  }

  static crossover(parent1: Chromosome, parent2: Chromosome): [Chromosome, Chromosome] {
    const child1: Chromosome = {
      id: generateId(), botType: parent1.botType,
      genes: parent1.genes.map(g => ({ ...g })), fitness: 0,
      generation: Math.max(parent1.generation, parent2.generation) + 1,
      stats: { trades: 0, pnl: 0, winRate: 0, sharpe: 0, maxDrawdown: 0, profitFactor: 0, avgTrade: 0, avgWin: 0, avgLoss: 0 },
    }
    const child2: Chromosome = {
      id: generateId(), botType: parent2.botType,
      genes: parent2.genes.map(g => ({ ...g })), fitness: 0,
      generation: Math.max(parent1.generation, parent2.generation) + 1,
      stats: { trades: 0, pnl: 0, winRate: 0, sharpe: 0, maxDrawdown: 0, profitFactor: 0, avgTrade: 0, avgWin: 0, avgLoss: 0 },
    }

    const crossoverPoint = Math.floor(Math.random() * parent1.genes.length)
    for (let i = crossoverPoint; i < parent1.genes.length; i++) {
      child1.genes[i] = { ...parent2.genes[i] }
      child2.genes[i] = { ...parent1.genes[i] }
    }
    return [child1, child2]
  }
}

// ============================================================================
// FITNESS CALCULATOR
// ============================================================================

export class FitnessCalculator {
  private objectives: OptimizationObjective[]

  constructor(objectives: OptimizationObjective[]) {
    this.objectives = objectives
  }

  calculate(stats: ChromosomeStats): number {
    let fitness = 0
    for (const obj of this.objectives) {
      const rawValue = stats[obj.name as keyof ChromosomeStats] as number
      const transformed = obj.transform ? obj.transform(rawValue) : rawValue
      const contribution = obj.direction === 'maximize' ? transformed : -transformed
      fitness += obj.weight * contribution
    }
    return fitness
  }

  static getDefaultObjectives(): OptimizationObjective[] {
    return [
      { name: 'sharpe', weight: 0.3, direction: 'maximize' },
      { name: 'winRate', weight: 0.2, direction: 'maximize' },
      { name: 'maxDrawdown', weight: 0.2, direction: 'minimize', transform: (v) => 1 - v },
      { name: 'pnl', weight: 0.2, direction: 'maximize', transform: (v) => Math.log10(Math.abs(v) + 1) * Math.sign(v) },
      { name: 'trades', weight: 0.1, direction: 'maximize', transform: (v) => Math.log10(v + 1) },
    ]
  }
}

// ============================================================================
// GENETIC OPTIMIZER
// ============================================================================

export class GeneticOptimizer {
  private config: GeneticConfig
  private fitnessCalculator: FitnessCalculator
  private population: Chromosome[] = []
  private history: GenerationStats[] = []
  private bestChromosome: Chromosome | null = null
  private generationsWithoutImprovement = 0

  constructor(config: Partial<GeneticConfig> = {}) {
    this.config = {
      populationSize: 50, generations: 50, mutationRate: 0.1, crossoverRate: 0.8,
      eliteCount: 3, tournamentSize: 3, parallelEvaluations: 10,
      earlyStoppingPatience: 10, earlyStoppingThreshold: 0.001,
      objectives: FitnessCalculator.getDefaultObjectives(),
      ...config,
    }
    this.fitnessCalculator = new FitnessCalculator(this.config.objectives)
  }

  initializePopulation(botType: string, customGenes?: Gene[]): Chromosome[] {
    const template = customGenes || BOT_GENE_TEMPLATES[botType]
    if (!template) throw new Error(`No gene template for: ${botType}`)

    this.population = []
    for (let i = 0; i < this.config.populationSize; i++) {
      this.population.push({
        id: generateId(), botType,
        genes: template.map(g => GeneticOperators.randomizeGene(g)),
        fitness: 0, generation: 0,
        stats: { trades: 0, pnl: 0, winRate: 0, sharpe: 0, maxDrawdown: 0, profitFactor: 0, avgTrade: 0, avgWin: 0, avgLoss: 0 },
      })
    }
    return this.population
  }

  private select(): Chromosome {
    const tournament: Chromosome[] = []
    for (let i = 0; i < this.config.tournamentSize; i++) {
      tournament.push(this.population[Math.floor(Math.random() * this.population.length)])
    }
    return tournament.sort((a, b) => b.fitness - a.fitness)[0]
  }

  private calculateDiversity(): number {
    if (this.population.length < 2) return 0
    let totalDistance = 0, comparisons = 0
    for (let i = 0; i < this.population.length; i++) {
      for (let j = i + 1; j < this.population.length; j++) {
        let distance = 0
        for (let k = 0; k < this.population[i].genes.length; k++) {
          const g1 = this.population[i].genes[k], g2 = this.population[j].genes[k]
          if (g1.type === 'numeric' && g1.min !== undefined && g1.max !== undefined) {
            distance += Math.abs((g1.value as number) - (g2.value as number)) / (g1.max - g1.min)
          } else {
            distance += g1.value === g2.value ? 0 : 1
          }
        }
        totalDistance += distance / this.population[i].genes.length
        comparisons++
      }
    }
    return comparisons > 0 ? totalDistance / comparisons : 0
  }

  setFitness(chromosomeId: string, stats: ChromosomeStats): void {
    const chromosome = this.population.find(c => c.id === chromosomeId)
    if (chromosome) {
      chromosome.stats = stats
      chromosome.fitness = this.fitnessCalculator.calculate(stats)
    }
  }

  runGeneration(): Chromosome[] {
    this.population.sort((a, b) => b.fitness - a.fitness)
    if (!this.bestChromosome || this.population[0].fitness > this.bestChromosome.fitness) {
      this.bestChromosome = { ...this.population[0], genes: this.population[0].genes.map(g => ({ ...g })) }
      this.generationsWithoutImprovement = 0
    } else {
      this.generationsWithoutImprovement++
    }

    const avgFitness = this.population.reduce((s, c) => s + c.fitness, 0) / this.population.length
    this.history.push({
      generation: this.history.length,
      bestFitness: this.population[0].fitness,
      avgFitness,
      worstFitness: this.population[this.population.length - 1].fitness,
      diversity: this.calculateDiversity(),
      bestStats: { ...this.population[0].stats },
    })

    const newPopulation: Chromosome[] = []
    for (let i = 0; i < this.config.eliteCount; i++) {
      newPopulation.push({
        ...this.population[i], id: generateId(),
        genes: this.population[i].genes.map(g => ({ ...g })),
      })
    }

    while (newPopulation.length < this.config.populationSize) {
      const parent1 = this.select(), parent2 = this.select()
      if (Math.random() < this.config.crossoverRate) {
        const [child1, child2] = GeneticOperators.crossover(parent1, parent2)
        child1.genes = child1.genes.map(g => GeneticOperators.mutate(g, this.config.mutationRate))
        child2.genes = child2.genes.map(g => GeneticOperators.mutate(g, this.config.mutationRate))
        newPopulation.push(child1)
        if (newPopulation.length < this.config.populationSize) newPopulation.push(child2)
      } else {
        newPopulation.push({
          id: generateId(), botType: parent1.botType,
          genes: parent1.genes.map(g => GeneticOperators.mutate(g, this.config.mutationRate)),
          fitness: 0, generation: parent1.generation + 1,
          stats: { trades: 0, pnl: 0, winRate: 0, sharpe: 0, maxDrawdown: 0, profitFactor: 0, avgTrade: 0, avgWin: 0, avgLoss: 0 },
        })
      }
    }
    this.population = newPopulation
    return this.population
  }

  shouldStop(): boolean {
    return this.generationsWithoutImprovement >= this.config.earlyStoppingPatience
  }

  getChromosomesForEvaluation(): Chromosome[] {
    return this.population.filter(c => c.fitness === 0)
  }

  getBestResult(): OptimizationResult | null {
    if (!this.bestChromosome) return null
    const params: Record<string, number | string | boolean> = {}
    for (const gene of this.bestChromosome.genes) params[gene.name] = gene.value
    return {
      bestChromosome: this.bestChromosome, bestParams: params,
      fitness: this.bestChromosome.fitness, stats: this.bestChromosome.stats, history: this.history,
    }
  }

  getCurrentGeneration(): number { return this.history.length }
  getPopulation(): Chromosome[] { return this.population }
  getHistory(): GenerationStats[] { return this.history }
}

export { GeneticOptimizer as default }
