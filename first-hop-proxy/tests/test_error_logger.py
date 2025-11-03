import pytest
import os
import tempfile
import json
from unittest.mock import Mock, patch
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src'))

# Import the error logger
from first_hop_proxy.error_logger import ErrorLogger


class TestErrorLogger:
    """Test suite for error logging functionality"""
    
    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test logs"""
        with tempfile.TemporaryDirectory() as temp_dir:
            yield temp_dir
    
    @pytest.fixture
    def error_logging_config(self, temp_dir):
        """Sample error logging configuration"""
        return {
            "error_logging": {
                "enabled": True,
                "folder": os.path.join(temp_dir, "errors"),
                "include_stack_traces": True,
                "include_request_context": True,
                "include_timing": True,
                "max_file_size_mb": 10,
                "max_files": 100
            }
        }
    
    @pytest.fixture
    def disabled_error_logging_config(self, temp_dir):
        """Sample disabled error logging configuration"""
        return {
            "error_logging": {
                "enabled": False,
                "folder": os.path.join(temp_dir, "errors"),
                "include_stack_traces": True,
                "include_request_context": True,
                "include_timing": True,
                "max_file_size_mb": 10,
                "max_files": 100
            }
        }
    
    def test_error_logger_initialization_enabled(self, error_logging_config):
        """Test error logger initialization with enabled configuration"""
        error_logger = ErrorLogger(error_logging_config)
        assert error_logger.enabled is True
        assert error_logger.error_logs_folder == error_logging_config["error_logging"]["folder"]
        assert error_logger.include_stack_traces is True
        assert error_logger.include_request_context is True
        assert error_logger.include_timing is True
        assert error_logger.max_file_size_mb == 10
        assert error_logger.max_files == 100
    
    def test_error_logger_initialization_disabled(self, disabled_error_logging_config):
        """Test error logger initialization with disabled configuration"""
        error_logger = ErrorLogger(disabled_error_logging_config)
        assert error_logger.enabled is False
    
    def test_error_logger_logs_error_when_enabled(self, error_logging_config, temp_dir):
        """Test that error logger logs errors when enabled"""
        error_logger = ErrorLogger(error_logging_config)
        
        # Create a mock error
        mock_error = Mock()
        mock_error.status_code = 503
        mock_error.reason = "Service Unavailable"
        mock_error.url = "https://test.com"
        mock_error.headers = {"Content-Type": "application/json"}
        mock_error.text = "Service temporarily unavailable"
        
        # Log the error
        result = error_logger.log_error(mock_error, {"context": "test"})
        
        # Check that a log file was created
        assert result != ""
        assert os.path.exists(result)
        
        # Check that the error logs directory was created
        error_logs_dir = os.path.join(temp_dir, "errors")
        assert os.path.exists(error_logs_dir)
        
        # Check that the log file contains the expected content
        with open(result, 'r') as f:
            content = f.read()
            assert "ERROR LOG" in content
            assert "503" in content
            assert "HTTP 503" in content
    
    def test_error_logger_does_not_log_when_disabled(self, disabled_error_logging_config):
        """Test that error logger does not log when disabled"""
        error_logger = ErrorLogger(disabled_error_logging_config)
        
        # Create a mock error
        mock_error = Mock()
        mock_error.status_code = 503
        
        # Log the error
        result = error_logger.log_error(mock_error, {"context": "test"})
        
        # Check that no log file was created
        assert result == ""
    
    def test_error_logger_includes_stack_traces_when_enabled(self, error_logging_config, temp_dir):
        """Test that error logger includes stack traces when enabled"""
        error_logger = ErrorLogger(error_logging_config)
        error_logger.include_stack_traces = True
        
        # Create an exception
        try:
            raise ValueError("Test exception")
        except ValueError as e:
            result = error_logger.log_error(e, {"context": "test"})
        
        # Check that the log file contains stack trace
        with open(result, 'r') as f:
            content = f.read()
            assert "stack_trace" in content
            assert "Traceback" in content
    
    def test_error_logger_excludes_stack_traces_when_disabled(self, error_logging_config, temp_dir):
        """Test that error logger excludes stack traces when disabled"""
        error_logger = ErrorLogger(error_logging_config)
        error_logger.include_stack_traces = False
        
        # Create an exception
        try:
            raise ValueError("Test exception")
        except ValueError as e:
            result = error_logger.log_error(e, {"context": "test"})
        
        # Check that the log file does not contain stack trace
        with open(result, 'r') as f:
            content = f.read()
            assert "stack_trace" not in content
    
    def test_error_logger_includes_request_context_when_enabled(self, error_logging_config, temp_dir):
        """Test that error logger includes request context when enabled"""
        error_logger = ErrorLogger(error_logging_config)
        error_logger.include_request_context = True
        
        # Create a mock error
        mock_error = Mock()
        mock_error.status_code = 503
        
        context = {"request_id": "123", "endpoint": "/test"}
        result = error_logger.log_error(mock_error, context)
        
        # Check that the log file contains context
        with open(result, 'r') as f:
            content = f.read()
            assert "request_id" in content
            assert "123" in content
            assert "endpoint" in content
            assert "/test" in content
    
    def test_error_logger_excludes_request_context_when_disabled(self, error_logging_config, temp_dir):
        """Test that error logger excludes request context when disabled"""
        error_logger = ErrorLogger(error_logging_config)
        error_logger.include_request_context = False
        
        # Create a mock error
        mock_error = Mock()
        mock_error.status_code = 503
        
        context = {"request_id": "123", "endpoint": "/test"}
        result = error_logger.log_error(mock_error, context)
        
        # Check that the log file does not contain context
        with open(result, 'r') as f:
            content = f.read()
            assert "request_id" not in content
            assert "123" not in content
    
    def test_error_logger_includes_timing_when_enabled(self, error_logging_config, temp_dir):
        """Test that error logger includes timing when enabled"""
        error_logger = ErrorLogger(error_logging_config)
        error_logger.include_timing = True
        
        # Create a mock error
        mock_error = Mock()
        mock_error.status_code = 503
        
        result = error_logger.log_error(mock_error, {"context": "test"})
        
        # Check that the log file contains timing information
        with open(result, 'r') as f:
            content = f.read()
            assert "timestamp_unix" in content
    
    def test_error_logger_excludes_timing_when_disabled(self, error_logging_config, temp_dir):
        """Test that error logger excludes timing when disabled"""
        error_logger = ErrorLogger(error_logging_config)
        error_logger.include_timing = False
        
        # Create a mock error
        mock_error = Mock()
        mock_error.status_code = 503
        
        result = error_logger.log_error(mock_error, {"context": "test"})
        
        # Check that the log file does not contain timing information
        with open(result, 'r') as f:
            content = f.read()
            assert "timestamp_unix" not in content
    
    def test_error_logger_get_error_logs_summary(self, error_logging_config, temp_dir):
        """Test getting error logs summary"""
        error_logger = ErrorLogger(error_logging_config)
        
        # Create some test error logs
        mock_error = Mock()
        mock_error.status_code = 503
        
        error_logger.log_error(mock_error, {"context": "test1"})
        error_logger.log_error(mock_error, {"context": "test2"})
        
        # Get summary
        summary = error_logger.get_error_logs_summary()
        
        # Check summary structure
        assert "error_logs" in summary
        assert "total_errors" in summary
        assert "max_files" in summary
        assert "max_file_size_mb" in summary
        assert summary["total_errors"] >= 1  # At least one error should be logged
        assert summary["max_files"] == 100
        assert summary["max_file_size_mb"] == 10
        
        # Check error logs list
        assert len(summary["error_logs"]) >= 1  # At least one error log should exist
        for error_log in summary["error_logs"]:
            assert "filename" in error_log
            assert "error_code" in error_log
            assert "size_bytes" in error_log
            assert "size_mb" in error_log
            assert "created" in error_log
            assert "modified" in error_log
            assert error_log["error_code"] == "503"
    
    def test_error_logger_file_rotation(self, error_logging_config, temp_dir):
        """Test file rotation functionality"""
        error_logger = ErrorLogger(error_logging_config)
        error_logger.max_files = 2  # Set low for testing
        error_logger.max_file_size_mb = 0.001  # Set very low for testing
        
        # Create multiple error logs to trigger rotation
        mock_error = Mock()
        mock_error.status_code = 503
        
        for i in range(5):
            error_logger.log_error(mock_error, {"context": f"test{i}"})
        
        # Check that only the most recent files remain
        summary = error_logger.get_error_logs_summary()
        assert summary["total_errors"] <= 2  # Should be limited by max_files
