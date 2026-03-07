"""
CITARION Bot Integration Strategies
Strategies that integrate with existing CITARION bots (DCA, Grid, BB, Argus)
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


class DCAIntegrationStrategy(Strategy, SignalEmitter):
    """
    DCA Bot Integration Strategy
    Generates signals for CITARION DCA Bot based on technical analysis
    
    This strategy integrates with CITARION's DCA Bot by:
    - Detecting optimal DCA entry points using RSI + Bollinger Bands
    - Calculating position sizes based on volatility
    - Sending signals that trigger DCA Bot actions
    """
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    
    # Technical parameters
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    bb_period: int = 20
    bb_std: float = 2.0
    
    # DCA parameters (synced with CITARION DCA Bot)
    base_order_size: float = 0.01  # Base position in BTC
    max_safety_orders: int = 5
    safety_order_multiplier: float = 1.5
    price_drop_threshold: float = 0.05  # 5% drop triggers safety order
    take_profit_pct: float = 0.10  # 10% take profit
    
    # State
    entries: List[Dict[str, Any]] = []
    total_invested: float = 0
    total_size: float = 0
    average_entry: Optional[float] = None

    def initialize(self, symbol: str = "BTC/USDT", **kwargs):
        """Initialize DCA integration strategy"""
        self.symbol = symbol
        self.sleeptime = "1H"
        self.signals = []
        self.entries = []
        self.total_invested = 0
        self.total_size = 0
        self.average_entry = None

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main DCA integration logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(asset, self.timeframe, self.bb_period + 20)

        if bars is None or len(bars) < self.bb_period + 10:
            return

        closes = [bar.close for bar in bands]
        current_price = closes[-1]

        # Calculate indicators
        rsi = self._calculate_rsi(closes, self.rsi_period)
        bb_upper, bb_middle, bb_lower = self._calculate_bollinger_bands(
            closes, self.bb_period, self.bb_std
        )

        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0

        signal = None

        # Check take profit
        if has_position and self.average_entry:
            pnl_pct = (current_price - self.average_entry) / self.average_entry

            if pnl_pct >= self.take_profit_pct:
                signal = self.emit_signal("DCA_TAKE_PROFIT", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "size": self.total_size,
                    "avg_entry": self.average_entry,
                    "pnl_percent": pnl_pct * 100,
                    "total_invested": self.total_invested,
                    "levels_filled": len(self.entries),
                    "action": "close_all",
                    "target_bot": "dca_bot",
                })
                # Reset
                self.entries = []
                self.total_invested = 0
                self.total_size = 0
                self.average_entry = None
                return signal

        # Check for DCA entry conditions
        if len(self.entries) < self.max_safety_orders:
            # Strong buy signal: RSI oversold + price below lower BB
            if rsi < self.rsi_oversold and current_price < bb_lower:
                level = len(self.entries)
                position_size = self.base_order_size * (self.safety_order_multiplier ** level)

                signal = self.emit_signal("DCA_BUY", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "size": position_size,
                    "level": level + 1,
                    "rsi": rsi,
                    "bb_lower": bb_lower,
                    "reason": f"RSI oversold ({rsi:.1f}) + Below lower BB",
                    "action": "safety_order",
                    "target_bot": "dca_bot",
                    "avg_entry": self.average_entry,
                })

                # Update state
                self.entries.append({
                    "price": current_price,
                    "size": position_size,
                    "timestamp": datetime.now().isoformat(),
                    "level": level + 1,
                })
                self.total_invested += current_price * position_size
                self.total_size += position_size
                self.average_entry = self.total_invested / self.total_size

        return signal

    def _calculate_rsi(self, prices: List[float], period: int) -> float:
        """Calculate RSI indicator"""
        if len(prices) < period + 1:
            return 50.0

        changes = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        gains = [max(0, c) for c in changes]
        losses = [abs(min(0, c)) for c in changes]

        avg_gain = sum(gains[-period:]) / period
        avg_loss = sum(losses[-period:]) / period

        if avg_loss == 0:
            return 100.0

        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _calculate_bollinger_bands(
        self, prices: List[float], period: int, std_dev: float
    ) -> tuple:
        """Calculate Bollinger Bands"""
        if len(prices) < period:
            return prices[-1], prices[-1], prices[-1]

        sma = sum(prices[-period:]) / period
        variance = sum((p - sma) ** 2 for p in prices[-period:]) / period
        std = variance ** 0.5

        return sma + std_dev * std, sma, sma - std_dev * std


class GridIntegrationStrategy(Strategy, SignalEmitter):
    """
    Grid Bot Integration Strategy
    Generates dynamic grid levels for CITARION Grid Bot
    
    This strategy:
    - Detects optimal grid ranges based on ATR and support/resistance
    - Adjusts grid spacing based on volatility
    - Sends signals to reconfigure Grid Bot parameters
    """
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    
    # Grid parameters
    grid_levels: int = 10
    atr_period: int = 14
    atr_multiplier: float = 1.5
    min_grid_spacing_pct: float = 0.005  # 0.5% minimum spacing
    max_grid_spacing_pct: float = 0.03   # 3% maximum spacing
    
    # State
    current_grid: Optional[Dict[str, Any]] = None
    last_rebalance: Optional[datetime] = None

    def initialize(self, symbol: str = "BTC/USDT", **kwargs):
        """Initialize Grid integration strategy"""
        self.symbol = symbol
        self.sleeptime = "1H"
        self.signals = []
        self.current_grid = None
        self.last_rebalance = None

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main Grid integration logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(asset, self.timeframe, 100)

        if bars is None or len(bars) < 50:
            return

        closes = [bar.close for bar in bars]
        highs = [bar.high for bar in bars]
        lows = [bar.low for bar in bars]
        current_price = closes[-1]

        # Calculate ATR
        atr = self._calculate_atr(highs, lows, closes, self.atr_period)

        # Calculate grid spacing based on ATR
        atr_pct = atr / current_price
        grid_spacing = min(max(atr_pct * self.atr_multiplier, self.min_grid_spacing_pct), 
                          self.max_grid_spacing_pct)

        # Calculate support and resistance for grid bounds
        support, resistance = self._find_support_resistance(highs, lows, closes)

        # Determine grid bounds
        grid_upper = min(resistance, current_price * (1 + grid_spacing * self.grid_levels / 2))
        grid_lower = max(support, current_price * (1 - grid_spacing * self.grid_levels / 2))

        # Check if rebalancing needed
        should_rebalance = False
        reasons = []

        if self.current_grid is None:
            should_rebalance = True
            reasons.append("Initial grid setup")
        else:
            # Price moved outside grid range
            if current_price > self.current_grid["upper"] or current_price < self.current_grid["lower"]:
                should_rebalance = True
                reasons.append("Price outside grid range")

            # Significant ATR change (>20%)
            old_spacing = self.current_grid["spacing"]
            if abs(grid_spacing - old_spacing) / old_spacing > 0.2:
                should_rebalance = True
                reasons.append("Volatility changed significantly")

            # Time-based rebalance (every 24h)
            if self.last_rebalance and (datetime.now() - self.last_rebalance).total_seconds() > 86400:
                should_rebalance = True
                reasons.append("Daily rebalance check")

        if should_rebalance:
            signal = self.emit_signal("GRID_REBALANCE", {
                "symbol": self.symbol,
                "current_price": current_price,
                "atr": atr,
                "atr_pct": atr_pct * 100,
                "grid_upper": grid_upper,
                "grid_lower": grid_lower,
                "grid_spacing": grid_spacing,
                "grid_spacing_pct": grid_spacing * 100,
                "grid_levels": self.grid_levels,
                "support": support,
                "resistance": resistance,
                "action": "reconfigure_grid",
                "target_bot": "grid_bot",
                "reasons": reasons,
            })

            self.current_grid = {
                "upper": grid_upper,
                "lower": grid_lower,
                "spacing": grid_spacing,
            }
            self.last_rebalance = datetime.now()

            return signal

        return None

    def _calculate_atr(
        self, highs: List[float], lows: List[float], closes: List[float], period: int
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

    def _find_support_resistance(
        self, highs: List[float], lows: List[float], closes: List[float], lookback: int = 50
    ) -> tuple:
        """Find support and resistance levels"""
        recent_lows = lows[-lookback:]
        recent_highs = highs[-lookback:]

        # Simple approach: use recent swing lows/highs
        support = min(recent_lows)
        resistance = max(recent_highs)

        return support, resistance


class BBIntegrationStrategy(Strategy, SignalEmitter):
    """
    Bollinger Bands Bot Integration Strategy
    Generates signals for CITARION BB Bot
    
    This strategy:
    - Detects Bollinger Band squeezes (low volatility)
    - Identifies mean reversion opportunities
    - Sends entry/exit signals for BB Bot
    """
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    
    # BB parameters
    bb_period: int = 20
    bb_std: float = 2.0
    
    # Signal parameters
    squeeze_threshold: float = 0.02  # 2% bandwidth = squeeze
    position_size: float = 0.1
    
    # State
    last_signal: Optional[str] = None
    entry_price: Optional[float] = None
    squeeze_active: bool = False

    def initialize(self, symbol: str = "BTC/USDT", **kwargs):
        """Initialize BB integration strategy"""
        self.symbol = symbol
        self.sleeptime = "1H"
        self.signals = []
        self.squeeze_active = False

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main BB integration logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(asset, self.timeframe, self.bb_period + 20)

        if bars is None or len(bars) < self.bb_period + 10:
            return

        closes = [bar.close for bar in bars]
        current_price = closes[-1]

        # Calculate Bollinger Bands
        bb_upper, bb_middle, bb_lower = self._calculate_bollinger_bands(
            closes, self.bb_period, self.bb_std
        )

        # Calculate bandwidth (for squeeze detection)
        bandwidth = (bb_upper - bb_lower) / bb_middle

        # Calculate %B (position within bands)
        percent_b = (current_price - bb_lower) / (bb_upper - bb_lower) if bb_upper != bb_lower else 0.5

        signal = None

        # Check for squeeze (low volatility period before breakout)
        is_squeeze = bandwidth < self.squeeze_threshold

        if is_squeeze and not self.squeeze_active:
            self.squeeze_active = True
            signal = self.emit_signal("BB_SQUEEZE", {
                "symbol": self.symbol,
                "price": current_price,
                "bb_upper": bb_upper,
                "bb_middle": bb_middle,
                "bb_lower": bb_lower,
                "bandwidth": bandwidth * 100,
                "percent_b": percent_b * 100,
                "action": "prepare_breakout",
                "target_bot": "bb_bot",
                "reason": "Bollinger Band squeeze detected - potential breakout incoming",
            })

        elif not is_squeeze and self.squeeze_active:
            self.squeeze_active = False

        # Mean reversion signals
        if percent_b < 0.05:  # Price near lower band
            signal = self.emit_signal("BB_LOWER_TOUCH", {
                "symbol": self.symbol,
                "price": current_price,
                "bb_lower": bb_lower,
                "bb_middle": bb_middle,
                "percent_b": percent_b * 100,
                "action": "mean_reversion_buy",
                "target_bot": "bb_bot",
                "reason": f"Price touching lower BB (%B: {percent_b*100:.1f}%)",
            })

        elif percent_b > 0.95:  # Price near upper band
            signal = self.emit_signal("BB_UPPER_TOUCH", {
                "symbol": self.symbol,
                "price": current_price,
                "bb_upper": bb_upper,
                "bb_middle": bb_middle,
                "percent_b": percent_b * 100,
                "action": "mean_reversion_sell",
                "target_bot": "bb_bot",
                "reason": f"Price touching upper BB (%B: {percent_b*100:.1f}%)",
            })

        # Return to middle signal
        elif 0.45 < percent_b < 0.55 and self.last_signal in ["BB_LOWER_TOUCH", "BB_UPPER_TOUCH"]:
            signal = self.emit_signal("BB_MIDDLE_RETURN", {
                "symbol": self.symbol,
                "price": current_price,
                "bb_middle": bb_middle,
                "percent_b": percent_b * 100,
                "action": "take_profit",
                "target_bot": "bb_bot",
                "reason": "Price returned to middle band - take profit",
            })
            self.last_signal = None

        if signal:
            self.last_signal = signal["type"]

        return signal

    def _calculate_bollinger_bands(
        self, prices: List[float], period: int, std_dev: float
    ) -> tuple:
        """Calculate Bollinger Bands"""
        if len(prices) < period:
            return prices[-1], prices[-1], prices[-1]

        sma = sum(prices[-period:]) / period
        variance = sum((p - sma) ** 2 for p in prices[-period:]) / period
        std = variance ** 0.5

        return sma + std_dev * std, sma, sma - std_dev * std


class ArgusIntegrationStrategy(Strategy, SignalEmitter):
    """
    Argus Bot Integration Strategy
    Generates whale tracking and orderbook signals for CITARION Argus Bot
    
    This strategy:
    - Detects large price movements (whale activity)
    - Identifies unusual volume patterns
    - Sends alerts for Argus Bot to monitor
    """
    symbol: str = "BTC/USDT"
    timeframe: str = "5m"
    
    # Detection parameters
    price_change_threshold: float = 0.02  # 2% sudden move
    volume_spike_threshold: float = 3.0   # 3x average volume
    
    # State
    avg_volume: float = 0
    volume_samples: int = 0

    def initialize(self, symbol: str = "BTC/USDT", **kwargs):
        """Initialize Argus integration strategy"""
        self.symbol = symbol
        self.sleeptime = "5M"
        self.signals = []
        self.avg_volume = 0
        self.volume_samples = 0

        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main Argus integration logic"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")

        bars = self.get_historical_prices(asset, self.timeframe, 50)

        if bars is None or len(bars) < 20:
            return

        closes = [bar.close for bar in bars]
        volumes = [bar.volume for bar in bars] if hasattr(bars[0], 'volume') else []

        current_price = closes[-1]
        prev_price = closes[-2]

        # Update volume average
        if volumes:
            current_volume = volumes[-1]
            self.volume_samples += 1
            self.avg_volume = self.avg_volume + (current_volume - self.avg_volume) / self.volume_samples

        signal = None

        # Check for price anomaly (whale move)
        price_change = abs(current_price - prev_price) / prev_price

        if price_change > self.price_change_threshold:
            direction = "up" if current_price > prev_price else "down"

            signal = self.emit_signal("ARGUS_WHALE_MOVE", {
                "symbol": self.symbol,
                "price": current_price,
                "prev_price": prev_price,
                "price_change_pct": price_change * 100,
                "direction": direction,
                "action": "monitor_closely",
                "target_bot": "argus_bot",
                "reason": f"Large price movement detected: {price_change*100:.2f}%",
            })

        # Check for volume anomaly
        if volumes and self.avg_volume > 0:
            volume_ratio = volumes[-1] / self.avg_volume

            if volume_ratio > self.volume_spike_threshold:
                signal = self.emit_signal("ARGUS_VOLUME_SPIKE", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "volume": volumes[-1],
                    "avg_volume": self.avg_volume,
                    "volume_ratio": volume_ratio,
                    "action": "investigate_volume",
                    "target_bot": "argus_bot",
                    "reason": f"Volume spike detected: {volume_ratio:.1f}x average",
                })

        return signal


# CITARION Integration strategies registry
CITARION_STRATEGIES = {
    "dca_integration": DCAIntegrationStrategy,
    "grid_integration": GridIntegrationStrategy,
    "bb_integration": BBIntegrationStrategy,
    "argus_integration": ArgusIntegrationStrategy,
}


def get_citarion_strategy(name: str):
    """Get CITARION integration strategy class by name"""
    return CITARION_STRATEGIES.get(name)


def list_citarion_strategies():
    """List all CITARION integration strategies"""
    return list(CITARION_STRATEGIES.keys())
