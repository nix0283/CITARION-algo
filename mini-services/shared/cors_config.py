"""
CORS Configuration Module for CITARION Microservices

This module provides secure CORS configuration for all Python microservices.
It reads allowed origins from environment variables and provides validation
to prevent security issues in production environments.

Security Considerations:
- Using allow_origins=["*"] with allow_credentials=True is a security risk
- In production, allowed origins MUST be explicitly set
- Wildcard origins in production will trigger warnings

Environment Variables:
- ALLOWED_ORIGINS: Comma-separated list of allowed origins
  Example: ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
- ENVIRONMENT: Current environment (development, staging, production)
  Default: development

Usage:
    from shared.cors_config import get_cors_config

    app.add_middleware(
        CORSMiddleware,
        **get_cors_config()
    )
"""

import os
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class CORSSecurityError(Exception):
    """Raised when CORS configuration is insecure in production."""
    pass


def _parse_origins(origins_str: str) -> List[str]:
    """
    Parse comma-separated origins string into a list.

    Args:
        origins_str: Comma-separated string of origins

    Returns:
        List of origin strings, stripped of whitespace
    """
    origins = [origin.strip() for origin in origins_str.split(",")]
    return [origin for origin in origins if origin]  # Remove empty strings


def _is_production_environment() -> bool:
    """
    Check if running in production environment.

    Returns:
        True if ENVIRONMENT is 'production' or 'staging'
    """
    env = os.getenv("ENVIRONMENT", "development").lower()
    return env in ("production", "prod", "staging")


def _validate_origin_format(origin: str) -> bool:
    """
    Validate that an origin has proper format.

    Args:
        origin: Origin URL to validate

    Returns:
        True if origin format is valid
    """
    if origin == "*":
        return True  # Wildcard is valid but needs special handling

    # Check for proper URL format (scheme://host[:port])
    valid_schemes = ("http://", "https://")
    return any(origin.startswith(scheme) for scheme in valid_schemes)


def get_cors_config(
    allow_credentials: bool = True,
    allow_methods: List[str] = None,
    allow_headers: List[str] = None,
) -> Dict[str, Any]:
    """
    Get secure CORS configuration for FastAPI applications.

    This function reads the ALLOWED_ORIGINS environment variable and returns
    a dictionary suitable for use with FastAPI's CORSMiddleware.

    In development mode, defaults to localhost:3000 if no origins are set.
    In production, requires explicit configuration or raises a warning.

    Args:
        allow_credentials: Whether to allow credentials (cookies, auth headers)
        allow_methods: List of allowed HTTP methods. Defaults to all methods.
        allow_headers: List of allowed headers. Defaults to all headers.

    Returns:
        Dictionary with CORS middleware configuration:
        - allow_origins: List of allowed origins
        - allow_credentials: Boolean for credentials
        - allow_methods: List of methods or ["*"]
        - allow_headers: List of headers or ["*"]

    Raises:
        CORSSecurityError: If wildcard is used with credentials in production

    Example:
        >>> app.add_middleware(CORSMiddleware, **get_cors_config())
    """
    # Default allowed methods and headers
    if allow_methods is None:
        allow_methods = ["*"]
    if allow_headers is None:
        allow_headers = ["*"]

    # Get allowed origins from environment
    allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
    is_production = _is_production_environment()

    # Parse or set defaults
    if allowed_origins_str:
        allowed_origins = _parse_origins(allowed_origins_str)
    else:
        if is_production:
            # In production, require explicit configuration
            logger.error(
                "SECURITY WARNING: ALLOWED_ORIGINS not set in production environment. "
                "This is a security risk. Please set ALLOWED_ORIGINS environment variable."
            )
            # Use empty list to block all cross-origin requests
            allowed_origins = []
        else:
            # In development, default to localhost
            allowed_origins = ["http://localhost:3000"]
            logger.info(
                "ALLOWED_ORIGINS not set. Using default development origins: %s",
                allowed_origins
            )

    # Validate origins
    for origin in allowed_origins:
        if not _validate_origin_format(origin):
            logger.warning(
                "Invalid origin format: '%s'. Origins should start with http:// or https://",
                origin
            )

    # Security check: wildcard with credentials
    if "*" in allowed_origins and allow_credentials:
        if is_production:
            # This is a critical security issue in production
            error_msg = (
                "SECURITY ERROR: Using wildcard origin ('*') with credentials enabled "
                "in production is not allowed. This configuration allows any website "
                "to make credentialed requests to your API. "
                "Please set ALLOWED_ORIGINS to specific domains."
            )
            logger.critical(error_msg)
            raise CORSSecurityError(error_msg)
        else:
            # Warn in development but allow it
            logger.warning(
                "SECURITY WARNING: Using wildcard origin ('*') with credentials enabled. "
                "This is insecure and will cause an error in production. "
                "Please set ALLOWED_ORIGINS environment variable."
            )

    # Log configuration
    if is_production:
        logger.info(
            "CORS configuration loaded for production: origins=%s, credentials=%s",
            allowed_origins if "*" not in allowed_origins else "[WILDCARD - INSECURE]",
            allow_credentials
        )
    else:
        logger.info(
            "CORS configuration loaded for development: origins=%s, credentials=%s",
            allowed_origins,
            allow_credentials
        )

    return {
        "allow_origins": allowed_origins,
        "allow_credentials": allow_credentials,
        "allow_methods": allow_methods,
        "allow_headers": allow_headers,
    }


def get_cors_origins() -> List[str]:
    """
    Get list of allowed CORS origins without full config.

    Useful for logging or debugging purposes.

    Returns:
        List of allowed origin strings
    """
    allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")

    if allowed_origins_str:
        return _parse_origins(allowed_origins_str)
    elif _is_production_environment():
        return []
    else:
        return ["http://localhost:3000"]


def validate_cors_security() -> bool:
    """
    Validate CORS configuration security without applying it.

    Use this function to check CORS security during startup checks.

    Returns:
        True if CORS configuration is secure, False otherwise
    """
    allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
    is_production = _is_production_environment()

    # Check for missing configuration in production
    if not allowed_origins_str and is_production:
        logger.error("CORS security check failed: No ALLOWED_ORIGINS set in production")
        return False

    # Check for wildcard in production
    if allowed_origins_str == "*" and is_production:
        logger.error("CORS security check failed: Wildcard origin in production")
        return False

    return True
