"""
Strategy module for IAF-CITARION integration.

Provides base classes and utilities for creating trading strategies
that can be executed within the CITARION platform.
"""

from .base import (
    TradingStrategy,
    StrategyRegistry,
    SignalType,
    Signal,
    StrategyConfig,
    StrategyState,
)

from .types import (
    TimeUnit,
    DataType,
    DataSource,
    DataSourceConfig,
    OHLCVData,
    IndicatorConfig,
)

from .risk import (
    PositionSize,
    TakeProfitRule,
    StopLossRule,
    RiskConfig,
)

from .indicators import (
    IndicatorCalculator,
    INDICATORS,
)

from .builtin import (
    RSIReversalStrategy,
    MACDCrossoverStrategy,
    BollingerBandsStrategy,
    EMACrossoverStrategy,
    GridStrategy,
    DCAStrategy,
)

__all__ = [
    # Base classes
    "TradingStrategy",
    "StrategyRegistry",
    "SignalType",
    "Signal",
    "StrategyConfig",
    "StrategyState",
    # Types
    "TimeUnit",
    "DataType",
    "DataSource",
    "DataSourceConfig",
    "OHLCVData",
    "IndicatorConfig",
    # Risk
    "PositionSize",
    "TakeProfitRule",
    "StopLossRule",
    "RiskConfig",
    # Indicators
    "IndicatorCalculator",
    "INDICATORS",
    # Built-in strategies
    "RSIReversalStrategy",
    "MACDCrossoverStrategy",
    "BollingerBandsStrategy",
    "EMACrossoverStrategy",
    "GridStrategy",
    "DCAStrategy",
]
