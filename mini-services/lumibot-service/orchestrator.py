"""
Bot Orchestrator for Event Bus Integration
NATS-like pub/sub for bot coordination
"""

import threading
import queue
import logging
from datetime import datetime
from typing import Dict, Any, List, Callable, Optional
from collections import defaultdict
import json
import time

logger = logging.getLogger(__name__)


class EventBus:
    """Simple event bus implementation"""
    
    def __init__(self):
        self.subscribers = defaultdict(list)
        self.event_queue = queue.Queue()
        self.running = False
        self.event_history = []
        self.max_history = 1000
    
    def subscribe(self, event_type: str, callback: Callable):
        """Subscribe to event type"""
        self.subscribers[event_type].append(callback)
        logger.info(f"Subscribed to event type: {event_type}")
    
    def unsubscribe(self, event_type: str, callback: Callable):
        """Unsubscribe from event type"""
        if callback in self.subscribers[event_type]:
            self.subscribers[event_type].remove(callback)
    
    def publish(self, event_type: str, data: Dict[str, Any]):
        """Publish event"""
        event = {
            'type': event_type,
            'data': data,
            'timestamp': datetime.now().isoformat(),
            'id': f"evt_{int(time.time() * 1000000)}"
        }
        
        self.event_queue.put(event)
        self.event_history.append(event)
        
        # Trim history
        if len(self.event_history) > self.max_history:
            self.event_history = self.event_history[-self.max_history:]
        
        logger.debug(f"Published event: {event_type}")
    
    def process_events(self):
        """Process queued events"""
        while not self.event_queue.empty():
            try:
                event = self.event_queue.get_nowait()
                event_type = event['type']
                
                # Notify all subscribers
                for callback in self.subscribers.get(event_type, []):
                    try:
                        callback(event)
                    except Exception as e:
                        logger.error(f"Error in event callback: {e}")
                
                # Also notify wildcard subscribers
                for callback in self.subscribers.get('*', []):
                    try:
                        callback(event)
                    except Exception as e:
                        logger.error(f"Error in wildcard callback: {e}")
                        
            except queue.Empty:
                break
    
    def get_history(self, event_type: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """Get event history"""
        events = self.event_history
        if event_type:
            events = [e for e in events if e['type'] == event_type]
        return events[-limit:]
    
    def start(self):
        """Start event processing thread"""
        self.running = True
        
        def event_loop():
            while self.running:
                self.process_events()
                time.sleep(0.1)
        
        thread = threading.Thread(target=event_loop, daemon=True)
        thread.start()
        logger.info("Event bus started")
    
    def stop(self):
        """Stop event processing"""
        self.running = False
        logger.info("Event bus stopped")


class BotOrchestrator:
    """Orchestrates multiple trading bots via event bus"""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.bots = {}
        self.subscriptions = {}
        self._setup_default_handlers()
    
    def _setup_default_handlers(self):
        """Setup default event handlers"""
        self.event_bus.subscribe('bot.signal', self._handle_signal)
        self.event_bus.subscribe('bot.order', self._handle_order)
        self.event_bus.subscribe('bot.risk', self._handle_risk)
        self.event_bus.subscribe('alert', self._handle_alert)
    
    def register_bot(self, bot_id: str, bot_config: Dict[str, Any]):
        """Register a bot with the orchestrator"""
        self.bots[bot_id] = {
            'config': bot_config,
            'status': 'registered',
            'last_heartbeat': datetime.now().isoformat()
        }
        
        # Subscribe bot to relevant events
        self.event_bus.subscribe(f'bot.{bot_id}.command', lambda e: self._handle_bot_command(bot_id, e))
        
        logger.info(f"Registered bot: {bot_id}")
        self.event_bus.publish('bot.registered', {'bot_id': bot_id})
    
    def unregister_bot(self, bot_id: str):
        """Unregister a bot"""
        if bot_id in self.bots:
            del self.bots[bot_id]
            logger.info(f"Unregistered bot: {bot_id}")
            self.event_bus.publish('bot.unregistered', {'bot_id': bot_id})
    
    def send_command(self, bot_id: str, command: str, params: Dict[str, Any] = None):
        """Send command to specific bot"""
        self.event_bus.publish(f'bot.{bot_id}.command', {
            'command': command,
            'params': params or {}
        })
    
    def broadcast(self, event_type: str, data: Dict[str, Any]):
        """Broadcast event to all subscribers"""
        self.event_bus.publish(event_type, data)
    
    def _handle_signal(self, event: Dict):
        """Handle trading signal event"""
        data = event['data']
        logger.info(f"Signal received: {data.get('strategy')} - {data.get('signal')}")
        
        # Broadcast signal for other bots to potentially act on
        self.event_bus.publish('signal.processed', {
            'original': data,
            'processed_at': datetime.now().isoformat()
        })
    
    def _handle_order(self, event: Dict):
        """Handle order event"""
        data = event['data']
        logger.info(f"Order event: {data.get('bot_id')} - {data.get('status')}")
        
        # Could trigger risk checks, alerts, etc.
        self.event_bus.publish('risk.check', {
            'bot_id': data.get('bot_id'),
            'order': data
        })
    
    def _handle_risk(self, event: Dict):
        """Handle risk event"""
        data = event['data']
        risk_level = data.get('level', 'info')
        
        if risk_level in ['warning', 'critical']:
            logger.warning(f"RISK ALERT: {data}")
            self.event_bus.publish('alert', {
                'type': 'risk',
                'severity': risk_level,
                'message': data.get('message', 'Risk threshold exceeded'),
                'details': data
            })
    
    def _handle_alert(self, event: Dict):
        """Handle alert event"""
        data = event['data']
        logger.info(f"ALERT [{data.get('severity')}]: {data.get('message')}")
        
        # Here you would integrate with Telegram, Email, etc.
        # For now, just log it
    
    def _handle_bot_command(self, bot_id: str, event: Dict):
        """Handle command for specific bot"""
        command = event['data'].get('command')
        params = event['data'].get('params', {})
        
        logger.info(f"Command for {bot_id}: {command}")
        
        if bot_id in self.bots:
            self.bots[bot_id]['last_command'] = {
                'command': command,
                'params': params,
                'received_at': datetime.now().isoformat()
            }
    
    def get_bot_status(self, bot_id: str) -> Optional[Dict]:
        """Get bot status"""
        return self.bots.get(bot_id)
    
    def get_all_bots(self) -> Dict[str, Dict]:
        """Get all registered bots"""
        return self.bots
    
    def subscribe(self, event_types: List[str], callback_url: str = None) -> Dict[str, Any]:
        """Subscribe to events (for external systems)"""
        subscription_id = f"sub_{int(time.time() * 1000)}"
        
        for event_type in event_types:
            self.event_bus.subscribe(event_type, lambda e: self._webhook_callback(callback_url, e))
        
        self.subscriptions[subscription_id] = {
            'event_types': event_types,
            'callback_url': callback_url
        }
        
        return {
            'success': True,
            'subscription_id': subscription_id,
            'event_types': event_types
        }
    
    def publish(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Publish event to bus"""
        event_type = event.get('type', 'custom')
        data = event.get('data', {})
        
        self.event_bus.publish(event_type, data)
        
        return {
            'success': True,
            'event_type': event_type
        }
    
    def _webhook_callback(self, url: str, event: Dict):
        """Send event to webhook URL"""
        if not url:
            return
        
        try:
            import requests
            requests.post(url, json=event, timeout=5)
        except Exception as e:
            logger.error(f"Webhook failed: {e}")
    
    def get_event_history(self, event_type: str = None, limit: int = 100) -> List[Dict]:
        """Get event history"""
        return self.event_bus.get_history(event_type, limit)
