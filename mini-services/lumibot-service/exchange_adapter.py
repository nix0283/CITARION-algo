"""
Multi-Exchange Adapter
Abstract ExchangeAdapter with implementations for Binance, Bybit, OKX
"""

import ccxt
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass
import json

logger = logging.getLogger(__name__)


@dataclass
class Ticker:
    """Market ticker data"""
    symbol: str
    bid: float
    ask: float
    last: float
    high_24h: float
    low_24h: float
    volume_24h: float
    timestamp: datetime
    
    @classmethod
    def from_ccxt(cls, symbol: str, data: Dict) -> 'Ticker':
        return cls(
            symbol=symbol,
            bid=float(data.get('bid', 0)),
            ask=float(data.get('ask', 0)),
            last=float(data.get('last', 0)),
            high_24h=float(data.get('high', 0)),
            low_24h=float(data.get('low', 0)),
            volume_24h=float(data.get('baseVolume', 0)),
            timestamp=datetime.fromtimestamp(data.get('timestamp', 0) / 1000)
        )


@dataclass
class OrderBook:
    """Order book data"""
    symbol: str
    bids: List[Tuple[float, float]]  # (price, quantity)
    asks: List[Tuple[float, float]]
    timestamp: datetime
    
    @property
    def mid_price(self) -> float:
        if self.bids and self.asks:
            return (self.bids[0][0] + self.asks[0][0]) / 2
        return 0.0
    
    @property
    def spread(self) -> float:
        if self.bids and self.asks:
            return self.asks[0][0] - self.bids[0][0]
        return 0.0
    
    @property
    def spread_bps(self) -> float:
        if self.mid_price > 0 and self.spread > 0:
            return (self.spread / self.mid_price) * 10000
        return 0.0


@dataclass
class Order:
    """Order data"""
    id: str
    exchange: str
    symbol: str
    side: str  # 'buy' or 'sell'
    type: str  # 'limit', 'market', etc.
    price: float
    quantity: float
    filled_quantity: float
    status: str
    timestamp: datetime
    
    @classmethod
    def from_ccxt(cls, exchange: str, data: Dict) -> 'Order':
        return cls(
            id=str(data.get('id', '')),
            exchange=exchange,
            symbol=data.get('symbol', ''),
            side=data.get('side', ''),
            type=data.get('type', ''),
            price=float(data.get('price', 0)),
            quantity=float(data.get('amount', 0)),
            filled_quantity=float(data.get('filled', 0)),
            status=data.get('status', ''),
            timestamp=datetime.fromtimestamp(data.get('timestamp', 0) / 1000)
        )


@dataclass
class Position:
    """Position data"""
    symbol: str
    side: str
    quantity: float
    entry_price: float
    mark_price: float
    unrealized_pnl: float
    leverage: float
    liquidation_price: Optional[float]


@dataclass
class Balance:
    """Account balance"""
    currency: str
    total: float
    free: float
    used: float


class ExchangeAdapter(ABC):
    """Abstract base class for exchange adapters"""
    
    def __init__(self, api_key: str = '', api_secret: str = '', 
                 passphrase: str = '', sandbox: bool = True):
        self.api_key = api_key
        self.api_secret = api_secret
        self.passphrase = passphrase
        self.sandbox = sandbox
        self.exchange: Optional[ccxt.Exchange] = None
        self.name = "base"
    
    @abstractmethod
    def initialize(self):
        """Initialize exchange connection"""
        pass
    
    def is_connected(self) -> bool:
        """Check if exchange is connected"""
        return self.exchange is not None
    
    async def get_ticker(self, symbol: str) -> Optional[Ticker]:
        """Get ticker for symbol"""
        if not self.exchange:
            return None
        try:
            data = await self.exchange.fetch_ticker(symbol)
            return Ticker.from_ccxt(symbol, data)
        except Exception as e:
            logger.error(f"Failed to fetch ticker {symbol} on {self.name}: {e}")
            return None
    
    async def get_orderbook(self, symbol: str, limit: int = 20) -> Optional[OrderBook]:
        """Get order book for symbol"""
        if not self.exchange:
            return None
        try:
            data = await self.exchange.fetch_order_book(symbol, limit)
            return OrderBook(
                symbol=symbol,
                bids=[(float(b[0]), float(b[1])) for b in data.get('bids', [])],
                asks=[(float(a[0]), float(a[1])) for a in data.get('asks', [])],
                timestamp=datetime.now()
            )
        except Exception as e:
            logger.error(f"Failed to fetch orderbook {symbol} on {self.name}: {e}")
            return None
    
    async def get_balance(self) -> List[Balance]:
        """Get account balance"""
        if not self.exchange:
            return []
        try:
            data = await self.exchange.fetch_balance()
            balances = []
            for currency, amounts in data.items():
                if currency in ['info', 'timestamp', 'datetime', 'free', 'used', 'total']:
                    continue
                if amounts.get('total', 0) > 0:
                    balances.append(Balance(
                        currency=currency,
                        total=float(amounts.get('total', 0)),
                        free=float(amounts.get('free', 0)),
                        used=float(amounts.get('used', 0))
                    ))
            return balances
        except Exception as e:
            logger.error(f"Failed to fetch balance on {self.name}: {e}")
            return []
    
    async def create_order(self, symbol: str, side: str, order_type: str,
                          quantity: float, price: Optional[float] = None) -> Optional[Order]:
        """Create order"""
        if not self.exchange:
            return None
        try:
            if order_type == 'limit' and price:
                data = await self.exchange.create_order(
                    symbol, order_type, side, quantity, price
                )
            else:
                data = await self.exchange.create_order(
                    symbol, order_type, side, quantity
                )
            return Order.from_ccxt(self.name, data)
        except Exception as e:
            logger.error(f"Failed to create order on {self.name}: {e}")
            return None
    
    async def cancel_order(self, order_id: str, symbol: str) -> bool:
        """Cancel order"""
        if not self.exchange:
            return False
        try:
            await self.exchange.cancel_order(order_id, symbol)
            return True
        except Exception as e:
            logger.error(f"Failed to cancel order on {self.name}: {e}")
            return False
    
    async def get_order(self, order_id: str, symbol: str) -> Optional[Order]:
        """Get order by ID"""
        if not self.exchange:
            return None
        try:
            data = await self.exchange.fetch_order(order_id, symbol)
            return Order.from_ccxt(self.name, data)
        except Exception as e:
            logger.error(f"Failed to fetch order on {self.name}: {e}")
            return None
    
    async def get_open_orders(self, symbol: Optional[str] = None) -> List[Order]:
        """Get open orders"""
        if not self.exchange:
            return []
        try:
            data = await self.exchange.fetch_open_orders(symbol)
            return [Order.from_ccxt(self.name, o) for o in data]
        except Exception as e:
            logger.error(f"Failed to fetch open orders on {self.name}: {e}")
            return []
    
    async def get_positions(self) -> List[Position]:
        """Get positions (for futures)"""
        return []
    
    async def close(self):
        """Close exchange connection"""
        if self.exchange:
            await self.exchange.close()


