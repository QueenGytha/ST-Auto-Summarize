# First-Hop Proxy

A proxy middleware for SillyTavern that provides advanced message processing, regex replacement, and comprehensive Unicode handling.

## Quick Start

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure the Proxy**:
   ```bash
   cp config.yaml.example config.yaml
   # Edit config.yaml with your settings
   ```
   > **⚠️ SECURITY**: `config.yaml` is automatically ignored by git to protect API keys. Never commit config files!

3. **Run the Proxy**:
   ```bash
   python main.py
   ```

4. **Configure SillyTavern**:
   - Set API endpoint to `http://localhost:8765/chat/completions`
   - Use your remote proxy's API key

## Multiple Configuration Files

> **⚠️ SECURITY WARNING**: Config files may contain API keys! The `.gitignore` is configured to prevent `config.yaml` and `config-*.yaml` files from being committed. Only `config.yaml.example` should be in version control. **Never commit files containing API keys!**

The proxy supports using different configuration files for different requests via URL path parameters:

### Usage

**Default Config**:
```
http://localhost:8765/chat/completions
```
Uses `config.yaml` (default)

**Custom Config**:
```
http://localhost:8765/aboba-gemini/chat/completions
```
Uses `config-aboba-gemini.yaml`

### Setup

1. Create named config files in the proxy root directory:
   ```bash
   # For path /aboba-gemini
   cp config.yaml config-aboba-gemini.yaml

   # For path /my-config
   cp config.yaml config-my-config.yaml
   ```

2. Edit each config file with specific settings (target URLs, API keys, regex rules, etc.)

3. Use the corresponding URL path in SillyTavern:
   - `http://localhost:8765/aboba-gemini/chat/completions`
   - `http://localhost:8765/my-config/chat/completions`

### API Key Override

Each config file can optionally specify an `apikey` that will be sent to the downstream proxy instead of the API key from SillyTavern:

```yaml
target_proxy:
  url: "https://your-proxy.com/chat/completions"
  timeout: 30
  apikey: "sk-your-downstream-api-key"  # Optional: overrides SillyTavern's API key
```

**Use cases:**
- Route different configs to different API accounts
- Use separate API keys for testing vs production
- Share different quotas across different character/chat configs

If `apikey` is not specified, the Authorization header from SillyTavern is forwarded as-is.

### Naming Convention

URL path `/config-name` loads `config-config-name.yaml`

Examples:
- `/aboba-gemini` → `config-aboba-gemini.yaml`
- `/openai-proxy` → `config-openai-proxy.yaml`
- `/backup` → `config-backup.yaml`

### Error Handling

**Important**: If you specify a config path that doesn't have a corresponding config file, the proxy will return a **404 error** with details about the missing file. There is no fallback to prevent silent failures.

Error response example:
```json
{
  "error": {
    "message": "Config file not found for path 'aboba-gemini': config-aboba-gemini.yaml",
    "type": "config_not_found",
    "config_path": "aboba-gemini",
    "expected_file": "config-aboba-gemini.yaml"
  }
}
```

This ensures you always know which configuration is being used and prevents accidental use of the wrong proxy settings.

## Key Features

- **Message Processing**: Apply regex rules to outgoing messages
- **Response Processing**: Fix malformed Unicode and special characters
- **Comprehensive Unicode Handling**: Converts garbled characters back to proper Unicode
- **Flexible Configuration**: YAML-based rule management
- **Detailed Logging**: Request/response logging with debug information

## Documentation

📚 **Complete documentation is available in the [docs/](docs/) folder:**

- **[Documentation Index](docs/DOCUMENTATION_INDEX.md)**: Complete guide to all documentation
- **[Product Requirements](docs/PRD.md)**: Detailed specifications
- **[Configuration Guide](docs/REGEX_REPLACEMENT_GUIDE.md)**: How to configure regex rules
- **[Unicode Fix Documentation](docs/development/unicode-encoding-fix.md)**: Comprehensive Unicode handling solution
- **[Cursor IDE Issues](docs/development/CURSOR_TERMINAL_ISSUES.md)**: Terminal issues and workarounds for AI assistants

## Unicode Handling

The proxy includes robust Unicode handling to fix encoding issues from remote AI providers:

- **Fixes malformed Unicode sequences** like `\u00e2\u20ac"` → `—`
- **Converts literal garbled characters** like `â€"` → `—`
- **Handles all quote types, dashes, and special punctuation**
- **50+ comprehensive rules** for complete Unicode coverage

## Configuration

See [config.yaml.example](config.yaml.example) for complete configuration options.

## Testing

**✅ Test Suite Status: All 155 tests passing in ~3 seconds**

The test suite has been optimized for fast, reliable execution. All tests pass consistently with no freezing issues.

### Quick Test Commands

```bash
# Run all tests (recommended)
python3 run_tests.py

# Run specific test file
python3 run_tests.py tests/test_main.py

# Run tests with specific markers
python3 run_tests.py -m "not slow"

# Run with verbose output
python3 run_tests.py -v

# Stop on first failure
python3 run_tests.py -x
```

### Test Runner Features

The `run_tests.py` script provides:
- **Fast Execution**: ~3 seconds vs. potential 4.5 minutes
- **Automatic Mocking**: Prevents real network calls and delays
- **Environment Overrides**: Applies test-specific settings automatically
- **Pytest Integration**: Full compatibility with pytest features

### Test Coverage

- **155 total tests** across all modules
- **100% pass rate** with consistent execution
- **Comprehensive coverage** of core functionality
- **Robust error handling** and edge case testing

**Note**: While `python -m pytest` can work, using `python3 run_tests.py` is recommended for optimal performance and reliability.

## Support

For issues, questions, or contributions, please refer to the documentation in the [docs/](docs/) folder.
