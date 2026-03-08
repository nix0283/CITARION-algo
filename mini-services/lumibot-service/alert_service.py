"""
Alert Service - Unified Notification System
Supports: Telegram, WebSocket, Email, Webhook
"""

import asyncio
import aiohttp
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from enum import Enum
from dataclasses import dataclass, field
import json
import os

logger = logging.getLogger(__name__)


class AlertSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertType(Enum):
    SIGNAL = "signal"
    ORDER = "order"
    POSITION = "position"
    RISK = "risk"
    SYSTEM = "system"
    PERFORMANCE = "performance"


@dataclass
class Alert:
    """Alert data structure"""
    type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    details: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    source: str = "lumibot-service"
    strategy_id: Optional[str] = None
    bot_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'type': self.type.value,
            'severity': self.severity.value,
            'title': self.title,
            'message': self.message,
            'details': self.details,
            'timestamp': self.timestamp,
            'source': self.source,
            'strategy_id': self.strategy_id,
            'bot_id': self.bot_id
        }
    
    def to_telegram_message(self) -> str:
        """Format alert for Telegram"""
        severity_emoji = {
            AlertSeverity.INFO: "ℹ️",
            AlertSeverity.WARNING: "⚠️",
            AlertSeverity.ERROR: "❌",
            AlertSeverity.CRITICAL: "🚨"
        }
        
        emoji = severity_emoji.get(self.severity, "📢")
        
        msg = f"{emoji} *{self.title}*\n\n"
        msg += f"{self.message}\n\n"
        
        if self.details:
            msg += "📊 *Details:*\n"
            for key, value in self.details.items():
                msg += f"• {key}: `{value}`\n"
        
        msg += f"\n🕐 {self.timestamp}"
        
        if self.strategy_id:
            msg += f"\n🤖 Strategy: `{self.strategy_id}`"
        
        return msg


class TelegramNotifier:
    """Telegram notification handler"""
    
    def __init__(self, bot_token: str = None, chat_id: str = None):
        self.bot_token = bot_token or os.getenv('TELEGRAM_BOT_TOKEN', '')
        self.chat_id = chat_id or os.getenv('TELEGRAM_CHAT_ID', '')
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}" if self.bot_token else None
        
    async def send_message(self, alert: Alert) -> bool:
        """Send alert to Telegram"""
        if not self.bot_token or not self.chat_id:
            logger.warning("Telegram not configured")
            return False
        
        url = f"{self.base_url}/sendMessage"
        payload = {
            'chat_id': self.chat_id,
            'text': alert.to_telegram_message(),
            'parse_mode': 'Markdown'
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, timeout=10) as resp:
                    if resp.status == 200:
                        logger.info(f"Telegram alert sent: {alert.title}")
                        return True
                    else:
                        error = await resp.text()
                        logger.error(f"Telegram error: {error}")
                        return False
        except Exception as e:
            logger.error(f"Telegram send failed: {e}")
            return False
    
    def send_sync(self, alert: Alert) -> bool:
        """Synchronous send"""
        import requests
        
        if not self.bot_token or not self.chat_id:
            return False
        
        url = f"{self.base_url}/sendMessage"
        payload = {
            'chat_id': self.chat_id,
            'text': alert.to_telegram_message(),
            'parse_mode': 'Markdown'
        }
        
        try:
            resp = requests.post(url, json=payload, timeout=10)
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Telegram sync send failed: {e}")
            return False


class WebSocketNotifier:
    """WebSocket notification handler for real-time alerts"""
    
    def __init__(self, port: int = 3008):
        self.port = port
        self.clients = set()
        self.server = None
        self._running = False
        
    async def start_server(self):
        """Start WebSocket server"""
        import websockets
        
        async def handler(websocket, path):
            self.clients.add(websocket)
            logger.info(f"WebSocket client connected: {websocket.remote_address}")
            try:
                async for message in websocket:
                    # Handle incoming messages if needed
                    pass
            except websockets.exceptions.ConnectionClosed:
                pass
            finally:
                self.clients.discard(websocket)
        
        self.server = await websockets.serve(handler, "0.0.0.0", self.port)
        self._running = True
        logger.info(f"WebSocket alert server started on port {self.port}")
    
    async def broadcast(self, alert: Alert):
        """Broadcast alert to all connected clients"""
        if not self.clients:
            return
        
        message = json.dumps(alert.to_dict())
        
        disconnected = set()
        for client in self.clients:
            try:
                await client.send(message)
            except Exception:
                disconnected.add(client)
        
        self.clients -= disconnected
        logger.info(f"Broadcast alert to {len(self.clients)} clients")
    
    async def stop_server(self):
        """Stop WebSocket server"""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        self._running = False


class EmailNotifier:
    """Email notification handler"""
    
    def __init__(self, smtp_server: str = None, smtp_port: int = 587,
                 smtp_user: str = None, smtp_password: str = None,
                 from_addr: str = None, to_addrs: List[str] = None):
        self.smtp_server = smtp_server or os.getenv('SMTP_SERVER', '')
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user or os.getenv('SMTP_USER', '')
        self.smtp_password = smtp_password or os.getenv('SMTP_PASSWORD', '')
        self.from_addr = from_addr or self.smtp_user
        self.to_addrs = to_addrs or []
        
    def send(self, alert: Alert) -> bool:
        """Send email alert"""
        if not self.smtp_server or not self.to_addrs:
            return False
        
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            msg = MIMEMultipart()
            msg['From'] = self.from_addr
            msg['To'] = ', '.join(self.to_addrs)
            msg['Subject'] = f"[{alert.severity.value.upper()}] {alert.title}"
            
            body = f"""
Alert Type: {alert.type.value}
Severity: {alert.severity.value}
Source: {alert.source}
Time: {alert.timestamp}

Message:
{alert.message}

Details:
{json.dumps(alert.details, indent=2)}
            """
            
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email sent: {alert.title}")
            return True
            
        except Exception as e:
            logger.error(f"Email send failed: {e}")
            return False


