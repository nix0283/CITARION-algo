"""
CITARION Lumibot Trading Service
FastAPI application for algorithmic trading with Lumibot
"""
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timedelta
from typing import Optional
from contextlib import asynccontextmanager

# Add mini-services to path for shared imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mini-services"))

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import settings, STRATEGIES, BROKERS, TIMEFRAMES, StrategyDefinition
from strategies import STRATEGY_REGISTRY, get_strategy
from shared.cors_config import get_cors_config, validate_cors_security


# ============== Global State ==============

# Active strategies storage
active_strategies: dict[str, dict] = {}

# Signals storage (in-memory, should use Redis in production)
signals_storage: list[dict] = []

# Backtest results cache
backtest_cache: dict[str, dict] = {}


# ============== Lifespan ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print(f"🚀 {settings.SERVICE_NAME} v{settings.SERVICE_VERSION} starting...")
    print(f"📡 Listening on {settings.HOST}:{settings.PORT}")
    
    # Validate CORS security on startup
    if not validate_cors_security():
        print("⚠️ CORS security validation failed. Check ALLOWED_ORIGINS configuration.")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down service...")
    # Stop all active strategies
    for strategy_id in list(active_strategies.keys()):
        await stop_strategy(strategy_id)


# ============== FastAPI App ==============

app = FastAPI(
    title=settings.SERVICE_NAME,
    version=settings.SERVICE_VERSION,
    description="Algorithmic trading service powered by Lumibot",
    lifespan=lifespan,
)

# CORS middleware - uses secure configuration from environment
# Set ALLOWED_ORIGINS environment variable for production
# Example: ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
app.add_middleware(
    CORSMiddleware,
    **get_cors_config()
)


# ============== Request/Response Models ==============

class BacktestRequest(BaseModel):
    """Backtest request parameters"""
    strategy: str = Field(..., description="Strategy ID")
    symbol: str = Field(..., description="Trading symbol (e.g., BTC/USDT)")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")
    initial_cash: float = Field(100000, description="Initial capital")
    parameters: dict = Field(default_factory=dict, description="Strategy parameters")
    timeframe: str = Field("1h", description="Trading timeframe")


class LiveTradingRequest(BaseModel):
    """Live trading request parameters"""
    strategy: str = Field(..., description="Strategy ID")
    symbol: str = Field(..., description="Trading symbol")
    broker: str = Field("paper", description="Broker ID (ccxt, alpaca, ib, paper)")
    paper_trading: bool = Field(True, description="Use paper trading")
    parameters: dict = Field(default_factory=dict, description="Strategy parameters")


class StrategyInfo(BaseModel):
    """Strategy information"""
    id: str
    name: str
    description: str
    category: str
    timeframe: str
    parameters: dict


class SignalInfo(BaseModel):
    """Signal information"""
    id: str
    type: str
    timestamp: str
    strategy: str
    data: dict


class ActiveStrategyInfo(BaseModel):
    """Active strategy information"""
    strategy_id: str
    strategy_name: str
    symbol: str
    broker: str
    paper_trading: bool
    status: str
    started_at: str
    parameters: dict


# ============== Health & Status Endpoints ==============

@app.get("/")
async def root():
    """Service status endpoint"""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "status": "running",
        "timestamp": datetime.utcnow().isoformat(),
        "active_strategies": len(active_strategies),
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ============== Strategies Endpoints ==============

@app.get("/strategies")
async def list_strategies():
    """List all available strategies"""
    strategies = []
    for id, defn in STRATEGIES.items():
        strategies.append({
            "name": id,
            "class": defn.name,
            "description": defn.description,
            "category": defn.category,
            "timeframe": defn.timeframe,
        })
    return {"strategies": strategies, "count": len(strategies)}


