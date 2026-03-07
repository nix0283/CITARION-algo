"""
Data providers for IAF.

Provides unified interface for fetching market data from various
exchanges supported by CITARION.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import aiohttp
import pandas as pd
import logging

from ..strategies.types import ExchangeType, DataType


logger = logging.getLogger(__name__)


class DataProvider:
    """Base class for data providers."""

    def __init__(self, exchange: ExchangeType):
        self.exchange = exchange

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 500,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get OHLCV data."""
        raise NotImplementedError

    async def get_ticker(self, symbol: str) -> Dict[str, Any]:
        """Get current ticker."""
        raise NotImplementedError

    async def get_orderbook(self, symbol: str, limit: int = 20) -> Dict[str, Any]:
        """Get order book."""
        raise NotImplementedError


class BinanceProvider(DataProvider):
    """Data provider for Binance."""

    BASE_URL = "https://api.binance.com"
    FUTURES_URL = "https://fapi.binance.com"

    def __init__(self, testnet: bool = False):
        super().__init__(ExchangeType.BINANCE)
        self.base_url = self.FUTURES_URL if testnet else self.BASE_URL

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 500,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get OHLCV data from Binance."""
        endpoint = "/api/v3/klines"

        params = {
            "symbol": symbol.upper(),
            "interval": timeframe,
            "limit": limit
        }

        if start_time:
            params["startTime"] = int(start_time.timestamp() * 1000)
        if end_time:
            params["endTime"] = int(end_time.timestamp() * 1000)

        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}{endpoint}"
            async with session.get(url, params=params) as response:
                data = await response.json()

        df = pd.DataFrame(data, columns=[
            "timestamp", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades", "taker_buy_base",
            "taker_buy_quote", "ignore"
        ])

        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)

        return df[["timestamp", "open", "high", "low", "close", "volume"]]

    async def get_ticker(self, symbol: str) -> Dict[str, Any]:
        """Get current ticker from Binance."""
        endpoint = "/api/v3/ticker/24hr"

        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}{endpoint}"
            async with session.get(url, params={"symbol": symbol.upper()}) as response:
                data = await response.json()

        return {
            "symbol": data["symbol"],
            "last_price": float(data["lastPrice"]),
            "volume": float(data["volume"]),
            "quote_volume": float(data["quoteVolume"]),
            "high": float(data["highPrice"]),
            "low": float(data["lowPrice"]),
            "price_change_percent": float(data["priceChangePercent"])
        }

    async def get_funding_rate(self, symbol: str) -> Dict[str, Any]:
        """Get funding rate for futures."""
        url = f"{self.FUTURES_URL}/fapi/v1/fundingRate"
        params = {"symbol": symbol.upper(), "limit": 1}

        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                data = await response.json()

        if data:
            return {
                "symbol": data[0]["symbol"],
                "funding_rate": float(data[0]["fundingRate"]),
                "funding_time": data[0]["fundingTime"]
            }
        return {}


class BybitProvider(DataProvider):
    """Data provider for Bybit."""

    BASE_URL = "https://api.bybit.com"

    def __init__(self, testnet: bool = False):
        super().__init__(ExchangeType.BYBIT)
        self.base_url = "https://api-testnet.bybit.com" if testnet else self.BASE_URL

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 500,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get OHLCV data from Bybit V5 API."""
        endpoint = "/v5/market/kline"

        # Bybit uses different interval format
        interval_map = {
            "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
            "1h": "60", "2h": "120", "4h": "240", "6h": "360",
            "12h": "720", "1d": "D", "1w": "W", "1M": "M"
        }

        params = {
            "category": "linear",
            "symbol": symbol.upper(),
            "interval": interval_map.get(timeframe, "60"),
            "limit": limit
        }

        if start_time:
            params["start"] = int(start_time.timestamp() * 1000)
        if end_time:
            params["end"] = int(end_time.timestamp() * 1000)

        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}{endpoint}"
            async with session.get(url, params=params) as response:
                result = await response.json()

        data = result.get("result", {}).get("list", [])

        # Bybit returns newest first, reverse it
        data = data[::-1]

        df = pd.DataFrame(data, columns=[
            "timestamp", "open", "high", "low", "close", "volume", "turnover"
        ])

        df["timestamp"] = pd.to_datetime(df["timestamp"].astype(int), unit="ms")
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)

        return df[["timestamp", "open", "high", "low", "close", "volume"]]

    async def get_ticker(self, symbol: str) -> Dict[str, Any]:
        """Get current ticker from Bybit."""
        endpoint = "/v5/market/tickers"

        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}{endpoint}"
            async with session.get(url, params={
                "category": "linear",
                "symbol": symbol.upper()
            }) as response:
                result = await response.json()

        data = result.get("result", {}).get("list", [])
        if data:
            ticker = data[0]
            return {
                "symbol": ticker["symbol"],
                "last_price": float(ticker["lastPrice"]),
                "volume": float(ticker["volume24h"]),
                "high": float(ticker["highPrice24h"]),
                "low": float(ticker["lowPrice24h"]),
                "price_change_percent": float(ticker.get("price24hPcnt", 0)) * 100
            }
        return {}