class BinanceAdapter(ExchangeAdapter):
    """Binance exchange adapter"""
    
    def __init__(self, api_key: str = '', api_secret: str = '', sandbox: bool = True, futures: bool = False):
        super().__init__(api_key, api_secret, sandbox=sandbox)
        self.futures = futures
        self.name = "binance"
    
    def initialize(self):
        if self.futures:
            self.exchange = ccxt.binance({
                'apiKey': self.api_key,
                'secret': self.api_secret,
                'enableRateLimit': True,
                'options': {'defaultType': 'future'}
            })
        else:
            self.exchange = ccxt.binance({
                'apiKey': self.api_key,
                'secret': self.api_secret,
                'enableRateLimit': True
            })
        
        if self.sandbox:
            self.exchange.set_sandbox_mode(True)
        
        logger.info(f"Binance adapter initialized (futures={self.futures})")
    
    async def get_positions(self) -> List[Position]:
        """Get futures positions"""
        if not self.exchange or not self.futures:
            return []
        try:
            data = await self.exchange.fetch_positions()
            positions = []
            for p in data:
                qty = float(p.get('contracts', 0))
                if qty != 0:
                    positions.append(Position(
                        symbol=p.get('symbol', ''),
                        side='long' if qty > 0 else 'short',
                        quantity=abs(qty),
                        entry_price=float(p.get('entryPrice', 0)),
                        mark_price=float(p.get('markPrice', 0)),
                        unrealized_pnl=float(p.get('unrealizedPnl', 0)),
                        leverage=float(p.get('leverage', 1)),
                        liquidation_price=float(p.get('liquidationPrice', 0)) if p.get('liquidationPrice') else None
                    ))
            return positions
        except Exception as e:
            logger.error(f"Failed to fetch positions on Binance: {e}")
            return []


class BybitAdapter(ExchangeAdapter):
    """Bybit exchange adapter"""
    
    def __init__(self, api_key: str = '', api_secret: str = '', sandbox: bool = True, futures: bool = True):
        super().__init__(api_key, api_secret, sandbox=sandbox)
        self.futures = futures
        self.name = "bybit"
    
    def initialize(self):
        self.exchange = ccxt.bybit({
            'apiKey': self.api_key,
            'secret': self.api_secret,
            'enableRateLimit': True,
            'options': {'defaultType': 'swap' if self.futures else 'spot'}
        })
        
        if self.sandbox:
            self.exchange.set_sandbox_mode(True)
        
        logger.info(f"Bybit adapter initialized (futures={self.futures})")
    
    async def get_positions(self) -> List[Position]:
        """Get positions"""
        if not self.exchange:
            return []
        try:
            data = await self.exchange.fetch_positions()
            positions = []
            for p in data:
                qty = float(p.get('contracts', 0))
                if qty != 0:
                    positions.append(Position(
                        symbol=p.get('symbol', ''),
                        side='long' if qty > 0 else 'short',
                        quantity=abs(qty),
                        entry_price=float(p.get('entryPrice', 0)),
                        mark_price=float(p.get('markPrice', 0)),
                        unrealized_pnl=float(p.get('unrealizedPnl', 0)),
                        leverage=float(p.get('leverage', 1)),
                        liquidation_price=float(p.get('liquidationPrice', 0)) if p.get('liquidationPrice') else None
                    ))
            return positions
        except Exception as e:
            logger.error(f"Failed to fetch positions on Bybit: {e}")
            return []


