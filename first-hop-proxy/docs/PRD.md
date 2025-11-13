# Product Requirements Document: SillyTavern Proxy Middleware

## 1. Executive Summary

### 1.1 Purpose
Create a proxy middleware that acts as an intermediary between SillyTavern and external AI service proxies. This middleware provides robust error handling, automatic retries, response parsing, hard stop conditions, and ensures reliable communication between SillyTavern and target proxy services.

### 1.2 Scope
- **In Scope**: Proxy middleware with error handling, retry logic, response parsing, hard stop conditions, regex message processing, and OpenAI-compatible API endpoints
- **Out of Scope**: Authentication systems, user management, or modifications to SillyTavern core functionality

### 1.3 Success Criteria
- All tests pass with comprehensive coverage
- Proxy successfully forwards requests to configurable target proxies
- Error handling and retry logic work as specified
- Response parsing and status recategorization function correctly
- Hard stop conditions prevent retries for specific error patterns
- Regex message processing applies rules correctly
- OpenAI-compatible API endpoints function correctly

## 2. Technical Architecture

### 2.1 System Overview
```
SillyTavern → Proxy Middleware → Target Proxy → AI Service
```

### 2.2 Core Components
1. **Flask Application**: Main web server handling requests
2. **Request Handler**: Processes incoming OpenAI-compatible requests
3. **Proxy Client**: Forwards requests to target proxy
4. **Error Handler**: Manages retries, conditional retries, and hard stop conditions
5. **Response Parser**: Parses response bodies and recategorizes status codes
6. **Regex Processor**: Applies regex replacement rules to messages
7. **Configuration Manager**: Handles proxy settings and endpoints
8. **Request Logger**: Logs complete request/response cycles
9. **Error Logger**: Logs errors to separate directory with detailed context

### 2.3 File Structure
```
first-hop-proxy/
├── main.py                 # Main Flask application
├── proxy_client.py         # Proxy forwarding logic
├── error_handler.py        # Error handling and retry logic
├── response_parser.py      # Response parsing and status recategorization
├── utils.py               # Utility functions including regex processing
├── config.py              # Configuration management
├── constants.py           # Constants and default configurations
├── request_logger.py      # Request logging functionality
├── error_logger.py        # Error logging functionality
├── tests/
│   ├── test_main.py       # Main application tests
│   ├── test_proxy_client.py # Proxy client tests
│   ├── test_error_handler.py # Error handler tests
│   ├── test_response_parser.py # Response parser tests
│   ├── test_regex_replacement.py # Regex replacement tests
│   ├── test_config.py     # Configuration tests
│   └── test_error_logger.py # Error logger tests
├── requirements.txt       # Python dependencies
└── README.md             # Documentation
```

## 3. Functional Requirements

### 3.1 Core Functionality

#### 3.1.1 OpenAI-Compatible Endpoints
- **POST /chat/completions**: Handle chat completion requests
- **GET /models**: Return available models
- **GET /health**: Basic health check
- **GET /health/detailed**: Detailed health check with configuration


#### 3.1.2 Request Forwarding
- Forward requests to configurable target proxy
- Maintain request headers and body integrity
- Support both streaming and non-streaming responses
- Apply regex replacement rules to messages before forwarding

#### 3.1.3 Error Handling
- Detect specific error types (HTTP status codes, connection errors)
- Implement retry logic with exponential backoff (up to 10 retries)
- Implement conditional retry logic for context-dependent errors
- Implement hard stop conditions for specific error patterns
- Return appropriate error responses to SillyTavern

#### 3.1.4 Response Parsing
- Parse response bodies for error messages
- Recategorize status codes based on response content
- Extract error messages from nested JSON structures
- Log recategorization events for debugging

#### 3.1.5 Regex Message Processing
- Apply configurable regex replacement rules to messages
- Support role-specific rule application (user, assistant, system)
- Support regex flags (case insensitive, multiline, etc.)
- Process messages before forwarding to target proxy

### 3.2 Configuration Requirements

