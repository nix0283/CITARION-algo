"""
ML Service - Machine Learning Microservice for CITARION
Provides price prediction, signal classification, and regime detection.

Port: 3006
"""

import asyncio
import logging
from contextlib import asynccontextmanager
import sys
import os

# Add parent directory to path for shared imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from config.config import load_config
from models.price_predictor import PricePredictorModel
from models.signal_classifier import SignalClassifierModel
from models.regime_detector import RegimeDetectorModel
from shared.cors_config import get_cors_config, validate_cors_security

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global model instances
models = {
    "price_predictor": None,
    "signal_classifier": None,
    "regime_detector": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting ML Service...")
    
    # Validate CORS security on startup
    if not validate_cors_security():
        logger.warning(
            "CORS security validation failed. Check ALLOWED_ORIGINS configuration."
        )
    
    config = load_config()
    
    # Initialize models
    try:
        models["price_predictor"] = PricePredictorModel(
            sequence_length=config.get("models", {}).get("price_predictor", {}).get("sequence_length", 60),
            features=config.get("models", {}).get("price_predictor", {}).get("features", 20),
        )
        logger.info("Price Predictor model initialized")
    except Exception as e:
        logger.warning(f"Could not initialize Price Predictor: {e}")
    
    try:
        models["signal_classifier"] = SignalClassifierModel()
        logger.info("Signal Classifier model initialized")
    except Exception as e:
        logger.warning(f"Could not initialize Signal Classifier: {e}")
    
    try:
        models["regime_detector"] = RegimeDetectorModel()
        logger.info("Regime Detector model initialized")
    except Exception as e:
        logger.warning(f"Could not initialize Regime Detector: {e}")
    
    logger.info("ML Service started on port 3006")
    
    yield
    
    # Shutdown
    logger.info("Shutting down ML Service...")
    models.clear()


app = FastAPI(
    title="CITARION ML Service",
    description="Machine Learning microservice for trading predictions",
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
        "service": "ml-service",
        "models_loaded": {k: v is not None for k, v in models.items()},
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "CITARION ML Service",
        "version": "1.0.0",
        "endpoints": [
            "/health",
            "/api/v1/predict/price",
            "/api/v1/predict/signal",
            "/api/v1/predict/regime",
            "/api/v1/train",
            "/api/v1/models",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3006)
