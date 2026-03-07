"""
Technical indicators for IAF strategies.

This module provides a comprehensive set of technical indicators
for use in trading strategies, compatible with pandas DataFrames.
"""

from typing import Dict, Any, Optional, List, Callable
import pandas as pd
import numpy as np
from dataclasses import dataclass


@dataclass
class IndicatorInfo:
    """Information about an indicator."""
    name: str
    category: str
    description: str
    parameters: Dict[str, Any]
    min_periods: int


class IndicatorCalculator:
    """
    Calculator for technical indicators.

    Provides methods for calculating various technical indicators
    on pandas DataFrames with OHLCV data.
    """

    @staticmethod
    def sma(data: pd.DataFrame, period: int = 20, source: str = "close",
            result_column: Optional[str] = None) -> pd.DataFrame:
        """
        Simple Moving Average.

        Args:
            data: DataFrame with price data
            period: SMA period
            source: Column to use for calculation
            result_column: Name for result column

        Returns:
            DataFrame with SMA column added
        """
        result_column = result_column or f"sma_{period}"
        data = data.copy()
        data[result_column] = data[source].rolling(window=period).mean()
        return data

    @staticmethod
    def ema(data: pd.DataFrame, period: int = 20, source: str = "close",
            result_column: Optional[str] = None) -> pd.DataFrame:
        """
        Exponential Moving Average.

        Args:
            data: DataFrame with price data
            period: EMA period
            source: Column to use for calculation
            result_column: Name for result column

        Returns:
            DataFrame with EMA column added
        """
        result_column = result_column or f"ema_{period}"
        data = data.copy()
        data[result_column] = data[source].ewm(span=period, adjust=False).mean()
        return data

    @staticmethod
    def rsi(data: pd.DataFrame, period: int = 14, source: str = "close",
            result_column: Optional[str] = None) -> pd.DataFrame:
        """
        Relative Strength Index.

        Args:
            data: DataFrame with price data
            period: RSI period
            source: Column to use for calculation
            result_column: Name for result column

        Returns:
            DataFrame with RSI column added
        """
        result_column = result_column or f"rsi_{period}"
        data = data.copy()

        delta = data[source].diff()
        gain = delta.where(delta > 0, 0)
        loss = (-delta).where(delta < 0, 0)

        avg_gain = gain.rolling(window=period).mean()
        avg_loss = loss.rolling(window=period).mean()

        # Use exponential moving average for more accurate RSI
        avg_gain = gain.ewm(com=period-1, adjust=False).mean()
        avg_loss = loss.ewm(com=period-1, adjust=False).mean()

        rs = avg_gain / avg_loss.replace(0, np.inf)
        data[result_column] = 100 - (100 / (1 + rs))

        return data

    @staticmethod
    def macd(data: pd.DataFrame, fast_period: int = 12, slow_period: int = 26,
             signal_period: int = 9, source: str = "close") -> pd.DataFrame:
        """
        Moving Average Convergence Divergence.

        Args:
            data: DataFrame with price data
            fast_period: Fast EMA period
            slow_period: Slow EMA period
            signal_period: Signal line period
            source: Column to use for calculation

        Returns:
            DataFrame with MACD, Signal, and Histogram columns added
        """
        data = data.copy()

        ema_fast = data[source].ewm(span=fast_period, adjust=False).mean()
        ema_slow = data[source].ewm(span=slow_period, adjust=False).mean()

        data["macd"] = ema_fast - ema_slow
        data["macd_signal"] = data["macd"].ewm(span=signal_period, adjust=False).mean()
        data["macd_histogram"] = data["macd"] - data["macd_signal"]

        return data

    @staticmethod
    def bollinger_bands(data: pd.DataFrame, period: int = 20, std_dev: float = 2.0,
                        source: str = "close") -> pd.DataFrame:
        """
        Bollinger Bands.

        Args:
            data: DataFrame with price data
            period: SMA period for middle band
            std_dev: Standard deviation multiplier
            source: Column to use for calculation

        Returns:
            DataFrame with Upper, Middle, Lower bands added
        """
        data = data.copy()

        data["bb_middle"] = data[source].rolling(window=period).mean()
        std = data[source].rolling(window=period).std()

        data["bb_upper"] = data["bb_middle"] + (std * std_dev)
        data["bb_lower"] = data["bb_middle"] - (std * std_dev)
        data["bb_width"] = data["bb_upper"] - data["bb_lower"]

        return data

    @staticmethod
    def atr(data: pd.DataFrame, period: int = 14,
            result_column: Optional[str] = None) -> pd.DataFrame:
        """
        Average True Range.

        Args:
            data: DataFrame with OHLC data
            period: ATR period
            result_column: Name for result column

        Returns:
            DataFrame with ATR column added
        """
        result_column = result_column or f"atr_{period}"
        data = data.copy()

        high = data["high"]
        low = data["low"]
        close = data["close"]

        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))

        true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        data[result_column] = true_range.rolling(window=period).mean()

        return data

    @staticmethod
    def stochastic(data: pd.DataFrame, k_period: int = 14, d_period: int = 3,
                   smooth_k: int = 3) -> pd.DataFrame:
        """
        Stochastic Oscillator.

        Args:
            data: DataFrame with OHLC data
            k_period: %K period
            d_period: %D period (SMA of %K)
            smooth_k: Smoothing period for %K

        Returns:
            DataFrame with stoch_k and stoch_d columns added
        """
        data = data.copy()

        low_min = data["low"].rolling(window=k_period).min()
        high_max = data["high"].rolling(window=k_period).max()

        data["stoch_k"] = 100 * ((data["close"] - low_min) / (high_max - low_min))
        data["stoch_k"] = data["stoch_k"].rolling(window=smooth_k).mean()
        data["stoch_d"] = data["stoch_k"].rolling(window=d_period).mean()

        return data

    @staticmethod
    def adx(data: pd.DataFrame, period: int = 14) -> pd.DataFrame:
        """
        Average Directional Index.

        Args:
            data: DataFrame with OHLC data
            period: ADX period

        Returns:
            DataFrame with ADX, +DI, -DI columns added
        """
        data = data.copy()

        high = data["high"]
        low = data["low"]
        close = data["close"]

        plus_dm = high.diff()
        minus_dm = low.diff()

        plus_dm[plus_dm < 0] = 0
        minus_dm[minus_dm > 0] = 0

        tr = pd.concat([
            high - low,
            abs(high - close.shift(1)),
            abs(low - close.shift(1))
        ], axis=1).max(axis=1)

        atr = tr.rolling(window=period).mean()

        plus_di = 100 * (plus_dm.rolling(window=period).mean() / atr)
        minus_di = 100 * (abs(minus_dm).rolling(window=period).mean() / atr)

        dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di)
        data["adx"] = dx.rolling(window=period).mean()
        data["plus_di"] = plus_di
        data["minus_di"] = minus_di

        return data

    @staticmethod
    def vwap(data: pd.DataFrame) -> pd.DataFrame:
        """
        Volume Weighted Average Price.

        Args:
            data: DataFrame with OHLCV data

        Returns:
            DataFrame with VWAP column added
        """
        data = data.copy()

        typical_price = (data["high"] + data["low"] + data["close"]) / 3
        data["vwap"] = (typical_price * data["volume"]).cumsum() / data["volume"].cumsum()

        return data

    @staticmethod
    def obv(data: pd.DataFrame,
            result_column: Optional[str] = None) -> pd.DataFrame:
        """
        On-Balance Volume.

        Args:
            data: DataFrame with OHLCV data
            result_column: Name for result column

        Returns:
            DataFrame with OBV column added
        """
        result_column = result_column or "obv"
        data = data.copy()

        obv = [0]
        for i in range(1, len(data)):
            if data["close"].iloc[i] > data["close"].iloc[i-1]:
                obv.append(obv[-1] + data["volume"].iloc[i])
            elif data["close"].iloc[i] < data["close"].iloc[i-1]:
                obv.append(obv[-1] - data["volume"].iloc[i])
            else:
                obv.append(obv[-1])

        data[result_column] = obv
        return data

    @staticmethod
    def crossover(data: pd.DataFrame, first_column: str, second_column: str,
                  result_column: Optional[str] = None) -> pd.DataFrame:
        """
        Detect crossover (first column crosses above second column).

        Args:
            data: DataFrame with indicator columns
            first_column: Column that should cross above
            second_column: Column that should be crossed
            result_column: Name for result column

        Returns:
            DataFrame with crossover boolean column added
        """
        result_column = result_column or f"{first_column}_crossover_{second_column}"
        data = data.copy()

        cross = (data[first_column].shift(1) <= data[second_column].shift(1)) & \
                (data[first_column] > data[second_column])
        data[result_column] = cross.fillna(False)

        return data

    @staticmethod
    def crossunder(data: pd.DataFrame, first_column: str, second_column: str,
                   result_column: Optional[str] = None) -> pd.DataFrame:
        """
        Detect crossunder (first column crosses below second column).

        Args:
            data: DataFrame with indicator columns
            first_column: Column that should cross below
            second_column: Column that should be crossed
            result_column: Name for result column

        Returns:
            DataFrame with crossunder boolean column added
        """
        result_column = result_column or f"{first_column}_crossunder_{second_column}"
        data = data.copy()

        cross = (data[first_column].shift(1) >= data[second_column].shift(1)) & \
                (data[first_column] < data[second_column])
        data[result_column] = cross.fillna(False)

        return data

    @staticmethod
    def heikin_ashi(data: pd.DataFrame) -> pd.DataFrame:
        """
        Heikin Ashi candles.

        Args:
            data: DataFrame with OHLC data

        Returns:
            DataFrame with Heikin Ashi OHLC columns added
        """
        data = data.copy()

        data["ha_close"] = (data["open"] + data["high"] + data["low"] + data["close"]) / 4
        data["ha_open"] = data["open"].copy()

        for i in range(1, len(data)):
            data.loc[data.index[i], "ha_open"] = (
                data["ha_open"].iloc[i-1] + data["ha_close"].iloc[i-1]
            ) / 2

        data["ha_high"] = data[["high", "ha_open", "ha_close"]].max(axis=1)
        data["ha_low"] = data[["low", "ha_open", "ha_close"]].min(axis=1)

        return data

    @staticmethod
    def supertrend(data: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> pd.DataFrame:
        """
        Supertrend indicator.

        Args:
            data: DataFrame with OHLC data
            period: ATR period
            multiplier: ATR multiplier

        Returns:
            DataFrame with supertrend and trend_direction columns added
        """
        data = data.copy()

        # Calculate ATR
        atr = IndicatorCalculator.atr(data.copy(), period)[f"atr_{period}"]

        # Calculate basic bands
        hl2 = (data["high"] + data["low"]) / 2
        upper_band = hl2 + (multiplier * atr)
        lower_band = hl2 - (multiplier * atr)

        # Initialize
        supertrend = [0] * len(data)
        trend = [1] * len(data)

        for i in range(1, len(data)):
            if data["close"].iloc[i] > upper_band.iloc[i-1]:
                trend[i] = 1
            elif data["close"].iloc[i] < lower_band.iloc[i-1]:
                trend[i] = -1
            else:
                trend[i] = trend[i-1]

            if trend[i] == 1:
                supertrend[i] = lower_band.iloc[i]
            else:
                supertrend[i] = upper_band.iloc[i]

        data["supertrend"] = supertrend
        data["trend_direction"] = trend

        return data

    @staticmethod
    def ichimoku(data: pd.DataFrame, tenkan_period: int = 9, kijun_period: int = 26,
                 senkou_b_period: int = 52) -> pd.DataFrame:
        """
        Ichimoku Cloud.

        Args:
            data: DataFrame with OHLC data
            tenkan_period: Tenkan-sen period (conversion line)
            kijun_period: Kijun-sen period (base line)
            senkou_b_period: Senkou Span B period

        Returns:
            DataFrame with Ichimoku components added
        """
        data = data.copy()

        tenkan_high = data["high"].rolling(window=tenkan_period).max()
        tenkan_low = data["low"].rolling(window=tenkan_period).min()
        data["tenkan_sen"] = (tenkan_high + tenkan_low) / 2

        kijun_high = data["high"].rolling(window=kijun_period).max()
        kijun_low = data["low"].rolling(window=kijun_period).min()
        data["kijun_sen"] = (kijun_high + kijun_low) / 2

        data["senkou_span_a"] = ((data["tenkan_sen"] + data["kijun_sen"]) / 2).shift(kijun_period)
        senkou_b_high = data["high"].rolling(window=senkou_b_period).max()
        senkou_b_low = data["low"].rolling(window=senkou_b_period).min()
        data["senkou_span_b"] = ((senkou_b_high + senkou_b_low) / 2).shift(kijun_period)

        data["chikou_span"] = data["close"].shift(-kijun_period)

        return data


# Registry of available indicators
INDICATORS: Dict[str, Callable] = {
    "sma": IndicatorCalculator.sma,
    "ema": IndicatorCalculator.ema,
    "rsi": IndicatorCalculator.rsi,
    "macd": IndicatorCalculator.macd,
    "bollinger_bands": IndicatorCalculator.bollinger_bands,
    "bb": IndicatorCalculator.bollinger_bands,
    "atr": IndicatorCalculator.atr,
    "stochastic": IndicatorCalculator.stochastic,
    "stoch": IndicatorCalculator.stochastic,
    "adx": IndicatorCalculator.adx,
    "vwap": IndicatorCalculator.vwap,
    "obv": IndicatorCalculator.obv,
    "crossover": IndicatorCalculator.crossover,
    "crossunder": IndicatorCalculator.crossunder,
    "heikin_ashi": IndicatorCalculator.heikin_ashi,
    "ha": IndicatorCalculator.heikin_ashi,
    "supertrend": IndicatorCalculator.supertrend,
    "ichimoku": IndicatorCalculator.ichimoku,
}


def calculate_indicator(
    data: pd.DataFrame,
    indicator_name: str,
    **kwargs
) -> pd.DataFrame:
    """
    Calculate an indicator by name.

    Args:
        data: DataFrame with price data
        indicator_name: Name of the indicator
        **kwargs: Indicator-specific parameters

    Returns:
        DataFrame with indicator values added

    Raises:
        ValueError: If indicator name is not recognized
    """
    if indicator_name not in INDICATORS:
        raise ValueError(f"Unknown indicator: {indicator_name}. "
                        f"Available: {list(INDICATORS.keys())}")

    return INDICATORS[indicator_name](data, **kwargs)
