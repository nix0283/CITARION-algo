"""
WebSocket support for ML Service - Real-time predictions
Provides WebSocket endpoint for real-time ML predictions with connection management.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MessageType(str, Enum):
    """WebSocket message types"""
    # Client -> Server
    SUBSCRIBE_PREDICTIONS = "subscribe_predictions"
    UNSUBSCRIBE = "unsubscribe"
    GET_STATUS = "get_status"
    PREDICTION_REQUEST = "prediction_request"
    PING = "ping"
    
    # Server -> Client
    PREDICTION = "prediction"
    STATUS = "status"
    ERROR = "error"
    PONG = "pong"
    HEARTBEAT = "heartbeat"
    SUBSCRIBED = "subscribed"
    UNSUBSCRIBED = "unsubscribed"


@dataclass
class ClientInfo:
    """Information about a connected client"""
    websocket: WebSocket
    client_id: str
    connected_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    subscriptions: Set[str] = field(default_factory=set)
    is_active: bool = True
    
    def update_activity(self) -> None:
        """Update last activity timestamp"""
        self.last_activity = time.time()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert client info to dictionary"""
        return {
            "client_id": self.client_id,
            "connected_at": datetime.fromtimestamp(self.connected_at).isoformat(),
            "last_activity": datetime.fromtimestamp(self.last_activity).isoformat(),
            "subscriptions": list(self.subscriptions),
            "is_active": self.is_active,
        }


