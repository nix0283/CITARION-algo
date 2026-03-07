"""
Portfolio manager for IAF.

Provides portfolio management functionality including position
tracking, risk management, and performance analysis.
"""

from typing import Optional, Dict, List, Any
from datetime import datetime
import uuid
import logging

from .types import (
    PortfolioState,
    PositionState,
    PortfolioMetrics,
    PositionStatus,
)
from ..strategies.types import Signal, SignalType
from ..strategies.risk import RiskConfig, PositionSize, TakeProfitRule, StopLossRule


logger = logging.getLogger(__name__)


class PortfolioManager:
    """
    Manager for trading portfolios.

    Handles position management, risk rules application, and
    portfolio state tracking.
    """

    def __init__(
        self,
        initial_capital: float = 10000.0,
        risk_config: Optional[RiskConfig] = None,
        portfolio_id: Optional[str] = None,
        name: str = "Default Portfolio"
    ):
        """
        Initialize the portfolio manager.

        Args:
            initial_capital: Starting capital
            risk_config: Risk management configuration
            portfolio_id: Unique portfolio identifier
            name: Portfolio name
        """
        self.portfolio_id = portfolio_id or str(uuid.uuid4())
        self.initial_capital = initial_capital
        self.risk_config = risk_config or RiskConfig()

        self.state = PortfolioState(
            id=self.portfolio_id,
            name=name,
            initial_capital=initial_capital,
            cash=initial_capital
        )

        # Trade history
        self.closed_trades: List[Dict[str, Any]] = []

        # Price history for analysis
        self.equity_history: List[Dict[str, Any]] = []
        self.peak_equity = initial_capital

    @property
    def cash(self) -> float:
        """Current cash balance."""
        return self.state.cash

    @property
    def total_value(self) -> float:
        """Total portfolio value."""
        return self.state.total_value

    @property
    def positions(self) -> Dict[str, PositionState]:
        """Open positions."""
        return self.state.positions

    def can_open_position(self, symbol: str, required_value: float) -> bool:
        """
        Check if a new position can be opened.

        Args:
            symbol: Trading symbol
            required_value: Required position value

        Returns:
            True if position can be opened
        """
        # Check cash availability
        if required_value > self.state.cash:
            return False

        # Check max positions
        if len(self.state.positions) >= self.risk_config.max_open_positions:
            return False

        # Check if already have position in this symbol
        if self.state.has_position(symbol):
            return False

        return True

    def calculate_position_size(
        self,
        symbol: str,
        current_price: float,
        stop_loss_price: Optional[float] = None
    ) -> float:
        """
        Calculate position size for a symbol.

        Args:
            symbol: Trading symbol
            current_price: Current market price
            stop_loss_price: Stop loss price for risk-based sizing

        Returns:
            Position size in base currency
        """
        position_size_config = self.risk_config.get_position_size(symbol)

        if not position_size_config:
            # Use default sizing (10% of portfolio)
            allocated_value = self.total_value * 0.1
            return allocated_value / current_price

        return position_size_config.calculate_size(
            portfolio_value=self.total_value,
            current_price=current_price,
            stop_loss_price=stop_loss_price
        )

    def open_position(
        self,
        symbol: str,
        side: str,
        size: float,
        price: float,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[PositionState]:
        """
        Open a new position.

        Args:
            symbol: Trading symbol
            side: Position side ("long" or "short")
            size: Position size
            price: Entry price
            stop_loss: Stop loss price
            take_profit: Take profit price
            metadata: Additional metadata

        Returns:
            PositionState if successful, None otherwise
        """
        position_value = size * price

        if not self.can_open_position(symbol, position_value):
            logger.warning(f"Cannot open position for {symbol}")
            return None

        # Apply risk rules if not provided
        if stop_loss is None:
            sl_rule = self.risk_config.get_stop_loss_rule(symbol)
            if sl_rule:
                stop_loss = sl_rule.calculate_stop_price(price, side)

        if take_profit is None:
            tp_rule = self.risk_config.get_take_profit_rule(symbol)
            if tp_rule:
                take_profit = tp_rule.calculate_target_price(price, side)

        # Deduct from cash
        self.state.cash -= position_value

        # Create position
        position_id = str(uuid.uuid4())
        position = PositionState(
            id=position_id,
            symbol=symbol,
            side=side,
            size=size,
            entry_price=price,
            current_price=price,
            entry_time=datetime.utcnow(),
            stop_loss=stop_loss,
            take_profit=take_profit,
            metadata=metadata or {}
        )

        self.state.positions[symbol] = position
        self.state.updated_at = datetime.utcnow()

        logger.info(f"Opened {side} position for {symbol}: {size} @ {price}")
        return position

    def close_position(
        self,
        symbol: str,
        price: float,
        reason: str = "manual",
        partial_size: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Close a position.

        Args:
            symbol: Trading symbol
            price: Exit price
            reason: Reason for closing
            partial_size: Size to close (None for full close)

        Returns:
            Trade record if successful, None otherwise
        """
        position = self.state.positions.get(symbol)
        if not position:
            return None

        # Calculate close size
        close_size = partial_size if partial_size else position.size
        close_value = close_size * price

        # Calculate PnL
        if position.side == "long":
            pnl = (price - position.entry_price) * close_size
        else:
            pnl = (position.entry_price - price) * close_size

        pnl_percentage = (pnl / (position.entry_price * close_size)) * 100

        # Add to cash
        self.state.cash += close_value

        # Create trade record
        trade = {
            "id": str(uuid.uuid4()),
            "position_id": position.id,
            "symbol": symbol,
            "side": position.side,
            "entry_price": position.entry_price,
            "exit_price": price,
            "size": close_size,
            "entry_time": position.entry_time,
            "exit_time": datetime.utcnow(),
            "pnl": pnl,
            "pnl_percentage": pnl_percentage,
            "reason": reason,
            "holding_time_hours": position.holding_time
        }

        self.closed_trades.append(trade)

        # Update or remove position
        if partial_size and close_size < position.size:
            position.size -= close_size
            position.updated_at = datetime.utcnow()
        else:
            position.status = PositionStatus.CLOSED
            del self.state.positions[symbol]

        self.state.updated_at = datetime.utcnow()
        logger.info(f"Closed {position.side} position for {symbol}: {close_size} @ {price}, PnL: {pnl:.2f}")

        return trade

    def update_prices(self, prices: Dict[str, float]) -> None:
        """
        Update position prices with latest market data.

        Args:
            prices: Dictionary of symbol -> current price
        """
        for symbol, price in prices.items():
            if symbol in self.state.positions:
                position = self.state.positions[symbol]
                position.update_price(price)

                # Update trailing stops
                self._update_trailing_stops(position)

        # Record equity
        self._record_equity()

    def _update_trailing_stops(self, position: PositionState) -> None:
        """Update trailing stop for a position."""
        if position.trailing_stop is None:
            return

        if position.side == "long":
            # For longs, trail the stop up
            sl_rule = self.risk_config.get_stop_loss_rule(position.symbol)
            if sl_rule and sl_rule.trailing:
                new_trailing = position.highest_price * (1 - sl_rule.trailing_offset / 100)
                if new_trailing > position.trailing_stop:
                    position.trailing_stop = new_trailing
                    logger.debug(f"Updated trailing stop for {position.symbol}: {new_trailing}")

    def check_exit_conditions(self, prices: Dict[str, Dict[str, float]]) -> List[Dict[str, Any]]:
        """
        Check if any positions should be closed.

        Args:
            prices: Dictionary of symbol -> {high, low, close}

        Returns:
            List of positions to close
        """
        to_close = []

        for symbol, position in self.state.positions.items():
            if symbol not in prices:
                continue

            high = prices[symbol].get("high", prices[symbol].get("close", 0))
            low = prices[symbol].get("low", prices[symbol].get("close", 0))

            # Check stop loss
            if position.stop_loss:
                if position.side == "long" and low <= position.stop_loss:
                    to_close.append({
                        "symbol": symbol,
                        "price": position.stop_loss,
                        "reason": "stop_loss"
                    })
                    continue
                elif position.side == "short" and high >= position.stop_loss:
                    to_close.append({
                        "symbol": symbol,
                        "price": position.stop_loss,
                        "reason": "stop_loss"
                    })
                    continue

            # Check take profit
            if position.take_profit:
                if position.side == "long" and high >= position.take_profit:
                    to_close.append({
                        "symbol": symbol,
                        "price": position.take_profit,
                        "reason": "take_profit"
                    })
                elif position.side == "short" and low <= position.take_profit:
                    to_close.append({
                        "symbol": symbol,
                        "price": position.take_profit,
                        "reason": "take_profit"
                    })

            # Check trailing stop
            if position.trailing_stop:
                if position.side == "long" and low <= position.trailing_stop:
                    to_close.append({
                        "symbol": symbol,
                        "price": position.trailing_stop,
                        "reason": "trailing_stop"
                    })
                elif position.side == "short" and high >= position.trailing_stop:
                    to_close.append({
                        "symbol": symbol,
                        "price": position.trailing_stop,
                        "reason": "trailing_stop"
                    })

        return to_close

    def process_signal(self, signal: Signal) -> Optional[PositionState]:
        """
        Process a trading signal.

        Args:
            signal: Trading signal

        Returns:
            PositionState if action taken, None otherwise
        """
        if signal.type == SignalType.BUY:
            # Calculate position size
            size = self.calculate_position_size(
                signal.symbol,
                signal.price,
                signal.metadata.get("stop_loss")
            )

            # Open position
            return self.open_position(
                symbol=signal.symbol,
                side="long",
                size=size,
                price=signal.price,
                stop_loss=signal.metadata.get("stop_loss"),
                take_profit=signal.metadata.get("take_profit"),
                metadata=signal.metadata
            )

        elif signal.type in [SignalType.SELL, SignalType.CLOSE_LONG]:
            return self.close_position(
                symbol=signal.symbol,
                price=signal.price,
                reason="signal"
            )

        return None

    def _record_equity(self) -> None:
        """Record current equity for tracking."""
        equity = self.total_value
        self.peak_equity = max(self.peak_equity, equity)

        drawdown = self.peak_equity - equity
        drawdown_pct = (drawdown / self.peak_equity) * 100 if self.peak_equity > 0 else 0

        self.equity_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "equity": equity,
            "cash": self.state.cash,
            "position_value": equity - self.state.cash,
            "drawdown": drawdown,
            "drawdown_percentage": drawdown_pct
        })

    def get_metrics(self) -> PortfolioMetrics:
        """
        Calculate and return portfolio metrics.

        Returns:
            PortfolioMetrics with current values
        """
        metrics = self.state.calculate_metrics()

        # Add trade statistics
        if self.closed_trades:
            wins = [t for t in self.closed_trades if t["pnl"] > 0]
            losses = [t for t in self.closed_trades if t["pnl"] <= 0]

            metrics.total_trades = len(self.closed_trades)
            metrics.winning_trades = len(wins)
            metrics.losing_trades = len(losses)
            metrics.win_rate = (len(wins) / len(self.closed_trades)) * 100

            if wins:
                metrics.profit_factor = sum(t["pnl"] for t in wins) / abs(sum(t["pnl"] for t in losses)) if losses else float('inf')

            metrics.realized_pnl = sum(t["pnl"] for t in self.closed_trades)

        # Max drawdown from history
        if self.equity_history:
            metrics.max_drawdown = max(h["drawdown"] for h in self.equity_history)
            metrics.max_drawdown_percentage = max(h["drawdown_percentage"] for h in self.equity_history)

        return metrics

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "portfolio": self.state.to_dict(),
            "metrics": self.get_metrics().to_dict(),
            "recent_trades": self.closed_trades[-10:],
            "equity_history": self.equity_history[-100:]
        }
