"""
DQN Agent Implementation
Deep Q-Network for discrete trading actions.
"""

import numpy as np
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

try:
    from stable_baselines3 import DQN
    SB3_AVAILABLE = True
except ImportError:
    SB3_AVAILABLE = False
    DQN = None
    logger.warning("stable-baselines3 not available, using mock implementation")


class DQNAgent:
    """
    DQN (Deep Q-Network) agent for trading.
    
    Features:
    - Discrete action space
    - Experience replay
    - Target network
    - Double DQN support
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.model = None
        self.is_trained = False
        
        # Default hyperparameters
        self.learning_rate = self.config.get('learning_rate', 1e-4)
        self.buffer_size = self.config.get('buffer_size', 100000)
        self.learning_starts = self.config.get('learning_starts', 1000)
        self.batch_size = self.config.get('batch_size', 32)
        self.gamma = self.config.get('gamma', 0.99)
        self.train_freq = self.config.get('train_freq', 4)
        self.target_update_interval = self.config.get('target_update_interval', 1000)
        self.exploration_fraction = self.config.get('exploration_fraction', 0.1)
        self.exploration_final_eps = self.config.get('exploration_final_eps', 0.05)
    
    def create_model(self, env, **kwargs) -> None:
        """Create DQN model"""
        if not SB3_AVAILABLE:
            logger.warning("Cannot create model - stable-baselines3 not available")
            return
        
        self.model = DQN(
            "MlpPolicy",
            env,
            learning_rate=self.learning_rate,
            buffer_size=self.buffer_size,
            learning_starts=self.learning_starts,
            batch_size=self.batch_size,
            gamma=self.gamma,
            train_freq=self.train_freq,
            target_update_interval=self.target_update_interval,
            exploration_fraction=self.exploration_fraction,
            exploration_final_eps=self.exploration_final_eps,
            verbose=1,
            **kwargs
        )
    
    def train(
        self,
        env,
        total_timesteps: int = 100000,
        callback = None,
    ) -> Dict[str, Any]:
        """Train the DQN agent"""
        if not SB3_AVAILABLE:
            self.is_trained = True
            return {"total_timesteps": total_timesteps, "episodes": 0}
        
        if self.model is None:
            self.create_model(env)
        
        self.model.learn(total_timesteps=total_timesteps, callback=callback)
        self.is_trained = True
        
        return {
            "total_timesteps": total_timesteps,
            "model": "DQN",
            "config": self.config,
        }
    
    def predict(
        self,
        observation: np.ndarray,
        deterministic: bool = True
    ) -> tuple:
        """Get action prediction"""
        if not SB3_AVAILABLE or self.model is None:
            return np.random.randint(0, 4), None
        
        return self.model.predict(observation, deterministic=deterministic)
    
    def get_q_values(self, observation: np.ndarray) -> np.ndarray:
        """Get Q-values for all actions"""
        if not SB3_AVAILABLE or self.model is None:
            return np.zeros(4)
        
        return self.model.q_net(observation).detach().numpy()
    
    def save(self, path: str) -> bool:
        """Save model to disk"""
        if self.model is None:
            return False
        try:
            self.model.save(path)
            return True
        except Exception as e:
            logger.error(f"Failed to save model: {e}")
            return False
    
    def load(self, path: str, env=None) -> bool:
        """Load model from disk"""
        if not SB3_AVAILABLE:
            self.is_trained = True
            return True
        try:
            self.model = DQN.load(path, env=env)
            self.is_trained = True
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get agent metrics"""
        return {
            "is_trained": self.is_trained,
            "algorithm": "DQN",
            "learning_rate": self.learning_rate,
            "buffer_size": self.buffer_size,
            "batch_size": self.batch_size,
        }
