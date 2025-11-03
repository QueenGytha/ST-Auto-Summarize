import pytest
import os
import sys
from unittest.mock import patch

# Add src directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src'))

@pytest.fixture(autouse=True)
def test_environment():
    """Automatically apply test environment overrides to prevent freezing"""
    # Set test-specific environment variables
    os.environ['TEST_MODE'] = 'true'
    os.environ['MAX_RETRIES'] = '1'
    os.environ['BASE_DELAY'] = '0.1'
    os.environ['MAX_DELAY'] = '1.0'
    os.environ['CONDITIONAL_RETRY_ENABLED'] = 'false'
    
    # Mock time.sleep to prevent actual delays during tests
    with patch('time.sleep') as mock_sleep:
        # Make sleep return immediately instead of actually sleeping
        mock_sleep.return_value = None
        yield mock_sleep

@pytest.fixture(autouse=True)
def mock_network_calls():
    """Automatically mock network calls to prevent real requests during tests"""
    with patch('requests.Session.request') as mock_request:
        # Return a mock response that won't trigger retries
        mock_response = type('MockResponse', (), {
            'status_code': 200,
            'text': '{"status": "ok"}',
            'json': lambda: {"status": "ok"},
            'headers': {},
            'raise_for_status': lambda: None
        })()
        mock_request.return_value = mock_response
        yield mock_request

@pytest.fixture(autouse=True)
def fast_retry_settings():
    """Override retry settings for fast test execution"""
    with patch('first_hop_proxy.error_handler.ErrorHandler') as mock_error_handler:
        # Configure mock error handler with fast settings
        mock_instance = mock_error_handler.return_value
        mock_instance.max_retries = 1
        mock_instance.base_delay = 0.1
        mock_instance.max_delay = 1.0
        mock_instance.conditional_retry_enabled = False
        yield mock_instance
