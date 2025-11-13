# Error Logging Guide

## Overview

The first-hop-proxy project now has comprehensive error logging that ensures **every kind of error and retry is logged to the `/logs/errors` subfolder**. This system provides detailed error tracking, debugging capabilities, and operational insights.

## Configuration

Error logging is automatically enabled when logging is enabled in `config.yaml`:

```yaml
logging:
  enabled: true
  folder: "logs"
  # Error logging is automatically enabled when logging is enabled
  # Error logs will be stored in logs/errors/ directory
```

## Error Log Structure

All error logs are stored in the `/logs/errors/` subfolder with the following naming convention:
- `{ErrorCode}_{Timestamp}.log`
- Example: `ValueError_20250830_035213_346.log`

Each error log contains:
- **Header**: Error code, timestamp, and file information
- **Retry Information**: If applicable (attempt number, delay)
- **Error Details**: JSON-formatted error context with full details

## Comprehensive Error Coverage

### 1. Basic Exception Logging
**Location**: `error_logger.py` - `log_error()` method
**Triggers**: Any exception caught throughout the application
**Log File**: `{ExceptionType}_{timestamp}.log`

```python
# Example usage
try:
    # Some operation
    pass
except Exception as e:
    error_logger.log_error(e, {"context": "operation_name"})
```

### 2. HTTP Error Logging
**Location**: `error_logger.py` - `log_error()` method
**Triggers**: HTTP response errors (4xx, 5xx status codes)
**Log File**: `{StatusCode}_{timestamp}.log`

```python
# Example: HTTP 500 error
error_logger.log_error(response, {
    "context": "api_call",
    "url": "https://api.example.com",
    "method": "POST"
})
```

### 3. Retry Attempt Logging
**Location**: `error_logger.py` - `log_retry_attempt()` method
**Triggers**: When retry logic is executed
**Log File**: `{ErrorType}_{timestamp}.log` (with retry metadata)

```python
# Example: Retry attempt
error_logger.log_retry_attempt(error, attempt=1, delay=2.5, context={})
```

### 4. Final Error Logging
**Location**: `error_logger.py` - `log_final_error()` method
**Triggers**: After all retries are exhausted
**Log File**: `{ErrorType}_{timestamp}.log` (marked as final)

```python
# Example: Final error after retries
error_logger.log_final_error(error, total_attempts=3, context={})
```

### 5. Conditional Retry Logging
**Location**: `error_handler.py` - Conditional retry methods
**Triggers**: When conditional retry logic is executed
**Log File**: `{ErrorType}_{timestamp}.log` (with conditional retry metadata)

```python
# Automatically logs during conditional retry operations
error_handler.retry_with_backoff(function, context)
```

### 6. Hard Stop Condition Logging
**Location**: `error_handler.py` - Hard stop condition methods
**Triggers**: When hard stop conditions are matched
**Log File**: `{ErrorType}_{timestamp}.log` (with hard stop metadata)

```python
# Automatically logs when hard stop conditions are triggered
hard_stop_rule = error_handler.check_hard_stop_conditions(response)
if hard_stop_rule:
    error_logger.log_error(response, {
        "context": "hard_stop_condition",
        "hard_stop_rule": hard_stop_rule
    })
```

### 7. Response Parsing Error Logging
**Location**: `response_parser.py` - All parsing methods
**Triggers**: JSON parsing errors, recategorization events, pattern matching failures
**Log File**: `{ErrorType}_{timestamp}.log`

```python
# Logs response parsing errors
try:
    response_json = json.loads(response_text)
    return self._parse_json_response(response_json, original_status)
except json.JSONDecodeError as e:
    error_logger.log_error(e, {
        "context": "response_parsing",
        "response_text": response_text[:500],
        "original_status": original_status
    })
```

### 8. Status Recategorization Logging
**Location**: `response_parser.py` - Recategorization methods
**Triggers**: When status codes are recategorized based on response content
**Log File**: `{ErrorType}_{timestamp}.log`

