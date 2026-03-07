"""
Built-in trading strategies for IAF.

This module provides ready-to-use trading strategies that can be
customized and deployed within the CITARION platform.
"""

from typing import Dict, Any, List, Optional, ClassVar
import pandas as pd
import numpy as np

from .base import TradingStrategy, StrategyRegistry
from .types import (
    TimeUnit,
    DataType,
    DataSource,
    DataSourceConfig,
    ExchangeType,
)
from .risk import (
    PositionSize,
    TakeProfitRule,
    StopLossRule,
    RiskConfig,
)
from .indicators import IndicatorCalculator


@StrategyRegistry.register
class RSIReversalStrategy(TradingStrategy):
    """
    RSI Reversal Strategy.

    Generates buy signals when RSI is oversold and sell signals
    when RSI is overbought.

    Default Parameters:
        rsi_period: 14
        oversold_threshold: 30
        overbought_threshold: 70
    """

    algorithm_id: ClassVar[str] = "rsi-reversal"
    time_unit: ClassVar[TimeUnit] = TimeUnit.HOUR
    interval: ClassVar[int] = 4
    symbols: ClassVar[List[str]] = []
    exchanges: ClassVar[List[ExchangeType]] = [
        ExchangeType.BINANCE,
        ExchangeType.BYBIT,
        ExchangeType.OKX,
    ]
    description: ClassVar[str] = "RSI Reversal Strategy - Buy oversold, sell overbought"
    version: ClassVar[str] = "1.0.0"

    def __init__(
        self,
        symbol: str = "BTCUSDT",
        exchange: ExchangeType = ExchangeType.BINANCE,
        timeframe: str = "4h",
        rsi_period: int = 14,
        oversold_threshold: float = 30.0,
        overbought_threshold: float = 70.0,
        position_size_pct: float = 10.0,
        take_profit_pct: float = 5.0,
        stop_loss_pct: float = 3.0,
        **kwargs
    ):
        self.rsi_period = rsi_period
        self.oversold_threshold = oversold_threshold
        self.overbought_threshold = overbought_threshold
        self.timeframe = timeframe

        # Create data source
        data_sources = [
            DataSource(
                config=DataSourceConfig(
                    identifier=f"{symbol}_data",
                    data_type=DataType.OHLCV,
                    symbol=symbol,
                    exchange=exchange,
                    timeframe=timeframe,
                    window_size=500
                )
            )
        ]

        # Create risk config
        risk_config = RiskConfig(
            position_sizes=[
                PositionSize(symbol=symbol, percentage_of_portfolio=position_size_pct)
            ],
            take_profits=[
                TakeProfitRule(symbol=symbol, percentage_threshold=take_profit_pct)
            ],
            stop_losses=[
                StopLossRule(symbol=symbol, percentage_threshold=stop_loss_pct)
            ]
        )

        super().__init__(
            data_sources=data_sources,
            risk_config=risk_config,
            **kwargs
        )

        self.symbol = symbol

    def generate_buy_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate buy signals when RSI crosses above oversold threshold."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < self.rsi_period + 1:
                continue

            # Calculate RSI
            df = IndicatorCalculator.rsi(df, period=self.rsi_period)
            rsi_col = f"rsi_{self.rsi_period}"

            # Buy signal: RSI was oversold and is now rising above threshold
            buy_signal = (
                (df[rsi_col].shift(1) < self.oversold_threshold) &
                (df[rsi_col] > self.oversold_threshold)
            )

            symbol = identifier.replace("_data", "")
            signals[symbol] = buy_signal.fillna(False)

        return signals

    def generate_sell_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate sell signals when RSI crosses below overbought threshold."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < self.rsi_period + 1:
                continue

            # Calculate RSI
            df = IndicatorCalculator.rsi(df, period=self.rsi_period)
            rsi_col = f"rsi_{self.rsi_period}"

            # Sell signal: RSI was overbought and is now falling below threshold
            sell_signal = (
                (df[rsi_col].shift(1) > self.overbought_threshold) &
                (df[rsi_col] < self.overbought_threshold)
            )

            symbol = identifier.replace("_data", "")
            signals[symbol] = sell_signal.fillna(False)

        return signals


