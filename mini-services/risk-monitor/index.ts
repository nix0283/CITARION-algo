/**
 * Risk Monitor WebSocket Service
 * Real-time risk monitoring with kill switch support
 *
 * Port: 3004
 */

import { Server } from "socket.io";

const PORT = 3004;

// CORS Configuration
const getAllowedOrigins = (): string[] => {
  const env = process.env.NODE_ENV || 'development';
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;

  if (allowedOriginsEnv) {
    return allowedOriginsEnv.split(',').map(origin => origin.trim()).filter(Boolean);
  }

  if (env === 'production') {
    console.error(
      '[SECURITY] ALLOWED_ORIGINS not set in production. ' +
      'CORS will block all cross-origin requests.'
    );
    return [];
  }

  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];
};

const allowedOrigins = getAllowedOrigins();

// Types
interface RiskState {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  totalExposure: number;
  totalPnL: number;
  drawdown: number;
  varValue: number;
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
  timestamp: Date;
}

interface KillSwitchState {
  isArmed: boolean;
  isTriggered: boolean;
  triggerReason?: string;
  botsStopped: number;
  lastTriggeredAt?: Date;
}

interface RiskAlert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  data?: any;
  timestamp: Date;
  acknowledged: boolean;
}

interface BotSummary {
  total: number;
  running: number;
  stopped: number;
  byType: Record<string, number>;
}

// State
let riskState: RiskState = {
  riskScore: 25,
  riskLevel: 'low',
  totalExposure: 45000,
  totalPnL: 1250,
  drawdown: 2.5,
  varValue: 2847,
  volatilityRegime: 'normal',
  timestamp: new Date(),
};

let killSwitchState: KillSwitchState = {
  isArmed: true,
  isTriggered: false,
  botsStopped: 0,
};

let botSummary: BotSummary = {
  total: 5,
  running: 3,
  stopped: 2,
  byType: { DCA: 2, BB: 1, GRID: 1, ORION: 1 },
};

const alertHistory: RiskAlert[] = [];
const MAX_ALERTS = 100;

