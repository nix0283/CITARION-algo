"""
Base strategy class for IAF.

This module provides the abstract base class for all trading strategies
in the IAF framework, following the Investing Algorithm Framework patterns
adapted for CITARION integration.
"""

from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any, Type, ClassVar
from datetime import datetime
import logging
import pandas as pd

from .types import (
    Signal,
    SignalType,
    TimeUnit,
    DataType,
    DataSource,
    DataSourceConfig,
    StrategyConfig,
    StrategyState,
    ExchangeType,
)
from .risk import RiskConfig, PositionSize, TakeProfitRule, StopLossRule


logger = logging.getLogger(__name__)


class TradingStrategy(ABC):
    """
    Abstract base class for trading strategies.

    This class provides the foundation for all trading strategies in the IAF framework.
    Subclasses must implement the generate_buy_signals and generate_sell_signals methods.

    Class Attributes:
        algorithm_id: Unique identifier for the strategy
        time_unit: Time unit for strategy execution (SECOND, MINUTE, HOUR, DAY)
        interval: Execution interval (e.g., every 2 hours)
        symbols: List of trading symbols
        exchanges: List of supported exchanges
        description: Strategy description
        version: Strategy version
    """

    # Class-level configuration (override in subclasses)
    algorithm_id: ClassVar[str] = "base-strategy"
    time_unit: ClassVar[TimeUnit] = TimeUnit.HOUR
    interval: ClassVar[int] = 1
    symbols: ClassVar[List[str]] = []
    exchanges: ClassVar[List[ExchangeType]] = []
    description: ClassVar[str] = ""
    version: ClassVar[str] = "1.0.0"

    def __init__(
        self,
        data_sources: Optional[List[DataSource]] = None,
        risk_config: Optional[RiskConfig] = None,
        position_sizes: Optional[List[PositionSize]] = None,
        take_profits: Optional[List[TakeProfitRule]] = None,
        stop_losses: Optional[List[StopLossRule]] = None,
        custom_config: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize the trading strategy.

        Args:
            data_sources: List of data sources for the strategy
            risk_config: Complete risk configuration (overrides individual rules)
            position_sizes: Position sizing rules (used if risk_config not provided)
            take_profits: Take profit rules (used if risk_config not provided)
            stop_losses: Stop loss rules (used if risk_config not provided)
            custom_config: Custom configuration parameters
        """
        self.data_sources: Dict[str, DataSource] = {}
        self.custom_config = custom_config or {}
        self.state = StrategyState()
        self.logger = logging.getLogger(f"strategy.{self.algorithm_id}")

        # Initialize data sources
        if data_sources:
            for ds in data_sources:
                self.data_sources[ds.config.identifier] = ds

        # Initialize risk configuration
        if risk_config:
            self.risk_config = risk_config
        else:
            self.risk_config = RiskConfig(
                position_sizes=position_sizes or [],
                take_profits=take_profits or [],
                stop_losses=stop_losses or []
            )

    @property
    def config(self) -> StrategyConfig:
        """Get the strategy configuration."""
        return StrategyConfig(
            algorithm_id=self.algorithm_id,
            time_unit=self.time_unit,
            interval=self.interval,
            symbols=self.symbols,
            exchanges=self.exchanges,
            description=self.description,
            version=self.version
        )

    def add_data_source(self, data_source: DataSource) -> None:
        """Add a data source to the strategy."""
        self.data_sources[data_source.config.identifier] = data_source

    def get_data(self, identifier: str) -> Optional[pd.DataFrame]:
        """Get data from a specific data source."""
        ds = self.data_sources.get(identifier)
        return ds.data if ds else None

    def get_latest_price(self, symbol: str) -> Optional[float]:
        """Get the latest price for a symbol."""
        for ds in self.data_sources.values():
            if ds.config.symbol == symbol:
                return ds.get_price()
        return None

    def get_data_source(self, symbol: str) -> Optional[DataSource]:
        """Get data source for a symbol."""
        for ds in self.data_sources.values():
            if ds.config.symbol == symbol:
                return ds
        return None

    @abstractmethod
    def generate_buy_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """
        Generate buy signals for all symbols.

        This method must be implemented by subclasses. It receives all data
        from configured data sources and should return a dictionary mapping
        symbols to boolean Series indicating buy signals.

        Args:
            data: Dictionary of data source identifier -> DataFrame

        Returns:
            Dictionary mapping symbol -> boolean Series (True where buy signal)
        """
        pass

    @abstractmethod
    def generate_sell_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """
        Generate sell signals for all symbols.

        This method must be implemented by subclasses. It receives all data
        from configured data sources and should return a dictionary mapping
        symbols to boolean Series indicating sell signals.

        Args:
            data: Dictionary of data source identifier -> DataFrame

        Returns:
            Dictionary mapping symbol -> boolean Series (True where sell signal)
        """
        pass

    def generate_signals(self, data: Optional[Dict[str, Any]] = None) -> List[Signal]:
        """
        Generate all trading signals.

        This method combines buy and sell signals and converts them to
        Signal objects with metadata.

        Args:
            data: Data to use (if None, uses loaded data sources)

        Returns:
            List of Signal objects
        """
        if data is None:
            data = {k: v.data for k, v in self.data_sources.items() if v.data is not None}

        if not data:
            self.logger.warning("No data available for signal generation")
            return []

        signals = []

        # Generate buy signals
        try:
            buy_signals = self.generate_buy_signals(data)
            for symbol, signal_series in buy_signals.items():
                if signal_series.iloc[-1]:  # Check latest signal
                    price = self.get_latest_price(symbol)
                    if price:
                        signal = Signal(
                            type=SignalType.BUY,
                            symbol=symbol,
                            price=price,
                            timestamp=datetime.utcnow(),
                            reason=f"Buy signal from {self.algorithm_id}"
                        )
                        signals.append(signal)
                        self.state.record_signal(signal)
        except Exception as e:
            self.logger.error(f"Error generating buy signals: {e}")
            self.state.record_error(str(e))

        # Generate sell signals
        try:
            sell_signals = self.generate_sell_signals(data)
            for symbol, signal_series in sell_signals.items():
                if signal_series.iloc[-1]:  # Check latest signal
                    price = self.get_latest_price(symbol)
                    if price:
                        signal = Signal(
                            type=SignalType.SELL,
                            symbol=symbol,
                            price=price,
                            timestamp=datetime.utcnow(),
                            reason=f"Sell signal from {self.algorithm_id}"
                        )
                        signals.append(signal)
                        self.state.record_signal(signal)
        except Exception as e:
            self.logger.error(f"Error generating sell signals: {e}")
            self.state.record_error(str(e))

        return signals

    def on_tick(self, tick_data: Dict[str, Any]) -> Optional[Signal]:
        """
        Process a tick update (for real-time trading).

        Override this method for real-time signal generation.

        Args:
            tick_data: Current tick data

        Returns:
            Signal if one should be generated, None otherwise
        """
        return None

    def on_candle(self, symbol: str, candle: Dict[str, Any]) -> List[Signal]:
        """
        Process a new candle (for candle-based strategies).

        Override this method for candle-based signal generation.

        Args:
            symbol: Trading symbol
            candle: New candle data

        Returns:
            List of signals generated
        """
        return []

    def on_position_opened(self, position: Dict[str, Any]) -> None:
        """
        Called when a position is opened.

        Override this method to handle position opened events.

        Args:
            position: Position information
        """
        pass

    def on_position_closed(self, position: Dict[str, Any], reason: str) -> None:
        """
        Called when a position is closed.

        Override this method to handle position closed events.

        Args:
            position: Position information
            reason: Reason for closure (take_profit, stop_loss, signal, manual)
        """
        self.state.trades_executed += 1

    def validate(self) -> List[str]:
        """
        Validate the strategy configuration.

        Returns:
            List of validation errors (empty if valid)
        """
        errors = []

        if not self.algorithm_id:
            errors.append("algorithm_id is required")

        if not self.symbols:
            errors.append("At least one symbol is required")

        if not self.data_sources:
            errors.append("At least one data source is required")

        # Validate risk configuration
        for symbol in self.symbols:
            if not self.risk_config.get_position_size(symbol):
                # Check for wildcard
                has_wildcard = any(
                    ps.symbol == "*" for ps in self.risk_config.position_sizes
                )
                if not has_wildcard:
                    errors.append(f"Position size not configured for {symbol}")

        return errors

    def to_dict(self) -> Dict[str, Any]:
        """Convert strategy to dictionary representation."""
        return {
            "config": self.config.to_dict(),
            "risk_config": self.risk_config.to_dict(),
            "state": self.state.to_dict(),
            "data_sources": {
                k: v.config.to_dict() for k, v in self.data_sources.items()
            }
        }


class StrategyRegistry:
    """
    Registry for trading strategies.

    Allows registration and retrieval of strategy classes by ID.
    """

    _strategies: Dict[str, Type[TradingStrategy]] = {}

    @classmethod
    def register(cls, strategy_class: Type[TradingStrategy]) -> Type[TradingStrategy]:
        """
        Register a strategy class.

        Can be used as a decorator:

        @StrategyRegistry.register
        class MyStrategy(TradingStrategy):
            ...

        Args:
            strategy_class: Strategy class to register

        Returns:
            The registered strategy class
        """
        cls._strategies[strategy_class.algorithm_id] = strategy_class
        return strategy_class

    @classmethod
    def get(cls, algorithm_id: str) -> Optional[Type[TradingStrategy]]:
        """Get a strategy class by ID."""
        return cls._strategies.get(algorithm_id)

    @classmethod
    def list(cls) -> List[str]:
        """List all registered strategy IDs."""
        return list(cls._strategies.keys())

    @classmethod
    def create(cls, algorithm_id: str, **kwargs) -> Optional[TradingStrategy]:
        """
        Create a strategy instance by ID.

        Args:
            algorithm_id: Strategy ID
            **kwargs: Arguments to pass to strategy constructor

        Returns:
            Strategy instance or None if not found
        """
        strategy_class = cls.get(algorithm_id)
        if strategy_class:
            return strategy_class(**kwargs)
        return None

    @classmethod
    def unregister(cls, algorithm_id: str) -> bool:
        """Unregister a strategy by ID."""
        if algorithm_id in cls._strategies:
            del cls._strategies[algorithm_id]
            return True
        return False
