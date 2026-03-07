"""
Lumibot Trading Strategies
Implementation of trading strategies using Lumibot framework
"""
from datetime import datetime, timedelta
from typing import Optional
import json

# Lumibot imports
from lumibot.strategies import Strategy
from lumibot.backtesting import BacktestingBroker, YahooDataBacktesting
from lumibot.brokers import Alpaca, InteractiveBrokers, Ccxt
from lumibot.traders import Trader
from lumibot.entities import Asset, Position


class RSIReversalStrategy(Strategy):
    """
    RSI Reversal Strategy
    Mean-reversion strategy based on RSI oversold/overbought levels
    
    Buy when RSI < oversold level
    Sell when RSI > overbought level
    """
    
    # Strategy parameters
    parameters = {
        "rsi_period": 14,
        "oversold": 30,
        "overbought": 70,
        "position_size": 0.1,
    }
    
    def initialize(self):
        """Initialize strategy"""
        self.sleeptime = "1H"  # Check every hour
        self.rsi_period = self.parameters.get("rsi_period", 14)
        self.oversold = self.parameters.get("oversold", 30)
        self.overbought = self.parameters.get("overbought", 70)
        self.position_size = self.parameters.get("position_size", 0.1)
        
        # Track last signal
        self.last_signal = None
        
    def on_trading_iteration(self):
        """Main trading logic"""
        # Get the asset we're trading
        asset = self.get_asset()
        
        # Get historical data
        bars = self.get_historical_prices(asset, self.rsi_period + 50, "1h")
        if bars is None or len(bars) < self.ri_period + 1:
            return
            
        # Calculate RSI
        rsi = self.calculate_rsi(bars, self.rsi_period)
        
        if rsi is None:
            return
            
        current_price = bars[-1].close
        
        # Trading logic
        position = self.get_position(asset)
        
        # Generate signal
        signal = None
        
        if rsi < self.oversold and position is None:
            # Buy signal - RSI is oversold
            cash = self.get_cash()
            quantity = (cash * self.position_size) / current_price
            self.buy(asset, quantity)
            signal = "BUY"
            self.last_signal = {
                "type": "BUY",
                "timestamp": self.get_datetime().isoformat(),
                "price": current_price,
                "rsi": rsi,
                "reason": f"RSI oversold at {rsi:.2f}"
            }
            
        elif rsi > self.overbought and position is not None:
            # Sell signal - RSI is overbought
            self.sell_all(asset)
            signal = "SELL"
            self.last_signal = {
                "type": "SELL",
                "timestamp": self.get_datetime().isoformat(),
                "price": current_price,
                "rsi": rsi,
                "reason": f"RSI overbought at {rsi:.2f}"
            }
            
        # Store signal for API access
        if signal and hasattr(self, 'store_signal'):
            self.store_signal(self.last_signal)
            
    def calculate_rsi(self, bars, period=14):
        """Calculate RSI indicator"""
        if len(bars) < period + 1:
            return None
            
        # Calculate price changes
        changes = []
        for i in range(1, len(bars)):
            change = bars[i].close - bars[i-1].close
            changes.append(change)
            
        if len(changes) < period:
            return None
            
        # Calculate initial average gain/loss
        gains = [max(0, c) for c in changes[:period]]
        losses = [abs(min(0, c)) for c in changes[:period]]
        
        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period
        
        # Calculate RSI
        if avg_loss == 0:
            return 100
            
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        return rsi
        
    def get_asset(self):
        """Get the trading asset"""
        symbol = self.parameters.get("symbol", "BTC/USDT")
        return Asset(symbol=symbol.split("/")[0], asset_type="crypto")


