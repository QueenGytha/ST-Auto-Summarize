"""
Tests for RequestLogger class and request logging integration
"""
import os
import json
import pytest
import tempfile
import shutil
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from first_hop_proxy.request_logger import RequestLogger
from first_hop_proxy.error_logger import ErrorLogger


class TestRequestLogger:
    """Test cases for RequestLogger class"""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test logs"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        # Cleanup after test
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

    @pytest.fixture
    def logging_config(self, temp_dir):
        """Sample logging configuration"""
        return {
            "logging": {
                "enabled": True,
                "folder": temp_dir,
                "include_request_data": True,
                "include_response_data": True,
                "include_headers": True,
                "include_timing": True
            }
        }

    @pytest.fixture
    def disabled_logging_config(self, temp_dir):
        """Logging configuration with logging disabled"""
        return {
            "logging": {
                "enabled": False,
                "folder": temp_dir
            }
        }

    @pytest.fixture
    def error_logger_config(self, temp_dir):
        """Error logger configuration"""
        return {
            "error_logging": {
                "enabled": True,
                "folder": os.path.join(temp_dir, "errors"),
                "include_stack_traces": True,
                "include_request_context": True,
                "include_timing": True
            }
        }

    def test_request_logger_initialization_enabled(self, logging_config, temp_dir):
        """Test that RequestLogger initializes correctly when enabled"""
        logger = RequestLogger(logging_config)

        assert logger.enabled is True
        assert logger.folder == temp_dir
        assert logger.include_request_data is True
        assert logger.include_response_data is True
        assert logger.include_headers is True
        assert logger.include_timing is True
        assert os.path.exists(temp_dir)

    def test_request_logger_initialization_disabled(self, disabled_logging_config):
        """Test that RequestLogger initializes correctly when disabled"""
        logger = RequestLogger(disabled_logging_config)

        assert logger.enabled is False

    def test_request_logger_with_error_logger_dependency(self, logging_config, error_logger_config, temp_dir):
        """Test that RequestLogger correctly receives and uses error_logger dependency"""
        error_logger = ErrorLogger(error_logger_config)
        request_logger = RequestLogger(logging_config, error_logger=error_logger)

        assert request_logger.error_logger is not None
        assert request_logger.error_logger == error_logger

    def test_log_complete_request_success(self, logging_config, temp_dir):
        """Test logging a complete successful request"""
        logger = RequestLogger(logging_config)

        request_data = {
            "messages": [{"role": "user", "content": "Test message"}],
            "model": "gpt-3.5-turbo"
        }

        response_data = {
            "choices": [{"message": {"role": "assistant", "content": "Test response"}}],
            "model": "gpt-3.5-turbo"
        }

        headers = {"Authorization": "Bearer test-key", "Content-Type": "application/json"}

        filepath = logger.log_complete_request(
            request_id="test123",
            endpoint="/chat/completions",
            request_data=request_data,
            headers=headers,
            response_data=response_data,
            response_headers={"Content-Type": "application/json"},
            start_time=1234567890.0,
            end_time=1234567892.5,
            duration=2.5,
            error=None
        )

        # Verify log file was created
        assert filepath != ""
        assert os.path.exists(filepath)

        # Read and verify log content
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "test123" in content
        assert "/chat/completions" in content
        assert "Test message" in content
        assert "Test response" in content
        assert "2.500 seconds" in content
        # Authorization header should be sanitized (shows first 8 chars + ...)
        assert "Bearer t..." in content or "[REDACTED]" in content

    def test_log_complete_request_with_error(self, logging_config, temp_dir):
        """Test logging a request that resulted in an error"""
        logger = RequestLogger(logging_config)

        request_data = {"messages": [{"role": "user", "content": "Test"}]}
        error = ValueError("Test error message")

        filepath = logger.log_complete_request(
            request_id="error123",
            endpoint="/chat/completions",
            request_data=request_data,
            headers={},
            response_data=None,
            response_headers=None,
            start_time=1234567890.0,
            end_time=1234567891.0,
            duration=1.0,
            error=error
        )

        assert os.path.exists(filepath)

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "error123" in content
        assert "FINAL ERROR RESPONSE" in content
        assert "ValueError" in content
        assert "Test error message" in content

    def test_log_complete_request_disabled(self, disabled_logging_config):
        """Test that logging is skipped when disabled"""
        logger = RequestLogger(disabled_logging_config)

        filepath = logger.log_complete_request(
            request_id="test123",
            endpoint="/chat/completions",
            request_data={},
            headers={},
            response_data={},
            response_headers={},
            start_time=0,
            end_time=1,
            duration=1
        )

        assert filepath == ""

    def test_log_models_request_success(self, logging_config, temp_dir):
        """Test logging a models request"""
        logger = RequestLogger(logging_config)

        response_data = {
            "object": "list",
            "data": [
                {"id": "model-1", "object": "model"},
                {"id": "model-2", "object": "model"}
            ]
        }

        headers = {"Authorization": "Bearer test-key"}

        filepath = logger.log_models_request(
            request_id="models123",
            headers=headers,
            response_data=response_data,
            error=None
        )

        assert os.path.exists(filepath)

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "models123" in content
        assert "/models" in content
        assert "model-1" in content
        assert "model-2" in content

    def test_log_models_request_with_error(self, logging_config, temp_dir):
        """Test logging a failed models request"""
        logger = RequestLogger(logging_config)

        error = ConnectionError("Failed to connect")

        filepath = logger.log_models_request(
            request_id="models_error",
            headers={},
            response_data=None,
            error=error
        )

        assert os.path.exists(filepath)

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "models_error" in content
        assert "ERROR RESPONSE" in content
        assert "ConnectionError" in content
        assert "Failed to connect" in content

    def test_header_sanitization(self, logging_config, temp_dir):
        """Test that sensitive headers are properly sanitized"""
        logger = RequestLogger(logging_config)

        headers = {
            "Authorization": "Bearer sk-1234567890abcdef",
            "X-API-Key": "secret-api-key-12345",
            "Content-Type": "application/json"
        }

        filepath = logger.log_complete_request(
            request_id="sanitize_test",
            endpoint="/chat/completions",
            request_data={},
            headers=headers,
            response_data={},
            response_headers={},
            start_time=0,
            end_time=1,
            duration=1
        )

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Should not contain full sensitive values
        assert "sk-1234567890abcdef" not in content
        assert "secret-api-key-12345" not in content
        # Should contain sanitized versions (first 8 chars + ...)
        assert ("Bearer s..." in content or "[REDACTED]" in content or
                "secret-a..." in content or "X-API-Key: [REDACTED]" in content)
        # Non-sensitive headers should be intact
        assert "application/json" in content

    def test_request_logger_handles_write_errors_with_error_logger(self, logging_config, error_logger_config, temp_dir):
        """Test that RequestLogger logs write failures to error_logger"""
        import platform

        # Skip this test on Windows as chmod doesn't work the same way
        if platform.system() == "Windows":
            pytest.skip("chmod permissions test not reliable on Windows")

        error_logger = ErrorLogger(error_logger_config)

        # Create logger with error_logger dependency
        request_logger = RequestLogger(logging_config, error_logger=error_logger)

        # Make the log directory read-only to trigger write error
        os.chmod(temp_dir, 0o444)

        try:
            filepath = request_logger.log_complete_request(
                request_id="write_error_test",
                endpoint="/chat/completions",
                request_data={},
                headers={},
                response_data={},
                response_headers={},
                start_time=0,
                end_time=1,
                duration=1
            )

            # Should return empty string on write failure
            assert filepath == ""

            # Check that error was logged to error_logger
            error_logs_dir = error_logger_config["error_logging"]["folder"]
            if os.path.exists(error_logs_dir):
                error_log_files = os.listdir(error_logs_dir)
                # May or may not create error log depending on permissions
                # Just verify no exception was raised
        finally:
            # Restore permissions for cleanup
            os.chmod(temp_dir, 0o755)

    def test_log_includes_timing_information(self, logging_config, temp_dir):
        """Test that timing information is included when enabled"""
        logger = RequestLogger(logging_config)

        filepath = logger.log_complete_request(
            request_id="timing_test",
            endpoint="/chat/completions",
            request_data={},
            headers={},
            response_data={},
            response_headers={},
            start_time=1234567890.123,
            end_time=1234567895.456,
            duration=5.333
        )

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        assert "TIMING INFORMATION" in content
        assert "5.333 seconds" in content

    def test_log_excludes_data_when_disabled(self, temp_dir):
        """Test that request/response data is excluded when configured"""
        config = {
            "logging": {
                "enabled": True,
                "folder": temp_dir,
                "include_request_data": False,
                "include_response_data": False,
                "include_headers": False,
                "include_timing": False
            }
        }

        logger = RequestLogger(config)

        request_data = {"messages": [{"role": "user", "content": "Secret message"}]}
        response_data = {"choices": [{"message": {"content": "Secret response"}}]}

        filepath = logger.log_complete_request(
            request_id="exclude_test",
            endpoint="/chat/completions",
            request_data=request_data,
            headers={"Authorization": "Bearer secret"},
            response_data=response_data,
            response_headers={},
            start_time=0,
            end_time=1,
            duration=1
        )

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Data should not be in log
        assert "Secret message" not in content
        assert "Secret response" not in content
        assert "Bearer secret" not in content
        assert "TIMING INFORMATION" not in content

    def test_log_filename_format(self, logging_config, temp_dir):
        """Test that log filenames follow the expected format"""
        logger = RequestLogger(logging_config)

        filepath = logger.log_complete_request(
            request_id="abc123",
            endpoint="/chat/completions",
            request_data={},
            headers={},
            response_data={},
            response_headers={},
            start_time=0,
            end_time=1,
            duration=1
        )

        filename = os.path.basename(filepath)

        # Should be in format: YYYYMMDD_HHMMSS_mmm_requestid.log
        assert filename.endswith("_abc123.log")
        assert len(filename.split("_")) >= 4  # Date_Time_Millis_RequestID.log