@StrategyRegistry.register
class MACDCrossoverStrategy(TradingStrategy):
    """
    MACD Crossover Strategy.

    Generates buy signals when MACD crosses above the signal line
    and sell signals when MACD crosses below the signal line.

    Default Parameters:
        fast_period: 12
        slow_period: 26
        signal_period: 9
    """

    algorithm_id: ClassVar[str] = "macd-crossover"
    time_unit: ClassVar[TimeUnit] = TimeUnit.HOUR
    interval: ClassVar[int] = 1
    symbols: ClassVar[List[str]] = []
    exchanges: ClassVar[List[ExchangeType]] = [
        ExchangeType.BINANCE,
        ExchangeType.BYBIT,
        ExchangeType.OKX,
    ]
    description: ClassVar[str] = "MACD Crossover Strategy"
    version: ClassVar[str] = "1.0.0"

    def __init__(
        self,
        symbol: str = "BTCUSDT",
        exchange: ExchangeType = ExchangeType.BINANCE,
        timeframe: str = "1h",
        fast_period: int = 12,
        slow_period: int = 26,
        signal_period: int = 9,
        position_size_pct: float = 10.0,
        take_profit_pct: float = 8.0,
        stop_loss_pct: float = 4.0,
        **kwargs
    ):
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.signal_period = signal_period
        self.timeframe = timeframe

        data_sources = [
            DataSource(
                config=DataSourceConfig(
                    identifier=f"{symbol}_data",
                    data_type=DataType.OHLCV,
                    symbol=symbol,
                    exchange=exchange,
                    timeframe=timeframe,
                    window_size=500
                )
            )
        ]

        risk_config = RiskConfig(
            position_sizes=[
                PositionSize(symbol=symbol, percentage_of_portfolio=position_size_pct)
            ],
            take_profits=[
                TakeProfitRule(symbol=symbol, percentage_threshold=take_profit_pct)
            ],
            stop_losses=[
                StopLossRule(symbol=symbol, percentage_threshold=stop_loss_pct)
            ]
        )

        super().__init__(
            data_sources=data_sources,
            risk_config=risk_config,
            **kwargs
        )

        self.symbol = symbol

    def generate_buy_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate buy signals on bullish MACD crossover."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < self.slow_period + self.signal_period:
                continue

            # Calculate MACD
            df = IndicatorCalculator.macd(
                df,
                fast_period=self.fast_period,
                slow_period=self.slow_period,
                signal_period=self.signal_period
            )

            # Buy signal: MACD crosses above signal line
            buy_signal = (
                (df["macd"].shift(1) <= df["macd_signal"].shift(1)) &
                (df["macd"] > df["macd_signal"])
            )

            symbol = identifier.replace("_data", "")
            signals[symbol] = buy_signal.fillna(False)

        return signals

    def generate_sell_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate sell signals on bearish MACD crossover."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < self.slow_period + self.signal_period:
                continue

            # Calculate MACD
            df = IndicatorCalculator.macd(
                df,
                fast_period=self.fast_period,
                slow_period=self.slow_period,
                signal_period=self.signal_period
            )

            # Sell signal: MACD crosses below signal line
            sell_signal = (
                (df["macd"].shift(1) >= df["macd_signal"].shift(1)) &
                (df["macd"] < df["macd_signal"])
            )

            symbol = identifier.replace("_data", "")
            signals[symbol] = sell_signal.fillna(False)

        return signals