class MACDTrendStrategy(Strategy):
    """
    MACD Trend Following Strategy
    Trend following strategy based on MACD crossovers
    
    Buy when MACD line crosses above signal line
    Sell when MACD line crosses below signal line
    """
    
    parameters = {
        "fast_period": 12,
        "slow_period": 26,
        "signal_period": 9,
        "position_size": 0.15,
    }
    
    def initialize(self):
        """Initialize strategy"""
        self.sleeptime = "4H"
        self.fast_period = self.parameters.get("fast_period", 12)
        self.slow_period = self.parameters.get("slow_period", 26)
        self.signal_period = self.parameters.get("signal_period", 9)
        self.position_size = self.parameters.get("position_size", 0.15)
        
        # Track MACD history for crossover detection
        self.prev_macd = None
        self.prev_signal = None
        
    def on_trading_iteration(self):
        """Main trading logic"""
        asset = self.get_asset()
        
        # Get historical data (need enough for MACD calculation)
        bars = self.get_historical_prices(
            asset, 
            self.slow_period + self.signal_period + 50, 
            "4h"
        )
        
        if bars is None or len(bars) < self.slow_period + self.signal_period + 1:
            return
            
        # Calculate MACD
        macd_line, signal_line, histogram = self.calculate_macd(bars)
        
        if macd_line is None or signal_line is None:
            return
            
        current_price = bars[-1].close
        position = self.get_position(asset)
        
        # Detect crossover
        signal = None
        
        if (self.prev_macd is not None and 
            self.prev_signal is not None):
            
            # Bullish crossover: MACD crosses above signal
            if (self.prev_macd <= self.prev_signal and 
                macd_line > signal_line and 
                position is None):
                
                cash = self.get_cash()
                quantity = (cash * self.position_size) / current_price
                self.buy(asset, quantity)
                signal = "BUY"
                
            # Bearish crossover: MACD crosses below signal
            elif (self.prev_macd >= self.prev_signal and 
                  macd_line < signal_line and 
                  position is not None):
                  
                self.sell_all(asset)
                signal = "SELL"
                
        # Update previous values
        self.prev_macd = macd_line
        self.prev_signal = signal_line
        
        return signal
        
    def calculate_macd(self, bars):
        """Calculate MACD indicator"""
        closes = [bar.close for bar in bars]
        
        # Calculate EMAs
        fast_ema = self.calculate_ema(closes, self.fast_period)
        slow_ema = self.calculate_ema(closes, self.slow_period)
        
        if fast_ema is None or slow_ema is None:
            return None, None, None
            
        # MACD line = Fast EMA - Slow EMA
        macd_values = []
        for i in range(len(fast_ema)):
            if i < len(slow_ema):
                macd_values.append(fast_ema[i] - slow_ema[i])
                
        if len(macd_values) < self.signal_period:
            return None, None, None
            
        # Signal line = EMA of MACD
        signal_line = self.calculate_ema(macd_values, self.signal_period)
        
        if signal_line is None:
            return None, None, None
            
        # Return latest values
        macd_line = macd_values[-1]
        signal = signal_line[-1] if isinstance(signal_line, list) else signal_line
        histogram = macd_line - signal
        
        return macd_line, signal, histogram
        
    def calculate_ema(self, data, period):
        """Calculate Exponential Moving Average"""
        if len(data) < period:
            return None
            
        multiplier = 2 / (period + 1)
        ema = [sum(data[:period]) / period]  # Start with SMA
        
        for price in data[period:]:
            ema.append((price - ema[-1]) * multiplier + ema[-1])
            
        return ema
        
    def get_asset(self):
        """Get the trading asset"""
        symbol = self.parameters.get("symbol", "BTC/USDT")
        return Asset(symbol=symbol.split("/")[0], asset_type="crypto")


class BollingerBandsStrategy(Strategy):
    """
    Bollinger Bands Reversion Strategy
    Mean-reversion strategy using Bollinger Bands
    
    Buy when price touches lower band
    Sell when price touches upper band
    """
    
    parameters = {
        "period": 20,
        "std_dev": 2.0,
        "position_size": 0.1,
    }
    
    def initialize(self):
        """Initialize strategy"""
        self.sleeptime = "1H"
        self.period = self.parameters.get("period", 20)
        self.std_dev = self.parameters.get("std_dev", 2.0)
        self.position_size = self.parameters.get("position_size", 0.1)
        
    def on_trading_iteration(self):
        """Main trading logic"""
        asset = self.get_asset()
        
        bars = self.get_historical_prices(asset, self.period + 10, "1h")
        if bars is None or len(bars) < self.period:
            return
            
        # Calculate Bollinger Bands
        upper, middle, lower = self.calculate_bollinger_bands(bars)
        
        if upper is None or middle is None or lower is None:
            return
            
        current_price = bars[-1].close
        position = self.get_position(asset)
        
        signal = None
        
        # Price touches lower band - buy signal
        if current_price <= lower and position is None:
            cash = self.get_cash()
            quantity = (cash * self.position_size) / current_price
            self.buy(asset, quantity)
            signal = "BUY"
            
        # Price touches upper band - sell signal
        elif current_price >= upper and position is not None:
            self.sell_all(asset)
            signal = "SELL"
            
        return signal
        
    def calculate_bollinger_bands(self, bars):
        """Calculate Bollinger Bands"""
        closes = [bar.close for bar in bars]
        
        if len(closes) < self.period:
            return None, None, None
            
        # Calculate SMA
        sma = sum(closes[-self.period:]) / self.period
        
        # Calculate standard deviation
        variance = sum((x - sma) ** 2 for x in closes[-self.period:]) / self.period
        std = variance ** 0.5
        
        # Calculate bands
        upper = sma + (std * self.std_dev)
        lower = sma - (std * self.std_dev)
        
        return upper, sma, lower
        
    def get_asset(self):
        """Get the trading asset"""
        symbol = self.parameters.get("symbol", "BTC/USDT")
        return Asset(symbol=symbol.split("/")[0], asset_type="crypto")


