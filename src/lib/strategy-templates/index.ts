/**
 * Strategy Templates Manager
 * 
 * Управление шаблонами стратегий:
 * - Загрузка из файлов
 * - Сохранение в базу данных
 * - Экспорт/импорт конфигураций
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '@/lib/db';

// Types
export interface StrategyTemplateConfig {
  name: string;
  description?: string;
  category: string;
  botType: 'GRID' | 'DCA' | 'BB' | 'ARGUS' | 'VISION';
  version: string;
  author?: string;
  tags?: string[];
  config: Record<string, unknown>;
  defaultParams?: Record<string, unknown>;
  riskProfile?: 'conservative' | 'moderate' | 'aggressive';
  recommendedFor?: {
    marketCondition?: string;
    volatility?: string;
    timeframe?: string;
  };
  notes?: string;
}

export interface TemplateFile {
  filename: string;
  path: string;
  content: StrategyTemplateConfig;
}

// Template directories
const TEMPLATES_DIR = path.join(process.cwd(), 'src/lib/strategy-templates');

/**
 * Get all template files for a bot type
 */
export function getTemplateFiles(botType: string): TemplateFile[] {
  const templates: TemplateFile[] = [];
  const botTypeDir = path.join(TEMPLATES_DIR, botType.toLowerCase());

  try {
    if (!fs.existsSync(botTypeDir)) {
      return templates;
    }

    const files = fs.readdirSync(botTypeDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(botTypeDir, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StrategyTemplateConfig;
          templates.push({
            filename: file,
            path: filePath,
            content,
          });
        } catch (error) {
          console.error(`Error parsing template ${file}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading templates directory:`, error);
  }

  return templates;
}

/**
 * Get all templates from all bot types
 */
export function getAllTemplates(): Map<string, TemplateFile[]> {
  const allTemplates = new Map<string, TemplateFile[]>();
  const botTypes = ['grid', 'dca', 'bb', 'vision', 'argus'];

  for (const botType of botTypes) {
    const templates = getTemplateFiles(botType);
    if (templates.length > 0) {
      allTemplates.set(botType.toUpperCase(), templates);
    }
  }

  return allTemplates;
}

/**
 * Get a specific template by bot type and name
 */
export function getTemplate(botType: string, templateName: string): StrategyTemplateConfig | null {
  const templates = getTemplateFiles(botType);
  const template = templates.find(t => 
    t.content.name.toLowerCase() === templateName.toLowerCase() ||
    t.filename.replace('.json', '').toLowerCase() === templateName.toLowerCase()
  );
  
  return template?.content || null;
}

/**
 * Sync file templates to database
 */
export async function syncTemplatesToDatabase(): Promise<{
  synced: number;
  created: number;
  updated: number;
  errors: string[];
}> {
  const result = {
    synced: 0,
    created: 0,
    updated: 0,
    errors: [] as string[],
  };

  const allTemplates = getAllTemplates();

  for (const [botType, templates] of Array.from(allTemplates.entries())) {
    for (const template of templates) {
      try {
        const existing = await db.strategyTemplate.findFirst({
          where: {
            name: template.content.name,
            botType: botType as 'GRID' | 'DCA' | 'BB' | 'ARGUS' | 'VISION',
          },
        });

        const templateData = {
          name: template.content.name,
          description: template.content.description,
          category: template.content.category,
          botType: botType as 'GRID' | 'DCA' | 'BB' | 'ARGUS' | 'VISION',
          config: JSON.stringify(template.content.config),
          version: template.content.version,
          author: template.content.author,
          tags: template.content.tags ? JSON.stringify(template.content.tags) : null,
          isPublic: true,
          isFeatured: false,
        };

        if (existing) {
          await db.strategyTemplate.update({
            where: { id: existing.id },
            data: templateData,
          });
          result.updated++;
        } else {
          await db.strategyTemplate.create({
            data: templateData,
          });
          result.created++;
        }

        result.synced++;
      } catch (error) {
        result.errors.push(`Failed to sync ${template.content.name}: ${error}`);
      }
    }
  }

  return result;
}

/**
 * Get templates from database
 */
export async function getTemplatesFromDatabase(options?: {
  botType?: string;
  category?: string;
  isPublic?: boolean;
  userId?: string;
}): Promise<Array<{
  id: string;
  name: string;
  description: string | null;
  category: string;
  botType: string;
  config: string;
  version: string;
  author: string | null;
  tags: string | null;
  useCount: number;
  isPublic: boolean;
  isFeatured: boolean;
}>> {
  const where: Record<string, unknown> = {};

  if (options?.botType) {
    where.botType = options.botType;
  }
  if (options?.category) {
    where.category = options.category;
  }
  if (options?.isPublic !== undefined) {
    where.isPublic = options.isPublic;
  }
  if (options?.userId) {
    where.userId = options.userId;
  }

  return db.strategyTemplate.findMany({
    where,
    orderBy: [
      { isFeatured: 'desc' },
      { useCount: 'desc' },
      { name: 'asc' },
    ],
  });
}

/**
 * Apply template to create bot configuration
 */
export function applyTemplate(
  template: StrategyTemplateConfig,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...template.config,
    ...overrides,
    _template: {
      name: template.name,
      version: template.version,
      category: template.category,
    },
  };
}

/**
 * Export bot configuration to template format
 */
export function exportToTemplate(
  botConfig: Record<string, unknown>,
  metadata: {
    name: string;
    description?: string;
    botType: 'GRID' | 'DCA' | 'BB' | 'ARGUS' | 'VISION';
    category?: string;
    tags?: string[];
  }
): StrategyTemplateConfig {
  // Remove runtime-specific fields
  const config = { ...botConfig };
  delete config._template;
  delete config.id;
  delete config.userId;
  delete config.accountId;
  delete config.createdAt;
  delete config.updatedAt;
  delete config.status;
  delete config.isActive;
  delete config.startedAt;
  delete config.stoppedAt;
  delete config.totalProfit;
  delete config.totalTrades;
  delete config.realizedPnL;

  return {
    name: metadata.name,
    description: metadata.description,
    category: metadata.category || 'custom',
    botType: metadata.botType,
    version: '1.0.0',
    tags: metadata.tags,
    config,
  };
}

/**
 * Save custom template to database
 */
export async function saveCustomTemplate(
  userId: string,
  template: StrategyTemplateConfig
): Promise<{ id: string; name: string }> {
  const saved = await db.strategyTemplate.create({
    data: {
      userId,
      name: template.name,
      description: template.description,
      category: template.category,
      botType: template.botType,
      config: JSON.stringify(template.config),
      version: template.version,
      author: template.author,
      tags: template.tags ? JSON.stringify(template.tags) : null,
      isPublic: false,
    },
  });

  return {
    id: saved.id,
    name: saved.name,
  };
}

/**
 * Increment template usage count
 */
export async function incrementTemplateUsage(templateId: string): Promise<void> {
  await db.strategyTemplate.update({
    where: { id: templateId },
    data: {
      useCount: { increment: 1 },
    },
  });
}
