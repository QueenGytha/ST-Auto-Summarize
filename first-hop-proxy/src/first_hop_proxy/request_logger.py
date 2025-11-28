import os
import json
import time
import re
import threading
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
        self.folder = self.config.get("folder", "logs")
        self.base_folder = os.path.join(self.folder, "unsorted")  # Base folder for unsorted logs
        self.characters_folder = os.path.join(self.folder, "characters")
        self.include_request_data = self.config.get("include_request_data", True)
        self.include_response_data = self.config.get("include_response_data", True)
        self.include_headers = self.config.get("include_headers", True)
        self.include_timing = self.config.get("include_timing", True)
        self.error_logger = error_logger

        # Thread-safe log number generation
        self._log_number_lock = threading.Lock()

        # Create base logs directory if it doesn't exist
        if self.enabled:
            os.makedirs(self.base_folder, exist_ok=True)
            os.makedirs(self.characters_folder, exist_ok=True)

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
            folder = os.path.join(self.characters_folder, character, timestamp)
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

    def _get_sequenced_filename(self, operation: str, folder: str, error: Exception = None,
                                is_proxy_retry: bool = False) -> Tuple[str, str]:
        """
        Generate filename with sequential numbering, operation type, and optional suffixes.
        Thread-safe: Uses lock to prevent race conditions in log numbering.
        Creates an empty file immediately to claim the number.

        Args:
            operation: Operation type (e.g., 'chat', 'lorebook')
            folder: Log folder path to check for existing logs
            error: Exception if request failed (determines error suffix)
            is_proxy_retry: True if this is a proxy-initiated retry (adds -PROXY suffix)

        Returns:
            Tuple of (filename, full_filepath)
            Filename in format: <number>-<operation>[-PROXY][-ERROR_TYPE].md
            Examples:
                00001-chat.md (success)
                00002-lorebook-PROXY.md (proxy retry in progress)
                00003-summary-PROXY-TIMEOUT.md (proxy retry that timed out)
                00004-chat-RATELIMIT.md (upstream request that was rate limited, no retry)
        """
        with self._log_number_lock:
            log_number = self._get_next_log_number(folder, operation)

            # Build suffix components
            proxy_suffix = "-PROXY" if is_proxy_retry else ""

            # Determine error status suffix based on error type
            error_suffix = ""
            if error:
                error_str = str(error).lower()
                error_type = type(error).__name__

                # Check for rate limit errors (429)
                if "429" in error_str or "rate limit" in error_str or "quota" in error_str:
                    error_suffix = "-RATELIMIT"
                else:
                    error_suffix = "-FAILED"

            # Combine suffixes: operation + proxy + error
            filename = f"{log_number:05d}-{operation}{proxy_suffix}{error_suffix}.md"
            filepath = os.path.join(folder, filename)

            # Create empty file immediately to claim this log number
            # This prevents race conditions where multiple threads get the same number
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(f"# Request Log - {datetime.now().isoformat()}\n\n")
                    f.write("**Status:** In Progress...\n\n")
            except Exception as e:
                logger.error(f"Failed to create initial log file {filepath}: {e}")

            return filename, filepath

    def _get_timestamp_filename(self, request_id: str = None) -> str:
        """Generate filename with timestamp and optional request ID (legacy/unsorted)"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
        if request_id:
            return f"{timestamp}_{request_id}.md"
        return f"{timestamp}.md"
    
    def _sanitize_headers(self, headers: Dict[str, str]) -> Dict[str, str]:
        """Sanitize headers for logging by obfuscating sensitive values"""
        return sanitize_headers_for_logging(headers)

    def start_request_log(self, request_id: str, endpoint: str, request_data: Dict[str, Any],
                          headers: Dict[str, str], start_time: float,
                          character_chat_info: Optional[Tuple[str, str, str]] = None,
                          original_request_data: Optional[Dict[str, Any]] = None,
                          stripped_metadata: Optional[List[Dict[str, Any]]] = None,
                          lorebook_entries: Optional[List[Dict[str, Any]]] = None,
                          is_proxy_retry: bool = False) -> str:
        """Create initial log file when request is received

        Args:
            request_id: Unique request identifier
            endpoint: API endpoint
            request_data: Request body data (after processing/stripping)
            headers: Request headers
            start_time: Request start timestamp
            character_chat_info: Optional tuple of (character, timestamp, operation) for organized logging
            original_request_data: Original request data before ST_METADATA stripping
            stripped_metadata: List of ST_METADATA dicts that were stripped
            lorebook_entries: List of lorebook entry dicts extracted from messages
            is_proxy_retry: True if this is a proxy-initiated retry attempt

        Returns:
            Path to log file if successful, empty string otherwise
        """
        if not self.enabled:
            return ""

        folder = self._get_log_folder(character_chat_info)

        # Use sequenced filename if we have character_chat_info, otherwise use timestamp
        if character_chat_info:
            character, timestamp, operation = character_chat_info
            filename, filepath = self._get_sequenced_filename(operation, folder, error=None,
                                                             is_proxy_retry=is_proxy_retry)
        else:
            filename = self._get_timestamp_filename(request_id)
            filepath = os.path.join(folder, filename)

        log_content = []

        # Title and metadata
        log_content.append(f"# Request Log - {datetime.now().isoformat()}")
        log_content.append("")
        log_content.append("**Status:** In Progress...")
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

        # setting_lore Entries (active entries included in the prompt)
        if lorebook_entries:
            entry_count = len(lorebook_entries)
            plural = "entries" if entry_count != 1 else "entry"
            log_content.append(f"## setting_lore Entries")
            log_content.append("")
            log_content.append(f"*{entry_count} {plural}*")
            log_content.append("")
            for i, entry in enumerate(lorebook_entries):
                entry_name = entry.get('name')
                if not entry_name:
                    content = entry.get('formatted', entry.get('raw', ''))
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

            log_content.append("## Original Request Data (Cleaned)")
            log_content.append("")
            log_content.append("*Logging only - not sent like this*")
            log_content.append("")
            log_content.append("```json")
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

        log_content.append("---")
        log_content.append("")
        log_content.append("*Waiting for response...*")

        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write('\n'.join(log_content))
            logger.info(f"Started request log: {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Failed to create initial log {filepath}: {e}")
            if hasattr(self, 'error_logger') and self.error_logger:
                self.error_logger.log_error(e, {
                    "context": "request_logger_start_error",
                    "filepath": filepath,
                    "log_type": "start_request"
                })
            return ""

    def append_retry_note(self, filepath: str, reason: str, retry_attempt: Optional[int] = None,
                          matched_pattern: Optional[str] = None, content_preview: Optional[str] = None,
                          request_id: Optional[str] = None) -> bool:
        """Append a retry note (e.g., refusal-triggered retry) to an in-progress log file"""
        if not self.enabled or not filepath or not os.path.exists(filepath):
            return False

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                existing_content = f.read()

            note_lines = []
            note_lines.append("## Proxy Retry Note")
            note_lines.append("")
            note_lines.append(f"**Reason:** {reason}  ")
            if retry_attempt is not None:
                note_lines.append(f"**Retry Attempt:** #{retry_attempt}  ")
            if request_id:
                note_lines.append(f"**Request ID:** `{request_id}`  ")
            if matched_pattern:
                note_lines.append(f"**Matched Pattern:** `{matched_pattern}`  ")
            if content_preview is not None:
                note_lines.append("")
                note_lines.append("**Content Preview:**")
                note_lines.append("")
                note_lines.append("```text")
                note_lines.append(content_preview)
                note_lines.append("```")
                note_lines.append("")

            note_lines.append(f"*Logged at {datetime.now().isoformat()}*")
            note_lines.append("")

            placeholder = "---\n\n*Waiting for response...*"
            note_block = '\n'.join(note_lines)

            if placeholder in existing_content:
                updated_content = existing_content.replace(placeholder, f"{note_block}\n{placeholder}", 1)
            else:
                updated_content = existing_content + "\n\n" + note_block

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(updated_content)

            logger.info(f"Appended retry note to log: {filepath}")
            return True

        except Exception as e:
            logger.error(f"Failed to append retry note to {filepath}: {e}")
            if hasattr(self, 'error_logger') and self.error_logger:
                self.error_logger.log_error(e, {
                    "context": "request_logger_retry_note_error",
                    "filepath": filepath,
                    "log_type": "retry_note",
                    "reason": reason
                })
            return False

    def finalize_log_with_error(self, filepath: str, error: Exception,
                                end_time: float = None, duration: float = None) -> str:
        """Finalize log file with error information and rename with error suffix

        This is used during retry flow to complete a failed attempt's log and
        rename it with the appropriate error suffix before starting a new attempt.

        Args:
            filepath: Path to existing log file
            error: Exception that caused the failure
            end_time: Request end timestamp
            duration: Request duration in seconds

        Returns:
            Path to renamed log file if successful, original filepath otherwise
        """
        if not self.enabled or not filepath or not os.path.exists(filepath):
            return filepath

        try:
            # Determine error suffix based on error type
            error_str = str(error).lower()
            error_type = type(error).__name__

            # Check for rate limit errors (429, 504, 503)
            if "429" in error_str or "rate limit" in error_str or "quota" in error_str:
                status_suffix = "-RATELIMIT"
            elif "504" in error_str or "gateway timeout" in error_str or "timeout" in error_str:
                status_suffix = "-TIMEOUT"
            elif "503" in error_str or "service unavailable" in error_str:
                status_suffix = "-UNAVAILABLE"
            else:
                status_suffix = "-FAILED"

            # Determine new filename by adding suffix before .md extension
            # Handle both formats: 00001-operation.md -> 00001-operation-RATELIMIT.md
            directory = os.path.dirname(filepath)
            filename = os.path.basename(filepath)

            # If it already has an error suffix, don't add another one
            if any(suffix in filename for suffix in ["-RATELIMIT", "-TIMEOUT", "-UNAVAILABLE", "-FAILED"]):
                new_filepath = filepath
            else:
                # Remove .md extension, add suffix, re-add .md
                base_name = filename.replace('.md', '')
                new_filename = f"{base_name}{status_suffix}.md"
                new_filepath = os.path.join(directory, new_filename)

            # Complete the log with error information
            self.complete_request_log(
                filepath=filepath,
                response_data=None,
                response_headers=None,
                end_time=end_time,
                duration=duration,
                error=error
            )

            # Rename file if suffix was added
            if new_filepath != filepath:
                os.rename(filepath, new_filepath)
                logger.info(f"Renamed log file for retry: {filename} -> {os.path.basename(new_filepath)}")
                return new_filepath
            else:
                return filepath

        except Exception as e:
            logger.error(f"Failed to finalize log with error: {e}")
            return filepath

    def complete_request_log(self, filepath: str, response_data: Any = None,
                            response_headers: Dict[str, str] = None, end_time: float = None,
                            duration: float = None, error: Exception = None) -> bool:
        """Append response data to an existing log file

        Args:
            filepath: Path to existing log file
            response_data: Response body data
            response_headers: Response headers
            end_time: Request end timestamp
            duration: Request duration in seconds
            error: Exception if request failed

        Returns:
            True if successful, False otherwise
        """
        if not self.enabled or not filepath or not os.path.exists(filepath):
            return False

        try:
            # Read existing content
            with open(filepath, 'r', encoding='utf-8') as f:
                existing_content = f.read()

            # Replace status line
            if error:
                existing_content = existing_content.replace(
                    "**Status:** In Progress...",
                    f"**Status:** ❌ Failed - {type(error).__name__}"
                )
            else:
                existing_content = existing_content.replace(
                    "**Status:** In Progress...",
                    "**Status:** ✅ Success"
                )

            # Build response sections
            response_content = []
            response_content.append("")

            # Error Response or Response Data
            if error:
                response_content.append("## Error Response")
                response_content.append("")
                response_content.append(f"**Error Type:** `{type(error).__name__}`  ")
                response_content.append(f"**Error Message:** {str(error)}  ")
                response_content.append("")
            else:
                if self.include_response_data and response_data:
                    response_content.append("## Response Data")
                    response_content.append("")
                    if isinstance(response_data, dict):
                        response_content.append("```json")
                        response_content.append(json.dumps(response_data, indent=2))
                        response_content.append("```")
                    else:
                        response_content.append("```text")
                        response_content.append(str(response_data))
                        response_content.append("```")
                    response_content.append("")

                    if isinstance(response_data, dict):
                        response_content.append("## Response Data (Cleaned)")
                        response_content.append("")
                        response_content.append("*For readability - actual response uses escaped newlines*")
                        response_content.append("")
                        response_content.append("```json")
                        cleaned_json = json.dumps(response_data, indent=2).replace('\\n', '\n')
                        response_content.append(cleaned_json)
                        response_content.append("```")
                        response_content.append("")

                        parsed_section = self._format_parsed_response_data(response_data)
                        if parsed_section:
                            response_content.extend(parsed_section)

                if self.include_headers and response_headers:
                    response_content.append("## Response Headers")
                    response_content.append("")
                    response_content.append("```text")
                    sanitized_headers = self._sanitize_headers(response_headers)
                    for key, value in sanitized_headers.items():
                        response_content.append(f"{key}: {value}")
                    response_content.append("```")
                    response_content.append("")

            # Timing Information
            if self.include_timing:
                response_content.append("## Timing Information")
                response_content.append("")
                if end_time:
                    response_content.append(f"**End Time:** {end_time}  ")
                if duration:
                    response_content.append(f"**Total Duration:** {duration:.3f} seconds  ")
                response_content.append("")

                # Add token usage if available in response
                if response_data and isinstance(response_data, dict):
                    usage = response_data.get('usage')
                    if usage and isinstance(usage, dict):
                        prompt_tokens = usage.get('prompt_tokens')
                        completion_tokens = usage.get('completion_tokens')
                        total_tokens = usage.get('total_tokens')

                        if prompt_tokens is not None:
                            response_content.append(f"**Prompt Tokens:** {prompt_tokens:,}  ")
                        if completion_tokens is not None:
                            response_content.append(f"**Completion Tokens:** {completion_tokens:,}  ")
                        if total_tokens is not None:
                            response_content.append(f"**Total Tokens:** {total_tokens:,}  ")

                response_content.append("")

            # Footer
            response_content.append("---")
            response_content.append("")
            response_content.append(f"*Log completed at {datetime.now().isoformat()}*")

            # Replace the "Waiting for response..." footer with response data
            final_content = existing_content.replace(
                "---\n\n*Waiting for response...*",
                '\n'.join(response_content)
            )

            # Write updated content
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(final_content)

            logger.info(f"Completed request log: {filepath}")
            return True

        except Exception as e:
            logger.error(f"Failed to complete log {filepath}: {e}")
            if hasattr(self, 'error_logger') and self.error_logger:
                self.error_logger.log_error(e, {
                    "context": "request_logger_complete_error",
                    "filepath": filepath,
                    "log_type": "complete_request"
                })
            return False

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

            # Strip code fences if present (e.g., ```json\n...\n```)
            content = content.strip()
            if content.startswith('```'):
                # Remove opening fence
                lines = content.split('\n', 1)
                if len(lines) > 1:
                    content = lines[1]
                # Remove closing fence
                if content.endswith('```'):
                    content = content[:-3].rstrip()

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

            # Scene name (if present) - support both old format and new compact format
            scene_name = parsed_content.get('scene_name') or parsed_content.get('sn')
            if scene_name:
                lines.append(f"**Scene Name:** {scene_name}")
                lines.append("")

            # Recap/Summary - support old format ('recap'), compact ('rc'), and current ('plot')
            recap = parsed_content.get('recap') or parsed_content.get('rc') or parsed_content.get('plot')
            if recap:
                lines.append("### Summary")
                lines.append("")
                lines.append(recap)
                lines.append("")

            # Entity entries - support old format ('setting_lore'), compact ('sl'), and current ('entities')
            setting_lore = parsed_content.get('setting_lore') or parsed_content.get('sl') or parsed_content.get('entities')
            if setting_lore and isinstance(setting_lore, list) and len(setting_lore) > 0:
                entry_count = len(setting_lore)
                plural = "entries" if entry_count != 1 else "entry"
                lines.append(f"*{entry_count} {plural}*")
                lines.append("")

                for i, entry in enumerate(setting_lore):
                    if not isinstance(entry, dict):
                        continue

                    # Support both old format and new compact format
                    entry_name = entry.get('name') or entry.get('n') or f'Entry {i+1}'
                    entry_type = entry.get('type') or entry.get('t') or 'unknown'

                    lines.append(f"### {entry_name} ({entry_type})")
                    lines.append("")

                    # Entry content - support both old format ('content') and new compact format ('c')
                    content = entry.get('content') or entry.get('c') or ''
                    if content:
                        lines.append("```text")
                        lines.append(content)
                        lines.append("```")
                        lines.append("")

                    # Keywords - support both old format ('keywords') and new compact format ('k')
                    keywords = entry.get('keywords') or entry.get('k')
                    if keywords and isinstance(keywords, list):
                        lines.append(f"**Keywords:** {', '.join(keywords)}")
                        lines.append("")

                    # UID - support old compact format ('u') and current format ('uid')
                    uid = entry.get('uid') or entry.get('u')
                    if uid:
                        lines.append(f"**UID:** {uid}")
                        lines.append("")

                    # Secondary keys (old format only)
                    secondary_keys = entry.get('secondaryKeys')
                    if secondary_keys and isinstance(secondary_keys, list):
                        lines.append(f"**Secondary Keys:** {', '.join(secondary_keys)}")
                        lines.append("")

            # lorebook entries (alternative field name, especially for scene recaps)
            lorebook = parsed_content.get('lorebook')
            if lorebook and isinstance(lorebook, list) and len(lorebook) > 0:
                entry_count = len(lorebook)
                plural = "entries" if entry_count != 1 else "entry"
                lines.append(f"### Lorebook Entries")
                lines.append("")
                lines.append(f"*{entry_count} {plural}*")
                lines.append("")

                for i, entry in enumerate(lorebook):
                    if not isinstance(entry, dict):
                        continue

                    # Support both old and compact formats
                    entry_name = entry.get('name') or entry.get('n') or f'Entry {i+1}'
                    entry_type = entry.get('type') or entry.get('t') or 'unknown'

                    lines.append(f"### {entry_name} ({entry_type})")
                    lines.append("")

                    # Entry content - support both formats
                    content = entry.get('content') or entry.get('c') or ''
                    if content:
                        lines.append("```text")
                        lines.append(content)
                        lines.append("```")
                        lines.append("")

                    # Keywords - support both formats
                    keywords = entry.get('keywords') or entry.get('k')
                    if keywords and isinstance(keywords, list):
                        lines.append(f"**Keywords:** {', '.join(keywords)}")
                        lines.append("")

                    # UID - support both formats
                    uid = entry.get('uid') or entry.get('u')
                    if uid:
                        lines.append(f"**UID:** {uid}")
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
        """Log a complete request/response cycle to a single file (legacy single-call method)

        This method is kept for backward compatibility. For better real-time visibility,
        use start_request_log() and complete_request_log() separately.

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

        # Create the log with both request and response data in one go
        folder = self._get_log_folder(character_chat_info)

        # Use sequenced filename if we have character_chat_info, otherwise use timestamp
        if character_chat_info:
            character, timestamp, operation = character_chat_info
            filename, filepath = self._get_sequenced_filename(operation, folder, error=error)
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

        # setting_lore Entries (active entries included in the prompt)
        if lorebook_entries:
            entry_count = len(lorebook_entries)
            plural = "entries" if entry_count != 1 else "entry"
            log_content.append(f"## setting_lore Entries")
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

            # Add token usage if available in response
            if response_data and isinstance(response_data, dict):
                usage = response_data.get('usage')
                if usage and isinstance(usage, dict):
                    prompt_tokens = usage.get('prompt_tokens')
                    completion_tokens = usage.get('completion_tokens')
                    total_tokens = usage.get('total_tokens')

                    if prompt_tokens is not None:
                        log_content.append(f"**Prompt Tokens:** {prompt_tokens:,}  ")
                    if completion_tokens is not None:
                        log_content.append(f"**Completion Tokens:** {completion_tokens:,}  ")
                    if total_tokens is not None:
                        log_content.append(f"**Total Tokens:** {total_tokens:,}  ")

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
