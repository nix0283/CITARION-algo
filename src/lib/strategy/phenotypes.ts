/**
 * Phenotypes Module
 * 
 * Портировано из Zenbot (https://github.com/DeviaVir/zenbot/blob/master/lib/phenotype.js)
 * 
 * Phenotypes - это типы параметров для оптимизации стратегий (Hyperopt).
 * Определяют диапазоны значений и способы их варьирования.
 * 
 * Использование:
 * - Определить phenotypes в стратегии
 * - Hyperopt автоматически подбирает оптимальные значения
 * - Поддержка генетических алгоритмов и случайного поиска
 * 
 * @author CITARION (ported from Zenbot)
 * @version 1.0.0
 */

// ==================== TYPES ====================

/**
 * Базовый тип phenotype
 */
export type PhenotypeType = 
  | "range" 
  | "range_float" 
  | "range_period" 
  | "range0" 
  | "list_option"
  | "static";

/**
 * Базовый интерфейс phenotype
 */
export interface BasePhenotype {
  type: PhenotypeType;
  min?: number;
  max?: number;
  step?: number;
  period?: string;  // 's', 'm', 'h', 'd' для period
  options?: (string | number | boolean)[];
  value?: unknown;
}

/**
 * Диапазон целых чисел
 */
export interface RangePhenotype extends BasePhenotype {
  type: "range";
  min: number;
  max: number;
}

/**
 * Диапазон float чисел
 */
export interface RangeFloatPhenotype extends BasePhenotype {
  type: "range_float";
  min: number;
  max: number;
}

/**
 * Диапазон периодов (время)
 */
export interface RangePeriodPhenotype extends BasePhenotype {
  type: "range_period";
  min: number;
  max: number;
  period: "s" | "m" | "h" | "d";
}

/**
 * Диапазон от 0 (включительно)
 */
export interface Range0Phenotype extends BasePhenotype {
  type: "range0";
  min: number;
  max: number;
}

/**
 * Выбор из списка
 */
export interface ListOptionPhenotype extends BasePhenotype {
  type: "list_option";
  options: (string | number | boolean)[];
}

/**
 * Статическое значение
 */
export interface StaticPhenotype extends BasePhenotype {
  type: "static";
  value: unknown;
}

/**
 * Union тип для всех phenotypes
 */
export type Phenotype = 
  | RangePhenotype 
  | RangeFloatPhenotype 
  | RangePeriodPhenotype
  | Range0Phenotype 
  | ListOptionPhenotype 
  | StaticPhenotype;

/**
 * Коллекция phenotypes для стратегии
 */
export type PhenotypeCollection = Record<string, Phenotype>;

// ==================== PHENOTYPE FACTORY FUNCTIONS ====================

/**
 * Фабрика phenotypes (аналог Zenbot lib/phenotype.js)
 */
export const Phenotypes = {
  /**
   * Диапазон целых чисел
   * 
   * @example
   * rsi_periods: Phenotypes.Range(1, 200)
   */
  Range(min: number, max: number): RangePhenotype {
    return { type: "range", min, max };
  },

  /**
   * Диапазон float чисел
   * 
   * @example
   * bollinger_time: Phenotypes.RangeFloat(1, 6)
   */
  RangeFloat(min: number, max: number): RangeFloatPhenotype {
    return { type: "range_float", min, max };
  },

  /**
   * Диапазон периодов (секунды, минуты, часы, дни)
   * 
   * @example
   * period_length: Phenotypes.RangePeriod(1, 120, 'm')
   */
  RangePeriod(
    min: number, 
    max: number, 
    period: "s" | "m" | "h" | "d"
  ): RangePeriodPhenotype {
    return { type: "range_period", min, max, period };
  },

  /**
   * Диапазон от 0 (включительно)
   * Используется для параметров, которые могут быть 0
   * 
   * @example
   * sell_stop_pct: Phenotypes.Range0(1, 50)
   */
  Range0(min: number, max: number): Range0Phenotype {
    return { type: "range0", min, max };
  },

  /**
   * Выбор из списка опций
   * 
   * @example
   * order_type: Phenotypes.ListOption(['maker', 'taker'])
   */
  ListOption<T extends string | number | boolean>(
    options: T[]
  ): ListOptionPhenotype {
    return { type: "list_option", options };
  },

  /**
   * Статическое значение (не оптимизируется)
   * 
   * @example
   * symbol: Phenotypes.Static('BTC/USDT')
   */
  Static(value: unknown): StaticPhenotype {
    return { type: "static", value };
  },
};

