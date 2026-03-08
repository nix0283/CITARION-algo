"""
Configuration loader for RL Service
"""

import yaml
import os
from typing import Dict, Any


def load_config() -> Dict[str, Any]:
    """Load configuration from YAML file"""
    config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.yaml')
    
    try:
        with open(config_path, 'r') as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        return {
            "service": {"port": 3007},
            "agents": {},
            "environment": {},
        }
