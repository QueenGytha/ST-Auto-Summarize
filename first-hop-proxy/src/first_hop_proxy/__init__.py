"""
First Hop Proxy - A proxy service for handling API requests and responses.

This package provides functionality for proxying requests, handling errors,
logging, and processing responses with regex replacements.
"""

__version__ = "1.0.0"
__author__ = "First Hop Proxy Team"

# Main exports
from .config import Config
from .proxy_client import ProxyClient
from .error_handler import ErrorHandler
from .response_parser import ResponseParser
from .request_logger import RequestLogger
from .error_logger import ErrorLogger
from .utils import sanitize_headers_for_logging, process_messages_with_regex, process_response_with_regex
from .constants import *
from .main import main, app

__all__ = [
    'Config',
    'ProxyClient', 
    'ErrorHandler',
    'ResponseParser',
    'RequestLogger',
    'ErrorLogger',
    'sanitize_headers_for_logging',
    'process_messages_with_regex',
    'process_response_with_regex',
    'main',
    'app',
]
