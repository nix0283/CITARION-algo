"""
FastAPI application for IAF-CITARION integration.

This module provides REST API endpoints for interacting with
the IAF service from the CITARION Next.js application.
"""

import os
import sys

# Add mini-services to path for shared imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "mini-services"))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
import asyncio

from ..strategies import (
    TradingStrategy,
    StrategyRegistry,
    Signal,
    SignalType,
    TimeUnit,
    DataType,
    DataSource,
    DataSourceConfig,
    ExchangeType,
    PositionSize,
    TakeProfitRule,
    StopLossRule,
    RiskConfig,
)

from ..backtesting import BacktestEngine, BacktestConfig
from ..portfolio import PortfolioManager
from shared.cors_config import get_cors_config, validate_cors_security


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Pydantic models for API
class DataSourceRequest(BaseModel):
    """Request model for creating a data source."""
    identifier: str
    data_type: str = "ohlcv"
    symbol: str
    exchange: str
    timeframe: str = "1h"
    window_size: int = 500


class PositionSizeRequest(BaseModel):
    """Request model for position size configuration."""
    symbol: str
    percentage_of_portfolio: float = 10.0
    fixed_amount: Optional[float] = None
    max_amount: Optional[float] = None
    min_amount: Optional[float] = None
    risk_per_trade: Optional[float] = None


class TakeProfitRequest(BaseModel):
    """Request model for take profit configuration."""
    symbol: str
    percentage_threshold: float = 10.0
    trailing: bool = False
    trailing_offset: float = 2.0
    sell_percentage: float = 100.0


class StopLossRequest(BaseModel):
    """Request model for stop loss configuration."""
    symbol: str
    percentage_threshold: float = 5.0
    trailing: bool = False
    trailing_offset: float = 2.0
    trailing_activation: float = 0.0


class StrategyCreateRequest(BaseModel):
    """Request model for creating a strategy."""
    strategy_type: str
    symbol: str
    exchange: str = "binance"
    timeframe: str = "1h"
    custom_params: Dict[str, Any] = {}
    position_sizes: List[PositionSizeRequest] = []
    take_profits: List[TakeProfitRequest] = []
    stop_losses: List[StopLossRequest] = []


class BacktestRequest(BaseModel):
    """Request model for running a backtest."""
    strategy_id: str
    start_date: str
    end_date: str
    initial_capital: float = 10000.0
    commission: float = 0.001


class SignalResponse(BaseModel):
    """Response model for signals."""
    type: str
    symbol: str
    price: float
    timestamp: str
    confidence: float
    reason: str
    metadata: Dict[str, Any] = {}


class StrategyInfoResponse(BaseModel):
    """Response model for strategy information."""
    algorithm_id: str
    description: str
    version: str
    symbols: List[str]
    exchanges: List[str]
    time_unit: str
    interval: int


class BacktestResultResponse(BaseModel):
    """Response model for backtest results."""
    strategy_id: str
    start_date: str
    end_date: str
    initial_capital: float
    final_capital: float
    total_return: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    max_drawdown: float
    sharpe_ratio: float
    trades: List[Dict[str, Any]] = []


# Application state
class AppState:
    """Application state for managing strategies and data."""
    def __init__(self):
        self.strategies: Dict[str, TradingStrategy] = {}
        self.data_cache: Dict[str, Any] = {}


