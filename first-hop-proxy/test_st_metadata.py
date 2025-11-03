#!/usr/bin/env python
"""
Quick test to verify ST_METADATA parsing and stripping functionality
"""
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from first_hop_proxy.utils import (
    parse_st_metadata,
    strip_st_metadata,
    parse_chat_name,
    extract_st_metadata_from_messages,
    extract_character_chat_info
)


def test_parse_st_metadata():
    """Test parsing ST_METADATA from content"""
    print("Testing parse_st_metadata...")

    content = """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "lorebook"
}
</ST_METADATA>

You are the Auto-Lorebooks registry entry lookup assistant for SillyTavern."""

    metadata = parse_st_metadata(content)
    assert metadata is not None, "Should parse metadata"
    assert metadata['version'] == "1.0", "Should parse version"
    assert metadata['chat'] == "Senta - 2025-11-01@20h29m24s", "Should parse chat"
    assert metadata['operation'] == "lorebook", "Should parse operation"
    print("[PASS] parse_st_metadata works correctly")


def test_strip_st_metadata():
    """Test stripping ST_METADATA from content"""
    print("\nTesting strip_st_metadata...")

    content = """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "lorebook"
}
</ST_METADATA>

You are the Auto-Lorebooks registry entry lookup assistant for SillyTavern."""

    stripped = strip_st_metadata(content)
    assert "<ST_METADATA>" not in stripped, "Should remove metadata tag"
    assert "You are the Auto-Lorebooks" in stripped, "Should keep content"
    assert stripped.startswith("You are"), "Should trim whitespace"
    print("[PASS] strip_st_metadata works correctly")


def test_parse_chat_name():
    """Test parsing character name and timestamp from chat name"""
    print("\nTesting parse_chat_name...")

    # Simple case
    character, timestamp = parse_chat_name("Senta - 2025-11-01@20h29m24s")
    assert character == "Senta", f"Expected 'Senta', got '{character}'"
    assert timestamp == "2025-11-01@20h29m24s", f"Expected timestamp, got '{timestamp}'"

    # Character name with hyphen
    character, timestamp = parse_chat_name("My - Character - 2025-11-01@20h29m24s")
    assert character == "My - Character", f"Expected 'My - Character', got '{character}'"
    assert timestamp == "2025-11-01@20h29m24s", f"Expected timestamp, got '{timestamp}'"

    print("[PASS] parse_chat_name works correctly")


def test_extract_st_metadata_from_messages():
    """Test extracting metadata from messages and cleaning them"""
    print("\nTesting extract_st_metadata_from_messages...")

    messages = [
        {
            "role": "system",
            "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "lorebook"
}
</ST_METADATA>"""
        },
        {
            "role": "user",
            "content": "You are the Auto-Lorebooks registry entry lookup assistant."
        }
    ]

    metadata, cleaned_messages = extract_st_metadata_from_messages(messages)

    assert metadata is not None, "Should extract metadata"
    assert metadata['chat'] == "Senta - 2025-11-01@20h29m24s", "Should have chat info"
    assert metadata['operation'] == "lorebook", "Should have operation"

    # First message should be removed (was only metadata)
    assert len(cleaned_messages) == 1, f"Expected 1 message, got {len(cleaned_messages)}"
    assert cleaned_messages[0]['role'] == "user", "Should keep user message"
    assert "Auto-Lorebooks" in cleaned_messages[0]['content'], "Should preserve content"

    print("[PASS] extract_st_metadata_from_messages works correctly")


def test_extract_character_chat_info():
    """Test extracting character/chat/operation info from request"""
    print("\nTesting extract_character_chat_info...")

    request_data = {
        "messages": [
            {
                "role": "system",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "lorebook"
}
</ST_METADATA>"""
            }
        ]
    }

    result = extract_character_chat_info({}, request_data)

    assert result is not None, "Should extract character/chat info"
    character, timestamp, operation = result
    assert character == "Senta", f"Expected 'Senta', got '{character}'"
    assert timestamp == "2025-11-01@20h29m24s", f"Expected timestamp, got '{timestamp}'"
    assert operation == "lorebook", f"Expected 'lorebook', got '{operation}'"

    print("[PASS] extract_character_chat_info works correctly")


def main():
    """Run all tests"""
    print("=" * 80)
    print("ST_METADATA Parsing Tests")
    print("=" * 80)

    try:
        test_parse_st_metadata()
        test_strip_st_metadata()
        test_parse_chat_name()
        test_extract_st_metadata_from_messages()
        test_extract_character_chat_info()

        print("\n" + "=" * 80)
        print("All tests passed! [SUCCESS]")
        print("=" * 80)
        return 0
    except AssertionError as e:
        print(f"\n[FAIL] Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