// Initialize Socket.IO server
const io = new Server(PORT, {
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.length === 0) {
        const env = process.env.NODE_ENV || 'development';
        if (env === 'production') {
          callback(new Error('CORS policy: No origins configured'), false);
        } else {
          callback(null, true);
        }
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy: Origin not allowed'), false);
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(`Risk Monitor Service running on port ${PORT}`);
console.log(`CORS allowed origins: ${allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'All (development only)'}`);

// ==================== Helper Functions ====================

function addAlert(alert: Omit<RiskAlert, 'id' | 'timestamp' | 'acknowledged'>) {
  const newAlert: RiskAlert = {
    ...alert,
    id: `alert-${Date.now()}`,
    timestamp: new Date(),
    acknowledged: false,
  };
  
  alertHistory.unshift(newAlert);
  if (alertHistory.length > MAX_ALERTS) {
    alertHistory.pop();
  }
  
  io.emit('risk_alert', newAlert);
  return newAlert;
}

function updateRiskState(updates: Partial<RiskState>) {
  const previousLevel = riskState.riskLevel;
  riskState = { ...riskState, ...updates, timestamp: new Date() };
  
  // Determine risk level based on score
  if (riskState.riskScore >= 70) {
    riskState.riskLevel = 'critical';
  } else if (riskState.riskScore >= 50) {
    riskState.riskLevel = 'high';
  } else if (riskState.riskScore >= 30) {
    riskState.riskLevel = 'medium';
  } else {
    riskState.riskLevel = 'low';
  }
  
  // Check for level changes
  if (previousLevel !== riskState.riskLevel) {
    addAlert({
      type: riskState.riskLevel === 'critical' ? 'critical' : 
            riskState.riskLevel === 'high' ? 'critical' : 'warning',
      message: `Risk level changed from ${previousLevel} to ${riskState.riskLevel}`,
      data: { previousLevel, newLevel: riskState.riskLevel, riskScore: riskState.riskScore },
    });
  }
  
  // Check for kill switch conditions
  checkKillSwitchConditions();
  
  io.emit('risk_update', riskState);
}

function checkKillSwitchConditions() {
  if (!killSwitchState.isArmed || killSwitchState.isTriggered) return;
  
  // Auto-trigger conditions
  if (riskState.drawdown >= 15) {
    triggerKillSwitch(`Drawdown exceeded 15%: ${riskState.drawdown.toFixed(1)}%`);
  } else if (riskState.riskScore >= 80) {
    triggerKillSwitch(`Risk score too high: ${riskState.riskScore}`);
  } else if (riskState.volatilityRegime === 'extreme' && riskState.riskScore >= 50) {
    triggerKillSwitch(`Extreme volatility with elevated risk: ${riskState.riskScore}`);
  }
}

async function triggerKillSwitch(reason: string) {
  killSwitchState = {
    ...killSwitchState,
    isTriggered: true,
    triggerReason: reason,
    botsStopped: botSummary.running,
    lastTriggeredAt: new Date(),
  };
  
  // Stop all running bots
  const previousRunning = botSummary.running;
  botSummary = {
    ...botSummary,
    running: 0,
    stopped: botSummary.total,
  };
  
  addAlert({
    type: 'critical',
    message: `KILL SWITCH TRIGGERED: ${reason}`,
    data: killSwitchState,
  });
  
  // Call main API to actually stop all bots
  try {
    const response = await fetch('http://localhost:3000/api/risk/killswitch/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await response.json();
    console.log('[RiskMonitor] Kill switch API response:', data);
    if (data.success && data.botsStopped !== undefined) {
      killSwitchState.botsStopped = data.botsStopped;
    }
  } catch (error) {
    console.error('[RiskMonitor] Failed to call kill switch API:', error);
    killSwitchState.botsStopped = previousRunning;
  }
  
  io.emit('killswitch_triggered', {
    reason,
    botsStopped: killSwitchState.botsStopped,
    timestamp: killSwitchState.lastTriggeredAt,
  });
  
  io.emit('killswitch_update', killSwitchState);
  io.emit('bot_summary_update', botSummary);
}

function armKillSwitch() {
  killSwitchState = {
    ...killSwitchState,
    isArmed: true,
    isTriggered: false,
    triggerReason: undefined,
    botsStopped: 0,
  };
  
  addAlert({
    type: 'info',
    message: 'Kill switch armed',
    data: killSwitchState,
  });
  
  io.emit('killswitch_update', killSwitchState);
}

function disarmKillSwitch() {
  killSwitchState = {
    ...killSwitchState,
    isArmed: false,
    isTriggered: false,
  };
  
  addAlert({
    type: 'warning',
    message: 'Kill switch DISARMED - Auto-protection disabled',
    data: killSwitchState,
  });
  
  io.emit('killswitch_update', killSwitchState);
}

function recoverKillSwitch() {
  killSwitchState = {
    ...killSwitchState,
    isTriggered: false,
    triggerReason: undefined,
    botsStopped: 0,
  };
  
  addAlert({
    type: 'info',
    message: 'Kill switch recovered - Trading can resume',
    data: killSwitchState,
  });
  
  io.emit('killswitch_update', killSwitchState);
}

// ==================== Simulation ====================

function simulateRiskUpdates() {
  // Simulate risk changes
  const riskChange = (Math.random() - 0.5) * 5;
  const newRiskScore = Math.max(0, Math.min(100, riskState.riskScore + riskChange));
  
  const pnlChange = (Math.random() - 0.5) * 500;
  const newPnL = riskState.totalPnL + pnlChange;
  const newDrawdown = newPnL < 0 ? Math.abs(newPnL) / (riskState.totalExposure + 50000) * 100 : riskState.drawdown * 0.95;
  
  // Random volatility regime change
  const regimes: ('low' | 'normal' | 'high' | 'extreme')[] = ['low', 'normal', 'normal', 'normal', 'high', 'high', 'extreme'];
  const randomRegime = regimes[Math.floor(Math.random() * regimes.length)];
  
  updateRiskState({
    riskScore: Math.round(newRiskScore),
    totalPnL: newPnL,
    drawdown: newDrawdown,
    volatilityRegime: randomRegime,
    varValue: riskState.totalExposure * (0.02 + Math.random() * 0.02),
  });
}

// Start simulation
setInterval(simulateRiskUpdates, 10000);

// ==================== Socket.IO Event Handlers ====================

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial data
  socket.emit("initial_data", {
    riskState,
    killSwitch: killSwitchState,
    botSummary,
    alerts: alertHistory.slice(0, 20),
  });

  // Get risk state
  socket.on("get_risk_state", () => {
    socket.emit("risk_update", riskState);
  });

  // Get kill switch state
  socket.on("get_killswitch", () => {
    socket.emit("killswitch_update", killSwitchState);
  });

  // Manual kill switch trigger
  socket.on("trigger_killswitch", (data: { reason?: string }) => {
    triggerKillSwitch(data.reason || "Manual trigger");
  });

  // Arm kill switch
  socket.on("arm_killswitch", () => {
    armKillSwitch();
  });

  // Disarm kill switch
  socket.on("disarm_killswitch", () => {
    disarmKillSwitch();
  });

  // Recover from kill switch
  socket.on("recover_killswitch", () => {
    recoverKillSwitch();
  });

  // Acknowledge alert
  socket.on("acknowledge_alert", (alertId: string) => {
    const alert = alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      io.emit('alert_acknowledged', alert);
    }
  });

  // Update risk manually
  socket.on("update_risk", (data: Partial<RiskState>) => {
    updateRiskState(data);
  });

  // Subscribe to risk updates
  socket.on("subscribe", () => {
    socket.join("risk_updates");
  });

  socket.on("unsubscribe", () => {
    socket.leave("risk_updates");
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ==================== API Integration ====================

// Fetch risk data from main API periodically
async function fetchRiskFromAPI() {
  try {
    const response = await fetch('http://localhost:3000/api/risk');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        updateRiskState({
          riskScore: data.data.riskScore || riskState.riskScore,
          totalExposure: data.data.exposure?.total || riskState.totalExposure,
          totalPnL: data.data.drawdown?.daily || riskState.totalPnL,
          drawdown: data.data.drawdown?.state?.currentDrawdown || riskState.drawdown,
          varValue: data.data.var?.var || riskState.varValue,
          volatilityRegime: data.data.volatilityRegime || riskState.volatilityRegime,
        });
      }
    }
  } catch (error) {
    console.error('[RiskMonitor] Error fetching from API:', error);
  }
}

// Fetch from API every 30 seconds
setInterval(fetchRiskFromAPI, 30000);

// ==================== Graceful Shutdown ====================

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  io.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

console.log("Risk Monitor Service initialized");
console.log("Features: Real-time risk monitoring, kill switch, alerts");
