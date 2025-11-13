# Hard Stop Conditions Guide

## Overview

Hard stop conditions are a powerful feature that prevents retries when specific error patterns are detected in responses. This feature allows you to immediately fail requests with user-friendly error messages when certain conditions are met, rather than attempting retries that are likely to fail.

## Why Hard Stop Conditions are Needed

Some error conditions indicate fundamental problems that cannot be resolved through retries:

- **Malformed Content**: Messages containing characters or formatting that break downstream services
- **Authentication Issues**: Permanent authentication failures that won't resolve with retries
- **Service-Specific Errors**: Errors that indicate the target service cannot handle the request
- **Resource Limitations**: Permanent resource constraints that won't change with retries

Hard stop conditions provide:
- **Immediate Failure**: Skip retry logic for known problematic conditions
- **User-Friendly Messages**: Provide helpful error messages to users
- **Resource Efficiency**: Avoid wasting resources on doomed retry attempts
- **Better User Experience**: Faster error responses for unresolvable issues

## Configuration

Hard stop conditions are configured in the `config.yaml` file under the `error_handling.hard_stop_conditions` section:

```yaml
error_handling:
  # Other error handling configuration...
  
  # Hard stop conditions - prevent retries for specific error patterns
  hard_stop_conditions:
    enabled: true
    rules:
      # Stop retries when downstream proxy middleware fails due to malformed messages
      - pattern: "googleAIBlockingResponseHandler.*Cannot read properties of undefined"
        description: "Downstream proxy middleware failure due to malformed message content"
        user_message: "Your previous message contains characters or formatting that is breaking the downstream AI provider. Please check for special characters, unusual formatting, or try rephrasing your message. You may need to avoid certain punctuation or symbols."
        preserve_original_response: true
        add_user_message: true
      
      # Stop retries for authentication failures
      - pattern: "invalid.*api.*key"
        description: "Invalid API key error"
        user_message: "The API key provided is invalid. Please check your configuration and try again."
        preserve_original_response: false
        add_user_message: true
      
      # Stop retries for content policy violations
      - pattern: "content.*policy.*violation"
        description: "Content policy violation"
        user_message: "Your message violates the content policy. Please review and modify your message."
        preserve_original_response: true
        add_user_message: true
```

## Configuration Sections

### Main Configuration
- **enabled**: Enable/disable hard stop conditions (default: true)

### Hard Stop Rules
Each rule has the following fields:
- **pattern**: Regex pattern to match in error response (required)
- **description**: Human-readable description of the condition (required)
- **user_message**: User-friendly error message to display (optional)
- **preserve_original_response**: Keep original error details in response (default: true)
- **add_user_message**: Include user message in error response (default: true)

## How It Works

### 1. Response Analysis
When a response is received from the target proxy:

1. **Pattern Matching**: The response body is searched for hard stop patterns
2. **Rule Evaluation**: Each hard stop rule is evaluated in order
3. **Condition Detection**: If a pattern matches, the hard stop condition is triggered
4. **Response Formatting**: A hard stop error response is generated

### 2. Hard Stop Process
When a hard stop condition is triggered:

1. **Retry Prevention**: All retry logic is bypassed
2. **Error Response**: A hard stop error response is generated
3. **User Message**: If configured, a user-friendly message is included
4. **Original Response**: If configured, original error details are preserved
5. **Logging**: The hard stop event is logged with full details

### 3. Response Format
Hard stop responses follow a specific format:

```json
{
  "error": {
    "message": "User-friendly error message",
    "type": "hard_stop_error",
    "code": "hard_stop_condition_met",
    "original_response": "Original error details (if preserved)",
    "hard_stop_rule": {
      "pattern": "matched_pattern",
      "description": "Hard stop condition description"
    }
  }
}
```

## Examples

### Example 1: Malformed Message Content
**Triggering Response:**
```
HTTP 500 Internal Server Error
Body: "googleAIBlockingResponseHandler: Cannot read properties of undefined (reading 'content')"
```

**Hard Stop Response:**
```json
{
  "error": {
    "message": "Your previous message contains characters or formatting that is breaking the downstream AI provider. Please check for special characters, unusual formatting, or try rephrasing your message. You may need to avoid certain punctuation or symbols.",
    "type": "hard_stop_error",
    "code": "hard_stop_condition_met",
    "original_response": "googleAIBlockingResponseHandler: Cannot read properties of undefined (reading 'content')",
    "hard_stop_rule": {
      "pattern": "googleAIBlockingResponseHandler.*Cannot read properties of undefined",
      "description": "Downstream proxy middleware failure due to malformed message content"
    }
  }
}
```

