import requests
import json
import logging
import re
from typing import Dict, Any, Optional
from urllib.parse import urljoin

logger = logging.getLogger(__name__)


from .utils import sanitize_headers_for_logging, process_response_with_regex
from .constants import SKIP_HEADERS, BLANK_RESPONSE_PATTERNS
from .response_parser import ResponseParser


class ProxyClient:
    """Client for forwarding requests to target proxy"""
    
    def __init__(self, target_url: str, error_logger=None, config=None):
        """Initialize proxy client with target URL and optional error logger"""
        self.target_url = target_url.rstrip('/')
        self.error_logger = error_logger
        self.config = config
        self.response_parser = ResponseParser(config) if config else None
    
    def forward_request(self, request_data: Dict[str, Any], 
                       headers: Optional[Dict[str, str]] = None,
                       timeout: Optional[int] = None,
                       retry_count: Optional[int] = None,
                       endpoint: str = "/chat/completions",
                       method: str = "POST") -> Any:
        """Forward request to target proxy"""
        
        # Construct the full URL with endpoint
        if endpoint:
            target_url = urljoin(self.target_url, endpoint)
        else:
            target_url = self.target_url
        logger.info(f"Target URL: {target_url}")
        logger.info(f"Method: {method}")
        
        # Prepare headers
        request_headers = {
            "Content-Type": "application/json",
            "User-Agent": "SillyTavern-Proxy/1.0"
        }

        # Forward headers from SillyTavern (including Authorization/API keys)
        # But filter out problematic headers that should not be forwarded
        if headers:
            for key, value in headers.items():
                if key.lower() not in SKIP_HEADERS:
                    request_headers[key] = value

        # Override with config's API key if provided
        if self.config:
            proxy_config = self.config.get_target_proxy_config()
            config_apikey = proxy_config.get("apikey")
            if config_apikey:
                request_headers["Authorization"] = f"Bearer {config_apikey}"
                logger.info("Using API key from config file (overriding incoming authorization)")
        
        # Add retry count header if provided
        if retry_count is not None:
            request_headers["X-Retry-Count"] = str(retry_count)
        
        logger.info(f"Request headers: {sanitize_headers_for_logging(request_headers)}")
        
        # Prepare request parameters
        request_params = {
            "method": method,
            "url": target_url,
            "headers": request_headers,
            "json": request_data
        }
        
        if timeout is not None:
            request_params["timeout"] = timeout
        
        logger.info(f"Request timeout: {timeout}")
        logger.info(f"Making HTTP request to: {target_url}")
        
        # Make the request
        response = requests.request(**request_params)
        
        # Log response details
        logger.info(f"=== HTTP RESPONSE ===")
        logger.info(f"Status code: {response.status_code}")
        logger.info(f"Response headers: {sanitize_headers_for_logging(dict(response.headers))}")
        logger.info(f"Response size: {len(response.content)} bytes")
        
        # Handle streaming responses
        if request_data.get("stream", False):
            logger.info("Handling streaming response")
            return response
        
        # Handle non-streaming responses
        if response.status_code == 200:
            try:
                response_json = response.json()
                logger.info(f"Successfully parsed JSON response")
                logger.info(f"Response content preview: {str(response.text)[:500]}...")
                
                # Parse response and recategorize status if needed
                if self.response_parser:
                    new_status, parsing_info = self.response_parser.parse_and_recategorize(response.text, response.status_code)
                    if parsing_info.get("recategorized", False):
                        logger.info(f"Response status recategorized: {response.status_code} → {new_status}")
                        # Create a new response object with the recategorized status
                        response.status_code = new_status
                        # If it's now an error status, raise HTTPError to trigger retry logic
                        if new_status >= 400:
                            response.raise_for_status()
                
                # Apply response processing rules if enabled
                if self.config and hasattr(self.config, 'get_response_processing_config'):
                    response_processing_config = self.config.get_response_processing_config()
                    logger.info(f"Response processing config: {response_processing_config}")
                    if response_processing_config.get("enabled", False):
                        rules = response_processing_config.get("rules", [])
                        logger.info(f"Response processing rules: {rules}")
                        if rules:
                            logger.info(f"Applying response processing rules ({len(rules)} rules)")
                            original_response = response_json.copy()
                            response_json = process_response_with_regex(response_json, rules)
                            logger.info(f"Response processing completed")
                else:
                    logger.info("Response processing config not available or config object missing")
                
                # Check for blank content in chat completions
                if self._is_blank_response(response_json):
                    logger.warning(f"Detected blank response content, retry_count: {retry_count or 0}")
                    if retry_count is None or retry_count < 3:  # Max 3 retries for blank content
                        new_retry_count = (retry_count or 0) + 1
                        logger.info(f"Retrying request due to blank content (attempt {new_retry_count})")
                        return self.forward_request(
                            request_data, 
                            headers=headers, 
                            timeout=timeout, 
                            retry_count=new_retry_count,
                            endpoint=endpoint,
                            method=method
                        )
                    else:
                        logger.error("Max retries for blank content reached, returning blank response")
                
                return response_json
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {e}")
                logger.error(f"Response text: {response.text}")
                
                # Parse response and recategorize status even for non-JSON responses
                if self.response_parser:
                    new_status, parsing_info = self.response_parser.parse_and_recategorize(response.text, response.status_code)
                    if parsing_info.get("recategorized", False):
                        logger.info(f"Response status recategorized: {response.status_code} → {new_status}")
                        response.status_code = new_status
                        if new_status >= 400:
                            response.raise_for_status()
                
                # Log to error logger if available
                if hasattr(self, 'error_logger') and self.error_logger:
                    self.error_logger.log_error(e, {
                        "context": "json_decode_error",
                        "response_text": response.text[:1000],
                        "status_code": response.status_code,
                        "url": target_url
                    })
                raise json.JSONDecodeError("Invalid JSON response", response.text, 0)
        else:
            logger.error(f"HTTP error: {response.status_code}")
            logger.error(f"Error response text: {response.text}")
            
            # Check for hard stop conditions before recategorization
            if self.config and hasattr(self.config, 'get_error_handling_config'):
                error_config = self.config.get_error_handling_config()
                hard_stop_config = error_config.get("hard_stop_conditions", {})
                if hard_stop_config.get("enabled", False):
                    hard_stop_rules = hard_stop_config.get("rules", [])
                    for rule in hard_stop_rules:
                        pattern = rule.get('pattern', '')
                        if pattern and re.search(pattern, response.text, re.IGNORECASE):
                            logger.warning(f"Hard stop condition matched in proxy client: {rule.get('description', 'Unknown')}")
                            # Return formatted response instead of raising error
                            return self._format_hard_stop_response(response, rule)
            
            # Parse response and recategorize status for non-200 responses too
            if self.response_parser:
                new_status, parsing_info = self.response_parser.parse_and_recategorize(response.text, response.status_code)
                if parsing_info.get("recategorized", False):
                    logger.info(f"Response status recategorized: {response.status_code} → {new_status}")
                    response.status_code = new_status
            
            # Raise HTTPError for non-200 responses - this will be caught by ErrorHandler
            response.raise_for_status()
        
        return response.json()
    
    def _is_blank_response(self, response_json: Dict[str, Any]) -> bool:
        """Check if the response has blank content that should trigger a retry"""
        try:
            # Check if this is a chat completion response
            if response_json.get("object") == "chat.completion":
                choices = response_json.get("choices", [])
                if choices:
                    message = choices[0].get("message", {})
                    content = message.get("content", "")
                    
                    # Check if content is empty or only whitespace
                    if not content or content.strip() == "":
                        logger.warning("Detected blank content in chat completion response")
                        return True
                    
                    # Check for specific error patterns in content
                    content_lower = content.lower()
                    for pattern in BLANK_RESPONSE_PATTERNS:
                        if pattern.lower() in content_lower:
                            logger.warning(f"Detected error pattern in content: {pattern}")
                            return True
                
                # Check finish_reason for MAX_TOKENS with very low completion_tokens
                if choices:
                    finish_reason = choices[0].get("finish_reason", "")
                    usage = response_json.get("usage", {})
                    completion_tokens = usage.get("completion_tokens", 0)
                    
                    if finish_reason == "MAX_TOKENS" and completion_tokens < 10:
                        logger.warning(f"Detected MAX_TOKENS with very low completion_tokens: {completion_tokens}")
                        return True
            
            return False
        except Exception as e:
            logger.error(f"Error checking for blank response: {e}")
            # Log to error logger if available
            if hasattr(self, 'error_logger') and self.error_logger:
                self.error_logger.log_error(e, {"context": "blank_response_check", "response_json": str(response_json)[:500]})
            return False
    
    def _format_hard_stop_response(self, response, hard_stop_rule: Dict[str, Any]) -> Dict[str, Any]:
        """Format response with hard stop user message in OpenAI-compatible format"""
        # Get the user message if configured
        user_message = ""
        if hard_stop_rule.get('add_user_message', False):
            user_message = hard_stop_rule.get('user_message', '')
        
        # Create OpenAI-compatible error response
        error_response = {
            "error": {
                "message": user_message if user_message else "Request failed due to downstream provider error",
                "type": "hard_stop_error",
                "code": "hard_stop_condition_met"
            }
        }
        
        # Add original error details for debugging if available
        if hasattr(response, 'text'):
            try:
                original_response = json.loads(response.text)
                if 'error' in original_response:
                    if isinstance(original_response['error'], dict):
                        error_response["error"]["original_error"] = original_response['error']
                    else:
                        error_response["error"]["original_error"] = {"message": original_response['error']}
                if 'proxy_note' in original_response:
                    error_response["error"]["proxy_note"] = original_response['proxy_note']
            except json.JSONDecodeError:
                error_response["error"]["original_error"] = {"message": response.text}
        
        return error_response
