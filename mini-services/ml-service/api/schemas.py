"""
Pydantic schemas for API validation
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class PricePredictRequest(BaseModel):
    features: List[List[List[float]]]
    return_confidence: bool = False


class PricePredictResponse(BaseModel):
    predictions: List[List[float]]
    confidence_intervals: Optional[Dict[str, Any]] = None


class SignalPredictRequest(BaseModel):
    features: List[List[float]]


class SignalPredictResponse(BaseModel):
    signals: List[Dict[str, Any]]


class RegimePredictRequest(BaseModel):
    observations: List[List[float]]


class RegimePredictResponse(BaseModel):
    regime: str
    regime_id: int
    confidence: float
    probabilities: Dict[str, float]
    transition_matrix: Optional[List[List[float]]] = None


class TrainRequest(BaseModel):
    model_type: str
    X: List[Any]
    y: Optional[List[Any]] = None
    epochs: int = 100
    batch_size: int = 32


class TrainResponse(BaseModel):
    status: str
    model_type: str
    history: Dict[str, Any]
