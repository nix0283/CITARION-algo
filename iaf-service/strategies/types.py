"""
Core types for IAF strategies.

This module defines the fundamental types used throughout the IAF framework
for CITARION integration.
"""

from enum import Enum
from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass, field
from datetime import datetime
import pandas as pd


class TimeUnit(Enum):
    """Time unit for strategy execution intervals."""
    SECOND = "second"
    MINUTE = "minute"
    HOUR = "hour"
    DAY = "day"
    WEEK = "week"


class DataType(Enum):
    """Types of market data supported by the framework."""
    OHLCV = "ohlcv"
    TICKER = "ticker"
    ORDERBOOK = "orderbook"
    TRADES = "trades"
    FUNDING_RATE = "funding_rate"
    OPEN_INTEREST = "open_interest"


class SignalType(Enum):
    """Types of trading signals."""
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"
    CLOSE_LONG = "close_long"
    CLOSE_SHORT = "close_short"
    NO_SIGNAL = "no_signal"


class PositionSide(Enum):
    """Position side for trading."""
    LONG = "long"
    SHORT = "short"
    BOTH = "both"


class OrderType(Enum):
    """Order types for execution."""
    MARKET = "market"
    LIMIT = "limit"
    STOP_MARKET = "stop_market"
    STOP_LIMIT = "stop_limit"
    TAKE_PROFIT = "take_profit"
    TRAILING_STOP = "trailing_stop"


class ExchangeType(Enum):
    """Supported exchanges in CITARION."""
    BINANCE = "binance"
    BYBIT = "bybit"
    OKX = "okx"
    BITGET = "bitget"
    BINGX = "bingx"


@dataclass
class OHLCVData:
    """
    OHLCV candlestick data structure.

    Attributes:
        timestamp: Unix timestamp in milliseconds
        open: Opening price
        high: Highest price
        low: Lowest price
        close: Closing price
        volume: Trading volume
    """
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    @classmethod
    def from_list(cls, data: List[Any]) -> "OHLCVData":
        """Create OHLCVData from a list [timestamp, open, high, low, close, volume]."""
        return cls(
            timestamp=int(data[0]),
            open=float(data[1]),
            high=float(data[2]),
            low=float(data[3]),
            close=float(data[4]),
            volume=float(data[5]) if len(data) > 5 else 0.0
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "timestamp": self.timestamp,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume
        }


@dataclass
class DataSourceConfig:
    """
    Configuration for a data source.

    Defines how market data should be fetched and processed.
    """
    identifier: str
    data_type: DataType
    symbol: str
    exchange: ExchangeType
    timeframe: str = "1h"
    window_size: int = 500
    pandas: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "identifier": self.identifier,
            "data_type": self.data_type.value,
            "symbol": self.symbol,
            "exchange": self.exchange.value,
            "timeframe": self.timeframe,
            "window_size": self.window_size,
            "pandas": self.pandas
        }


@dataclass
class DataSource:
    """
    Runtime data source with loaded data.

    Represents a data source that has been configured and potentially
    loaded with historical data.
    """
    config: DataSourceConfig
    data: Optional[pd.DataFrame] = None
    last_update: Optional[datetime] = None

    def is_loaded(self) -> bool:
        """Check if data has been loaded."""
        return self.data is not None and len(self.data) > 0

    def get_latest_candle(self) -> Optional[OHLCVData]:
        """Get the most recent candle."""
        if self.data is None or len(self.data) == 0:
            return None

        last_row = self.data.iloc[-1]
        return OHLCVData(
            timestamp=int(last_row.get("timestamp", last_row.name)),
            open=float(last_row["open"]),
            high=float(last_row["high"]),
            low=float(last_row["low"]),
            close=float(last_row["close"]),
            volume=float(last_row.get("volume", 0))
        )

    def get_price(self) -> Optional[float]:
        """Get the current/close price."""
        candle = self.get_latest_candle()
        return candle.close if candle else None


@dataclass
class IndicatorConfig:
    """
    Configuration for a technical indicator.

    Attributes:
        name: Indicator name (e.g., "rsi", "ema", "macd")
        period: Primary period for calculation
        source: Price source ("close", "open", "high", "low", "hl2", "hlc3")
        parameters: Additional parameters for the indicator
        result_column: Column name for the result
    """
    name: str
    period: int = 14
    source: str = "close"
    parameters: Dict[str, Any] = field(default_factory=dict)
    result_column: Optional[str] = None

    def __post_init__(self):
        if self.result_column is None:
            self.result_column = f"{self.name}_{self.period}"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "period": self.period,
            "source": self.source,
            "parameters": self.parameters,
            "result_column": self.result_column
        }


@dataclass
class Signal:
    """
    Trading signal generated by a strategy.

    Attributes:
        type: Signal type (buy, sell, hold, etc.)
        symbol: Trading symbol
        price: Price at signal generation
        timestamp: When the signal was generated
        confidence: Signal confidence (0.0 to 1.0)
        reason: Human-readable reason for the signal
        metadata: Additional metadata
    """
    type: SignalType
    symbol: str
    price: float
    timestamp: datetime
    confidence: float = 1.0
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def is_actionable(self) -> bool:
        """Check if this signal requires action."""
        return self.type not in [SignalType.HOLD, SignalType.NO_SIGNAL]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "type": self.type.value,
            "symbol": self.symbol,
            "price": self.price,
            "timestamp": self.timestamp.isoformat(),
            "confidence": self.confidence,
            "reason": self.reason,
            "metadata": self.metadata
        }


@dataclass
class StrategyConfig:
    """
    Complete strategy configuration.

    Contains all settings needed to run a strategy.
    """
    algorithm_id: str
    time_unit: TimeUnit = TimeUnit.HOUR
    interval: int = 1
    symbols: List[str] = field(default_factory=list)
    exchanges: List[ExchangeType] = field(default_factory=list)
    description: str = ""
    version: str = "1.0.0"
    author: str = ""
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "algorithm_id": self.algorithm_id,
            "time_unit": self.time_unit.value,
            "interval": self.interval,
            "symbols": self.symbols,
            "exchanges": [e.value for e in self.exchanges],
            "description": self.description,
            "version": self.version,
            "author": self.author,
            "tags": self.tags
        }


@dataclass
class StrategyState:
    """
    Runtime state of a strategy.

    Tracks the current state during strategy execution.
    """
    is_active: bool = False
    last_run: Optional[datetime] = None
    last_signal: Optional[Signal] = None
    signals_generated: int = 0
    trades_executed: int = 0
    errors: List[str] = field(default_factory=list)
    custom_state: Dict[str, Any] = field(default_factory=dict)

    def record_signal(self, signal: Signal) -> None:
        """Record a generated signal."""
        self.last_signal = signal
        self.signals_generated += 1
        self.last_run = datetime.utcnow()

    def record_error(self, error: str) -> None:
        """Record an error."""
        self.errors.append(error)
        # Keep only last 100 errors
        if len(self.errors) > 100:
            self.errors = self.errors[-100:]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "is_active": self.is_active,
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "last_signal": self.last_signal.to_dict() if self.last_signal else None,
            "signals_generated": self.signals_generated,
            "trades_executed": self.trades_executed,
            "errors": self.errors[-10:],  # Last 10 errors
            "custom_state": self.custom_state
        }
