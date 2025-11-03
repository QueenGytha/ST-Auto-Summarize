"""
Utility functions for the seaking-proxy middleware
"""
import re
import json
from typing import Dict, Any, List, Optional, Tuple
from .constants import SENSITIVE_HEADERS


def sanitize_headers_for_logging(headers: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitize headers for logging by obfuscating sensitive values
    
    Args:
        headers: Dictionary of headers to sanitize
        
    Returns:
        Dictionary with sensitive header values obfuscated
    """
    sanitized = {}
    
    for key, value in headers.items():
        if key.lower() in SENSITIVE_HEADERS:
            if value and len(str(value)) > 8:
                # Show first 8 characters + "..." for API keys
                sanitized[key] = f"{str(value)[:8]}..."
            else:
                sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = value
    return sanitized


def format_duration(start_time: float, end_time: float) -> str:
    """
    Format duration between two timestamps
    
    Args:
        start_time: Start timestamp
        end_time: End timestamp
        
    Returns:
        Formatted duration string
    """
    duration = end_time - start_time
    if duration < 1:
        return f"{duration * 1000:.0f}ms"
    elif duration < 60:
        return f"{duration:.2f}s"
    else:
        minutes = int(duration // 60)
        seconds = duration % 60
        return f"{minutes}m {seconds:.2f}s"


def truncate_text(text: str, max_length: int = 500) -> str:
    """
    Truncate text to specified length with ellipsis
    
    Args:
        text: Text to truncate
        max_length: Maximum length before truncation
        
    Returns:
        Truncated text with ellipsis if needed
    """
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def safe_json_dumps(obj: Any, default: str = "Unable to serialize") -> str:
    """
    Safely serialize object to JSON string
    
    Args:
        obj: Object to serialize
        default: Default string if serialization fails
        
    Returns:
        JSON string or default string
    """
    try:
        import json
        return json.dumps(obj, indent=2, default=str)
    except (TypeError, ValueError):
        return default


def apply_regex_replacements(text: str, rules: List[Dict[str, Any]]) -> str:
    """
    Apply regex replacement rules to text
    
    Args:
        text: Text to apply replacements to
        rules: List of replacement rules with pattern, replacement, flags, and apply_to
        
    Returns:
        Text with replacements applied
    """
    if not text or not rules:
        return text
    
    result = text
    
    for rule in rules:
        try:
            pattern = rule.get("pattern")
            replacement = rule.get("replacement", "")
            flags_str = rule.get("flags", "")
            apply_to = rule.get("apply_to", "all")
            
            if not pattern:
                continue
            
            # Convert flags string to re flags
            flags = 0
            if "i" in flags_str:
                flags |= re.IGNORECASE
            if "m" in flags_str:
                flags |= re.MULTILINE
            if "s" in flags_str:
                flags |= re.DOTALL
            if "x" in flags_str:
                flags |= re.VERBOSE
            
            # Apply the replacement
            result = re.sub(pattern, replacement, result, flags=flags)
            
        except (re.error, TypeError, ValueError) as e:
            # Log error but continue with other rules
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Invalid regex rule: {rule}, error: {e}")
            continue
    
    return result


def process_messages_with_regex(messages: List[Dict[str, Any]], rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Process messages with regex replacement rules
    
    Args:
        messages: List of message dictionaries with 'role' and 'content' keys
        rules: List of replacement rules
        
    Returns:
        List of messages with replacements applied
    """
    if not messages or not rules:
        return messages
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"=== OUTGOING REGEX PROCESSING ===")
    logger.info(f"Applying {len(rules)} rules to {len(messages)} messages")
    logger.info(f"TEST LOG MESSAGE - OUTGOING REGEX PROCESSING IS WORKING")
    
    processed_messages = []
    
    for i, message in enumerate(messages):
        role = message.get("role", "").lower()
        content = message.get("content", "")
        
        if not content:
            processed_messages.append(message)
            continue
        
        # Filter rules based on apply_to
        applicable_rules = []
        for rule in rules:
            apply_to = rule.get("apply_to", "all").lower()
            if apply_to == "all" or apply_to == role:
                applicable_rules.append(rule)
        
        # Log before processing
        logger.info(f"Message {i+1} ({role}) BEFORE regex: {content[:200]}...")
        
        # Apply regex replacements
        processed_content = apply_regex_replacements(content, applicable_rules)
        
        # Log after processing
        logger.info(f"Message {i+1} ({role}) AFTER regex: {processed_content[:200]}...")
        
        # Create new message with processed content
        processed_message = message.copy()
        processed_message["content"] = processed_content
        processed_messages.append(processed_message)
    
    logger.info(f"=== OUTGOING REGEX PROCESSING COMPLETE ===")
    return processed_messages


