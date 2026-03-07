"""
Backtesting engine for IAF.

Provides both event-driven and vectorized backtesting capabilities
for testing trading strategies.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field
import pandas as pd
import numpy as np
import uuid
import logging

from .types import (
    BacktestConfig,
    BacktestPosition,
    BacktestTrade,
    EquityPoint,
    BacktestMetrics,
    TradeType,
    PositionSide,
)
from ..strategies import TradingStrategy, Signal, SignalType
from ..strategies.types import DataSource


logger = logging.getLogger(__name__)


@dataclass
class BacktestResult:
    """
    Result of a backtest run.

    Contains all trades, equity curve, and metrics.
    """
    config: BacktestConfig
    trades: List[BacktestTrade] = field(default_factory=list)
    equity_curve: List[EquityPoint] = field(default_factory=list)
    metrics: Optional[BacktestMetrics] = None
    positions: List[BacktestPosition] = field(default_factory=list)
    signals: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "config": self.config.to_dict(),
            "trades": [t.to_dict() for t in self.trades],
            "equity_curve": [e.to_dict() for e in self.equity_curve],
            "metrics": self.metrics.to_dict() if self.metrics else None,
            "summary": {
                "total_trades": len(self.trades),
                "total_return": self.metrics.total_return if self.metrics else 0,
                "win_rate": self.metrics.win_rate if self.metrics else 0,
                "max_drawdown": self.metrics.max_drawdown if self.metrics else 0,
                "sharpe_ratio": self.metrics.sharpe_ratio if self.metrics else 0,
            }
        }


class BacktestEngine:
    """
    Backtesting engine for strategy evaluation.

    Supports both event-driven (realistic) and vectorized (fast) modes.
    """

    def __init__(self, config: BacktestConfig):
        """
        Initialize the backtest engine.

        Args:
            config: Backtest configuration
        """
        self.config = config
        self.cash = config.initial_capital
        self.initial_capital = config.initial_capital
        self.positions: Dict[str, BacktestPosition] = {}
        self.trades: List[BacktestTrade] = []
        self.equity_curve: List[EquityPoint] = []
        self.peak_equity = config.initial_capital
        self.trade_counter = 0
        self.position_counter = 0

    def reset(self) -> None:
        """Reset the backtest engine state."""
        self.cash = self.initial_capital
        self.positions = {}
        self.trades = []
        self.equity_curve = []
        self.peak_equity = self.initial_capital
        self.trade_counter = 0
        self.position_counter = 0

    async def run(self, strategy: TradingStrategy) -> BacktestResult:
        """
        Run backtest for a strategy.

        Args:
            strategy: Strategy to backtest

        Returns:
            BacktestResult with trades, equity curve, and metrics
        """
        self.reset()
        logger.info(f"Starting backtest for {strategy.algorithm_id}")

        # Get data from strategy
        data_sources = list(strategy.data_sources.values())
        if not data_sources:
            raise ValueError("No data sources available for backtesting")

        # Use the first data source as primary
        primary_source = data_sources[0]
        data = primary_source.data

        if data is None or len(data) == 0:
            raise ValueError("No data loaded in data source")

        # Filter data by date range
        data = self._filter_data_by_date(data)

        # Run event-driven backtest
        await self._run_event_driven(strategy, data)

        # Calculate metrics
        metrics = self._calculate_metrics()

        return BacktestResult(
            config=self.config,
            trades=self.trades,
            equity_curve=self.equity_curve,
            metrics=metrics,
            signals=[]
        )

    def _filter_data_by_date(self, data: pd.DataFrame) -> pd.DataFrame:
        """Filter data by backtest date range."""
        if "timestamp" in data.columns:
            data["timestamp"] = pd.to_datetime(data["timestamp"], unit="ms")
            mask = (data["timestamp"] >= self.config.start_date) & \
                   (data["timestamp"] <= self.config.end_date)
            return data[mask].reset_index(drop=True)
        elif isinstance(data.index, pd.DatetimeIndex):
            mask = (data.index >= self.config.start_date) & \
                   (data.index <= self.config.end_date)
            return data[mask]
        return data

    async def _run_event_driven(
        self,
        strategy: TradingStrategy,
        data: pd.DataFrame
    ) -> None:
        """
        Run event-driven backtest.

        Processes each candle sequentially, generating signals and
        managing positions realistically.
        """
        total_candles = len(data)

        for i in range(max(50, len(data.columns)), total_candles):  # Warm-up period
            # Get current candle data
            current_data = data.iloc[:i+1]
            current_candle = data.iloc[i]

            # Extract timestamp
            if "timestamp" in data.columns:
                timestamp = current_candle["timestamp"]
            else:
                timestamp = data.index[i]

            # Check for stop loss and take profit
            self._check_exit_orders(
                current_candle["high"],
                current_candle["low"],
                timestamp
            )

            # Update price tracking for open positions
            self._update_position_prices(
                current_candle["high"],
                current_candle["low"]
            )

            # Generate signals
            data_dict = {list(strategy.data_sources.keys())[0]: current_data}
            signals = strategy.generate_signals(data_dict)

            # Process signals
            for signal in signals:
                self._process_signal(signal, current_candle, timestamp)

            # Record equity
            self._record_equity(timestamp, current_candle["close"])

    def _process_signal(
        self,
        signal: Signal,
        candle: pd.Series,
        timestamp: datetime
    ) -> None:
        """Process a trading signal."""
        if not signal.is_actionable():
            return

        # Check max positions
        if signal.type == SignalType.BUY and len(self.positions) >= self.config.max_positions:
            return

        if signal.type == SignalType.BUY:
            self._open_position(signal, candle, timestamp)
        elif signal.type == SignalType.SELL:
            self._close_position(signal, candle, timestamp, TradeType.EXIT)
        elif signal.type == SignalType.CLOSE_LONG:
            self._close_position(signal, candle, timestamp, TradeType.EXIT)
        elif signal.type == SignalType.CLOSE_SHORT:
            self._close_position(signal, candle, timestamp, TradeType.EXIT)

    def _open_position(
        self,
        signal: Signal,
        candle: pd.Series,
        timestamp: datetime
    ) -> None:
        """Open a new position."""
        # Calculate position size
        position_value = self.cash * 0.1  # Default 10% of capital
        if signal.metadata.get("position_size_pct"):
            position_value = self.cash * (signal.metadata["position_size_pct"] / 100)

        # Apply slippage
        entry_price = candle["close"] * (1 + self.config.slippage)

        # Calculate size
        size = position_value / entry_price
        commission = position_value * self.config.commission

        # Check if enough cash
        if position_value + commission > self.cash:
            return

        # Deduct from cash
        self.cash -= (position_value + commission)

        # Create position
        self.position_counter += 1
        position_id = f"pos_{self.position_counter}"

        position = BacktestPosition(
            id=position_id,
            symbol=signal.symbol,
            side=PositionSide.LONG,
            entry_price=entry_price,
            size=size,
            entry_time=timestamp,
            stop_loss=signal.metadata.get("stop_loss"),
            take_profit=signal.metadata.get("take_profit")
        )

        self.positions[position_id] = position
        logger.debug(f"Opened position {position_id} at {entry_price}")

    def _close_position(
        self,
        signal: Signal,
        candle: pd.Series,
        timestamp: datetime,
        trade_type: TradeType
    ) -> None:
        """Close a position."""
        # Find position for this symbol
        position = None
        position_id = None

        for pid, pos in self.positions.items():
            if pos.symbol == signal.symbol:
                position = pos
                position_id = pid
                break

        if not position:
            return

        # Apply slippage
        exit_price = candle["close"] * (1 - self.config.slippage)

        # Calculate PnL
        pnl = position.calculate_pnl(exit_price)
        position_value = exit_price * position.size
        commission = position_value * self.config.commission
        pnl -= commission

        # Add to cash
        self.cash += (position_value - commission)

        # Create trade record
        self.trade_counter += 1
        trade = BacktestTrade(
            id=f"trade_{self.trade_counter}",
            position_id=position_id,
            symbol=position.symbol,
            side=position.side,
            entry_price=position.entry_price,
            exit_price=exit_price,
            size=position.size,
            entry_time=position.entry_time,
            exit_time=timestamp,
            pnl=pnl,
            pnl_percentage=position.calculate_pnl_percentage(exit_price),
            trade_type=trade_type,
            commission=commission
        )

        self.trades.append(trade)

        # Remove position
        del self.positions[position_id]
        logger.debug(f"Closed position {position_id} at {exit_price}, PnL: {pnl:.2f}")

    def _check_exit_orders(
        self,
        high: float,
        low: float,
        timestamp: datetime
    ) -> None:
        """Check and execute stop loss and take profit orders."""
        positions_to_close = []

        for position_id, position in self.positions.items():
            # Check stop loss
            if position.stop_loss and low <= position.stop_loss:
                positions_to_close.append((position_id, TradeType.STOP_LOSS, position.stop_loss))

            # Check take profit
            elif position.take_profit and high >= position.take_profit:
                positions_to_close.append((position_id, TradeType.TAKE_PROFIT, position.take_profit))

            # Check trailing stop
            elif position.trailing_stop and low <= position.trailing_stop:
                positions_to_close.append((position_id, TradeType.STOP_LOSS, position.trailing_stop))

        # Close positions
        for position_id, trade_type, price in positions_to_close:
            position = self.positions.get(position_id)
            if position:
                self._close_position_at_price(position, price, timestamp, trade_type)

    def _close_position_at_price(
        self,
        position: BacktestPosition,
        price: float,
        timestamp: datetime,
        trade_type: TradeType
    ) -> None:
        """Close a position at a specific price."""
        pnl = position.calculate_pnl(price)
        position_value = price * position.size
        commission = position_value * self.config.commission
        pnl -= commission

        self.cash += (position_value - commission)

        self.trade_counter += 1
        trade = BacktestTrade(
            id=f"trade_{self.trade_counter}",
            position_id=position.id,
            symbol=position.symbol,
            side=position.side,
            entry_price=position.entry_price,
            exit_price=price,
            size=position.size,
            entry_time=position.entry_time,
            exit_time=timestamp,
            pnl=pnl,
            pnl_percentage=position.calculate_pnl_percentage(price),
            trade_type=trade_type,
            commission=commission
        )

        self.trades.append(trade)
        del self.positions[position.id]

    def _update_position_prices(self, high: float, low: float) -> None:
        """Update price tracking for trailing stops."""
        for position in self.positions.values():
            position.update_price_tracking(high, low)

            # Update trailing stop if configured
            if self.config.trailing_stop:
                if position.side == PositionSide.LONG:
                    new_trailing = position.highest_price * (1 - self.config.trailing_stop_percent / 100)
                    if position.trailing_stop is None or new_trailing > position.trailing_stop:
                        position.trailing_stop = new_trailing

    def _record_equity(self, timestamp: datetime, close: float) -> None:
        """Record equity curve point."""
        # Calculate position values
        position_value = sum(
            pos.size * close for pos in self.positions.values()
        )

        equity = self.cash + position_value

        # Calculate drawdown
        self.peak_equity = max(self.peak_equity, equity)
        drawdown = self.peak_equity - equity
        drawdown_pct = (drawdown / self.peak_equity) * 100 if self.peak_equity > 0 else 0

        equity_point = EquityPoint(
            timestamp=timestamp,
            equity=equity,
            cash=self.cash,
            position_value=position_value,
            drawdown=drawdown,
            drawdown_percentage=drawdown_pct
        )

        self.equity_curve.append(equity_point)

    def _calculate_metrics(self) -> BacktestMetrics:
        """Calculate performance metrics."""
        metrics = BacktestMetrics()

        if not self.trades:
            return metrics

        # Basic trade statistics
        metrics.total_trades = len(self.trades)
        metrics.winning_trades = sum(1 for t in self.trades if t.is_winner())
        metrics.losing_trades = metrics.total_trades - metrics.winning_trades
        metrics.win_rate = metrics.calculate_win_rate()

        # PnL statistics
        wins = [t.pnl for t in self.trades if t.is_winner()]
        losses = [t.pnl for t in self.trades if not t.is_winner()]

        if wins:
            metrics.avg_win = np.mean(wins)
            metrics.largest_win = max(wins)
        if losses:
            metrics.avg_loss = np.mean(losses)
            metrics.largest_loss = min(losses)

        metrics.avg_trade = np.mean([t.pnl for t in self.trades])

        # Profit factor
        gross_profit = sum(wins) if wins else 0
        gross_loss = abs(sum(losses)) if losses else 0
        metrics.profit_factor = metrics.calculate_profit_factor(gross_profit, gross_loss)

        # Risk/reward ratio
        if metrics.avg_loss != 0:
            metrics.risk_reward_ratio = abs(metrics.avg_win / metrics.avg_loss)

        # Expectancy
        if metrics.total_trades > 0:
            win_prob = metrics.winning_trades / metrics.total_trades
            loss_prob = metrics.losing_trades / metrics.total_trades
            metrics.expectancy = (win_prob * metrics.avg_win) - (loss_prob * abs(metrics.avg_loss))

        # Total return
        if self.equity_curve:
            final_equity = self.equity_curve[-1].equity
            metrics.total_return = final_equity - self.initial_capital
            metrics.total_return_percentage = (metrics.total_return / self.initial_capital) * 100

            # Annualized return
            days = (self.config.end_date - self.config.start_date).days
            if days > 0:
                metrics.annualized_return = (
                    (1 + metrics.total_return_percentage / 100) ** (365 / days) - 1
                ) * 100

            # Drawdown statistics
            drawdowns = [e.drawdown_percentage for e in self.equity_curve]
            metrics.max_drawdown_percentage = max(drawdowns) if drawdowns else 0
            metrics.max_drawdown = max([e.drawdown for e in self.equity_curve])
            metrics.avg_drawdown = np.mean(drawdowns) if drawdowns else 0

            # Calculate max drawdown duration
            metrics.max_drawdown_duration_days = self._calculate_max_drawdown_duration()

            # Calculate volatility and Sharpe ratio
            returns = self._calculate_returns()
            if returns:
                metrics.volatility = np.std(returns) * np.sqrt(252)  # Annualized
                metrics.std_dev = np.std(returns)
                metrics.variance = np.var(returns)

                # Sharpe ratio (assuming risk-free rate of 2%)
                risk_free_rate = 0.02
                if metrics.volatility > 0:
                    metrics.sharpe_ratio = (metrics.annualized_return / 100 - risk_free_rate) / (metrics.volatility / 100)

                # Sortino ratio
                downside_returns = [r for r in returns if r < 0]
                if downside_returns:
                    downside_std = np.std(downside_returns) * np.sqrt(252)
                    if downside_std > 0:
                        metrics.sortino_ratio = (metrics.annualized_return / 100 - risk_free_rate) / (downside_std / 100)

                # Calmar ratio
                if metrics.max_drawdown_percentage > 0:
                    metrics.calmar_ratio = metrics.annualized_return / metrics.max_drawdown_percentage

        # Holding time statistics
        holding_times = [t.holding_time_seconds / 3600 for t in self.trades]
        if holding_times:
            metrics.avg_holding_time_hours = np.mean(holding_times)

        # Trading frequency
        metrics.trading_days = (self.config.end_date - self.config.start_date).days
        if metrics.trading_days > 0:
            metrics.trades_per_day = metrics.total_trades / metrics.trading_days

        # Consecutive wins/losses
        metrics.max_consecutive_wins, metrics.max_consecutive_losses = self._calculate_consecutive_wins_losses()

        return metrics

    def _calculate_returns(self) -> List[float]:
        """Calculate period returns from equity curve."""
        if len(self.equity_curve) < 2:
            return []

        returns = []
        for i in range(1, len(self.equity_curve)):
            prev_equity = self.equity_curve[i-1].equity
            curr_equity = self.equity_curve[i].equity
            if prev_equity > 0:
                returns.append((curr_equity - prev_equity) / prev_equity)

        return returns

    def _calculate_max_drawdown_duration(self) -> int:
        """Calculate the maximum drawdown duration in days."""
        if not self.equity_curve:
            return 0

        max_duration = 0
        current_duration = 0

        for point in self.equity_curve:
            if point.drawdown > 0:
                current_duration += 1
            else:
                max_duration = max(max_duration, current_duration)
                current_duration = 0

        return max(max_duration, current_duration)

    def _calculate_consecutive_wins_losses(self) -> tuple:
        """Calculate maximum consecutive wins and losses."""
        if not self.trades:
            return 0, 0

        max_wins = 0
        max_losses = 0
        current_wins = 0
        current_losses = 0

        for trade in self.trades:
            if trade.is_winner():
                current_wins += 1
                current_losses = 0
                max_wins = max(max_wins, current_wins)
            else:
                current_losses += 1
                current_wins = 0
                max_losses = max(max_losses, current_losses)

        return max_wins, max_losses

    def run_vectorized(
        self,
        strategy: TradingStrategy,
        data: pd.DataFrame
    ) -> BacktestResult:
        """
        Run vectorized backtest (fast but less realistic).

        This method processes all signals at once and calculates
        returns without realistic order execution.

        Args:
            strategy: Strategy to backtest
            data: Historical data

        Returns:
            BacktestResult with metrics
        """
        self.reset()

        # Generate all signals at once
        data_dict = {list(strategy.data_sources.keys())[0]: data}

        buy_signals = strategy.generate_buy_signals(data_dict)
        sell_signals = strategy.generate_sell_signals(data_dict)

        # Create position tracking
        equity = [self.initial_capital]
        position = 0
        entry_price = 0

        symbol = list(buy_signals.keys())[0] if buy_signals else None
        if not symbol:
            return BacktestResult(config=self.config, metrics=BacktestMetrics())

        buy_series = buy_signals.get(symbol, pd.Series([False] * len(data)))
        sell_series = sell_signals.get(symbol, pd.Series([False] * len(data)))

        for i in range(len(data)):
            close = data["close"].iloc[i]

            # Buy signal
            if buy_series.iloc[i] and position == 0:
                position = equity[-1] / close
                entry_price = close

            # Sell signal
            elif sell_series.iloc[i] and position > 0:
                equity.append(position * close)
                position = 0
                entry_price = 0

            # Update equity
            if position > 0:
                equity.append(position * close)
            else:
                equity.append(equity[-1])

        # Calculate final metrics
        final_equity = equity[-1]
        metrics = BacktestMetrics()
        metrics.total_return = final_equity - self.initial_capital
        metrics.total_return_percentage = (metrics.total_return / self.initial_capital) * 100

        return BacktestResult(
            config=self.config,
            trades=self.trades,
            equity_curve=[],
            metrics=metrics
        )
