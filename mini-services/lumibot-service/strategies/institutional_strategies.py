"""
Institutional Trading Strategies for Lumibot
Implements: MFT (VWAP/TWAP), Spectrum (Cointegration), Reed (PCA), 
             Architect (Avellaneda-Stoikov), Equilibrist (OU), Kron (Donchian)
"""

from lumibot.strategies import Strategy
from lumibot.brokers import Ccxt
from lumibot.entities import Asset, Order
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from scipy import stats
from scipy.linalg import svd
from typing import List, Dict, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class VWAPTwapStrategy(Strategy):
    """
    MFT (Selene) - VWAP/TWAP Execution Strategy
    Minimizes market impact for large orders using volume-weighted algorithms
    """
    
    def initialize(self, 
                   symbol: str = "BTC/USDT",
                   side: str = "buy",
                   total_quantity: float = 1.0,
                   execution_hours: float = 4.0,
                   participation_rate: float = 0.1,
                   use_vwap: bool = True):
        self.sleeptime = "1M"
        self.symbol = symbol
        self.side = side.lower()
        self.total_quantity = total_quantity
        self.executed_quantity = 0.0
        self.execution_hours = execution_hours
        self.participation_rate = participation_rate
        self.use_vwap = use_vwap
        self.price_history = []
        self.volume_history = []
        self.orders_placed = []
        
    def on_trading_iteration(self):
        asset = Asset(self.symbol)
        current_price = self.get_last_price(asset)
        
        # Get market data for VWAP calculation
        bars = self.get_historical_prices(asset, 20, "minute")
        if bars is None or len(bars) == 0:
            return
            
        # Calculate VWAP
        typical_prices = (bars['high'] + bars['low'] + bars['close']) / 3
        vwap = (typical_prices * bars['volume']).sum() / bars['volume'].sum()
        
        # Calculate participation-based order size
        avg_volume = bars['volume'].mean()
        order_size = min(
            self.total_quantity - self.executed_quantity,
            avg_volume * self.participation_rate
        )
        
        if order_size <= 0 or self.executed_quantity >= self.total_quantity:
            logger.info(f"Execution complete: {self.executed_quantity}/{self.total_quantity}")
            return
        
        # Determine execution price based on VWAP or TWAP
        if self.use_vwap:
            execution_price = vwap
            # Adjust for market impact
            if self.side == "buy":
                execution_price *= 1.001  # Slight premium for buys
            else:
                execution_price *= 0.999  # Slight discount for sells
        else:
            # TWAP - simple time-weighted average
            execution_price = current_price
        
        # Place limit order
        if self.side == "buy":
            order = self.create_order(asset, order_size, "buy", "limit", execution_price)
        else:
            order = self.create_order(asset, order_size, "sell", "limit", execution_price)
            
        self.submit_order(order)
        self.orders_placed.append({
            'time': datetime.now(),
            'price': execution_price,
            'quantity': order_size,
            'vwap': vwap
        })
        self.executed_quantity += order_size
        
        logger.info(f"Placed {self.side} order: {order_size} @ {execution_price} (VWAP: {vwap})")