class WebhookNotifier:
    """Webhook notification handler"""
    
    def __init__(self, webhook_urls: List[str] = None):
        self.webhook_urls = webhook_urls or []
        
    async def send(self, alert: Alert):
        """Send alert to all webhooks"""
        if not self.webhook_urls:
            return
        
        payload = alert.to_dict()
        
        async with aiohttp.ClientSession() as session:
            for url in self.webhook_urls:
                try:
                    async with session.post(url, json=payload, timeout=5) as resp:
                        if resp.status == 200:
                            logger.info(f"Webhook sent to {url}")
                        else:
                            logger.warning(f"Webhook failed: {url} - {resp.status}")
                except Exception as e:
                    logger.error(f"Webhook error {url}: {e}")


class AlertService:
    """Unified Alert Service"""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.alert_history = []
        self.max_history = 1000
        
        # Initialize notifiers
        self.telegram = TelegramNotifier(
            bot_token=self.config.get('telegram_token'),
            chat_id=self.config.get('telegram_chat_id')
        )
        
        self.websocket = WebSocketNotifier(
            port=self.config.get('websocket_port', 3008)
        )
        
        self.email = EmailNotifier(
            smtp_server=self.config.get('smtp_server'),
            smtp_port=self.config.get('smtp_port', 587),
            smtp_user=self.config.get('smtp_user'),
            smtp_password=self.config.get('smtp_password'),
            to_addrs=self.config.get('email_recipients', [])
        )
        
        self.webhook = WebhookNotifier(
            webhook_urls=self.config.get('webhook_urls', [])
        )
        
        # Filter rules
        self.min_severity = AlertSeverity[self.config.get('min_severity', 'INFO')]
        self.enabled_types = [AlertType[t] for t in self.config.get('enabled_types', ['SIGNAL', 'RISK', 'ORDER'])]
    
    async def start(self):
        """Start alert service"""
        await self.websocket.start_server()
        logger.info("Alert Service started")
    
    async def stop(self):
        """Stop alert service"""
        await self.websocket.stop_server()
        logger.info("Alert Service stopped")
    
    def alert(self, alert: Alert):
        """Send alert through all channels"""
        # Check filters
        if alert.severity.value < self.min_severity.value:
            return
        
        if alert.type not in self.enabled_types:
            return
        
        # Store in history
        self.alert_history.append(alert.to_dict())
        if len(self.alert_history) > self.max_history:
            self.alert_history = self.alert_history[-self.max_history:]
        
        # Send notifications
        self._dispatch(alert)
    
    def _dispatch(self, alert: Alert):
        """Dispatch alert to all channels"""
        # Telegram
        if self.telegram.bot_token:
            self.telegram.send_sync(alert)
        
        # WebSocket
        asyncio.create_task(self.websocket.broadcast(alert))
        
        # Email for critical alerts
        if alert.severity == AlertSeverity.CRITICAL:
            self.email.send(alert)
        
        # Webhooks
        asyncio.create_task(self.webhook.send(alert))
    
    # Convenience methods
    def signal(self, strategy_id: str, message: str, details: Dict = None):
        """Send trading signal alert"""
        self.alert(Alert(
            type=AlertType.SIGNAL,
            severity=AlertSeverity.INFO,
            title=f"Trading Signal: {strategy_id}",
            message=message,
            details=details or {},
            strategy_id=strategy_id
        ))
    
    def order(self, bot_id: str, order_details: Dict):
        """Send order alert"""
        severity = AlertSeverity.INFO
        if order_details.get('status') == 'rejected':
            severity = AlertSeverity.ERROR
        elif order_details.get('status') == 'filled':
            severity = AlertSeverity.INFO
        
        self.alert(Alert(
            type=AlertType.ORDER,
            severity=severity,
            title=f"Order Update: {order_details.get('symbol', 'Unknown')}",
            message=f"Order {order_details.get('id', '')} {order_details.get('status', '')}",
            details=order_details,
            bot_id=bot_id
        ))
    
    def risk(self, severity: AlertSeverity, message: str, details: Dict = None):
        """Send risk alert"""
        self.alert(Alert(
            type=AlertType.RISK,
            severity=severity,
            title="Risk Alert",
            message=message,
            details=details or {}
        ))
    
    def system(self, severity: AlertSeverity, message: str, details: Dict = None):
        """Send system alert"""
        self.alert(Alert(
            type=AlertType.SYSTEM,
            severity=severity,
            title="System Alert",
            message=message,
            details=details or {}
        ))
    
    def get_history(self, limit: int = 100, alert_type: str = None) -> List[Dict]:
        """Get alert history"""
        history = self.alert_history
        if alert_type:
            history = [a for a in history if a['type'] == alert_type]
        return history[-limit:]
