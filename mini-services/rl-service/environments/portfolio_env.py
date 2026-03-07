"""
Portfolio Management Environment for Reinforcement Learning
Gymnasium-compatible environment for multi-asset portfolio management
"""

import gymnasium as gym
import numpy as np
from gymnasium import spaces
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass
import pandas as pd


@dataclass
class PortfolioConfig:
    """Configuration for portfolio environment"""
    initial_balance: float = 100000.0
    commission_rate: float = 0.001  # 0.1%
    slippage_rate: float = 0.0005  # 0.05%
    max_position_per_asset: float = 0.25  # Max 25% per asset
    max_total_position: float = 1.0  # Max 100% invested
    reward_scaling: float = 100.0
    lookback_window: int = 30
    rebalance_penalty: float = 0.001  # Penalty for frequent rebalancing
    risk_free_rate: float = 0.02  # Annual risk-free rate


class PortfolioEnvironment(gym.Env):
    """
    Multi-Asset Portfolio Management Environment
    
    Observation Space:
        - Asset prices (normalized returns)
        - Technical indicators per asset
        - Current portfolio weights
        - Portfolio metrics (returns, volatility, drawdown)
        - Market regime indicators
    
    Action Space:
        - Continuous: Target portfolio weights (sum to 1)
        - Or Discrete: Rebalance actions per asset
    """
    
    metadata = {"render_modes": ["human"]}
    
    def __init__(
        self,
        config: Optional[PortfolioConfig] = None,
        assets: Optional[List[str]] = None,
        data_dict: Optional[Dict[str, pd.DataFrame]] = None,
        continuous_action: bool = True,
        render_mode: Optional[str] = None
    ):
        super().__init__()
        
        self.config = config or PortfolioConfig()
        self.continuous_action = continuous_action
        self.render_mode = render_mode
        self.assets = assets or []
        self.data_dict = data_dict or {}
        
        # Number of assets
        self.n_assets = len(self.assets) if self.assets else 5  # Default 5 assets
        
        # Portfolio state
        self.weights = np.zeros(self.n_assets)
        self.cash_weight = 1.0
        self.balance = self.config.initial_balance
        self.initial_balance = self.config.initial_balance
        self.max_equity = self.config.initial_balance
        self.equity_history: List[float] = []
        
        # Performance tracking
        self.returns_history: List[float] = []
        self.rebalance_count = 0
        
        # Current data index
        self.current_index = 0
        self.data_length = 0
        
        # Define observation space
        # Per asset: 10 features + portfolio features: 5
        obs_dim = self.n_assets * 10 + 5
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(obs_dim,),
            dtype=np.float32
        )
        
        # Define action space
        if continuous_action:
            # Portfolio weights (will be softmax normalized)
            self.action_space = spaces.Box(
                low=0.0,
                high=1.0,
                shape=(self.n_assets + 1,),  # +1 for cash
                dtype=np.float32
            )
        else:
            # Discrete: hold, increase, decrease per asset
            self.action_space = spaces.MultiDiscrete([3] * self.n_assets)
        
        self.state = None
        self.episode_length = 0
    
    def set_data(
        self,
        assets: List[str],
        data_dict: Dict[str, pd.DataFrame]
    ) -> None:
        """Set the data for all assets"""
        self.assets = assets
        self.data_dict = data_dict
        self.n_assets = len(assets)
        
        # Update spaces
        obs_dim = self.n_assets * 10 + 5
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(obs_dim,), dtype=np.float32
        )
        
        if self.continuous_action:
            self.action_space = spaces.Box(
                low=0.0, high=1.0, shape=(self.n_assets + 1,), dtype=np.float32
            )
        else:
            self.action_space = spaces.MultiDiscrete([3] * self.n_assets)
        
        # Determine data length
        if data_dict:
            first_asset = list(data_dict.keys())[0]
            self.data_length = len(data_dict[first_asset])
    
    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[Dict] = None
    ) -> Tuple[np.ndarray, Dict]:
        """Reset the environment"""
        super().reset(seed=seed)
        
        if not self.data_dict:
            raise ValueError("No data provided. Call set_data() first.")
        
        # Reset portfolio state
        self.weights = np.zeros(self.n_assets)
        self.cash_weight = 1.0
        self.balance = self.config.initial_balance
        self.max_equity = self.config.initial_balance
        self.equity_history = [self.config.initial_balance]
        self.returns_history = []
        self.rebalance_count = 0
        self.current_index = self.config.lookback_window
        self.episode_length = 0
        
        # Get initial observation
        self.state = self._get_observation()
        
        return self.state, self._get_info()
    
    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """Execute one step"""
        if self.state is None:
            raise ValueError("Environment not reset. Call reset() first.")
        
        prev_equity = self._get_equity()
        
        # Execute rebalancing
        self._execute_action(action)
        
        # Move to next step
        self.current_index += 1
        self.episode_length += 1
        
        # Update prices and calculate new equity
        new_equity = self._get_equity()
        
        # Track performance
        self.max_equity = max(self.max_equity, new_equity)
        self.equity_history.append(new_equity)
        
        prev_equity_val = self.equity_history[-2] if len(self.equity_history) > 1 else self.initial_balance
        daily_return = (new_equity - prev_equity_val) / prev_equity_val
        self.returns_history.append(daily_return)
        
        # Calculate reward
        reward = self._calculate_reward(prev_equity, new_equity, action)
        
        # Check termination
        terminated = self._is_terminated()
        truncated = self._is_truncated()
        
        self.state = self._get_observation()
        
        return self.state, reward, terminated, truncated, self._get_info()
    
    def _execute_action(self, action: np.ndarray) -> None:
        """Execute portfolio rebalancing"""
        if self.continuous_action:
            # Softmax normalize weights
            weights = self._softmax(action)
            target_weights = weights[:-1]  # Exclude cash
            target_cash = weights[-1]
        else:
            # Discrete action: adjust weights
            target_weights = self.weights.copy()
            for i, act in enumerate(action):
                if act == 1:  # Increase
                    target_weights[i] = min(target_weights[i] + 0.1, self.config.max_position_per_asset)
                elif act == 2:  # Decrease
                    target_weights[i] = max(target_weights[i] - 0.1, 0.0)
            
            # Normalize weights
            total = np.sum(target_weights)
            if total > self.config.max_total_position:
                target_weights *= self.config.max_total_position / total
            target_cash = 1.0 - np.sum(target_weights)
        
        # Calculate rebalancing costs
        weight_changes = np.abs(target_weights - self.weights)
        rebalance_cost = np.sum(weight_changes) * self.config.commission_rate
        rebalance_cost += np.sum(weight_changes) * self.config.slippage_rate
        
        # Apply costs
        self.balance *= (1 - rebalance_cost)
        
        # Update weights
        self.weights = target_weights
        self.cash_weight = target_cash
        
        # Track rebalancing
        if np.sum(weight_changes) > 0.01:
            self.rebalance_count += 1
    
    def _softmax(self, x: np.ndarray) -> np.ndarray:
        """Apply softmax normalization"""
        exp_x = np.exp(x - np.max(x))
        return exp_x / np.sum(exp_x)
    
    def _get_equity(self) -> float:
        """Calculate current portfolio equity"""
        equity = self.balance * self.cash_weight
        
        for i, asset in enumerate(self.assets):
            if asset in self.data_dict:
                df = self.data_dict[asset]
                if self.current_index < len(df):
                    price = df['close'].iloc[self.current_index]
                    initial_price = df['close'].iloc[self.config.lookback_window]
                    
                    # Asset value = weight * balance * price_return
                    if initial_price > 0:
                        price_return = price / initial_price
                        equity += self.balance * self.weights[i] * price_return
        
        return equity
    
    def _calculate_reward(
        self,
        prev_equity: float,
        new_equity: float,
        action: np.ndarray
    ) -> float:
        """Calculate portfolio reward"""
        # Basic return
        portfolio_return = (new_equity - prev_equity) / prev_equity
        
        # Risk-adjusted return (Sharpe-like)
        if len(self.returns_history) > 1:
            returns = np.array(self.returns_history)
            std = np.std(returns)
            if std > 0:
                risk_adjusted_return = portfolio_return / std
            else:
                risk_adjusted_return = portfolio_return
        else:
            risk_adjusted_return = portfolio_return
        
        # Penalize excessive rebalancing
        rebalance_penalty = 0.0
        if self.continuous_action:
            weight_changes = np.abs(self._softmax(action)[:-1] - self.weights)
            rebalance_penalty = np.sum(weight_changes) * self.config.rebalance_penalty
        
        reward = risk_adjusted_return - rebalance_penalty
        
        return reward * self.config.reward_scaling
    
    def _get_observation(self) -> np.ndarray:
        """Get current observation"""
        obs_list = []
        
        for asset in self.assets:
            if asset in self.data_dict:
                df = self.data_dict[asset]
                
                if self.current_index < len(df):
                    row = df.iloc[self.current_index]
                    prev_row = df.iloc[self.current_index - 1] if self.current_index > 0 else row
                    
                    # Asset features
                    asset_obs = [
                        # Price features
                        (row['close'] - prev_row['close']) / prev_row['close'] if prev_row['close'] > 0 else 0.0,
                        (row['high'] - row['low']) / row['close'] if row['close'] > 0 else 0.0,
                        row['volume'] / (df['volume'].rolling(20).mean().iloc[self.current_index] + 1e-8),
                        
                        # Technical indicators (simplified)
                        self._calculate_return(df, 5),
                        self._calculate_return(df, 10),
                        self._calculate_return(df, 20),
                        self._calculate_volatility(df, 20),
                        self._calculate_momentum(df, 14),
                        self._calculate_rsi(df, 14),
                        row['close'] / df['close'].rolling(50).mean().iloc[self.current_index] - 1.0 if self.current_index >= 50 else 0.0,
                    ]
                else:
                    asset_obs = [0.0] * 10
                
                obs_list.extend(asset_obs)
        
        # Portfolio features
        portfolio_obs = [
            np.sum(self.weights),  # Total invested
            self.cash_weight,  # Cash allocation
            self._get_drawdown(),
            self._calculate_portfolio_volatility(),
            self._calculate_portfolio_return(),
        ]
        obs_list.extend(portfolio_obs)
        
        obs = np.array(obs_list, dtype=np.float32)
        obs = np.nan_to_num(obs, nan=0.0, posinf=1.0, neginf=-1.0)
        
        return obs
    
    def _calculate_return(self, df: pd.DataFrame, period: int) -> float:
        """Calculate period return"""
        if self.current_index < period:
            return 0.0
        try:
            current = df['close'].iloc[self.current_index]
            past = df['close'].iloc[self.current_index - period]
            return (current - past) / past if past > 0 else 0.0
        except:
            return 0.0
    
    def _calculate_volatility(self, df: pd.DataFrame, period: int) -> float:
        """Calculate period volatility"""
        if self.current_index < period:
            return 0.0
        try:
            returns = df['close'].pct_change().iloc[self.current_index - period:self.current_index]
            return returns.std()
        except:
            return 0.0
    
    def _calculate_momentum(self, df: pd.DataFrame, period: int) -> float:
        """Calculate momentum"""
        if self.current_index < period:
            return 0.0
        try:
            returns = df['close'].pct_change().iloc[self.current_index - period:self.current_index]
            return returns.mean()
        except:
            return 0.0
    
    def _calculate_rsi(self, df: pd.DataFrame, period: int) -> float:
        """Calculate RSI"""
        if self.current_index < period + 1:
            return 0.5
        try:
            delta = df['close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            rs = gain / loss
            rsi = 100 - (100 / (1 + rs))
            return rsi.iloc[self.current_index] / 100.0
        except:
            return 0.5
    
    def _get_drawdown(self) -> float:
        """Calculate current drawdown"""
        if self.max_equity <= 0:
            return 0.0
        current_equity = self.equity_history[-1] if self.equity_history else self.initial_balance
        return (self.max_equity - current_equity) / self.max_equity
    
    def _calculate_portfolio_volatility(self) -> float:
        """Calculate portfolio volatility from returns history"""
        if len(self.returns_history) < 2:
            return 0.0
        return np.std(self.returns_history)
    
    def _calculate_portfolio_return(self) -> float:
        """Calculate cumulative portfolio return"""
        if len(self.returns_history) == 0:
            return 0.0
        return np.prod(1 + np.array(self.returns_history)) - 1
    
    def _is_terminated(self) -> bool:
        """Check termination"""
        # End of data
        if self.current_index >= self.data_length - 1:
            return True
        
        # Ruin
        equity = self._get_equity()
        if equity < self.initial_balance * 0.1:
            return True
        
        return False
    
    def _is_truncated(self) -> bool:
        """Check truncation"""
        return self.episode_length >= 1000  # Max episode length
    
    def _get_info(self) -> Dict[str, Any]:
        """Get info dict"""
        equity = self._get_equity()
        
        return {
            'equity': equity,
            'pnl': equity - self.initial_balance,
            'return': (equity - self.initial_balance) / self.initial_balance,
            'weights': self.weights.tolist(),
            'cash_weight': self.cash_weight,
            'rebalance_count': self.rebalance_count,
            'drawdown': self._get_drawdown(),
            'sharpe_ratio': self._calculate_sharpe(),
            'max_drawdown': self._calculate_max_drawdown(),
        }
    
    def _calculate_sharpe(self) -> float:
        """Calculate Sharpe ratio"""
        if len(self.returns_history) < 2:
            return 0.0
        
        returns = np.array(self.returns_history)
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        
        if std_return == 0:
            return 0.0
        
        # Annualized
        excess_return = mean_return * 252 - self.config.risk_free_rate
        return excess_return / (std_return * np.sqrt(252))
    
    def _calculate_max_drawdown(self) -> float:
        """Calculate maximum drawdown"""
        if len(self.equity_history) < 2:
            return 0.0
        
        peak = self.equity_history[0]
        max_dd = 0.0
        
        for equity in self.equity_history:
            if equity > peak:
                peak = equity
            dd = (peak - equity) / peak
            max_dd = max(max_dd, dd)
        
        return max_dd
    
    def render(self):
        """Render environment"""
        if self.render_mode == "human":
            info = self._get_info()
            print(f"Step: {self.current_index}, Equity: {info['equity']:.2f}, "
                  f"Return: {info['return']:.2%}, Sharpe: {info['sharpe_ratio']:.2f}, "
                  f"Max DD: {info['max_drawdown']:.2%}")
    
    def close(self):
        """Clean up"""
        pass