#### 3.2.1 Target Proxy Configuration
- Configurable target proxy URL
- Support for authentication headers
- Configurable timeout settings

#### 3.2.2 Retry Configuration
- Maximum retry attempts (default: 10)
- Retry delay intervals with exponential backoff
- Specific error codes that trigger retries
- Conditional retry settings for context-dependent errors
- Hard stop conditions for specific error patterns

#### 3.2.3 Response Parsing Configuration
- Status recategorization rules
- JSON path extraction for error messages
- Logging configuration for parsing events

#### 3.2.4 Regex Replacement Configuration
- Enable/disable regex processing
- Configurable replacement rules
- Role-specific rule application
- Regex flag support

### 3.3 Error Types to Handle

#### 3.3.1 Network Errors
- Connection timeouts
- DNS resolution failures
- Network unreachable

#### 3.3.2 HTTP Errors
- 429 (Rate Limited) - Retry with backoff
- 502/503/504 (Server Errors) - Retry
- 401/403 (Authentication) - Return error immediately
- 400 (Bad Request) - Return error immediately
- Conditional retry codes - Context-dependent retry logic

#### 3.3.3 Response Errors
- Empty responses
- Malformed JSON responses
- Unexpected response formats
- Status code recategorization based on content

#### 3.3.4 Hard Stop Conditions
- Specific error patterns that prevent retries
- User-friendly error messages for specific conditions
- Response preservation for debugging

## 4. Non-Functional Requirements

### 4.1 Performance
- Response time < 2 seconds for successful requests
- Support for concurrent requests
- Memory usage < 100MB under normal load
- Efficient regex processing for message modification

### 4.2 Reliability
- 99.9% uptime target
- Graceful degradation under high load
- Proper error logging and monitoring
- Comprehensive retry logic with hard stop conditions

### 4.3 Security
- Input validation for all requests
- Sanitization of error messages
- No sensitive data in logs
- API key obfuscation in logs

## 5. Test-Driven Development Plan

### 5.1 Test Categories

#### 5.1.1 Unit Tests
- Proxy client functionality
- Error handler logic with conditional retries and hard stops
- Response parser functionality
- Regex replacement processing
- Configuration management
- Request/response formatting

#### 5.1.2 Integration Tests
- End-to-end request flow
- Error handling scenarios with all retry types
- Response parsing and recategorization
- Regex message processing
- Hard stop condition triggering

#### 5.1.3 Edge Case Tests
- Network failures
- Malformed requests
- Timeout scenarios
- Rate limiting
- Response parsing edge cases
- Regex pattern validation

### 5.2 Test Implementation Strategy
1. Write comprehensive test suite first
2. Ensure all tests fail initially
3. Implement minimum code to make tests pass
4. Refactor while maintaining test coverage
5. Add additional edge case tests as needed

## 6. Implementation Phases

### 6.1 Phase 1: Core Infrastructure
- Set up Flask application structure
- Implement basic request forwarding
- Create configuration system
- Implement basic error handling

### 6.2 Phase 2: Advanced Error Handling
- Implement error detection
- Add retry logic with exponential backoff
- Add conditional retry logic
- Implement hard stop conditions
- Create error response formatting

### 6.3 Phase 3: Response Processing
- Implement response parsing
- Add status code recategorization
- Implement JSON path extraction
- Add response parsing logging

### 6.4 Phase 4: Message Processing
- Implement regex replacement functionality
- Add role-specific rule application
- Implement regex flag support
- Add message processing validation

### 6.5 Phase 5: Testing & Refinement
- Complete test suite implementation
- Performance optimization
- Documentation and deployment

## 7. Technical Specifications

### 7.1 API Endpoints

#### 7.1.1 POST /chat/completions
**Request Format**: OpenAI-compatible chat completion request
**Response Format**: OpenAI-compatible chat completion response
**Error Handling**: Retry on 429, 502, 503, 504; fail on 400, 401, 403; conditional retry on specific codes; hard stop on specific patterns

#### 7.1.2 GET /models
**Request Format**: Standard GET request
**Response Format**: OpenAI-compatible models list
**Error Handling**: Return cached model list on failure