app_state = AppState()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="IAF Service for CITARION",
        description="Investing Algorithm Framework integration service",
        version="1.0.0",
    )

    # Validate CORS security on startup
    if not validate_cors_security():
        logger.warning("CORS security validation failed. Check ALLOWED_ORIGINS configuration.")

    # Configure CORS - uses secure configuration from environment
    # Set ALLOWED_ORIGINS environment variable for production
    # Example: ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
    app.add_middleware(
        CORSMiddleware,
        **get_cors_config()
    )

    @app.get("/")
    async def root():
        """Root endpoint."""
        return {
            "service": "IAF Service for CITARION",
            "version": "1.0.0",
            "status": "running",
            "timestamp": datetime.utcnow().isoformat()
        }

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

    # ==================== Strategy Endpoints ====================

    @app.get("/strategies")
    async def list_strategies():
        """List all registered strategies."""
        strategies = []
        for algo_id in StrategyRegistry.list():
            strategy_class = StrategyRegistry.get(algo_id)
            if strategy_class:
                strategies.append({
                    "algorithm_id": algo_id,
                    "description": strategy_class.description,
                    "version": strategy_class.version,
                    "symbols": strategy_class.symbols,
                    "exchanges": [e.value for e in strategy_class.exchanges],
                    "time_unit": strategy_class.time_unit.value,
                    "interval": strategy_class.interval,
                })

        return {"strategies": strategies}

    @app.get("/strategies/{strategy_id}")
    async def get_strategy(strategy_id: str):
        """Get information about a specific strategy."""
        strategy_class = StrategyRegistry.get(strategy_id)
        if not strategy_class:
            raise HTTPException(status_code=404, detail="Strategy not found")

        return {
            "algorithm_id": strategy_id,
            "description": strategy_class.description,
            "version": strategy_class.version,
            "symbols": strategy_class.symbols,
            "exchanges": [e.value for e in strategy_class.exchanges],
            "time_unit": strategy_class.time_unit.value,
            "interval": strategy_class.interval,
        }

    @app.post("/strategies/create")
    async def create_strategy(request: StrategyCreateRequest):
        """Create a new strategy instance."""
        try:
            # Create strategy instance
            strategy = StrategyRegistry.create(
                request.strategy_type,
                symbol=request.symbol,
                exchange=ExchangeType(request.exchange),
                timeframe=request.timeframe,
                **request.custom_params
            )

            if not strategy:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown strategy type: {request.strategy_type}"
                )

            # Apply custom risk configuration if provided
            if request.position_sizes or request.take_profits or request.stop_losses:
                risk_config = RiskConfig(
                    position_sizes=[
                        PositionSize(**ps.dict()) for ps in request.position_sizes
                    ],
                    take_profits=[
                        TakeProfitRule(**tp.dict()) for tp in request.take_profits
                    ],
                    stop_losses=[
                        StopLossRule(**sl.dict()) for sl in request.stop_losses
                    ]
                )
                strategy.risk_config = risk_config

            # Store strategy
            instance_id = f"{request.strategy_type}_{request.symbol}_{datetime.utcnow().timestamp()}"
            app_state.strategies[instance_id] = strategy

            return {
                "instance_id": instance_id,
                "strategy": strategy.to_dict()
            }

        except Exception as e:
            logger.error(f"Error creating strategy: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ==================== Signal Endpoints ====================

    @app.post("/strategies/{instance_id}/signals")
    async def generate_signals(
        instance_id: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """Generate signals for a strategy instance."""
        strategy = app_state.strategies.get(instance_id)
        if not strategy:
            raise HTTPException(status_code=404, detail="Strategy instance not found")

        try:
            signals = strategy.generate_signals(data)
            return {
                "instance_id": instance_id,
                "signals": [s.to_dict() for s in signals],
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Error generating signals: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/strategies/{instance_id}/state")
    async def get_strategy_state(instance_id: str):
        """Get the current state of a strategy instance."""
        strategy = app_state.strategies.get(instance_id)
        if not strategy:
            raise HTTPException(status_code=404, detail="Strategy instance not found")

        return strategy.state.to_dict()

    # ==================== Backtest Endpoints ====================

    @app.post("/backtest")
    async def run_backtest(request: BacktestRequest):
        """Run a backtest for a strategy."""
        try:
            # Get strategy
            strategy = app_state.strategies.get(request.strategy_id)
            if not strategy:
                raise HTTPException(
                    status_code=404,
                    detail="Strategy instance not found"
                )

            # Configure backtest
            config = BacktestConfig(
                start_date=datetime.fromisoformat(request.start_date),
                end_date=datetime.fromisoformat(request.end_date),
                initial_capital=request.initial_capital,
                commission=request.commission
            )

            # Run backtest
            engine = BacktestEngine(config)
            result = await engine.run(strategy)

            return {
                "strategy_id": request.strategy_id,
                "result": result.to_dict()
            }

        except Exception as e:
            logger.error(f"Backtest error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ==================== Indicator Endpoints ====================

    @app.post("/indicators/calculate")
    async def calculate_indicator(
        indicator_name: str,
        data: List[Dict[str, Any]],
        params: Dict[str, Any] = {}
    ):
        """Calculate a technical indicator on provided data."""
        import pandas as pd
        from ..strategies.indicators import calculate_indicator

        try:
            df = pd.DataFrame(data)
            result_df = calculate_indicator(df, indicator_name, **params)

            return {
                "indicator": indicator_name,
                "params": params,
                "data": result_df.to_dict(orient="records")[-100:],  # Last 100 rows
                "columns": list(result_df.columns)
            }

        except Exception as e:
            logger.error(f"Indicator calculation error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ==================== Risk Configuration Endpoints ====================

    @app.get("/risk/presets")
    async def get_risk_presets():
        """Get predefined risk configuration presets."""
        from ..strategies.risk import CONSERVATIVE_RISK, MODERATE_RISK, AGGRESSIVE_RISK

        return {
            "presets": {
                "conservative": CONSERVATIVE_RISK.to_dict(),
                "moderate": MODERATE_RISK.to_dict(),
                "aggressive": AGGRESSIVE_RISK.to_dict()
            }
        }

    @app.post("/position-size/calculate")
    async def calculate_position_size(
        portfolio_value: float,
        current_price: float,
        config: PositionSizeRequest,
        stop_loss_price: Optional[float] = None
    ):
        """Calculate position size based on configuration."""
        position_size = PositionSize(**config.dict())
        size = position_size.calculate_size(
            portfolio_value=portfolio_value,
            current_price=current_price,
            stop_loss_price=stop_loss_price
        )

        return {
            "position_size": size,
            "position_value": size * current_price,
            "percentage_of_portfolio": (size * current_price / portfolio_value) * 100
        }

    # ==================== Exchange Integration Endpoints ====================

    @app.get("/exchanges")
    async def list_exchanges():
        """List supported exchanges."""
        return {
            "exchanges": [e.value for e in ExchangeType],
            "description": {
                "binance": "Binance Exchange",
                "bybit": "Bybit Exchange",
                "okx": "OKX Exchange",
                "bitget": "Bitget Exchange",
                "bingx": "BingX Exchange"
            }
        }

    @app.get("/timeframes")
    async def list_timeframes():
        """List supported timeframes."""
        return {
            "timeframes": [
                {"value": "1m", "label": "1 Minute"},
                {"value": "5m", "label": "5 Minutes"},
                {"value": "15m", "label": "15 Minutes"},
                {"value": "30m", "label": "30 Minutes"},
                {"value": "1h", "label": "1 Hour"},
                {"value": "2h", "label": "2 Hours"},
                {"value": "4h", "label": "4 Hours"},
                {"value": "6h", "label": "6 Hours"},
                {"value": "12h", "label": "12 Hours"},
                {"value": "1d", "label": "1 Day"},
                {"value": "3d", "label": "3 Days"},
                {"value": "1w", "label": "1 Week"},
            ]
        }

    return app


# Create the application instance
app = create_app()
