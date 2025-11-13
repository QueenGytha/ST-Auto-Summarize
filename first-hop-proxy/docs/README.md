# First-Hop Proxy

A proxy middleware for SillyTavern that provides advanced message processing, regex replacement, and response handling capabilities.

## Features

- **Message Processing**: Apply regex rules to outgoing messages before forwarding to remote proxies
- **Response Processing**: Fix malformed Unicode and convert special characters in incoming responses
- **Unicode Handling**: Comprehensive Unicode escape sequence and literal character conversion
- **Flexible Configuration**: YAML-based configuration for easy rule management
- **Logging**: Detailed request/response logging with before/after regex processing
- **Error Handling**: Robust error handling and validation

## Quick Start

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure the Proxy**:
   - Copy `config.yaml.example` to `config.yaml`
   - Update the `target_proxy` URL to point to your remote proxy
   - Customize regex rules as needed

3. **Run the Proxy**:
   ```bash
   python main.py
   ```

4. **Configure SillyTavern**:
   - Set the API endpoint to `http://localhost:8765/chat/completions`
   - Use your remote proxy's API key

## Configuration

### Basic Settings

```yaml
target_proxy:
  url: "https://your-remote-proxy.com/chat/completions"
  headers:
    Authorization: "Bearer your-api-key"
  timeout: 30
```

### Regex Replacement Rules

Apply transformations to outgoing messages:

```yaml
regex_replacement:
  - pattern: "—"
    replacement: "\\\\u2014"
    flags: ""
    apply_to: "user"
    description: "Convert em dash to Unicode escape"
```

### Response Processing Rules

Fix malformed Unicode in incoming responses:

```yaml
response_processing:
  enabled: true
  rules:
    - pattern: |-
        â€"
      replacement: "—"
      flags: ""
      description: "Fix literal display of malformed em dash encoding"
```

## Documentation

### Core Documentation
- **[Documentation Index](DOCUMENTATION_INDEX.md)**: Complete guide to all documentation
- **[Product Requirements Document](PRD.md)**: Detailed product specifications and requirements
- **[Configuration Examples](../config.yaml.example)**: Complete configuration reference

### Feature Guides
- **[Regex Replacement Guide](REGEX_REPLACEMENT_GUIDE.md)**: How to configure and use regex message processing
- **[Response Processing Guide](RESPONSE_PARSING_GUIDE.md)**: Advanced response parsing and status recategorization
- **[Error Logging Guide](ERROR_LOGGING_GUIDE.md)**: Comprehensive error handling and logging system
- **[Hard Stop Conditions Guide](HARD_STOP_CONDITIONS_GUIDE.md)**: Configuring hard stop conditions for specific error patterns

### Development Documentation
- **[Development Documentation](development/)**: Technical details, troubleshooting, and implementation notes
- **[Unicode Encoding Fix](development/unicode-encoding-fix.md)**: Detailed documentation of Unicode handling solution

## Architecture

```
SillyTavern → Our Proxy → Remote Proxy → Our Proxy → SillyTavern
```

The proxy acts as middleware, processing messages in both directions:
- **Outgoing**: Apply regex rules to user messages
- **Incoming**: Fix malformed Unicode and convert special characters

## Unicode Handling

The proxy includes comprehensive Unicode handling to fix encoding issues:

- **Outgoing**: Convert special characters to Unicode escape sequences
- **Incoming**: Convert both Unicode escapes and literal garbled characters back to proper characters
- **YAML Safe**: Uses literal block scalar syntax for pattern definitions

## Logging

The proxy provides detailed logging:

- **Request Logs**: Full request/response data in `logs/` directory
- **Error Logs**: Error details in `logs/errors/` directory
- **Debug Logs**: Before/after regex processing for troubleshooting

## Testing

Run the test suite:

```bash
python -m pytest tests/
```

## Troubleshooting

### Common Issues

1. **YAML Configuration Errors**: Check for proper escaping in regex patterns
2. **Unicode Issues**: Verify response processing rules are correctly configured
3. **Connection Errors**: Ensure target proxy URL and API key are correct

### Debug Mode

Enable debug logging by setting log level in configuration:

```yaml
logging:
  level: "DEBUG"
```

## Development

See the [development documentation](development/) for:
- Technical implementation details
- Unicode encoding fix documentation
- Troubleshooting guides
- Future considerations

## License

[Add your license information here]
