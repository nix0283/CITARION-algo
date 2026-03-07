"""
API Routes for RL Service
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import numpy as np
import asyncio

router = APIRouter()


# ==================== SCHEMAS ====================

class PredictRequest(BaseModel):
    agent: str  # ppo, sac, dqn
    observation: List[List[float]]
    deterministic: bool = True


class TrainStartRequest(BaseModel):
    agent: str  # ppo, sac, dqn
    total_timesteps: int = 100000
    data: Optional[List[List[float]]] = None


class TrainStatusResponse(BaseModel):
    status: str
    agent: Optional[str] = None
    episode: int = 0
    total_episodes: int = 0
    metrics: Dict[str, Any] = {}


# ==================== TRAINING ====================

@router.post("/train/start")
async def start_training(request: TrainStartRequest):
    """Start training an RL agent"""
    from main import agents, training_state
    
    agent = agents.get(request.agent)
    if agent is None:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {request.agent}")
    
    training_state["status"] = "training"
    training_state["current_agent"] = request.agent
    training_state["total_episodes"] = request.total_timesteps
    
    # In production, this would run in background
    # For now, just mark as ready
    return {
        "status": "started",
        "agent": request.agent,
        "total_timesteps": request.total_timesteps,
    }


@router.post("/train/stop")
async def stop_training():
    """Stop current training"""
    from main import training_state
    
    training_state["status"] = "stopped"
    
    return {
        "status": "stopped",
        "metrics": training_state["metrics"],
    }


@router.get("/train/status", response_model=TrainStatusResponse)
async def get_training_status():
    """Get current training status"""
    from main import training_state
    
    return TrainStatusResponse(**training_state)


# ==================== PREDICTION ====================

@router.post("/predict")
async def predict_action(request: PredictRequest):
    """Get action prediction from trained agent"""
    from main import agents
    
    agent = agents.get(request.agent)
    if agent is None:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {request.agent}")
    
    if not agent.is_trained:
        raise HTTPException(status_code=400, detail="Agent not trained")
    
    observation = np.array(request.observation)
    action, state = agent.predict(observation, deterministic=request.deterministic)
    
    return {
        "action": int(action) if isinstance(action, np.ndarray) else action,
        "state": state.tolist() if state is not None else None,
    }


# ==================== AGENTS INFO ====================

@router.get("/agents")
async def list_agents():
    """List all available agents"""
    from main import agents
    
    agent_list = []
    for name, agent in agents.items():
        agent_list.append({
            "name": name,
            "is_trained": agent.is_trained,
            "metrics": agent.get_metrics(),
        })
    
    return {"agents": agent_list}


@router.get("/agents/{agent_name}/metrics")
async def get_agent_metrics(agent_name: str):
    """Get metrics for a specific agent"""
    from main import agents
    
    agent = agents.get(agent_name)
    if agent is None:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_name}")
    
    return agent.get_metrics()
