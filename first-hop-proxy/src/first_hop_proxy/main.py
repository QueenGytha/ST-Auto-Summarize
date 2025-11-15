"""
Main application module for First Hop Proxy
"""
import copy
import json
import logging
import uuid
import time
import sys
import os
from typing import Dict, Any, Optional, List
from flask import Flask, request, jsonify, Response, make_response
from flask_cors import CORS
from requests.exceptions import HTTPError

from .config import Config
from .proxy_client import ProxyClient
from .error_handler import ErrorHandler
from .request_logger import RequestLogger
from .error_logger import ErrorLogger
from .utils import (
    sanitize_headers_for_logging,
    process_messages_with_regex,
    extract_character_chat_info,
    extract_st_metadata_from_messages,
    extract_lorebook_entries_from_messages,
    strip_lorebook_attributes_from_messages
)
from .constants import DEFAULT_MODELS

logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize components
config = Config()
# Only load config file if not in testing mode
if not os.environ.get('TESTING'):
    config.load_from_file("config.yaml")
error_handler = ErrorHandler()

# Global request logger - will be initialized after config is loaded
global request_logger
request_logger = None

# Global error logger - will be initialized after config is loaded
global error_logger
error_logger = None


def get_config_name_from_path(path: str) -> str:
    """
    Extract config filename from URL path.

    Examples:
        /aboba-gemini -> config-aboba-gemini.yaml
        /my-config -> config-my-config.yaml
        / -> config.yaml (default)

    Args:
        path: URL path (e.g., "/aboba-gemini")

    Returns:
        Config filename (e.g., "config-aboba-gemini.yaml")
    """
    # Remove leading/trailing slashes and whitespace
    path = path.strip().strip('/')

    # If empty, return default config
    if not path:
        return "config.yaml"

    # Convert path to config filename
    # e.g., "aboba-gemini" -> "config-aboba-gemini.yaml"
    return f"config-{path}.yaml"


def load_config_for_request(config_name: str) -> Config:
    """
    Load a specific config file for a request.

    Args:
        config_name: Config filename (e.g., "config-aboba-gemini.yaml")

    Returns:
        Config object loaded from the specified file

    Raises:
        FileNotFoundError: If config file doesn't exist
    """
    request_config = Config()

    # Check if config file exists
    if not os.path.exists(config_name):
        raise FileNotFoundError(f"Config file not found: {config_name}")

    # Load the config file
    request_config.load_from_file(config_name)
    logger.info(f"Loaded config from: {config_name}")

    return request_config