### Example 2: Authentication Failure
**Triggering Response:**
```
HTTP 401 Unauthorized
Body: "Invalid API key provided"
```

**Hard Stop Response:**
```json
{
  "error": {
    "message": "The API key provided is invalid. Please check your configuration and try again.",
    "type": "hard_stop_error",
    "code": "hard_stop_condition_met",
    "hard_stop_rule": {
      "pattern": "invalid.*api.*key",
      "description": "Invalid API key error"
    }
  }
}
```

## Common Patterns

### Malformed Content Patterns
```yaml
# Downstream proxy parsing errors
- pattern: "googleAIBlockingResponseHandler.*Cannot read properties of undefined"
  description: "Downstream proxy middleware failure due to malformed message content"
  user_message: "Your message contains characters or formatting that is breaking the downstream AI provider. Please check for special characters, unusual formatting, or try rephrasing your message."

# JSON parsing errors
- pattern: "JSON.*parse.*error"
  description: "JSON parsing error in message content"
  user_message: "Your message contains invalid JSON formatting. Please check your message and try again."

# Character encoding errors
- pattern: "encoding.*error"
  description: "Character encoding error"
  user_message: "Your message contains characters that cannot be properly encoded. Please check for special characters or symbols."
```

### Authentication Patterns
```yaml
# Invalid API keys
- pattern: "invalid.*api.*key"
  description: "Invalid API key error"
  user_message: "The API key provided is invalid. Please check your configuration and try again."

# Authentication failures
- pattern: "authentication.*failed"
  description: "Authentication failure"
  user_message: "Authentication failed. Please check your credentials and try again."

# Expired tokens
- pattern: "token.*expired"
  description: "Expired authentication token"
  user_message: "Your authentication token has expired. Please refresh your credentials."
```

### Content Policy Patterns
```yaml
# Content policy violations
- pattern: "content.*policy.*violation"
  description: "Content policy violation"
  user_message: "Your message violates the content policy. Please review and modify your message."

# Safety filter triggers
- pattern: "safety.*filter"
  description: "Safety filter triggered"
  user_message: "Your message was blocked by the safety filter. Please modify your message and try again."

# Inappropriate content
- pattern: "inappropriate.*content"
  description: "Inappropriate content detected"
  user_message: "Your message contains inappropriate content. Please review and modify your message."
```

### Service-Specific Patterns
```yaml
# Model not found
- pattern: "model.*not.*found"
  description: "Requested model not available"
  user_message: "The requested model is not available. Please try a different model."

# Service unavailable permanently
- pattern: "service.*permanently.*unavailable"
  description: "Service permanently unavailable"
  user_message: "The requested service is permanently unavailable. Please try a different service."

# Resource exhausted
- pattern: "resource.*exhausted"
  description: "Resource permanently exhausted"
  user_message: "The service resources are permanently exhausted. Please try again later or use a different service."
```

## Configuration Options

### Rule Configuration
```yaml
hard_stop_conditions:
  enabled: true
  rules:
    - pattern: "your_pattern_here"
      description: "Description of the condition"
      user_message: "User-friendly error message"
      preserve_original_response: true  # Keep original error details
      add_user_message: true           # Include user message in response
```

### Response Options
- **preserve_original_response**: When true, includes the original error response in the hard stop response
- **add_user_message**: When true, includes the user-friendly message in the error response

## Logging and Monitoring

### Hard Stop Logs
When hard stop conditions are triggered, detailed logs are generated:

```
2024-08-30 14:30:45 - WARNING - Hard stop condition matched: Downstream proxy middleware failure due to malformed message content
Pattern: "googleAIBlockingResponseHandler.*Cannot read properties of undefined"
Response: "googleAIBlockingResponseHandler: Cannot read properties of undefined (reading 'content')"
```

### Error Logs
Hard stop events are also logged to the error logging system:

```json
{
  "timestamp": "2024-08-30T14:30:45.123456",
  "error_type": "Hard stop condition",
  "context": "hard_stop_condition",
  "pattern": "googleAIBlockingResponseHandler.*Cannot read properties of undefined",
  "description": "Downstream proxy middleware failure due to malformed message content",
  "response_body": "googleAIBlockingResponseHandler: Cannot read properties of undefined (reading 'content')",
  "hard_stop_rule": {
    "pattern": "googleAIBlockingResponseHandler.*Cannot read properties of undefined",
    "description": "Downstream proxy middleware failure due to malformed message content",
    "user_message": "Your previous message contains characters or formatting that is breaking the downstream AI provider..."
  }
}
```

