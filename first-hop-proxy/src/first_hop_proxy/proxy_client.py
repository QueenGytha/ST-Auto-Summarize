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

        # Initialize response parser with error handling
        if config:
            try:
                self.response_parser = ResponseParser(config)
                logger.warning(f"DEBUG: ResponseParser initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize ResponseParser: {e}")
                logger.error(f"Config type: {type(config)}")
                logger.error(f"Config has get_response_parsing_config? {hasattr(config, 'get_response_parsing_config')}")
                self.response_parser = None
        else:
            logger.warning(f"DEBUG: Config is None, ResponseParser will be None")
            self.response_parser = None
    
    def forward_request(self, request_data: Dict[str, Any], 
                       headers: Optional[Dict[str, str]] = None,
                       timeout: Optional[int] = None,
                       retry_count: Optional[int] = None,
                       endpoint: str = "/chat/completions",
                       method: str = "POST",
                       log_filepath: Optional[str] = None,
                       request_logger: Optional[Any] = None,
                       request_id: Optional[str] = None) -> Any:
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

                # DEBUG: Check if this is an error response
                if isinstance(response_json, dict) and 'error' in response_json:
                    logger.warning(f"DEBUG: Response contains error object: {response_json.get('error')}")
                
                # Parse response and recategorize status if needed
                logger.warning(f"DEBUG: response_parser exists? {self.response_parser is not None}")
                if self.response_parser:
                    new_status, parsing_info = self.response_parser.parse_and_recategorize(response.text, response.status_code)
                    logger.warning(f"DEBUG: parsing_info = {parsing_info}")
                    if parsing_info.get("recategorized", False):
                        logger.info(f"Response status recategorized: {response.status_code} → {new_status}")
                        # Update response status code
                        response.status_code = new_status
                        # If it's now an error status, manually raise HTTPError to trigger retry logic
                        logger.warning(f"DEBUG: About to raise HTTPError for status {new_status}")
                        if new_status >= 400:
                            # Manually raise HTTPError instead of calling raise_for_status()
                            # because modifying response.status_code doesn't update internal state
                            from requests.exceptions import HTTPError as RequestsHTTPError
                            error_msg = f"{new_status} Error: {parsing_info.get('description', 'Rate limit or server error')}"
                            raise RequestsHTTPError(error_msg, response=response)
                else:
                    logger.warning("DEBUG: response_parser is None! Not checking for rate limits.")
                
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
                blank_response_details = self._is_blank_response(response_json)
                if blank_response_details:
                    matched_pattern = blank_response_details.get("matched_pattern")
                    reason_label_key = blank_response_details.get("reason", "blank_response")
                    reason_label = {
                        "empty_content": "empty content",
                        "pattern_match": "content matched refusal pattern",
                        "max_tokens_low_output": "early stop with minimal output",
                    }.get(reason_label_key, reason_label_key)
                    content_preview = self._build_content_preview(blank_response_details.get("content"))
                    will_retry = retry_count is None or retry_count < 3
                    next_retry_attempt = (retry_count or 0) + 1 if will_retry else None

                    reason_parts = [reason_label]
                    if matched_pattern:
                        reason_parts.append(f"pattern '{matched_pattern}'")
                    reason_description = " - ".join(reason_parts)

                    logger.warning(f"Detected blank/blocked response ({reason_description}), retry_count: {retry_count or 0}")

                    note_reason = reason_description if will_retry else f"{reason_description} (blank-response retry limit reached)"

                    if request_logger and log_filepath and hasattr(request_logger, "append_retry_note"):
                        try:
                            request_logger.append_retry_note(
                                filepath=log_filepath,
                                reason=note_reason,
                                retry_attempt=next_retry_attempt,
                                matched_pattern=matched_pattern,
                                content_preview=content_preview,
                                request_id=request_id
                            )
                        except Exception as log_error:
                            logger.error(f"Failed to append blank response retry note: {log_error}")

                    if will_retry:  # Max 3 retries for blank content
                        new_retry_count = next_retry_attempt
                        logger.info(f"Retrying request due to blank content (attempt {new_retry_count})")
                        return self.forward_request(
                            request_data, 
                            headers=headers, 
                            timeout=timeout, 
                            retry_count=new_retry_count,
                            endpoint=endpoint,
                            method=method,
                            log_filepath=log_filepath,
                            request_logger=request_logger,
                            request_id=request_id
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
                            from requests.exceptions import HTTPError as RequestsHTTPError
                            error_msg = f"{new_status} Error: {parsing_info.get('description', 'Rate limit or server error')}"
                            raise RequestsHTTPError(error_msg, response=response)
                
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

            # For retryable 4xx errors (like 429 rate limit), raise HTTPError to trigger retry logic
            # Common retryable 4xx codes: 408 (timeout), 429 (rate limit), 423 (locked), etc.
            retryable_4xx_codes = [408, 423, 429]
            if response.status_code in retryable_4xx_codes:
                logger.warning(f"Retryable client error {response.status_code}, raising HTTPError to trigger retry")
                from requests.exceptions import HTTPError as RequestsHTTPError
                error_msg = f"{response.status_code} Error: Retryable client error"
                raise RequestsHTTPError(error_msg, response=response)

            # For permanent client errors (4xx), don't raise - let the caller handle the error response
            # The API error details are in the response body
            if 400 <= response.status_code < 500:
                logger.warning(f"Client error {response.status_code}, returning error response body")
                # Try to parse JSON, fall back to text if it fails
                try:
                    error_data = response.json()
                except json.JSONDecodeError:
                    # Non-JSON response (e.g., CloudFlare HTML error page)
                    logger.warning(f"Non-JSON error response, capturing as text")
                    error_data = {
                        'error': {
                            'message': f'HTTP {response.status_code} error',
                            'type': 'non_json_error',
                            'response_text': response.text[:1000]  # Limit size
                        }
                    }

                # Return a dict with error flag and status code
                return {
                    '_proxy_error': True,
                    '_status_code': response.status_code,
                    **error_data
                }

            # For server errors (5xx), raise so retry logic kicks in
            response.raise_for_status()

        # Fallback (should be unreachable, but handle gracefully)
        try:
            return response.json()
        except json.JSONDecodeError:
            logger.error(f"Unexpected non-JSON response at fallback return")
            return {
                'error': {
                    'message': 'Unexpected non-JSON response',
                    'type': 'fallback_error',
                    'response_text': response.text[:1000]
                }
            }
    
    def _is_blank_response(self, response_json: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Return details when the response has blank/refusal content that should trigger a retry"""
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
                        return {
                            "reason": "empty_content",
                            "content": content or ""
                        }
                    
                    # Check for specific error patterns in content
                    content_lower = content.lower().strip()
                    for pattern in BLANK_RESPONSE_PATTERNS:
                        if content_lower.startswith(pattern.lower()):
                            logger.warning(f"Detected error pattern in content: {pattern}")
                            return {
                                "reason": "pattern_match",
                                "matched_pattern": pattern,
                                "content": content
                            }
                
                # Check finish_reason for MAX_TOKENS with very low completion_tokens
                if choices:
                    finish_reason = choices[0].get("finish_reason", "")
                    usage = response_json.get("usage", {})
                    completion_tokens = usage.get("completion_tokens", 0)
                    
                    if finish_reason == "MAX_TOKENS" and completion_tokens < 10:
                        logger.warning(f"Detected MAX_TOKENS with very low completion_tokens: {completion_tokens}")
                        return {
                            "reason": "max_tokens_low_output",
                            "finish_reason": finish_reason,
                            "completion_tokens": completion_tokens,
                            "content": choices[0].get("message", {}).get("content", "")
                        }
            
            return None
        except Exception as e:
            logger.error(f"Error checking for blank response: {e}")
            # Log to error logger if available
            if hasattr(self, 'error_logger') and self.error_logger:
                self.error_logger.log_error(e, {"context": "blank_response_check", "response_json": str(response_json)[:500]})
            return None

    def _build_content_preview(self, content: Optional[str], max_length: int = 1000) -> Optional[str]:
        """Create a bounded preview string for logging refusal/blank responses"""
        if content is None:
            return None

        try:
            preview = str(content)
        except Exception:
            preview = ""

        if len(preview) > max_length:
            return f"{preview[:max_length]}\n...\n[truncated]"

        return preview
    
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
