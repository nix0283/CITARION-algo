"""
Lumibot Strategies Package for CITARION
"""
from .base import (
    RSIStrategy,
    MACDStrategy,
    BollingerBandsStrategy,
    GridStrategy,
    STRATEGIES,
    get_strategy,
    list_strategies,
)

from .ai_strategies import (
    AITradingStrategy,
    SentimentStrategy,
    MultiAssetStrategy,
    ADVANCED_STRATEGIES,
)

# Combine all strategies
ALL_STRATEGIES = {**STRATEGIES, **ADVANCED_STRATEGIES}

__all__ = [
    # Basic strategies
    "RSIStrategy",
    "MACDStrategy", 
    "BollingerBandsStrategy",
    "GridStrategy",
    # AI strategies
    "AITradingStrategy",
    "SentimentStrategy",
    "MultiAssetStrategy",
    # Registry
    "STRATEGIES",
    "ADVANCED_STRATEGIES",
    "ALL_STRATEGIES",
    "get_strategy",
    "list_strategies",
]
