"""
Lumibot AI-Enhanced Strategies for CITARION
Advanced strategies with AI/ML integration
"""
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from lumibot.strategies import Strategy
from lumibot.entities import Asset, Order
import json


class AITradingStrategy(Strategy):
    """
    AI-Enhanced Trading Strategy
    Uses AI for market analysis and trade decisions
    Supports integration with OpenAI GPT models via CITARION
    """
    # Strategy parameters
    symbol: str = "BTC/USD"
    timeframe: str = "1h"
    position_size: float = 0.1
    ai_confidence_threshold: float = 0.7
    
    # AI integration
    ai_endpoint: str = "http://localhost:3000/api/ai/analyze"
    
    # Internal state
    last_signal: Optional[str] = None
    entry_price: Optional[float] = None
    signals: List[Dict[str, Any]] = []
    ai_context: Dict[str, Any] = {}

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize AI strategy"""
        self.symbol = symbol
        self.sleeptime = "1H"
        self.signals = []
        self.ai_context = {
            "market_regime": "unknown",
            "trend_strength": 0,
            "volatility": 0,
        }
        
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main trading logic with AI analysis"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")
        
        bars = self.get_historical_prices(asset, self.timeframe, 50)
        
        if bars is None or len(bars) < 20:
            return
        
        closes = [bar.close for bar in bars]
        volumes = [bar.volume for bar in bars] if hasattr(bars[0], 'volume') else []
        
        current_price = closes[-1]
        
        # Prepare market data for AI analysis
        market_data = {
            "symbol": self.symbol,
            "current_price": current_price,
            "price_history": closes[-20:],
            "volume_history": volumes[-20:] if volumes else [],
            "indicators": self._calculate_indicators(closes),
            "timestamp": datetime.now().isoformat(),
        }
        
        # Get AI analysis
        ai_signal = self._get_ai_analysis(market_data)
        
        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0
        
        signal = None
        
        if ai_signal and ai_signal.get("confidence", 0) >= self.ai_confidence_threshold:
            action = ai_signal.get("action")
            
            if action == "BUY" and not has_position:
                order = self.create_order(asset, self.position_size, "buy", type="market")
                self.submit_order(order)
                self.last_signal = "BUY"
                self.entry_price = current_price
                
                signal = self._emit_signal("BUY", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "size": self.position_size,
                    "ai_confidence": ai_signal.get("confidence"),
                    "ai_reasoning": ai_signal.get("reasoning"),
                    "indicators": market_data["indicators"],
                })
                
            elif action == "SELL" and has_position:
                order = self.create_order(asset, position.quantity, "sell", type="market")
                self.submit_order(order)
                self.last_signal = "SELL"
                
                pnl = (current_price - self.entry_price) / self.entry_price * 100 if self.entry_price else 0
                
                signal = self._emit_signal("SELL", {
                    "symbol": self.symbol,
                    "price": current_price,
                    "size": position.quantity,
                    "ai_confidence": ai_signal.get("confidence"),
                    "ai_reasoning": ai_signal.get("reasoning"),
                    "pnl_percent": pnl,
                })
                
                self.entry_price = None
        
        return signal

    def _calculate_indicators(self, prices: List[float]) -> Dict[str, Any]:
        """Calculate technical indicators for AI analysis"""
        if len(prices) < 20:
            return {}
        
        # RSI
        rsi = self._calculate_rsi(prices, 14)
        
        # Moving averages
        sma_20 = sum(prices[-20:]) / 20
        sma_50 = sum(prices[-min(50, len(prices)):]) / min(50, len(prices))
        
        # Volatility
        returns = [(prices[i] - prices[i-1]) / prices[i-1] for i in range(1, len(prices[-20:]))]
        volatility = (sum(r**2 for r in returns) / len(returns)) ** 0.5 if returns else 0
        
        # Trend
        trend = "bullish" if prices[-1] > sma_20 > sma_50 else "bearish" if prices[-1] < sma_20 < sma_50 else "neutral"
        
        return {
            "rsi": round(rsi, 2),
            "sma_20": round(sma_20, 2),
            "sma_50": round(sma_50, 2),
            "volatility": round(volatility * 100, 4),
            "trend": trend,
            "price_position": "above_sma" if prices[-1] > sma_20 else "below_sma",
        }

    def _calculate_rsi(self, prices: List[float], period: int = 14) -> float:
        """Calculate RSI"""
        if len(prices) < period + 1:
            return 50.0
        
        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        gains = [d if d > 0 else 0 for d in deltas[-period:]]
        losses = [-d if d < 0 else 0 for d in deltas[-period:]]
        
        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _get_ai_analysis(self, market_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Get AI analysis from CITARION backend"""
        # In production, this would call the CITARION AI endpoint
        # For now, return a simulated response
        
        indicators = market_data.get("indicators", {})
        rsi = indicators.get("rsi", 50)
        trend = indicators.get("trend", "neutral")
        
        # Simple logic simulation
        if rsi < 30 and trend in ["neutral", "bullish"]:
            return {
                "action": "BUY",
                "confidence": 0.8,
                "reasoning": f"RSI oversold ({rsi:.1f}) with {trend} trend"
            }
        elif rsi > 70 and trend in ["neutral", "bearish"]:
            return {
                "action": "SELL",
                "confidence": 0.8,
                "reasoning": f"RSI overbought ({rsi:.1f}) with {trend} trend"
            }
        
        return {"action": "HOLD", "confidence": 0.5, "reasoning": "No clear signal"}

    def _emit_signal(self, signal_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Emit signal to CITARION"""
        signal = {
            "id": f"sig_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            "type": signal_type,
            "timestamp": datetime.now().isoformat(),
            "strategy": "AI_Trading",
            "data": data
        }
        self.signals.append(signal)
        return signal


class SentimentStrategy(Strategy):
    """
    Sentiment-Based Trading Strategy
    Uses market sentiment from social media and news
    """
    symbol: str = "BTC/USD"
    timeframe: str = "4h"
    position_size: float = 0.1
    sentiment_threshold: float = 0.6
    
    last_signal: Optional[str] = None
    entry_price: Optional[float] = None
    signals: List[Dict[str, Any]] = []

    def initialize(self, symbol: str = "BTC/USD", **kwargs):
        """Initialize sentiment strategy"""
        self.symbol = symbol
        self.sleeptime = "4H"
        self.signals = []
        
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main trading logic based on sentiment"""
        asset = Asset(self.symbol.split("/")[0], asset_type="crypto")
        
        # Get market data
        bars = self.get_historical_prices(asset, self.timeframe, 20)
        if bars is None:
            return
        
        current_price = bars[-1].close
        
        # Get sentiment data (would integrate with sentiment API)
        sentiment = self._get_market_sentiment()
        
        position = self.get_position(asset)
        has_position = position is not None and position.quantity > 0
        
        signal = None
        
        if sentiment["score"] > self.sentiment_threshold and not has_position:
            order = self.create_order(asset, self.position_size, "buy")
            self.submit_order(order)
            self.last_signal = "BUY"
            self.entry_price = current_price
            
            signal = self._emit_signal("BUY", {
                "symbol": self.symbol,
                "price": current_price,
                "sentiment_score": sentiment["score"],
                "sentiment_sources": sentiment["sources"],
                "reason": "Positive market sentiment"
            })
            
        elif sentiment["score"] < -self.sentiment_threshold and has_position:
            order = self.create_order(asset, position.quantity, "sell")
            self.submit_order(order)
            self.last_signal = "SELL"
            
            pnl = (current_price - self.entry_price) / self.entry_price * 100 if self.entry_price else 0
            
            signal = self._emit_signal("SELL", {
                "symbol": self.symbol,
                "price": current_price,
                "sentiment_score": sentiment["score"],
                "sentiment_sources": sentiment["sources"],
                "pnl_percent": pnl,
                "reason": "Negative market sentiment"
            })
            
            self.entry_price = None
        
        return signal

    def _get_market_sentiment(self) -> Dict[str, Any]:
        """Get market sentiment from multiple sources"""
        # In production, integrate with:
        # - Twitter/X API
        # - Reddit API
        # - News APIs
        # - Fear & Greed Index
        
        # Simulated sentiment
        import random
        score = random.gauss(0, 0.3)  # Range -1 to 1
        
        return {
            "score": max(-1, min(1, score)),
            "sources": ["twitter", "reddit", "news"],
            "fear_greed_index": int(50 + score * 25),
        }

    def _emit_signal(self, signal_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Emit signal"""
        signal = {
            "id": f"sig_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            "type": signal_type,
            "timestamp": datetime.now().isoformat(),
            "strategy": "Sentiment_Trading",
            "data": data
        }
        self.signals.append(signal)
        return signal


class MultiAssetStrategy(Strategy):
    """
    Multi-Asset Portfolio Strategy
    Diversified trading across multiple cryptocurrencies
    """
    symbols: List[str] = ["BTC/USD", "ETH/USD", "SOL/USD"]
    timeframe: str = "1h"
    max_positions: int = 3
    position_size: float = 0.1
    correlation_threshold: float = 0.7
    
    portfolio: Dict[str, Any] = {}
    signals: List[Dict[str, Any]] = []

    def initialize(self, symbols: List[str] = None, **kwargs):
        """Initialize multi-asset strategy"""
        if symbols:
            self.symbols = symbols
        self.sleeptime = "1H"
        self.portfolio = {symbol: {"position": None, "entry_price": None} for symbol in self.symbols}
        self.signals = []
        
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def on_trading_iteration(self):
        """Main trading logic for portfolio"""
        current_positions = 0
        
        for symbol, data in self.portfolio.items():
            if data["position"] is not None:
                current_positions += 1
        
        for symbol in self.symbols:
            asset = Asset(symbol.split("/")[0], asset_type="crypto")
            
            bars = self.get_historical_prices(asset, self.timeframe, 50)
            if bars is None or len(bars) < 20:
                continue
            
            current_price = bars[-1].close
            
            # Analyze individual asset
            analysis = self._analyze_asset(bars)
            
            position = self.get_position(asset)
            has_position = position is not None and position.quantity > 0
            
            # Portfolio management
            if analysis["signal"] == "BUY" and not has_position and current_positions < self.max_positions:
                order = self.create_order(asset, self.position_size, "buy")
                self.submit_order(order)
                
                self.portfolio[symbol]["position"] = position
                self.portfolio[symbol]["entry_price"] = current_price
                current_positions += 1
                
                self._emit_signal("BUY", {
                    "symbol": symbol,
                    "price": current_price,
                    "portfolio_position": current_positions,
                    "analysis": analysis,
                })
                
            elif analysis["signal"] == "SELL" and has_position:
                order = self.create_order(asset, position.quantity, "sell")
                self.submit_order(order)
                
                pnl = (current_price - self.portfolio[symbol]["entry_price"]) / self.portfolio[symbol]["entry_price"] * 100
                
                self._emit_signal("SELL", {
                    "symbol": symbol,
                    "price": current_price,
                    "pnl_percent": pnl,
                    "analysis": analysis,
                })
                
                self.portfolio[symbol]["position"] = None
                self.portfolio[symbol]["entry_price"] = None
                current_positions -= 1

    def _analyze_asset(self, bars) -> Dict[str, Any]:
        """Analyze single asset"""
        closes = [bar.close for bar in bars]
        
        # Calculate indicators
        sma_20 = sum(closes[-20:]) / 20
        rsi = self._calculate_rsi(closes, 14)
        
        # Generate signal
        signal = "HOLD"
        confidence = 0.5
        
        if closes[-1] > sma_20 and rsi < 70:
            signal = "BUY"
            confidence = 0.7
        elif closes[-1] < sma_20 and rsi > 30:
            signal = "SELL"
            confidence = 0.7
        
        return {
            "signal": signal,
            "confidence": confidence,
            "rsi": rsi,
            "sma_20": sma_20,
            "current_price": closes[-1],
        }

    def _calculate_rsi(self, prices: List[float], period: int = 14) -> float:
        """Calculate RSI"""
        if len(prices) < period + 1:
            return 50.0
        
        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        gains = [d if d > 0 else 0 for d in deltas[-period:]]
        losses = [-d if d < 0 else 0 for d in deltas[-period:]]
        
        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _emit_signal(self, signal_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Emit signal"""
        signal = {
            "id": f"sig_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            "type": signal_type,
            "timestamp": datetime.now().isoformat(),
            "strategy": "Multi_Asset",
            "data": data
        }
        self.signals.append(signal)
        return signal


# Additional strategies registry
ADVANCED_STRATEGIES = {
    "ai_trading": AITradingStrategy,
    "sentiment": SentimentStrategy,
    "multi_asset": MultiAssetStrategy,
}