class ConnectionManager:
    """
    Manages WebSocket connections for the ML Service.
    Handles connection lifecycle, subscriptions, and message broadcasting.
    """
    
    def __init__(self) -> None:
        """Initialize the connection manager"""
        self._clients: Dict[str, ClientInfo] = {}
        self._lock = asyncio.Lock()
        self._heartbeat_interval = 30.0  # seconds
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._prediction_task: Optional[asyncio.Task] = None
        self._running = False
        self._client_counter = 0
        
        # Subscription channels
        self._subscription_channels: Dict[str, Set[str]] = {
            "price_predictions": set(),
            "signal_predictions": set(),
            "regime_predictions": set(),
        }
        
        logger.info("ConnectionManager initialized")
    
    async def start(self) -> None:
        """Start the connection manager background tasks"""
        if self._running:
            return
        
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        self._prediction_task = asyncio.create_task(self._prediction_broadcast_loop())
        logger.info("ConnectionManager started")
    
    async def stop(self) -> None:
        """Stop the connection manager and cleanup"""
        self._running = False
        
        # Cancel background tasks
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        
        if self._prediction_task:
            self._prediction_task.cancel()
            try:
                await self._prediction_task
            except asyncio.CancelledError:
                pass
        
        # Close all connections
        async with self._lock:
            for client_info in self._clients.values():
                try:
                    await client_info.websocket.close(
                        code=status.WS_1001_GOING_AWAY,
                        reason="Server shutting down"
                    )
                except Exception as e:
                    logger.warning(f"Error closing connection: {e}")
            
            self._clients.clear()
            for channel in self._subscription_channels.values():
                channel.clear()
        
        logger.info("ConnectionManager stopped")
    
    async def connect(self, websocket: WebSocket) -> str:
        """
        Accept a new WebSocket connection.
        
        Args:
            websocket: The WebSocket connection to accept
            
        Returns:
            The client ID assigned to this connection
        """
        await websocket.accept()
        
        async with self._lock:
            self._client_counter += 1
            client_id = f"client_{self._client_counter}_{int(time.time())}"
            
            client_info = ClientInfo(
                websocket=websocket,
                client_id=client_id,
            )
            self._clients[client_id] = client_info
        
        logger.info(f"Client connected: {client_id}")
        
        # Send welcome message
        await self._send_message(websocket, {
            "type": MessageType.STATUS,
            "data": {
                "status": "connected",
                "client_id": client_id,
                "server_time": datetime.utcnow().isoformat(),
                "available_channels": list(self._subscription_channels.keys()),
            }
        })
        
        return client_id
    
    async def disconnect(self, client_id: str) -> None:
        """
        Disconnect a client and cleanup.
        
        Args:
            client_id: The ID of the client to disconnect
        """
        async with self._lock:
            client_info = self._clients.pop(client_id, None)
            
            if client_info:
                # Remove from all subscription channels
                for channel in self._subscription_channels.values():
                    channel.discard(client_id)
                
                logger.info(f"Client disconnected: {client_id}")
    
    async def handle_message(self, client_id: str, message: Dict[str, Any]) -> None:
        """
        Handle an incoming message from a client.
        
        Args:
            client_id: The ID of the client sending the message
            message: The parsed message dictionary
        """
        async with self._lock:
            client_info = self._clients.get(client_id)
            if not client_info:
                logger.warning(f"Unknown client: {client_id}")
                return
            
            client_info.update_activity()
        
        message_type = message.get("type", "")
        data = message.get("data", {})
        
        try:
            if message_type == MessageType.SUBSCRIBE_PREDICTIONS:
                await self._handle_subscribe(client_id, data)
            elif message_type == MessageType.UNSUBSCRIBE:
                await self._handle_unsubscribe(client_id, data)
            elif message_type == MessageType.GET_STATUS:
                await self._handle_get_status(client_id)
            elif message_type == MessageType.PREDICTION_REQUEST:
                await self._handle_prediction_request(client_id, data)
            elif message_type == MessageType.PING:
                await self._handle_ping(client_id)
            else:
                await self._send_error(
                    client_info.websocket,
                    f"Unknown message type: {message_type}"
                )
        except Exception as e:
            logger.error(f"Error handling message from {client_id}: {e}")
            await self._send_error(
                client_info.websocket,
                f"Internal error: {str(e)}"
            )
    
    async def _handle_subscribe(self, client_id: str, data: Dict[str, Any]) -> None:
        """Handle subscription request"""
        channels = data.get("channels", [])
        
        if not channels:
            channels = list(self._subscription_channels.keys())
        
        async with self._lock:
            client_info = self._clients.get(client_id)
            if not client_info:
                return
            
            subscribed = []
            for channel in channels:
                if channel in self._subscription_channels:
                    self._subscription_channels[channel].add(client_id)
                    client_info.subscriptions.add(channel)
                    subscribed.append(channel)
        
        await self._send_message(client_info.websocket, {
            "type": MessageType.SUBSCRIBED,
            "data": {
                "channels": subscribed,
                "subscribed_at": datetime.utcnow().isoformat(),
            }
        })
        
        logger.info(f"Client {client_id} subscribed to: {subscribed}")
    
    async def _handle_unsubscribe(self, client_id: str, data: Dict[str, Any]) -> None:
        """Handle unsubscription request"""
        channels = data.get("channels", [])
        
        async with self._lock:
            client_info = self._clients.get(client_id)
            if not client_info:
                return
            
            unsubscribed = []
            for channel in channels:
                if channel in self._subscription_channels:
                    self._subscription_channels[channel].discard(client_id)
                    client_info.subscriptions.discard(channel)
                    unsubscribed.append(channel)
            
            # If no channels specified, unsubscribe from all
            if not channels:
                for channel in list(client_info.subscriptions):
                    self._subscription_channels[channel].discard(client_id)
                    unsubscribed.append(channel)
                client_info.subscriptions.clear()
        
        await self._send_message(client_info.websocket, {
            "type": MessageType.UNSUBSCRIBED,
            "data": {
                "channels": unsubscribed,
            }
        })
        
        logger.info(f"Client {client_id} unsubscribed from: {unsubscribed}")
    
    async def _handle_get_status(self, client_id: str) -> None:
        """Handle status request"""
        async with self._lock:
            client_info = self._clients.get(client_id)
            if not client_info:
                return
            
            status_data = {
                "client": client_info.to_dict(),
                "server": {
                    "total_clients": len(self._clients),
                    "channel_subscribers": {
                        channel: len(subscribers)
                        for channel, subscribers in self._subscription_channels.items()
                    },
                    "uptime": time.time() - min(
                        (c.connected_at for c in self._clients.values()),
                        default=time.time()
                    ),
                }
            }
        
        await self._send_message(client_info.websocket, {
            "type": MessageType.STATUS,
            "data": status_data
        })
    
    async def _handle_prediction_request(self, client_id: str, data: Dict[str, Any]) -> None:
        """Handle on-demand prediction request"""
        async with self._lock:
            client_info = self._clients.get(client_id)
            if not client_info:
                return
        
        prediction_type = data.get("prediction_type", "price")
        features = data.get("features", [])
        
        try:
            prediction = await self._generate_prediction(prediction_type, features)
            
            await self._send_message(client_info.websocket, {
                "type": MessageType.PREDICTION,
                "data": {
                    "prediction_type": prediction_type,
                    "prediction": prediction,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            })
        except Exception as e:
            logger.error(f"Error generating prediction: {e}")
            await self._send_error(client_info.websocket, f"Prediction failed: {str(e)}")
    
    async def _handle_ping(self, client_id: str) -> None:
        """Handle ping request with pong response"""
        async with self._lock:
            client_info = self._clients.get(client_id)
            if not client_info:
                return
        
        await self._send_message(client_info.websocket, {
            "type": MessageType.PONG,
            "data": {
                "timestamp": datetime.utcnow().isoformat(),
            }
        })
    
    async def _generate_prediction(self, prediction_type: str, features: List[Any]) -> Dict[str, Any]:
        """
        Generate a prediction using the ML models.
        
        Args:
            prediction_type: Type of prediction (price, signal, regime)
            features: Input features for prediction
            
        Returns:
            Prediction result dictionary
        """
        # Import models from main module
        try:
            from main import models
        except ImportError:
            # Fallback for testing
            models = {}
        
        import numpy as np
        
        if prediction_type == "price":
            model = models.get("price_predictor")
            if model and features:
                X = np.array(features)
                if len(X.shape) == 2:
                    X = X.reshape(1, X.shape[0], X.shape[1])
                predictions = model.predict(X)
                return {
                    "predictions": predictions.tolist() if hasattr(predictions, 'tolist') else predictions,
                    "horizons": ["1m", "5m", "15m", "1h"],
                }
            else:
                # Return mock prediction for demo
                return {
                    "predictions": [[0.001, 0.002, 0.0015, 0.003]],
                    "horizons": ["1m", "5m", "15m", "1h"],
                    "confidence": 0.75,
                    "note": "Demo prediction - model not loaded or no features provided",
                }
        
        elif prediction_type == "signal":
            model = models.get("signal_classifier")
            if model and features:
                X = np.array(features)
                signals = model.predict_signal(X)
                return {"signals": signals}
            else:
                return {
                    "signal": "HOLD",
                    "confidence": 0.65,
                    "probabilities": {"BUY": 0.25, "SELL": 0.10, "HOLD": 0.65},
                    "note": "Demo prediction - model not loaded or no features provided",
                }
        
        elif prediction_type == "regime":
            model = models.get("regime_detector")
            if model and features:
                X = np.array(features)
                regime_info = model.detect_current_regime(X)
                return regime_info
            else:
                return {
                    "regime": "SIDEWAYS",
                    "regime_id": 2,
                    "confidence": 0.70,
                    "probabilities": {"BULL": 0.20, "BEAR": 0.10, "SIDEWAYS": 0.70},
                    "note": "Demo prediction - model not loaded or no features provided",
                }
        
        else:
            return {
                "error": f"Unknown prediction type: {prediction_type}",
                "available_types": ["price", "signal", "regime"],
            }
    
    async def broadcast_prediction(self, channel: str, prediction: Dict[str, Any]) -> None:
        """
        Broadcast a prediction to all subscribed clients.
        
        Args:
            channel: The subscription channel to broadcast to
            prediction: The prediction data to broadcast
        """
        message = {
            "type": MessageType.PREDICTION,
            "data": {
                "channel": channel,
                "prediction": prediction,
                "timestamp": datetime.utcnow().isoformat(),
            }
        }
        
        async with self._lock:
            subscriber_ids = self._subscription_channels.get(channel, set()).copy()
        
        # Send to all subscribers
        disconnected = []
        for client_id in subscriber_ids:
            async with self._lock:
                client_info = self._clients.get(client_id)
            
            if client_info:
                try:
                    await self._send_message(client_info.websocket, message)
                except Exception as e:
                    logger.warning(f"Failed to send to {client_id}: {e}")
                    disconnected.append(client_id)
        
        # Cleanup disconnected clients
        for client_id in disconnected:
            await self.disconnect(client_id)
    
    async def _send_message(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
        """
        Send a JSON message through the WebSocket.
        
        Args:
            websocket: The WebSocket to send through
            message: The message dictionary to send
        """
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending message: {e}")
            raise
    
    async def _send_error(self, websocket: WebSocket, error_message: str) -> None:
        """Send an error message to a client"""
        await self._send_message(websocket, {
            "type": MessageType.ERROR,
            "data": {
                "error": error_message,
                "timestamp": datetime.utcnow().isoformat(),
            }
        })
    
    async def _heartbeat_loop(self) -> None:
        """Background task for sending heartbeats and checking client health"""
        while self._running:
            try:
                await asyncio.sleep(self._heartbeat_interval)
                
                async with self._lock:
                    current_time = time.time()
                    stale_clients = []
                    
                    for client_id, client_info in self._clients.items():
                        # Check if client is stale (no activity for 2x heartbeat interval)
                        if current_time - client_info.last_activity > 2 * self._heartbeat_interval:
                            stale_clients.append(client_id)
                            continue
                        
                        # Send heartbeat
                        try:
                            await self._send_message(client_info.websocket, {
                                "type": MessageType.HEARTBEAT,
                                "data": {
                                    "timestamp": datetime.utcnow().isoformat(),
                                }
                            })
                        except Exception:
                            stale_clients.append(client_id)
                    
                    # Remove stale clients
                    for client_id in stale_clients:
                        self._clients.pop(client_id, None)
                        for channel in self._subscription_channels.values():
                            channel.discard(client_id)
                        logger.info(f"Removed stale client: {client_id}")
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")
    
    async def _prediction_broadcast_loop(self) -> None:
        """Background task for periodically broadcasting predictions"""
        while self._running:
            try:
                await asyncio.sleep(60.0)  # Broadcast every 60 seconds
                
                # Generate and broadcast predictions for each channel
                for channel in self._subscription_channels:
                    async with self._lock:
                        has_subscribers = len(self._subscription_channels[channel]) > 0
                    
                    if has_subscribers:
                        prediction_type = channel.replace("_predictions", "")
                        prediction = await self._generate_prediction(prediction_type, [])
                        await self.broadcast_prediction(channel, prediction)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in prediction broadcast loop: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get connection manager statistics"""
        return {
            "total_clients": len(self._clients),
            "clients": [c.to_dict() for c in self._clients.values()],
            "channel_subscribers": {
                channel: len(subscribers)
                for channel, subscribers in self._subscription_channels.items()
            },
            "running": self._running,
        }


# Global connection manager instance
connection_manager = ConnectionManager()


# Create router for WebSocket endpoints
router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for real-time ML predictions.
    
    Message Types (Client -> Server):
    - subscribe_predictions: Subscribe to prediction channels
    - unsubscribe: Unsubscribe from channels
    - get_status: Get connection and server status
    - prediction_request: Request an on-demand prediction
    - ping: Ping the server (responds with pong)
    
    Message Types (Server -> Client):
    - prediction: A prediction update
    - status: Status information
    - error: Error message
    - pong: Pong response to ping
    - heartbeat: Periodic heartbeat from server
    - subscribed: Confirmation of subscription
    - unsubscribed: Confirmation of unsubscription
    """
    client_id = await connection_manager.connect(websocket)
    
    try:
        while True:
            # Receive and parse message
            try:
                raw_message = await websocket.receive_text()
                message = json.loads(raw_message)
            except json.JSONDecodeError as e:
                await connection_manager._send_error(
                    websocket,
                    f"Invalid JSON: {str(e)}"
                )
                continue
            
            # Handle the message
            await connection_manager.handle_message(client_id, message)
    
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected normally")
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
    finally:
        await connection_manager.disconnect(client_id)


@router.get("/ws/stats")
async def get_websocket_stats() -> Dict[str, Any]:
    """Get WebSocket connection statistics"""
    return connection_manager.get_stats()
