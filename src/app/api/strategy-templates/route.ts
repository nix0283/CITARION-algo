/**
 * Strategy Templates API Endpoint
 *
 * GET    /api/strategy-templates           - List all templates
 * GET    /api/strategy-templates?id=X      - Get specific template
 * GET    /api/strategy-templates?botType=Y - Filter by bot type
 * POST   /api/strategy-templates           - Create custom template
 * POST   /api/strategy-templates?action=sync - Sync file templates to DB
 * PUT    /api/strategy-templates?id=X      - Update template
 * DELETE /api/strategy-templates?id=X      - Delete template
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  getTemplateFiles,
  getTemplate,
  getAllTemplates,
  syncTemplatesToDatabase,
  applyTemplate,
  exportToTemplate,
  saveCustomTemplate,
  incrementTemplateUsage,
  type StrategyTemplateConfig,
} from '@/lib/strategy-templates';

// --------------------------------------------------
// GET handlers
// --------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const botType = searchParams.get('botType');
  const category = searchParams.get('category');
  const source = searchParams.get('source') || 'database'; // 'database' | 'files'

  try {
    // Get specific template by ID from database
    if (id) {
      const template = await db.strategyTemplate.findUnique({
        where: { id },
      });

      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        template: {
          ...template,
          config: JSON.parse(template.config),
          tags: template.tags ? JSON.parse(template.tags) : [],
        },
      });
    }

    // Get templates from files
    if (source === 'files') {
      if (botType) {
        const templates = getTemplateFiles(botType);
        return NextResponse.json({
          success: true,
          templates,
          count: templates.length,
          source: 'files',
        });
      }

      const allTemplates = getAllTemplates();
      const result = Array.from(allTemplates.entries()).map(([type, templates]) => ({
        botType: type,
        templates,
      }));

      return NextResponse.json({
        success: true,
        templates: result,
        count: result.reduce((acc, t) => acc + t.templates.length, 0),
        source: 'files',
      });
    }

    // Get templates from database
    const where: Record<string, unknown> = {};
    if (botType) where.botType = botType.toUpperCase();
    if (category) where.category = category;

    const templates = await db.strategyTemplate.findMany({
      where,
      orderBy: [
        { isFeatured: 'desc' },
        { useCount: 'desc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json({
      success: true,
      templates: templates.map(t => ({
        ...t,
        config: JSON.parse(t.config),
        tags: t.tags ? JSON.parse(t.tags) : [],
      })),
      count: templates.length,
      source: 'database',
    });
  } catch (error) {
    console.error('Strategy Templates GET error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// POST handlers
// --------------------------------------------------

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    // Sync file templates to database
    if (action === 'sync') {
      const result = await syncTemplatesToDatabase();
      return NextResponse.json({
        success: true,
        message: 'Templates synced successfully',
        ...result,
      });
    }

    // Apply template to create bot config
    if (action === 'apply') {
      const body = await request.json();
      const { botType, templateName, overrides } = body;

      const template = getTemplate(botType, templateName);
      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        );
      }

      const config = applyTemplate(template, overrides);

      return NextResponse.json({
        success: true,
        config,
        template: {
          name: template.name,
          version: template.version,
        },
      });
    }

    // Create custom template
    const body = await request.json();
    const { userId, template } = body as {
      userId?: string;
      template: StrategyTemplateConfig;
    };

    // Validate template
    if (!template.name || !template.botType || !template.config) {
      return NextResponse.json(
        { success: false, error: 'name, botType, and config are required' },
        { status: 400 }
      );
    }

    const saved = await saveCustomTemplate(userId || 'system', template);

    return NextResponse.json({
      success: true,
      template: saved,
    });
  } catch (error) {
    console.error('Strategy Templates POST error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// PUT handler
// --------------------------------------------------

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Template ID required' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    const existing = await db.strategyTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    const updated = await db.strategyTemplate.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        category: body.category ?? existing.category,
        config: body.config ? JSON.stringify(body.config) : existing.config,
        version: body.version ?? existing.version,
        tags: body.tags ? JSON.stringify(body.tags) : existing.tags,
        isPublic: body.isPublic ?? existing.isPublic,
        isFeatured: body.isFeatured ?? existing.isFeatured,
      },
    });

    return NextResponse.json({
      success: true,
      template: {
        ...updated,
        config: JSON.parse(updated.config),
        tags: updated.tags ? JSON.parse(updated.tags) : [],
      },
    });
  } catch (error) {
    console.error('Strategy Templates PUT error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// DELETE handler
// --------------------------------------------------

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Template ID required' },
      { status: 400 }
    );
  }

  try {
    const existing = await db.strategyTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    await db.strategyTemplate.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Template ${id} deleted`,
    });
  } catch (error) {
    console.error('Strategy Templates DELETE error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// Export bot config as template
// --------------------------------------------------

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'export') {
    try {
      const body = await request.json();
      const { botConfig, metadata } = body;

      const template = exportToTemplate(botConfig, metadata);

      return NextResponse.json({
        success: true,
        template,
      });
    } catch (error) {
      console.error('Strategy Templates PATCH error:', error);
      return NextResponse.json(
        { success: false, error: String(error) },
        { status: 500 }
      );
    }
  }

  // Increment usage
  if (action === 'use') {
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Template ID required' },
        { status: 400 }
      );
    }

    await incrementTemplateUsage(id);

    return NextResponse.json({
      success: true,
    });
  }

  return NextResponse.json(
    { success: false, error: 'Invalid action' },
    { status: 400 }
  );
}
