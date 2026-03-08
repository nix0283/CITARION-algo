"""
API Routes for Lumibot Service
REST API for strategy management and monitoring
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from datetime import datetime
from typing import Dict, Any, List
import threading
import queue

logger = logging.getLogger(__name__)

def create_api_app(strategy_manager, bot_orchestrator):
    """Create Flask API application"""
    app = Flask(__name__)
    CORS(app, origins="*")
    
    @app.route('/health', methods=['GET'])
    def health_check():
        return jsonify({
            'status': 'healthy',
            'service': 'lumibot-service',
            'timestamp': datetime.now().isoformat()
        })
    
    @app.route('/api/status', methods=['GET'])
    def get_status():
        """Get service status"""
        return jsonify({
            'service': 'lumibot-service',
            'version': '1.0.0',
            'strategies': strategy_manager.get_active_strategies(),
            'uptime': strategy_manager.get_uptime(),
            'timestamp': datetime.now().isoformat()
        })
    
    @app.route('/api/strategies', methods=['GET'])
    def list_strategies():
        """List all available strategies"""
        strategies = [
            {
                'id': 'mft',
                'name': 'Selene (MFT)',
                'type': 'VWAP/TWAP Execution',
                'description': 'Multi-fill trading with volume-weighted algorithms',
                'status': strategy_manager.get_strategy_status('mft')
            },
            {
                'id': 'spectrum',
                'name': 'Spectrum (PR)',
                'type': 'Pairs Trading',
                'description': 'Cointegration and Kalman filter-based statistical arbitrage',
                'status': strategy_manager.get_strategy_status('spectrum')
            },
            {
                'id': 'reed',
                'name': 'Reed (STA)',
                'type': 'Statistical Arbitrage',
                'description': 'PCA factor models for identifying mispriced assets',
                'status': strategy_manager.get_strategy_status('reed')
            },
            {
                'id': 'architect',
                'name': 'Architect (MM)',
                'type': 'Market Making',
                'description': 'Avellaneda-Stoikov optimal market making',
                'status': strategy_manager.get_strategy_status('architect')
            },
            {
                'id': 'equilibrist',
                'name': 'Equilibrist (MR)',
                'type': 'Mean Reversion',
                'description': 'Ornstein-Uhlenbeck process mean reversion',
                'status': strategy_manager.get_strategy_status('equilibrist')
            },
            {
                'id': 'kron',
                'name': 'Kron (TRF)',
                'type': 'Trend Following',
                'description': 'Donchian channel breakout trading',
                'status': strategy_manager.get_strategy_status('kron')
            }
        ]
        return jsonify({'strategies': strategies})
    
    @app.route('/api/strategies/<strategy_id>', methods=['GET'])
    def get_strategy(strategy_id):
        """Get strategy details"""
        details = strategy_manager.get_strategy_details(strategy_id)
        if details is None:
            return jsonify({'error': 'Strategy not found'}), 404
        return jsonify(details)
    
    @app.route('/api/strategies/<strategy_id>/start', methods=['POST'])
    def start_strategy(strategy_id):
        """Start a strategy"""
        config = request.json or {}
        result = strategy_manager.start_strategy(strategy_id, config)
        return jsonify(result)
    
    @app.route('/api/strategies/<strategy_id>/stop', methods=['POST'])
    def stop_strategy(strategy_id):
        """Stop a strategy"""
        result = strategy_manager.stop_strategy(strategy_id)
        return jsonify(result)
    
    @app.route('/api/strategies/<strategy_id>/backtest', methods=['POST'])
    def backtest_strategy(strategy_id):
        """Run backtest for a strategy"""
        config = request.json or {}
        result = strategy_manager.run_backtest(strategy_id, config)
        return jsonify(result)
    
    @app.route('/api/orders', methods=['GET'])
    def get_orders():
        """Get all orders"""
        strategy_id = request.args.get('strategy_id')
        orders = strategy_manager.get_orders(strategy_id)
        return jsonify({'orders': orders})
    
    @app.route('/api/positions', methods=['GET'])
    def get_positions():
        """Get all positions"""
        positions = strategy_manager.get_positions()
        return jsonify({'positions': positions})
    
    @app.route('/api/performance', methods=['GET'])
    def get_performance():
        """Get strategy performance metrics"""
        strategy_id = request.args.get('strategy_id')
        metrics = strategy_manager.get_performance(strategy_id)
        return jsonify(metrics)
    
    @app.route('/api/risk/metrics', methods=['GET'])
    def get_risk_metrics():
        """Get risk metrics"""
        metrics = strategy_manager.get_risk_metrics()
        return jsonify(metrics)
    
    # Event Bus Integration
    @app.route('/api/events/subscribe', methods=['POST'])
    def subscribe_to_events():
        """Subscribe to event bus"""
        event_types = request.json.get('event_types', [])
        callback_url = request.json.get('callback_url')
        result = bot_orchestrator.subscribe(event_types, callback_url)
        return jsonify(result)
    
    @app.route('/api/events/publish', methods=['POST'])
    def publish_event():
        """Publish event to bus"""
        event = request.json
        result = bot_orchestrator.publish(event)
        return jsonify(result)
    
    # Multi-exchange endpoints
    @app.route('/api/exchanges', methods=['GET'])
    def list_exchanges():
        """List configured exchanges"""
        exchanges = strategy_manager.get_configured_exchanges()
        return jsonify({'exchanges': exchanges})
    
    @app.route('/api/exchanges/<exchange>/balance', methods=['GET'])
    def get_exchange_balance(exchange):
        """Get balance for specific exchange"""
        balance = strategy_manager.get_exchange_balance(exchange)
        return jsonify(balance)
    
    @app.route('/api/exchanges/<exchange>/ticker/<symbol>', methods=['GET'])
    def get_ticker(exchange, symbol):
        """Get ticker for symbol on exchange"""
        ticker = strategy_manager.get_ticker(exchange, symbol)
        return jsonify(ticker)
    
    return app
