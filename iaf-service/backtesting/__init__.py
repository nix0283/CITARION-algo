"""
Backtesting module for IAF.

Provides event-driven and vectorized backtesting engines for
testing trading strategies against historical data.
"""

from .types import (
    BacktestConfig,
    BacktestPosition,
    BacktestTrade,
    EquityPoint,
    BacktestMetrics,
    TradeType,
    PositionSide,
)

from .engine import BacktestEngine, BacktestResult

__all__ = [
    "BacktestConfig",
    "BacktestPosition",
    "BacktestTrade",
    "EquityPoint",
    "BacktestMetrics",
    "TradeType",
    "PositionSide",
    "BacktestEngine",
    "BacktestResult",
]
