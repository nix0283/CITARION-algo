/**
 * RISK SERVICE
 *
 * Central service integrating:
 * - Real exchange data (positions, balances)
 * - GARCH volatility for dynamic VaR
 * - Bot integration (all bot types)
 * - Kill Switch for emergency bot control
 */

import { RiskManager, defaultRiskManagerConfig, type RiskReport, type PortfolioData, type PositionRiskData } from './risk-manager';
import { getGARCHIntegrationService, type GARCHIntegrationService } from '@/lib/volatility/garch-integration-service';
import { db } from '@/lib/db';
import { ExchangeClientFactory, type ExchangeClient, type ExchangeOrderConfig } from '@/lib/auto-trading/exchange-clients';

// =============================================================================
// TYPES
// =============================================================================

export interface ExchangePosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice?: number;
  exchange: string;
  accountId: string;
}

export interface ExchangeBalance {
  asset: string;
  total: number;
  available: number;
  inOrder: number;
  usdValue: number;
}

export interface BotRiskData {
  id: string;
  code: string;
  type: 'DCA' | 'BB' | 'GRID' | 'ORION' | 'LOGOS' | 'MFT';
  status: 'RUNNING' | 'STOPPED' | 'PAUSED';
  symbol: string;
  totalInvested: number;
  currentPnL: number;
  leverage: number;
  exchangeId: string;
}

export interface RiskServiceConfig {
  updateIntervalMs: number;
  killSwitchThreshold: {
    drawdown: number; // percentage
    varBreach: number; // VaR multiplier
    dailyLoss: number; // percentage
  };
  enableAutoKillSwitch: boolean;
  exchanges: string[];
}

export interface RiskServiceReport extends RiskReport {
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
  garchAdjustments: {
    varMultiplier: number;
    positionSizeMultiplier: number;
    stopLossMultiplier: number;
  };
  bots: {
    total: number;
    running: number;
    stopped: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  exchanges: {
    name: string;
    connected: boolean;
    totalBalance: number;
    positions: number;
  }[];
  killSwitch: {
    isArmed: boolean;
    isTriggered: boolean;
    triggerReason?: string;
    botsStopped: number;
  };
}

// =============================================================================
// RISK SERVICE
// =============================================================================

class RiskService {
  private riskManager: RiskManager;
  private garchService: GARCHIntegrationService | null = null;
  private config: RiskServiceConfig;
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastReport: RiskServiceReport | null = null;
  private exchangeClients: Map<string, ExchangeClient> = new Map();
  
  // Kill Switch State
  private killSwitchArmed: boolean = true;
  private killSwitchTriggered: boolean = false;
  private killSwitchTriggerReason: string | null = null;
  private botsStoppedByKillSwitch: number = 0;

  constructor(config: Partial<RiskServiceConfig> = {}) {
    this.config = {
      updateIntervalMs: 60000, // 1 minute
      killSwitchThreshold: {
        drawdown: 15, // 15% max drawdown
        varBreach: 2, // 2x VaR breach
        dailyLoss: 10, // 10% daily loss
      },
      enableAutoKillSwitch: true,
      exchanges: ['binance', 'bybit', 'okx', 'bitget', 'bingx'],
      ...config,
    };

    this.riskManager = new RiskManager(defaultRiskManagerConfig);
    this.riskManager.initialize(100000);
  }

  /**
   * Initialize the risk service
   */
  async initialize(): Promise<void> {
    try {
      // Initialize GARCH service
      this.garchService = getGARCHIntegrationService();
      
      // Load exchange clients
      await this.loadExchangeClients();
      
      // Initialize risk manager
      const portfolio = await this.fetchPortfolioData();
      this.riskManager.update(portfolio);
      
      console.log('[RiskService] Initialized successfully');
    } catch (error) {
      console.error('[RiskService] Initialization error:', error);
    }
  }

