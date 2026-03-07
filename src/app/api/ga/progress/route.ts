/**
 * GA Progress API
 * 
 * GET /api/ga/progress - Get optimization progress
 * Query params:
 *   - jobId: Job ID to get progress for (required)
 * 
 * NO NEURAL NETWORKS - Classical evolutionary methods only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGAService } from '@/lib/self-learning/ga-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }
    
    const gaService = getGAService();
    const job = gaService.getProgress(jobId);
    
    if (!job) {
      return NextResponse.json(
        { error: `Job ${jobId} not found` },
        { status: 404 }
      );
    }
    
    // Build detailed progress response
    const response = {
      success: true,
      jobId: job.id,
      botCode: job.botCode,
      botType: job.botType,
      symbol: job.symbol,
      status: job.status,
      
      // Progress
      generation: job.generation,
      maxGenerations: job.config.maxGenerations,
      progress: job.progress,
      
      // Current stats
      currentStats: job.currentStats ? {
        generation: job.currentStats.generation,
        bestFitness: job.currentStats.bestFitness,
        avgFitness: job.currentStats.avgFitness,
        worstFitness: job.currentStats.worstFitness,
        diversity: job.currentStats.diversity,
        stagnationCount: job.currentStats.stagnationCount,
      } : null,
      
      // Best chromosome
      bestChromosome: job.bestChromosome ? {
        fitness: job.bestChromosome.fitness,
        genes: job.bestChromosome.genes.map(g => ({
          name: g.name,
          value: g.value,
          min: g.min,
          max: g.max,
        })),
      } : null,
      
      // History (last 20 generations)
      history: job.history.slice(-20).map(h => ({
        generation: h.generation,
        bestFitness: h.bestFitness,
        avgFitness: h.avgFitness,
        diversity: h.diversity,
      })),
      
      // Timing
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs,
      elapsedMs: job.startedAt ? Date.now() - job.startedAt : 0,
      
      // Result (if completed)
      result: job.result ? {
        generations: job.result.generations,
        converged: job.result.converged,
        evaluationsCount: job.result.evaluationsCount,
      } : null,
      
      // Error
      error: job.error,
      
      // Volatility context
      volatilityRegime: job.volatilityRegime,
      volatilityAdjustments: job.volatilityAdjustments,
    };
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('[GA Progress API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get progress' },
      { status: 500 }
    );
  }
}
