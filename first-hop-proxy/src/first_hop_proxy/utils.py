"""
Utility functions for the seaking-proxy middleware
"""
import re
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


def extract_character_chat_info(headers: Dict[str, Any], request_data: Dict[str, Any]) -> Optional[Tuple[str, str]]:
    """
    Extract character and chat information from request headers or body.

    This is a stub implementation that will be updated when the upstream format is determined.

    Args:
        headers: Request headers
        request_data: Request body data

    Returns:
        Tuple of (character, chat) if found, None otherwise

    Future Implementation Notes:
        - Format TBD from upstream SillyTavern extension
        - May be in custom headers (e.g., X-Character, X-Chat)
        - May be in request body metadata
        - May need sanitization for filesystem safety
    """
    # STUB: Return None for now - will be implemented when upstream format is determined
    # Potential locations to check:
    # - Custom headers: headers.get('X-Character'), headers.get('X-Chat')
    # - Request metadata: request_data.get('metadata', {}).get('character')
    # - User agent or other standard headers

    # Example implementation (commented out until format is known):
    # character = headers.get('X-Character') or request_data.get('metadata', {}).get('character')
    # chat = headers.get('X-Chat') or request_data.get('metadata', {}).get('chat')
    #
    # if character and chat:
    #     # Sanitize for filesystem safety
    #     character = sanitize_for_filesystem(character)
    #     chat = sanitize_for_filesystem(chat)
    #     return (character, chat)

    return None


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
