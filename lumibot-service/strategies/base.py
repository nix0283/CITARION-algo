"""
Lumibot Strategies for CITARION Integration
Strategie di trading basate su Lumibot framework
"""
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from lumibot.strategies import Strategy
from lumibot.entities import Asset, Order
import json


class SignalEmitter:
    """Mixin per inviare segnali a CITARION"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.signals: List[Dict[str, Any]] = []

    def emit_signal(self, signal_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Crea e registra un segnale di trading"""
        signal = {
            "id": f"sig_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            "type": signal_type,
            "timestamp": datetime.now().isoformat(),
            "strategy": self.__class__.__name__,
            "data": data
        }
        self.signals.append(signal)
        return signal


class RSIStrategy(Strategy, SignalEmitter):
    """
    RSI Reversal Strategy
    Strategia mean-reversion basata su RSI
    """
    # Strategy parameters
    symbol: str = "BTC/USD"
    timeframe: str = "1h"
    rsi_period: int = 14
    oversold: float = 30.0
    overbought: float = 70.0
    position_size: float = 0.1  # 10% of portfolio

    # Internal state
    last_signal: Optional[str] = None
    entry_price: Optional[float] = None

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize strategy with parameters"""
        self.symbol = symbol
        self.sleeptime = "1H"  # Check every hour
        self.signals = []

        # Override with kwargs
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main trading logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        # Get historical data
        bars = self.get_historical_prices(
            asset,
            self.timeframe,
            self.rsi_period + 10
        )

        if bars is None or len(bars) < self.rsi_period + 1:
            return

        # Calculate RSI
        closes = [bar.close for bar in bars]
        rsi = self._calculate_rsi(closes, self.rsi_period)
        current_price = closes[-1]

        # Get current position
        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0

        # Trading logic
        signal = None

        if rsi < self.oversold and not has_position:
            # Buy signal - oversold
            order = self.create_order(
                asset,
                self.position_size,
                "buy",
                type="market"
            )
            self.submit_order(order)
            self.last_signal = "BUY"
            self.entry_price = current_price

            signal = self.emit_signal("BUY", {
                "symbol": self.symbol,
                "price": current_price,
                "size": self.position_size,
                "rsi": rsi,
                "reason": "RSI oversold"
            })

        elif rsi > self.overbought and has_position:
            # Sell signal - overbought
            order = self.create_order(
                asset,
                position.quantity,
                "sell",
                type="market"
            )
            self.submit_order(order)
            self.last_signal = "SELL"

            pnl = (current_price - self.entry_price) / self.entry_price * 100 if self.entry_price else 0

            signal = self.emit_signal("SELL", {
                "symbol": self.symbol,
                "price": current_price,
                "size": position.quantity,
                "rsi": rsi,
                "reason": "RSI overbought",
                "pnl_percent": pnl
            })

            self.entry_price = None

        return signal

    def _calculate_rsi(self, prices: List[float], period: int) -> float:
        """Calculate RSI indicator"""
        if len(prices) < period + 1:
            return 50.0

        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]

        gains = [d if d > 0 else 0 for d in deltas[-period:]]
        losses = [-d if d < 0 else 0 for d in deltas[-period:]]

        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period

        if avg_loss == 0:
            return 100.0

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

        return rsi


class MACDStrategy(Strategy, SignalEmitter):
    """
    MACD Trend Following Strategy
    Strategia trend-following basata su MACD
    """
    symbol: str = "BTC/USD"
    timeframe: str = "4h"
    fast_period: int = 12
    slow_period: int = 26
    signal_period: int = 9
    position_size: float = 0.15

    last_signal: Optional[str] = None
    entry_price: Optional[float] = None

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize strategy"""
        self.symbol = symbol
        self.sleeptime = "4H"
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
            self.slow_period + self.signal_period + 10
        )

        if bars is None or len(bars) < self.slow_period + self.signal_period:
            return

        closes = [bar.close for bar in bars]
        macd_line, signal_line, histogram = self._calculate_macd(closes)
        current_price = closes[-1]

        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0

        signal = None

        # MACD crossover strategy
        if histogram[-1] > 0 and histogram[-2] <= 0:
            # Bullish crossover
            if not has_position:
                order = self.create_order(asset, self.position_size, "buy")
                self.submit_order(order)
                self.last_signal = "BUY"
                self.entry_price = current_price

                signal = self.emit_signal("BUY", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "macd": macd_line[-1],
                    "signal": signal_line[-1],
                    "histogram": histogram[-1],
                    "reason": "MACD bullish crossover"
                })

        elif histogram[-1] < 0 and histogram[-2] >= 0:
            # Bearish crossover
            if has_position:
                order = self.create_order(asset, position.quantity, "sell")
                self.submit_order(order)
                self.last_signal = "SELL"

                pnl = (current_price - self.entry_price) / self.entry_price * 100 if self.entry_price else 0

                signal = self.emit_signal("SELL", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "macd": macd_line[-1],
                    "signal": signal_line[-1],
                    "histogram": histogram[-1],
                    "reason": "MACD bearish crossover",
                    "pnl_percent": pnl
                })

                self.entry_price = None

        return signal

    def _calculate_macd(self, prices: List[float]) -> tuple:
        """Calculate MACD indicator"""
        import numpy as np

        prices_arr = np.array(prices)

        # Calculate EMAs
        ema_fast = self._ema(prices_arr, self.fast_period)
        ema_slow = self._ema(prices_arr, self.slow_period)

        # MACD line
        macd_line = ema_fast - ema_slow

        # Signal line
        signal_line = self._ema(macd_line, self.signal_period)

        # Histogram
        histogram = macd_line - signal_line

        return macd_line.tolist(), signal_line.tolist(), histogram.tolist()

    def _ema(self, data, period: int):
        """Calculate EMA"""
        import numpy as np
        multiplier = 2 / (period + 1)
        ema = np.zeros_like(data)
        ema[0] = data[0]
        for i in range(1, len(data)):
            ema[i] = (data[i] - ema[i-1]) * multiplier + ema[i-1]
        return ema


