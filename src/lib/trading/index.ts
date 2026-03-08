/**
 * Trading Strategy Module
 *
 * Core trading strategy implementations for position entry and management.
 */

export {
  // Types
  type DCAEntryConfig,
  type DCAOrder,
  type DCAStrategyResult,
  type DCAPresetName,

  // Functions
  calculateDCAOrders,
  validateDCAConfig,
  calculateMaxOrdersWithinRange,
  generateDCAPreview,

  // Presets
  DCA_PRESETS,
} from './dca-strategy';
