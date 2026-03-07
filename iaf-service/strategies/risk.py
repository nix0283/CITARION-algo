"""
Risk management types for IAF strategies.

Provides declarative risk management rules including position sizing,
take profit, and stop loss configurations.
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime


class RiskLevel(Enum):
    """Risk levels for position sizing."""
    CONSERVATIVE = "conservative"  # 1-2% per trade
    MODERATE = "moderate"          # 2-5% per trade
    AGGRESSIVE = "aggressive"      # 5-10% per trade


class StopLossType(Enum):
    """Types of stop loss."""
    FIXED = "fixed"               # Fixed percentage from entry
    TRAILING = "trailing"         # Trailing stop loss
    ATR_BASED = "atr_based"       # Based on ATR indicator
    SUPPORT_BASED = "support"     # Based on support levels
    TIME_BASED = "time"           # Exit after time period


class TakeProfitType(Enum):
    """Types of take profit."""
    FIXED = "fixed"               # Fixed percentage from entry
    TRAILING = "trailing"         # Trailing take profit
    MULTI_LEVEL = "multi_level"   # Multiple take profit levels
    RESISTANCE_BASED = "resistance"  # Based on resistance levels
    RISK_REWARD = "risk_reward"   # Based on risk/reward ratio


@dataclass
class PositionSize:
    """
    Position size configuration.

    Defines how much of the portfolio should be allocated to a position.

    Attributes:
        symbol: Trading symbol
        percentage_of_portfolio: Percentage of total portfolio to risk
        fixed_amount: Fixed amount in quote currency (alternative to percentage)
        max_amount: Maximum amount to invest
        min_amount: Minimum amount to invest
        risk_per_trade: Maximum risk per trade as percentage
    """
    symbol: str
    percentage_of_portfolio: float = 10.0
    fixed_amount: Optional[float] = None
    max_amount: Optional[float] = None
    min_amount: Optional[float] = None
    risk_per_trade: Optional[float] = None

    def calculate_size(
        self,
        portfolio_value: float,
        current_price: float,
        stop_loss_price: Optional[float] = None
    ) -> float:
        """
        Calculate position size based on configuration.

        Args:
            portfolio_value: Total portfolio value
            current_price: Current asset price
            stop_loss_price: Stop loss price (for risk-based sizing)

        Returns:
            Position size in base currency
        """
        # Use fixed amount if specified
        if self.fixed_amount is not None:
            size = self.fixed_amount / current_price
        else:
            # Calculate based on percentage of portfolio
            allocated_value = portfolio_value * (self.percentage_of_portfolio / 100)
            size = allocated_value / current_price

        # Apply risk-based sizing if stop loss is provided
        if stop_loss_price is not None and self.risk_per_trade is not None:
            risk_amount = portfolio_value * (self.risk_per_trade / 100)
            price_risk = abs(current_price - stop_loss_price)
            if price_risk > 0:
                risk_based_size = risk_amount / price_risk
                size = min(size, risk_based_size)

        # Apply min/max constraints
        if self.min_amount is not None:
            min_size = self.min_amount / current_price
            size = max(size, min_size)

        if self.max_amount is not None:
            max_size = self.max_amount / current_price
            size = min(size, max_size)

        return size

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "symbol": self.symbol,
            "percentage_of_portfolio": self.percentage_of_portfolio,
            "fixed_amount": self.fixed_amount,
            "max_amount": self.max_amount,
            "min_amount": self.min_amount,
            "risk_per_trade": self.risk_per_trade
        }


@dataclass
class TakeProfitRule:
    """
    Take profit configuration.

    Defines how and when to take profits on a position.

    Attributes:
        symbol: Trading symbol
        percentage_threshold: Percentage profit target
        tp_type: Type of take profit (fixed, trailing, etc.)
        trailing: Whether to use trailing take profit
        trailing_offset: Trailing offset percentage
        sell_percentage: Percentage of position to sell at TP
        move_sl_to_be: Move stop loss to breakeven after TP
        multiple_levels: Multiple take profit levels
    """
    symbol: str
    percentage_threshold: float = 10.0
    tp_type: TakeProfitType = TakeProfitType.FIXED
    trailing: bool = False
    trailing_offset: float = 2.0  # Trailing offset in percentage
    sell_percentage: float = 100.0
    move_sl_to_be: bool = False
    multiple_levels: Optional[List[Dict[str, float]]] = None

    def calculate_target_price(self, entry_price: float, side: str = "long") -> float:
        """
        Calculate the take profit target price.

        Args:
            entry_price: Position entry price
            side: Position side ("long" or "short")

        Returns:
            Target price for take profit
        """
        if side.lower() == "long":
            return entry_price * (1 + self.percentage_threshold / 100)
        else:
            return entry_price * (1 - self.percentage_threshold / 100)

    def update_trailing(
        self,
        current_price: float,
        highest_price: float,
        side: str = "long"
    ) -> Optional[float]:
        """
        Update trailing take profit level.

        Args:
            current_price: Current market price
            highest_price: Highest price since entry
            side: Position side

        Returns:
            New trailing take profit price or None if not triggered
        """
        if not self.trailing:
            return None

        if side.lower() == "long":
            trailing_price = highest_price * (1 - self.trailing_offset / 100)
            return trailing_price
        else:
            trailing_price = highest_price * (1 + self.trailing_offset / 100)
            return trailing_price

    def get_level_targets(self, entry_price: float) -> List[Dict[str, float]]:
        """
        Get multiple take profit levels if configured.

        Returns:
            List of {target_price, sell_percentage} dictionaries
        """
        if self.multiple_levels:
            levels = []
            for level in self.multiple_levels:
                target_pct = level.get("percentage", 5.0)
                sell_pct = level.get("sell_percentage", 50.0)
                target_price = entry_price * (1 + target_pct / 100)
                levels.append({
                    "target_price": target_price,
                    "sell_percentage": sell_pct
                })
            return levels
        else:
            return [{
                "target_price": self.calculate_target_price(entry_price),
                "sell_percentage": self.sell_percentage
            }]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "symbol": self.symbol,
            "percentage_threshold": self.percentage_threshold,
            "tp_type": self.tp_type.value,
            "trailing": self.trailing,
            "trailing_offset": self.trailing_offset,
            "sell_percentage": self.sell_percentage,
            "move_sl_to_be": self.move_sl_to_be,
            "multiple_levels": self.multiple_levels
        }


@dataclass
class StopLossRule:
    """
    Stop loss configuration.

    Defines how and when to cut losses on a position.

    Attributes:
        symbol: Trading symbol
        percentage_threshold: Percentage loss threshold
        sl_type: Type of stop loss (fixed, trailing, etc.)
        trailing: Whether to use trailing stop loss
        trailing_offset: Trailing offset percentage
        trailing_activation: Activate trailing after this profit percentage
        atr_multiplier: ATR multiplier for ATR-based stop loss
        sell_percentage: Percentage of position to sell at SL
        time_limit_minutes: Exit after this many minutes regardless of price
    """
    symbol: str
    percentage_threshold: float = 5.0
    sl_type: StopLossType = StopLossType.FIXED
    trailing: bool = False
    trailing_offset: float = 2.0
    trailing_activation: float = 0.0  # Activate trailing after X% profit
    atr_multiplier: Optional[float] = 2.0
    sell_percentage: float = 100.0
    time_limit_minutes: Optional[int] = None

    def calculate_stop_price(
        self,
        entry_price: float,
        side: str = "long",
        atr: Optional[float] = None
    ) -> float:
        """
        Calculate the stop loss price.

        Args:
            entry_price: Position entry price
            side: Position side ("long" or "short")
            atr: Current ATR value (for ATR-based stop loss)

        Returns:
            Stop loss price
        """
        if self.sl_type == StopLossType.ATR_BASED and atr is not None:
            offset = atr * (self.atr_multiplier or 2.0)
            if side.lower() == "long":
                return entry_price - offset
            else:
                return entry_price + offset
        else:
            # Fixed percentage
            if side.lower() == "long":
                return entry_price * (1 - self.percentage_threshold / 100)
            else:
                return entry_price * (1 + self.percentage_threshold / 100)

    def update_trailing(
        self,
        current_price: float,
        highest_price: float,
        entry_price: float,
        side: str = "long"
    ) -> Optional[float]:
        """
        Update trailing stop loss level.

        Args:
            current_price: Current market price
            highest_price: Highest price since entry (for longs)
            entry_price: Entry price
            side: Position side

        Returns:
            New trailing stop price or None if trailing not active
        """
        if not self.trailing:
            return None

        # Check if trailing is activated
        if self.trailing_activation > 0:
            if side.lower() == "long":
                profit_pct = ((highest_price - entry_price) / entry_price) * 100
            else:
                profit_pct = ((entry_price - highest_price) / entry_price) * 100

            if profit_pct < self.trailing_activation:
                return None

        if side.lower() == "long":
            trailing_price = highest_price * (1 - self.trailing_offset / 100)
            return trailing_price
        else:
            trailing_price = highest_price * (1 + self.trailing_offset / 100)
            return trailing_price

    def check_time_limit(self, entry_time: datetime) -> bool:
        """
        Check if time limit has been exceeded.

        Args:
            entry_time: When the position was opened

        Returns:
            True if position should be closed due to time limit
        """
        if self.time_limit_minutes is None:
            return False

        elapsed = (datetime.utcnow() - entry_time).total_seconds() / 60
        return elapsed >= self.time_limit_minutes

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "symbol": self.symbol,
            "percentage_threshold": self.percentage_threshold,
            "sl_type": self.sl_type.value,
            "trailing": self.trailing,
            "trailing_offset": self.trailing_offset,
            "trailing_activation": self.trailing_activation,
            "atr_multiplier": self.atr_multiplier,
            "sell_percentage": self.sell_percentage,
            "time_limit_minutes": self.time_limit_minutes
        }


@dataclass
class RiskConfig:
    """
    Complete risk configuration for a strategy.

    Combines all risk management rules into a single configuration.
    """
    position_sizes: List[PositionSize] = field(default_factory=list)
    take_profits: List[TakeProfitRule] = field(default_factory=list)
    stop_losses: List[StopLossRule] = field(default_factory=list)
    max_open_positions: int = 5
    max_portfolio_risk: float = 20.0  # Max % of portfolio at risk
    max_correlated_positions: int = 2
    daily_loss_limit: Optional[float] = None  # Stop trading after X% daily loss

    def get_position_size(self, symbol: str) -> Optional[PositionSize]:
        """Get position size configuration for a symbol."""
        for ps in self.position_sizes:
            if ps.symbol == symbol:
                return ps
        return None

    def get_take_profit_rule(self, symbol: str) -> Optional[TakeProfitRule]:
        """Get take profit rule for a symbol."""
        for tp in self.take_profits:
            if tp.symbol == symbol:
                return tp
        return None

    def get_stop_loss_rule(self, symbol: str) -> Optional[StopLossRule]:
        """Get stop loss rule for a symbol."""
        for sl in self.stop_losses:
            if sl.symbol == symbol:
                return sl
        return None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "position_sizes": [ps.to_dict() for ps in self.position_sizes],
            "take_profits": [tp.to_dict() for tp in self.take_profits],
            "stop_losses": [sl.to_dict() for sl in self.stop_losses],
            "max_open_positions": self.max_open_positions,
            "max_portfolio_risk": self.max_portfolio_risk,
            "max_correlated_positions": self.max_correlated_positions,
            "daily_loss_limit": self.daily_loss_limit
        }


# Predefined risk configurations
CONSERVATIVE_RISK = RiskConfig(
    position_sizes=[
        PositionSize(symbol="*", percentage_of_portfolio=5.0, risk_per_trade=1.0)
    ],
    take_profits=[
        TakeProfitRule(symbol="*", percentage_threshold=5.0, trailing=True, trailing_offset=1.5)
    ],
    stop_losses=[
        StopLossRule(symbol="*", percentage_threshold=2.0, trailing=False)
    ],
    max_open_positions=3,
    max_portfolio_risk=10.0
)

MODERATE_RISK = RiskConfig(
    position_sizes=[
        PositionSize(symbol="*", percentage_of_portfolio=10.0, risk_per_trade=2.0)
    ],
    take_profits=[
        TakeProfitRule(symbol="*", percentage_threshold=10.0, trailing=True, trailing_offset=2.0)
    ],
    stop_losses=[
        StopLossRule(symbol="*", percentage_threshold=5.0, trailing=True, trailing_offset=2.0, trailing_activation=3.0)
    ],
    max_open_positions=5,
    max_portfolio_risk=20.0
)

AGGRESSIVE_RISK = RiskConfig(
    position_sizes=[
        PositionSize(symbol="*", percentage_of_portfolio=15.0, risk_per_trade=5.0)
    ],
    take_profits=[
        TakeProfitRule(symbol="*", percentage_threshold=20.0, trailing=True, trailing_offset=3.0)
    ],
    stop_losses=[
        StopLossRule(symbol="*", percentage_threshold=8.0, trailing=True, trailing_offset=3.0, trailing_activation=5.0)
    ],
    max_open_positions=10,
    max_portfolio_risk=40.0
)
