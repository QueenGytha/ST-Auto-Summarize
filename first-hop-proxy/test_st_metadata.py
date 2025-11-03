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

    all_metadata, cleaned_messages = extract_st_metadata_from_messages(messages)

    assert all_metadata is not None, "Should extract metadata"
    assert isinstance(all_metadata, list), "Should return list of metadata"
    assert len(all_metadata) == 1, "Should have one metadata entry"
    metadata = all_metadata[0]
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


def test_extract_character_chat_info_missing_operation():
    """Test that extract_character_chat_info raises exception when operation is missing"""
    print("\nTesting extract_character_chat_info with missing operation...")

    request_data = {
        "messages": [
            {
                "role": "system",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s"
}
</ST_METADATA>"""
            }
        ]
    }

    try:
        result = extract_character_chat_info({}, request_data)
        raise AssertionError(f"Expected ValueError to be raised, but got result: {result}")
    except ValueError as e:
        assert "missing required 'operation' field" in str(e), f"Wrong error message: {e}"

    print("[PASS] extract_character_chat_info raises exception when operation is missing")


def test_extract_character_chat_info_missing_chat():
    """Test that extract_character_chat_info raises exception when chat is missing"""
    print("\nTesting extract_character_chat_info with missing chat...")

    request_data = {
        "messages": [
            {
                "role": "system",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "operation": "lorebook"
}
</ST_METADATA>"""
            }
        ]
    }

    try:
        result = extract_character_chat_info({}, request_data)
        raise AssertionError(f"Expected ValueError to be raised, but got result: {result}")
    except ValueError as e:
        assert "missing required 'chat' field" in str(e), f"Wrong error message: {e}"

    print("[PASS] extract_character_chat_info raises exception when chat is missing")


def test_extract_character_chat_info_chat_plus_specific():
    """Test that 'chat' + specific operation uses the specific operation"""
    print("\nTesting extract_character_chat_info with 'chat' + specific operation...")

    request_data = {
        "messages": [
            {
                "role": "system",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "chat"
}
</ST_METADATA>

Complete the requested task."""
            },
            {
                "role": "user",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "generate_running_summary"
}
</ST_METADATA>

Generate summary."""
            }
        ]
    }

    result = extract_character_chat_info({}, request_data)

    assert result is not None, "Should extract character/chat info"
    character, timestamp, operation = result
    assert character == "Senta", f"Expected 'Senta', got '{character}'"
    assert timestamp == "2025-11-01@20h29m24s", f"Expected timestamp, got '{timestamp}'"
    assert operation == "generate_running_summary", f"Expected 'generate_running_summary', got '{operation}'"

    print("[PASS] extract_character_chat_info correctly uses specific operation over 'chat'")


def test_extract_character_chat_info_multiple_specific_operations():
    """Test that multiple non-'chat' operations raises exception"""
    print("\nTesting extract_character_chat_info with multiple specific operations...")

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
            },
            {
                "role": "user",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "generate_running_summary"
}
</ST_METADATA>"""
            }
        ]
    }

    try:
        result = extract_character_chat_info({}, request_data)
        raise AssertionError(f"Expected ValueError for conflicting operations, but got result: {result}")
    except ValueError as e:
        assert "conflicting operation types" in str(e).lower(), f"Wrong error message: {e}"

    print("[PASS] extract_character_chat_info raises exception for conflicting operations")


def test_extract_character_chat_info_conflicting_chats():
    """Test that conflicting chat names raises exception"""
    print("\nTesting extract_character_chat_info with conflicting chat names...")

    request_data = {
        "messages": [
            {
                "role": "system",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "chat"
}
</ST_METADATA>"""
            },
            {
                "role": "user",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "OtherChar - 2025-11-02@10h00m00s",
  "operation": "chat"
}
</ST_METADATA>"""
            }
        ]
    }

    try:
        result = extract_character_chat_info({}, request_data)
        raise AssertionError(f"Expected ValueError for conflicting chats, but got result: {result}")
    except ValueError as e:
        assert "different 'chat' values" in str(e).lower(), f"Wrong error message: {e}"

    print("[PASS] extract_character_chat_info raises exception for conflicting chat names")


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
        test_extract_character_chat_info_missing_operation()
        test_extract_character_chat_info_missing_chat()
        test_extract_character_chat_info_chat_plus_specific()
        test_extract_character_chat_info_multiple_specific_operations()
        test_extract_character_chat_info_conflicting_chats()

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