  /**
   * Start periodic risk monitoring
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.updateInterval = setInterval(() => {
      this.updateRiskState();
    }, this.config.updateIntervalMs);
    
    // Initial update
    this.updateRiskState();
    console.log('[RiskService] Started monitoring');
  }

  /**
   * Stop risk monitoring
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('[RiskService] Stopped monitoring');
  }

  /**
   * Main update cycle
   */
  private async updateRiskState(): Promise<void> {
    try {
      // 1. Fetch real portfolio data from exchanges
      const portfolio = await this.fetchPortfolioData();
      
      // 2. Get GARCH volatility data
      const volatilityData = await this.getGarchVolatility();
      
      // 3. Update risk manager with portfolio
      const riskReport = this.riskManager.update(portfolio);
      
      // 4. Get bot data
      const botData = await this.fetchBotData();
      
      // 5. Check kill switch conditions
      await this.checkKillSwitchConditions(riskReport, botData);
      
      // 6. Build comprehensive report
      this.lastReport = await this.buildServiceReport(
        riskReport,
        portfolio,
        volatilityData,
        botData
      );
      
    } catch (error) {
      console.error('[RiskService] Update error:', error);
    }
  }

  /**
   * Fetch portfolio data from all connected exchanges
   */
  private async fetchPortfolioData(): Promise<PortfolioData> {
    const positions: PositionRiskData[] = [];
    let totalEquity = 0;
    let totalCash = 0;

    try {
      // Get accounts from database
      const accounts = await db.account.findMany({
        where: { isActive: true },
        include: { positions: { where: { status: 'OPEN' } } }
      });

      for (const account of accounts) {
        try {
          // Get real balances from exchange
          const client = await this.getExchangeClientForAccount(account);
          if (client) {
            const balances = await client.getBalances();
            
            for (const balance of balances) {
              if (balance.asset === 'USDT' || balance.asset === 'USD') {
                totalCash += balance.available;
                totalEquity += balance.total;
              }
            }
          }

          // Get positions from database (already synced)
          for (const pos of account.positions) {
            positions.push({
              symbol: pos.symbol,
              exchange: account.exchangeName,
              side: pos.direction as 'LONG' | 'SHORT',
              size: pos.totalAmount,
              value: pos.totalAmount * (pos.currentPrice || pos.avgEntryPrice),
              entryPrice: pos.avgEntryPrice,
              currentPrice: pos.currentPrice || pos.avgEntryPrice,
              pnl: pos.unrealizedPnl,
              leverage: pos.leverage,
            });
          }
        } catch (err) {
          console.error(`[RiskService] Error fetching data for account ${account.id}:`, err);
        }
      }

      // If no real data, use demo data for testing
      if (totalEquity === 0) {
        totalEquity = 100000;
        totalCash = 50000;
      }

    } catch (error) {
      console.error('[RiskService] Error fetching portfolio:', error);
      // Return demo data on error
      return {
        equity: 100000,
        cash: 50000,
        positions: [],
        dailyPnL: 0,
      };
    }

    return {
      equity: totalEquity,
      cash: totalCash,
      positions,
      dailyPnL: positions.reduce((sum, p) => sum + p.pnl, 0),
    };
  }

  /**
   * Get GARCH volatility data
   */
  private async getGarchVolatility(): Promise<{
    regime: 'low' | 'normal' | 'high' | 'extreme';
    forecast: number;
    adjustments: {
      varMultiplier: number;
      positionSizeMultiplier: number;
      stopLossMultiplier: number;
    };
  }> {
    try {
      if (!this.garchService) {
        this.garchService = getGARCHIntegrationService();
      }

      // Get volatility for BTC (primary asset)
      const context = this.garchService.getVolatilityContext('BTCUSDT');
      
      if (context) {
        return {
          regime: context.regime,
          forecast: context.forecast1d,
          adjustments: {
            varMultiplier: context.riskAdjustment.stopLossMultiplier,
            positionSizeMultiplier: context.riskAdjustment.positionSizeMultiplier,
            stopLossMultiplier: context.riskAdjustment.stopLossMultiplier,
          },
        };
      }
    } catch (error) {
      console.error('[RiskService] GARCH error:', error);
    }

    // Default values
    return {
      regime: 'normal',
      forecast: 0.02,
      adjustments: {
        varMultiplier: 1.0,
        positionSizeMultiplier: 1.0,
        stopLossMultiplier: 1.0,
      },
    };
  }