@app.get("/strategies/{strategy_id}")
async def get_strategy_details(strategy_id: str):
    """Get detailed strategy information"""
    if strategy_id not in STRATEGIES:
        raise HTTPException(status_code=404, detail="Strategy not found")
        
    defn = STRATEGIES[strategy_id]
    
    return {
        "id": strategy_id,
        "name": defn.name,
        "description": defn.description,
        "category": defn.category,
        "timeframe": defn.timeframe,
        "parameters": {
            k: {
                "type": v.type,
                "default": v.default,
                "min": v.min,
                "max": v.max,
                "description": v.description,
            }
            for k, v in defn.parameters.items()
        },
    }


# ============== Backtesting Endpoints ==============

@app.post("/backtest")
async def run_backtest(request: BacktestRequest):
    """Run backtest for a strategy"""
    if request.strategy not in STRATEGIES:
        raise HTTPException(status_code=404, detail="Strategy not found")
        
    # Run backtest (simplified simulation)
    result = await simulate_backtest(request)
    return result


@app.post("/backtest/simulate")
async def simulate_backtest(request: BacktestRequest):
    """Simulate backtest results (for testing without Lumibot)"""
    import random
    import math
    
    # Generate simulated backtest results
    days = (datetime.strptime(request.end_date, "%Y-%m-%d") - 
            datetime.strptime(request.start_date, "%Y-%m-%d")).days
    
    if days <= 0:
        raise HTTPException(status_code=400, detail="Invalid date range")
        
    # Generate simulated metrics based on strategy type
    base_return = random.uniform(-0.2, 0.5)  # -20% to +50%
    if request.strategy == "rsi_reversal":
        base_return = random.uniform(-0.1, 0.3)
    elif request.strategy == "macd_trend":
        base_return = random.uniform(-0.15, 0.4)
    elif request.strategy == "grid_trading":
        base_return = random.uniform(0.05, 0.2)  # Grid usually positive
        
    total_return_pct = base_return * 100
    final_value = request.initial_cash * (1 + base_return)
    
    # Generate equity curve
    equity_curve = []
    current_equity = request.initial_cash
    for i in range(days):
        daily_return = random.gauss(base_return / days, 0.02)
        current_equity *= (1 + daily_return)
        equity_curve.append({
            "date": (datetime.strptime(request.start_date, "%Y-%m-%d") + timedelta(days=i)).isoformat(),
            "equity": round(current_equity, 2),
            "return_pct": round((current_equity / request.initial_cash - 1) * 100, 2),
        })
        
    # Generate simulated signals
    signals = []
    num_signals = random.randint(5, 20)
    for i in range(num_signals):
        signal_date = datetime.strptime(request.start_date, "%Y-%m-%d") + timedelta(days=random.randint(0, days-1))
        signals.append({
            "id": str(uuid.uuid4()),
            "type": random.choice(["BUY", "SELL"]),
            "timestamp": signal_date.isoformat(),
            "strategy": request.strategy,
            "data": {
                "symbol": request.symbol,
                "price": random.uniform(20000, 70000),  # BTC-like prices
                "reason": f"Signal {i+1}",
            }
        })
        
    # Calculate metrics
    winning_trades = int(num_signals * random.uniform(0.4, 0.7))
    losing_trades = num_signals - winning_trades
    
    result = {
        "strategy": request.strategy,
        "symbol": request.symbol,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "initial_cash": request.initial_cash,
        "final_value": round(final_value, 2),
        "total_return": round(final_value - request.initial_cash, 2),
        "total_return_pct": round(total_return_pct, 2),
        "max_drawdown": round(abs(random.gauss(0.1, 0.05)) * request.initial_cash, 2),
        "max_drawdown_pct": round(random.uniform(5, 25), 2),
        "sharpe_ratio": round(random.uniform(0.5, 2.5), 2),
        "win_rate": round(winning_trades / num_signals * 100, 2) if num_signals > 0 else 0,
        "total_trades": num_signals,
        "winning_trades": winning_trades,
        "losing_trades": losing_trades,
        "signals": signals,
        "equity_curve": equity_curve,
    }
    
    return result


