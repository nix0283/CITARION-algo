/**
 * Single Indicator API
 * 
 * GET /api/indicators/[id] - Get indicator details
 * PUT /api/indicators/[id] - Update indicator
 * DELETE /api/indicators/[id] - Delete indicator
 * POST /api/indicators/[id] - Execute indicator on data
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Get single indicator
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const indicator = await db.pineIndicator.findUnique({
      where: { id },
    });

    if (!indicator) {
      return NextResponse.json({
        success: false,
        error: 'Indicator not found',
      }, { status: 404 });
    }

    // Update usage count
    await db.pineIndicator.update({
      where: { id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Failed to fetch indicator:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch indicator',
    }, { status: 500 });
  }
}

// PUT - Update indicator
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category) updateData.category = body.category;
    if (body.pineCode) {
      updateData.pineCode = body.pineCode;
      updateData.pinetsCode = convertPineToPineTS(body.pineCode);
    }
    if (body.inputSchema) updateData.inputSchema = JSON.stringify(body.inputSchema);
    if (body.outputConfig) updateData.outputConfig = JSON.stringify(body.outputConfig);
    if (body.overlay !== undefined) updateData.overlay = body.overlay;
    if (body.scale) updateData.scale = body.scale;
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;

    const indicator = await db.pineIndicator.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Failed to update indicator:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update indicator',
    }, { status: 500 });
  }
}

// DELETE - Delete indicator
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.pineIndicator.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Indicator deleted',
    });
  } catch (error) {
    console.error('Failed to delete indicator:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete indicator',
    }, { status: 500 });
  }
}

/**
 * Basic Pine Script to PineTS converter
 */
function convertPineToPineTS(pineCode: string): string {
  let code = pineCode;
  code = code.replace(/\/\/@version=\d+\n?/g, '');
  code = code.replace(/(indicator|strategy)\s*\([^)]*\)\s*;?\n?/g, '');
  return code.trim();
}