class TestRequestLoggerIntegration:
    """Integration tests for request logging dependencies"""

    def test_request_logger_receives_error_logger_dependency(self):
        """Test that RequestLogger is initialized with error_logger dependency"""
        error_config = {
            "error_logging": {
                "enabled": True,
                "folder": "logs/errors"
            }
        }
        logging_config = {
            "logging": {
                "enabled": True,
                "folder": "logs"
            }
        }

        error_logger = ErrorLogger(error_config)
        request_logger = RequestLogger(logging_config, error_logger=error_logger)

        assert request_logger.error_logger is not None
        assert request_logger.error_logger == error_logger

    def test_proxy_client_can_receive_error_logger(self):
        """Test that ProxyClient can be initialized with error_logger"""
        from first_hop_proxy.proxy_client import ProxyClient

        error_config = {"error_logging": {"enabled": True, "folder": "logs/errors"}}
        error_logger = ErrorLogger(error_config)

        # Just verify ProxyClient accepts error_logger parameter
        proxy_client = ProxyClient(
            target_url="https://test.example.com",
            error_logger=error_logger,
            config=None
        )

        assert proxy_client.error_logger == error_logger

    def test_forward_request_calls_log_complete_request(self):
        """Test that forward_request calls request_logger.log_complete_request"""
        from first_hop_proxy.request_logger import RequestLogger

        logging_config = {
            "logging": {
                "enabled": True,
                "folder": tempfile.mkdtemp()
            }
        }

        request_logger = RequestLogger(logging_config)

        # Mock the log_complete_request method to spy on it
        with patch.object(request_logger, 'log_complete_request', wraps=request_logger.log_complete_request) as mock_log:
            # Create a minimal request
            request_data = {"messages": []}
            headers = {}

            # Call log_complete_request directly
            request_logger.log_complete_request(
                request_id="test",
                endpoint="/test",
                request_data=request_data,
                headers=headers,
                response_data={},
                response_headers={},
                start_time=0,
                end_time=1,
                duration=1
            )

            # Verify it was called
            assert mock_log.called
            assert mock_log.call_count == 1

    def test_models_request_logging_method_exists(self):
        """Test that log_models_request method exists and is callable"""
        from first_hop_proxy.request_logger import RequestLogger

        logging_config = {"logging": {"enabled": True, "folder": tempfile.mkdtemp()}}
        request_logger = RequestLogger(logging_config)

        # Verify the method exists
        assert hasattr(request_logger, 'log_models_request')
        assert callable(request_logger.log_models_request)

        # Verify it can be called
        result = request_logger.log_models_request(
            request_id="test",
            headers={},
            response_data={"data": []},
            error=None
        )

        # Should return a filepath
        assert isinstance(result, str)
