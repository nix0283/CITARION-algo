"""
Hyperparameter Optimization Module

This module provides hyperparameter optimization using Optuna
for all ML models with various optimization strategies.
"""

import numpy as np
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from pathlib import Path
import json
import logging
from datetime import datetime

import optuna
from optuna.samplers import TPESampler, CmaEsSampler, RandomSampler
from optuna.pruners import MedianPruner, SuccessiveHalvingPruner

import sys
sys.path.append(str(Path(__file__).parent.parent))

from models.price_predictor import PricePredictorModel
from models.signal_classifier import SignalClassifierModel
from models.regime_detector import RegimeDetectorModel
from training.trainer import ModelTrainer, TrainingConfig

logger = logging.getLogger(__name__)


@dataclass
class OptimizationConfig:
    """Configuration for hyperparameter optimization"""
    method: str = "optuna"  # optuna, grid, random
    n_trials: int = 100
    timeout: int = 3600  # seconds
    objectives: List[str] = field(default_factory=lambda: ["accuracy", "f1_score"])
    direction: str = "maximize"  # maximize or minimize
    pruning: bool = True
    n_jobs: int = 1  # parallel jobs
    sampler: str = "tpe"  # tpe, cmaes, random
    
    # Search space
    search_space: Dict[str, Any] = field(default_factory=dict)


@dataclass
class OptimizationResult:
    """Result of hyperparameter optimization"""
    model_type: str
    best_params: Dict[str, Any]
    best_value: float
    n_trials: int
    optimization_time: float
    trial_history: List[Dict[str, Any]]
    importance: Dict[str, float]
    timestamp: str


