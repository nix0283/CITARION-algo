"""
Lumibot Trading Service Configuration
"""
import os
from typing import Optional
from pydantic import BaseModel
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables"""
    
    # Service settings
    SERVICE_NAME: str = "CITARION Lumibot Trading Service"
    SERVICE_VERSION: str = "1.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 3004  # Updated from 8001 to match project requirements
    DEBUG: bool = False
    
    # Redis settings
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Exchange API keys (optional, for live trading)
    BINANCE_API_KEY: Optional[str] = None
    BINANCE_API_SECRET: Optional[str] = None
    BYBIT_API_KEY: Optional[str] = None
    BYBIT_API_SECRET: Optional[str] = None
    OKX_API_KEY: Optional[str] = None
    OKX_API_SECRET: Optional[str] = None
    OKX_PASSPHRASE: Optional[str] = None
    
    # Alpaca settings
    ALPACA_API_KEY: Optional[str] = None
    ALPACA_API_SECRET: Optional[str] = None
    ALPACA_PAPER: bool = True
    
    # Interactive Brokers settings
    IB_HOST: str = "127.0.0.1"
    IB_PORT: int = 7497
    IB_CLIENT_ID: int = 1
    
    # Trading settings
    DEFAULT_INITIAL_CASH: float = 100000.0
    MAX_ACTIVE_STRATEGIES: int = 10
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()


class StrategyParameter(BaseModel):
    """Strategy parameter definition"""
    type: str
    default: float | int | str | bool
    min: Optional[float] = None
    max: Optional[float] = None
    options: Optional[list] = None
    description: Optional[str] = None


class StrategyDefinition(BaseModel):
    """Strategy definition with parameters"""
    id: str
    name: str
    description: str
    category: str
    timeframe: str
    parameters: dict[str, StrategyParameter]


# Predefined strategies
STRATEGIES: dict[str, StrategyDefinition] = {
    "rsi_reversal": StrategyDefinition(
        id="rsi_reversal",
        name="RSI Reversal",
        description="Mean-reversion strategy based on RSI oversold/overbought levels",
        category="mean-reversion",
        timeframe="1h",
        parameters={
            "rsi_period": StrategyParameter(type="number", default=14, min=5, max=50),
            "oversold": StrategyParameter(type="number", default=30, min=10, max=40),
            "overbought": StrategyParameter(type="number", default=70, min=60, max=90),
            "position_size": StrategyParameter(type="number", default=0.1, min=0.01, max=1),
        }
    ),
    "macd_trend": StrategyDefinition(
        id="macd_trend",
        name="MACD Trend Following",
        description="Trend following strategy based on MACD crossovers",
        category="trend-following",
        timeframe="4h",
        parameters={
            "fast_period": StrategyParameter(type="number", default=12, min=5, max=30),
            "slow_period": StrategyParameter(type="number", default=26, min=15, max=50),
            "signal_period": StrategyParameter(type="number", default=9, min=5, max=20),
            "position_size": StrategyParameter(type="number", default=0.15, min=0.01, max=1),
        }
    ),
    "bollinger_reversion": StrategyDefinition(
        id="bollinger_reversion",
        name="Bollinger Bands Reversion",
        description="Mean-reversion strategy using Bollinger Bands",
        category="mean-reversion",
        timeframe="1h",
        parameters={
            "period": StrategyParameter(type="number", default=20, min=10, max=50),
            "std_dev": StrategyParameter(type="number", default=2.0, min=1, max=3),
            "position_size": StrategyParameter(type="number", default=0.1, min=0.01, max=1),
        }
    ),
    "grid_trading": StrategyDefinition(
        id="grid_trading",
        name="Grid Trading",
        description="Grid trading strategy for sideways markets",
        category="grid",
        timeframe="1h",
        parameters={
            "grid_levels": StrategyParameter(type="number", default=10, min=5, max=20),
            "grid_spacing": StrategyParameter(type="number", default=0.02, min=0.005, max=0.1),
            "position_size": StrategyParameter(type="number", default=0.05, min=0.01, max=0.5),
        }
    ),
    "ema_cross": StrategyDefinition(
        id="ema_cross",
        name="EMA Crossover",
        description="Trend following strategy based on EMA crossovers",
        category="trend-following",
        timeframe="1h",
        parameters={
            "fast_period": StrategyParameter(type="number", default=9, min=5, max=20),
            "slow_period": StrategyParameter(type="number", default=21, min=15, max=50),
            "position_size": StrategyParameter(type="number", default=0.1, min=0.01, max=1),
        }
    ),
    "triple_rsi": StrategyDefinition(
        id="triple_rsi",
        name="Triple RSI Strategy",
        description="Multi-timeframe RSI strategy with confirmation",
        category="mean-reversion",
        timeframe="1h",
        parameters={
            "rsi_period": StrategyParameter(type="number", default=14, min=5, max=50),
            "oversold": StrategyParameter(type="number", default=25, min=10, max=35),
            "overbought": StrategyParameter(type="number", default=75, min=65, max=90),
            "position_size": StrategyParameter(type="number", default=0.1, min=0.01, max=1),
        }
    ),
    "supertrend": StrategyDefinition(
        id="supertrend",
        name="Supertrend Strategy",
        description="Trend following strategy using Supertrend indicator",
        category="trend-following",
        timeframe="1h",
        parameters={
            "period": StrategyParameter(type="number", default=10, min=5, max=20),
            "multiplier": StrategyParameter(type="number", default=3.0, min=1, max=5),
            "position_size": StrategyParameter(type="number", default=0.1, min=0.01, max=1),
        }
    ),
    "momentum_breakout": StrategyDefinition(
        id="momentum_breakout",
        name="Momentum Breakout",
        description="Breakout strategy based on momentum and volume",
        category="breakout",
        timeframe="4h",
        parameters={
            "lookback": StrategyParameter(type="number", default=20, min=10, max=50),
            "volume_factor": StrategyParameter(type="number", default=1.5, min=1, max=3),
            "position_size": StrategyParameter(type="number", default=0.1, min=0.01, max=1),
        }
    ),
}


# Supported brokers
BROKERS = {
    "ccxt": {
        "name": "CCXT (Crypto)",
        "exchanges": ["binance", "bybit", "okx", "bitget", "kucoin", "coinbase"],
        "supports_paper": True,
    },
    "alpaca": {
        "name": "Alpaca (Stocks)",
        "exchanges": [],
        "supports_paper": True,
    },
    "ib": {
        "name": "Interactive Brokers",
        "exchanges": [],
        "supports_paper": True,
    },
    "paper": {
        "name": "Paper Trading Only",
        "exchanges": [],
        "supports_paper": True,
    },
}


# Supported timeframes
TIMEFRAMES = [
    {"id": "1m", "name": "1 Minute", "seconds": 60},
    {"id": "5m", "name": "5 Minutes", "seconds": 300},
    {"id": "15m", "name": "15 Minutes", "seconds": 900},
    {"id": "1h", "name": "1 Hour", "seconds": 3600},
    {"id": "4h", "name": "4 Hours", "seconds": 14400},
    {"id": "1d", "name": "1 Day", "seconds": 86400},
]