# ============== Live Trading Endpoints ==============

@app.get("/live")
async def list_active_strategies():
    """List all active trading strategies"""
    return {
        "active_strategies": list(active_strategies.values()),
        "count": len(active_strategies),
    }


@app.post("/live/start")
async def start_live_trading(request: LiveTradingRequest):
    """Start a live trading strategy"""
    if request.strategy not in STRATEGIES:
        raise HTTPException(status_code=404, detail="Strategy not found")
        
    if len(active_strategies) >= settings.MAX_ACTIVE_STRATEGIES:
        raise HTTPException(status_code=400, detail="Maximum active strategies reached")
        
    if request.broker not in BROKERS:
        raise HTTPException(status_code=400, detail="Unsupported broker")
        
    # Generate strategy ID
    strategy_id = str(uuid.uuid4())
    
    # Store active strategy
    active_strategies[strategy_id] = {
        "strategy_id": strategy_id,
        "strategy_name": request.strategy,
        "symbol": request.symbol,
        "broker": request.broker,
        "paper_trading": request.paper_trading,
        "status": "running",
        "started_at": datetime.utcnow().isoformat(),
        "parameters": request.parameters,
    }
    
    return {
        "status": "started",
        "strategy_id": strategy_id,
        "message": f"Strategy {request.strategy} started on {request.symbol}",
    }


@app.post("/live/{strategy_id}/stop")
async def stop_live_trading(strategy_id: str):
    """Stop a live trading strategy"""
    if strategy_id not in active_strategies:
        raise HTTPException(status_code=404, detail="Strategy not found")
        
    await stop_strategy(strategy_id)
    
    return {
        "status": "stopped",
        "strategy_id": strategy_id,
    }


@app.delete("/live")
async def stop_all_strategies():
    """Stop all active strategies"""
    for strategy_id in list(active_strategies.keys()):
        await stop_strategy(strategy_id)
        
    return {"status": "stopped_all", "count": len(active_strategies)}


async def stop_strategy(strategy_id: str):
    """Stop a specific strategy"""
    if strategy_id in active_strategies:
        active_strategies[strategy_id]["status"] = "stopped"
        active_strategies[strategy_id]["stopped_at"] = datetime.utcnow().isoformat()
        # In production, would actually stop the strategy thread/process


# ============== Signals Endpoints ==============

@app.get("/signals")
async def get_signals(limit: int = Query(100, le=500)):
    """Get recent trading signals"""
    return {
        "signals": signals_storage[-limit:],
        "count": len(signals_storage[-limit:]),
    }


@app.get("/signals/{strategy_id}")
async def get_strategy_signals(
    strategy_id: str,
    limit: int = Query(100, le=500)
):
    """Get signals for a specific strategy"""
    strategy_signals = [
        s for s in signals_storage 
        if s.get("strategy") == strategy_id
    ]
    
    return {
        "signals": strategy_signals[-limit:],
        "count": len(strategy_signals[-limit:]),
    }


# ============== Brokers Endpoints ==============

@app.get("/brokers")
async def list_brokers():
    """List all supported brokers"""
    return {
        "brokers": [
            {"id": k, **v} for k, v in BROKERS.items()
        ]
    }


# ============== Timeframes Endpoints ==============

@app.get("/timeframes")
async def list_timeframes():
    """List all supported timeframes"""
    return {"timeframes": TIMEFRAMES}


# ============== Utility Endpoints ==============

@app.get("/config")
async def get_config():
    """Get service configuration (non-sensitive)"""
    return {
        "service_name": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "max_active_strategies": settings.MAX_ACTIVE_STRATEGIES,
        "default_initial_cash": settings.DEFAULT_INITIAL_CASH,
        "supported_exchanges": BROKERS.get("ccxt", {}).get("exchanges", []),
    }


# ============== Main ==============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
