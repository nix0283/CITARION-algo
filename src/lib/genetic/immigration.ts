/**
 * CITARION Immigration Mechanism
 * 
 * Implements immigration strategies to maintain genetic diversity and prevent
 * premature convergence in genetic algorithm optimization.
 * 
 * CIT-029: Immigration mechanism for genetic diversity
 */

import {
  Individual,
  Population,
  Chromosome,
  ImmigrationConfig,
  DEFAULT_IMMIGRATION_CONFIG,
  generateId,
  randomInRange,
  randomInt,
  gaussianRandom,
  calculateDiversity,
} from './types'

// ============================================================================
// DIVERSITY METRICS
// ============================================================================

/**
 * Extended diversity metrics
 */
export interface DiversityMetrics {
  /** Average gene diversity across population */
  geneDiversity: number
  
  /** Unique chromosome count */
  uniqueCount: number
  
  /** Percentage of unique individuals */
  uniquenessRatio: number
  
  /** Average hamming distance between individuals */
  avgHammingDistance: number
  
  /** Fitness diversity (standard deviation) */
  fitnessDiversity: number
  
  /** Gene-wise diversity breakdown */
  geneDiversityBreakdown: number[]
}

/**
 * Calculate comprehensive diversity metrics
 */
export function calculateDiversityMetrics(population: Individual[]): DiversityMetrics {
  if (population.length === 0) {
    return {
      geneDiversity: 0,
      uniqueCount: 0,
      uniquenessRatio: 0,
      avgHammingDistance: 0,
      fitnessDiversity: 0,
      geneDiversityBreakdown: [],
    }
  }

  const geneCount = population[0].chromosome.length
  
  // Calculate unique chromosomes
  const chromosomeStrings = population.map(ind => 
    ind.chromosome.map(g => g.value.toFixed(4)).join(',')
  )
  const uniqueChromosomes = new Set(chromosomeStrings)
  
  // Calculate gene-wise diversity
  const geneDiversityBreakdown: number[] = []
  
  for (let i = 0; i < geneCount; i++) {
    const values = population.map(ind => ind.chromosome[i].value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = population[0].chromosome[i].max - population[0].chromosome[i].min
    
    // Normalized diversity for this gene
    const diversity = range > 0 ? (max - min) / range : 0
    geneDiversityBreakdown.push(diversity)
  }
  
  // Average gene diversity
  const geneDiversity = geneDiversityBreakdown.reduce((a, b) => a + b, 0) / geneCount
  
  // Calculate hamming distances (for discrete values)
  let totalHammingDistance = 0
  let comparisons = 0
  
  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      let distance = 0
      for (let k = 0; k < geneCount; k++) {
        const diff = Math.abs(population[i].chromosome[k].value - population[j].chromosome[k].value)
        const range = population[0].chromosome[k].max - population[0].chromosome[k].min
        distance += range > 0 ? diff / range : 0
      }
      totalHammingDistance += distance / geneCount
      comparisons++
    }
  }
  
  const avgHammingDistance = comparisons > 0 ? totalHammingDistance / comparisons : 0
  
  // Fitness diversity
  const fitnesses = population.map(ind => ind.fitness)
  const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length
  const fitnessVariance = fitnesses.reduce((sum, f) => sum + Math.pow(f - avgFitness, 2), 0) / fitnesses.length
  const fitnessDiversity = Math.sqrt(fitnessVariance)

  return {
    geneDiversity,
    uniqueCount: uniqueChromosomes.size,
    uniquenessRatio: uniqueChromosomes.size / population.length,
    avgHammingDistance,
    fitnessDiversity,
    geneDiversityBreakdown,
  }
}

/**
 * Check if diversity is too low
 */
export function isDiversityLow(
  population: Individual[],
  threshold: number = 0.05
): boolean {
  const diversity = calculateDiversity(population)
  return diversity < threshold
}

// ============================================================================
// IMMIGRATION STRATEGIES
// ============================================================================

/**
 * Create random immigrant
 */