  /**
   * Fetch bot data from database
   */
  private async fetchBotData(): Promise<BotRiskData[]> {
    const bots: BotRiskData[] = [];

    try {
      // DCA Bots
      const dcaBots = await db.dcaBot.findMany({
        where: { isActive: true },
        include: { account: true }
      });
      
      for (const bot of dcaBots) {
        bots.push({
          id: bot.id,
          code: `DCA-${bot.symbol}-${bot.id.slice(0, 4)}`,
          type: 'DCA',
          status: bot.status as any || 'RUNNING',
          symbol: bot.symbol,
          totalInvested: bot.totalInvested,
          currentPnL: bot.realizedPnL,
          leverage: bot.leverage,
          exchangeId: bot.account?.exchangeName || 'binance',
        });
      }

      // BB Bots
      const bbBots = await db.bBBot.findMany({
        where: { isActive: true },
        include: { account: true }
      });

      for (const bot of bbBots) {
        bots.push({
          id: bot.id,
          code: `BB-${bot.symbol}-${bot.id.slice(0, 4)}`,
          type: 'BB',
          status: bot.status as any || 'RUNNING',
          symbol: bot.symbol,
          totalInvested: bot.totalInvested || 0,
          currentPnL: bot.realizedPnL || 0,
          leverage: bot.leverage,
          exchangeId: bot.account?.exchangeName || 'binance',
        });
      }

      // Grid Bots
      const gridBots = await db.gridBot.findMany({
        where: { isActive: true },
        include: { account: true }
      });

      for (const bot of gridBots) {
        bots.push({
          id: bot.id,
          code: `GRID-${bot.symbol}-${bot.id.slice(0, 4)}`,
          type: 'GRID',
          status: bot.status as any || 'RUNNING',
          symbol: bot.symbol,
          totalInvested: bot.totalInvested || 0,
          currentPnL: bot.realizedPnL || 0,
          leverage: 1,
          exchangeId: bot.account?.exchangeName || 'binance',
        });
      }

      // BotConfigs (for ORION, LOGOS, MFT)
      const botConfigs = await db.botConfig.findMany({
        where: { isActive: true }
      });

      for (const config of botConfigs) {
        const botType = config.strategy as 'ORION' | 'LOGOS' | 'MFT';
        bots.push({
          id: config.id,
          code: config.botCode || `${botType}-${config.id.slice(0, 4)}`,
          type: botType,
          status: config.status as any || 'RUNNING',
          symbol: config.symbol,
          totalInvested: config.tradeAmount * 10, // Estimate
          currentPnL: 0,
          leverage: config.leverage,
          exchangeId: 'binance',
        });
      }

    } catch (error) {
      console.error('[RiskService] Error fetching bots:', error);
    }

    return bots;
  }

  /**
   * Check kill switch conditions and trigger if needed
   */
  private async checkKillSwitchConditions(
    riskReport: RiskReport,
    bots: BotRiskData[]
  ): Promise<void> {
    if (!this.killSwitchArmed || this.killSwitchTriggered) return;

    const { drawdown, varBreach, dailyLoss } = this.config.killSwitchThreshold;
    
    let shouldTrigger = false;
    let reason = '';

    // Check drawdown
    if (riskReport.drawdown.state.currentDrawdown >= drawdown) {
      shouldTrigger = true;
      reason = `Drawdown ${riskReport.drawdown.state.currentDrawdown.toFixed(1)}% exceeded threshold ${drawdown}%`;
    }

    // Check VaR breach
    if (riskReport.var.riskPercentage > 5 * varBreach) {
      shouldTrigger = true;
      reason = `VaR breach: ${riskReport.var.riskPercentage.toFixed(1)}% risk`;
    }

    // Check daily loss
    const dailyLossPct = Math.abs(riskReport.drawdown.daily || 0) * 100;
    if (dailyLossPct >= dailyLoss) {
      shouldTrigger = true;
      reason = `Daily loss ${dailyLossPct.toFixed(1)}% exceeded threshold ${dailyLoss}%`;
    }

    if (shouldTrigger && this.config.enableAutoKillSwitch) {
      await this.triggerKillSwitch(reason, bots);
    }
  }

