"""
Constants for the seaking-proxy middleware
"""

# Default models list
DEFAULT_MODELS = [
    {"id": "gpt-3.5-turbo", "object": "model"},
    {"id": "gpt-4", "object": "model"},
    {"id": "claude-3-sonnet", "object": "model"},
    {"id": "claude-3-opus", "object": "model"}
]

# HTTP Status Codes
RETRY_CODES = [429, 502, 503, 504, 505, 507, 508, 511, 408, 409, 410, 423, 424, 425, 426, 428, 431, 451]
FAIL_CODES = [400, 401, 403, 405, 406, 407, 411, 412, 413, 414, 415, 416, 417, 418, 421, 422]
CONDITIONAL_RETRY_CODES = [404, 411, 412, 413, 414, 416, 417, 418, 421, 423, 424, 425, 426, 428, 431, 451]

# Sensitive headers that should be sanitized in logs
SENSITIVE_HEADERS = {'authorization', 'x-api-key', 'api-key'}

# Headers that should NOT be forwarded to target proxy
SKIP_HEADERS = {
    'host', 'content-length', 'connection', 'keep-alive',
    'proxy-connection', 'upgrade', 'transfer-encoding'
}

# Error patterns that indicate blank responses
BLANK_RESPONSE_PATTERNS = [
    "I'm sorry, I can't",
    "I cannot",
    "I'm unable to",
    "Content policy",
    "Safety filter",
    "Inappropriate content"
]

# Default configuration values
DEFAULT_CONFIG = {
    "error_handling": {
        "retry_codes": RETRY_CODES,
        "fail_codes": FAIL_CODES,
        "conditional_retry_codes": CONDITIONAL_RETRY_CODES,
        "max_retries": 10,
        "base_delay": 1,
        "max_delay": 60
    },
    "server": {
        "host": "0.0.0.0",
        "port": 8765,
        "debug": False
    },
    "logging": {
        "enabled": True,
        "folder": "logs",
        "include_request_data": True,
        "include_response_data": True,
        "include_headers": True,
        "include_timing": True
    },
    "error_logging": {
        "enabled": True,
        "folder": "logs/errors",
        "include_stack_traces": True,
        "include_request_context": True,
        "include_timing": True,
        "max_file_size_mb": 10,
        "max_files": 100
    },
    "response_parsing": {
        "enabled": True,
        "status_recategorization": {
            "enabled": True,
            "rules": [
                {
                    "pattern": "The model is overloaded",
                    "original_status": 200,
                    "new_status": 429,
                    "description": "Recategorize Google AI overload errors as rate limit"
                },
                {
                    "pattern": "service unavailable",
                    "original_status": 200,
                    "new_status": 429,
                    "description": "Recategorize service unavailable as rate limit"
                },
                {
                    "pattern": "model.*capacity",
                    "original_status": 200,
                    "new_status": 429,
                    "description": "Recategorize model capacity errors as rate limit"
                },
                {
                    "pattern": "HTTP 503 Service Unavailable",
                    "original_status": 200,
                    "new_status": 503,
                    "description": "Recategorize proxy-wrapped 503 errors"
                },
                {
                    "pattern": "Upstream service unavailable",
                    "original_status": 200,
                    "new_status": 503,
                    "description": "Recategorize upstream service errors"
                }
            ]
        },
        "json_extraction": {
            "enabled": True,
            "paths": [
                "error.message",
                "proxy_note",
                "choices[0].finish_reason",
                "choices[0].message.content"
            ]
        },
        "logging": {
            "enabled": True,
            "log_recategorization": True,
            "include_original_status": True,
            "include_new_status": True,
            "include_matched_pattern": True
        }
    }
}