@StrategyRegistry.register
class BollingerBandsStrategy(TradingStrategy):
    """
    Bollinger Bands Mean Reversion Strategy.

    Generates buy signals when price touches the lower band
    and sell signals when price touches the upper band.

    Default Parameters:
        period: 20
        std_dev: 2.0
    """

    algorithm_id: ClassVar[str] = "bollinger-bands"
    time_unit: ClassVar[TimeUnit] = TimeUnit.HOUR
    interval: ClassVar[int] = 1
    symbols: ClassVar[List[str]] = []
    exchanges: ClassVar[List[ExchangeType]] = [
        ExchangeType.BINANCE,
        ExchangeType.BYBIT,
        ExchangeType.OKX,
    ]
    description: ClassVar[str] = "Bollinger Bands Mean Reversion Strategy"
    version: ClassVar[str] = "1.0.0"

    def __init__(
        self,
        symbol: str = "BTCUSDT",
        exchange: ExchangeType = ExchangeType.BINANCE,
        timeframe: str = "1h",
        period: int = 20,
        std_dev: float = 2.0,
        position_size_pct: float = 10.0,
        take_profit_pct: float = 5.0,
        stop_loss_pct: float = 3.0,
        **kwargs
    ):
        self.period = period
        self.std_dev = std_dev
        self.timeframe = timeframe

        data_sources = [
            DataSource(
                config=DataSourceConfig(
                    identifier=f"{symbol}_data",
                    data_type=DataType.OHLCV,
                    symbol=symbol,
                    exchange=exchange,
                    timeframe=timeframe,
                    window_size=500
                )
            )
        ]

        risk_config = RiskConfig(
            position_sizes=[
                PositionSize(symbol=symbol, percentage_of_portfolio=position_size_pct)
            ],
            take_profits=[
                TakeProfitRule(symbol=symbol, percentage_threshold=take_profit_pct)
            ],
            stop_losses=[
                StopLossRule(symbol=symbol, percentage_threshold=stop_loss_pct)
            ]
        )

        super().__init__(
            data_sources=data_sources,
            risk_config=risk_config,
            **kwargs
        )

        self.symbol = symbol

    def generate_buy_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate buy signals when price touches lower band."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < self.period:
                continue

            # Calculate Bollinger Bands
            df = IndicatorCalculator.bollinger_bands(df, period=self.period, std_dev=self.std_dev)

            # Buy signal: Price crosses below lower band
            buy_signal = df["close"] < df["bb_lower"]

            symbol = identifier.replace("_data", "")
            signals[symbol] = buy_signal.fillna(False)

        return signals

    def generate_sell_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate sell signals when price touches upper band."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < self.period:
                continue

            # Calculate Bollinger Bands
            df = IndicatorCalculator.bollinger_bands(df, period=self.period, std_dev=self.std_dev)

            # Sell signal: Price crosses above upper band
            sell_signal = df["close"] > df["bb_upper"]

            symbol = identifier.replace("_data", "")
            signals[symbol] = sell_signal.fillna(False)

        return signals


@StrategyRegistry.register
class EMACrossoverStrategy(TradingStrategy):
    """
    EMA Crossover Strategy.

    Generates buy signals when short EMA crosses above long EMA
    and sell signals when short EMA crosses below long EMA.

    Default Parameters:
        short_period: 9
        long_period: 21
    """

    algorithm_id: ClassVar[str] = "ema-crossover"
    time_unit: ClassVar[TimeUnit] = TimeUnit.HOUR
    interval: ClassVar[int] = 1
    symbols: ClassVar[List[str]] = []
    exchanges: ClassVar[List[ExchangeType]] = [
        ExchangeType.BINANCE,
        ExchangeType.BYBIT,
        ExchangeType.OKX,
    ]
    description: ClassVar[str] = "EMA Crossover Strategy"
    version: ClassVar[str] = "1.0.0"

    def __init__(
        self,
        symbol: str = "BTCUSDT",
        exchange: ExchangeType = ExchangeType.BINANCE,
        timeframe: str = "1h",
        short_period: int = 9,
        long_period: int = 21,
        position_size_pct: float = 10.0,
        take_profit_pct: float = 10.0,
        stop_loss_pct: float = 5.0,
        trailing_stop: bool = True,
        **kwargs
    ):
        self.short_period = short_period
        self.long_period = long_period
        self.timeframe = timeframe

        data_sources = [
            DataSource(
                config=DataSourceConfig(
                    identifier=f"{symbol}_data",
                    data_type=DataType.OHLCV,
                    symbol=symbol,
                    exchange=exchange,
                    timeframe=timeframe,
                    window_size=500
                )
            )
        ]

        risk_config = RiskConfig(
            position_sizes=[
                PositionSize(symbol=symbol, percentage_of_portfolio=position_size_pct)
            ],
            take_profits=[
                TakeProfitRule(
                    symbol=symbol,
                    percentage_threshold=take_profit_pct,
                    trailing=True,
                    trailing_offset=2.0
                )
            ],
            stop_losses=[
                StopLossRule(
                    symbol=symbol,
                    percentage_threshold=stop_loss_pct,
                    trailing=trailing_stop,
                    trailing_offset=2.0
                )
            ]
        )

        super().__init__(
            data_sources=data_sources,
            risk_config=risk_config,
            **kwargs
        )

        self.symbol = symbol

    def generate_buy_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate buy signals on bullish EMA crossover."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < self.long_period:
                continue

            # Calculate EMAs
            df = IndicatorCalculator.ema(df, period=self.short_period, result_column="ema_short")
            df = IndicatorCalculator.ema(df, period=self.long_period, result_column="ema_long")

            # Buy signal: Short EMA crosses above long EMA
            buy_signal = (
                (df["ema_short"].shift(1) <= df["ema_long"].shift(1)) &
                (df["ema_short"] > df["ema_long"])
            )

            symbol = identifier.replace("_data", "")
            signals[symbol] = buy_signal.fillna(False)

        return signals

    def generate_sell_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate sell signals on bearish EMA crossover."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < self.long_period:
                continue

            # Calculate EMAs
            df = IndicatorCalculator.ema(df, period=self.short_period, result_column="ema_short")
            df = IndicatorCalculator.ema(df, period=self.long_period, result_column="ema_long")

            # Sell signal: Short EMA crosses below long EMA
            sell_signal = (
                (df["ema_short"].shift(1) >= df["ema_long"].shift(1)) &
                (df["ema_short"] < df["ema_long"])
            )

            symbol = identifier.replace("_data", "")
            signals[symbol] = sell_signal.fillna(False)

        return signals