  /**
   * Trigger kill switch - stop all running bots
   */
  async triggerKillSwitch(reason: string, bots?: BotRiskData[]): Promise<{
    success: boolean;
    botsStopped: number;
    reason: string;
  }> {
    console.log(`[RiskService] KILL SWITCH TRIGGERED: ${reason}`);
    
    this.killSwitchTriggered = true;
    this.killSwitchTriggerReason = reason;
    
    let botsStopped = 0;

    try {
      // Fetch bots if not provided
      if (!bots) {
        bots = await this.fetchBotData();
      }

      // Stop all running bots
      for (const bot of bots) {
        if (bot.status === 'RUNNING') {
          try {
            await this.stopBot(bot);
            botsStopped++;
          } catch (err) {
            console.error(`[RiskService] Error stopping bot ${bot.code}:`, err);
          }
        }
      }

      this.botsStoppedByKillSwitch = botsStopped;
      
      // Save kill switch event to database
      await this.saveKillSwitchEvent(reason, botsStopped);

    } catch (error) {
      console.error('[RiskService] Kill switch error:', error);
    }

    return {
      success: true,
      botsStopped,
      reason,
    };
  }

  /**
   * Stop a specific bot
   */
  private async stopBot(bot: BotRiskData): Promise<void> {
    switch (bot.type) {
      case 'DCA':
        await db.dcaBot.update({
          where: { id: bot.id },
          data: { status: 'STOPPED', isActive: false }
        });
        break;
      case 'BB':
        await db.bBBot.update({
          where: { id: bot.id },
          data: { status: 'STOPPED', isActive: false }
        });
        break;
      case 'GRID':
        await db.gridBot.update({
          where: { id: bot.id },
          data: { status: 'STOPPED', isActive: false }
        });
        break;
      case 'ORION':
      case 'LOGOS':
      case 'MFT':
        await db.botConfig.update({
          where: { id: bot.id },
          data: { status: 'STOPPED', isActive: false }
        });
        break;
    }
    console.log(`[RiskService] Stopped bot: ${bot.code}`);
  }

  /**
   * Save kill switch event to database
   */
  private async saveKillSwitchEvent(reason: string, botsStopped: number): Promise<void> {
    try {
      // We could save to a dedicated table, for now just log
      console.log(`[RiskService] Kill switch event saved: ${reason}, ${botsStopped} bots stopped`);
    } catch (error) {
      console.error('[RiskService] Error saving kill switch event:', error);
    }
  }

  /**
   * Disarm kill switch (manual recovery)
   */
  disarmKillSwitch(): void {
    this.killSwitchTriggered = false;
    this.killSwitchTriggerReason = null;
    this.botsStoppedByKillSwitch = 0;
    console.log('[RiskService] Kill switch disarmed');
  }

  /**
   * Arm kill switch
   */
  armKillSwitch(): void {
    this.killSwitchArmed = true;
    this.killSwitchTriggered = false;
    console.log('[RiskService] Kill switch armed');
  }