class HyperparameterOptimizer:
    """
    Hyperparameter Optimization for ML Models
    
    Features:
    - Multiple samplers (TPE, CMA-ES, Random)
    - Multi-objective optimization
    - Early stopping/pruning
    - Parallel trials
    - Parameter importance analysis
    """
    
    # Default search spaces for each model type
    SEARCH_SPACES = {
        'price_predictor': {
            'sequence_length': (30, 120, 'int'),
            'hidden_units_1': (64, 256, 'int'),
            'hidden_units_2': (32, 128, 'int'),
            'attention_units': (16, 64, 'int'),
            'dropout': (0.1, 0.5, 'float'),
            'learning_rate': (1e-5, 1e-2, 'log'),
            'batch_size': [16, 32, 64, 128],
            'l2_reg': (1e-6, 1e-2, 'log')
        },
        
        'signal_classifier': {
            'n_estimators': (50, 500, 'int'),
            'max_depth': (3, 12, 'int'),
            'learning_rate': (0.01, 0.3, 'float'),
            'min_samples_split': (2, 20, 'int'),
            'min_samples_leaf': (1, 10, 'int'),
            'subsample': (0.5, 1.0, 'float'),
            'colsample_bytree': (0.5, 1.0, 'float'),
            'reg_alpha': (1e-6, 1.0, 'log'),
            'reg_lambda': (1e-6, 1.0, 'log')
        },
        
        'regime_detector': {
            'n_states': (2, 5, 'int'),
            'covariance_type': ['spherical', 'diag', 'full'],
            'n_iterations': (50, 200, 'int'),
            'tolerance': (1e-4, 1e-1, 'log')
        }
    }
    
    def __init__(self, config: OptimizationConfig):
        """
        Initialize the optimizer.
        
        Args:
            config: Optimization configuration
        """
        self.config = config
        self.study: Optional[optuna.Study] = None
        self.best_params: Dict[str, Any] = {}
        self.optimization_history: List[OptimizationResult] = []
        
    def _get_sampler(self):
        """Get Optuna sampler based on config."""
        samplers = {
            'tpe': TPESampler(seed=42),
            'cmaes': CmaEsSampler(seed=42),
            'random': RandomSampler(seed=42)
        }
        return samplers.get(self.config.sampler, TPESampler(seed=42))
    
    def _get_pruner(self):
        """Get Optuna pruner based on config."""
        if not self.config.pruning:
            return None
        return MedianPruner(n_startup_trials=5, n_warmup_steps=10)
    
    def _suggest_params(
        self,
        trial: optuna.Trial,
        model_type: str,
        custom_space: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Suggest hyperparameters for trial.
        
        Args:
            trial: Optuna trial
            model_type: Type of model
            custom_space: Custom search space
            
        Returns:
            Dictionary of suggested parameters
        """
        search_space = custom_space or self.SEARCH_SPACES.get(model_type, {})
        params = {}
        
        for param_name, param_config in search_space.items():
            if isinstance(param_config, list):
                # Categorical
                params[param_name] = trial.suggest_categorical(param_name, param_config)
            elif isinstance(param_config, tuple):
                if param_config[2] == 'int':
                    params[param_name] = trial.suggest_int(param_name, param_config[0], param_config[1])
                elif param_config[2] == 'float':
                    params[param_name] = trial.suggest_float(param_name, param_config[0], param_config[1])
                elif param_config[2] == 'log':
                    params[param_name] = trial.suggest_float(
                        param_name, param_config[0], param_config[1], log=True
                    )
        
        return params
    
    def _convert_params(self, params: Dict[str, Any], model_type: str) -> Dict[str, Any]:
        """Convert trial params to model config format."""
        if model_type == 'price_predictor':
            return {
                'sequence_length': params.get('sequence_length', 60),
                'hidden_units': [
                    params.get('hidden_units_1', 128),
                    params.get('hidden_units_2', 64)
                ],
                'attention_units': params.get('attention_units', 32),
                'dropout': params.get('dropout', 0.2),
                'learning_rate': params.get('learning_rate', 0.001),
                'batch_size': params.get('batch_size', 32),
                'epochs': 50,  # Reduced for optimization
                'early_stopping_patience': 5
            }
        
        elif model_type == 'signal_classifier':
            return {
                'n_estimators': params.get('n_estimators', 200),
                'max_depth': params.get('max_depth', 6),
                'learning_rate': params.get('learning_rate', 0.1),
                'min_samples_split': params.get('min_samples_split', 5),
                'min_samples_leaf': params.get('min_samples_leaf', 2),
                'subsample': params.get('subsample', 0.8)
            }
        
        elif model_type == 'regime_detector':
            return {
                'n_states': params.get('n_states', 3),
                'covariance_type': params.get('covariance_type', 'full'),
                'n_iterations': params.get('n_iterations', 100),
                'tolerance': params.get('tolerance', 0.01)
            }
        
        return params
    
    def _objective_function(
        self,
        trial: optuna.Trial,
        model_type: str,
        data: np.ndarray,
        training_config: TrainingConfig = None
    ) -> float:
        """
        Objective function for optimization.
        
        Args:
            trial: Optuna trial
            model_type: Type of model
            data: Training data
            training_config: Training configuration
            
        Returns:
            Objective value to optimize
        """
        # Get suggested params
        params = self._suggest_params(trial, model_type)
        model_config = self._convert_params(params, model_type)
        
        # Train model
        trainer = ModelTrainer(training_config or TrainingConfig())
        
        try:
            if model_type == 'price_predictor':
                result = trainer.train_price_predictor(data, model_config)
                # Use accuracy from first horizon
                metrics = result.metrics.get('horizon_1', {}).get('metrics', {})
                objective_value = metrics.get('directional_accuracy', 0)
                
            elif model_type == 'signal_classifier':
                result = trainer.train_signal_classifier(data, model_config)
                metrics = result.metrics.get('validation_metrics', {})
                objective_value = metrics.get('f1_weighted', 0)
                
            elif model_type == 'regime_detector':
                result = trainer.train_regime_detector(data, model_config)
                metrics = result.metrics.get('metrics', {})
                # Use negative BIC (we want to maximize)
                objective_value = -metrics.get('bic', 0)
            
            else:
                objective_value = 0
            
            # Report intermediate value for pruning
            trial.report(objective_value, step=1)
            
            # Handle pruning
            if trial.should_prune():
                raise optuna.TrialPruned()
            
            return objective_value
            
        except Exception as e:
            logger.error(f"Trial failed: {e}")
            return 0.0
    
    def optimize(
        self,
        model_type: str,
        data: np.ndarray,
        training_config: TrainingConfig = None,
        custom_search_space: Dict[str, Any] = None
    ) -> OptimizationResult:
        """
        Run hyperparameter optimization.
        
        Args:
            model_type: Type of model to optimize
            data: Training data
            training_config: Training configuration
            custom_search_space: Custom search space
            
        Returns:
            OptimizationResult with best parameters
        """
        start_time = datetime.now()
        logger.info(f"Starting hyperparameter optimization for {model_type}")
        
        # Create study
        sampler = self._get_sampler()
        pruner = self._get_pruner()
        
        self.study = optuna.create_study(
            direction=self.config.direction,
            sampler=sampler,
            pruner=pruner,
            study_name=f"{model_type}_optimization"
        )
        
        # Run optimization
        self.study.optimize(
            lambda trial: self._objective_function(
                trial, model_type, data, training_config
            ),
            n_trials=self.config.n_trials,
            timeout=self.config.timeout,
            n_jobs=self.config.n_jobs,
            show_progress_bar=True
        )
        
        optimization_time = (datetime.now() - start_time).total_seconds()
        
        # Get best params
        best_params = self._convert_params(self.study.best_params, model_type)
        
        # Get parameter importance
        try:
            importance = optuna.importance.get_param_importances(self.study)
        except:
            importance = {}
        
        # Build trial history
        trial_history = [
            {
                'trial_number': t.number,
                'params': t.params,
                'value': t.value,
                'state': str(t.state)
            }
            for t in self.study.trials
        ]
        
        result = OptimizationResult(
            model_type=model_type,
            best_params=best_params,
            best_value=float(self.study.best_value),
            n_trials=len(self.study.trials),
            optimization_time=optimization_time,
            trial_history=trial_history,
            importance=importance,
            timestamp=datetime.now().isoformat()
        )
        
        self.optimization_history.append(result)
        self.best_params[model_type] = best_params
        
        logger.info(f"Optimization complete. Best value: {self.study.best_value:.4f}")
        logger.info(f"Best params: {best_params}")
        
        return result
    
    def optimize_all_models(
        self,
        data: np.ndarray,
        training_config: TrainingConfig = None,
        custom_spaces: Dict[str, Dict[str, Any]] = None
    ) -> Dict[str, OptimizationResult]:
        """
        Optimize all model types.
        
        Args:
            data: Training data
            training_config: Training configuration
            custom_spaces: Custom search spaces per model
            
        Returns:
            Dictionary of optimization results
        """
        results = {}
        
        for model_type in ['price_predictor', 'signal_classifier', 'regime_detector']:
            logger.info(f"\n{'='*50}")
            logger.info(f"Optimizing {model_type}")
            logger.info(f"{'='*50}\n")
            
            custom_space = custom_spaces.get(model_type) if custom_spaces else None
            results[model_type] = self.optimize(
                model_type, data, training_config, custom_space
            )
        
        return results
    
    def get_optimization_report(self) -> Dict[str, Any]:
        """Get comprehensive optimization report."""
        return {
            'optimization_history': [
                {
                    'model_type': r.model_type,
                    'best_params': r.best_params,
                    'best_value': r.best_value,
                    'n_trials': r.n_trials,
                    'optimization_time': r.optimization_time,
                    'importance': r.importance
                }
                for r in self.optimization_history
            ],
            'config': {
                'method': self.config.method,
                'n_trials': self.config.n_trials,
                'timeout': self.config.timeout,
                'sampler': self.config.sampler,
                'pruning': self.config.pruning
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def save_results(self, path: str = None):
        """Save optimization results to file."""
        save_path = Path(path or './saved_models/optimization_results.json')
        save_path.parent.mkdir(parents=True, exist_ok=True)
        
        report = self.get_optimization_report()
        
        with open(save_path, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        logger.info(f"Optimization results saved to {save_path}")
    
    def load_results(self, path: str):
        """Load optimization results from file."""
        with open(path, 'r') as f:
            data = json.load(f)
        
        for item in data.get('optimization_history', []):
            result = OptimizationResult(
                model_type=item['model_type'],
                best_params=item['best_params'],
                best_value=item['best_value'],
                n_trials=item['n_trials'],
                optimization_time=item['optimization_time'],
                trial_history=[],
                importance=item.get('importance', {}),
                timestamp=item.get('timestamp', '')
            )
            self.optimization_history.append(result)
            self.best_params[result.model_type] = result.best_params
        
        logger.info(f"Optimization results loaded from {path}")


class GridSearchOptimizer:
    """
    Simple Grid Search for hyperparameter optimization.
    Alternative to Optuna for smaller search spaces.
    """
    
    def __init__(self):
        self.results: List[Dict[str, Any]] = []
    
    def grid_search(
        self,
        model_type: str,
        data: np.ndarray,
        param_grid: Dict[str, List[Any]],
        training_config: TrainingConfig = None
    ) -> Dict[str, Any]:
        """
        Run grid search over parameter space.
        
        Args:
            model_type: Type of model
            data: Training data
            param_grid: Dictionary of parameter lists
            training_config: Training configuration
            
        Returns:
            Best parameters and results
        """
        import itertools
        
        # Generate all combinations
        keys = param_grid.keys()
        values = param_grid.values()
        combinations = [dict(zip(keys, v)) for v in itertools.product(*values)]
        
        logger.info(f"Running grid search with {len(combinations)} combinations")
        
        best_score = -np.inf
        best_params = None
        
        for i, params in enumerate(combinations):
            logger.info(f"Trial {i+1}/{len(combinations)}: {params}")
            
            trainer = ModelTrainer(training_config or TrainingConfig())
            
            try:
                if model_type == 'price_predictor':
                    result = trainer.train_price_predictor(data, params)
                    metrics = result.metrics.get('horizon_1', {}).get('metrics', {})
                    score = metrics.get('directional_accuracy', 0)
                elif model_type == 'signal_classifier':
                    result = trainer.train_signal_classifier(data, params)
                    metrics = result.metrics.get('validation_metrics', {})
                    score = metrics.get('f1_weighted', 0)
                else:
                    score = 0
                
                self.results.append({
                    'params': params,
                    'score': score
                })
                
                if score > best_score:
                    best_score = score
                    best_params = params
                    
            except Exception as e:
                logger.error(f"Trial failed: {e}")
        
        return {
            'best_params': best_params,
            'best_score': best_score,
            'n_trials': len(combinations),
            'all_results': self.results
        }


def run_hyperopt(
    data: np.ndarray,
    model_type: str = 'signal_classifier',
    n_trials: int = 50
) -> OptimizationResult:
    """
    Convenience function to run hyperparameter optimization.
    
    Args:
        data: Training data
        model_type: Type of model to optimize
        n_trials: Number of trials
        
    Returns:
        OptimizationResult
    """
    config = OptimizationConfig(n_trials=n_trials)
    optimizer = HyperparameterOptimizer(config)
    return optimizer.optimize(model_type, data)