class OKXProvider(DataProvider):
    """Data provider for OKX."""

    BASE_URL = "https://www.okx.com"

    def __init__(self):
        super().__init__(ExchangeType.OKX)

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1H",
        limit: int = 500,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get OHLCV data from OKX."""
        endpoint = "/api/v5/market/candles"

        # OKX uses specific bar format
        bar_map = {
            "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H",
            "12h": "12H", "1d": "1D", "1w": "1W", "1M": "1M"
        }

        params = {
            "instId": symbol.upper(),
            "bar": bar_map.get(timeframe, "1H"),
            "limit": limit
        }

        if start_time:
            params["before"] = int(start_time.timestamp() * 1000)
        if end_time:
            params["after"] = int(end_time.timestamp() * 1000)

        async with aiohttp.ClientSession() as session:
            url = f"{self.BASE_URL}{endpoint}"
            async with session.get(url, params=params) as response:
                result = await response.json()

        data = result.get("data", [])
        # OKX returns newest first, reverse it
        data = data[::-1]

        df = pd.DataFrame(data, columns=[
            "timestamp", "open", "high", "low", "close", "volume",
            "volCcy", "volCcyQuote", "confirm"
        ])

        df["timestamp"] = pd.to_datetime(df["timestamp"].astype(int), unit="ms")
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)

        return df[["timestamp", "open", "high", "low", "close", "volume"]]

    async def get_ticker(self, symbol: str) -> Dict[str, Any]:
        """Get current ticker from OKX."""
        endpoint = "/api/v5/market/ticker"

        async with aiohttp.ClientSession() as session:
            url = f"{self.BASE_URL}{endpoint}"
            async with session.get(url, params={"instId": symbol.upper()}) as response:
                result = await response.json()

        data = result.get("data", [])
        if data:
            ticker = data[0]
            return {
                "symbol": ticker["instId"],
                "last_price": float(ticker["last"]),
                "volume": float(ticker["vol24h"]),
                "high": float(ticker["high24h"]),
                "low": float(ticker["low24h"]),
                "price_change_percent": float(ticker["sodUtc8"]) * 100
            }
        return {}


class BitgetProvider(DataProvider):
    """Data provider for Bitget."""

    BASE_URL = "https://api.bitget.com"

    def __init__(self):
        super().__init__(ExchangeType.BITGET)

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1H",
        limit: int = 500,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get OHLCV data from Bitget V2 API."""
        endpoint = "/api/v2/mix/market/candles"

        params = {
            "productType": "USDT-FUTURES",
            "symbol": symbol.upper(),
            "granularity": timeframe,
            "limit": limit
        }

        if start_time:
            params["startTime"] = int(start_time.timestamp() * 1000)
        if end_time:
            params["endTime"] = int(end_time.timestamp() * 1000)

        async with aiohttp.ClientSession() as session:
            url = f"{self.BASE_URL}{endpoint}"
            async with session.get(url, params=params) as response:
                result = await response.json()

        data = result.get("data", [])
        data = data[::-1]  # Reverse to oldest first

        df = pd.DataFrame(data, columns=[
            "timestamp", "open", "high", "low", "close", "volume", "quote_volume"
        ])

        df["timestamp"] = pd.to_datetime(df["timestamp"].astype(int), unit="ms")
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)

        return df[["timestamp", "open", "high", "low", "close", "volume"]]

    async def get_ticker(self, symbol: str) -> Dict[str, Any]:
        """Get current ticker from Bitget."""
        endpoint = "/api/v2/mix/market/ticker"

        async with aiohttp.ClientSession() as session:
            url = f"{self.BASE_URL}{endpoint}"
            async with session.get(url, params={
                "productType": "USDT-FUTURES",
                "symbol": symbol.upper()
            }) as response:
                result = await response.json()

        data = result.get("data", [])
        if data:
            ticker = data[0]
            return {
                "symbol": ticker["symbol"],
                "last_price": float(ticker["lastPr"]),
                "volume": float(ticker["baseVolume"]),
                "high": float(ticker["high24h"]),
                "low": float(ticker["low24h"]),
                "funding_rate": float(ticker.get("fundingRate", 0))
            }
        return {}