class CointegrationPairsStrategy(Strategy):
    """
    Spectrum (PR) - Pairs Trading with Cointegration & Kalman Filter
    Statistical arbitrage using mean-reverting spread
    """
    
    def initialize(self,
                   symbol_a: str = "BTC/USDT",
                   symbol_b: str = "ETH/USDT",
                   lookback: int = 252,
                   zscore_entry: float = 2.0,
                   zscore_exit: float = 0.5,
                   kalman_q: float = 0.01,
                   kalman_r: float = 0.1):
        self.sleeptime = "5M"
        self.symbol_a = symbol_a
        self.symbol_b = symbol_b
        self.lookback = lookback
        self.zscore_entry = zscore_entry
        self.zscore_exit = zscore_exit
        
        # Kalman filter state
        self.kalman_q = kalman_q  # Process noise
        self.kalman_r = kalman_r  # Measurement noise
        self.kalman_state = None
        self.kalman_cov = None
        
        self.spread_history = []
        self.position = 0  # 0: flat, 1: long spread, -1: short spread
        
    def kalman_filter_update(self, observation: float) -> Tuple[float, float]:
        """Kalman filter for dynamic hedge ratio estimation"""
        if self.kalman_state is None:
            self.kalman_state = observation
            self.kalman_cov = 1.0
            return self.kalman_state, self.kalman_cov
        
        # Prediction step
        predicted_state = self.kalman_state
        predicted_cov = self.kalman_cov + self.kalman_q
        
        # Update step
        kalman_gain = predicted_cov / (predicted_cov + self.kalman_r)
        self.kalman_state = predicted_state + kalman_gain * (observation - predicted_state)
        self.kalman_cov = (1 - kalman_gain) * predicted_cov
        
        return self.kalman_state, self.kalman_cov
    
    def calculate_hedge_ratio(self, prices_a: pd.Series, prices_b: pd.Series) -> float:
        """Calculate dynamic hedge ratio using OLS"""
        # Use rolling regression
        if len(prices_a) < 30:
            return 1.0
        
        slope, intercept, r_value, p_value, std_err = stats.linregress(
            prices_a.values, prices_b.values
        )
        return slope
    
    def on_trading_iteration(self):
        asset_a = Asset(self.symbol_a)
        asset_b = Asset(self.symbol_b)
        
        # Get historical prices
        bars_a = self.get_historical_prices(asset_a, self.lookback, "minute")
        bars_b = self.get_historical_prices(asset_b, self.lookback, "minute")
        
        if bars_a is None or bars_b is None:
            return
        
        prices_a = bars_a['close']
        prices_b = bars_b['close']
        
        # Calculate hedge ratio
        hedge_ratio = self.calculate_hedge_ratio(prices_a, prices_b)
        
        # Update with Kalman filter
        filtered_ratio, _ = self.kalman_filter_update(hedge_ratio)
        
        # Calculate spread
        spread = np.log(prices_a.iloc[-1]) - filtered_ratio * np.log(prices_b.iloc[-1])
        self.spread_history.append(spread)
        
        if len(self.spread_history) < 30:
            return
        
        # Calculate z-score
        spread_series = pd.Series(self.spread_history[-self.lookback:])
        z_score = (spread - spread_series.mean()) / spread_series.std()
        
        logger.info(f"Spread: {spread:.4f}, Z-score: {z_score:.4f}, Hedge Ratio: {filtered_ratio:.4f}")
        
        # Trading logic
        if z_score > self.zscore_entry and self.position >= 0:
            # Spread is too high, short spread (sell A, buy B)
            if self.position == 1:
                self.sell_all(asset_a)
                self.sell_all(asset_b)
            
            qty_a = self.get_cash() / prices_a.iloc[-1] * 0.5
            qty_b = qty_a * filtered_ratio
            
            self.create_order(asset_a, qty_a, "sell")
            self.create_order(asset_b, qty_b, "buy")
            self.position = -1
            logger.info(f"SHORT SPREAD: Sell {qty_a:.4f} {self.symbol_a}, Buy {qty_b:.4f} {self.symbol_b}")
            
        elif z_score < -self.zscore_entry and self.position <= 0:
            # Spread is too low, long spread (buy A, sell B)
            if self.position == -1:
                self.sell_all(asset_a)
                self.sell_all(asset_b)
            
            qty_a = self.get_cash() / prices_a.iloc[-1] * 0.5
            qty_b = qty_a * filtered_ratio
            
            self.create_order(asset_a, qty_a, "buy")
            self.create_order(asset_b, qty_b, "sell")
            self.position = 1
            logger.info(f"LONG SPREAD: Buy {qty_a:.4f} {self.symbol_a}, Sell {qty_b:.4f} {self.symbol_b}")
            
        elif abs(z_score) < self.zscore_exit and self.position != 0:
            # Exit position
            self.sell_all(asset_a)
            self.sell_all(asset_b)
            self.position = 0
            logger.info("CLOSED POSITION: Mean reversion complete")


