"""
Types for backtesting module.
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime


class TradeType(Enum):
    """Types of trades."""
    ENTRY = "entry"
    EXIT = "exit"
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    LIQUIDATION = "liquidation"


class PositionSide(Enum):
    """Position sides."""
    LONG = "long"
    SHORT = "short"


@dataclass
class BacktestPosition:
    """
    Position during backtest.

    Represents an open position in the backtest.
    """
    id: str
    symbol: str
    side: PositionSide
    entry_price: float
    size: float
    entry_time: datetime
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    trailing_stop: Optional[float] = None
    highest_price: float = 0.0
    lowest_price: float = float('inf')

    def __post_init__(self):
        self.highest_price = self.entry_price
        self.lowest_price = self.entry_price

    def update_price_tracking(self, high: float, low: float) -> None:
        """Update highest and lowest prices for trailing stop."""
        self.highest_price = max(self.highest_price, high)
        self.lowest_price = min(self.lowest_price, low)

    def calculate_pnl(self, current_price: float) -> float:
        """Calculate unrealized PnL."""
        if self.side == PositionSide.LONG:
            return (current_price - self.entry_price) * self.size
        else:
            return (self.entry_price - current_price) * self.size

    def calculate_pnl_percentage(self, current_price: float) -> float:
        """Calculate unrealized PnL percentage."""
        if self.side == PositionSide.LONG:
            return ((current_price - self.entry_price) / self.entry_price) * 100
        else:
            return ((self.entry_price - current_price) / self.entry_price) * 100

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "symbol": self.symbol,
            "side": self.side.value,
            "entry_price": self.entry_price,
            "size": self.size,
            "entry_time": self.entry_time.isoformat(),
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "trailing_stop": self.trailing_stop,
            "highest_price": self.highest_price,
            "lowest_price": self.lowest_price
        }


@dataclass
class BacktestTrade:
    """
    Completed trade record.

    Represents a closed position with profit/loss.
    """
    id: str
    position_id: str
    symbol: str
    side: PositionSide
    entry_price: float
    exit_price: float
    size: float
    entry_time: datetime
    exit_time: datetime
    pnl: float
    pnl_percentage: float
    trade_type: TradeType
    commission: float = 0.0
    holding_time_seconds: int = 0

    def __post_init__(self):
        self.holding_time_seconds = int(
            (self.exit_time - self.entry_time).total_seconds()
        )

    def is_winner(self) -> bool:
        """Check if trade was profitable."""
        return self.pnl > 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "position_id": self.position_id,
            "symbol": self.symbol,
            "side": self.side.value,
            "entry_price": self.entry_price,
            "exit_price": self.exit_price,
            "size": self.size,
            "entry_time": self.entry_time.isoformat(),
            "exit_time": self.exit_time.isoformat(),
            "pnl": self.pnl,
            "pnl_percentage": self.pnl_percentage,
            "trade_type": self.trade_type.value,
            "commission": self.commission,
            "holding_time_seconds": self.holding_time_seconds
        }


@dataclass
class EquityPoint:
    """
    Point in the equity curve.

    Tracks portfolio value at a specific point in time.
    """
    timestamp: datetime
    equity: float
    cash: float
    position_value: float
    drawdown: float = 0.0
    drawdown_percentage: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "equity": self.equity,
            "cash": self.cash,
            "position_value": self.position_value,
            "drawdown": self.drawdown,
            "drawdown_percentage": self.drawdown_percentage
        }


@dataclass
class BacktestMetrics:
    """
    Performance metrics for a backtest.

    Comprehensive metrics for evaluating strategy performance.
    """
    total_return: float = 0.0
    total_return_percentage: float = 0.0
    annualized_return: float = 0.0

    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0

    avg_win: float = 0.0
    avg_loss: float = 0.0
    avg_trade: float = 0.0

    largest_win: float = 0.0
    largest_loss: float = 0.0
    max_consecutive_wins: int = 0
    max_consecutive_losses: int = 0

    profit_factor: float = 0.0
    risk_reward_ratio: float = 0.0
    expectancy: float = 0.0

    max_drawdown: float = 0.0
    max_drawdown_percentage: float = 0.0
    avg_drawdown: float = 0.0
    max_drawdown_duration_days: int = 0

    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    calmar_ratio: float = 0.0

    volatility: float = 0.0
    variance: float = 0.0
    std_dev: float = 0.0

    avg_holding_time_hours: float = 0.0
    trading_days: int = 0
    trades_per_day: float = 0.0

    def calculate_win_rate(self) -> float:
        """Calculate win rate."""
        if self.total_trades == 0:
            return 0.0
        return (self.winning_trades / self.total_trades) * 100

    def calculate_profit_factor(self, gross_profit: float, gross_loss: float) -> float:
        """Calculate profit factor."""
        if gross_loss == 0:
            return float('inf') if gross_profit > 0 else 0.0
        return abs(gross_profit / gross_loss)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "total_return": self.total_return,
            "total_return_percentage": self.total_return_percentage,
            "annualized_return": self.annualized_return,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "win_rate": self.win_rate,
            "avg_win": self.avg_win,
            "avg_loss": self.avg_loss,
            "avg_trade": self.avg_trade,
            "largest_win": self.largest_win,
            "largest_loss": self.largest_loss,
            "max_consecutive_wins": self.max_consecutive_wins,
            "max_consecutive_losses": self.max_consecutive_losses,
            "profit_factor": self.profit_factor,
            "risk_reward_ratio": self.risk_reward_ratio,
            "expectancy": self.expectancy,
            "max_drawdown": self.max_drawdown,
            "max_drawdown_percentage": self.max_drawdown_percentage,
            "avg_drawdown": self.avg_drawdown,
            "max_drawdown_duration_days": self.max_drawdown_duration_days,
            "sharpe_ratio": self.sharpe_ratio,
            "sortino_ratio": self.sortino_ratio,
            "calmar_ratio": self.calmar_ratio,
            "volatility": self.volatility,
            "variance": self.variance,
            "std_dev": self.std_dev,
            "avg_holding_time_hours": self.avg_holding_time_hours,
            "trading_days": self.trading_days,
            "trades_per_day": self.trades_per_day
        }


@dataclass
class BacktestConfig:
    """
    Configuration for a backtest.

    Contains all parameters for running a backtest.
    """
    start_date: datetime
    end_date: datetime
    initial_capital: float = 10000.0
    commission: float = 0.001  # 0.1%
    slippage: float = 0.0005  # 0.05%
    position_size_method: str = "percentage"  # percentage, kelly, fixed
    max_positions: int = 5
    leverage: float = 1.0
    margin_requirement: float = 0.5

    # Risk management
    default_stop_loss: Optional[float] = None  # Percentage
    default_take_profit: Optional[float] = None  # Percentage
    trailing_stop: bool = False
    trailing_stop_percent: float = 2.0

    # Simulation settings
    enable_shorting: bool = False
    enable_partial_fills: bool = False
    use_adjusted_close: bool = True

    def validate(self) -> List[str]:
        """Validate configuration and return any errors."""
        errors = []

        if self.start_date >= self.end_date:
            errors.append("start_date must be before end_date")

        if self.initial_capital <= 0:
            errors.append("initial_capital must be positive")

        if self.commission < 0:
            errors.append("commission cannot be negative")

        if self.max_positions < 1:
            errors.append("max_positions must be at least 1")

        return errors

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "initial_capital": self.initial_capital,
            "commission": self.commission,
            "slippage": self.slippage,
            "position_size_method": self.position_size_method,
            "max_positions": self.max_positions,
            "leverage": self.leverage,
            "margin_requirement": self.margin_requirement,
            "default_stop_loss": self.default_stop_loss,
            "default_take_profit": self.default_take_profit,
            "trailing_stop": self.trailing_stop,
            "trailing_stop_percent": self.trailing_stop_percent,
            "enable_shorting": self.enable_shorting
        }
