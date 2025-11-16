import json
import logging
import re
from typing import Dict, Any, Optional, Tuple
from .config import Config

logger = logging.getLogger(__name__)


class ResponseParser:
    """Parse response bodies and recategorize status codes based on error messages"""
    
    def __init__(self, config: Config):
        """Initialize response parser with configuration"""
        self.config = config
        self.parsing_config = config.get_response_parsing_config()
        
    def parse_and_recategorize(self, response_text: str, original_status: int) -> Tuple[int, Dict[str, Any]]:
        """
        Parse response body and recategorize status code if needed
        
        Args:
            response_text: The response body text
            original_status: The original HTTP status code
            
        Returns:
            Tuple of (new_status_code, parsing_info)
        """
        if not self.parsing_config.get("enabled", False):
            return original_status, {"recategorized": False, "reason": "parsing_disabled"}
        
        try:
            # Try to parse as JSON first
            response_json = json.loads(response_text)
            return self._parse_json_response(response_json, original_status)
        except json.JSONDecodeError:
            # If not JSON, try plain text parsing
            return self._parse_text_response(response_text, original_status)
    
    def _parse_json_response(self, response_json: Dict[str, Any], original_status: int) -> Tuple[int, Dict[str, Any]]:
        """Parse JSON response and recategorize status if needed"""
        recategorization_config = self.parsing_config.get("status_recategorization", {})

        if not recategorization_config.get("enabled", False):
            logger.warning("DEBUG: Recategorization is disabled in config")
            return original_status, {"recategorized": False, "reason": "recategorization_disabled"}

        # Extract error messages from JSON paths
        error_messages = self._extract_error_messages(response_json)
        logger.warning(f"DEBUG: Extracted error messages: {error_messages}")
        
        # Check each recategorization rule
        rules = recategorization_config.get("rules", [])
        logger.warning(f"DEBUG: Checking {len(rules)} recategorization rules")
        for idx, rule in enumerate(rules):
            logger.warning(f"DEBUG: Rule {idx}: pattern={rule.get('pattern')}, original_status={rule.get('original_status')}, new_status={rule.get('new_status')}")
            if self._should_apply_rule(rule, original_status, error_messages):
                new_status = rule.get("new_status")
                pattern = rule.get("pattern")
                description = rule.get("description", "No description")

                logger.warning(f"DEBUG: RULE MATCHED! Recategorizing {original_status} → {new_status}")

                # Log the recategorization
                self._log_recategorization(original_status, new_status, pattern, description)

                return new_status, {
                    "recategorized": True,
                    "original_status": original_status,
                    "new_status": new_status,
                    "matched_pattern": pattern,
                    "description": description,
                    "error_messages": error_messages
                }

        logger.warning(f"DEBUG: No rules matched. Returning original status {original_status}")
        return original_status, {"recategorized": False, "reason": "no_matching_rules", "error_messages": error_messages}
    
    def _parse_text_response(self, response_text: str, original_status: int) -> Tuple[int, Dict[str, Any]]:
        """Parse plain text response and recategorize status if needed"""
        recategorization_config = self.parsing_config.get("status_recategorization", {})
        
        if not recategorization_config.get("enabled", False):
            return original_status, {"recategorized": False, "reason": "recategorization_disabled"}
        
        # Check each recategorization rule against the text
        rules = recategorization_config.get("rules", [])
        for rule in rules:
            if self._should_apply_rule(rule, original_status, [response_text]):
                new_status = rule.get("new_status")
                pattern = rule.get("pattern")
                description = rule.get("description", "No description")
                
                # Log the recategorization
                self._log_recategorization(original_status, new_status, pattern, description)
                
                return new_status, {
                    "recategorized": True,
                    "original_status": original_status,
                    "new_status": new_status,
                    "matched_pattern": pattern,
                    "description": description,
                    "response_text": response_text[:500]  # Truncate for logging
                }
        
        return original_status, {"recategorized": False, "reason": "no_matching_rules"}
    
    def _extract_error_messages(self, response_json: Dict[str, Any]) -> list:
        """Extract error messages from JSON response using configured paths"""
        error_messages = []
        json_extraction_config = self.parsing_config.get("json_extraction", {})
        
        if not json_extraction_config.get("enabled", False):
            return error_messages
        
        paths = json_extraction_config.get("paths", [])
        
        for path in paths:
            try:
                value = self._get_json_value(response_json, path)
                if value and isinstance(value, str):
                    error_messages.append(value)
            except Exception as e:
                logger.debug(f"Failed to extract from path {path}: {e}")
        
        return error_messages
    
    def _get_json_value(self, obj: Any, path: str) -> Any:
        """Get value from JSON object using dot notation path"""
        if not path:
            return obj
        
        # Simple regex-based approach to handle array indexing
        import re
        
        # Split the path into parts, handling array indexing
        # This regex matches: word characters, array indices [number], and dots
        pattern = r'(\w+)(?:\[(\d+)\])?'
        matches = re.findall(pattern, path)
        
        current = obj
        
        for match in matches:
            key, index = match
            
            if isinstance(current, dict):
                if key in current:
                    current = current[key]
                else:
                    return None
            else:
                return None
            
            # Handle array indexing if present
            if index:
                if isinstance(current, list):
                    try:
                        idx = int(index)
                        if 0 <= idx < len(current):
                            current = current[idx]
                        else:
                            return None
                    except (ValueError, IndexError):
                        return None
                else:
                    return None
        
        return current
    
    def _should_apply_rule(self, rule: Dict[str, Any], original_status: int, error_messages: list) -> bool:
        """Check if a recategorization rule should be applied"""
        rule_original_status = rule.get("original_status")
        pattern = rule.get("pattern")
        
        # Check if original status matches
        if rule_original_status != original_status:
            return False
        
        # Check if pattern matches any error message
        if pattern:
            for message in error_messages:
                if isinstance(message, str) and re.search(pattern, message, re.IGNORECASE):
                    return True
        
        return False
    
    def _log_recategorization(self, original_status: int, new_status: int, pattern: str, description: str):
        """Log status recategorization if enabled"""
        logging_config = self.parsing_config.get("logging", {})
        
        if not logging_config.get("enabled", False):
            return
        
        if logging_config.get("log_recategorization", False):
            log_message = f"Status recategorized: {original_status} → {new_status}"
            
            if logging_config.get("include_matched_pattern", False):
                log_message += f" (pattern: {pattern})"
            
            if logging_config.get("include_original_status", False):
                log_message += f" (original: {original_status})"
            
            if logging_config.get("include_new_status", False):
                log_message += f" (new: {new_status})"
            
            log_message += f" - {description}"
            
            logger.info(log_message)
