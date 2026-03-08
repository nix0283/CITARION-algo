/**
 * First Entry as Market - Cornix-compatible feature
 *
 * Помогает не пропустить сделки, расширяя диапазон цены первого входа.
 *
 * Логика:
 * - При активации Cornix итеративно увеличивает цену первого входа небольшими шагами
 * - Пока ордер не заполнится ИЛИ не достигнут максимальный % кап
 * - Для LONG: цена увеличивается выше оригинальной
 * - Для SHORT: цена уменьшается ниже оригинальной
 */

// ==================== TYPES ====================

export type ActivateMode = 'ENTRY_PRICE_REACHED' | 'IMMEDIATELY';
export type Direction = 'LONG' | 'SHORT';

export interface FirstEntryAsMarketConfig {
  enabled: boolean;
  maxCapPercent: number; // 0.05-20
  activateMode: ActivateMode;
}

export interface FirstEntryOrder {
  originalPrice: number;
  currentPrice: number;
  direction: Direction;
  filled: boolean;
  capReached: boolean;
}

export interface PriceAdjustmentResult {
  newPrice: number;
  capReached: boolean;
  adjustmentPercent: number;
}

export interface ActivationCheck {
  shouldActivate: boolean;
  reason: string;
}

// ==================== CONSTANTS ====================

/** Минимальный шаг корректировки цены в процентах */
const PRICE_ADJUSTMENT_STEP = 0.05; // 0.05%

/** Минимальное и максимальное значение капа */
export const MIN_CAP_PERCENT = 0.05;
export const MAX_CAP_PERCENT = 20;

// ==================== VALIDATION ====================

/**
 * Валидация конфигурации First Entry as Market
 */
