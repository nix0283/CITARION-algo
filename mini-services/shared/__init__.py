"""
Shared utilities for CITARION microservices.
"""

from .cors_config import get_cors_config, CORSSecurityError

__all__ = ["get_cors_config", "CORSSecurityError"]
