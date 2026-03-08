"""
RL Service - Reinforcement Learning Microservice for CITARION
Provides PPO, SAC, DQN agents for trading.

Port: 3007
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any
import sys
import os

# Add parent directory to path for shared imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from config.config import load_config
from shared.cors_config import get_cors_config, validate_cors_security

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global state
training_state = {
    "status": "idle",
    "current_agent": None,
    "episode": 0,
    "total_episodes": 0,
    "metrics": {},
}

agents: Dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting RL Service...")
    
    # Validate CORS security on startup
    if not validate_cors_security():
        logger.warning(
            "CORS security validation failed. Check ALLOWED_ORIGINS configuration."
        )
    
    config = load_config()
    
    # Initialize agents
    try:
        from agents.ppo_agent import PPOAgent
        agents["ppo"] = PPOAgent(config.get("agents", {}).get("ppo", {}))
        logger.info("PPO agent initialized")
    except Exception as e:
        logger.warning(f"Could not initialize PPO agent: {e}")
    
    try:
        from agents.sac_agent import SACAgent
        agents["sac"] = SACAgent(config.get("agents", {}).get("sac", {}))
        logger.info("SAC agent initialized")
    except Exception as e:
        logger.warning(f"Could not initialize SAC agent: {e}")
    
    try:
        from agents.dqn_agent import DQNAgent
        agents["dqn"] = DQNAgent(config.get("agents", {}).get("dqn", {}))
        logger.info("DQN agent initialized")
    except Exception as e:
        logger.warning(f"Could not initialize DQN agent: {e}")
    
    logger.info("RL Service started on port 3007")
    
    yield
    
    # Shutdown
    logger.info("Shutting down RL Service...")
    agents.clear()


app = FastAPI(
    title="CITARION RL Service",
    description="Reinforcement Learning microservice for trading agents",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware - uses secure configuration from environment
# Set ALLOWED_ORIGINS environment variable for production
# Example: ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
app.add_middleware(
    CORSMiddleware,
    **get_cors_config()
)

# Include routers
app.include_router(router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "rl-service",
        "agents_loaded": list(agents.keys()),
        "training_status": training_state["status"],
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "CITARION RL Service",
        "version": "1.0.0",
        "endpoints": [
            "/health",
            "/api/v1/train/start",
            "/api/v1/train/stop",
            "/api/v1/train/status",
            "/api/v1/predict",
            "/api/v1/agents",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3007)