def process_response_with_regex(response_data: Dict[str, Any], rules: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Process response data with regex replacement rules
    
    Args:
        response_data: Response dictionary (typically OpenAI format)
        rules: List of replacement rules
        
    Returns:
        Response data with replacements applied
    """
    if not response_data or not rules:
        return response_data
    
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"=== INCOMING REGEX PROCESSING ===")
    logger.info(f"Applying {len(rules)} rules to response")
    logger.info(f"TEST LOG MESSAGE - INCOMING REGEX PROCESSING IS WORKING")
    
    # Create a copy to avoid modifying the original
    processed_response = response_data.copy()
    
    # Process choices if they exist
    if 'choices' in processed_response and isinstance(processed_response['choices'], list):
        processed_choices = []
        for i, choice in enumerate(processed_response['choices']):
            processed_choice = choice.copy()
            
            # Process message content if it exists
            if 'message' in processed_choice and isinstance(processed_choice['message'], dict):
                message = processed_choice['message'].copy()
                if 'content' in message and isinstance(message['content'], str):
                    # Log before processing
                    logger.info(f"Choice {i+1} BEFORE regex: {message['content'][:200]}...")
                    
                    # Apply regex replacements to content
                    processed_content = apply_regex_replacements(message['content'], rules)
                    message['content'] = processed_content
                    
                    # Log after processing
                    logger.info(f"Choice {i+1} AFTER regex: {processed_content[:200]}...")
                processed_choice['message'] = message
            
            processed_choices.append(processed_choice)
        
        processed_response['choices'] = processed_choices
    
    logger.info(f"=== INCOMING REGEX PROCESSING COMPLETE ===")
    return processed_response


def parse_st_metadata(content: str) -> Optional[Dict[str, Any]]:
    """
    Parse ST_METADATA from message content.

    Args:
        content: Message content that may contain <ST_METADATA>...</ST_METADATA>

    Returns:
        Dictionary containing parsed metadata, or None if not found

    Example:
        <ST_METADATA>
        {
          "version": "1.0",
          "chat": "Senta - 2025-11-01@20h29m24s",
          "operation": "lorebook"
        }
        </ST_METADATA>
    """
    if not content:
        return None

    # Match ST_METADATA tags
    pattern = r'<ST_METADATA>\s*(\{.*?\})\s*</ST_METADATA>'
    match = re.search(pattern, content, re.DOTALL)

    if not match:
        return None

    try:
        metadata_json = match.group(1)
        metadata = json.loads(metadata_json)
        return metadata
    except (json.JSONDecodeError, AttributeError) as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to parse ST_METADATA: {e}")
        return None


def strip_st_metadata(content: str) -> str:
    """
    Remove ST_METADATA tags and content from a message.

    Args:
        content: Message content that may contain <ST_METADATA>...</ST_METADATA>

    Returns:
        Content with ST_METADATA removed
    """
    if not content:
        return content

    # Remove ST_METADATA tags and content
    pattern = r'<ST_METADATA>.*?</ST_METADATA>\s*'
    result = re.sub(pattern, '', content, flags=re.DOTALL)

    return result.strip()


def parse_chat_name(chat: str) -> Tuple[str, str]:
    """
    Parse character name and timestamp from ST chat name.

    Parses from the end since timestamp format is reliable,
    but character name may contain special characters including '-'.

    Args:
        chat: Chat name in format "Character Name - YYYY-MM-DD@HHhMMmSSs"

    Returns:
        Tuple of (character_name, timestamp)

    Example:
        "Senta - 2025-11-01@20h29m24s" -> ("Senta", "2025-11-01@20h29m24s")
        "My - Character - 2025-11-01@20h29m24s" -> ("My - Character", "2025-11-01@20h29m24s")
    """
    # Find the last occurrence of " - " to split character and timestamp
    # The timestamp format is: YYYY-MM-DD@HHhMMmSSs
    last_sep = chat.rfind(' - ')

    if last_sep == -1:
        # No separator found, treat entire string as character name
        return (chat, 'unknown')

    character = chat[:last_sep]
    timestamp = chat[last_sep + 3:]  # Skip the " - " separator

    return (character, timestamp)


def extract_st_metadata_from_messages(messages: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extract ST_METADATA from messages and return cleaned messages.

    Searches all messages for ST_METADATA, extracts it, and returns
    messages with ST_METADATA stripped out.

    Args:
        messages: List of message dictionaries

    Returns:
        Tuple of (metadata_dict, cleaned_messages)
    """
    if not messages:
        return (None, messages)

    metadata = None
    cleaned_messages = []

    for message in messages:
        content = message.get('content', '')
        if not content:
            cleaned_messages.append(message)
            continue

        # Try to parse metadata from this message
        msg_metadata = parse_st_metadata(content)
        if msg_metadata and not metadata:
            # Store the first metadata we find
            metadata = msg_metadata

        # Strip metadata and create cleaned message
        cleaned_content = strip_st_metadata(content)
        cleaned_message = message.copy()
        cleaned_message['content'] = cleaned_content

        # Only include the message if it has content after stripping
        # (don't include messages that were only metadata)
        if cleaned_content:
            cleaned_messages.append(cleaned_message)

    return (metadata, cleaned_messages)


def extract_character_chat_info(headers: Dict[str, Any], request_data: Dict[str, Any]) -> Optional[Tuple[str, str, str]]:
    """
    Extract character, chat timestamp, and operation from request.

    Looks for ST_METADATA in request messages and parses the chat field
    to extract character name and timestamp.

    Args:
        headers: Request headers
        request_data: Request body data

    Returns:
        Tuple of (character, timestamp, operation) if found, None otherwise

    Example:
        Messages containing:
        <ST_METADATA>
        {
          "version": "1.0",
          "chat": "Senta - 2025-11-01@20h29m24s",
          "operation": "lorebook"
        }
        </ST_METADATA>

        Returns: ("Senta", "2025-11-01@20h29m24s", "lorebook")
    """
    # Extract metadata from messages
    messages = request_data.get('messages', [])
    if not messages:
        return None

    metadata, _ = extract_st_metadata_from_messages(messages)
    if not metadata:
        return None

    # Get chat and operation from metadata
    chat = metadata.get('chat')
    operation = metadata.get('operation', 'chat')

    if not chat:
        return None

    # Parse character name and timestamp from chat
    character, timestamp = parse_chat_name(chat)

    # Sanitize for filesystem safety
    character = sanitize_for_filesystem(character)
    timestamp = sanitize_for_filesystem(timestamp)
    operation = sanitize_for_filesystem(operation)

    return (character, timestamp, operation)


def sanitize_for_filesystem(name: str, max_length: int = 100) -> str:
    """
    Sanitize a string to be safe for use as a filesystem path component.

    Args:
        name: String to sanitize
        max_length: Maximum length of sanitized string

    Returns:
        Sanitized string safe for filesystem use
    """
    # Remove or replace characters that are unsafe for filesystems
    # Windows: < > : " / \ | ? *
    # Additional: control characters, leading/trailing spaces and dots

    # Replace unsafe characters with underscore
    sanitized = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name)

    # Remove leading/trailing whitespace and dots
    sanitized = sanitized.strip(' .')

    # Replace multiple consecutive underscores with single underscore
    sanitized = re.sub(r'_+', '_', sanitized)

    # Truncate to max length
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length].rstrip('_')

    # If empty after sanitization, use a default
    if not sanitized:
        sanitized = 'unknown'

    return sanitized
