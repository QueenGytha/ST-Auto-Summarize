# Regex Replacement Guide

The first-hop-proxy now supports regex replacement rules that are applied to messages before they are forwarded to the remote proxy. This feature allows you to:

- Replace specific text patterns in messages
- Apply different rules to different message roles (user, assistant, system)
- Use case-sensitive or case-insensitive matching
- Apply multiple rules in sequence

## Configuration

The regex replacement feature is configured in the `config.yaml` file under the `regex_replacement` section:

```yaml
regex_replacement:
  enabled: true
  rules:
    - pattern: "hello"
      replacement: "hi"
      flags: "i"
      apply_to: "user"
```

## Rule Structure

Each rule has the following fields:

- **pattern**: The regex pattern to match (required)
- **replacement**: The text to replace matches with (required)
- **flags**: Regex flags (optional, default: "")
- **apply_to**: Which message roles to apply the rule to (optional, default: "all")

### Pattern

The `pattern` field contains a regular expression that will be used to find matches in message content. Use standard regex syntax.

Examples:
- `"hello"` - matches literal "hello"
- `"\\bhello\\b"` - matches "hello" as a whole word
- `"\\d+"` - matches one or more digits
- `"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}"` - matches email addresses

### Replacement

The `replacement` field contains the text that will replace matched patterns. You can use regex capture groups with `\\1`, `\\2`, etc.

Examples:
- `"hi"` - simple text replacement
- `"[REDACTED]"` - placeholder text
- `"\\1***\\2"` - uses capture groups to preserve parts of the match

### Flags

The `flags` field contains regex flags as a string:

- `"i"` - case insensitive
- `"m"` - multiline
- `"s"` - dotall (dot matches newlines)
- `"x"` - verbose (allows comments and whitespace)

You can combine flags: `"im"` for case insensitive and multiline.

### Apply To

The `apply_to` field specifies which message roles the rule applies to:

- `"all"` - applies to all message roles (default)
- `"user"` - applies only to user messages
- `"assistant"` - applies only to assistant messages
- `"system"` - applies only to system messages

## Examples

### Basic Text Replacement

Replace "hello" with "hi" in all messages:

```yaml
- pattern: "hello"
  replacement: "hi"
  flags: "i"
  apply_to: "all"
```

### Word Boundary Matching

Replace "bad_word" only when it appears as a complete word:

```yaml
- pattern: "\\bbad_word\\b"
  replacement: "[REDACTED]"
  flags: "i"
  apply_to: "all"
```

### Email Address Replacement

Replace email addresses with a placeholder:

```yaml
- pattern: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"
  replacement: "[EMAIL]"
  flags: ""
  apply_to: "user"
```

### Phone Number Replacement

Replace phone numbers in various formats:

```yaml
- pattern: "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b"
  replacement: "[PHONE]"
  flags: ""
  apply_to: "all"
```

### Credit Card Number Replacement

Replace credit card numbers:

```yaml
- pattern: "\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b"
  replacement: "[CARD]"
  flags: ""
  apply_to: "all"
```

### Role-Specific Rules

Apply different rules to different message roles:

```yaml
# Replace swear words in user messages only
- pattern: "\\b(swear1|swear2)\\b"
  replacement: "[REDACTED]"
  flags: "i"
  apply_to: "user"

# Replace internal references in assistant messages
- pattern: "internal_ref_\\d+"
  replacement: "[REF]"
  flags: ""
  apply_to: "assistant"
```

## Multiple Rules

Rules are applied in the order they appear in the configuration. Each rule is applied to the result of the previous rule:

```yaml
regex_replacement:
  enabled: true
  rules:
    # First rule: replace "hello" with "hi"
    - pattern: "hello"
      replacement: "hi"
      flags: "i"
      apply_to: "all"
    
    # Second rule: replace "world" with "earth" (applied after first rule)
    - pattern: "world"
      replacement: "earth"
      flags: ""
      apply_to: "all"
```

In this example, "Hello world" would become "hi earth".

## Error Handling

If a regex pattern is invalid, the rule will be skipped and a warning will be logged. Other rules will continue to be processed.

## Performance Considerations

- Regex rules are applied to every message before forwarding
- Complex patterns may impact performance
- Consider using simple patterns when possible
- Test your patterns thoroughly before deployment

## Testing

You can test your regex patterns using online regex testers or Python's `re` module:

```python
import re

pattern = r"your_pattern_here"
replacement = "your_replacement_here"
text = "test text here"

result = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
print(result)
```

## Disabling the Feature

To disable regex replacement, set `enabled: false`:

```yaml
regex_replacement:
  enabled: false
  rules: []
```

Or remove the entire `regex_replacement` section from your configuration.