class PCAFactorStrategy(Strategy):
    """
    Reed (STA) - Statistical Arbitrage using PCA and Factor Models
    Identifies mispriced assets relative to common factors
    """
    
    def initialize(self,
                   universe: List[str] = None,
                   n_factors: int = 3,
                   lookback: int = 60,
                   residual_threshold: float = 2.0):
        self.sleeptime = "15M"
        self.universe = universe or ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "MATIC/USDT"]
        self.n_factors = n_factors
        self.lookback = lookback
        self.residual_threshold = residual_threshold
        self.factor_loadings = None
        self.residuals = {}
        
    def compute_pca_factors(self, returns: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Compute PCA factors from returns"""
        # Standardize returns
        returns_std = (returns - returns.mean()) / returns.std()
        
        # SVD decomposition
        U, S, Vt = svd(returns_std, full_matrices=False)
        
        # Principal components
        factors = U[:, :self.n_factors] * S[:self.n_factors]
        loadings = Vt[:self.n_factors, :].T
        
        return factors, loadings
    
    def calculate_residuals(self, returns: pd.DataFrame, factors: np.ndarray, loadings: np.ndarray) -> pd.Series:
        """Calculate residuals (idiosyncratic returns)"""
        # Reconstructed returns
        reconstructed = factors @ loadings.T
        
        # Residuals
        residuals = returns.iloc[-1] - reconstructed[-1]
        return residuals
    
    def on_trading_iteration(self):
        # Collect returns for all assets
        returns_data = {}
        
        for symbol in self.universe:
            asset = Asset(symbol)
            bars = self.get_historical_prices(asset, self.lookback, "minute")
            if bars is not None:
                returns_data[symbol] = bars['close'].pct_change().dropna()
        
        if len(returns_data) < len(self.universe):
            return
        
        returns_df = pd.DataFrame(returns_data)
        
        # Compute PCA
        factors, loadings = self.compute_pca_factors(returns_df)
        
        # Calculate residuals
        residuals = self.calculate_residuals(returns_df, factors, loadings)
        
        # Standardize residuals
        residual_zscores = (residuals - residuals.mean()) / residuals.std()
        
        # Find trading opportunities
        for symbol, zscore in residual_zscores.items():
            asset = Asset(symbol)
            current_price = self.get_last_price(asset)
            
            if abs(zscore) > self.residual_threshold:
                # Significant residual - potential mispricing
                if zscore > self.residual_threshold:
                    # Asset overvalued relative to factors
                    logger.info(f"PCA Signal: SELL {symbol} (z-score: {zscore:.2f})")
                    if self.get_asset_position(asset) > 0:
                        self.sell_all(asset)
                elif zscore < -self.residual_threshold:
                    # Asset undervalued relative to factors
                    logger.info(f"PCA Signal: BUY {symbol} (z-score: {zscore:.2f})")
                    if self.get_asset_position(asset) == 0:
                        qty = self.get_cash() * 0.2 / current_price
                        self.create_order(asset, qty, "buy")


class AvellanedaStoikovStrategy(Strategy):
    """
    Architect (MM) - Market Making using Avellaneda-Stoikov Model
    Optimal spread and inventory management
    """
    
    def initialize(self,
                   symbol: str = "BTC/USDT",
                   gamma: float = 0.1,
                   kappa: float = 0.5,
                   tick_size: float = 0.01,
                   inventory_limit: float = 1.0):
        self.sleeptime = "10S"
        self.symbol = symbol
        self.gamma = gamma  # Risk aversion
        self.kappa = kappa  # Order book liquidity parameter
        self.tick_size = tick_size
        self.inventory_limit = inventory_limit
        self.inventory = 0.0
        self.mid_price_history = []
        
    def calculate_reservation_price(self, mid_price: float, inventory: float, sigma: float, T: float) -> float:
        """Calculate reservation price based on inventory risk"""
        # r = S - q * gamma * sigma^2 * (T - t)
        reservation_price = mid_price - inventory * self.gamma * sigma**2 * T
        return reservation_price
    
    def calculate_optimal_spread(self, sigma: float, T: float) -> float:
        """Calculate optimal bid-ask spread"""
        # delta = gamma * sigma^2 * T + 2/gamma * ln(1 + gamma/kappa)
        spread = self.gamma * sigma**2 * T + 2/self.gamma * np.log(1 + self.gamma/self.kappa)
        return spread
    
    def calculate_volatility(self) -> float:
        """Estimate volatility from recent price history"""
        if len(self.mid_price_history) < 20:
            return 0.01
        
        returns = pd.Series(self.mid_price_history).pct_change().dropna()
        sigma = returns.std() * np.sqrt(252 * 24 * 60 * 6)  # Annualized for 10s bars
        return sigma
    
    def on_trading_iteration(self):
        asset = Asset(self.symbol)
        mid_price = self.get_last_price(asset)
        
        if mid_price is None:
            return
        
        self.mid_price_history.append(mid_price)
        
        # Calculate volatility
        sigma = self.calculate_volatility()
        
        # Time remaining (in trading day fractions)
        T = 1.0
        
        # Calculate reservation price
        reservation_price = self.calculate_reservation_price(mid_price, self.inventory, sigma, T)
        
        # Calculate optimal spread
        spread = self.calculate_optimal_spread(sigma, T)
        half_spread = spread / 2
        
        # Calculate bid/ask prices with inventory skew
        inventory_skew = self.inventory * self.gamma * sigma**2 * T
        
        bid_price = reservation_price - half_spread - inventory_skew
        ask_price = reservation_price + half_spread - inventory_skew
        
        # Round to tick size
        bid_price = round(bid_price / self.tick_size) * self.tick_size
        ask_price = round(ask_price / self.tick_size) * self.tick_size
        
        # Cancel existing orders
        self.cancel_open_orders()
        
        # Calculate order sizes based on inventory
        current_pos = self.get_asset_position(asset)
        self.inventory = current_pos
        
        # Determine order sizes
        if self.inventory > self.inventory_limit:
            # Too long, only place sell orders
            sell_qty = min(abs(self.inventory), 0.1)
            self.create_order(asset, sell_qty, "sell", "limit", ask_price)
        elif self.inventory < -self.inventory_limit:
            # Too short, only place buy orders
            buy_qty = min(abs(self.inventory), 0.1)
            self.create_order(asset, buy_qty, "buy", "limit", bid_price)
        else:
            # Balanced, place both
            order_qty = 0.05
            self.create_order(asset, order_qty, "buy", "limit", bid_price)
            self.create_order(asset, order_qty, "sell", "limit", ask_price)
        
        logger.info(f"MM: Mid={mid_price:.2f}, Res={reservation_price:.2f}, "
                   f"Bid={bid_price:.2f}, Ask={ask_price:.2f}, Inv={self.inventory:.4f}")


class OrnsteinUhlenbeckStrategy(Strategy):
    """
    Equilibrist (MR) - Mean Reversion using Ornstein-Uhlenbeck Process
    Models price dynamics with mean reversion
    """
    
    def initialize(self,
                   symbol: str = "BTC/USDT",
                   theta: float = 0.5,
                   mu: float = 0.0,
                   sigma: float = 0.1,
                   entry_threshold: float = 1.5,
                   exit_threshold: float = 0.3,
                   lookback: int = 100):
        self.sleeptime = "5M"
        self.symbol = symbol
        self.theta = theta  # Mean reversion speed
        self.mu = mu  # Long-term mean (will be estimated)
        self.sigma = sigma  # Volatility
        self.entry_threshold = entry_threshold
        self.exit_threshold = exit_threshold
        self.lookback = lookback
        self.price_history = []
        self.position = 0
        
    def estimate_ou_params(self, prices: np.ndarray) -> Tuple[float, float, float]:
        """Estimate OU parameters from price series"""
        if len(prices) < 30:
            return self.theta, self.mu, self.sigma
        
        log_prices = np.log(prices)
        
        # Estimate mu as long-term mean
        mu = np.mean(log_prices)
        
        # Estimate theta from autocorrelation
        diffs = np.diff(log_prices)
        autocorr = np.corrcoef(diffs[:-1], diffs[1:])[0, 1]
        theta = -np.log(autocorr) if autocorr > 0 else 0.1
        
        # Estimate sigma from residuals
        residuals = diffs - theta * (mu - log_prices[:-1])
        sigma = np.std(residuals)
        
        return theta, mu, sigma
    
    def ou_expectation(self, current_price: float, horizon: int = 1) -> float:
        """Calculate expected price under OU process"""
        # E[X_t] = mu + (X_0 - mu) * exp(-theta * t)
        return self.mu + (current_price - self.mu) * np.exp(-self.theta * horizon)
    
    def ou_probability_of_direction(self, current_price: float, target: float, horizon: int = 1) -> float:
        """Calculate probability of reaching target price"""
        expected = self.ou_expectation(current_price, horizon)
        variance = (self.sigma**2 / (2 * self.theta)) * (1 - np.exp(-2 * self.theta * horizon))
        std = np.sqrt(variance)
        
        if target > current_price:
            prob = 1 - stats.norm.cdf(target, expected, std)
        else:
            prob = stats.norm.cdf(target, expected, std)
        
        return prob
    
    def on_trading_iteration(self):
        asset = Asset(self.symbol)
        current_price = self.get_last_price(asset)
        
        if current_price is None:
            return
        
        self.price_history.append(current_price)
        
        if len(self.price_history) < self.lookback:
            return
        
        # Estimate OU parameters
        prices = np.array(self.price_history[-self.lookback:])
        self.theta, self.mu, self.sigma = self.estimate_ou_params(prices)
        
        # Calculate z-score relative to OU equilibrium
        log_price = np.log(current_price)
        z_score = (log_price - self.mu) / self.sigma if self.sigma > 0 else 0
        
        # Calculate expected price movement
        expected_price = self.ou_expectation(log_price)
        
        logger.info(f"OU: Price={current_price:.2f}, Mu={np.exp(self.mu):.2f}, "
                   f"Theta={self.theta:.4f}, Z={z_score:.2f}")
        
        # Trading signals
        if z_score > self.entry_threshold and self.position >= 0:
            # Price above equilibrium, expect mean reversion down
            if self.position == 1:
                self.sell_all(asset)
            qty = self.get_cash() * 0.3 / current_price
            self.create_order(asset, qty, "sell")
            self.position = -1
            logger.info(f"OU SIGNAL: SELL (z-score: {z_score:.2f})")
            
        elif z_score < -self.entry_threshold and self.position <= 0:
            # Price below equilibrium, expect mean reversion up
            if self.position == -1:
                self.sell_all(asset)
            qty = self.get_cash() * 0.3 / current_price
            self.create_order(asset, qty, "buy")
            self.position = 1
            logger.info(f"OU SIGNAL: BUY (z-score: {z_score:.2f})")
            
        elif abs(z_score) < self.exit_threshold and self.position != 0:
            # Near equilibrium, exit
            self.sell_all(asset)
            self.position = 0
            logger.info(f"OU SIGNAL: EXIT (mean reversion complete)")


class DonchianTrendStrategy(Strategy):
    """
    Kron (TRF) - Trend Following using Donchian Channels
    Classic turtle trading system
    """
    
    def initialize(self,
                   symbol: str = "BTC/USDT",
                   upper_period: int = 20,
                   lower_period: int = 20,
                   exit_period: int = 10,
                   position_size: float = 0.1,
                   pyramiding: int = 4):
        self.sleeptime = "1H"
        self.symbol = symbol
        self.upper_period = upper_period
        self.lower_period = lower_period
        self.exit_period = exit_period
        self.position_size = position_size
        self.pyramiding = pyramiding
        self.entries = 0
        self.breakout_price = None
        self.position = 0  # 1: long, -1: short, 0: flat
        
    def calculate_donchian(self, high: pd.Series, low: pd.Series, period: int) -> Tuple[float, float, float]:
        """Calculate Donchian channel levels"""
        upper = high.rolling(period).max().iloc[-1]
        lower = low.rolling(period).min().iloc[-1]
        middle = (upper + lower) / 2
        return upper, lower, middle
    
    def calculate_position_size_volatility(self, price: float, atr: float) -> float:
        """Calculate position size based on volatility (N)"""
        # Risk 1% of account per trade
        account_risk = self.get_cash() * 0.01
        n_value = atr  # N = ATR
        unit = account_risk / n_value if n_value > 0 else 0.1
        return min(unit, self.position_size)
    
    def on_trading_iteration(self):
        asset = Asset(self.symbol)
        bars = self.get_historical_prices(asset, max(self.upper_period, self.lower_period) + 10, "hour")
        
        if bars is None or len(bars) < self.upper_period:
            return
        
        high = bars['high']
        low = bars['low']
        close = bars['close'].iloc[-1]
        
        # Calculate Donchian channels
        upper_channel, lower_channel, middle = self.calculate_donchian(high, low, self.upper_period)
        exit_upper, exit_lower, _ = self.calculate_donchian(high, low, self.exit_period)
        
        # Calculate ATR for position sizing
        atr = ((high - low).rolling(20).mean()).iloc[-1]
        
        current_pos = self.get_asset_position(asset)
        
        logger.info(f"Donchian: Close={close:.2f}, Upper={upper_channel:.2f}, "
                   f"Lower={lower_channel:.2f}, Position={current_pos:.4f}")
        
        # Entry signals
        if self.position == 0:
            if close >= upper_channel:
                # Breakout above upper channel - go long
                qty = self.calculate_position_size_volatility(close, atr)
                self.create_order(asset, qty, "buy")
                self.position = 1
                self.entries = 1
                self.breakout_price = close
                logger.info(f"DONCHIAN: LONG breakout at {close:.2f}")
                
            elif close <= lower_channel:
                # Breakout below lower channel - go short
                qty = self.calculate_position_size_volatility(close, atr)
                self.create_order(asset, qty, "sell")
                self.position = -1
                self.entries = 1
                self.breakout_price = close
                logger.info(f"DONCHIAN: SHORT breakout at {close:.2f}")
        
        # Pyramiding
        elif self.position == 1 and self.entries < self.pyramiding:
            # Add to long position on favorable move
            if close > self.breakout_price * (1 + 0.5 * atr / self.breakout_price):
                qty = self.calculate_position_size_volatility(close, atr)
                self.create_order(asset, qty, "buy")
                self.entries += 1
                self.breakout_price = close
                logger.info(f"DONCHIAN: PYRAMID LONG at {close:.2f}")
                
        elif self.position == -1 and self.entries < self.pyramiding:
            # Add to short position on favorable move
            if close < self.breakout_price * (1 - 0.5 * atr / self.breakout_price):
                qty = self.calculate_position_size_volatility(close, atr)
                self.create_order(asset, qty, "sell")
                self.entries += 1
                self.breakout_price = close
                logger.info(f"DONCHIAN: PYRAMID SHORT at {close:.2f}")
        
        # Exit signals
        if self.position == 1 and close <= exit_lower:
            # Exit long on break below exit channel
            self.sell_all(asset)
            self.position = 0
            self.entries = 0
            self.breakout_price = None
            logger.info(f"DONCHIAN: EXIT LONG at {close:.2f}")
            
        elif self.position == -1 and close >= exit_upper:
            # Exit short on break above exit channel
            self.sell_all(asset)
            self.position = 0
            self.entries = 0
            self.breakout_price = None
            logger.info(f"DONCHIAN: EXIT SHORT at {close:.2f}")
