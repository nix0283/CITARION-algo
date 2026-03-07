/**
 * Strategy Plugin System
 * 
 * Плагинная архитектура для StrategyManager.
 * Портировано и адаптировано из Zenbot (https://github.com/DeviaVir/zenbot)
 * 
 * Возможности:
 * - Динамическая загрузка стратегий
 * - Регистрация плагинов
 * - Хуки для событий (onSignal, onPosition, onError)
 * - Middleware для обработки сигналов
 * 
 * @author CITARION (ported from Zenbot)
 * @version 1.0.0
 */

import { 
  IStrategy, 
  StrategyConfig, 
  StrategySignal, 
  Candle,
  IndicatorResult,
  Timeframe,
} from "./types";

// ==================== PLUGIN TYPES ====================

/**
 * Типы хуков плагина
 */
export type PluginHook = 
  | "beforeAnalysis"
  | "afterAnalysis"
  | "onSignal"
  | "onPositionOpen"
  | "onPositionClose"
  | "onError"
  | "beforeTrade"
  | "afterTrade";

/**
 * Контекст для хуков
 */
export interface PluginContext {
  strategyId: string;
  symbol: string;
  timeframe: Timeframe;
  candles?: Candle[];
  signal?: StrategySignal | null;
  indicators?: IndicatorResult;
  position?: {
    id: string;
    direction: "LONG" | "SHORT";
    entryPrice: number;
    currentPrice: number;
    size: number;
    pnl?: number;
  };
  error?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Результат выполнения хука
 */
export interface PluginHookResult {
  proceed: boolean;
  modifiedSignal?: StrategySignal | null;
  modifiedContext?: PluginContext;
  error?: string;
}

/**
 * Функция-обработчик хука
 */
export type PluginHookHandler = (
  context: PluginContext
) => Promise<PluginHookResult> | PluginHookResult;

/**
 * Интерфейс плагина стратегии
 */
export interface IStrategyPlugin {
  /** Уникальный ID плагина */
  id: string;
  /** Название плагина */
  name: string;
  /** Версия плагина */
  version: string;
  /** Описание плагина */
  description?: string;
  /** Автор плагина */
  author?: string;
  
  /** Зависимости от других плагинов */
  dependencies?: string[];
  
  /** Конфигурация плагина */
  config?: Record<string, unknown>;
  
  /** Зарегистрированные хуки */
  hooks: Partial<Record<PluginHook, PluginHookHandler>>;
  
  /** Метод инициализации */
  init?: (manager: PluginManager) => Promise<void> | void;
  
  /** Метод деинициализации */
  destroy?: () => Promise<void> | void;
}

/**
 * Middleware для обработки сигналов
 */
export type SignalMiddleware = (
  signal: StrategySignal,
  context: PluginContext,
  next: (signal: StrategySignal) => StrategySignal | null
) => StrategySignal | null;

/**
 * Информация о зарегистрированном плагине
 */
export interface RegisteredPlugin {
  plugin: IStrategyPlugin;
  enabled: boolean;
  priority: number;
  registeredAt: Date;
}

// ==================== PLUGIN MANAGER ====================

/**
 * Менеджер плагинов для стратегий
 */
export class PluginManager {
  private plugins: Map<string, RegisteredPlugin> = new Map();
  private middlewares: SignalMiddleware[] = [];
  private strategyPlugins: Map<string, string[]> = new Map(); // strategyId -> pluginIds
  private initialized: boolean = false;
  
  // ==================== REGISTRATION ====================
  
