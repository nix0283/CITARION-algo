/**
 * GA Apply API
 * 
 * POST /api/ga/apply - Apply optimized parameters to a bot
 * Body:
 *   - jobId: Job ID with completed optimization (required)
 * 
 * POST /api/ga/apply?botCode=<botCode> - Apply latest completed optimization for bot
 * 
 * NO NEURAL NETWORKS - Classical evolutionary methods only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGAService } from '@/lib/self-learning/ga-service';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botCode = searchParams.get('botCode');
    
    const body = await request.json().catch(() => ({}));
    const jobId = body.jobId;
    
    const gaService = getGAService();
    
    // If botCode is provided, find latest completed job for that bot
    if (botCode && !jobId) {
      const jobs = await gaService.getAllJobs();
      const botJobs = jobs.filter(
        j => j.botCode === botCode && j.status === 'completed' && j.bestChromosome
      );
      
      if (botJobs.length === 0) {
        return NextResponse.json(
          { error: `No completed optimization found for bot ${botCode}` },
          { status: 404 }
        );
      }
      
      // Sort by completedAt descending and get the latest
      botJobs.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
      const latestJob = botJobs[0];
      
      const result = await gaService.applyToBot(latestJob.id);
      return NextResponse.json(result);
    }
    
    // If jobId is provided, apply that specific job
    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId in request body or botCode in query params' },
        { status: 400 }
      );
    }
    
    const result = await gaService.applyToBot(jobId);
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('[GA Apply API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to apply parameters' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ga/apply?botCode=<botCode> - Get latest optimized parameters for bot
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botCode = searchParams.get('botCode');
    
    if (!botCode) {
      return NextResponse.json(
        { error: 'Missing botCode parameter' },
        { status: 400 }
      );
    }
    
    const gaService = getGAService();
    const jobs = await gaService.getAllJobs();
    
    const botJobs = jobs.filter(
      j => j.botCode === botCode && j.status === 'completed' && j.bestChromosome
    );
    
    if (botJobs.length === 0) {
      return NextResponse.json({
        success: false,
        botCode,
        message: `No completed optimization found for bot ${botCode}`,
        params: null,
      });
    }
    
    // Sort by completedAt descending
    botJobs.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    const latestJob = botJobs[0];
    
    // Extract parameters
    const params: Record<string, number> = {};
    for (const gene of latestJob.bestChromosome!.genes) {
      params[gene.name] = gene.value;
    }
    
    return NextResponse.json({
      success: true,
      botCode,
      jobId: latestJob.id,
      fitness: latestJob.bestChromosome!.fitness,
      params,
      completedAt: latestJob.completedAt,
      volatilityRegime: latestJob.volatilityRegime,
      gaGarchConfig: latestJob.gaGarchConfig,
      message: `Latest optimization from ${new Date(latestJob.completedAt!).toISOString()}`,
    });
    
  } catch (error: any) {
    console.error('[GA Apply API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get parameters' },
      { status: 500 }
    );
  }
}