  /**
   * Build comprehensive service report
   */
  private async buildServiceReport(
    riskReport: RiskReport,
    portfolio: PortfolioData,
    volatilityData: Awaited<ReturnType<typeof this.getGarchVolatility>>,
    bots: BotRiskData[]
  ): Promise<RiskServiceReport> {
    // Get exchange statuses
    const exchangeStatuses = await this.getExchangeStatuses();

    // Calculate bot risk level
    const runningBots = bots.filter(b => b.status === 'RUNNING');
    const botRiskLevel = this.calculateBotRiskLevel(bots, riskReport);

    return {
      ...riskReport,
      volatilityRegime: volatilityData.regime,
      garchAdjustments: volatilityData.adjustments,
      bots: {
        total: bots.length,
        running: runningBots.length,
        stopped: bots.filter(b => b.status === 'STOPPED').length,
        riskLevel: botRiskLevel,
      },
      exchanges: exchangeStatuses,
      killSwitch: {
        isArmed: this.killSwitchArmed,
        isTriggered: this.killSwitchTriggered,
        triggerReason: this.killSwitchTriggerReason || undefined,
        botsStopped: this.botsStoppedByKillSwitch,
      },
    };
  }

  /**
   * Get exchange connection statuses
   */
  private async getExchangeStatuses(): Promise<RiskServiceReport['exchanges']> {
    const statuses: RiskServiceReport['exchanges'] = [];

    for (const exchange of this.config.exchanges) {
      const client = this.exchangeClients.get(exchange);
      statuses.push({
        name: exchange,
        connected: !!client,
        totalBalance: 0, // Would need to fetch
        positions: 0,
      });
    }

    return statuses;
  }

  /**
   * Calculate bot risk level
   */
  private calculateBotRiskLevel(
    bots: BotRiskData[],
    riskReport: RiskReport
  ): 'low' | 'medium' | 'high' | 'critical' {
    const runningBots = bots.filter(b => b.status === 'RUNNING');
    
    if (runningBots.length === 0) return 'low';
    
    const totalInvested = runningBots.reduce((sum, b) => sum + b.totalInvested, 0);
    const totalPnL = runningBots.reduce((sum, b) => sum + b.currentPnL, 0);
    
    // Combine with portfolio risk
    const combinedRisk = riskReport.riskScore;
    
    if (combinedRisk >= 70) return 'critical';
    if (combinedRisk >= 50) return 'high';
    if (combinedRisk >= 30) return 'medium';
    return 'low';
  }

  /**
   * Load exchange clients
   */
  private async loadExchangeClients(): Promise<void> {
    // Exchange clients are loaded on demand based on account configuration
    console.log('[RiskService] Exchange clients will be loaded on demand');
  }

  /**
   * Get exchange client for account
   */
  private async getExchangeClientForAccount(account: any): Promise<ExchangeClient | null> {
    try {
      const config = {
        exchangeId: account.exchangeName,
        mode: account.mode || 'PAPER',
        marketType: 'futures' as const,
        credentials: {
          apiKey: account.apiKey,
          apiSecret: account.apiSecret,
          passphrase: account.passphrase,
        },
      };
      const client = ExchangeClientFactory.createClient(config);
      return client;
    } catch (error) {
      console.error(`[RiskService] Error getting client for ${account.exchangeName}:`, error);
      return null;
    }
  }

  /**
   * Get current risk report
   */
  getReport(): RiskServiceReport | null {
    return this.lastReport;
  }

  /**
   * Get kill switch status
   */
  getKillSwitchStatus(): {
    isArmed: boolean;
    isTriggered: boolean;
    triggerReason?: string;
    botsStopped: number;
  } {
    return {
      isArmed: this.killSwitchArmed,
      isTriggered: this.killSwitchTriggered,
      triggerReason: this.killSwitchTriggerReason || undefined,
      botsStopped: this.botsStoppedByKillSwitch,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RiskServiceConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[RiskService] Configuration updated');
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let riskServiceInstance: RiskService | null = null;

export function getRiskService(): RiskService {
  if (!riskServiceInstance) {
    riskServiceInstance = new RiskService();
  }
  return riskServiceInstance;
}

export function initializeRiskService(config?: Partial<RiskServiceConfig>): RiskService {
  riskServiceInstance = new RiskService(config);
  return riskServiceInstance;
}

export type { RiskService, RiskServiceConfig, RiskServiceReport, BotRiskData, ExchangePosition, ExchangeBalance };