## Performance Considerations

### Pattern Matching Performance
- **Regex Compilation**: Patterns are compiled once and reused
- **Early Termination**: Matching stops when the first rule matches
- **Case Sensitivity**: Use case-insensitive patterns when appropriate
- **Pattern Complexity**: Keep patterns simple for better performance

### Response Processing
- **Conditional Processing**: Hard stop conditions are only checked when needed
- **Efficient Matching**: Patterns are matched against response body efficiently
- **Memory Usage**: Response bodies are processed without excessive memory usage

## Testing Hard Stop Conditions

### Unit Tests
```python
def test_hard_stop_condition_matching():
    error_handler = ErrorHandler(hard_stop_config=hard_stop_config)
    mock_response = MockResponse(500, "googleAIBlockingResponseHandler: Cannot read properties of undefined")
    hard_stop_rule = error_handler.check_hard_stop_conditions(mock_response)
    assert hard_stop_rule is not None
    assert hard_stop_rule["description"] == "Downstream proxy middleware failure due to malformed message content"
```

### Integration Tests
```python
def test_hard_stop_response_formatting():
    error_handler = ErrorHandler(hard_stop_config=hard_stop_config)
    mock_response = MockResponse(500, "googleAIBlockingResponseHandler: Cannot read properties of undefined")
    hard_stop_rule = error_handler.check_hard_stop_conditions(mock_response)
    formatted_response = error_handler.format_hard_stop_response(mock_response, hard_stop_rule)
    assert formatted_response["error"]["type"] == "hard_stop_error"
    assert formatted_response["error"]["code"] == "hard_stop_condition_met"
```

## Troubleshooting

### Common Issues

1. **Patterns Not Matching**
   - Check pattern syntax and case sensitivity
   - Verify response body content
   - Test patterns with regex testers

2. **Hard Stop Not Triggering**
   - Verify hard stop conditions are enabled
   - Check pattern matches response content
   - Review rule configuration

3. **User Messages Not Appearing**
   - Check `add_user_message` configuration
   - Verify user message is provided in rule
   - Review response formatting

### Debug Commands
```bash
# Check hard stop configuration
curl http://localhost:8765/health/detailed

# Monitor hard stop logs
tail -f logs/errors/*.log | grep "hard_stop_condition"

# Test specific patterns
python -c "import re; print(re.search('pattern', 'test text'))"
```

## Best Practices

1. **Pattern Design**
   - Use specific, unique patterns
   - Avoid overly broad patterns
   - Test patterns thoroughly
   - Document pattern purpose

2. **User Messages**
   - Provide clear, actionable messages
   - Explain what went wrong
   - Suggest solutions when possible
   - Use appropriate tone and language

3. **Rule Configuration**
   - Order rules by importance
   - Use specific descriptions
   - Configure appropriate response options
   - Test rule combinations

4. **Monitoring and Maintenance**
   - Monitor hard stop frequency
   - Review and update patterns regularly
   - Track false positives/negatives
   - Maintain pattern documentation

## Integration with Other Features

### Error Handling Integration
Hard stop conditions integrate with the error handling system:
- **Retry Prevention**: Hard stops bypass all retry logic
- **Error Logging**: Hard stop events are logged to error logs
- **Response Formatting**: Hard stops use consistent error response format

### Response Parsing Integration
Hard stop conditions work with response parsing:
- **Pattern Matching**: Both features use pattern matching
- **Response Analysis**: Both analyze response content
- **Logging**: Both log their activities

### Regex Replacement Integration
Hard stop conditions can work with regex replacement:
- **Content Processing**: Regex replacement can modify content before hard stop checking
- **Pattern Consistency**: Both use regex patterns
- **Configuration**: Both are configured in YAML

## Future Enhancements

### Planned Features
- **Dynamic Rules**: Runtime rule updates
- **Rule Prioritization**: Order-dependent rule processing
- **Conditional Rules**: Context-dependent pattern matching
- **Rule Templates**: Reusable rule configurations
- **Machine Learning**: Automatic pattern detection

### Configuration Improvements
- **Rule Import/Export**: Share rule configurations
- **Rule Validation**: Validate patterns at configuration time
- **Rule Testing**: Test patterns against sample responses
- **Rule Metrics**: Track rule effectiveness and usage
