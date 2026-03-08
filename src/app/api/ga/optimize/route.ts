/**
 * GA Optimize API
 * 
 * POST /api/ga/optimize - Start a new optimization job
 * GET /api/ga/optimize - Get all optimization jobs
 * 
 * NO NEURAL NETWORKS - Classical evolutionary methods only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGAService, type OptimizeRequest } from '@/lib/self-learning/ga-service';
import type { BotType } from '@/lib/volatility/garch-integration-service';
import type { Gene, GeneticConfig, Constraint } from '@/lib/self-learning/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const { botCode, botType, symbol, geneTemplate, config, constraints, volatilityAware } = body;
    
    if (!botCode || !botType || !symbol) {
      return NextResponse.json(
        { error: 'Missing required fields: botCode, botType, symbol' },
        { status: 400 }
      );
    }
    
    // Validate botType
    const validBotTypes: BotType[] = ['DCA', 'BB', 'ORION', 'LOGOS', 'GRID', 'MFT'];
    if (!validBotTypes.includes(botType)) {
      return NextResponse.json(
        { error: `Invalid botType. Must be one of: ${validBotTypes.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Get GA service
    const gaService = getGAService();
    
    // Create optimization request
    const optimizeRequest: OptimizeRequest = {
      botCode,
      botType,
      symbol,
      geneTemplate: geneTemplate as Gene[] | undefined,
      config: config as Partial<GeneticConfig> | undefined,
      constraints: constraints as Constraint[] | undefined,
      volatilityAware: volatilityAware !== false, // Default true
    };
    
    // Start optimization
    const job = await gaService.startOptimization(optimizeRequest);
    
    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      message: `Optimization started for ${botCode}`,
      volatilityRegime: job.volatilityRegime,
      volatilityAdjustments: job.volatilityAdjustments,
      gaGarchConfig: job.gaGarchConfig ? {
        fitnessMultiplier: job.gaGarchConfig.fitnessMultiplier,
        explorationBoost: job.gaGarchConfig.explorationBoost,
        regimeScore: job.gaGarchConfig.regimeScore,
        trend: job.gaGarchConfig.trend,
      } : null,
      populationSize: job.config.populationSize,
      mutationRate: job.config.mutationRate,
    });
    
  } catch (error: any) {
    console.error('[GA Optimize API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start optimization' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    const gaService = getGAService();
    
    let jobs;
    if (status === 'active') {
      jobs = gaService.getActiveJobs();
    } else {
      jobs = await gaService.getAllJobs();
    }
    
    // Return summary of jobs
    const summary = jobs.map(job => ({
      id: job.id,
      botCode: job.botCode,
      botType: job.botType,
      symbol: job.symbol,
      status: job.status,
      generation: job.generation,
      progress: job.progress,
      bestFitness: job.bestChromosome?.fitness || null,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs,
      error: job.error,
      volatilityRegime: job.volatilityRegime,
      gaGarchConfig: job.gaGarchConfig,
    }));
    
    return NextResponse.json({
      success: true,
      count: summary.length,
      jobs: summary,
    });
    
  } catch (error: any) {
    console.error('[GA Optimize API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get jobs' },
      { status: 500 }
    );
  }
}