@StrategyRegistry.register
class GridStrategy(TradingStrategy):
    """
    Grid Trading Strategy.

    Places buy and sell orders at predetermined price levels (grid).
    Profits from price oscillations within a range.

    This is a simplified implementation for signal generation.
    Full grid trading requires order management beyond signals.
    """

    algorithm_id: ClassVar[str] = "grid-trading"
    time_unit: ClassVar[TimeUnit] = TimeUnit.MINUTE
    interval: ClassVar[int] = 15
    symbols: ClassVar[List[str]] = []
    exchanges: ClassVar[List[ExchangeType]] = [
        ExchangeType.BINANCE,
        ExchangeType.BYBIT,
        ExchangeType.OKX,
    ]
    description: ClassVar[str] = "Grid Trading Strategy"
    version: ClassVar[str] = "1.0.0"

    def __init__(
        self,
        symbol: str = "BTCUSDT",
        exchange: ExchangeType = ExchangeType.BINANCE,
        timeframe: str = "15m",
        grid_levels: int = 10,
        grid_spacing_pct: float = 1.0,
        position_size_pct: float = 5.0,
        **kwargs
    ):
        self.grid_levels = grid_levels
        self.grid_spacing_pct = grid_spacing_pct
        self.timeframe = timeframe
        self.grid_prices: List[float] = []

        data_sources = [
            DataSource(
                config=DataSourceConfig(
                    identifier=f"{symbol}_data",
                    data_type=DataType.OHLCV,
                    symbol=symbol,
                    exchange=exchange,
                    timeframe=timeframe,
                    window_size=100
                )
            )
        ]

        risk_config = RiskConfig(
            position_sizes=[
                PositionSize(symbol=symbol, percentage_of_portfolio=position_size_pct)
            ],
            max_open_positions=grid_levels
        )

        super().__init__(
            data_sources=data_sources,
            risk_config=risk_config,
            **kwargs
        )

        self.symbol = symbol

    def _calculate_grid_levels(self, current_price: float) -> List[float]:
        """Calculate grid price levels around current price."""
        levels = []
        spacing = current_price * (self.grid_spacing_pct / 100)

        # Create grid above and below current price
        for i in range(-self.grid_levels // 2, self.grid_levels // 2 + 1):
            levels.append(current_price + (i * spacing))

        return sorted(levels)

    def generate_buy_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate buy signals when price hits grid level below."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < 2:
                continue

            current_price = df["close"].iloc[-1]

            # Calculate grid levels if not set
            if not self.grid_prices:
                self.grid_prices = self._calculate_grid_levels(current_price)

            # Find closest grid level below current price
            lower_levels = [l for l in self.grid_prices if l < current_price]

            if lower_levels:
                closest_lower = max(lower_levels)
                # Buy signal: Price dropped to a grid level
                buy_signal = df["close"] <= closest_lower * 1.001  # 0.1% tolerance
            else:
                buy_signal = pd.Series([False] * len(df), index=df.index)

            symbol = identifier.replace("_data", "")
            signals[symbol] = buy_signal

        return signals

    def generate_sell_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate sell signals when price hits grid level above."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < 2:
                continue

            current_price = df["close"].iloc[-1]

            # Calculate grid levels if not set
            if not self.grid_prices:
                self.grid_prices = self._calculate_grid_levels(current_price)

            # Find closest grid level above current price
            upper_levels = [l for l in self.grid_prices if l > current_price]

            if upper_levels:
                closest_upper = min(upper_levels)
                # Sell signal: Price rose to a grid level
                sell_signal = df["close"] >= closest_upper * 0.999  # 0.1% tolerance
            else:
                sell_signal = pd.Series([False] * len(df), index=df.index)

            symbol = identifier.replace("_data", "")
            signals[symbol] = sell_signal

        return signals


@StrategyRegistry.register
class DCAStrategy(TradingStrategy):
    """
    Dollar Cost Averaging Strategy.

    Regularly buys an asset at fixed intervals regardless of price.
    Optionally uses RSI or other indicators for timing optimization.

    This strategy generates periodic buy signals and manages position
    averaging based on price movements.
    """

    algorithm_id: ClassVar[str] = "dca"
    time_unit: ClassVar[TimeUnit] = TimeUnit.HOUR
    interval: ClassVar[int] = 24  # Daily by default
    symbols: ClassVar[List[str]] = []
    exchanges: ClassVar[List[ExchangeType]] = [
        ExchangeType.BINANCE,
        ExchangeType.BYBIT,
        ExchangeType.OKX,
    ]
    description: ClassVar[str] = "Dollar Cost Averaging Strategy"
    version: ClassVar[str] = "1.0.0"

    def __init__(
        self,
        symbol: str = "BTCUSDT",
        exchange: ExchangeType = ExchangeType.BINANCE,
        timeframe: str = "1d",
        buy_amount: float = 100.0,  # Fixed amount per buy
        buy_interval_hours: int = 24,
        use_rsi_filter: bool = True,
        rsi_threshold: float = 45.0,  # Only buy when RSI < threshold
        max_positions: int = 10,
        take_profit_pct: float = 20.0,
        **kwargs
    ):
        self.buy_amount = buy_amount
        self.buy_interval_hours = buy_interval_hours
        self.use_rsi_filter = use_rsi_filter
        self.rsi_threshold = rsi_threshold
        self.max_positions = max_positions
        self.timeframe = timeframe
        self.last_buy_time = None

        data_sources = [
            DataSource(
                config=DataSourceConfig(
                    identifier=f"{symbol}_data",
                    data_type=DataType.OHLCV,
                    symbol=symbol,
                    exchange=exchange,
                    timeframe=timeframe,
                    window_size=100
                )
            )
        ]

        risk_config = RiskConfig(
            position_sizes=[
                PositionSize(symbol=symbol, fixed_amount=buy_amount)
            ],
            take_profits=[
                TakeProfitRule(
                    symbol=symbol,
                    percentage_threshold=take_profit_pct,
                    trailing=True,
                    trailing_offset=5.0
                )
            ],
            max_open_positions=max_positions
        )

        super().__init__(
            data_sources=data_sources,
            risk_config=risk_config,
            **kwargs
        )

        self.symbol = symbol

    def generate_buy_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """Generate buy signals at regular intervals with optional RSI filter."""
        signals = {}

        for identifier, df in data.items():
            if df is None or len(df) < 14:
                continue

            # Calculate RSI if filter is enabled
            if self.use_rsi_filter:
                df = IndicatorCalculator.rsi(df, period=14)
                rsi_col = "rsi_14"

            # Generate interval-based buy signals
            # For daily timeframe, each candle is a potential buy opportunity
            buy_signal = pd.Series([False] * len(df), index=df.index)

            # Set buy signal for each interval
            for i in range(0, len(df), max(1, self.buy_interval_hours // 24)):
                if self.use_rsi_filter:
                    # Only buy if RSI is below threshold
                    if df[rsi_col].iloc[i] < self.rsi_threshold:
                        buy_signal.iloc[i] = True
                else:
                    buy_signal.iloc[i] = True

            symbol = identifier.replace("_data", "")
            signals[symbol] = buy_signal

        return signals

    def generate_sell_signals(self, data: Dict[str, Any]) -> Dict[str, pd.Series]:
        """DCA typically doesn't generate sell signals (hold long-term)."""
        signals = {}

        for identifier, df in data.items():
            if df is None:
                continue

            symbol = identifier.replace("_data", "")
            signals[symbol] = pd.Series([False] * len(df), index=df.index)

        return signals
