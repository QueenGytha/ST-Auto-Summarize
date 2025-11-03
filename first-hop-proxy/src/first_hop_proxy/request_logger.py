import os
import json
import time
import re
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
import logging
from .utils import sanitize_headers_for_logging

logger = logging.getLogger(__name__)


class RequestLogger:
    """Handles logging of requests and responses to individual files"""

    def __init__(self, config: Dict[str, Any], error_logger=None):
        """Initialize request logger with configuration and optional error logger"""
        self.config = config.get("logging", {})
        self.enabled = self.config.get("enabled", False)
        self.base_folder = "logs/unsorted"  # Base folder for unsorted logs
        self.include_request_data = self.config.get("include_request_data", True)
        self.include_response_data = self.config.get("include_response_data", True)
        self.include_headers = self.config.get("include_headers", True)
        self.include_timing = self.config.get("include_timing", True)
        self.error_logger = error_logger

        # Create base logs directory if it doesn't exist
        if self.enabled:
            os.makedirs(self.base_folder, exist_ok=True)

    def _get_log_folder(self, character_chat_info: Optional[Tuple[str, str, str]] = None) -> str:
        """
        Determine the log folder path based on character/chat information.

        Args:
            character_chat_info: Optional tuple of (character, timestamp, operation)

        Returns:
            Path to the log folder
        """
        if character_chat_info:
            character, timestamp, operation = character_chat_info
            folder = os.path.join("logs", "characters", character, timestamp)
            # Create directory structure if it doesn't exist
            os.makedirs(folder, exist_ok=True)
            return folder
        else:
            return self.base_folder

    def _get_next_log_number(self, folder: str, operation: str) -> int:
        """
        Get the next sequential log number for the given folder and operation.

        Args:
            folder: Log folder path
            operation: Operation type (e.g., 'chat', 'lorebook')

        Returns:
            Next sequential log number (1-based)
        """
        if not os.path.exists(folder):
            return 1

        # Find all log files matching the pattern: <number>-<operation>.log
        max_num = 0
        pattern = re.compile(r'^(\d+)-' + re.escape(operation) + r'\.log$')

        try:
            for filename in os.listdir(folder):
                match = pattern.match(filename)
                if match:
                    num = int(match.group(1))
                    max_num = max(max_num, num)
        except Exception as e:
            logger.error(f"Error scanning log folder {folder}: {e}")

        return max_num + 1

    def _get_sequenced_filename(self, operation: str, folder: str) -> str:
        """
        Generate filename with sequential numbering and operation type.

        Args:
            operation: Operation type (e.g., 'chat', 'lorebook')
            folder: Log folder path to check for existing logs

        Returns:
            Filename in format: <number>-<operation>.log (e.g., 00001-chat.log)
        """
        log_number = self._get_next_log_number(folder, operation)
        return f"{log_number:05d}-{operation}.log"

    def _get_timestamp_filename(self, request_id: str = None) -> str:
        """Generate filename with timestamp and optional request ID (legacy/unsorted)"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
        if request_id:
            return f"{timestamp}_{request_id}.log"
        return f"{timestamp}.log"
    
    def _sanitize_headers(self, headers: Dict[str, str]) -> Dict[str, str]:
        """Sanitize headers for logging by obfuscating sensitive values"""
        return sanitize_headers_for_logging(headers)
    
    def log_complete_request(self, request_id: str, endpoint: str, request_data: Dict[str, Any],
                            headers: Dict[str, str], response_data: Any = None,
                            response_headers: Dict[str, str] = None, start_time: float = None,
                            end_time: float = None, duration: float = None, error: Exception = None,
                            character_chat_info: Optional[Tuple[str, str, str]] = None,
                            original_request_data: Optional[Dict[str, Any]] = None,
                            stripped_metadata: Optional[Dict[str, Any]] = None) -> str:
        """Log a complete request/response cycle to a single file

        Args:
            request_id: Unique request identifier
            endpoint: API endpoint
            request_data: Request body data (after processing/stripping)
            headers: Request headers
            response_data: Response body data
            response_headers: Response headers
            start_time: Request start timestamp
            end_time: Request end timestamp
            duration: Request duration in seconds
            error: Exception if request failed
            character_chat_info: Optional tuple of (character, timestamp, operation) for organized logging
            original_request_data: Original request data before ST_METADATA stripping
            stripped_metadata: The ST_METADATA that was stripped, if any

        Returns:
            Path to log file if successful, empty string otherwise
        """
        if not self.enabled:
            return ""

        folder = self._get_log_folder(character_chat_info)

        # Use sequenced filename if we have character_chat_info, otherwise use timestamp
        if character_chat_info:
            character, timestamp, operation = character_chat_info
            filename = self._get_sequenced_filename(operation, folder)
        else:
            filename = self._get_timestamp_filename(request_id)

        filepath = os.path.join(folder, filename)
        
        log_content = []
        log_content.append("=" * 80)
        log_content.append(f"UNIFIED REQUEST LOG - {datetime.now().isoformat()}")
        log_content.append("=" * 80)
        log_content.append(f"Request ID: {request_id}")
        log_content.append(f"Endpoint: {endpoint}")
        log_content.append(f"Timestamp: {datetime.now().isoformat()}")
        
        if start_time and self.include_timing:
            log_content.append(f"Start Time: {start_time}")
        
        if self.include_headers and headers:
            log_content.append("\n" + "-" * 40)
            log_content.append("REQUEST HEADERS:")
            log_content.append("-" * 40)
            sanitized_headers = self._sanitize_headers(headers)
            for key, value in sanitized_headers.items():
                log_content.append(f"{key}: {value}")

        # Show ST_METADATA information if it was stripped
        if stripped_metadata:
            log_content.append("\n" + "-" * 40)
            log_content.append("STRIPPED ST_METADATA:")
            log_content.append("-" * 40)
            log_content.append(json.dumps(stripped_metadata, indent=2))

        # Show original request data if different from forwarded data
        if self.include_request_data and original_request_data and stripped_metadata:
            log_content.append("\n" + "-" * 40)
            log_content.append("ORIGINAL REQUEST DATA (AS RECEIVED):")
            log_content.append("-" * 40)
            log_content.append(json.dumps(original_request_data, indent=2))

        if self.include_request_data and request_data:
            log_content.append("\n" + "-" * 40)
            if stripped_metadata:
                log_content.append("FORWARDED REQUEST DATA (AFTER STRIPPING ST_METADATA):")
            else:
                log_content.append("REQUEST DATA:")
            log_content.append("-" * 40)
            log_content.append(json.dumps(request_data, indent=2))
        
        # Add response or error information
        if error:
            log_content.append("\n" + "-" * 40)
            log_content.append("FINAL ERROR RESPONSE:")
            log_content.append("-" * 40)
            log_content.append(f"Error Type: {type(error).__name__}")
            log_content.append(f"Error Message: {str(error)}")
        else:
            log_content.append("\n" + "-" * 40)
            log_content.append("FINAL RESPONSE DATA:")
            log_content.append("-" * 40)
            
            if self.include_response_data and response_data:
                if isinstance(response_data, dict):
                    log_content.append(json.dumps(response_data, indent=2))
                else:
                    log_content.append(str(response_data))
            
            if self.include_headers and response_headers:
                log_content.append("\n" + "-" * 40)
                log_content.append("RESPONSE HEADERS:")
                log_content.append("-" * 40)
                sanitized_headers = self._sanitize_headers(response_headers)
                for key, value in sanitized_headers.items():
                    log_content.append(f"{key}: {value}")
        
        if self.include_timing:
            log_content.append("\n" + "-" * 40)
            log_content.append("TIMING INFORMATION:")
            log_content.append("-" * 40)
            if end_time:
                log_content.append(f"End Time: {end_time}")
            if duration:
                log_content.append(f"Total Duration: {duration:.3f} seconds")
        
        log_content.append("\n" + "=" * 80)
        log_content.append(f"LOG COMPLETE - {datetime.now().isoformat()}")
        log_content.append("=" * 80)
        
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write('\n'.join(log_content))
            logger.info(f"Complete request logged to: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Failed to write complete log to {filepath}: {e}")
            # Log to error logger if available
            if hasattr(self, 'error_logger') and self.error_logger:
                self.error_logger.log_error(e, {
                    "context": "request_logger_write_error",
                    "filepath": filepath,
                    "log_type": "complete_request"
                })
            return ""
    
    def log_models_request(self, request_id: str, headers: Dict[str, str],
                          response_data: Any, error: Exception = None,
                          character_chat_info: Optional[Tuple[str, str, str]] = None) -> str:
        """Log models request as a single unified log

        Args:
            request_id: Unique request identifier
            headers: Request headers
            response_data: Response body data
            error: Exception if request failed
            character_chat_info: Optional tuple of (character, timestamp, operation) for organized logging

        Returns:
            Path to log file if successful, empty string otherwise
        """
        if not self.enabled:
            return ""

        folder = self._get_log_folder(character_chat_info)

        # Use sequenced filename if we have character_chat_info, otherwise use timestamp
        if character_chat_info:
            character, timestamp, operation = character_chat_info
            # For models requests, use 'models' as the operation type
            filename = self._get_sequenced_filename('models', folder)
        else:
            filename = self._get_timestamp_filename(request_id)

        filepath = os.path.join(folder, filename)
        
        log_content = []
        log_content.append("=" * 80)
        log_content.append(f"MODELS REQUEST LOG - {datetime.now().isoformat()}")
        log_content.append("=" * 80)
        log_content.append(f"Request ID: {request_id}")
        log_content.append(f"Endpoint: /models")
        log_content.append(f"Timestamp: {datetime.now().isoformat()}")
        
        if self.include_headers and headers:
            log_content.append("\n" + "-" * 40)
            log_content.append("REQUEST HEADERS:")
            log_content.append("-" * 40)
            sanitized_headers = self._sanitize_headers(headers)
            for key, value in sanitized_headers.items():
                log_content.append(f"{key}: {value}")
        
        if error:
            log_content.append("\n" + "-" * 40)
            log_content.append("ERROR RESPONSE:")
            log_content.append("-" * 40)
            log_content.append(f"Error Type: {type(error).__name__}")
            log_content.append(f"Error Message: {str(error)}")
        else:
            log_content.append("\n" + "-" * 40)
            log_content.append("RESPONSE DATA:")
            log_content.append("-" * 40)
            if self.include_response_data and response_data:
                log_content.append(json.dumps(response_data, indent=2))
        
        log_content.append("\n" + "=" * 80)
        log_content.append(f"LOG COMPLETE - {datetime.now().isoformat()}")
        log_content.append("=" * 80)
        
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write('\n'.join(log_content))
            logger.info(f"Models request logged to: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Failed to write models log to {filepath}: {e}")
            # Log to error logger if available
            if hasattr(self, 'error_logger') and self.error_logger:
                self.error_logger.log_error(e, {
                    "context": "request_logger_write_error",
                    "filepath": filepath,
                    "log_type": "models_request"
                })
            return ""
