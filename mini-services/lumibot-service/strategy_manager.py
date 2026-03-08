"""
Strategy Manager for Lumibot Service
Manages lifecycle and execution of trading strategies
"""

import threading
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import json
import queue
import ccxt
from collections import defaultdict

logger = logging.getLogger(__name__)


class StrategyManager:
    """Manages trading strategy lifecycle"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.strategies = {}
        self.strategy_threads = {}
        self.strategy_status = {}
        self.orders = defaultdict(list)
        self.positions = {}
        self.performance = defaultdict(dict)
        self.exchanges = {}
        self.start_time = datetime.now()
        
        self._init_exchanges()
        self._init_strategy_status()
    
    def _init_exchanges(self):
        """Initialize exchange connections"""
        exchange_config = self.config.get('exchanges', {})
        
        # Initialize CCXT exchanges
        if 'binance' in exchange_config:
            try:
                self.exchanges['binance'] = ccxt.binance({
                    'apiKey': exchange_config['binance'].get('api_key', ''),
                    'secret': exchange_config['binance'].get('api_secret', ''),
                    'enableRateLimit': True,
                    'options': {'defaultType': 'future'}
                })
                if exchange_config['binance'].get('sandbox'):
                    self.exchanges['binance'].set_sandbox_mode(True)
            except Exception as e:
                logger.error(f"Failed to initialize Binance: {e}")
        
        if 'bybit' in exchange_config:
            try:
                self.exchanges['bybit'] = ccxt.bybit({
                    'apiKey': exchange_config['bybit'].get('api_key', ''),
                    'secret': exchange_config['bybit'].get('api_secret', ''),
                    'enableRateLimit': True
                })
                if exchange_config['bybit'].get('sandbox'):
                    self.exchanges['bybit'].set_sandbox_mode(True)
            except Exception as e:
                logger.error(f"Failed to initialize Bybit: {e}")
        
        if 'okx' in exchange_config:
            try:
                self.exchanges['okx'] = ccxt.okx({
                    'apiKey': exchange_config['okx'].get('api_key', ''),
                    'secret': exchange_config['okx'].get('api_secret', ''),
                    'password': exchange_config['okx'].get('passphrase', ''),
                    'enableRateLimit': True
                })
                if exchange_config['okx'].get('sandbox'):
                    self.exchanges['okx'].set_sandbox_mode(True)
            except Exception as e:
                logger.error(f"Failed to initialize OKX: {e}")
    
    def _init_strategy_status(self):
        """Initialize strategy status tracking"""
        strategy_configs = self.config.get('strategies', {})
        for strategy_id in ['mft', 'spectrum', 'reed', 'architect', 'equilibrist', 'kron']:
            self.strategy_status[strategy_id] = {
                'status': 'stopped' if strategy_configs.get(strategy_id, {}).get('enabled', False) else 'disabled',
                'started_at': None,
                'stopped_at': None,
                'last_signal': None,
                'pnl': 0.0,
                'trades': 0
            }
    
    def get_active_strategies(self) -> List[Dict[str, Any]]:
        """Get list of active strategies"""
        active = []
        for strategy_id, status in self.strategy_status.items():
            if status['status'] == 'running':
                active.append({
                    'id': strategy_id,
                    'status': status['status'],
                    'started_at': status['started_at']
                })
        return active
    
    def get_uptime(self) -> str:
        """Get service uptime"""
        delta = datetime.now() - self.start_time
        hours, remainder = divmod(delta.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"{delta.days}d {hours}h {minutes}m {seconds}s"
    
    def get_strategy_status(self, strategy_id: str) -> Dict[str, Any]:
        """Get status for specific strategy"""
        return self.strategy_status.get(strategy_id, {'status': 'unknown'})
    
    def get_strategy_details(self, strategy_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed strategy information"""
        if strategy_id not in self.strategy_status:
            return None
        
        status = self.strategy_status[strategy_id]
        config = self.config.get('strategies', {}).get(strategy_id, {})
        
        return {
            'id': strategy_id,
            'status': status['status'],
            'config': config,
            'performance': self.performance.get(strategy_id, {}),
            'recent_orders': self.orders.get(strategy_id, [])[-10:],
            'started_at': status['started_at'],
            'pnl': status['pnl'],
            'trades': status['trades']
        }
    
    def start_strategy(self, strategy_id: str, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """Start a trading strategy"""
        if strategy_id not in self.strategy_status:
            return {'success': False, 'error': 'Unknown strategy'}
        
        if self.strategy_status[strategy_id]['status'] == 'running':
            return {'success': False, 'error': 'Strategy already running'}
        
        # Merge config
        if config:
            strategy_config = {**self.config.get('strategies', {}).get(strategy_id, {}), **config}
        else:
            strategy_config = self.config.get('strategies', {}).get(strategy_id, {})
        
        # Start strategy thread
        def run_strategy():
            self._execute_strategy(strategy_id, strategy_config)
        
        thread = threading.Thread(target=run_strategy, daemon=True)
        thread.start()
        self.strategy_threads[strategy_id] = thread
        
        self.strategy_status[strategy_id]['status'] = 'running'
        self.strategy_status[strategy_id]['started_at'] = datetime.now().isoformat()
        
        logger.info(f"Started strategy: {strategy_id}")
        return {'success': True, 'message': f'Strategy {strategy_id} started'}
    
    def stop_strategy(self, strategy_id: str) -> Dict[str, Any]:
        """Stop a trading strategy"""
        if strategy_id not in self.strategy_status:
            return {'success': False, 'error': 'Unknown strategy'}
        
        if self.strategy_status[strategy_id]['status'] != 'running':
            return {'success': False, 'error': 'Strategy not running'}
        
        self.strategy_status[strategy_id]['status'] = 'stopped'
        self.strategy_status[strategy_id]['stopped_at'] = datetime.now().isoformat()
        
        logger.info(f"Stopped strategy: {strategy_id}")
        return {'success': True, 'message': f'Strategy {strategy_id} stopped'}
    
    def _execute_strategy(self, strategy_id: str, config: Dict[str, Any]):
        """Execute strategy loop"""
        logger.info(f"Executing strategy: {strategy_id}")
        
        while self.strategy_status[strategy_id]['status'] == 'running':
            try:
                # Simulate strategy execution
                signal = self._generate_signal(strategy_id, config)
                
                if signal:
                    self.strategy_status[strategy_id]['last_signal'] = {
                        'time': datetime.now().isoformat(),
                        'signal': signal
                    }
                    
                    # Create simulated order
                    order = {
                        'id': f"ord_{int(time.time() * 1000)}",
                        'strategy': strategy_id,
                        'symbol': signal.get('symbol', 'BTC/USDT'),
                        'side': signal.get('side', 'buy'),
                        'type': signal.get('type', 'limit'),
                        'price': signal.get('price', 0),
                        'quantity': signal.get('quantity', 0),
                        'status': 'filled',
                        'timestamp': datetime.now().isoformat()
                    }
                    self.orders[strategy_id].append(order)
                    self.strategy_status[strategy_id]['trades'] += 1
                
                time.sleep(5)  # Strategy execution interval
                
            except Exception as e:
                logger.error(f"Strategy {strategy_id} error: {e}")
                time.sleep(10)
    
    def _generate_signal(self, strategy_id: str, config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate trading signal based on strategy"""
        import random
        
        # Get market data from exchange
        symbols = config.get('symbols', ['BTC/USDT'])
        
        if strategy_id == 'mft':
            # VWAP/TWAP execution signal
            return {
                'type': 'vwap',
                'symbol': symbols[0] if symbols else 'BTC/USDT',
                'side': 'buy',
                'price': 50000 + random.uniform(-100, 100),
                'quantity': 0.1,
                'reason': 'VWAP execution slice'
            }
        
        elif strategy_id == 'spectrum':
            # Pairs trading signal
            pairs = config.get('pairs', [['BTC/USDT', 'ETH/USDT']])
            return {
                'type': 'pairs',
                'symbol': f"{pairs[0][0]}/{pairs[0][1]}",
                'side': 'long_spread',
                'price': 1.5 + random.uniform(-0.1, 0.1),
                'quantity': 0.05,
                'reason': 'Z-score entry signal'
            }
        
        elif strategy_id == 'reed':
            # PCA factor signal
            return {
                'type': 'factor',
                'symbol': 'BTC/USDT',
                'side': 'buy' if random.random() > 0.5 else 'sell',
                'price': 50000 + random.uniform(-100, 100),
                'quantity': 0.1,
                'reason': 'PCA residual signal'
            }
        
        elif strategy_id == 'architect':
            # Market making signal
            return {
                'type': 'mm',
                'symbol': symbols[0] if symbols else 'BTC/USDT',
                'side': 'bid',
                'price': 49990,
                'quantity': 0.01,
                'reason': 'Avellaneda-Stoikov optimal quote'
            }
        
        elif strategy_id == 'equilibrist':
            # Mean reversion signal
            return {
                'type': 'mr',
                'symbol': symbols[0] if symbols else 'BTC/USDT',
                'side': 'buy' if random.random() > 0.5 else 'sell',
                'price': 50000 + random.uniform(-100, 100),
                'quantity': 0.1,
                'reason': 'OU mean reversion signal'
            }
        
        elif strategy_id == 'kron':
            # Trend following signal
            return {
                'type': 'trend',
                'symbol': symbols[0] if symbols else 'BTC/USDT',
                'side': 'buy',
                'price': 50100,
                'quantity': 0.1,
                'reason': 'Donchian breakout'
            }
        
        return None
    
    def run_backtest(self, strategy_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Run backtest for strategy"""
        # Simulated backtest results
        return {
            'strategy': strategy_id,
            'start_date': config.get('start_date', '2024-01-01'),
            'end_date': config.get('end_date', '2024-12-31'),
            'initial_capital': config.get('initial_capital', 100000),
            'final_capital': 125000 + (hash(strategy_id) % 50000),
            'total_return': 0.25 + (hash(strategy_id) % 50) / 100,
            'sharpe_ratio': 1.5 + (hash(strategy_id) % 20) / 10,
            'max_drawdown': 0.1 + (hash(strategy_id) % 10) / 100,
            'win_rate': 0.55 + (hash(strategy_id) % 20) / 100,
            'trades': 100 + (hash(strategy_id) % 200)
        }
    
    def get_orders(self, strategy_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get orders, optionally filtered by strategy"""
        if strategy_id:
            return self.orders.get(strategy_id, [])
        
        all_orders = []
        for orders in self.orders.values():
            all_orders.extend(orders)
        return sorted(all_orders, key=lambda x: x['timestamp'], reverse=True)[:100]
    
    def get_positions(self) -> Dict[str, Any]:
        """Get all positions"""
        return self.positions
    
    def get_performance(self, strategy_id: Optional[str] = None) -> Dict[str, Any]:
        """Get performance metrics"""
        if strategy_id:
            return self.performance.get(strategy_id, {})
        
        return dict(self.performance)
    
    def get_risk_metrics(self) -> Dict[str, Any]:
        """Get risk metrics"""
        risk_config = self.config.get('risk', {})
        return {
            'max_position_size': risk_config.get('max_position_size', 1.0),
            'max_daily_loss': risk_config.get('max_daily_loss', 0.05),
            'max_drawdown': risk_config.get('max_drawdown', 0.1),
            'leverage_limit': risk_config.get('leverage_limit', 3),
            'current_exposure': sum(p.get('value', 0) for p in self.positions.values()),
            'var_95': 0.05,
            'expected_shortfall': 0.07
        }
    
    def get_configured_exchanges(self) -> List[Dict[str, Any]]:
        """Get list of configured exchanges"""
        return [
            {'name': name, 'connected': bool(exchange)} 
            for name, exchange in self.exchanges.items()
        ]
    
    def get_exchange_balance(self, exchange: str) -> Dict[str, Any]:
        """Get balance for exchange"""
        if exchange not in self.exchanges:
            return {'error': 'Exchange not configured'}
        
        try:
            balance = self.exchanges[exchange].fetch_balance()
            return balance
        except Exception as e:
            logger.error(f"Failed to fetch balance for {exchange}: {e}")
            return {'error': str(e)}
    
    def get_ticker(self, exchange: str, symbol: str) -> Dict[str, Any]:
        """Get ticker for symbol on exchange"""
        if exchange not in self.exchanges:
            return {'error': 'Exchange not configured'}
        
        try:
            ticker = self.exchanges[exchange].fetch_ticker(symbol)
            return ticker
        except Exception as e:
            logger.error(f"Failed to fetch ticker for {symbol} on {exchange}: {e}")
            return {'error': str(e)}
