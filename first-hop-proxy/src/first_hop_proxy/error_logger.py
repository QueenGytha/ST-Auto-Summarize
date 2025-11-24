import os
import json
import time
import re
import threading
from datetime import datetime
from typing import Dict, Any, Optional, Union, Tuple
import logging
from requests import Response
from requests.exceptions import RequestException

logger = logging.getLogger(__name__)


class ErrorLogger:
    """Handles independent logging of errors and retries to separate files"""

    def __init__(self, config: Dict[str, Any]):
        """Initialize error logger with configuration"""
        # Use the new independent error logging configuration
        self.config = config.get("error_logging", {})
        self.enabled = self.config.get("enabled", False)
        self.error_logs_folder = self.config.get("folder", "logs/unsorted")
        self.base_error_folder = self.error_logs_folder  # Base folder for unsorted error logs

        # Additional error logging settings
        self.include_stack_traces = self.config.get("include_stack_traces", True)
        self.include_request_context = self.config.get("include_request_context", True)
        self.include_timing = self.config.get("include_timing", True)
        self.max_file_size_mb = self.config.get("max_file_size_mb", 10)
        self.max_files = self.config.get("max_files", 100)

        # Thread-safe log number generation
        self._log_number_lock = threading.Lock()

        # Create base error logs directory if enabled
        if self.enabled:
            os.makedirs(self.error_logs_folder, exist_ok=True)

    def _get_error_log_folder(self, character_chat_info: Optional[Tuple[str, str, str]] = None) -> str:
        """
        Determine the error log folder path based on character/chat information.
        Uses the configured error logs folder and nests character-specific logs under it.

        Args:
            character_chat_info: Optional tuple of (character, timestamp, operation)

        Returns:
            Path to the error log folder
        """
        if character_chat_info:
            character, timestamp, operation = character_chat_info
            folder = os.path.join(self.error_logs_folder, "characters", character, timestamp)
            # Create directory structure if it doesn't exist
            os.makedirs(folder, exist_ok=True)
            return folder
        else:
            return self.base_error_folder

    def _get_next_error_log_number(self, folder: str, operation: str) -> int:
        """
        Get the next sequential log number for the given folder.

        Scans ALL log files (both regular and error logs) regardless of operation type
        to maintain sequential numbering across all logs.

        Args:
            folder: Log folder path
            operation: Operation type (not used, kept for compatibility)

        Returns:
            Next sequential log number (1-based)
        """
        if not os.path.exists(folder):
            return 1

        # Find all log files matching the pattern: <number>-<anything>.md
        # This includes both regular logs and error logs
        max_num = 0
        pattern = re.compile(r'^(\d+)-.+\.md$')

        try:
            for filename in os.listdir(folder):
                match = pattern.match(filename)
                if match:
                    num = int(match.group(1))
                    max_num = max(max_num, num)
        except Exception as e:
            logger.error(f"Error scanning log folder {folder}: {e}")

        return max_num + 1

    def _get_sequenced_error_filename(self, operation: str, folder: str, retry_attempt: Optional[int] = None) -> Tuple[str, str]:
        """
        Generate filename with sequential numbering, operation type, and ERROR suffix.
        Thread-safe: Uses lock to prevent race conditions in log numbering.
        Creates an empty file immediately to claim the number.

        Args:
            operation: Operation type (e.g., 'chat', 'lorebook')
            folder: Error log folder path to check for existing logs
            retry_attempt: Retry attempt number if this is a retry from the proxy

        Returns:
            Tuple of (filename, full_filepath)
            Filename format:
            - Original request: <number>-<operation>-ERROR.md (e.g., 00019-chat-ERROR.md)
            - Proxy retry: <number>-<operation>-PROXY-ERROR.md (e.g., 00019-chat-PROXY-ERROR.md)
        """
        with self._log_number_lock:
            log_number = self._get_next_error_log_number(folder, operation)
            if retry_attempt is not None and retry_attempt > 0:
                filename = f"{log_number:05d}-{operation}-attempt{retry_attempt}-PROXY-ERROR.md"
            else:
                filename = f"{log_number:05d}-{operation}-ERROR.md"
            filepath = os.path.join(folder, filename)

            # Create empty file immediately to claim this log number
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(f"# Error Log - {datetime.now().isoformat()}\n\n")
                    f.write("**Status:** Logging error...\n\n")
            except Exception as e:
                logger.error(f"Failed to create initial error log file {filepath}: {e}")

            return filename, filepath

    def _get_error_filename(self, error_code: Union[int, str], timestamp: Optional[float] = None) -> str:
        """Generate filename for error log based on error code and timestamp (legacy/unsorted)"""
        if timestamp is None:
            timestamp = time.time()

        # Convert timestamp to datetime for filename
        dt = datetime.fromtimestamp(timestamp)
        timestamp_str = dt.strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds

        # Sanitize error code for filename
        if isinstance(error_code, int):
            error_code_str = str(error_code)
        else:
            # For exception types, use a sanitized version
            error_code_str = str(error_code).replace(" ", "_").replace("<", "").replace(">", "").replace("'", "")

        return f"{error_code_str}_{timestamp_str}-ERROR.md"
    
    def _get_error_code(self, error: Union[Exception, Response, int]) -> Union[int, str]:
        """Extract error code from various error types"""
        if isinstance(error, int):
            return error
        
        if isinstance(error, Response):
            return error.status_code
        
        # Check if error has a status_code attribute (for Mock objects or custom error types)
        if hasattr(error, 'status_code') and error.status_code is not None:
            return error.status_code
        
        if isinstance(error, Exception):
            # For exceptions, use the exception type name
            return type(error).__name__
        
        return "unknown_error"
    
    def _format_error_context(self, error: Union[Exception, Response], 
                            context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Format error context for logging"""
        error_context = {
            "timestamp": datetime.now().isoformat(),
            "error_type": type(error).__name__ if isinstance(error, Exception) else "HTTPResponse",
            "error_message": str(error) if isinstance(error, Exception) else f"HTTP {error.status_code}",
        }
        
        # Add timing information if enabled
        if self.include_timing:
            error_context["timestamp_unix"] = time.time()
        
        # Add HTTP-specific information
        if isinstance(error, Response):
            error_context.update({
                "status_code": error.status_code,
                "status_text": error.reason,
                "url": error.url,
                "headers": dict(error.headers),
                "response_text": error.text if error.text else None,
            })
        
        # Add exception-specific information
        if isinstance(error, Exception):
            error_context.update({
                "exception_type": type(error).__name__,
                "exception_args": error.args,
            })
            
            # Add stack trace if enabled
            if self.include_stack_traces:
                import traceback
                error_context["stack_trace"] = traceback.format_exc()
            
            # Add HTTP error specific info
            if hasattr(error, 'response') and error.response is not None:
                error_context.update({
                    "http_status_code": error.response.status_code,
                    "http_status_text": error.response.reason,
                    "http_url": error.response.url,
                    "http_headers": dict(error.response.headers),
                    "http_response_text": error.response.text if error.response.text else None,
                })
        
        # Add context information if enabled
        if context and self.include_request_context:
            error_context["context"] = context
        
        return error_context
    
    def log_error(self, error: Union[Exception, Response, int],
                  context: Optional[Dict[str, Any]] = None,
                  retry_attempt: Optional[int] = None,
                  retry_delay: Optional[float] = None,
                  character_chat_info: Optional[Tuple[str, str, str]] = None) -> str:
        """Log an error to a separate file based on error code and timestamp

        Args:
            error: Exception, Response, or error code
            context: Additional context information
            retry_attempt: Retry attempt number if applicable
            retry_delay: Retry delay in seconds if applicable
            character_chat_info: Optional tuple of (character, timestamp, operation) for organized logging

        Returns:
            Path to error log file if successful, empty string otherwise
        """
        if not self.enabled:
            return ""

        # Manage file rotation before writing
        self._manage_file_rotation(character_chat_info)

        error_code = self._get_error_code(error)
        error_context = self._format_error_context(error, context)

        # Add retry information if available
        if retry_attempt is not None:
            error_context["retry_attempt"] = retry_attempt
        if retry_delay is not None:
            error_context["retry_delay"] = retry_delay

        # Generate filename and folder
        folder = self._get_error_log_folder(character_chat_info)

        # Use sequenced filename if we have character_chat_info, otherwise use error code + timestamp
        if character_chat_info:
            character, timestamp, operation = character_chat_info
            filename, filepath = self._get_sequenced_error_filename(operation, folder, retry_attempt)
        else:
            filename = self._get_error_filename(error_code)
            filepath = os.path.join(folder, filename)

        # Create log content in markdown format
        log_content = []
        log_content.append(f"# Error Log - {datetime.now().isoformat()}")
        log_content.append("")
        log_content.append(f"**Error Code:** `{error_code}`  ")
        log_content.append(f"**File:** `{filename}`  ")
        log_content.append(f"**Timestamp:** {datetime.now().isoformat()}  ")
        log_content.append("")

        # Add retry information header if this is a retry
        if retry_attempt is not None:
            log_content.append("## Retry Information")
            log_content.append("")
            log_content.append(f"**Retry Attempt:** #{retry_attempt}  ")
            if retry_delay is not None:
                log_content.append(f"**Retry Delay:** {retry_delay:.2f} seconds  ")
            log_content.append("")

        # Add error details
        log_content.append("## Error Details")
        log_content.append("")
        log_content.append("```json")
        log_content.append(json.dumps(error_context, indent=2, default=str))
        log_content.append("```")
        log_content.append("")

        # Footer
        log_content.append("---")
        log_content.append("")
        log_content.append(f"*Log completed at {datetime.now().isoformat()}*")
        
        # Write to file
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write('\n'.join(log_content))
            
            logger.info(f"Error logged to: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Failed to write error log to {filepath}: {e}")
            return ""
    
    def log_retry_attempt(self, error: Union[Exception, Response],
                         attempt: int, delay: float,
                         context: Optional[Dict[str, Any]] = None,
                         character_chat_info: Optional[Tuple[str, str, str]] = None) -> str:
        """Log a retry attempt specifically

        Args:
            error: Exception or Response that triggered the retry
            attempt: Retry attempt number
            delay: Retry delay in seconds
            context: Additional context information
            character_chat_info: Optional tuple of (character, timestamp, operation) for organized logging

        Returns:
            Path to error log file if successful, empty string otherwise
        """
        return self.log_error(error, context, retry_attempt=attempt, retry_delay=delay,
                            character_chat_info=character_chat_info)

    def log_final_error(self, error: Union[Exception, Response],
                       total_attempts: int,
                       context: Optional[Dict[str, Any]] = None,
                       character_chat_info: Optional[Tuple[str, str, str]] = None) -> str:
        """Log the final error after all retries are exhausted

        Args:
            error: Exception or Response representing the final error
            total_attempts: Total number of retry attempts made
            context: Additional context information
            character_chat_info: Optional tuple of (character, timestamp, operation) for organized logging

        Returns:
            Path to error log file if successful, empty string otherwise
        """
        error_context = self._format_error_context(error, context)
        error_context["total_retry_attempts"] = total_attempts
        error_context["final_error"] = True

        return self.log_error(error, error_context, character_chat_info=character_chat_info)
    


    def _manage_file_rotation(self, character_chat_info: Optional[Tuple[str, str, str]] = None) -> None:
        """Manage file rotation based on size and count limits

        Args:
            character_chat_info: Optional tuple of (character, timestamp, operation) to determine which folder to rotate
        """
        folder = self._get_error_log_folder(character_chat_info)

        if not self.enabled or not os.path.exists(folder):
            return

        try:
            # Get all error log files (look for ERROR in filename)
            log_files = []
            for filename in os.listdir(folder):
                if filename.endswith('.md') and 'ERROR' in filename:
                    filepath = os.path.join(folder, filename)
                    file_stat = os.stat(filepath)
                    log_files.append({
                        'filename': filename,
                        'filepath': filepath,
                        'size_mb': file_stat.st_size / (1024 * 1024),
                        'modified': file_stat.st_mtime
                    })

            # Sort by modification time (oldest first)
            log_files.sort(key=lambda x: x['modified'])

            # Remove oldest files if we exceed max_files
            if len(log_files) >= self.max_files:
                files_to_remove = len(log_files) - self.max_files + 1
                for i in range(files_to_remove):
                    try:
                        os.remove(log_files[i]['filepath'])
                        logger.info(f"Removed old error log file: {log_files[i]['filename']}")
                    except Exception as e:
                        logger.error(f"Failed to remove old error log file {log_files[i]['filename']}: {e}")

            # Check for oversized files
            for log_file in log_files:
                if log_file['size_mb'] > self.max_file_size_mb:
                    try:
                        # Create a backup with timestamp
                        backup_filename = f"{log_file['filename']}.backup_{int(time.time())}"
                        backup_filepath = os.path.join(folder, backup_filename)
                        os.rename(log_file['filepath'], backup_filepath)
                        logger.info(f"Rotated oversized error log file: {log_file['filename']}")
                    except Exception as e:
                        logger.error(f"Failed to rotate oversized error log file {log_file['filename']}: {e}")

        except Exception as e:
            logger.error(f"Error during file rotation: {e}")
    
    def get_error_logs_summary(self, character_chat_info: Optional[Tuple[str, str, str]] = None) -> Dict[str, Any]:
        """Get a summary of error logs

        Args:
            character_chat_info: Optional tuple of (character, timestamp, operation) to get summary for specific folder

        Returns:
            Dictionary with error logs summary including list of logs and metadata
        """
        folder = self._get_error_log_folder(character_chat_info)

        if not self.enabled or not os.path.exists(folder):
            return {"error_logs": [], "total_errors": 0}

        error_logs = []
        total_errors = 0

        try:
            for filename in os.listdir(folder):
                if filename.endswith('.md') and 'ERROR' in filename:
                    filepath = os.path.join(folder, filename)
                    file_stat = os.stat(filepath)

                    # Parse error code from filename
                    # Format: 00019-operation-ERROR.md, 00019-operation-PROXY-ERROR.md, or code_timestamp-ERROR.md
                    if filename.endswith('-PROXY-ERROR.md'):
                        # Remove the -PROXY-ERROR.md suffix
                        base = filename.replace('-PROXY-ERROR.md', '')
                        parts = base.split('-')
                        if len(parts) >= 2 and parts[0].isdigit():
                            # Sequenced format: 00019-operation
                            error_code = parts[1]
                        else:
                            # Legacy format: code_timestamp
                            error_code = parts[0].split('_')[0]
                    elif filename.endswith('-ERROR.md'):
                        # Remove the -ERROR.md suffix
                        base = filename.replace('-ERROR.md', '')
                        parts = base.split('-')
                        if len(parts) >= 2 and parts[0].isdigit():
                            # Sequenced format: 00019-operation
                            error_code = parts[1]
                        else:
                            # Legacy format: code_timestamp
                            error_code = parts[0].split('_')[0]
                    else:
                        error_code = "unknown"

                    error_logs.append({
                        "filename": filename,
                        "error_code": error_code,
                        "size_bytes": file_stat.st_size,
                        "size_mb": round(file_stat.st_size / (1024 * 1024), 2),
                        "created": datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
                        "modified": datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
                    })
                    total_errors += 1
        except Exception as e:
            logger.error(f"Error reading error logs directory: {e}")

        return {
            "error_logs": sorted(error_logs, key=lambda x: x["modified"], reverse=True),
            "total_errors": total_errors,
            "max_files": self.max_files,
            "max_file_size_mb": self.max_file_size_mb
        }
