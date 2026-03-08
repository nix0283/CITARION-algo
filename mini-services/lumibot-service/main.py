"""
Lumibot Service - Institutional Trading Strategies
Main entry point for the service
"""

import os
import sys
import logging
import yaml
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api import create_api_app
from strategy_manager import StrategyManager
from orchestrator import BotOrchestrator, EventBus

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def load_config() -> dict:
    """Load configuration from YAML file"""
    config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.yaml')
    
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
    else:
        # Default configuration
        config = {
            'service': {
                'name': 'lumibot-service',
                'port': 3007,
                'host': '0.0.0.0'
            },
            'exchanges': {
                'binance': {
                    'api_key': os.getenv('BINANCE_API_KEY', ''),
                    'api_secret': os.getenv('BINANCE_API_SECRET', ''),
                    'sandbox': True
                }
            },
            'strategies': {
                'mft': {'enabled': True, 'symbols': ['BTC/USDT']},
                'spectrum': {'enabled': True, 'pairs': [['BTC/USDT', 'ETH/USDT']]},
                'reed': {'enabled': True, 'universe': ['BTC/USDT', 'ETH/USDT']},
                'architect': {'enabled': True, 'symbols': ['BTC/USDT']},
                'equilibrist': {'enabled': True, 'symbols': ['BTC/USDT']},
                'kron': {'enabled': True, 'symbols': ['BTC/USDT']}
            },
            'risk': {
                'max_position_size': 1.0,
                'max_daily_loss': 0.05,
                'max_drawdown': 0.1,
                'leverage_limit': 3
            }
        }
    
    # Expand environment variables in config
    def expand_env_vars(obj):
        if isinstance(obj, dict):
            return {k: expand_env_vars(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [expand_env_vars(item) for item in obj]
        elif isinstance(obj, str) and obj.startswith('${') and obj.endswith('}'):
            env_var = obj[2:-1]
            return os.getenv(env_var, '')
        return obj
    
    return expand_env_vars(config)


def main():
    """Main entry point"""
    # Load configuration
    config = load_config()
    
    # Initialize components
    logger.info("Initializing Lumibot Service...")
    
    # Create event bus
    event_bus = EventBus()
    event_bus.start()
    
    # Create bot orchestrator
    orchestrator = BotOrchestrator(event_bus)
    
    # Create strategy manager
    strategy_manager = StrategyManager(config)
    
    # Create Flask app
    app = create_api_app(strategy_manager, orchestrator)
    
    # Auto-start enabled strategies
    strategies_config = config.get('strategies', {})
    for strategy_id, strategy_config in strategies_config.items():
        if strategy_config.get('enabled', False):
            logger.info(f"Auto-starting strategy: {strategy_id}")
            strategy_manager.start_strategy(strategy_id, strategy_config)
            
            # Register bot with orchestrator
            orchestrator.register_bot(strategy_id, {
                'type': strategy_id,
                'symbols': strategy_config.get('symbols', strategy_config.get('universe', []))
            })
    
    # Start server
    service_config = config.get('service', {})
    port = int(os.getenv('PORT', service_config.get('port', 3007)))
    host = service_config.get('host', '0.0.0.0')
    
    logger.info(f"Starting Lumibot Service on {host}:{port}")
    logger.info(f"Active strategies: {len(strategy_manager.get_active_strategies())}")
    
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                 LUMIBOT SERVICE STARTED                      ║
╠══════════════════════════════════════════════════════════════╣
║  Port: {port:<53} ║
║  Strategies: MFT, Spectrum, Reed, Architect, Equilibrist, Kron
║  Event Bus: Active                                           ║
║  Multi-Exchange: Binance, Bybit, OKX                         ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    # Run Flask app
    app.run(
        host=host,
        port=port,
        debug=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
