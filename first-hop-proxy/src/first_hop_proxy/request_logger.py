import os
import json
import time
import re
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List
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
        Get the next sequential log number for the given folder.

        Scans ALL log files regardless of operation type to maintain
        sequential numbering across all operations.

        Args:
            folder: Log folder path
            operation: Operation type (not used, kept for compatibility)

        Returns:
            Next sequential log number (1-based)
        """
        if not os.path.exists(folder):
            return 1

        # Find all log files matching the pattern: <number>-<any_operation>.md
        # We need to scan ALL operation types to maintain sequential numbering
        # Operation names can contain hyphens, underscores, alphanumeric chars
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

    def _get_sequenced_filename(self, operation: str, folder: str, error: Exception = None) -> str:
        """
        Generate filename with sequential numbering, operation type, and optional error suffix.

        Args:
            operation: Operation type (e.g., 'chat', 'lorebook')
            folder: Log folder path to check for existing logs
            error: Exception if request failed (determines suffix)

        Returns:
            Filename in format: <number>-<operation>[-STATUS].md
            Examples:
                00001-chat.md (success)
                00002-lorebook-RATELIMIT.md (rate limited)
                00003-summary-FAILED.md (other error)
        """
        log_number = self._get_next_log_number(folder, operation)

        # Determine status suffix based on error type
        status_suffix = ""
        if error:
            error_str = str(error).lower()
            error_type = type(error).__name__

            # Check for rate limit errors (429)
            if "429" in error_str or "rate limit" in error_str or "quota" in error_str:
                status_suffix = "-RATELIMIT"
            else:
                status_suffix = "-FAILED"

        return f"{log_number:05d}-{operation}{status_suffix}.md"

    def _get_timestamp_filename(self, request_id: str = None) -> str:
        """Generate filename with timestamp and optional request ID (legacy/unsorted)"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
        if request_id:
            return f"{timestamp}_{request_id}.md"
        return f"{timestamp}.md"
    
    def _sanitize_headers(self, headers: Dict[str, str]) -> Dict[str, str]:
        """Sanitize headers for logging by obfuscating sensitive values"""
        return sanitize_headers_for_logging(headers)

    def _format_parsed_response_data(self, response_data: Dict[str, Any]) -> Optional[List[str]]:
        """
        Extract and format JSON from response content field into collapsible markdown sections.

        Args:
            response_data: Response body dictionary

        Returns:
            List of markdown lines if successfully parsed, None if JSON not present or malformed
        """
        try:
            # Try to extract content from choices[0].message.content
            if not isinstance(response_data, dict):
                return None

            choices = response_data.get('choices')
            if not choices or not isinstance(choices, list) or len(choices) == 0:
                return None

            message = choices[0].get('message')
            if not message or not isinstance(message, dict):
                return None

            content = message.get('content')
            if not content or not isinstance(content, str):
                return None

            # Try to parse the content as JSON
            try:
                parsed_content = json.loads(content)
            except json.JSONDecodeError:
                # JSON not present or malformed - skip section
                return None

            # Build the formatted section
            lines = []
            lines.append("## Response Data (Parsed)")
            lines.append("")

            # Scene name (if present)
            scene_name = parsed_content.get('scene_name')
            if scene_name:
                lines.append(f"**Scene Name:** {scene_name}")
                lines.append("")

            # Recap/Summary
            recap = parsed_content.get('recap')
            if recap:
                lines.append("### Summary")
                lines.append("")
                lines.append(recap)
                lines.append("")

            # Lorebook entries
            lorebooks = parsed_content.get('lorebooks')
            if lorebooks and isinstance(lorebooks, list) and len(lorebooks) > 0:
                entry_count = len(lorebooks)
                plural = "entries" if entry_count != 1 else "entry"
                lines.append(f"*{entry_count} {plural}*")
                lines.append("")

                for i, entry in enumerate(lorebooks):
                    if not isinstance(entry, dict):
                        continue

                    entry_name = entry.get('name', f'Entry {i+1}')
                    entry_type = entry.get('type', 'unknown')

                    lines.append(f"### {entry_name} ({entry_type})")
                    lines.append("")

                    # Entry content
                    content = entry.get('content', '')
                    if content:
                        lines.append("```text")
                        lines.append(content)
                        lines.append("```")
                        lines.append("")

                    # Keywords
                    keywords = entry.get('keywords')
                    if keywords and isinstance(keywords, list):
                        lines.append(f"**Keywords:** {', '.join(keywords)}")
                        lines.append("")

                    # Secondary keys
                    secondary_keys = entry.get('secondaryKeys')
                    if secondary_keys and isinstance(secondary_keys, list):
                        lines.append(f"**Secondary Keys:** {', '.join(secondary_keys)}")
                        lines.append("")

            return lines

        except Exception as e:
            # If any error occurs, log it and return None to skip the section
            logger.debug(f"Failed to parse response data for formatted section: {e}")
            return None

    def log_complete_request(self, request_id: str, endpoint: str, request_data: Dict[str, Any],
                            headers: Dict[str, str], response_data: Any = None,
                            response_headers: Dict[str, str] = None, start_time: float = None,
                            end_time: float = None, duration: float = None, error: Exception = None,
                            character_chat_info: Optional[Tuple[str, str, str]] = None,
                            original_request_data: Optional[Dict[str, Any]] = None,
                            stripped_metadata: Optional[List[Dict[str, Any]]] = None,
                            lorebook_entries: Optional[List[Dict[str, Any]]] = None) -> str:
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
            stripped_metadata: List of ST_METADATA dicts that were stripped (can contain multiple blocks)
            lorebook_entries: List of lorebook entry dicts extracted from messages

        Returns:
            Path to log file if successful, empty string otherwise
        """
        if not self.enabled:
            return ""

        folder = self._get_log_folder(character_chat_info)

        # Use sequenced filename if we have character_chat_info, otherwise use timestamp
        if character_chat_info:
            character, timestamp, operation = character_chat_info
            filename = self._get_sequenced_filename(operation, folder, error=error)
        else:
            filename = self._get_timestamp_filename(request_id)

        filepath = os.path.join(folder, filename)

        log_content = []

        # Title and metadata
        log_content.append(f"# Request Log - {datetime.now().isoformat()}")
        log_content.append("")
        log_content.append(f"**Request ID:** `{request_id}`  ")
        log_content.append(f"**Endpoint:** `{endpoint}`  ")
        log_content.append(f"**Timestamp:** {datetime.now().isoformat()}  ")
        if start_time and self.include_timing:
            log_content.append(f"**Start Time:** {start_time}  ")
        log_content.append("")

        # Request Headers
        if self.include_headers and headers:
            log_content.append("## Request Headers")
            log_content.append("")
            log_content.append("```text")
            sanitized_headers = self._sanitize_headers(headers)
            for key, value in sanitized_headers.items():
                log_content.append(f"{key}: {value}")
            log_content.append("```")
            log_content.append("")

        # Lorebook Entries
        if lorebook_entries:
            entry_count = len(lorebook_entries)
            plural = "entries" if entry_count != 1 else "entry"
            log_content.append(f"## Lorebook Entries")
            log_content.append("")
            log_content.append(f"*{entry_count} {plural}*")
            log_content.append("")
            for i, entry in enumerate(lorebook_entries):
                # Try to get entry name
                entry_name = entry.get('name')

                # If no name key, try to parse from formatted content
                if not entry_name:
                    content = entry.get('formatted', entry.get('raw', ''))
                    # Try to extract name from <setting_lore name="..."> format
                    match = re.search(r'name="([^"]*)"', content)
                    if match:
                        entry_name = match.group(1)
                    else:
                        entry_name = f"Entry {i+1}"

                log_content.append(f"### {entry_name}")
                log_content.append("")
                log_content.append("```text")
                log_content.append(entry.get('formatted', entry.get('raw', 'No content')))
                log_content.append("```")
                log_content.append("")

        # Stripped ST_METADATA
        if stripped_metadata:
            log_content.append("## Stripped ST_METADATA")
            log_content.append("")
            if isinstance(stripped_metadata, list):
                block_count = len(stripped_metadata)
                plural = "blocks" if block_count != 1 else "block"
                log_content.append(f"*{block_count} {plural}*")
                log_content.append("")
            log_content.append("```json")
            log_content.append(json.dumps(stripped_metadata, indent=2))
            log_content.append("```")
            log_content.append("")

        # Original Request Data (as received)
        if self.include_request_data and original_request_data and stripped_metadata:
            log_content.append("## Original Request Data (As Received)")
            log_content.append("")
            log_content.append("```json")
            log_content.append(json.dumps(original_request_data, indent=2))
            log_content.append("```")
            log_content.append("")

            # Original Request Data (cleaned up for readability)
            log_content.append("## Original Request Data (Cleaned)")
            log_content.append("")
            log_content.append("*Logging only - not sent like this*")
            log_content.append("")
            log_content.append("```json")
            # Convert to JSON string and replace \n escape sequences with actual newlines
            cleaned_json = json.dumps(original_request_data, indent=2).replace('\\n', '\n')
            log_content.append(cleaned_json)
            log_content.append("```")
            log_content.append("")

        # Forwarded/Request Data
        if self.include_request_data and request_data:
            if stripped_metadata:
                log_content.append("## Forwarded Request Data")
                log_content.append("")
                log_content.append("*After stripping ST_METADATA*")
            else:
                log_content.append("## Request Data")
            log_content.append("")
            log_content.append("```json")
            log_content.append(json.dumps(request_data, indent=2))
            log_content.append("```")
            log_content.append("")

        # Error Response or Response Data
        if error:
            log_content.append("## Error Response")
            log_content.append("")
            log_content.append(f"**Error Type:** `{type(error).__name__}`  ")
            log_content.append(f"**Error Message:** {str(error)}  ")
            log_content.append("")
        else:
            if self.include_response_data and response_data:
                log_content.append("## Response Data")
                log_content.append("")
                if isinstance(response_data, dict):
                    log_content.append("```json")
                    log_content.append(json.dumps(response_data, indent=2))
                    log_content.append("```")
                else:
                    log_content.append("```text")
                    log_content.append(str(response_data))
                    log_content.append("```")
                log_content.append("")

                # Response Data (cleaned up for readability)
                if isinstance(response_data, dict):
                    log_content.append("## Response Data (Cleaned)")
                    log_content.append("")
                    log_content.append("*For readability - actual response uses escaped newlines*")
                    log_content.append("")
                    log_content.append("```json")
                    # Convert to JSON string and replace \n escape sequences with actual newlines
                    cleaned_json = json.dumps(response_data, indent=2).replace('\\n', '\n')
                    log_content.append(cleaned_json)
                    log_content.append("```")
                    log_content.append("")

                    # Response Data (parsed) - extract and format JSON from content field
                    parsed_section = self._format_parsed_response_data(response_data)
                    if parsed_section:
                        log_content.extend(parsed_section)

            if self.include_headers and response_headers:
                log_content.append("## Response Headers")
                log_content.append("")
                log_content.append("```text")
                sanitized_headers = self._sanitize_headers(response_headers)
                for key, value in sanitized_headers.items():
                    log_content.append(f"{key}: {value}")
                log_content.append("```")
                log_content.append("")

        # Timing Information
        if self.include_timing:
            log_content.append("## Timing Information")
            log_content.append("")
            if end_time:
                log_content.append(f"**End Time:** {end_time}  ")
            if duration:
                log_content.append(f"**Total Duration:** {duration:.3f} seconds  ")
            log_content.append("")

        # Footer
        log_content.append("---")
        log_content.append("")
        log_content.append(f"*Log completed at {datetime.now().isoformat()}*")
        
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
            filename = self._get_sequenced_filename('models', folder, error=error)
        else:
            filename = self._get_timestamp_filename(request_id)

        filepath = os.path.join(folder, filename)

        log_content = []

        # Title and metadata
        log_content.append(f"# Models Request Log - {datetime.now().isoformat()}")
        log_content.append("")
        log_content.append(f"**Request ID:** `{request_id}`  ")
        log_content.append(f"**Endpoint:** `/models`  ")
        log_content.append(f"**Timestamp:** {datetime.now().isoformat()}  ")
        log_content.append("")

        # Request Headers
        if self.include_headers and headers:
            log_content.append("## Request Headers")
            log_content.append("")
            log_content.append("```text")
            sanitized_headers = self._sanitize_headers(headers)
            for key, value in sanitized_headers.items():
                log_content.append(f"{key}: {value}")
            log_content.append("```")
            log_content.append("")

        # Error or Response
        if error:
            log_content.append("## Error Response")
            log_content.append("")
            log_content.append(f"**Error Type:** `{type(error).__name__}`  ")
            log_content.append(f"**Error Message:** {str(error)}  ")
            log_content.append("")
        else:
            if self.include_response_data and response_data:
                log_content.append("## Response Data")
                log_content.append("")
                log_content.append("```json")
                log_content.append(json.dumps(response_data, indent=2))
                log_content.append("```")
                log_content.append("")

        # Footer
        log_content.append("---")
        log_content.append("")
        log_content.append(f"*Log completed at {datetime.now().isoformat()}*")
        
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