class GridTradingStrategy(Strategy):
    """
    Grid Trading Strategy
    Grid trading strategy for sideways markets
    
    Places buy orders at lower price levels
    Places sell orders at upper price levels
    """
    
    parameters = {
        "grid_levels": 10,
        "grid_spacing": 0.02,  # 2%
        "position_size": 0.05,
        "center_price": None,  # Auto-detect if None
        "price_range": 0.1,  # 10% above/below center
    }
    
    def initialize(self):
        """Initialize strategy"""
        self.sleeptime = "1H"
        self.grid_levels = self.parameters.get("grid_levels", 10)
        self.grid_spacing = self.parameters.get("grid_spacing", 0.02)
        self.position_size = self.parameters.get("position_size", 0.05)
        self.center_price = self.parameters.get("center_price")
        self.price_range = self.parameters.get("price_range", 0.1)
        
        self.grid_initialized = False
        self.grid_orders = {}
        
    def on_trading_iteration(self):
        """Main trading logic"""
        asset = self.get_asset()
        
        if not self.grid_initialized:
            self.initialize_grid(asset)
            self.grid_initialized = True
            return
            
        # Check grid orders and rebalance if needed
        self.check_grid_orders(asset)
        
    def initialize_grid(self, asset):
        """Initialize grid trading levels"""
        # Get current price
        bars = self.get_historical_prices(asset, 1, "1h")
        if bars is None:
            return
            
        current_price = bars[-1].close
        center = self.center_price or current_price
        
        # Calculate grid levels
        upper_price = center * (1 + self.price_range)
        lower_price = center * (1 - self.price_range)
        level_spacing = (upper_price - lower_price) / (self.grid_levels - 1)
        
        # Place initial grid orders
        for i in range(self.grid_levels):
            level_price = lower_price + (i * level_spacing)
            
            if level_price < current_price:
                # Buy order below current price
                quantity = self.position_size
                order = self.buy(asset, quantity, limit=level_price)
                self.grid_orders[level_price] = {"side": "BUY", "order": order}
            elif level_price > current_price:
                # Sell order above current price
                quantity = self.position_size
                order = self.sell(asset, quantity, limit=level_price)
                self.grid_orders[level_price] = {"side": "SELL", "order": order}
                
    def check_grid_orders(self, asset):
        """Check and rebalance grid orders"""
        # Implementation for grid order management
        pass
        
    def get_asset(self):
        """Get the trading asset"""
        symbol = self.parameters.get("symbol", "BTC/USDT")
        return Asset(symbol=symbol.split("/")[0], asset_type="crypto")


class EMACrossStrategy(Strategy):
    """
    EMA Crossover Strategy
    Trend following strategy based on EMA crossovers
    """
    
    parameters = {
        "fast_period": 9,
        "slow_period": 21,
        "position_size": 0.1,
    }
    
    def initialize(self):
        self.sleeptime = "1H"
        self.fast_period = self.parameters.get("fast_period", 9)
        self.slow_period = self.parameters.get("slow_period", 21)
        self.position_size = self.parameters.get("position_size", 0.1)
        
        self.prev_fast = None
        self.prev_slow = None
        
    def on_trading_iteration(self):
        asset = self.get_asset()
        
        bars = self.get_historical_prices(asset, self.slow_period + 50, "1h")
        if bars is None or len(bars) < self.slow_period + 1:
            return
            
        closes = [bar.close for bar in bars]
        
        fast_ema = self.calculate_ema(closes, self.fast_period)
        slow_ema = self.calculate_ema(closes, self.slow_period)
        
        if fast_ema is None or slow_ema is None:
            return
            
        current_fast = fast_ema[-1]
        current_slow = slow_ema[-1]
        
        position = self.get_position(asset)
        
        if self.prev_fast is not None and self.prev_slow is not None:
            # Bullish crossover
            if self.prev_fast <= self.prev_slow and current_fast > current_slow:
                if position is None:
                    cash = self.get_cash()
                    price = bars[-1].close
                    quantity = (cash * self.position_size) / price
                    self.buy(asset, quantity)
                    
            # Bearish crossover
            elif self.prev_fast >= self.prev_slow and current_fast < current_slow:
                if position is not None:
                    self.sell_all(asset)
                    
        self.prev_fast = current_fast
        self.prev_slow = current_slow
        
    def calculate_ema(self, data, period):
        if len(data) < period:
            return None
        multiplier = 2 / (period + 1)
        ema = [sum(data[:period]) / period]
        for price in data[period:]:
            ema.append((price - ema[-1]) * multiplier + ema[-1])
        return ema
        
    def get_asset(self):
        symbol = self.parameters.get("symbol", "BTC/USDT")
        return Asset(symbol=symbol.split("/")[0], asset_type="crypto")


# Strategy registry
STRATEGY_REGISTRY = {
    "rsi_reversal": RSIReversalStrategy,
    "macd_trend": MACDTrendStrategy,
    "bollinger_reversion": BollingerBandsStrategy,
    "grid_trading": GridTradingStrategy,
    "ema_cross": EMACrossStrategy,
}


def get_strategy(strategy_id: str) -> Optional[type[Strategy]]:
    """Get strategy class by ID"""
    return STRATEGY_REGISTRY.get(strategy_id)
