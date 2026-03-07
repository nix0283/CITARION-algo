/**
 * Pine Script Indicators API
 * 
 * GET /api/indicators - List all indicators
 * POST /api/indicators - Create new indicator
 * 
 * Custom indicators stored and executed locally
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

// GET - List indicators
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const featured = searchParams.get('featured') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Prisma.PineIndicatorWhereInput = {
      status: 'active',
    };

    if (category) {
      where.category = category;
    }

    if (featured) {
      where.isFeatured = true;
    }

    const indicators = await db.pineIndicator.findMany({
      where,
      orderBy: [
        { isFeatured: 'desc' },
        { useCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return NextResponse.json({
      success: true,
      indicators: indicators.map(ind => ({
        ...ind,
        pineCode: ind.isPublic ? ind.pineCode : undefined,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch indicators:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch indicators',
    }, { status: 500 });
  }
}

// POST - Create new indicator
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      category = 'custom',
      pineCode,
      inputSchema = [],
      outputConfig = [],
      overlay = true,
      scale = 'same',
      author,
      isPublic = false,
    } = body;

    if (!name || !pineCode) {
      return NextResponse.json({
        success: false,
        error: 'Name and pineCode are required',
      }, { status: 400 });
    }

    // Convert Pine Script to PineTS (basic conversion)
    const pinetsCode = convertPineToPineTS(pineCode);

    // Create indicator
    const indicator = await db.pineIndicator.create({
      data: {
        name,
        description,
        category,
        pineCode,
        pinetsCode,
        inputSchema: JSON.stringify(inputSchema),
        outputConfig: JSON.stringify(outputConfig),
        overlay,
        scale,
        author,
        isPublic,
      },
    });

    return NextResponse.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Failed to create indicator:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create indicator',
    }, { status: 500 });
  }
}

/**
 * Basic Pine Script to PineTS converter
 * This is a simplified conversion - full transpiler would be more complex
 */
function convertPineToPineTS(pineCode: string): string {
  let code = pineCode;

  // Remove Pine Script version header
  code = code.replace(/\/\/@version=\d+\n?/g, '');
  
  // Remove indicator/strategy declarations
  code = code.replace(/(indicator|strategy)\s*\([^)]*\)\s*;?\n?/g, '');
  
  // Convert implicit variable declarations to let/const
  // This is a simplified conversion - PineTS handles this at runtime
  
  // Replace Pine Script specific syntax
  code = code.replace(/\bta\./g, 'ta.');
  code = code.replace(/\bmath\./g, 'math.');
  code = code.replace(/\binput\s*\(/g, 'input(');
  
  // Convert array indexing [1] to .get(1) for series
  // PineTS handles this at runtime, so we keep [1] syntax
  
  return code.trim();
}