class OKXAdapter(ExchangeAdapter):
    """OKX exchange adapter"""
    
    def __init__(self, api_key: str = '', api_secret: str = '', passphrase: str = '', 
                 sandbox: bool = True, futures: bool = False):
        super().__init__(api_key, api_secret, passphrase, sandbox)
        self.futures = futures
        self.name = "okx"
    
    def initialize(self):
        self.exchange = ccxt.okx({
            'apiKey': self.api_key,
            'secret': self.api_secret,
            'password': self.passphrase,
            'enableRateLimit': True,
            'options': {'defaultType': 'swap' if self.futures else 'spot'}
        })
        
        if self.sandbox:
            self.exchange.set_sandbox_mode(True)
        
        logger.info(f"OKX adapter initialized (futures={self.futures})")
    
    async def get_positions(self) -> List[Position]:
        """Get positions"""
        if not self.exchange:
            return []
        try:
            data = await self.exchange.fetch_positions()
            positions = []
            for p in data:
                qty = float(p.get('contracts', 0))
                if qty != 0:
                    positions.append(Position(
                        symbol=p.get('symbol', ''),
                        side='long' if qty > 0 else 'short',
                        quantity=abs(qty),
                        entry_price=float(p.get('entryPrice', 0)),
                        mark_price=float(p.get('markPrice', 0)),
                        unrealized_pnl=float(p.get('unrealizedPnl', 0)),
                        leverage=float(p.get('leverage', 1)),
                        liquidation_price=float(p.get('liquidationPrice', 0)) if p.get('liquidationPrice') else None
                    ))
            return positions
        except Exception as e:
            logger.error(f"Failed to fetch positions on OKX: {e}")
            return []


class MultiExchangeManager:
    """Manages multiple exchange adapters"""
    
    def __init__(self):
        self.adapters: Dict[str, ExchangeAdapter] = {}
        self._initialized = False
    
    def add_exchange(self, name: str, adapter: ExchangeAdapter):
        """Add exchange adapter"""
        self.adapters[name] = adapter
        logger.info(f"Added exchange adapter: {name}")
    
    def initialize_all(self):
        """Initialize all adapters"""
        for name, adapter in self.adapters.items():
            try:
                adapter.initialize()
            except Exception as e:
                logger.error(f"Failed to initialize {name}: {e}")
        self._initialized = True
    
    def get_adapter(self, name: str) -> Optional[ExchangeAdapter]:
        """Get adapter by name"""
        return self.adapters.get(name)
    
    async def get_all_tickers(self, symbol: str) -> Dict[str, Ticker]:
        """Get ticker from all exchanges"""
        tasks = {}
        for name, adapter in self.adapters.items():
            if adapter.is_connected():
                tasks[name] = adapter.get_ticker(symbol)
        
        results = {}
        for name, task in tasks.items():
            try:
                ticker = await task
                if ticker:
                    results[name] = ticker
            except Exception as e:
                logger.error(f"Error getting ticker from {name}: {e}")
        
        return results
    
    async def get_best_price(self, symbol: str, side: str) -> Tuple[str, float]:
        """Find best price across exchanges"""
        tickers = await self.get_all_tickers(symbol)
        
        if not tickers:
            return None, 0.0
        
        best_exchange = None
        best_price = 0.0
        
        for name, ticker in tickers.items():
            if side == 'buy':
                # For buying, we want lowest ask
                price = ticker.ask
                if best_price == 0 or price < best_price:
                    best_price = price
                    best_exchange = name
            else:
                # For selling, we want highest bid
                price = ticker.bid
                if price > best_price:
                    best_price = price
                    best_exchange = name
        
        return best_exchange, best_price
    
    async def get_aggregated_orderbook(self, symbol: str) -> OrderBook:
        """Get aggregated orderbook from all exchanges"""
        orderbooks = {}
        
        for name, adapter in self.adapters.items():
            if adapter.is_connected():
                ob = await adapter.get_orderbook(symbol)
                if ob:
                    orderbooks[name] = ob
        
        if not orderbooks:
            return None
        
        # Aggregate bids and asks
        all_bids = []
        all_asks = []
        
        for ob in orderbooks.values():
            all_bids.extend(ob.bids)
            all_asks.extend(ob.asks)
        
        # Sort and deduplicate
        all_bids.sort(key=lambda x: x[0], reverse=True)
        all_asks.sort(key=lambda x: x[0])
        
        return OrderBook(
            symbol=symbol,
            bids=all_bids[:50],
            asks=all_asks[:50],
            timestamp=datetime.now()
        )
    
    async def close_all(self):
        """Close all connections"""
        for adapter in self.adapters.values():
            await adapter.close()
