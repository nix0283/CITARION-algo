/**
 * Stage 2 Modules Index
 * Exports all Stage 2 components
 */

// Genetic Algorithm Framework
export * from '../genetic-v2/framework'
export { GeneticOptimizer, GeneticOperators, FitnessCalculator, BOT_GENE_TEMPLATES } from '../genetic-v2/framework'

// Extended Signal Classifier
export * from '../ml-v2/extended-classifier'
export { ExtendedSignalClassifier, FeatureExtractor, KNNClassifier } from '../ml-v2/extended-classifier'

// Trading Journal for Logos
export * from '../logos-v2/trading-journal'
export { TradingJournal, JournalAnalyzer, TradeAnalyzer } from '../logos-v2/trading-journal'

// Online Learning for Vision
export * from '../vision-v2/online-learner'
export { OnlineLearner, MultiHorizonForecaster, DriftDetector, IncrementalModel } from '../vision-v2/online-learner'