class BingXProvider(DataProvider):
    """Data provider for BingX."""

    BASE_URL = "https://open-api.bingx.com"

    def __init__(self):
        super().__init__(ExchangeType.BINGX)

    async def get_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 500,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get OHLCV data from BingX."""
        endpoint = "/openApi/swap/v3/quote/klines"

        params = {
            "symbol": symbol.upper(),
            "interval": timeframe,
            "limit": limit
        }

        if start_time:
            params["startTime"] = int(start_time.timestamp() * 1000)
        if end_time:
            params["endTime"] = int(end_time.timestamp() * 1000)

        async with aiohttp.ClientSession() as session:
            url = f"{self.BASE_URL}{endpoint}"
            async with session.get(url, params=params) as response:
                result = await response.json()

        data = result.get("data", [])
        data = data[::-1]  # Reverse to oldest first

        df = pd.DataFrame(data, columns=[
            "timestamp", "open", "high", "low", "close", "volume"
        ])

        df["timestamp"] = pd.to_datetime(df["timestamp"].astype(int), unit="ms")
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)

        return df[["timestamp", "open", "high", "low", "close", "volume"]]

    async def get_ticker(self, symbol: str) -> Dict[str, Any]:
        """Get current ticker from BingX."""
        endpoint = "/openApi/swap/v2/quote/ticker"

        async with aiohttp.ClientSession() as session:
            url = f"{self.BASE_URL}{endpoint}"
            async with session.get(url, params={"symbol": symbol.upper()}) as response:
                result = await response.json()

        data = result.get("data", {})
        if data:
            return {
                "symbol": data.get("symbol"),
                "last_price": float(data.get("lastPrice", 0)),
                "volume": float(data.get("volume", 0)),
                "high": float(data.get("high24h", 0)),
                "low": float(data.get("low24h", 0)),
                "funding_rate": float(data.get("fundingRate", 0))
            }
        return {}


# Provider factory
def get_provider(exchange: ExchangeType) -> DataProvider:
    """
    Get data provider for an exchange.

    Args:
        exchange: Exchange type

    Returns:
        DataProvider instance
    """
    providers = {
        ExchangeType.BINANCE: BinanceProvider,
        ExchangeType.BYBIT: BybitProvider,
        ExchangeType.OKX: OKXProvider,
        ExchangeType.BITGET: BitgetProvider,
        ExchangeType.BINGX: BingXProvider,
    }

    provider_class = providers.get(exchange)
    if provider_class:
        return provider_class()

    raise ValueError(f"No provider available for exchange: {exchange}")
