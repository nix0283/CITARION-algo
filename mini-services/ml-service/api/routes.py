"""
API Routes for ML Service
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import numpy as np

router = APIRouter()


# ==================== SCHEMAS ====================

class PricePredictRequest(BaseModel):
    features: List[List[List[float]]]  # (samples, sequence_length, features)
    return_confidence: bool = False


class SignalPredictRequest(BaseModel):
    features: List[List[float]]  # (samples, features)


class RegimePredictRequest(BaseModel):
    observations: List[List[float]]  # (samples, features) - returns, volatility, volume


class TrainRequest(BaseModel):
    model_type: str  # price_predictor, signal_classifier, regime_detector
    X: List[Any]
    y: Optional[List[Any]] = None
    epochs: int = 100
    batch_size: int = 32


# ==================== PRICE PREDICTION ====================

@router.post("/predict/price")
async def predict_price(request: PricePredictRequest):
    """
    Predict price changes for multiple horizons.
    
    Returns predictions for 1m, 5m, 15m, 1h horizons.
    """
    from main import models
    
    model = models.get("price_predictor")
    if model is None:
        raise HTTPException(status_code=503, detail="Price predictor model not available")
    
    X = np.array(request.features)
    
    if request.return_confidence:
        predictions, std = model.predict_with_confidence(X)
        return {
            "predictions": predictions.tolist(),
            "confidence_intervals": {
                "std": std.tolist(),
                "lower": (predictions - 1.96 * std).tolist(),
                "upper": (predictions + 1.96 * std).tolist(),
            }
        }
    else:
        predictions = model.predict(X)
        return {"predictions": predictions.tolist()}


# ==================== SIGNAL CLASSIFICATION ====================

@router.post("/predict/signal")
async def predict_signal(request: SignalPredictRequest):
    """
    Classify trading signals (BUY, SELL, HOLD).
    
    Returns signal type with confidence and probabilities.
    """
    from main import models
    
    model = models.get("signal_classifier")
    if model is None:
        raise HTTPException(status_code=503, detail="Signal classifier model not available")
    
    X = np.array(request.features)
    signals = model.predict_signal(X)
    
    return {"signals": signals}


# ==================== REGIME DETECTION ====================

@router.post("/predict/regime")
async def predict_regime(request: RegimePredictRequest):
    """
    Detect market regime (BULL, BEAR, SIDEWAYS).
    
    Input features: [returns, volatility, volume]
    """
    from main import models
    
    model = models.get("regime_detector")
    if model is None:
        raise HTTPException(status_code=503, detail="Regime detector model not available")
    
    X = np.array(request.observations)
    regime_info = model.detect_current_regime(X)
    
    return regime_info


# ==================== TRAINING ====================

@router.post("/train")
async def train_model(request: TrainRequest):
    """
    Train a model with provided data.
    """
    from main import models
    
    model = models.get(request.model_type)
    if model is None:
        raise HTTPException(status_code=400, detail=f"Unknown model type: {request.model_type}")
    
    X = np.array(request.X)
    y = np.array(request.y) if request.y else None
    
    if request.model_type == "price_predictor":
        history = model.train(X, y, epochs=request.epochs, batch_size=request.batch_size)
    elif request.model_type == "signal_classifier":
        history = model.train(X, y)
    elif request.model_type == "regime_detector":
        history = model.train(X)
    else:
        raise HTTPException(status_code=400, detail=f"Cannot train model type: {request.model_type}")
    
    return {
        "status": "trained",
        "model_type": request.model_type,
        "history": history,
    }


# ==================== MODELS INFO ====================

@router.get("/models")
async def list_models():
    """List all available models and their status"""
    from main import models
    
    model_list = []
    for name, model in models.items():
        if model is not None:
            model_list.append({
                "name": name,
                "is_trained": model.is_trained,
                "metrics": model.get_metrics(),
            })
        else:
            model_list.append({
                "name": name,
                "is_trained": False,
                "metrics": None,
            })
    
    return {"models": model_list}


@router.get("/models/{model_name}/metrics")
async def get_model_metrics(model_name: str):
    """Get metrics for a specific model"""
    from main import models
    
    model = models.get(model_name)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_name}")
    
    return model.get_metrics()
