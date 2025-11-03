# Response Parsing Guide

## Overview

The first-hop-proxy includes intelligent response parsing that can recategorize HTTP status codes based on the actual content of error responses. This feature is essential for handling AI services that return 200 status codes even when errors occur, with error details embedded in the response body.

## Why Response Parsing is Needed

Many AI services and proxy middleware return HTTP 200 status codes even when errors occur, placing error information in the response body instead of using appropriate HTTP status codes. This makes it difficult for clients to:

- Detect when errors have occurred
- Implement proper retry logic
- Provide appropriate error handling
- Distinguish between successful responses and error responses

The response parser solves this by:
- Analyzing response body content for error patterns
- Recategorizing inappropriate status codes to proper error codes
- Extracting error messages from nested JSON structures
- Providing detailed logging of recategorization events

## Configuration

Response parsing is configured in the `config.yaml` file under the `response_parsing` section:

```yaml
response_parsing:
  enabled: true
  
  # Rules for recategorizing status codes based on response body content
  status_recategorization:
    enabled: true
    rules:
      # Google AI model overloaded errors (200 → 429)
      - pattern: "The model is overloaded"
        original_status: 200
        new_status: 429
        description: "Recategorize Google AI overload errors as rate limit"
      
      # Generic service unavailable errors (200 → 429)
      - pattern: "service unavailable"
        original_status: 200
        new_status: 429
        description: "Recategorize service unavailable as rate limit"
      
      # Model capacity errors (200 → 429)
      - pattern: "model.*capacity"
        original_status: 200
        new_status: 429
        description: "Recategorize model capacity errors as rate limit"
      
      # Proxy error with 503 in body (200 → 503)
      - pattern: "HTTP 503 Service Unavailable"
        original_status: 200
        new_status: 503
        description: "Recategorize proxy-wrapped 503 errors"
      
      # Upstream service unavailable (200 → 503)
      - pattern: "Upstream service unavailable"
        original_status: 200
        new_status: 503
        description: "Recategorize upstream service errors"
  
  # JSON path extraction for nested error messages
  json_extraction:
    enabled: true
    paths:
      - "error.message"
      - "proxy_note"
      - "choices[0].finish_reason"
      - "choices[0].message.content"
  
  # Logging for status recategorization
  logging:
    enabled: true
    log_recategorization: true
    include_original_status: true
    include_new_status: true
    include_matched_pattern: true
```

## Configuration Sections

### Main Configuration
- **enabled**: Enable/disable response parsing functionality (default: true)

### Status Recategorization
- **enabled**: Enable/disable status code recategorization (default: true)
- **rules**: List of recategorization rules to apply

#### Recategorization Rules
Each rule has the following fields:
- **pattern**: Text pattern to match in response body (required)
- **original_status**: Original HTTP status code to match (required)
- **new_status**: New status code to use when pattern matches (required)
- **description**: Human-readable description of the rule (optional)

### JSON Path Extraction
- **enabled**: Enable/disable JSON path extraction (default: true)
- **paths**: List of JSON paths to extract error messages from

### Logging Configuration
- **enabled**: Enable/disable recategorization logging (default: true)
- **log_recategorization**: Log when recategorization occurs (default: true)
- **include_original_status**: Include original status in logs (default: true)
- **include_new_status**: Include new status in logs (default: true)
- **include_matched_pattern**: Include matched pattern in logs (default: true)

## How It Works

### 1. Response Analysis
When a response is received from the target proxy:

1. **Status Code Check**: The parser first checks if the response has a status code that might need recategorization
2. **Content Analysis**: If the status code matches any rules, the response body is analyzed
3. **Pattern Matching**: The parser searches for patterns in the response body using regex matching
4. **JSON Extraction**: If JSON path extraction is enabled, error messages are extracted from nested structures

### 2. Recategorization Process
For each recategorization rule:

1. **Pattern Matching**: The response body is searched for the specified pattern
2. **Status Code Matching**: The original status code must match the rule's `original_status`
3. **Recategorization**: If both conditions are met, the status code is changed to `new_status`
4. **Logging**: The recategorization event is logged with full details

### 3. JSON Path Extraction
When JSON path extraction is enabled:

1. **JSON Parsing**: The response body is parsed as JSON
2. **Path Traversal**: Each configured path is traversed to extract error messages
3. **Pattern Matching**: Extracted messages are used for pattern matching
4. **Error Collection**: All extracted error messages are collected for analysis

## Examples

### Example 1: Google AI Overload Error
**Original Response:**
```json
{
  "status": 200,
  "body": "The model is overloaded. Please try again later."
}
```

**After Recategorization:**
```json
{
  "status": 429,
  "body": "The model is overloaded. Please try again later.",
  "recategorization": {
    "original_status": 200,
    "new_status": 429,
    "pattern": "The model is overloaded",
    "description": "Recategorize Google AI overload errors as rate limit"
  }
}
```

### Example 2: Nested JSON Error
**Original Response:**
```json
{
  "status": 200,
  "body": {
    "error": {
      "message": "service unavailable",
      "code": "SERVICE_ERROR"
    },
    "choices": []
  }
}
```

**After Recategorization:**
```json
{
  "status": 429,
  "body": {
    "error": {
      "message": "service unavailable",
      "code": "SERVICE_ERROR"
    },
    "choices": []
  },
  "recategorization": {
    "original_status": 200,
    "new_status": 429,
    "pattern": "service unavailable",
    "description": "Recategorize service unavailable as rate limit",
    "extracted_messages": ["service unavailable"]
  }
}
```

