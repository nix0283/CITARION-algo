/**
 * Prometheus Metrics API Endpoint
 * 
 * Exports metrics in Prometheus text format for scraping by Prometheus server.
 * Can be used by Grafana dashboards for visualization.
 */

import { NextResponse } from "next/server";
import { getPrometheusExporter, getApiMetricsCollector } from "@/lib/analytics/prometheus-exporter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const exporter = getPrometheusExporter();
    const apiMetrics = getApiMetricsCollector();
    
    // Get trading metrics
    const tradingMetrics = await exporter.getMetrics();
    
    // Get API metrics
    const apiMetricsText = apiMetrics.exportPrometheus();
    
    // Combine all metrics
    const allMetrics = [
      "# CITARION Trading Platform Metrics",
      "# Generated at:", new Date().toISOString(),
      "",
      tradingMetrics,
      "",
      apiMetricsText,
    ].join("\n");
    
    return new Response(allMetrics, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[Metrics] Error generating metrics:", error);
    
    return new Response(
      [
        "# Error generating metrics",
        `# Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        `# Time: ${new Date().toISOString()}`,
      ].join("\n"),
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
        },
      }
    );
  }
}