def forward_request(request_data: Dict[str, Any], headers: Optional[Dict[str, str]] = None, request_config: Optional[Config] = None, original_request_data: Optional[Dict[str, Any]] = None, stripped_metadata: Optional[List[Dict[str, Any]]] = None, lorebook_entries: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Forward request to target proxy with error handling and retry logic"""
    # Generate request ID for logging
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()
    response_data = None
    error = None
    character_chat_info = None
    log_filepath = None

    try:
        # Extract character/chat info for organized logging
        # Use original_request_data if provided, otherwise use cleaned request_data
        # This will raise ValueError if ST_METADATA is present but malformed
        character_chat_info = extract_character_chat_info(headers or {}, original_request_data or request_data)

        # Start request log immediately
        if request_logger:
            try:
                log_filepath = request_logger.start_request_log(
                    request_id=request_id,
                    endpoint="/chat/completions",
                    request_data=request_data,
                    headers=headers or {},
                    start_time=start_time,
                    character_chat_info=character_chat_info,
                    original_request_data=original_request_data,
                    stripped_metadata=stripped_metadata,
                    lorebook_entries=lorebook_entries
                )
            except Exception as log_error:
                logger.error(f"Failed to start request log: {log_error}")

        # Log incoming request to console
        print("=" * 80, flush=True)
        print(f"INCOMING REQUEST [{request_id}]", flush=True)
        if stripped_metadata:
            print(f"ST_METADATA: {json.dumps(stripped_metadata, indent=2)}", flush=True)
            print("--- ORIGINAL (AS RECEIVED) ---", flush=True)
            print(f"Request Data: {json.dumps(original_request_data, indent=2)}", flush=True)
            print("--- FORWARDED (AFTER STRIPPING) ---", flush=True)
            print(f"Request Data: {json.dumps(request_data, indent=2)}", flush=True)
        else:
            print(f"Request Data: {json.dumps(request_data, indent=2)}", flush=True)
        print(f"Headers: {json.dumps(sanitize_headers_for_logging(headers or {}), indent=2)}", flush=True)
        print("=" * 80, flush=True)
        # Use request-specific config if provided, otherwise use global config
        active_config = request_config if request_config is not None else config

        # Get target proxy configuration
        proxy_config = active_config.get_target_proxy_config()
        target_url = proxy_config.get("url")
        if not target_url:
            raise ValueError("target_proxy.url is not configured")

        # Get error handling configuration
        error_config = active_config.get_error_handling_config()
        max_retries = error_config.get("max_retries", 10)
        base_delay = error_config.get("base_delay", 1.0)
        max_delay = error_config.get("max_delay", 60.0)
        retry_codes = error_config.get("retry_codes", [429, 502, 503, 504])
        fail_codes = error_config.get("fail_codes", [400, 401, 403])
        conditional_retry_codes = error_config.get("conditional_retry_codes", [404, 411, 412])

        # Get hard stop configuration
        hard_stop_config = error_config.get("hard_stop_conditions", {})

        # Create error handler with configuration and error logger
        error_handler = ErrorHandler(
            max_retries=max_retries,
            base_delay=base_delay,
            max_delay=max_delay,
            error_logger=error_logger,
            hard_stop_config=hard_stop_config,
            retry_codes=retry_codes,
            fail_codes=fail_codes,
            conditional_retry_codes=conditional_retry_codes
        )

        # Create proxy client with error logger
        proxy_client = ProxyClient(target_url, error_logger=error_logger, config=active_config)

        # Define the request function that will be retried
        def make_request():
            return proxy_client.forward_request(request_data, headers=headers, endpoint="")

        # Create context for error handling
        context = {
            "request_type": "forward_request",
            "target_url": target_url,
            "timestamp": time.time(),
            "character_chat_info": character_chat_info
        }

        # Use error handler for retries
        response_data = error_handler.retry_with_backoff(make_request, context)

        # Check if this is an error response (dict with _proxy_error flag)
        if isinstance(response_data, dict) and response_data.get('_proxy_error'):
            status_code = response_data.pop('_status_code')
            response_data.pop('_proxy_error')
            print("=" * 80, flush=True)
            print(f"OUTGOING RESPONSE [{request_id}] - Client Error {status_code}", flush=True)
            print(f"Error Response: {json.dumps(response_data, indent=2)}", flush=True)
            print(f"Duration: {time.time() - start_time:.3f}s", flush=True)
            print(f"Response data type: {type(response_data)}", flush=True)
            print(f"Response data keys: {list(response_data.keys())}", flush=True)
            print("=" * 80, flush=True)
            # Return tuple - Flask will handle it
            response = jsonify(response_data)
            response.status_code = status_code
            return response

        # Log successful response to console
        print("=" * 80, flush=True)
        print(f"OUTGOING RESPONSE [{request_id}] - Success", flush=True)
        print(f"Response Data: {json.dumps(response_data, indent=2)}", flush=True)
        print(f"Duration: {time.time() - start_time:.3f}s", flush=True)
        print("=" * 80, flush=True)

        return response_data

    except Exception as e:
        error = e

        # Log error response to console
        print("=" * 80, flush=True)
        print(f"OUTGOING RESPONSE [{request_id}] - ERROR", flush=True)
        print(f"Error Type: {type(e).__name__}", flush=True)
        print(f"Error Message: {str(e)}", flush=True)
        print(f"Duration: {time.time() - start_time:.3f}s", flush=True)
        print("=" * 80, flush=True)

        # Log to error logger if available
        if error_logger:
            error_logger.log_error(e, {
                "context": "forward_request",
                "error_type": "forward_request_error"
            }, character_chat_info=character_chat_info)

        # Re-raise the exception to return 500
        raise

    finally:
        # Complete request log with response data
        end_time = time.time()
        duration = end_time - start_time

        if request_logger and log_filepath:
            try:
                request_logger.complete_request_log(
                    filepath=log_filepath,
                    response_data=response_data,
                    response_headers={},
                    end_time=end_time,
                    duration=duration,
                    error=error
                )
            except Exception as log_error:
                logger.error(f"Failed to complete request log: {log_error}")


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})


@app.route('/health/detailed', methods=['GET'])
def detailed_health_check():
    """Detailed health check endpoint with retry configuration"""
    try:
        error_config = config.get_error_handling_config()
        return jsonify({
            "status": "healthy",
            "retry_config": {
                "max_retries": error_config.get("max_retries", 10),
                "base_delay": error_config.get("base_delay", 1.0),
                "max_delay": error_config.get("max_delay", 60.0)
            }
        })
    except Exception as e:
        logger.error(f"Error in detailed health check: {e}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 500


@app.route('/models', methods=['GET'], defaults={'config_path': None})
@app.route('/<path:config_path>/models', methods=['GET'])
def models_endpoint(config_path):
    """Models endpoint that forwards to target proxy with optional config path parameter"""
    # Generate request ID for logging
    request_id = str(uuid.uuid4())[:8]
    response_data = None
    error = None
    character_chat_info = None

    try:
        # Extract character/chat info for organized logging (GET request has no body)
        character_chat_info = extract_character_chat_info(dict(request.headers), {})
        # Load config based on path parameter
        request_config = None
        if config_path:
            config_name = get_config_name_from_path(config_path)
            try:
                request_config = load_config_for_request(config_name)
                logger.info(f"Using config: {config_name} for models endpoint with path: {config_path}")
            except FileNotFoundError as e:
                error_msg = f"Config file not found for path '{config_path}': {config_name}"
                logger.error(error_msg)
                return jsonify({"error": {"message": error_msg, "type": "config_not_found", "config_path": config_path, "expected_file": config_name}}), 404

        # Use the appropriate config (request-specific or global default)
        active_config = request_config if request_config is not None else config

        # Get target proxy configuration
        proxy_config = active_config.get_target_proxy_config()
        target_url = proxy_config.get("url")
        if not target_url:
            raise ValueError("target_proxy.url is not configured")

        # Extract base URL by removing /chat/completions from the end
        base_url = target_url.replace("/chat/completions", "")
        models_url = f"{base_url}/models"

        # Create proxy client for models endpoint with error logger
        proxy_client = ProxyClient(models_url, error_logger=error_logger, config=active_config)

        # Create error handler for models request
        error_config = active_config.get_error_handling_config()
        max_retries = error_config.get("max_retries", 10)
        base_delay = error_config.get("base_delay", 1.0)
        max_delay = error_config.get("max_delay", 60.0)
        retry_codes = error_config.get("retry_codes", [429, 502, 503, 504])
        fail_codes = error_config.get("fail_codes", [400, 401, 403])
        conditional_retry_codes = error_config.get("conditional_retry_codes", [404, 411, 412])

        # Get hard stop configuration
        hard_stop_config = error_config.get("hard_stop_conditions", {})

        models_error_handler = ErrorHandler(
            max_retries=max_retries,
            base_delay=base_delay,
            max_delay=max_delay,
            error_logger=error_logger,
            hard_stop_config=hard_stop_config,
            retry_codes=retry_codes,
            fail_codes=fail_codes,
            conditional_retry_codes=conditional_retry_codes
        )

        # Define the models request function
        def make_models_request():
            return proxy_client.forward_request(
                request_data={},  # Empty for GET request
                headers=dict(request.headers),
                method="GET",
                endpoint=""  # Use empty endpoint since models_url already includes /models
            )

        # Forward the request with error handling and context
        context = {
            "request_type": "models_request",
            "models_url": models_url,
            "timestamp": time.time(),
            "character_chat_info": character_chat_info
        }

        response_data = models_error_handler.retry_with_backoff(make_models_request, context)

        # Log the models request
        if request_logger:
            try:
                request_logger.log_models_request(
                    request_id=request_id,
                    headers=dict(request.headers),
                    response_data=response_data,
                    error=None,
                    character_chat_info=character_chat_info
                )
            except Exception as log_error:
                logger.error(f"Failed to log models request: {log_error}")

        return jsonify(response_data)

    except Exception as e:
        logger.error(f"Error in models endpoint: {e}")
        error = e

        # Log the failed models request
        if request_logger:
            try:
                request_logger.log_models_request(
                    request_id=request_id,
                    headers=dict(request.headers),
                    response_data=None,
                    error=error,
                    character_chat_info=character_chat_info
                )
            except Exception as log_error:
                logger.error(f"Failed to log models request error: {log_error}")

        # Return fallback models if target proxy fails
        from .constants import DEFAULT_MODELS
        return jsonify({
            "object": "list",
            "data": DEFAULT_MODELS
        })



@app.route('/chat/completions', methods=['POST'], defaults={'config_path': None})
@app.route('/<path:config_path>/chat/completions', methods=['POST'])
def chat_completions(config_path):
    """Chat completions endpoint with optional config path parameter"""
    try:
        # Load config based on path parameter
        request_config = None
        if config_path:
            config_name = get_config_name_from_path(config_path)
            try:
                request_config = load_config_for_request(config_name)
                logger.info(f"Using config: {config_name} for path: {config_path}")
            except FileNotFoundError as e:
                error_msg = f"Config file not found for path '{config_path}': {config_name}"
                logger.error(error_msg)
                return jsonify({"error": {"message": error_msg, "type": "config_not_found", "config_path": config_path, "expected_file": config_name}}), 404

        # Use the appropriate config (request-specific or global default)
        active_config = request_config if request_config is not None else config

        # Get request data
        if not request.is_json:
            return jsonify({"error": {"message": "Content-Type must be application/json"}}), 400

        try:
            request_data = request.get_json()
        except Exception as e:
            return jsonify({"error": {"message": "Invalid JSON in request body"}}), 400

        if not request_data:
            return jsonify({"error": {"message": "No JSON data provided"}}), 400

        # Save original request data for logging (before any modifications)
        # Use deep copy to ensure original is completely isolated from any modifications
        original_request_data = copy.deepcopy(request_data)

        # Validate required fields
        if "messages" not in request_data:
            return jsonify({"error": {"message": "Missing required field: messages"}}), 400

        # Process messages with regex if configured
        if "messages" in request_data:
            regex_config = active_config.get_regex_replacement_config()
            if regex_config.get("enabled", False):
                rules = regex_config.get("rules", [])
                if rules:
                    request_data = request_data.copy()
                    request_data["messages"] = process_messages_with_regex(request_data["messages"], rules)

        # Extract lorebook entries from messages before stripping (use original_request_data)
        lorebook_entries = None
        if "messages" in original_request_data:
            lorebook_entries = extract_lorebook_entries_from_messages(original_request_data["messages"])
            if lorebook_entries:
                logger.info(f"Extracted {len(lorebook_entries)} lorebook entries")

        # Strip ST_METADATA from messages before forwarding
        # IMPORTANT: Extract from original_request_data to avoid regex interference
        stripped_metadata = None
        if "messages" in original_request_data:
            all_metadata, cleaned_messages = extract_st_metadata_from_messages(original_request_data["messages"])
            if all_metadata:
                # Store all metadata for logging
                stripped_metadata = all_metadata
                # Log that we found and stripped metadata (show all blocks)
                for i, metadata in enumerate(all_metadata):
                    logger.info(f"Stripped ST_METADATA block {i+1} - Chat: {metadata.get('chat')}, Operation: {metadata.get('operation')}")
                # Apply stripping to current request_data (which may have had regex applied)
                request_data = request_data.copy()
                # Extract again from current request_data to get cleaned messages
                _, request_cleaned_messages = extract_st_metadata_from_messages(request_data["messages"])
                request_data["messages"] = request_cleaned_messages

        # Strip lorebook attributes from messages before forwarding
        if lorebook_entries and "messages" in request_data:
            logger.info(f"Stripping lorebook attributes from {len(lorebook_entries)} entries")
            request_data = request_data.copy()
            request_data["messages"] = strip_lorebook_attributes_from_messages(request_data["messages"])

        # Forward the request with the appropriate config
        # Pass both original and cleaned data for logging
        result = forward_request(
            request_data,
            dict(request.headers),
            request_config=request_config,
            original_request_data=original_request_data,
            stripped_metadata=stripped_metadata,
            lorebook_entries=lorebook_entries
        )
        return jsonify(result)

    except ValueError as e:
        # Malformed ST_METADATA or validation errors - return 400 Bad Request
        logger.error(f"Validation error in chat completions: {e}")
        return jsonify({"error": {"message": str(e), "type": "validation_error"}}), 400
    except Exception as e:
        # Unexpected errors - return 500 Internal Server Error
        logger.error(f"Error in chat completions: {e}")
        return jsonify({"error": {"message": str(e)}}), 500


def main():
    """Main entry point for the application"""
    try:
        # Initialize loggers
        global request_logger, error_logger
        
        # Initialize error logger first (request logger depends on it)
        error_logger = ErrorLogger(config)

        # Initialize request logger with error logger dependency
        request_logger = RequestLogger(config, error_logger=error_logger)
        
        # Get server configuration
        server_config = config.get_server_config()
        host = server_config.get("host", "0.0.0.0")
        port = server_config.get("port", 5000)
        debug = server_config.get("debug", False)

        # Get proxy configuration
        proxy_config = config.get_target_proxy_config()
        target_url = proxy_config.get("url", "Not configured")

        # Print startup banner
        print("=" * 80, flush=True)
        print("FIRST HOP PROXY - STARTING", flush=True)
        print("=" * 80, flush=True)
        print(f"Server Address: http://{host}:{port}", flush=True)
        print(f"Target Proxy URL: {target_url}", flush=True)
        print(f"Request Logging: {'Enabled' if request_logger.enabled else 'Disabled'}", flush=True)
        print(f"Error Logging: {'Enabled' if error_logger.enabled else 'Disabled'}", flush=True)
        print(f"Debug Mode: {'Enabled' if debug else 'Disabled'}", flush=True)
        print("=" * 80, flush=True)
        print("Ready to accept requests. Press Ctrl+C to stop.", flush=True)
        print("=" * 80, flush=True)

        # Start Flask server
        print(f"\nServing on http://{host}:{port}\n", flush=True)
        app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
        
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