// ==================== HYPEROPT INTEGRATION ====================

/**
 * Получить случайное значение из phenotype
 */
export function getRandomValue(phenotype: Phenotype): number | string | boolean {
  switch (phenotype.type) {
    case "range": {
      return Math.floor(Math.random() * (phenotype.max - phenotype.min + 1)) + phenotype.min;
    }

    case "range_float": {
      return Math.random() * (phenotype.max - phenotype.min) + phenotype.min;
    }

    case "range_period": {
      const value = Math.floor(Math.random() * (phenotype.max - phenotype.min + 1)) + phenotype.min;
      return value;
      // Period string будет добавлен при форматировании
    }

    case "range0": {
      // Может вернуть 0 или значение из диапазона
      if (Math.random() < 0.1) return 0; // 10% шанс на 0
      return Math.floor(Math.random() * (phenotype.max - phenotype.min + 1)) + phenotype.min;
    }

    case "list_option": {
      const idx = Math.floor(Math.random() * phenotype.options.length);
      return phenotype.options[idx] as string | number | boolean;
    }

    case "static": {
      return phenotype.value as string | number | boolean;
    }

    default:
      throw new Error(`Unknown phenotype type`);
  }
}

/**
 * Получить границы поиска для phenotype
 */
export function getSearchBounds(phenotype: Phenotype): {
  low: number;
  high: number;
} | null {
  switch (phenotype.type) {
    case "range":
    case "range_float":
    case "range_period":
    case "range0":
      return { low: phenotype.min, high: phenotype.max };

    case "list_option":
      return { low: 0, high: phenotype.options.length - 1 };

    case "static":
      return null;

    default:
      return null;
  }
}

/**
 * Конвертировать индекс в значение для list_option
 */
export function indexToValue(phenotype: ListOptionPhenotype, index: number): string | number | boolean {
  return phenotype.options[Math.floor(index)];
}

/**
 * Нормализовать значение phenotype для генетического алгоритма
 */
export function normalizeValue(phenotype: Phenotype, value: number): number {
  const bounds = getSearchBounds(phenotype);
  if (!bounds) return 0;
  
  return (value - bounds.low) / (bounds.high - bounds.low);
}

/**
 * Денормализовать значение phenotype
 */
export function denormalizeValue(phenotype: Phenotype, normalized: number): number {
  const bounds = getSearchBounds(phenotype);
  if (!bounds) return 0;
  
  return bounds.low + normalized * (bounds.high - bounds.low);
}

// ==================== ZENBOT COMMON PHENOTYPES ====================

/**
 * Стандартные phenotypes из Zenbot (общие для всех стратегий)
 */
export const ZENBOT_COMMON_PHENOTYPES: PhenotypeCollection = {
  // Period & Time
  period_length: Phenotypes.RangePeriod(1, 120, "m"),
  min_periods: Phenotypes.Range(1, 200),

  // Order execution
  markdown_buy_pct: Phenotypes.RangeFloat(-1, 5),
  markup_sell_pct: Phenotypes.RangeFloat(-1, 5),
  order_type: Phenotypes.ListOption(["maker", "taker"]),

  // Stop losses
  sell_stop_pct: Phenotypes.Range0(1, 50),
  buy_stop_pct: Phenotypes.Range0(1, 50),

  // Trailing stop (из Zenbot)
  profit_stop_enable_pct: Phenotypes.Range0(1, 20),
  profit_stop_pct: Phenotypes.Range(1, 20),

  // Risk management
  max_sell_loss_pct: Phenotypes.Range0(1, 50),
  max_buy_loss_pct: Phenotypes.Range0(1, 50),
  max_slippage_pct: Phenotypes.Range0(0.1, 5),
};

/**
 * Получить все phenotypes стратегии (общие + специфичные)
 */
export function mergePhenotypes(
  strategyPhenotypes: PhenotypeCollection
): PhenotypeCollection {
  return {
    ...ZENBOT_COMMON_PHENOTYPES,
    ...strategyPhenotypes,
  };
}

/**
 * Генерировать случайный набор параметров
 */
export function generateRandomParams(
  phenotypes: PhenotypeCollection
): Record<string, number | string | boolean> {
  const params: Record<string, number | string | boolean> = {};

  for (const [key, phenotype] of Object.entries(phenotypes)) {
    params[key] = getRandomValue(phenotype);
  }

  return params;
}

/**
 * Мутировать параметры (для генетического алгоритма)
 */
