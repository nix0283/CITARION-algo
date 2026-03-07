"""
Lumibot Extended Strategies for CITARION
Additional strategies: Supertrend, DCA, EMA Cross, and more
"""
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from lumibot.strategies import Strategy
from lumibot.entities import Asset, Order
import json


class SignalEmitter:
    """Mixin for emitting signals to CITARION"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.signals: List[Dict[str, Any]] = []

    def emit_signal(self, signal_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create and register a trading signal"""
        signal = {
            "id": f"sig_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            "type": signal_type,
            "timestamp": datetime.now().isoformat(),
            "strategy": self.__class__.__name__,
            "data": data
        }
        self.signals.append(signal)
        return signal


class SupertrendStrategy(Strategy, SignalEmitter):
    """
    Supertrend Trend Following Strategy
    Uses Supertrend indicator for trend detection and entry signals
    """
    symbol: str = "BTC/USD"
    timeframe: str = "1h"
    atr_period: int = 10
    atr_multiplier: float = 3.0
    position_size: float = 0.15

    last_signal: Optional[str] = None
    entry_price: Optional[float] = None
    supertrend_value: Optional[float] = None
    supertrend_direction: int = 1  # 1 = bullish, -1 = bearish

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize strategy"""
        self.symbol = symbol
        self.sleeptime = "1H"
        self.signals = []

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main trading logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(
            asset,
            self.timeframe,
            self.atr_period + 50
        )

        if bars is None or len(bars) < self.atr_period + 20:
            return

        closes = [bar.close for bar in bars]
        highs = [bar.high for bar in bars]
        lows = [bar.low for bar in bars]

        # Calculate Supertrend
        supertrend, direction = self._calculate_supertrend(
            highs, lows, closes, self.atr_period, self.atr_multiplier
        )

        current_price = closes[-1]
        prev_direction = self.supertrend_direction

        self.supertrend_value = supertrend
        self.supertrend_direction = direction

        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0

        signal = None

        # Trend change - Buy signal
        if direction == 1 and prev_direction == -1 and not has_position:
            order = self.create_order(asset, self.position_size, "buy", type="market")
            self.submit_order(order)
            self.last_signal = "BUY"
            self.entry_price = current_price

            signal = self.emit_signal("BUY", {
                "symbol": self.symbol,
                "price": current_price,
                "size": self.position_size,
                "supertrend": supertrend,
                "direction": "bullish",
                "reason": "Supertrend bullish crossover"
            })

        # Trend change - Sell signal
        elif direction == -1 and prev_direction == 1 and has_position:
            order = self.create_order(asset, position.quantity, "sell", type="market")
            self.submit_order(order)
            self.last_signal = "SELL"

            pnl = (current_price - self.entry_price) / self.entry_price * 100 if self.entry_price else 0

            signal = self.emit_signal("SELL", {
                "symbol": self.symbol,
                "price": current_price,
                "size": position.quantity,
                "supertrend": supertrend,
                "direction": "bearish",
                "reason": "Supertrend bearish crossover",
                "pnl_percent": pnl
            })

            self.entry_price = None

        return signal

    def _calculate_supertrend(
        self, highs: List[float], lows: List[float], closes: List[float],
        period: int, multiplier: float
    ) -> tuple:
        """Calculate Supertrend indicator"""
        # Calculate ATR
        atr = self._calculate_atr(highs, lows, closes, period)

        # Calculate basic bands
        hl2 = [(h + l) / 2 for h, l in zip(highs, lows)]

        upper_band = hl2[-1] + (multiplier * atr)
        lower_band = hl2[-1] - (multiplier * atr)

        # Determine trend
        if closes[-1] > upper_band:
            direction = 1
            supertrend = lower_band
        elif closes[-1] < lower_band:
            direction = -1
            supertrend = upper_band
        else:
            direction = self.supertrend_direction
            supertrend = self.supertrend_value if self.supertrend_value else hl2[-1]

        return supertrend, direction

    def _calculate_atr(
        self, highs: List[float], lows: List[float], closes: List[float],
        period: int
    ) -> float:
        """Calculate Average True Range"""
        true_ranges = []
        for i in range(1, len(highs)):
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i-1]),
                abs(lows[i] - closes[i-1])
            )
            true_ranges.append(tr)

        return sum(true_ranges[-period:]) / period if true_ranges else 0


class DCAStrategy(Strategy, SignalEmitter):
    """
    Dollar Cost Averaging Strategy
    Systematic buying with averaging down on price drops
    """
    symbol: str = "BTC/USD"
    timeframe: str = "1d"
    base_position_size: float = 0.05
    max_levels: int = 5
    drop_threshold: float = 0.05  # 5% drop to trigger next buy
    take_profit_pct: float = 0.15  # 15% take profit
    safety_order_multiplier: float = 1.5  # Multiply size on each drop

    entries: List[Dict[str, Any]] = []
    total_invested: float = 0
    total_size: float = 0
    average_entry: Optional[float] = None

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize DCA strategy"""
        self.symbol = symbol
        self.sleeptime = "1D"
        self.signals = []
        self.entries = []
        self.total_invested = 0
        self.total_size = 0
        self.average_entry = None

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main DCA logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(asset, self.timeframe, 10)

        if bars is None:
            return

        current_price = bars[-1].close

        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0

        signal = None

        # Check take profit
        if has_position and self.average_entry:
            pnl_pct = (current_price - self.average_entry) / self.average_entry

            if pnl_pct >= self.take_profit_pct:
                # Take profit - close all
                order = self.create_order(asset, self.total_size, "sell", type="market")
                self.submit_order(order)

                pnl = (current_price - self.average_entry) / self.average_entry * 100

                signal = self.emit_signal("TAKE_PROFIT", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "size": self.total_size,
                    "avg_entry": self.average_entry,
                    "pnl_percent": pnl,
                    "total_invested": self.total_invested,
                    "levels_filled": len(self.entries),
                })

                # Reset
                self.entries = []
                self.total_invested = 0
                self.total_size = 0
                self.average_entry = None
                return signal

        # Check for DCA entry
        if len(self.entries) < self.max_levels:
            should_buy = False
            buy_reason = ""

            if not has_position:
                # Initial entry
                should_buy = True
                buy_reason = "Initial DCA entry"
                position_size = self.base_position_size
            elif self.average_entry:
                # Check price drop
                drop_pct = (self.average_entry - current_price) / self.average_entry
                if drop_pct >= self.drop_threshold:
                    should_buy = True
                    buy_reason = f"DCA entry - price dropped {drop_pct*100:.1f}%"
                    # Increase size for safety orders
                    level = len(self.entries)
                    position_size = self.base_position_size * (self.safety_order_multiplier ** level)

            if should_buy:
                order = self.create_order(asset, position_size, "buy", type="market")
                self.submit_order(order)

                self.entries.append({
                    "price": current_price,
                    "size": position_size,
                    "timestamp": datetime.now().isoformat()
                })
                self.total_invested += current_price * position_size
                self.total_size += position_size
                self.average_entry = self.total_invested / self.total_size

                signal = self.emit_signal("DCA_BUY", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "size": position_size,
                    "level": len(self.entries),
                    "avg_entry": self.average_entry,
                    "reason": buy_reason,
                })

        return signal


