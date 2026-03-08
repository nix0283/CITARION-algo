"""
SAC Agent Implementation
Soft Actor-Critic for continuous trading actions.
"""

import numpy as np
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

try:
    from stable_baselines3 import SAC
    SB3_AVAILABLE = True
except ImportError:
    SB3_AVAILABLE = False
    SAC = None
    logger.warning("stable-baselines3 not available, using mock implementation")


class SACAgent:
    """
    SAC (Soft Actor-Critic) agent for trading.
    
    Features:
    - Off-policy learning
    - Automatic entropy adjustment
    - Continuous action space
    - Sample efficient
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.model = None
        self.is_trained = False
        
        # Default hyperparameters
        self.learning_rate = self.config.get('learning_rate', 3e-4)
        self.buffer_size = self.config.get('buffer_size', 100000)
        self.learning_starts = self.config.get('learning_starts', 1000)
        self.batch_size = self.config.get('batch_size', 256)
        self.gamma = self.config.get('gamma', 0.99)
        self.tau = self.config.get('tau', 0.005)
        self.ent_coef = self.config.get('ent_coef', 'auto')
    
    def create_model(self, env, **kwargs) -> None:
        """Create SAC model"""
        if not SB3_AVAILABLE:
            logger.warning("Cannot create model - stable-baselines3 not available")
            return
        
        self.model = SAC(
            "MlpPolicy",
            env,
            learning_rate=self.learning_rate,
            buffer_size=self.buffer_size,
            learning_starts=self.learning_starts,
            batch_size=self.batch_size,
            gamma=self.gamma,
            tau=self.tau,
            ent_coef=self.ent_coef,
            verbose=1,
            **kwargs
        )
    
    def train(
        self,
        env,
        total_timesteps: int = 100000,
        callback = None,
    ) -> Dict[str, Any]:
        """Train the SAC agent"""
        if not SB3_AVAILABLE:
            self.is_trained = True
            return {"total_timesteps": total_timesteps, "episodes": 0}
        
        if self.model is None:
            self.create_model(env)
        
        self.model.learn(total_timesteps=total_timesteps, callback=callback)
        self.is_trained = True
        
        return {
            "total_timesteps": total_timesteps,
            "model": "SAC",
            "config": self.config,
        }
    
    def predict(
        self,
        observation: np.ndarray,
        deterministic: bool = True
    ) -> tuple:
        """Get action prediction"""
        if not SB3_AVAILABLE or self.model is None:
            return np.random.uniform(-1, 1), None
        
        return self.model.predict(observation, deterministic=deterministic)
    
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
            self.model = SAC.load(path, env=env)
            self.is_trained = True
            return True
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get agent metrics"""
        return {
            "is_trained": self.is_trained,
            "algorithm": "SAC",
            "learning_rate": self.learning_rate,
            "buffer_size": self.buffer_size,
            "batch_size": self.batch_size,
        }
