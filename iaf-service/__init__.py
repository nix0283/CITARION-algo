"""
Investing Algorithm Framework Integration for CITARION

This module provides a Python-based framework for creating, testing, and deploying
algorithmic trading strategies that integrate with the CITARION trading platform.

Key Features:
- Strategy Framework with declarative configuration
- Risk Management with TP/SL rules
- Backtesting Engine (event-driven + vectorized)
- Portfolio Management
- Integration with CITARION exchanges (Binance, Bybit, OKX, Bitget, BingX)
"""

__version__ = "1.0.0"
__author__ = "CITARION Team"

from .strategies import (
    TradingStrategy,
    StrategyRegistry,
    SignalType,
    TimeUnit,
    DataType,
    DataSource,
    PositionSize,
    TakeProfitRule,
    StopLossRule,
)

from .risk_management import (
    RiskManager,
    RiskRule,
    TrailingStopConfig,
    BreakevenConfig,
)

from .portfolio import (
    PortfolioManager,
    PortfolioState,
    PositionState,
)

from .backtesting import (
    BacktestEngine,
    BacktestConfig,
    BacktestResult,
    BacktestMetrics,
)

from .api import create_app

__all__ = [
    # Strategies
    "TradingStrategy",
    "StrategyRegistry",
    "SignalType",
    "TimeUnit",
    "DataType",
    "DataSource",
    "PositionSize",
    "TakeProfitRule",
    "StopLossRule",
    # Risk Management
    "RiskManager",
    "RiskRule",
    "TrailingStopConfig",
    "BreakevenConfig",
    # Portfolio
    "PortfolioManager",
    "PortfolioState",
    "PositionState",
    # Backtesting
    "BacktestEngine",
    "BacktestConfig",
    "BacktestResult",
    "BacktestMetrics",
    # API
    "create_app",
]