```python
# Logs status recategorization events
if self._should_apply_rule(rule, original_status, error_messages):
    self._log_recategorization(original_status, new_status, pattern, description)
    error_logger.log_error("Status recategorization", {
        "context": "status_recategorization",
        "original_status": original_status,
        "new_status": new_status,
        "pattern": pattern,
        "description": description
    })
```

### 9. Error Handler Integration
**Location**: `error_handler.py` - All retry methods
**Triggers**: During retry logic execution
**Coverage**: All retry attempts, final errors, conditional retries, and hard stop events

```python
# Automatically logs during retry operations
error_handler.retry_with_backoff(function, context)
```

### 10. Proxy Client Error Logging
**Location**: `proxy_client.py` - All exception handlers
**Triggers**: HTTP request failures, JSON parsing errors, blank response detection
**Coverage**: Network errors, parsing errors, response validation errors

```python
# Automatically logs proxy client errors
proxy_client = ProxyClient(url, error_logger=error_logger)
```

### 11. Request Logger Error Logging
**Location**: `request_logger.py` - File writing operations
**Triggers**: When log file writing fails
**Coverage**: File system errors, permission issues

```python
# Automatically logs request logger errors
request_logger = RequestLogger(config, error_logger=error_logger)
```

### 12. Flask Error Handler Logging
**Location**: `main.py` - Flask error handlers
**Triggers**: HTTP 400, 404, 500 errors
**Coverage**: Bad requests, not found, internal server errors

```python
# Automatically logs Flask errors
@app.errorhandler(400)
def bad_request(error):
    if error_logger:
        error_logger.log_error(400, {"context": "flask_error_handler"})
```

### 13. Configuration Validation Error Logging
**Location**: `main.py` - Startup configuration validation
**Triggers**: Invalid configuration during startup
**Coverage**: Configuration errors, missing required settings

```python
# Logs configuration errors during startup
try:
    config.validate()
except ValueError as e:
    temp_error_logger.log_error(e, {
        "context": "configuration_validation",
        "error_type": "config_validation_error",
        "startup_error": True
    })
```

### 14. JSON Parsing Error Logging
**Location**: `main.py` - Chat completions endpoint
**Triggers**: Invalid JSON in request body
**Coverage**: Malformed JSON, encoding issues

```python
# Logs JSON parsing errors
try:
    request_data = request.get_json()
except Exception as e:
    error_logger.log_error(e, {
        "context": "json_parsing",
        "endpoint": "/chat/completions",
        "error_type": "invalid_json",
        "request_body": request.get_data(as_text=True)[:1000] if request else "unknown"
    })
```

### 15. Health Check Error Logging
**Location**: `main.py` - Health check endpoint
**Triggers**: Errors during health check operations
**Coverage**: Health check failures, retry configuration errors

```python
# Logs health check errors
try:
    # Health check logic
    pass
except Exception as e:
    error_logger.log_error(e, {
        "context": "health_check",
        "endpoint": "/health/detailed",
        "error_type": "health_check_error"
    })
```

### 16. Endpoint-Specific Error Logging
**Location**: `main.py` - All endpoint handlers
**Triggers**: Errors in specific endpoints (/models, /chat/completions)
**Coverage**: Endpoint-specific errors, request forwarding failures

```python
# Logs endpoint-specific errors
try:
    # Endpoint logic
    pass
except Exception as e:
    error_logger.log_error(e, {
        "context": "models_endpoint",
        "endpoint": "/models",
        "error_type": "models_endpoint_error"
    })
```

### 17. Regex Processing Error Logging
**Location**: `utils.py` - Regex replacement functions
**Triggers**: Invalid regex patterns, replacement failures
**Coverage**: Regex compilation errors, replacement processing errors

```python
# Logs regex processing errors
try:
    result = re.sub(pattern, replacement, result, flags=flags)
except (re.error, TypeError, ValueError) as e:
    error_logger.log_error(e, {
        "context": "regex_processing",
        "pattern": pattern,
        "replacement": replacement,
        "flags": flags_str
    })
```

## Error Log Format

Each error log file contains structured information:

```
================================================================================
ERROR LOG - 2025-08-30T03:52:13.346976
================================================================================
Error Code: ValueError
File: ValueError_20250830_035213_346.log

----------------------------------------
RETRY ATTEMPT #1
Retry Delay: 2.50 seconds
----------------------------------------

ERROR DETAILS:
----------------------------------------
{
  "timestamp": "2025-08-30T03:52:13.346929",
  "error_type": "ValueError",
  "error_message": "Test error for basic logging",
  "exception_type": "ValueError",
  "exception_args": ["Test error for basic logging"],
  "context": {
    "test": "basic_error_logging",
    "endpoint": "/chat/completions",
    "request_id": "abc123"
  },
  "retry_attempt": 1,
  "retry_delay": 2.5
}
```

## Error Context Information

Each error log includes rich context:

### Basic Error Information
- `timestamp`: When the error occurred
- `error_type`: Type of error (exception class or HTTP status)
- `error_message`: Human-readable error message

### HTTP Error Information
- `status_code`: HTTP status code
- `status_text`: HTTP status text
- `url`: Request URL
- `headers`: Response headers
- `response_text`: Response body (truncated)

### Exception Information
- `exception_type`: Exception class name
- `exception_args`: Exception arguments
- `http_status_code`: HTTP status (if applicable)
- `http_response_text`: HTTP response (if applicable)

### Context Information
- `context`: Custom context dictionary
- `endpoint`: API endpoint where error occurred
- `request_id`: Unique request identifier
- `duration`: Request duration
- `retry_attempt`: Retry attempt number
- `retry_delay`: Retry delay in seconds

- `failure_count`: Number of failures

## Error Log Management

### Viewing Error Logs
```bash
# List all error logs
ls -la logs/errors/

# View recent error logs
tail -f logs/errors/*.log

# Search for specific error types
grep -r "ValueError" logs/errors/
```

### Error Log Summary
Access error log summary via API:
```bash
ls -la logs/errors/
tail -f logs/errors/*.log
```

### Error Log Cleanup
Error logs are not automatically cleaned up. Consider implementing:
- Log rotation based on size/age
- Archival of old error logs
- Compression of historical logs

## Testing Error Logging

Run the comprehensive test to verify all error logging:
```bash
python3 test_error_logging.py
```

This test covers:
- Basic exception logging
- HTTP error logging
- Retry attempt logging
- Final error logging

- All component integrations

## Monitoring and Alerting

### Error Patterns to Monitor
1. **High retry rates**: Indicates upstream service issues
2. **High failure rates**: Indicates persistent failures
3. **HTTP 5xx errors**: Indicates server-side issues
4. **JSON parsing errors**: Indicates client-side issues
5. **Timeout errors**: Indicates network/performance issues

### Integration with Monitoring Systems
- Parse error logs for metrics
- Set up alerts for error thresholds
- Monitor error trends over time
- Track error resolution times

## Best Practices

1. **Always include context**: Provide meaningful context in error logs
2. **Use appropriate error types**: Distinguish between retryable and non-retryable errors
3. **Monitor error patterns**: Regularly review error logs for patterns
4. **Clean up old logs**: Implement log rotation and cleanup
5. **Test error scenarios**: Regularly test error handling and logging

## Troubleshooting

### Common Issues

1. **Error logs not being created**
   - Check if logging is enabled in config.yaml
   - Verify logs/errors directory exists and is writable
   - Check application permissions

2. **Missing error context**
   - Ensure error_logger is passed to all components
   - Verify context dictionaries are properly formatted
   - Check for null/undefined error_logger references

3. **Error log file permissions**
   - Ensure application has write permissions to logs/errors/
   - Check file system permissions
   - Verify disk space availability

### Debug Commands
```bash
# Check error log directory
ls -la logs/errors/

# Monitor error logs in real-time
tail -f logs/errors/*.log

# Check error log directory
ls -la logs/errors/

# Test error logging
python3 test_error_logging.py
```

## Conclusion

The comprehensive error logging system ensures that **every kind of error and retry is logged to the `/logs/errors` subfolder**, providing complete visibility into application behavior, debugging capabilities, and operational insights. This system is essential for maintaining and troubleshooting the seaking-proxy application in production environments.
