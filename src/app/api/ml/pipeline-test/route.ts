/**
 * ML Pipeline Test API
 * 
 * Endpoints for testing the ML signal pipeline
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSignalPipelineTester } from '@/lib/ml/signal-pipeline-tester'

/**
 * GET /api/ml/pipeline-test
 * 
 * Get test status
 */
export async function GET() {
  try {
    const tester = getSignalPipelineTester()
    const results = tester.getResults()
    
    return NextResponse.json({
      success: true,
      lastResults: results.slice(-10),
      totalResults: results.length,
    })
  } catch (error) {
    console.error('[ML Pipeline Test API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get test status', message: String(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ml/pipeline-test
 * 
 * Run pipeline tests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { testType } = body
    
    const tester = getSignalPipelineTester()
    
    // Run all tests
    const results = await tester.runAllTests()
    
    return NextResponse.json({
      success: true,
      summary: {
        total: results.totalTests,
        passed: results.passedTests,
        failed: results.failedTests,
        passRate: results.totalTests > 0 
          ? (results.passedTests / results.totalTests * 100).toFixed(1) + '%'
          : '0%',
        totalDuration: results.totalDuration.toFixed(2) + 'ms',
        avgDuration: results.avgDuration.toFixed(2) + 'ms',
      },
      results: results.results,
    })
  } catch (error) {
    console.error('[ML Pipeline Test API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to run tests', message: String(error) },
      { status: 500 }
    )
  }
}
