"""
Training pipeline for RL agents
"""

import numpy as np
from typing import Dict, Any, Optional
import logging
import asyncio

logger = logging.getLogger(__name__)


async def train_agent(
    agent,
    env,
    total_timesteps: int = 100000,
    callback = None,
) -> Dict[str, Any]:
    """
    Train an RL agent.
    
    Args:
        agent: RL agent instance (PPO, SAC, DQN)
        env: Gymnasium environment
        total_timesteps: Total training steps
        callback: Optional callback for monitoring
        
    Returns:
        Training metrics
    """
    return agent.train(
        env=env,
        total_timesteps=total_timesteps,
        callback=callback,
    )


class TrainingPipeline:
    """Automated training pipeline for RL agents"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.training_status = {}
    
    async def run_training(
        self,
        agent_name: str,
        env,
        total_timesteps: int = None,
    ) -> Dict[str, Any]:
        """Run training for specified agent"""
        from main import agents
        
        agent = agents.get(agent_name)
        if agent is None:
            raise ValueError(f"Unknown agent: {agent_name}")
        
        self.training_status[agent_name] = 'training'
        
        timesteps = total_timesteps or self.config.get('training', {}).get('total_timesteps', 100000)
        
        try:
            result = await train_agent(agent, env, timesteps)
            self.training_status[agent_name] = 'completed'
            return result
        except Exception as e:
            logger.error(f"Training failed for {agent_name}: {e}")
            self.training_status[agent_name] = 'failed'
            return {"error": str(e)}
    
    def get_status(self) -> Dict[str, str]:
        """Get training status"""
        return self.training_status
