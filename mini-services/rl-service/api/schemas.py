"""
Pydantic Schemas for RL Service API
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class AlgorithmType(str, Enum):
    PPO = "PPO"
    SAC = "SAC"
    DQN = "DQN"


class RewardFunction(str, Enum):
    PNL = "pnl"
    SHARPE = "sharpe"
    SORTINO = "sortino"
    CALMAR = "calmar"


class TrainingStatusEnum(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


# Request Schemas

class TrainingRequest(BaseModel):
    """Request to start training"""
    algorithm: AlgorithmType = Field(default=AlgorithmType.PPO, description="RL algorithm")
    continuous_action: bool = Field(default=False, description="Use continuous action space")
    
    # Training settings
    total_timesteps: int = Field(default=500_000, ge=1000, le=10_000_000)
    learning_rate: float = Field(default=3e-4, gt=0, le=1)
    batch_size: int = Field(default=64, ge=16, le=512)
    buffer_size: int = Field(default=100_000, ge=1000)
    
    # Environment settings
    initial_balance: float = Field(default=10_000.0, gt=0)
    commission_rate: float = Field(default=0.0004, ge=0, le=0.1)
    reward_function: RewardFunction = Field(default=RewardFunction.PNL)
    leverage: int = Field(default=1, ge=1, le=100)
    
    # Early stopping
    early_stopping: bool = Field(default=True)
    patience: int = Field(default=50, ge=10)
    target_sharpe: float = Field(default=2.0)
    
    # Data source
    symbol: Optional[str] = Field(default=None, description="Trading symbol")
    data_source: Optional[str] = Field(default=None, description="Data source URL or path")
    
    # Multi-asset
    multi_asset: bool = Field(default=False)
    assets: List[str] = Field(default_factory=list)
    
    class Config:
        json_schema_extra = {
            "example": {
                "algorithm": "PPO",
                "continuous_action": False,
                "total_timesteps": 500000,
                "learning_rate": 0.0003,
                "batch_size": 64,
                "initial_balance": 10000.0,
                "commission_rate": 0.0004,
                "reward_function": "pnl",
                "symbol": "BTCUSDT",
                "early_stopping": True,
                "target_sharpe": 2.0
            }
        }


class StopTrainingRequest(BaseModel):
    """Request to stop training"""
    job_id: str


class PredictionRequest(BaseModel):
    """Request for agent prediction"""
    agent_id: str = Field(description="Agent ID or model path")
    observation: List[float] = Field(description="Environment observation")
    deterministic: bool = Field(default=True, description="Use deterministic policy")
    
    class Config:
        json_schema_extra = {
            "example": {
                "agent_id": "ppo_BTCUSDT_20240101",
                "observation": [0.5, 0.3, 1.2, 0.45, 0.001, -0.02],
                "deterministic": True
            }
        }


class LoadModelRequest(BaseModel):
    """Request to load a trained model"""
    model_path: str = Field(description="Path to model file")
    algorithm: AlgorithmType = Field(description="RL algorithm")
    agent_id: Optional[str] = Field(default=None, description="Optional custom agent ID")


# Response Schemas

class TrainingStatus(BaseModel):
    """Training job status response"""
    job_id: str
    status: TrainingStatusEnum
    progress: float = Field(ge=0, le=100)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    error: Optional[str] = None
    best_model_path: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "job_id": "job_20240101_120000",
                "status": "running",
                "progress": 45.5,
                "metrics": {
                    "mean_reward": 123.45,
                    "mean_pnl": 234.56,
                    "sharpe_ratio": 1.23
                },
                "start_time": "2024-01-01T12:00:00",
                "end_time": None,
                "error": None,
                "best_model_path": None
            }
        }


class PredictionResponse(BaseModel):
    """Agent prediction response"""
    action: Any = Field(description="Raw action from agent")
    action_name: str = Field(description="Human-readable action name")
    action_value: float = Field(description="Numeric action value")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        json_schema_extra = {
            "example": {
                "action": 1,
                "action_name": "long",
                "action_value": 1.0,
                "metadata": {
                    "confidence": 0.85,
                    "q_values": [0.1, 0.85, 0.02, 0.02, 0.01]
                }
            }
        }


class AgentInfo(BaseModel):
    """Agent information"""
    agent_id: str
    algorithm: str
    status: str
    created_at: Optional[datetime] = None
    model_path: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        json_schema_extra = {
            "example": {
                "agent_id": "ppo_BTCUSDT_20240101",
                "algorithm": "PPO",
                "status": "trained",
                "created_at": "2024-01-01T12:00:00",
                "model_path": "/models/ppo_BTCUSDT/final_model.zip",
                "config": {
                    "learning_rate": 0.0003,
                    "batch_size": 64
                }
            }
        }


class AgentMetrics(BaseModel):
    """Agent performance metrics"""
    agent_id: str
    algorithm: str
    
    # Training metrics
    total_timesteps: int
    total_episodes: int
    mean_reward: float
    std_reward: float
    
    # Trading metrics
    mean_pnl: float
    mean_sharpe: float
    mean_max_drawdown: float
    win_rate: float
    profit_factor: float
    
    # Episode details
    best_episode: Dict[str, Any] = Field(default_factory=dict)
    worst_episode: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        json_schema_extra = {
            "example": {
                "agent_id": "ppo_BTCUSDT_20240101",
                "algorithm": "PPO",
                "total_timesteps": 500000,
                "total_episodes": 1234,
                "mean_reward": 123.45,
                "std_reward": 45.67,
                "mean_pnl": 234.56,
                "mean_sharpe": 1.89,
                "mean_max_drawdown": 0.12,
                "win_rate": 0.56,
                "profit_factor": 1.45,
                "best_episode": {
                    "episode": 456,
                    "reward": 567.89,
                    "pnl": 1234.56
                },
                "worst_episode": {
                    "episode": 789,
                    "reward": -234.56,
                    "pnl": -567.89
                }
            }
        }


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str
    uptime_seconds: float
    active_jobs: int
    loaded_agents: int
    gpu_available: bool
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "1.0.0",
                "uptime_seconds": 3600.0,
                "active_jobs": 2,
                "loaded_agents": 5,
                "gpu_available": True
            }
        }


class JobListResponse(BaseModel):
    """List of training jobs"""
    jobs: List[Dict[str, Any]]
    total: int


class ErrorResponse(BaseModel):
    """Error response"""
    error: str
    detail: Optional[str] = None
    code: Optional[int] = None
