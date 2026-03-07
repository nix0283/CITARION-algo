"""
Training callbacks for RL agents
"""

from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

try:
    from stable_baselines3.common.callbacks import BaseCallback
    SB3_AVAILABLE = True
except ImportError:
    SB3_AVAILABLE = False
    BaseCallback = object


class TrainingProgressCallback(BaseCallback if SB3_AVAILABLE else object):
    """
    Callback for tracking training progress.
    """
    
    def __init__(
        self,
        verbose: int = 0,
        log_interval: int = 100,
    ):
        super().__init__(verbose) if SB3_AVAILABLE else None
        self.log_interval = log_interval
        self.episode_rewards = []
        self.episode_lengths = []
    
    def _on_step(self) -> bool:
        """Called after each step"""
        if self.n_calls % self.log_interval == 0:
            logger.info(f"Step {self.n_calls}")
        return True
    
    def _on_rollout_end(self) -> None:
        """Called at the end of a rollout"""
        if hasattr(self, 'model') and self.model is not None:
            pass  # Log metrics


class EarlyStoppingCallback(BaseCallback if SB3_AVAILABLE else object):
    """
    Callback for early stopping based on reward threshold.
    """
    
    def __init__(
        self,
        reward_threshold: float = 1000.0,
        verbose: int = 0,
    ):
        super().__init__(verbose) if SB3_AVAILABLE else None
        self.reward_threshold = reward_threshold
    
    def _on_step(self) -> bool:
        """Check if training should stop"""
        # Check if reward threshold reached
        return True