class BollingerBandsStrategy(Strategy, SignalEmitter):
    """
    Bollinger Bands Mean Reversion Strategy
    Strategia mean-reversion basata su Bollinger Bands
    """
    symbol: str = "BTC/USD"
    timeframe: str = "1h"
    period: int = 20
    std_dev: float = 2.0
    position_size: float = 0.1

    last_signal: Optional[str] = None
    entry_price: Optional[float] = None

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

        bars = self.get_historical_prices(asset, self.timeframe, self.period + 5)

        if bars is None or len(bars) < self.period:
            return

        closes = [bar.close for bar in bars]
        upper, middle, lower = self._calculate_bollinger_bands(closes)
        current_price = closes[-1]

        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0

        signal = None

        # Price touches lower band - buy
        if current_price <= lower and not has_position:
            order = self.create_order(asset, self.position_size, "buy")
            self.submit_order(order)
            self.last_signal = "BUY"
            self.entry_price = current_price

            signal = self.emit_signal("BUY", {
                "symbol": self.symbol,
                "price": current_price,
                "upper_band": upper,
                "middle_band": middle,
                "lower_band": lower,
                "reason": "Price at lower Bollinger Band"
            })

        # Price touches upper band - sell
        elif current_price >= upper and has_position:
            order = self.create_order(asset, position.quantity, "sell")
            self.submit_order(order)
            self.last_signal = "SELL"

            pnl = (current_price - self.entry_price) / self.entry_price * 100 if self.entry_price else 0

            signal = self.emit_signal("SELL", {
                "symbol": self.symbol,
                "price": current_price,
                "upper_band": upper,
                "middle_band": middle,
                "lower_band": lower,
                "reason": "Price at upper Bollinger Band",
                "pnl_percent": pnl
            })

            self.entry_price = None

        return signal

    def _calculate_bollinger_bands(self, prices: List[float]) -> tuple:
        """Calculate Bollinger Bands"""
        import numpy as np

        prices_arr = np.array(prices)
        period_prices = prices_arr[-self.period:]

        middle = np.mean(period_prices)
        std = np.std(period_prices)

        upper = middle + (std * self.std_dev)
        lower = middle - (std * self.std_dev)

        return upper, middle, lower


class GridStrategy(Strategy, SignalEmitter):
    """
    Grid Trading Strategy
    Strategia di grid trading per mercati laterali
    """
    symbol: str = "BTC/USD"
    timeframe: str = "1h"
    grid_levels: int = 10
    grid_spacing: float = 0.02  # 2% between levels
    position_size: float = 0.05

    grid_orders: Dict[str, Any] = {}
    initialized: bool = False

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize strategy"""
        self.symbol = symbol
        self.sleeptime = "1H"
        self.signals = []
        self.grid_orders = {}

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main trading logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(asset, self.timeframe, 20)

        if bars is None:
            return

        current_price = bars[-1].close

        # Initialize grid on first iteration
        if not self.initialized:
            self._setup_grid(current_price, asset)
            self.initialized = True

        # Check for filled orders and replace
        self._check_and_replace_grid(asset, current_price)

    def _setup_grid(self, current_price: float, asset):
        """Setup initial grid orders"""
        # Calculate grid levels
        lower_price = current_price * (1 - self.grid_spacing * self.grid_levels / 2)
        upper_price = current_price * (1 + self.grid_spacing * self.grid_levels / 2)

        self.grid_orders = {
            "center_price": current_price,
            "lower_price": lower_price,
            "upper_price": upper_price,
            "buy_levels": [],
            "sell_levels": []
        }

        # Place buy orders below current price
        for i in range(self.grid_levels // 2):
            price = current_price * (1 - self.grid_spacing * (i + 1))
            order = self.create_order(asset, self.position_size, "buy", type="limit", limit_price=price)
            self.submit_order(order)
            self.grid_orders["buy_levels"].append({
                "price": price,
                "order_id": order.identifier
            })

        # Place sell orders above current price
        for i in range(self.grid_levels // 2):
            price = current_price * (1 + self.grid_spacing * (i + 1))
            order = self.create_order(asset, self.position_size, "sell", type="limit", limit_price=price)
            self.submit_order(order)
            self.grid_orders["sell_levels"].append({
                "price": price,
                "order_id": order.identifier
            })

        self.emit_signal("GRID_INITIALIZED", {
            "symbol": self.symbol,
            "center_price": current_price,
            "lower_price": lower_price,
            "upper_price": upper_price,
            "levels": self.grid_levels
        })

    def _check_and_replace_grid(self, asset, current_price: float):
        """Check filled orders and replace grid"""
        # Implementation would check order status and replace filled orders
        pass


# Strategy registry
STRATEGIES = {
    "rsi_reversal": RSIStrategy,
    "macd_trend": MACDStrategy,
    "bollinger_reversion": BollingerBandsStrategy,
    "grid_trading": GridStrategy,
}

def get_strategy(name: str):
    """Get strategy class by name"""
    return STRATEGIES.get(name)

def list_strategies():
    """List all available strategies"""
    return list(STRATEGIES.keys())