#### 7.1.3 GET /health
**Request Format**: Standard GET request
**Response Format**: Basic health status
**Error Handling**: Return 200 if service is running

#### 7.1.4 GET /health/detailed
**Request Format**: Standard GET request
**Response Format**: Detailed health status with configuration
**Error Handling**: Return detailed status or error



### 7.2 Configuration Format
```yaml
target_proxy:
  url: "https://target-proxy.example.com"
  timeout: 30

regex_replacement:
  enabled: true
  rules:
    - pattern: "hello"
      replacement: "hi"
      flags: "i"
      apply_to: "user"

response_parsing:
  enabled: true
  status_recategorization:
    enabled: true
    rules:
      - pattern: "The model is overloaded"
        original_status: 200
        new_status: 429
        description: "Recategorize Google AI overload errors"

error_handling:
  retry_codes: [429, 502, 503, 504]
  fail_codes: [400, 401, 403]
  conditional_retry_codes: [404, 411, 412]
  max_retries: 10
  base_delay: 1
  max_delay: 60
  conditional_retry_enabled: true
  conditional_retry_max_attempts: 2
  conditional_retry_delay_multiplier: 0.5
  hard_stop_conditions:
    enabled: true
    rules:
      - pattern: "specific_error_pattern"
        description: "Hard stop condition"
        user_message: "User-friendly error message"
```

### 7.3 Error Response Format
```json
{
  "error": {
    "message": "Error description",
    "type": "error_type",
    "retry_after": 30
  }
}
```

### 7.4 Hard Stop Response Format
```json
{
  "error": {
    "message": "User-friendly error message",
    "type": "hard_stop_error",
    "code": "hard_stop_condition_met",
    "original_response": "Original error details"
  }
}
```

## 8. Dependencies

### 8.1 Python Packages
- Flask: Web framework
- Requests: HTTP client
- PyYAML: Configuration parsing
- Pytest: Testing framework
- Pytest-mock: Mocking for tests
- Flask-CORS: Cross-origin resource sharing

### 8.2 External Dependencies
- Target proxy service availability
- Network connectivity
- Sufficient system resources

## 9. Risk Assessment

### 9.1 Technical Risks
- **High**: Target proxy service changes API
- **Medium**: Network connectivity issues
- **Medium**: Complex regex patterns impact performance
- **Low**: Performance bottlenecks
- **Low**: Response parsing edge cases

### 9.2 Mitigation Strategies
- Comprehensive error handling
- Configurable retry logic with hard stop conditions
- Monitoring and alerting
- Fallback mechanisms
- Performance testing for regex processing
- Extensive testing of response parsing

## 10. Success Metrics

### 10.1 Functional Metrics
- 100% test coverage
- All endpoints respond correctly
- Error handling works as specified
- Response parsing functions correctly
- Regex replacement applies rules correctly
- Hard stop conditions trigger appropriately

### 10.2 Performance Metrics
- Response time < 2 seconds
- Success rate > 99%
- Zero memory leaks
- Regex processing overhead < 100ms per request

### 10.3 Quality Metrics
- Code review approval
- Documentation completeness
- Deployment success
- Error log accuracy

## 11. Exit Criteria

The project is complete when:
1. All tests pass with 100% coverage
2. Proxy successfully forwards requests to target proxies
3. Error handling and retry logic work correctly
4. Response parsing and recategorization function correctly
5. Hard stop conditions prevent retries appropriately
6. Regex message processing applies rules correctly
7. Documentation is complete and accurate
8. Code review is approved
9. Deployment is successful

## 12. Future Enhancements

### 12.1 Potential Improvements
- Load balancing across multiple proxies
- Request caching
- Advanced monitoring and metrics
- Authentication support
- Rate limiting
- Advanced regex pattern libraries
- Machine learning for error pattern detection

### 12.2 Scalability Considerations
- Horizontal scaling support
- Database integration for configuration
- Advanced logging and monitoring
- API versioning support
- Performance optimization for high-volume regex processing