export function createRandomImmigrant(template: Chromosome): Individual {
  const chromosome: Chromosome = template.map(gene => ({
    ...gene,
    value: gene.type === 'categorical' && gene.categories
      ? randomInt(0, gene.categories.length - 1)
      : randomInRange(gene.min, gene.max),
  }))

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
 * Create diverse immigrant (maximally different from population)
 */
export function createDiverseImmigrant(
  template: Chromosome,
  population: Individual[]
): Individual {
  if (population.length === 0) {
    return createRandomImmigrant(template)
  }

  // Calculate mean chromosome values
  const means: number[] = template.map((_, geneIndex) => {
    const sum = population.reduce((acc, ind) => acc + ind.chromosome[geneIndex].value, 0)
    return sum / population.length
  })

  // Create immigrant with values furthest from mean
  const chromosome: Chromosome = template.map((gene, geneIndex) => {
    const mean = means[geneIndex]
    const midPoint = (gene.min + gene.max) / 2
    
    // Choose value furthest from mean
    let value: number
    if (Math.abs(gene.min - mean) > Math.abs(gene.max - mean)) {
      value = gene.min
    } else {
      value = gene.max
    }
    
    // Add some randomness
    const range = gene.max - gene.min
    value = value + gaussianRandom(0, range * 0.1)
    value = Math.max(gene.min, Math.min(gene.max, value))
    
    return { ...gene, value }
  })

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
 * Create hybrid immigrant (combines random and diverse)
 */
export function createHybridImmigrant(
  template: Chromosome,
  population: Individual[],
  randomRatio: number = 0.5
): Individual {
  if (population.length === 0 || Math.random() < randomRatio) {
    return createRandomImmigrant(template)
  }
  return createDiverseImmigrant(template, population)
}

/**
 * Create immigrant based on strategy
 */
export function createImmigrant(
  template: Chromosome,
  population: Individual[],
  strategy: 'random' | 'diverse' | 'hybrid' = 'diverse'
): Individual {
  switch (strategy) {
    case 'random':
      return createRandomImmigrant(template)
    case 'diverse':
      return createDiverseImmigrant(template, population)
    case 'hybrid':
    default:
      return createHybridImmigrant(template, population)
  }
}

// ============================================================================
// IMMIGRATION MANAGER
// ============================================================================

/**
 * Immigration manager for maintaining genetic diversity
 */
export class ImmigrationManager {
  private config: ImmigrationConfig
  private template: Chromosome
  private lastImmigrationGeneration: number = 0
  private immigrationHistory: {
    generation: number
    count: number
    diversityBefore: number
    diversityAfter: number
  }[] = []

  constructor(template: Chromosome, config: Partial<ImmigrationConfig> = {}) {
    this.template = template
    this.config = { ...DEFAULT_IMMIGRATION_CONFIG, ...config }
  }

  /**
   * Check if immigration should be applied
   */
  shouldImmigrate(generation: number, diversity: number): boolean {
    if (!this.config.enabled) return false

    // Check interval
    if (generation - this.lastImmigrationGeneration < this.config.interval) {
      return false
    }

    // Check diversity threshold
    if (this.config.diversityThreshold && diversity >= this.config.diversityThreshold) {
      return false
    }

    return true
  }

  /**
   * Apply immigration to population
   */
  applyImmigration(
    population: Individual[],
    generation: number
  ): { population: Individual[]; immigrantsAdded: number } {
    const diversityBefore = calculateDiversity(population)
    
    if (!this.shouldImmigrate(generation, diversityBefore)) {
      return { population, immigrantsAdded: 0 }
    }

    // Sort by fitness to identify elites
    const sorted = [...population].sort((a, b) => b.fitness - a.fitness)
    
    // Identify individuals to replace (worst performers, excluding elites)
    const eliteCount = Math.min(this.config.preserveElites, population.length)
    const replaceableCount = Math.floor(population.length * this.config.rate)
    const replaceStart = population.length - replaceableCount
    
    // Create immigrants
    const immigrants: Individual[] = []
    for (let i = 0; i < replaceableCount; i++) {
      const immigrant = createImmigrant(this.template, sorted.slice(0, eliteCount), this.config.strategy)
      immigrants.push(immigrant)
    }

    // Replace worst performers with immigrants
    const newPopulation = [
      ...sorted.slice(0, replaceStart),
      ...immigrants,
    ]

    const diversityAfter = calculateDiversity(newPopulation)
    
    // Record history
    this.immigrationHistory.push({
      generation,
      count: immigrants.length,
      diversityBefore,
      diversityAfter,
    })
    
    this.lastImmigrationGeneration = generation

    return {
      population: newPopulation,
      immigrantsAdded: immigrants.length,
    }
  }

  /**
   * Get immigration history
   */
  getHistory(): typeof this.immigrationHistory {
    return [...this.immigrationHistory]
  }

  /**
   * Get last immigration generation
   */
  getLastImmigrationGeneration(): number {
    return this.lastImmigrationGeneration
  }

  /**
   * Reset immigration state
   */
  reset(): void {
    this.lastImmigrationGeneration = 0
    this.immigrationHistory = []
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ImmigrationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get configuration
   */
  getConfig(): ImmigrationConfig {
    return { ...this.config }
  }
}

// ============================================================================
// ADAPTIVE IMMIGRATION
// ============================================================================

/**
 * Adaptive immigration that adjusts rate based on diversity
 */
export class AdaptiveImmigrationManager extends ImmigrationManager {
  private baseRate: number
  private maxRate: number
  private diversityThresholds: { low: number; critical: number }

  constructor(
    template: Chromosome,
    config: Partial<ImmigrationConfig> & {
      maxRate?: number
      diversityThresholds?: { low: number; critical: number }
    } = {}
  ) {
    super(template, config)
    this.baseRate = config.rate || 0.1
    this.maxRate = config.maxRate || 0.3
    this.diversityThresholds = config.diversityThresholds || {
      low: 0.1,
      critical: 0.05,
    }
  }

  /**
   * Calculate adaptive immigration rate
   */
  calculateAdaptiveRate(diversity: number): number {
    const { low, critical } = this.diversityThresholds

    if (diversity >= low) {
      return this.baseRate
    }

    if (diversity <= critical) {
      return this.maxRate
    }

    // Linear interpolation
    const ratio = (low - diversity) / (low - critical)
    return this.baseRate + ratio * (this.maxRate - this.baseRate)
  }

  /**
   * Apply adaptive immigration
   */
  applyAdaptiveImmigration(
    population: Individual[],
    generation: number
  ): { population: Individual[]; immigrantsAdded: number; adaptedRate: number } {
    const diversity = calculateDiversity(population)
    const adaptedRate = this.calculateAdaptiveRate(diversity)
    
    // Temporarily update rate
    const originalRate = this.getConfig().rate
    this.updateConfig({ rate: adaptedRate })
    
    const result = this.applyImmigration(population, generation)
    
    // Restore base rate
    this.updateConfig({ rate: originalRate })

    return {
      ...result,
      adaptedRate,
    }
  }
}

// ============================================================================
// DIVERSITY PRESERVATION UTILITIES
// ============================================================================

/**
 * Remove duplicate individuals
 */
export function removeDuplicates(
  population: Individual[],
  template: Chromosome
): { population: Individual[]; removedCount: number } {
  const seen = new Set<string>()
  const unique: Individual[] = []

  for (const ind of population) {
    const key = ind.chromosome.map(g => g.value.toFixed(6)).join(',')
    
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(ind)
    }
  }

  // Fill removed slots with random immigrants
  const removedCount = population.length - unique.length
  while (unique.length < population.length) {
    unique.push(createRandomImmigrant(template))
  }

  return {
    population: unique,
    removedCount,
  }
}

/**
 * Apply niche sharing (fitness sharing)
 */
export function applyNicheSharing(
  population: Individual[],
  sigmaShare: number = 0.1
): Individual[] {
  const n = population.length
  
  // Calculate shared fitness for each individual
  return population.map(ind => {
    let nicheCount = 0
    
    for (const other of population) {
      const distance = calculateChromosomeDistance(ind.chromosome, other.chromosome)
      const share = distance < sigmaShare ? 1 - distance / sigmaShare : 0
      nicheCount += share
    }
    
    // Shared fitness
    const sharedFitness = nicheCount > 1 ? ind.fitness / nicheCount : ind.fitness
    
    return {
      ...ind,
      fitness: sharedFitness,
    }
  })
}

/**
 * Calculate distance between two chromosomes
 */
export function calculateChromosomeDistance(c1: Chromosome, c2: Chromosome): number {
  let totalDistance = 0
  
  for (let i = 0; i < c1.length; i++) {
    const range = c1[i].max - c1[i].min
    const diff = Math.abs(c1[i].value - c2[i].value)
    totalDistance += range > 0 ? diff / range : 0
  }
  
  return totalDistance / c1.length
}

/**
 * Find crowded regions in the search space
 */
export function findCrowdedRegions(
  population: Individual[],
  numRegions: number = 5
): { center: number[]; count: number }[] {
  if (population.length === 0) return []

  const geneCount = population[0].chromosome.length
  
  // Simple k-means-like clustering
  const regions: { center: number[]; count: number }[] = []
  
  // Initialize regions with random individuals
  for (let i = 0; i < numRegions && i < population.length; i++) {
    regions.push({
      center: population[i].chromosome.map(g => g.value),
      count: 0,
    })
  }
  
  // Assign individuals to nearest region
  for (const ind of population) {
    const values = ind.chromosome.map(g => g.value)
    
    let minDist = Infinity
    let nearestRegion = 0
    
    for (let i = 0; i < regions.length; i++) {
      let dist = 0
      for (let j = 0; j < geneCount; j++) {
        dist += Math.pow(values[j] - regions[i].center[j], 2)
      }
      
      if (dist < minDist) {
        minDist = dist
        nearestRegion = i
      }
    }
    
    regions[nearestRegion].count++
  }
  
  return regions
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  createRandomImmigrant,
  createDiverseImmigrant,
  createHybridImmigrant,
  createImmigrant,
  ImmigrationManager,
  AdaptiveImmigrationManager,
  calculateDiversityMetrics,
  removeDuplicates,
  applyNicheSharing,
  calculateChromosomeDistance,
  findCrowdedRegions,
}
