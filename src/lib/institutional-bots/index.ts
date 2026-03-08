/**
 * INSTITUTIONAL BOTS - Module Index
 */

// Types
export * from './types';

// Bots
export { SpectrumBot } from './spectrum-bot';
export { ReedBot } from './reed-bot';
export { ArchitectBot } from './architect-bot';
export { EquilibristBot } from './equilibrist-bot';
export { KronBot } from './kron-bot';

// Bot codes
export const BOT_CODES = {
  SPECTRUM: 'PR',
  REED: 'STA',
  ARCHITECT: 'MM',
  EQUILIBRIST: 'MR',
  KRON: 'TRF',
} as const;

export const BOT_NAMES = {
  PR: 'Spectrum',
  STA: 'Reed',
  MM: 'Architect',
  MR: 'Equilibrist',
  TRF: 'Kron',
} as const;

export const BOT_STRATEGIES = {
  PR: 'Pairs Trading',
  STA: 'Statistical Arbitrage',
  MM: 'Market Making',
  MR: 'Mean Reversion',
  TRF: 'Trend Following',
} as const;