class EMACrossStrategy(Strategy, SignalEmitter):
    """
    EMA Crossover Strategy
    Trades based on EMA crossovers (fast/slow)
    """
    symbol: str = "BTC/USD"
    timeframe: str = "1h"
    fast_period: int = 9
    slow_period: int = 21
    position_size: float = 0.1

    last_signal: Optional[str] = None
    entry_price: Optional[float] = None
    prev_fast_ema: Optional[float] = None
    prev_slow_ema: Optional[float] = None

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize EMA cross strategy"""
        self.symbol = symbol
        self.sleeptime = "1H"
        self.signals = []
        self.prev_fast_ema = None
        self.prev_slow_ema = None

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main trading logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(
            asset,
            self.timeframe,
            self.slow_period + 20
        )

        if bars is None or len(bars) < self.slow_period + 5:
            return

        closes = [bar.close for bar in bars]

        # Calculate EMAs
        fast_ema = self._calculate_ema(closes, self.fast_period)
        slow_ema = self._calculate_ema(closes, self.slow_period)
        current_price = closes[-1]

        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0

        signal = None

        # Check for crossover
        if self.prev_fast_ema is not None and self.prev_slow_ema is not None:
            # Bullish crossover
            if fast_ema > slow_ema and self.prev_fast_ema <= self.prev_slow_ema:
                if not has_position:
                    order = self.create_order(asset, self.position_size, "buy", type="market")
                    self.submit_order(order)
                    self.last_signal = "BUY"
                    self.entry_price = current_price

                    signal = self.emit_signal("BUY", {
                        "symbol": self.symbol,
                        "price": current_price,
                        "fast_ema": fast_ema,
                        "slow_ema": slow_ema,
                        "reason": "EMA bullish crossover"
                    })

            # Bearish crossover
            elif fast_ema < slow_ema and self.prev_fast_ema >= self.prev_slow_ema:
                if has_position:
                    order = self.create_order(asset, position.quantity, "sell", type="market")
                    self.submit_order(order)
                    self.last_signal = "SELL"

                    pnl = (current_price - self.entry_price) / self.entry_price * 100 if self.entry_price else 0

                    signal = self.emit_signal("SELL", {
                        "symbol": self.symbol,
                        "price": current_price,
                        "fast_ema": fast_ema,
                        "slow_ema": slow_ema,
                        "reason": "EMA bearish crossover",
                        "pnl_percent": pnl
                    })

                    self.entry_price = None

        self.prev_fast_ema = fast_ema
        self.prev_slow_ema = slow_ema

        return signal

    def _calculate_ema(self, prices: List[float], period: int) -> float:
        """Calculate EMA"""
        if len(prices) < period:
            return prices[-1] if prices else 0

        multiplier = 2 / (period + 1)

        # Start with SMA
        ema = sum(prices[:period]) / period

        # Calculate EMA
        for price in prices[period:]:
            ema = (price - ema) * multiplier + ema

        return ema


class BreakoutStrategy(Strategy, SignalEmitter):
    """
    Breakout Strategy
    Trades breakouts from consolidation ranges
    """
    symbol: str = "BTC/USD"
    timeframe: str = "1h"
    lookback_period: int = 20
    breakout_threshold: float = 0.02  # 2% breakout
    position_size: float = 0.1
    stop_loss_pct: float = 0.03  # 3% stop loss

    last_signal: Optional[str] = None
    entry_price: Optional[float] = None
    range_high: Optional[float] = None
    range_low: Optional[float] = None

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize breakout strategy"""
        self.symbol = symbol
        self.sleeptime = "1H"
        self.signals = []

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main trading logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(
            asset,
            self.timeframe,
            self.lookback_period + 10
        )

        if bars is None or len(bars) < self.lookback_period:
            return

        closes = [bar.close for bar in bars]
        highs = [bar.high for bar in bars]
        lows = [bar.low for bar in bars]

        # Calculate range
        range_high = max(highs[-self.lookback_period:])
        range_low = min(lows[-self.lookback_period:])
        range_size = (range_high - range_low) / range_low

        current_price = closes[-1]

        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0

        signal = None

        # Check for stop loss
        if has_position and self.entry_price:
            loss_pct = (self.entry_price - current_price) / self.entry_price
            if loss_pct >= self.stop_loss_pct:
                order = self.create_order(asset, position.quantity, "sell", type="market")
                self.submit_order(order)

                signal = self.emit_signal("STOP_LOSS", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "entry_price": self.entry_price,
                    "loss_percent": loss_pct * 100,
                })

                self.entry_price = None
                return signal

        # Check for breakout
        if not has_position and range_size < self.breakout_threshold:
            # Consolidation detected, check for breakout
            if current_price > range_high:
                # Upside breakout
                order = self.create_order(asset, self.position_size, "buy", type="market")
                self.submit_order(order)
                self.last_signal = "BUY"
                self.entry_price = current_price

                signal = self.emit_signal("BREAKOUT_BUY", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "range_high": range_high,
                    "range_low": range_low,
                    "range_size_pct": range_size * 100,
                    "direction": "upside",
                    "reason": "Upside breakout from consolidation"
                })

                self.range_high = range_high
                self.range_low = range_low

        return signal


# Extended strategies registry
EXTENDED_STRATEGIES = {
    "supertrend": SupertrendStrategy,
    "dca": DCAStrategy,
    "ema_cross": EMACrossStrategy,
    "breakout": BreakoutStrategy,
}


def get_extended_strategy(name: str):
    """Get extended strategy class by name"""
    return EXTENDED_STRATEGIES.get(name)


def list_extended_strategies():
    """List all extended strategies"""
    return list(EXTENDED_STRATEGIES.keys())
