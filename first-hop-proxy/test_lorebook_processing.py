#!/usr/bin/env python
"""Test script for lorebook entry processing"""

import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from first_hop_proxy.utils import (
    extract_lorebook_entries_from_content,
    strip_lorebook_attributes,
    extract_lorebook_entries_from_messages,
    strip_lorebook_attributes_from_messages
)


def test_extract_lorebook_entries():
    """Test extracting lorebook entries from content"""
    print("=" * 80)
    print("TEST: Extract Lorebook Entries")
    print("=" * 80)

    content = '''<setting_lore name="at-system-depth" uid="14" world="z-AutoLB-Anonfilly - 2025-11-04@04h31m45s" position="4" order="989" depth="4" role="0" keys="anon">
at-system-depth-gytha
</setting_lore>

Some other text here.

<setting_lore name="another-entry" uid="15" world="test-world" position="5" order="990" depth="5" role="1" keys="test">
another-entry-content
</setting_lore>'''

    entries = extract_lorebook_entries_from_content(content)

    print(f"Found {len(entries)} entries:\n")

    for i, entry in enumerate(entries):
        print(f"Entry {i+1}:")
        print("-" * 40)
        print(f"Content: {entry['content']}")
        print(f"Attributes: {entry['attributes']}")
        print(f"\nFormatted:\n{entry['formatted']}")
        print("\n")

    # Verify extraction
    assert len(entries) == 2, f"Expected 2 entries, got {len(entries)}"
    assert entries[0]['content'] == 'at-system-depth-gytha', "First entry content mismatch"
    assert entries[0]['attributes']['name'] == 'at-system-depth', "First entry name mismatch"
    assert entries[0]['attributes']['uid'] == '14', "First entry uid mismatch"

    print("[PASS] Extraction test passed!\n")


def test_strip_lorebook_attributes():
    """Test stripping attributes from lorebook tags"""
    print("=" * 80)
    print("TEST: Strip Lorebook Attributes")
    print("=" * 80)

    content = '''<setting_lore name="at-system-depth" uid="14" world="z-AutoLB-Anonfilly - 2025-11-04@04h31m45s" position="4" order="989" depth="4" role="0" keys="anon">
at-system-depth-gytha
</setting_lore>

Some other text here.

<setting_lore name="another-entry" uid="15" world="test-world">
another-entry-content
</setting_lore>'''

    print("ORIGINAL:")
    print(content)
    print("\n" + "-" * 80 + "\n")

    stripped = strip_lorebook_attributes(content)

    print("STRIPPED:")
    print(stripped)
    print("\n")

    # Verify stripping
    assert '<setting_lore name=' not in stripped, "Attributes not stripped"
    assert '<setting_lore>' in stripped, "Opening tag not preserved"
    assert 'at-system-depth-gytha' in stripped, "Content not preserved"
    assert '</setting_lore>' in stripped, "Closing tag not preserved"
    assert 'Some other text here.' in stripped, "Other text not preserved"

    print("[PASS] Stripping test passed!\n")


def test_messages_processing():
    """Test processing messages with lorebook entries"""
    print("=" * 80)
    print("TEST: Process Messages")
    print("=" * 80)

    messages = [
        {
            'role': 'system',
            'content': 'You are a helpful assistant.'
        },
        {
            'role': 'user',
            'content': '''Hello! <setting_lore name="test" uid="1" position="1" order="1" depth="1" role="0" keys="hello">
test-content
</setting_lore> How are you?'''
        }
    ]

    print("ORIGINAL MESSAGES:")
    for msg in messages:
        print(f"{msg['role']}: {msg['content'][:100]}...")
    print("\n" + "-" * 80 + "\n")

    # Extract entries
    entries = extract_lorebook_entries_from_messages(messages)
    print(f"Extracted {len(entries)} entries:\n")
    for entry in entries:
        print(f"- {entry['content']}")
        print(f"  Attributes: {entry['attributes']}")
    print("\n" + "-" * 80 + "\n")

    # Strip attributes
    stripped_messages = strip_lorebook_attributes_from_messages(messages)

    print("STRIPPED MESSAGES:")
    for msg in stripped_messages:
        print(f"{msg['role']}: {msg['content']}")
    print("\n")

    # Verify
    assert len(entries) == 1, f"Expected 1 entry, got {len(entries)}"
    assert entries[0]['content'] == 'test-content', "Entry content mismatch"
    assert '<setting_lore name=' not in stripped_messages[1]['content'], "Attributes not stripped from message"
    assert '<setting_lore>' in stripped_messages[1]['content'], "Tag not preserved in message"

    print("[PASS] Messages processing test passed!\n")


def main():
    """Run all tests"""
    print("\n")
    print("=" * 80)
    print(" " * 25 + "LOREBOOK PROCESSING TESTS")
    print("=" * 80)
    print("\n")

    try:
        test_extract_lorebook_entries()
        test_strip_lorebook_attributes()
        test_messages_processing()

        print("=" * 80)
        print("ALL TESTS PASSED!")
        print("=" * 80)
        return 0

    except AssertionError as e:
        print("\n" + "=" * 80)
        print(f"TEST FAILED: {e}")
        print("=" * 80)
        return 1
    except Exception as e:
        print("\n" + "=" * 80)
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        print("=" * 80)
        return 1


if __name__ == "__main__":
    sys.exit(main())
