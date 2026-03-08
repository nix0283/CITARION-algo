"""
Training pipelines for ML models
"""

import numpy as np
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


async def train_price_predictor(
    model,
    data: Dict[str, np.ndarray],
    config: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Train the price predictor model.
    
    Args:
        model: PricePredictorModel instance
        data: Dict with 'X' and 'y' arrays
        config: Training configuration
        
    Returns:
        Training history
    """
    X = data['X']
    y = data['y']
    
    history = model.train(
        X=X,
        y=y,
        validation_split=config.get('validation_split', 0.2),
        epochs=config.get('epochs', 100),
        batch_size=config.get('batch_size', 32),
        early_stopping_patience=config.get('early_stopping_patience', 10),
    )
    
    return history


async def train_signal_classifier(
    model,
    data: Dict[str, np.ndarray],
    config: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Train the signal classifier model.
    
    Args:
        model: SignalClassifierModel instance
        data: Dict with 'X' and 'y' arrays
        config: Training configuration
        
    Returns:
        Training metrics
    """
    X = data['X']
    y = data['y']
    
    metrics = model.train(
        X=X,
        y=y,
        cross_validate=config.get('cross_validate', True),
    )
    
    return metrics


async def train_regime_detector(
    model,
    data: Dict[str, np.ndarray],
    config: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Train the regime detector model.
    
    Args:
        model: RegimeDetectorModel instance
        data: Dict with 'X' array (observations)
        config: Training configuration
        
    Returns:
        Training metrics
    """
    X = data['X']
    lengths = data.get('lengths', None)
    
    metrics = model.train(
        X=X,
        lengths=lengths,
    )
    
    return metrics


class TrainingPipeline:
    """Automated training pipeline for all models"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.training_status = {}
    
    async def run_full_training(self, data: Dict[str, np.ndarray]) -> Dict[str, Any]:
        """Run training for all models"""
        results = {}
        
        # Train each model
        for model_name in ['price_predictor', 'signal_classifier', 'regime_detector']:
            self.training_status[model_name] = 'training'
            
            try:
                if model_name == 'price_predictor':
                    results[model_name] = await train_price_predictor(
                        None, data, self.config.get('price_predictor', {})
                    )
                elif model_name == 'signal_classifier':
                    results[model_name] = await train_signal_classifier(
                        None, data, self.config.get('signal_classifier', {})
                    )
                elif model_name == 'regime_detector':
                    results[model_name] = await train_regime_detector(
                        None, data, self.config.get('regime_detector', {})
                    )
                
                self.training_status[model_name] = 'completed'
            except Exception as e:
                logger.error(f"Training failed for {model_name}: {e}")
                self.training_status[model_name] = 'failed'
                results[model_name] = {"error": str(e)}
        
        return results
    
    def get_status(self) -> Dict[str, str]:
        """Get training status for all models"""
        return self.training_status
