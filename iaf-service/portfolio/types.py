"""
Types for portfolio management module.
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime


class PositionStatus(Enum):
    """Status of a position."""
    OPEN = "open"
    CLOSED = "closed"
    LIQUIDATED = "liquidated"
    PENDING = "pending"


@dataclass
class PositionState:
    """
    State of an individual position.

    Tracks all relevant information about an open position.
    """
    id: str
    symbol: str
    side: str  # "long" or "short"
    size: float
    entry_price: float
    current_price: float
    entry_time: datetime
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    trailing_stop: Optional[float] = None
    status: PositionStatus = PositionStatus.OPEN
    metadata: Dict[str, Any] = field(default_factory=dict)

    # Price tracking
    highest_price: float = 0.0
    lowest_price: float = float('inf')

    def __post_init__(self):
        if self.highest_price == 0.0:
            self.highest_price = self.entry_price
        if self.lowest_price == float('inf'):
            self.lowest_price = self.entry_price

    @property
    def value(self) -> float:
        """Current position value."""
        return self.size * self.current_price

    @property
    def entry_value(self) -> float:
        """Initial position value at entry."""
        return self.size * self.entry_price

    @property
    def pnl(self) -> float:
        """Unrealized PnL."""
        if self.side == "long":
            return (self.current_price - self.entry_price) * self.size
        else:
            return (self.entry_price - self.current_price) * self.size

    @property
    def pnl_percentage(self) -> float:
        """Unrealized PnL percentage."""
        if self.entry_price == 0:
            return 0.0
        if self.side == "long":
            return ((self.current_price - self.entry_price) / self.entry_price) * 100
        else:
            return ((self.entry_price - self.current_price) / self.entry_price) * 100

    @property
    def holding_time(self) -> float:
        """Holding time in hours."""
        return (datetime.utcnow() - self.entry_time).total_seconds() / 3600

    def update_price(self, price: float, high: Optional[float] = None, low: Optional[float] = None) -> None:
        """Update position with new price."""
        self.current_price = price
        if high:
            self.highest_price = max(self.highest_price, high)
        if low:
            self.lowest_price = min(self.lowest_price, low)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "symbol": self.symbol,
            "side": self.side,
            "size": self.size,
            "entry_price": self.entry_price,
            "current_price": self.current_price,
            "entry_time": self.entry_time.isoformat(),
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "trailing_stop": self.trailing_stop,
            "status": self.status.value,
            "value": self.value,
            "pnl": self.pnl,
            "pnl_percentage": self.pnl_percentage,
            "holding_time_hours": self.holding_time,
            "highest_price": self.highest_price,
            "lowest_price": self.lowest_price,
            "metadata": self.metadata
        }


@dataclass
class PortfolioMetrics:
    """
    Portfolio performance metrics.

    Tracks overall portfolio performance.
    """
    total_value: float = 0.0
    cash: float = 0.0
    position_value: float = 0.0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    total_pnl: float = 0.0
    total_return_percentage: float = 0.0
    daily_pnl: float = 0.0
    weekly_pnl: float = 0.0
    monthly_pnl: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_percentage: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    sharpe_ratio: float = 0.0
    open_positions: int = 0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "total_value": self.total_value,
            "cash": self.cash,
            "position_value": self.position_value,
            "unrealized_pnl": self.unrealized_pnl,
            "realized_pnl": self.realized_pnl,
            "total_pnl": self.total_pnl,
            "total_return_percentage": self.total_return_percentage,
            "daily_pnl": self.daily_pnl,
            "weekly_pnl": self.weekly_pnl,
            "monthly_pnl": self.monthly_pnl,
            "max_drawdown": self.max_drawdown,
            "max_drawdown_percentage": self.max_drawdown_percentage,
            "win_rate": self.win_rate,
            "profit_factor": self.profit_factor,
            "sharpe_ratio": self.sharpe_ratio,
            "open_positions": self.open_positions,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades
        }


@dataclass
class PortfolioState:
    """
    Complete portfolio state.

    Contains all positions and aggregate metrics.
    """
    id: str
    name: str
    initial_capital: float
    cash: float
    positions: Dict[str, PositionState] = field(default_factory=dict)
    metrics: Optional[PortfolioMetrics] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def total_value(self) -> float:
        """Calculate total portfolio value."""
        position_value = sum(p.value for p in self.positions.values())
        return self.cash + position_value

    @property
    def total_pnl(self) -> float:
        """Calculate total PnL."""
        return self.total_value - self.initial_capital

    @property
    def total_return_percentage(self) -> float:
        """Calculate total return percentage."""
        if self.initial_capital == 0:
            return 0.0
        return (self.total_pnl / self.initial_capital) * 100

    def get_position(self, symbol: str) -> Optional[PositionState]:
        """Get position for a symbol."""
        return self.positions.get(symbol)

    def has_position(self, symbol: str) -> bool:
        """Check if there's an open position for a symbol."""
        return symbol in self.positions

    def get_open_positions(self) -> List[PositionState]:
        """Get all open positions."""
        return [p for p in self.positions.values() if p.status == PositionStatus.OPEN]

    def calculate_metrics(self) -> PortfolioMetrics:
        """Calculate and return portfolio metrics."""
        metrics = PortfolioMetrics()

        # Basic values
        metrics.total_value = self.total_value
        metrics.cash = self.cash
        metrics.position_value = sum(p.value for p in self.positions.values())
        metrics.unrealized_pnl = sum(p.pnl for p in self.positions.values())
        metrics.open_positions = len(self.get_open_positions())

        # Return calculations
        metrics.total_pnl = self.total_pnl
        metrics.total_return_percentage = self.total_return_percentage

        self.metrics = metrics
        return metrics

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "initial_capital": self.initial_capital,
            "cash": self.cash,
            "total_value": self.total_value,
            "total_pnl": self.total_pnl,
            "total_return_percentage": self.total_return_percentage,
            "positions": {k: v.to_dict() for k, v in self.positions.items()},
            "metrics": self.metrics.to_dict() if self.metrics else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "metadata": self.metadata
        }