export function validateConfig(config: FirstEntryAsMarketConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.maxCapPercent < MIN_CAP_PERCENT || config.maxCapPercent > MAX_CAP_PERCENT) {
    errors.push(`maxCapPercent must be between ${MIN_CAP_PERCENT} and ${MAX_CAP_PERCENT}, got ${config.maxCapPercent}`);
  }

  if (!['ENTRY_PRICE_REACHED', 'IMMEDIATELY'].includes(config.activateMode)) {
    errors.push(`activateMode must be 'ENTRY_PRICE_REACHED' or 'IMMEDIATELY', got ${config.activateMode}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ==================== CORE FUNCTIONS ====================

/**
 * Рассчитывает максимальную цену с учетом капа
 *
 * @param originalPrice - Оригинальная цена входа из сигнала
 * @param direction - Направление сделки (LONG или SHORT)
 * @param maxCapPercent - Максимальный процент расширения цены
 * @returns Максимальная цена для ордера
 *
 * @example
 * // Для LONG: цена увеличивается
 * calculateMaxPrice(50000, 'LONG', 1) // => 50500 (1% выше)
 *
 * // Для SHORT: цена уменьшается
 * calculateMaxPrice(50000, 'SHORT', 1) // => 49500 (1% ниже)
 */
export function calculateMaxPrice(
  originalPrice: number,
  direction: Direction,
  maxCapPercent: number
): number {
  const multiplier = maxCapPercent / 100;

  if (direction === 'LONG') {
    // Для LONG: максимальная цена выше оригинальной
    return originalPrice * (1 + multiplier);
  } else {
    // Для SHORT: максимальная цена ниже оригинальной
    return originalPrice * (1 - multiplier);
  }
}

/**
 * Проверяет, должна ли активироваться функция First Entry as Market
 *
 * @param signalEntryPrice - Цена входа из сигнала
 * @param currentMarketPrice - Текущая рыночная цена
 * @param direction - Направление сделки
 * @param config - Конфигурация First Entry as Market
 * @returns Результат проверки активации
 *
 * @example
 * // ENTRY_PRICE_REACHED - активируется когда цена достигла уровня входа
 * shouldActivateFirstEntry(50000, 50000, 'LONG', { activateMode: 'ENTRY_PRICE_REACHED' }) // => true
 *
 * // IMMEDIATELY - активируется сразу
 * shouldActivateFirstEntry(50000, 49000, 'LONG', { activateMode: 'IMMEDIATELY' }) // => true
 */
export function shouldActivateFirstEntry(
  signalEntryPrice: number,
  currentMarketPrice: number,
  direction: Direction,
  config: FirstEntryAsMarketConfig
): ActivationCheck {
  if (!config.enabled) {
    return {
      shouldActivate: false,
      reason: 'First Entry as Market is disabled'
    };
  }

  if (config.activateMode === 'IMMEDIATELY') {
    return {
      shouldActivate: true,
      reason: 'Activate mode is IMMEDIATELY'
    };
  }

  // ENTRY_PRICE_REACHED - проверяем достигнута ли цена входа
  if (direction === 'LONG') {
    // Для LONG: рыночная цена должна быть <= или около цены входа
    const entryReached = currentMarketPrice <= signalEntryPrice * 1.001; // 0.1% tolerance
    return {
      shouldActivate: entryReached,
      reason: entryReached
        ? 'Entry price reached for LONG position'
        : `Market price ${currentMarketPrice} not yet at entry ${signalEntryPrice}`
    };
  } else {
    // Для SHORT: рыночная цена должна быть >= или около цены входа
    const entryReached = currentMarketPrice >= signalEntryPrice * 0.999; // 0.1% tolerance
    return {
      shouldActivate: entryReached,
      reason: entryReached
        ? 'Entry price reached for SHORT position'
        : `Market price ${currentMarketPrice} not yet at entry ${signalEntryPrice}`
    };
  }
}

/**
 * Рассчитывает следующую цену для ордера с учетом расширения
 *
 * @param order - Текущее состояние ордера
 * @param config - Конфигурация First Entry as Market
 * @returns Результат корректировки цены
 *
 * @description
 * Итеративно увеличивает цену первого входа небольшими шагами:
 * - Каждый шаг увеличивает цену на PRICE_ADJUSTMENT_STEP (0.05%)
 * - Для LONG: цена движется вверх от оригинальной
 * - Для SHORT: цена движется вниз от оригинальной
 * - Процесс продолжается пока ордер не заполнится или не достигнут кап
 */
export function calculateNextPrice(
  order: FirstEntryOrder,
  config: FirstEntryAsMarketConfig
): PriceAdjustmentResult {
  if (order.filled) {
    return {
      newPrice: order.currentPrice,
      capReached: false,
      adjustmentPercent: 0
    };
  }

  const maxPrice = calculateMaxPrice(
    order.originalPrice,
    order.direction,
    config.maxCapPercent
  );

  const stepMultiplier = PRICE_ADJUSTMENT_STEP / 100;
  let newPrice: number;

  if (order.direction === 'LONG') {
    // Для LONG: увеличиваем цену выше оригинальной
    newPrice = order.currentPrice * (1 + stepMultiplier);

    // Проверяем достигнут ли кап
    if (newPrice >= maxPrice) {
      return {
        newPrice: maxPrice,
        capReached: true,
        adjustmentPercent: ((maxPrice - order.originalPrice) / order.originalPrice) * 100
      };
    }
  } else {
    // Для SHORT: уменьшаем цену ниже оригинальной
    newPrice = order.currentPrice * (1 - stepMultiplier);

    // Проверяем достигнут ли кап
    if (newPrice <= maxPrice) {
      return {
        newPrice: maxPrice,
        capReached: true,
        adjustmentPercent: ((order.originalPrice - maxPrice) / order.originalPrice) * 100
      };
    }
  }

  return {
    newPrice,
    capReached: false,
    adjustmentPercent: Math.abs((newPrice - order.originalPrice) / order.originalPrice) * 100
  };
}

/**
 * Создает начальное состояние ордера для First Entry as Market
 */
export function createFirstEntryOrder(
  originalPrice: number,
  direction: Direction
): FirstEntryOrder {
  return {
    originalPrice,
    currentPrice: originalPrice,
    direction,
    filled: false,
    capReached: false
  };
}

/**
 * Проверяет, находится ли цена в допустимом диапазоне с учетом First Entry as Market
 *
 * @param price - Проверяемая цена
 * @param originalPrice - Оригинальная цена входа
 * @param direction - Направление сделки
 * @param config - Конфигурация First Entry as Market
 * @returns true если цена в допустимом диапазоне
 */
export function isPriceWithinCap(
  price: number,
  originalPrice: number,
  direction: Direction,
  config: FirstEntryAsMarketConfig
): boolean {
  if (!config.enabled) {
    // Если отключено, проверяем точное совпадение (с небольшим допуском)
    const tolerance = 0.001; // 0.1%
    return Math.abs(price - originalPrice) / originalPrice <= tolerance;
  }

  const maxPrice = calculateMaxPrice(originalPrice, direction, config.maxCapPercent);

  if (direction === 'LONG') {
    // Для LONG: цена должна быть между оригинальной и максимальной
    return price >= originalPrice * 0.999 && price <= maxPrice;
  } else {
    // Для SHORT: цена должна быть между максимальной и оригинальной
    return price >= maxPrice && price <= originalPrice * 1.001;
  }
}

/**
 * Рассчитывает эффективную цену входа с учетом возможного расширения
 *
 * @param originalPrice - Оригинальная цена входа
 * @param marketPrice - Текущая рыночная цена
 * @param direction - Направление сделки
 * @param config - Конфигурация First Entry as Market
 * @returns Эффективная цена для размещения ордера
 */
export function calculateEffectiveEntryPrice(
  originalPrice: number,
  marketPrice: number,
  direction: Direction,
  config: FirstEntryAsMarketConfig
): number {
  if (!config.enabled) {
    return originalPrice;
  }

  const maxPrice = calculateMaxPrice(originalPrice, direction, config.maxCapPercent);

  if (direction === 'LONG') {
    // Для LONG: если рыночная цена выше оригинальной, но в пределах капа
    if (marketPrice > originalPrice && marketPrice <= maxPrice) {
      return marketPrice; // Входим по текущей рыночной
    }
    if (marketPrice > maxPrice) {
      return maxPrice; // Входим по максимальной возможной
    }
    return originalPrice;
  } else {
    // Для SHORT: если рыночная цена ниже оригинальной, но в пределах капа
    if (marketPrice < originalPrice && marketPrice >= maxPrice) {
      return marketPrice; // Входим по текущей рыночной
    }
    if (marketPrice < maxPrice) {
      return maxPrice; // Входим по максимальной возможной
    }
    return originalPrice;
  }
}

/**
 * Генерирует описание стратегии First Entry as Market
 */
export function describeStrategy(config: FirstEntryAsMarketConfig): string {
  if (!config.enabled) {
    return 'First Entry as Market: Disabled (строгое совпадение цены)';
  }

  const activateDescription = config.activateMode === 'IMMEDIATELY'
    ? 'активируется сразу при открытии сделки'
    : 'активируется при достижении цены входа';

  return `First Entry as Market: Enabled (макс. расширение ${config.maxCapPercent}%, ${activateDescription})`;
}

// ==================== EXPORTS ====================

export default {
  validateConfig,
  calculateMaxPrice,
  shouldActivateFirstEntry,
  calculateNextPrice,
  createFirstEntryOrder,
  isPriceWithinCap,
  calculateEffectiveEntryPrice,
  describeStrategy,
  // Constants
  MIN_CAP_PERCENT,
  MAX_CAP_PERCENT,
  PRICE_ADJUSTMENT_STEP
};
