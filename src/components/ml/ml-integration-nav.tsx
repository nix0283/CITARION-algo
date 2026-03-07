'use client'

/**
 * ML Integration Navigation Component
 * 
 * Provides navigation between:
 * - ML Filter
 * - LOGOS Engine
 * - Backtesting
 * 
 * Shows integration status and quick actions
 */

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Network,
  ArrowRight,
  ArrowLeftRight,
  Filter,
  Layers,
  LineChart,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Settings,
  Activity,
  Brain,
  Target,
  Zap,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface IntegrationStatus {
  mlFilter: {
    enabled: boolean
    signalsProcessed: number
    approvalRate: number
  }
  logos: {
    enabled: boolean
    mlWeight: number
    botsConnected: number
  }
  backtesting: {
    enabled: boolean
    lastRun: string | null
    accuracy: number | null
  }
}

interface IntegrationNavProps {
  currentSection: 'ml-filter' | 'logos' | 'backtesting'
  onNavigate: (section: 'ml-filter' | 'logos' | 'backtesting') => void
  status?: IntegrationStatus
}

// ============================================================================
// DEFAULT STATUS
// ============================================================================

const defaultStatus: IntegrationStatus = {
  mlFilter: {
    enabled: true,
    signalsProcessed: 0,
    approvalRate: 0,
  },
  logos: {
    enabled: true,
    mlWeight: 0.25,
    botsConnected: 0,
  },
  backtesting: {
    enabled: true,
    lastRun: null,
    accuracy: null,
  },
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MLIntegrationNav({
  currentSection,
  onNavigate,
  status = defaultStatus,
}: IntegrationNavProps) {
  const sections = [
    {
      id: 'ml-filter' as const,
      name: 'ML Filter',
      icon: Filter,
      description: 'Signal filtering and classification',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      status: status.mlFilter.enabled ? 'active' : 'inactive',
      metrics: [
        { label: 'Processed', value: status.mlFilter.signalsProcessed },
        { label: 'Approval', value: `${(status.mlFilter.approvalRate * 100).toFixed(1)}%` },
      ],
    },
    {
      id: 'logos' as const,
      name: 'LOGOS Engine',
      icon: Layers,
      description: 'Multi-bot signal aggregation',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      status: status.logos.enabled ? 'active' : 'inactive',
      metrics: [
        { label: 'ML Weight', value: `${(status.logos.mlWeight * 100).toFixed(0)}%` },
        { label: 'Bots', value: status.logos.botsConnected },
      ],
    },
    {
      id: 'backtesting' as const,
      name: 'Backtesting',
      icon: LineChart,
      description: 'Historical validation',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      status: status.backtesting.enabled ? 'active' : 'inactive',
      metrics: [
        { label: 'Last Run', value: status.backtesting.lastRun || 'Never' },
        { label: 'Accuracy', value: status.backtesting.accuracy ? `${(status.backtesting.accuracy * 100).toFixed(1)}%` : 'N/A' },
      ],
    },
  ]

  return (
    <Card className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-400" />
            ML Integration Pipeline
          </CardTitle>
          <Badge variant="outline" className="bg-slate-800">
            <Activity className="h-3 w-3 mr-1 text-green-400" />
            Connected
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pipeline Flow */}
        <div className="flex items-center justify-between gap-2">
          {sections.map((section, index) => {
            const Icon = section.icon
            const isActive = currentSection === section.id
            const isBefore = sections.findIndex(s => s.id === currentSection) > index

            return (
              <React.Fragment key={section.id}>
                <button
                  onClick={() => onNavigate(section.id)}
                  className={`flex-1 p-3 rounded-lg border transition-all ${
                    isActive
                      ? `${section.bgColor} border-${section.color.replace('text-', '')} ring-1 ring-${section.color.replace('text-', '')}/50`
                      : isBefore
                      ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                      : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className={`p-2 rounded-full ${section.bgColor}`}>
                      <Icon className={`h-4 w-4 ${section.color}`} />
                    </div>
                    <span className={`text-xs font-medium ${isActive ? section.color : 'text-slate-400'}`}>
                      {section.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {section.status === 'active' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-400" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-400" />
                      )}
                    </div>
                  </div>
                </button>
                {index < sections.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-slate-600 flex-shrink-0" />
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Integration Flow Description */}
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <ArrowLeftRight className="h-3 w-3" />
            Data Flow
          </div>
          <div className="text-xs text-slate-300">
            <span className="text-purple-400">ML Filter</span>
            <span className="text-slate-500 mx-1">→</span>
            Filters signals using Lawrence Classifier + ML models
            <span className="text-slate-500 mx-1">→</span>
            <span className="text-blue-400">LOGOS</span>
            <span className="text-slate-500 mx-1">→</span>
            Aggregates with ML-weighted scoring
            <span className="text-slate-500 mx-1">→</span>
            <span className="text-green-400">Backtesting</span>
            <span className="text-slate-500 mx-1">→</span>
            Validates on historical data
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => onNavigate('ml-filter')}
          >
            <Brain className="h-3 w-3 mr-1" />
            Configure ML
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => onNavigate('logos')}
          >
            <Target className="h-3 w-3 mr-1" />
            LOGOS Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => onNavigate('backtesting')}
          >
            <Zap className="h-3 w-3 mr-1" />
            Run Backtest
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// INTEGRATION STATUS PANEL
// ============================================================================

interface IntegrationStatusPanelProps {
  botType: 'DCA' | 'BB' | 'ORION' | 'ZENBOT' | 'VISION'
  stats?: {
    totalSignals: number
    approvedSignals: number
    rejectedSignals: number
    avgMLScore: number
    avgLawrenceScore: number
  }
  config?: {
    enabled: boolean
    minConfidence: number
    filterMode: 'STRICT' | 'MODERATE' | 'LENIENT'
  }
}

export function MLIntegrationStatusPanel({
  botType,
  stats,
  config,
}: IntegrationStatusPanelProps) {
  const isEnabled = config?.enabled ?? true
  const approvalRate = stats && stats.totalSignals > 0
    ? (stats.approvedSignals / stats.totalSignals) * 100
    : 0

  return (
    <Card className="bg-slate-900/80 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4 text-purple-400" />
            ML Integration - {botType}
          </CardTitle>
          <Badge
            variant={isEnabled ? 'default' : 'secondary'}
            className={isEnabled ? 'bg-green-600' : 'bg-slate-700'}
          >
            {isEnabled ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-500">Total Signals</div>
                <div className="text-lg font-bold text-white">{stats.totalSignals}</div>
              </div>
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-500">Approval Rate</div>
                <div className="text-lg font-bold text-green-400">{approvalRate.toFixed(1)}%</div>
              </div>
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-500">Avg ML Score</div>
                <div className="text-lg font-bold text-purple-400">
                  {((stats.avgMLScore || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-slate-800/50 rounded p-2">
                <div className="text-slate-500">Avg Lawrence</div>
                <div className="text-lg font-bold text-blue-400">
                  {((stats.avgLawrenceScore || 0) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Approval Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Approved</span>
                <span>Rejected</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${approvalRate}%` }}
                />
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: `${100 - approvalRate}%` }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-4 text-slate-500 text-sm">
            <AlertCircle className="h-4 w-4 mr-2" />
            No signals processed yet
          </div>
        )}

        {/* Config Summary */}
        {config && (
          <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-slate-800 pt-2">
            <Settings className="h-3 w-3" />
            <span>Mode: {config.filterMode}</span>
            <span>•</span>
            <span>Min Conf: {(config.minConfidence * 100).toFixed(0)}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// EXPORTS
// ============================================================================

export default MLIntegrationNav
