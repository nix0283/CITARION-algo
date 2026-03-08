"""
Trading Environment for Gymnasium
Custom environment for trading simulation with improved reward function.

IMPORTANT: This environment has been updated with:
1. Realized PnL instead of unrealized PnL
2. Risk-adjusted returns (Sharpe-like)
3. Position-independent rewards
4. Drawdown penalty
5. Proper reward scaling
"""

import numpy as np
from typing import Dict, Any, Optional, Tuple, List
import logging
from collections import deque

try:
    import gymnasium as gym
    from gymnasium import spaces
    GYM_AVAILABLE = True
except ImportError:
    GYM_AVAILABLE = False
    gym = None
    spaces = None

logger = logging.getLogger(__name__)


class TradingEnvironment(gym.Env if GYM_AVAILABLE else object):
    """
    Custom trading environment for reinforcement learning.
    
    Observation Space:
    - OHLCV data (normalized)
    - Technical indicators
    - Position state
    - Account balance
    
    Action Space:
    - 0: Hold
    - 1: Buy/Long
    - 2: Sell/Short
    - 3: Close position
    
    Reward Function Improvements:
    - Uses realized PnL (from closed positions) not unrealized
    - Risk-adjusted returns (Sharpe-like ratio)
    - Position-independent rewards
    - Drawdown penalty
    - Proper reward scaling
    """
    
    metadata = {'render_modes': ['human']}
    
    def __init__(
        self,
        data: Optional[np.ndarray] = None,
        initial_balance: float = 10000.0,
        leverage: float = 1.0,
        max_position: float = 1.0,
        fee_rate: float = 0.0004,
        lookback: int = 50,
        reward_scaling: float = 100.0,
        render_mode: Optional[str] = None,
        # New parameters for improved reward function
        risk_free_rate: float = 0.0,
        reward_window: int = 30,
        drawdown_penalty_weight: float = 0.5,
        sharpe_reward_weight: float = 0.3,
        sortino_reward_weight: float = 0.2,
        use_realized_pnl_only: bool = True,
        position_change_penalty: float = 0.001,
    ):
        super().__init__()
        
        self.data = data
        self.initial_balance = initial_balance
        self.leverage = leverage
        self.max_position = max_position
        self.fee_rate = fee_rate
        self.lookback = lookback
        self.reward_scaling = reward_scaling
        self.render_mode = render_mode
        
        # Reward function parameters
        self.risk_free_rate = risk_free_rate
        self.reward_window = reward_window
        self.drawdown_penalty_weight = drawdown_penalty_weight
        self.sharpe_reward_weight = sharpe_reward_weight
        self.sortino_reward_weight = sortino_reward_weight
        self.use_realized_pnl_only = use_realized_pnl_only
        self.position_change_penalty = position_change_penalty
        
        # Action space: 0=Hold, 1=Buy, 2=Sell, 3=Close
        self.action_space = spaces.Discrete(4) if GYM_AVAILABLE else None
        
        # Observation space
        # Features: OHLCV (5) + indicators (10) + position state (3) + balance (1)
        n_features = 5 + 10 + 3 + 1
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf,
            shape=(lookback, n_features),
            dtype=np.float32
        ) if GYM_AVAILABLE else None
        
        # State variables
        self.reset()
    
    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[Dict] = None
    ) -> Tuple[np.ndarray, Dict]:
        """Reset environment to initial state"""
        super().reset(seed=seed) if GYM_AVAILABLE else None
        
        self.balance = self.initial_balance
        self.position = 0.0  # -1 to 1 (short to long)
        self.entry_price = 0.0
        self.entry_balance = self.initial_balance
        self.current_step = self.lookback
        self.done = False
        self.total_reward = 0.0
        self.trades = []
        self.max_balance = self.initial_balance
        self.drawdown = 0.0
        
        # Track realized PnL and returns for reward calculation
        self.realized_pnl_history: List[float] = []
        self.returns_history: List[float] = deque(maxlen=self.reward_window)
        self.equity_history: List[float] = [self.initial_balance]
        
        # Track closed trades for metrics
        self.closed_trades: List[Dict] = []
        self.winning_trades = 0
        self.losing_trades = 0
        
        # Previous position for position change penalty
        self.prev_position = 0.0
        
        obs = self._get_observation()
        info = self._get_info()
        
        return obs, info
    
    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """Execute one step in the environment"""
        if self.done:
            return self._get_observation(), 0.0, True, False, self._get_info()
        
        current_price = self._get_current_price()
        prev_balance = self._calculate_balance(current_price)
        prev_position = self.position
        
        # Execute action
        self._execute_action(action, current_price)
        
        # Move to next step
        self.current_step += 1
        
        # Check if done
        if self.data is not None and self.current_step >= len(self.data) - 1:
            self.done = True
        
        new_price = self._get_current_price()
        new_balance = self._calculate_balance(new_price)
        
        # Calculate reward using improved function
        reward = self._calculate_improved_reward(prev_balance, new_balance, prev_position)
        self.total_reward += reward
        
        # Update tracking variables
        self._update_tracking(new_balance)
        
        # Check if bankrupt
        if new_balance < self.initial_balance * 0.1:
            self.done = True
            reward -= 10  # Bankruptcy penalty
        
        obs = self._get_observation()
        info = self._get_info()
        
        return obs, reward, self.done, False, info
    
    def _get_current_price(self) -> float:
        """Get current close price"""
        if self.data is not None and self.current_step < len(self.data):
            return self.data[self.current_step, 3]  # Close price
        return 1.0
    
    def _get_observation(self) -> np.ndarray:
        """Get current observation"""
        if self.data is None:
            return np.zeros((self.lookback, 19), dtype=np.float32)
        
        # Get lookback window
        start = max(0, self.current_step - self.lookback)
        end = self.current_step
        
        window = self.data[start:end]
        
        # Pad if necessary
        if len(window) < self.lookback:
            padding = np.zeros((self.lookback - len(window), window.shape[1]))
            window = np.vstack([padding, window])
        
        # Normalize OHLCV
        ohlcv = window[:, :5]
        ohlcv = (ohlcv - ohlcv.mean()) / (ohlcv.std() + 1e-8)
        
        # Add indicators (placeholder - would be calculated)
        indicators = np.zeros((self.lookback, 10))
        
        # Position state
        position_state = np.zeros((self.lookback, 3))
        position_state[:, 0] = self.position  # Current position
        position_state[:, 1] = self.entry_price / self._get_current_price() if self.position != 0 else 0
        position_state[:, 2] = self._calculate_unrealized_pnl() / self.initial_balance
        
        # Balance normalized
        balance = np.full((self.lookback, 1), self.balance / self.initial_balance)
        
        # Combine
        obs = np.hstack([ohlcv, indicators, position_state, balance])
        
        return obs.astype(np.float32)
    
    def _execute_action(self, action: int, price: float) -> None:
        """Execute trading action"""
        self.prev_position = self.position
        
        if action == 1:  # Buy/Long
            if self.position <= 0:
                # Close short or open long
                self._close_position(price)
                self.position = self.max_position
                self.entry_price = price
                self.entry_balance = self.balance
                self.trades.append({
                    'type': 'BUY',
                    'price': price,
                    'position': self.position,
                    'step': self.current_step
                })
        
        elif action == 2:  # Sell/Short
            if self.position >= 0:
                # Close long or open short
                self._close_position(price)
                self.position = -self.max_position
                self.entry_price = price
                self.entry_balance = self.balance
                self.trades.append({
                    'type': 'SELL',
                    'price': price,
                    'position': self.position,
                    'step': self.current_step
                })
        
        elif action == 3:  # Close
            self._close_position(price)
    
    def _close_position(self, price: float) -> None:
        """Close current position and record realized PnL"""
        if self.position == 0:
            return
        
        # Calculate realized PnL
        pnl = self._calculate_unrealized_pnl_at_price(price)
        fee = abs(self.position) * price * self.fee_rate
        realized_pnl = pnl - fee
        
        # Update balance
        self.balance += realized_pnl
        
        # Record realized PnL
        self.realized_pnl_history.append(realized_pnl)
        
        # Record trade
        if self.position != 0:
            trade_return = realized_pnl / (abs(self.position) * price * self.leverage)
            self.closed_trades.append({
                'entry_price': self.entry_price,
                'exit_price': price,
                'position': self.position,
                'pnl': realized_pnl,
                'return': trade_return,
                'step': self.current_step
            })
            
            if realized_pnl > 0:
                self.winning_trades += 1
            else:
                self.losing_trades += 1
        
        self.position = 0
        self.entry_price = 0
    
    def _calculate_unrealized_pnl(self) -> float:
        """Calculate unrealized PnL"""
        return self._calculate_unrealized_pnl_at_price(self._get_current_price())
    
    def _calculate_unrealized_pnl_at_price(self, price: float) -> float:
        """Calculate unrealized PnL at given price"""
        if self.position == 0:
            return 0.0
        return self.position * (price - self.entry_price) * self.leverage
    
    def _calculate_balance(self, price: float) -> float:
        """Calculate total balance including unrealized PnL"""
        return self.balance + self._calculate_unrealized_pnl_at_price(price)
    
    def _calculate_improved_reward(
        self, 
        prev_balance: float, 
        new_balance: float,
        prev_position: float
    ) -> float:
        """
        Calculate reward with improvements:
        1. Use realized PnL instead of unrealized
        2. Risk-adjusted returns (Sharpe, Sortino)
        3. Position-independent rewards
        4. Drawdown penalty
        """
        # Calculate period return
        period_return = (new_balance - prev_balance) / prev_balance if prev_balance != 0 else 0
        
        # Track returns for Sharpe/Sortino
        self.returns_history.append(period_return)
        
        # Component 1: Realized PnL component
        if self.use_realized_pnl_only and len(self.realized_pnl_history) > 0:
            # Use most recent realized PnL
            recent_pnl = self.realized_pnl_history[-1] if self.realized_pnl_history else 0
            realized_component = recent_pnl / self.initial_balance
        else:
            # Fallback to period return
            realized_component = period_return
        
        # Component 2: Sharpe-like ratio
        sharpe_reward = self._calculate_sharpe_reward()
        
        # Component 3: Sortino ratio (downside risk only)
        sortino_reward = self._calculate_sortino_reward()
        
        # Component 4: Drawdown penalty
        drawdown_penalty = self._calculate_drawdown_penalty(new_balance)
        
        # Component 5: Position change penalty (discourage overtrading)
        position_change = abs(self.position - prev_position)
        trading_penalty = position_change * self.position_change_penalty
        
        # Combine components
        reward = (
            realized_component * self.reward_scaling * (1 - self.sharpe_reward_weight - self.sortino_reward_weight)
            + sharpe_reward * self.sharpe_reward_weight * self.reward_scaling
            + sortino_reward * self.sortino_reward_weight * self.reward_scaling
            - drawdown_penalty * self.drawdown_penalty_weight
            - trading_penalty
        )
        
        return float(reward)
    
    def _calculate_sharpe_reward(self) -> float:
        """Calculate Sharpe-like ratio for recent returns"""
        if len(self.returns_history) < 2:
            return 0.0
        
        returns = np.array(list(self.returns_history))
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        
        if std_return < 1e-8:
            return 0.0
        
        # Annualized Sharpe (assuming 252 trading days, hourly data)
        sharpe = (mean_return - self.risk_free_rate) / std_return
        
        # Clip to prevent extreme values
        return np.clip(sharpe, -3, 3)
    
    def _calculate_sortino_reward(self) -> float:
        """Calculate Sortino ratio (penalizes only downside volatility)"""
        if len(self.returns_history) < 2:
            return 0.0
        
        returns = np.array(list(self.returns_history))
        mean_return = np.mean(returns)
        
        # Only consider negative returns for downside deviation
        negative_returns = returns[returns < 0]
        
        if len(negative_returns) == 0:
            return np.clip(mean_return * 10, -3, 3)  # No downside, reward positive mean
        
        downside_std = np.std(negative_returns)
        
        if downside_std < 1e-8:
            return 0.0
        
        sortino = (mean_return - self.risk_free_rate) / downside_std
        
        return np.clip(sortino, -3, 3)
    
    def _calculate_drawdown_penalty(self, current_balance: float) -> float:
        """Calculate penalty based on drawdown from peak"""
        if current_balance > self.max_balance:
            self.max_balance = current_balance
            self.drawdown = 0.0
        else:
            self.drawdown = (self.max_balance - current_balance) / self.max_balance
        
        # Quadratic penalty for drawdown
        return self.drawdown ** 2 * 10
    
    def _update_tracking(self, new_balance: float) -> None:
        """Update tracking variables"""
        self.equity_history.append(new_balance)
        
        if new_balance > self.max_balance:
            self.max_balance = new_balance
    
    def _get_info(self) -> Dict:
        """Get info dictionary"""
        # Calculate additional metrics
        win_rate = self.winning_trades / (self.winning_trades + self.losing_trades) if (self.winning_trades + self.losing_trades) > 0 else 0
        
        # Calculate Sharpe ratio from equity curve
        if len(self.equity_history) > 1:
            equity_returns = np.diff(self.equity_history) / np.array(self.equity_history[:-1])
            sharpe = np.mean(equity_returns) / (np.std(equity_returns) + 1e-8) * np.sqrt(252)
        else:
            sharpe = 0
        
        return {
            'balance': self.balance,
            'position': self.position,
            'unrealized_pnl': self._calculate_unrealized_pnl(),
            'total_reward': self.total_reward,
            'trades': len(self.trades),
            'closed_trades': len(self.closed_trades),
            'win_rate': win_rate,
            'drawdown': self.drawdown,
            'sharpe_ratio': sharpe,
            'step': self.current_step,
        }
    
    def get_performance_metrics(self) -> Dict:
        """Get comprehensive performance metrics after episode"""
        if len(self.equity_history) < 2:
            return {}
        
        equity = np.array(self.equity_history)
        returns = np.diff(equity) / equity[:-1]
        
        # Total return
        total_return = (equity[-1] - equity[0]) / equity[0]
        
        # Annualized return
        n_periods = len(returns)
        annualized_return = (1 + total_return) ** (252 * 24 / n_periods) - 1 if n_periods > 0 else 0
        
        # Volatility
        volatility = np.std(returns) * np.sqrt(252 * 24) if len(returns) > 1 else 0
        
        # Sharpe ratio
        sharpe_ratio = (np.mean(returns) / (np.std(returns) + 1e-8)) * np.sqrt(252 * 24) if len(returns) > 1 else 0
        
        # Sortino ratio
        negative_returns = returns[returns < 0]
        downside_std = np.std(negative_returns) if len(negative_returns) > 1 else 1e-8
        sortino_ratio = (np.mean(returns) / downside_std) * np.sqrt(252 * 24)
        
        # Max drawdown
        peak = np.maximum.accumulate(equity)
        drawdown = (peak - equity) / peak
        max_drawdown = np.max(drawdown)
        
        # Calmar ratio
        calmar_ratio = annualized_return / max_drawdown if max_drawdown > 0 else 0
        
        return {
            'total_return': total_return,
            'annualized_return': annualized_return,
            'volatility': volatility,
            'sharpe_ratio': sharpe_ratio,
            'sortino_ratio': sortino_ratio,
            'max_drawdown': max_drawdown,
            'calmar_ratio': calmar_ratio,
            'total_trades': len(self.closed_trades),
            'win_rate': self.winning_trades / (self.winning_trades + self.losing_trades) if (self.winning_trades + self.losing_trades) > 0 else 0,
            'profit_factor': self._calculate_profit_factor(),
        }
    
    def _calculate_profit_factor(self) -> float:
        """Calculate profit factor (gross profit / gross loss)"""
        if not self.closed_trades:
            return 0.0
        
        gross_profit = sum(t['pnl'] for t in self.closed_trades if t['pnl'] > 0)
        gross_loss = abs(sum(t['pnl'] for t in self.closed_trades if t['pnl'] < 0))
        
        return gross_profit / gross_loss if gross_loss > 0 else float('inf') if gross_profit > 0 else 0
    
    def render(self):
        """Render environment state"""
        if self.render_mode == 'human':
            print(f"Step: {self.current_step}, Balance: {self.balance:.2f}, "
                  f"Position: {self.position:.2f}, PnL: {self._calculate_unrealized_pnl():.2f}, "
                  f"Drawdown: {self.drawdown*100:.1f}%")
    
    def close(self):
        """Clean up"""
        pass