export function mutateParams(
  params: Record<string, number | string | boolean>,
  phenotypes: PhenotypeCollection,
  mutationRate: number = 0.1
): Record<string, number | string | boolean> {
  const mutated = { ...params };

  for (const [key, phenotype] of Object.entries(phenotypes)) {
    if (Math.random() < mutationRate) {
      mutated[key] = getRandomValue(phenotype);
    }
  }

  return mutated;
}

/**
 * Скрестить два набора параметров (crossover)
 */
export function crossoverParams(
  parent1: Record<string, number | string | boolean>,
  parent2: Record<string, number | string | boolean>,
  phenotypes: PhenotypeCollection
): [Record<string, number | string | boolean>, Record<string, number | string | boolean>] {
  const child1: Record<string, number | string | boolean> = {};
  const child2: Record<string, number | string | boolean> = {};

  for (const key of Object.keys(phenotypes)) {
    if (Math.random() < 0.5) {
      child1[key] = parent1[key];
      child2[key] = parent2[key];
    } else {
      child1[key] = parent2[key];
      child2[key] = parent1[key];
    }
  }

  return [child1, child2];
}

// ==================== HYPEROPT SPACE GENERATION ====================

/**
 * Создать пространство поиска для Hyperopt
 */
export function createHyperoptSpace(
  phenotypes: PhenotypeCollection
): Record<string, { min: number; max: number; type: string }> {
  const space: Record<string, { min: number; max: number; type: string }> = {};

  for (const [key, phenotype] of Object.entries(phenotypes)) {
    switch (phenotype.type) {
      case "range":
        space[key] = { 
          min: phenotype.min, 
          max: phenotype.max, 
          type: "integer" 
        };
        break;

      case "range_float":
        space[key] = { 
          min: phenotype.min, 
          max: phenotype.max, 
          type: "float" 
        };
        break;

      case "range_period":
        space[key] = { 
          min: phenotype.min, 
          max: phenotype.max, 
          type: "period" 
        };
        break;

      case "range0":
        space[key] = { 
          min: 0, 
          max: phenotype.max, 
          type: "integer_or_zero" 
        };
        break;

      case "list_option":
        space[key] = { 
          min: 0, 
          max: phenotype.options.length - 1, 
          type: "categorical" 
        };
        break;

      case "static":
        // Не добавляем в пространство поиска
        break;
    }
  }

  return space;
}

/**
 * Валидация параметров по phenotypes
 */
export function validateParams(
  params: Record<string, unknown>,
  phenotypes: PhenotypeCollection
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [key, phenotype] of Object.entries(phenotypes)) {
    const value = params[key];

    if (value === undefined) {
      errors.push(`Missing parameter: ${key}`);
      continue;
    }

    switch (phenotype.type) {
      case "range":
      case "range0":
        if (typeof value !== "number" || !Number.isInteger(value)) {
          errors.push(`${key} must be an integer`);
        } else if (value < (phenotype.min) || value > phenotype.max) {
          errors.push(`${key} must be between ${phenotype.min} and ${phenotype.max}`);
        }
        break;

      case "range_float":
        if (typeof value !== "number") {
          errors.push(`${key} must be a number`);
        } else if (value < phenotype.min || value > phenotype.max) {
          errors.push(`${key} must be between ${phenotype.min} and ${phenotype.max}`);
        }
        break;

      case "range_period":
        if (typeof value !== "number") {
          errors.push(`${key} must be a number (period)`);
        } else if (value < phenotype.min || value > phenotype.max) {
          errors.push(`${key} must be between ${phenotype.min} and ${phenotype.max}`);
        }
        break;

      case "list_option":
        if (!phenotype.options.includes(value as string | number | boolean)) {
          errors.push(`${key} must be one of: ${phenotype.options.join(", ")}`);
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Применить период к значению
 */
export function formatPeriod(value: number, period: "s" | "m" | "h" | "d"): string {
  return `${value}${period}`;
}

/**
 * Парсить период из строки
 */
export function parsePeriod(periodStr: string): { value: number; period: "s" | "m" | "h" | "d" } {
  const match = periodStr.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid period format: ${periodStr}`);
  }
  
  return {
    value: parseInt(match[1]),
    period: match[2] as "s" | "m" | "h" | "d",
  };
}

/**
 * Конвертировать период в миллисекунды
 */
export function periodToMs(value: number, period: "s" | "m" | "h" | "d"): number {
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  
  return value * multipliers[period];
}