## Common Patterns

### Rate Limiting Patterns
```yaml
- pattern: "The model is overloaded"
  original_status: 200
  new_status: 429
  description: "Google AI model overload"

- pattern: "rate limit"
  original_status: 200
  new_status: 429
  description: "Generic rate limiting"

- pattern: "too many requests"
  original_status: 200
  new_status: 429
  description: "Request rate limiting"
```

### Service Error Patterns
```yaml
- pattern: "service unavailable"
  original_status: 200
  new_status: 503
  description: "Service unavailable error"

- pattern: "internal server error"
  original_status: 200
  new_status: 500
  description: "Internal server error"

- pattern: "upstream.*error"
  original_status: 200
  new_status: 502
  description: "Upstream service error"
```

### Authentication Patterns
```yaml
- pattern: "invalid.*api.*key"
  original_status: 200
  new_status: 401
  description: "Invalid API key"

- pattern: "authentication.*failed"
  original_status: 200
  new_status: 401
  description: "Authentication failure"
```

## JSON Path Examples

### OpenAI-Compatible Responses
```yaml
json_extraction:
  enabled: true
  paths:
    - "error.message"
    - "choices[0].finish_reason"
    - "choices[0].message.content"
```

### Custom Error Responses
```yaml
json_extraction:
  enabled: true
  paths:
    - "error.message"
    - "error.details"
    - "proxy_note"
    - "status.message"
    - "result.error"
```

## Logging and Monitoring

### Recategorization Logs
When recategorization occurs, detailed logs are generated:

```
2024-08-30 14:30:45 - INFO - Status recategorization: 200 → 429
Pattern: "The model is overloaded"
Description: Recategorize Google AI overload errors as rate limit
Response body: "The model is overloaded. Please try again later."
```

### Error Logs
Recategorization events are also logged to the error logging system:

```json
{
  "timestamp": "2024-08-30T14:30:45.123456",
  "error_type": "Status recategorization",
  "context": "status_recategorization",
  "original_status": 200,
  "new_status": 429,
  "pattern": "The model is overloaded",
  "description": "Recategorize Google AI overload errors as rate limit",
  "response_body": "The model is overloaded. Please try again later."
}
```

## Performance Considerations

### Pattern Matching Performance
- **Regex Compilation**: Patterns are compiled once and reused
- **Early Termination**: Matching stops when the first rule matches
- **Case Sensitivity**: Use case-insensitive patterns when appropriate
- **Pattern Complexity**: Keep patterns simple for better performance

### JSON Path Performance
- **Path Caching**: JSON paths are cached for repeated use
- **Lazy Evaluation**: Paths are only evaluated when needed
- **Error Handling**: Invalid paths are gracefully handled
- **Depth Limiting**: Very deep JSON structures are handled efficiently

## Testing Response Parsing

### Unit Tests
```python
def test_status_recategorization():
    parser = ResponseParser(config)
    response_text = "The model is overloaded. Please try again later."
    new_status, info = parser.parse_and_recategorize(response_text, 200)
    assert new_status == 429
    assert info["recategorized"] == True
```

### Integration Tests
```python
def test_end_to_end_recategorization():
    # Test complete request flow with recategorization
    response = client.post("/chat/completions", json=request_data)
    assert response.status_code == 429  # Recategorized from 200
```

## Troubleshooting

### Common Issues

1. **Patterns Not Matching**
   - Check pattern syntax and case sensitivity
   - Verify response body content
   - Test patterns with regex testers

2. **JSON Path Extraction Failing**
   - Verify JSON structure matches paths
   - Check for malformed JSON
   - Test paths with JSON path testers

3. **Performance Issues**
   - Simplify complex patterns
   - Reduce number of JSON paths
   - Monitor parsing overhead

### Debug Commands
```bash
# Check response parsing configuration
curl http://localhost:8765/health/detailed

# Monitor response parsing logs
tail -f logs/errors/*.log | grep "status_recategorization"

# Test specific patterns
python -c "import re; print(re.search('pattern', 'test text'))"
```

## Best Practices

1. **Pattern Design**
   - Use specific, unique patterns
   - Avoid overly broad patterns
   - Test patterns thoroughly
   - Document pattern purpose

2. **Status Code Selection**
   - Use appropriate HTTP status codes
   - Follow HTTP standards
   - Consider client behavior
   - Document status code rationale

3. **JSON Path Design**
   - Use specific, reliable paths
   - Handle missing fields gracefully
   - Test with various response formats
   - Document path assumptions

4. **Monitoring and Maintenance**
   - Monitor recategorization frequency
   - Review and update patterns regularly
   - Track false positives/negatives
   - Maintain pattern documentation

## Future Enhancements

### Planned Features
- **Machine Learning**: Automatic pattern detection
- **Pattern Libraries**: Pre-built pattern collections
- **Advanced Matching**: Fuzzy matching and similarity scoring
- **Performance Optimization**: Parallel pattern matching
- **Visualization**: Pattern matching dashboard

### Configuration Improvements
- **Dynamic Rules**: Runtime rule updates
- **Rule Prioritization**: Order-dependent rule processing
- **Conditional Rules**: Context-dependent pattern matching
- **Rule Templates**: Reusable rule configurations