  /**
   * Зарегистрировать плагин
   */
  registerPlugin(plugin: IStrategyPlugin, priority: number = 50): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin ${plugin.id} already registered. Replacing...`);
    }
    
    this.plugins.set(plugin.id, {
      plugin,
      enabled: true,
      priority,
      registeredAt: new Date(),
    });
    
    // Проверяем зависимости
    if (plugin.dependencies) {
      for (const depId of plugin.dependencies) {
        if (!this.plugins.has(depId)) {
          console.warn(`Plugin ${plugin.id} depends on ${depId} which is not registered`);
        }
      }
    }
  }
  
  /**
   * Отменить регистрацию плагина
   */
  unregisterPlugin(pluginId: string): void {
    const registered = this.plugins.get(pluginId);
    if (registered && registered.plugin.destroy) {
      registered.plugin.destroy();
    }
    this.plugins.delete(pluginId);
    
    // Удаляем из связей со стратегиями
    for (const [strategyId, pluginIds] of this.strategyPlugins.entries()) {
      const index = pluginIds.indexOf(pluginId);
      if (index > -1) {
        pluginIds.splice(index, 1);
      }
    }
  }
  
  /**
   * Привязать плагин к стратегии
   */
  bindPluginToStrategy(pluginId: string, strategyId: string): void {
    if (!this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} not found`);
    }
    
    if (!this.strategyPlugins.has(strategyId)) {
      this.strategyPlugins.set(strategyId, []);
    }
    
    const pluginIds = this.strategyPlugins.get(strategyId)!;
    if (!pluginIds.includes(pluginId)) {
      pluginIds.push(pluginId);
    }
  }
  
  /**
   * Отвязать плагин от стратегии
   */
  unbindPluginFromStrategy(pluginId: string, strategyId: string): void {
    const pluginIds = this.strategyPlugins.get(strategyId);
    if (pluginIds) {
      const index = pluginIds.indexOf(pluginId);
      if (index > -1) {
        pluginIds.splice(index, 1);
      }
    }
  }
  
  // ==================== MIDDLEWARE ====================
  
  /**
   * Добавить middleware для сигналов
   */
  use(middleware: SignalMiddleware): void {
    this.middlewares.push(middleware);
  }
  
  /**
   * Удалить middleware
   */
  removeMiddleware(middleware: SignalMiddleware): void {
    const index = this.middlewares.indexOf(middleware);
    if (index > -1) {
      this.middlewares.splice(index, 1);
    }
  }
  
  /**
   * Применить middleware к сигналу
   */
  applyMiddlewares(signal: StrategySignal, context: PluginContext): StrategySignal | null {
    let result: StrategySignal | null = signal;
    
    for (const middleware of this.middlewares) {
      if (result === null) break;
      
      result = middleware(result, context, (s) => s);
    }
    
    return result;
  }
  
  // ==================== LIFECYCLE ====================
  
  /**
   * Инициализировать все плагины
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Сортируем по приоритету
    const sortedPlugins = Array.from(this.plugins.values())
      .sort((a, b) => a.priority - b.priority);
    
    for (const registered of sortedPlugins) {
      if (registered.plugin.init) {
        try {
          await registered.plugin.init(this);
        } catch (error) {
          console.error(`Failed to initialize plugin ${registered.plugin.id}:`, error);
          registered.enabled = false;
        }
      }
    }
    
    this.initialized = true;
  }
  
  /**
   * Включить плагин
   */
  enablePlugin(pluginId: string): void {
    const registered = this.plugins.get(pluginId);
    if (registered) {
      registered.enabled = true;
    }
  }
  
  /**
   * Выключить плагин
   */
  disablePlugin(pluginId: string): void {
    const registered = this.plugins.get(pluginId);
    if (registered) {
      registered.enabled = false;
    }
  }
  
  // ==================== HOOKS ====================
  
  /**
   * Выполнить хук для стратегии
   */
  async executeHook(
    hook: PluginHook,
    context: PluginContext
  ): Promise<PluginContext> {
    const pluginIds = this.strategyPlugins.get(context.strategyId) || [];
    
    // Сортируем плагины по приоритету
    const sortedPlugins = pluginIds
      .map(id => this.plugins.get(id))
      .filter((r): r is RegisteredPlugin => !!r && r.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    let currentContext = context;
    
    for (const registered of sortedPlugins) {
      const handler = registered.plugin.hooks[hook];
      if (!handler) continue;
      
      try {
        const result = await handler(currentContext);
        
        if (!result.proceed) {
          // Плагин остановил выполнение
          break;
        }
        
        if (result.modifiedContext) {
          currentContext = result.modifiedContext;
        }
        
        if (result.modifiedSignal !== undefined) {
          currentContext.signal = result.modifiedSignal;
        }
      } catch (error) {
        console.error(`Plugin ${registered.plugin.id} hook ${hook} error:`, error);
        
        // Выполняем onError хук
        await this.executeHook("onError", {
          ...currentContext,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
    
    return currentContext;
  }
  
  /**
   * Выполнить хук beforeAnalysis
   */
  async beforeAnalysis(context: PluginContext): Promise<PluginContext> {
    return this.executeHook("beforeAnalysis", context);
  }
  
  /**
   * Выполнить хук afterAnalysis
   */
  async afterAnalysis(context: PluginContext): Promise<PluginContext> {
    return this.executeHook("afterAnalysis", context);
  }
  
  /**
   * Выполнить хук onSignal
   */
  async onSignal(context: PluginContext): Promise<StrategySignal | null> {
    const result = await this.executeHook("onSignal", context);
    
    if (result.signal) {
      return this.applyMiddlewares(result.signal, result);
    }
    
    return result.signal || null;
  }
  
  /**
   * Выполнить хук onPositionOpen
   */
  async onPositionOpen(context: PluginContext): Promise<void> {
    await this.executeHook("onPositionOpen", context);
  }
  
  /**
   * Выполнить хук onPositionClose
   */
  async onPositionClose(context: PluginContext): Promise<void> {
    await this.executeHook("onPositionClose", context);
  }
  
  /**
   * Выполнить хук onError
   */
  async onError(context: PluginContext): Promise<void> {
    await this.executeHook("onError", context);
  }
  
  // ==================== INFO ====================
  
  /**
   * Получить список всех плагинов
   */
  getAllPlugins(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Получить плагины для стратегии
   */
  getPluginsForStrategy(strategyId: string): RegisteredPlugin[] {
    const pluginIds = this.strategyPlugins.get(strategyId) || [];
    return pluginIds
      .map(id => this.plugins.get(id))
      .filter((r): r is RegisteredPlugin => !!r);
  }
  
  /**
   * Проверить, инициализирован ли менеджер
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// ==================== BUILTIN PLUGINS ====================

/**
 * Плагин логирования сигналов
 */
export const LoggingPlugin: IStrategyPlugin = {
  id: "builtin-logging",
  name: "Signal Logger",
  version: "1.0.0",
  description: "Logs all signals generated by strategies",
  author: "CITARION",
  
  hooks: {
    onSignal: async (context) => {
      if (context.signal) {
        console.log(`[${new Date().toISOString()}] Signal: ${context.signal.type} ${context.symbol} @ ${context.signal.price}`);
        console.log(`  Reason: ${context.signal.reason}`);
        console.log(`  Confidence: ${context.signal.confidence}%`);
      }
      return { proceed: true };
    },
    
    onError: async (context) => {
      console.error(`[${new Date().toISOString()}] Error in ${context.strategyId}:`, context.error);
      return { proceed: true };
    },
  },
};

/**
 * Плагин фильтрации сигналов по уверенности
 */
export const ConfidenceFilterPlugin: IStrategyPlugin = {
  id: "builtin-confidence-filter",
  name: "Confidence Filter",
  version: "1.0.0",
  description: "Filters signals based on minimum confidence level",
  author: "CITARION",
  
  config: {
    minConfidence: 60,
  },
  
  hooks: {
    onSignal: (context) => {
      const minConfidence = (ConfidenceFilterPlugin.config?.minConfidence as number) || 60;
      
      if (context.signal && context.signal.confidence < minConfidence) {
        console.log(`Signal filtered: confidence ${context.signal.confidence}% < ${minConfidence}%`);
        return {
          proceed: true,
          modifiedSignal: null,
        };
      }
      
      return { proceed: true };
    },
  },
};

/**
 * Плагин дедупликации сигналов
 */
export const DeduplicationPlugin: IStrategyPlugin = {
  id: "builtin-deduplication",
  name: "Signal Deduplication",
  version: "1.0.0",
  description: "Prevents duplicate signals within a time window",
  author: "CITARION",
  
  config: {
    windowMs: 60000, // 1 минута
  },
  
  hooks: {
    onSignal: (() => {
      const recentSignals: Map<string, { type: string; time: number }> = new Map();
      
      return (context) => {
        const windowMs = (DeduplicationPlugin.config?.windowMs as number) || 60000;
        const key = `${context.strategyId}_${context.symbol}`;
        const now = Date.now();
        
        const recent = recentSignals.get(key);
        
        if (context.signal && recent && recent.type === context.signal.type && now - recent.time < windowMs) {
          console.log(`Signal deduplicated: ${context.signal.type} ${context.symbol}`);
          return {
            proceed: true,
            modifiedSignal: null,
          };
        }
        
        if (context.signal) {
          recentSignals.set(key, {
            type: context.signal.type,
            time: now,
          });
          
          // Очистка старых записей
          for (const [k, v] of recentSignals.entries()) {
            if (now - v.time > windowMs * 10) {
              recentSignals.delete(k);
            }
          }
        }
        
        return { proceed: true };
      };
    })(),
  },
};

/**
 * Плагин rate limiting
 */
export const RateLimitPlugin: IStrategyPlugin = {
  id: "builtin-rate-limit",
  name: "Rate Limit",
  version: "1.0.0",
  description: "Limits the number of signals per time period",
  author: "CITARION",
  
  config: {
    maxSignals: 5,
    periodMs: 60000, // 1 минута
  },
  
  hooks: {
    onSignal: (() => {
      const signalCounts: Map<string, { count: number; resetTime: number }> = new Map();
      
      return (context) => {
        const maxSignals = (RateLimitPlugin.config?.maxSignals as number) || 5;
        const periodMs = (RateLimitPlugin.config?.periodMs as number) || 60000;
        const now = Date.now();
        
        const key = context.strategyId;
        let counter = signalCounts.get(key);
        
        if (!counter || now > counter.resetTime) {
          counter = { count: 0, resetTime: now + periodMs };
          signalCounts.set(key, counter);
        }
        
        if (context.signal && counter.count >= maxSignals) {
          console.log(`Rate limit exceeded for ${key}: ${counter.count}/${maxSignals}`);
          return {
            proceed: true,
            modifiedSignal: null,
          };
        }
        
        if (context.signal) {
          counter.count++;
        }
        
        return { proceed: true };
      };
    })(),
  },
};

/**
 * Плагин уведомлений
 */
export const NotificationPlugin: IStrategyPlugin = {
  id: "builtin-notification",
  name: "Signal Notifications",
  version: "1.0.0",
  description: "Sends notifications for signals",
  author: "CITARION",
  
  hooks: {
    onSignal: async (context) => {
      if (context.signal) {
        // Интеграция с системой уведомлений
        const { notifyUI } = await import("@/lib/notification-service");
        
        await notifyUI({
          type: "STRATEGY_SIGNAL",
          title: `📊 Signal: ${context.signal.type}`,
          message: `${context.symbol} @ ${context.signal.price}\n${context.signal.reason}`,
          data: {
            strategyId: context.strategyId,
            signal: context.signal,
          },
        });
      }
      return { proceed: true };
    },
  },
};

// ==================== SINGLETON INSTANCE ====================

let pluginManagerInstance: PluginManager | null = null;

/**
 * Получить singleton экземпляр PluginManager
 */
export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager();
    
    // Регистрируем встроенные плагины
    pluginManagerInstance.registerPlugin(LoggingPlugin, 100);
    pluginManagerInstance.registerPlugin(DeduplicationPlugin, 90);
    pluginManagerInstance.registerPlugin(ConfidenceFilterPlugin, 80);
    pluginManagerInstance.registerPlugin(RateLimitPlugin, 70);
    pluginManagerInstance.registerPlugin(NotificationPlugin, 10);
  }
  return pluginManagerInstance;
}

// ==================== EXPORT ====================

export {
  LoggingPlugin,
  ConfidenceFilterPlugin,
  DeduplicationPlugin,
  RateLimitPlugin,
  NotificationPlugin,
};
