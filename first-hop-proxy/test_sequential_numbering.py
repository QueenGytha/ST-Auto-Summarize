#!/usr/bin/env python
"""
Test sequential numbering across different operation types
"""
import sys
import os
import tempfile
import shutil

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from first_hop_proxy.request_logger import RequestLogger


def test_sequential_numbering():
    """Test that log numbering is sequential across all operation types"""
    print("Testing sequential numbering across operation types...")

    # Create temporary directory for testing
    temp_dir = tempfile.mkdtemp()

    try:
        # Create mock config
        config = {
            "logging": {
                "enabled": True
            }
        }

        logger = RequestLogger(config)

        # Simulate creating log files in sequence with different operation types
        # First, create some fake log files with complex operation names (hyphens, underscores)
        test_files = [
            "00001-chat.log",
            "00002-lorebook_entry_lookup-character-Anonfilly.log",
            "00003-merge_lorebook_entry-character-Twilight.log",
            "00004-generate_running_summary.log",
        ]

        for filename in test_files:
            filepath = os.path.join(temp_dir, filename)
            with open(filepath, 'w') as f:
                f.write("test")

        # Now test that the next number is 5 for ANY operation type
        next_chat = logger._get_next_log_number(temp_dir, "chat")
        assert next_chat == 5, f"Expected 5 for chat, got {next_chat}"

        next_lorebook = logger._get_next_log_number(temp_dir, "lorebook_entry_lookup-character-Test")
        assert next_lorebook == 5, f"Expected 5 for lorebook, got {next_lorebook}"

        next_summary = logger._get_next_log_number(temp_dir, "generate_running_summary")
        assert next_summary == 5, f"Expected 5 for summary, got {next_summary}"

        next_new_type = logger._get_next_log_number(temp_dir, "new_type_with-hyphens")
        assert next_new_type == 5, f"Expected 5 for new_type, got {next_new_type}"

        print("[PASS] Sequential numbering works correctly across all operation types (including complex names)")

        # Test with gaps in numbering
        os.remove(os.path.join(temp_dir, "00002-lorebook_entry_lookup-character-Anonfilly.log"))
        next_num = logger._get_next_log_number(temp_dir, "chat")
        assert next_num == 5, f"Expected 5 even with gaps, got {next_num}"

        print("[PASS] Sequential numbering handles gaps correctly")

    finally:
        # Cleanup
        shutil.rmtree(temp_dir)


def test_empty_folder():
    """Test that empty folder starts at 1"""
    print("\nTesting empty folder starts at 1...")

    temp_dir = tempfile.mkdtemp()

    try:
        config = {
            "logging": {
                "enabled": True
            }
        }

        logger = RequestLogger(config)

        next_num = logger._get_next_log_number(temp_dir, "chat")
        assert next_num == 1, f"Expected 1 for empty folder, got {next_num}"

        print("[PASS] Empty folder starts at 1")

    finally:
        shutil.rmtree(temp_dir)


def test_error_suffixes():
    """Test that error suffixes are added correctly"""
    print("\nTesting error suffix generation...")

    temp_dir = tempfile.mkdtemp()

    try:
        config = {
            "logging": {
                "enabled": True
            }
        }

        logger = RequestLogger(config)

        # Test success (no error)
        filename = logger._get_sequenced_filename("chat", temp_dir, error=None)
        assert filename == "00001-chat.log", f"Expected '00001-chat.log', got '{filename}'"

        # Test rate limit error (429)
        rate_error = Exception("HTTP 429: Rate limit exceeded")
        filename = logger._get_sequenced_filename("chat", temp_dir, error=rate_error)
        assert filename == "00001-chat-RATELIMIT.log", f"Expected '00001-chat-RATELIMIT.log', got '{filename}'"

        # Test quota error
        quota_error = Exception("Quota exceeded for model")
        filename = logger._get_sequenced_filename("chat", temp_dir, error=quota_error)
        assert filename == "00001-chat-RATELIMIT.log", f"Expected '00001-chat-RATELIMIT.log', got '{filename}'"

        # Test general failure
        general_error = Exception("Connection timeout")
        filename = logger._get_sequenced_filename("chat", temp_dir, error=general_error)
        assert filename == "00001-chat-FAILED.log", f"Expected '00001-chat-FAILED.log', got '{filename}'"

        print("[PASS] Error suffixes are generated correctly")

    finally:
        shutil.rmtree(temp_dir)


def test_numbering_with_error_suffixes():
    """Test that numbering continues correctly across files with different error statuses"""
    print("\nTesting sequential numbering with error suffixes...")

    temp_dir = tempfile.mkdtemp()

    try:
        config = {
            "logging": {
                "enabled": True
            }
        }

        logger = RequestLogger(config)

        # Create mix of success, failed, and rate limit files
        test_files = [
            "00001-chat.log",
            "00002-chat-RATELIMIT.log",
            "00003-lorebook-FAILED.log",
            "00004-summary.log",
            "00005-chat-RATELIMIT.log",
        ]

        for filename in test_files:
            filepath = os.path.join(temp_dir, filename)
            with open(filepath, 'w') as f:
                f.write("test")

        # Next number should be 6 for any operation type
        next_num = logger._get_next_log_number(temp_dir, "chat")
        assert next_num == 6, f"Expected 6, got {next_num}"

        # Generated filenames should use correct numbering
        success_file = logger._get_sequenced_filename("chat", temp_dir, error=None)
        assert success_file == "00006-chat.log", f"Expected '00006-chat.log', got '{success_file}'"

        rate_error = Exception("429 Too Many Requests")
        rate_file = logger._get_sequenced_filename("lorebook", temp_dir, error=rate_error)
        assert rate_file == "00006-lorebook-RATELIMIT.log", f"Expected '00006-lorebook-RATELIMIT.log', got '{rate_file}'"

        print("[PASS] Sequential numbering works correctly with error suffixes")

    finally:
        shutil.rmtree(temp_dir)


def main():
    """Run all tests"""
    print("=" * 80)
    print("Sequential Numbering Tests")
    print("=" * 80)

    try:
        test_sequential_numbering()
        test_empty_folder()
        test_error_suffixes()
        test_numbering_with_error_suffixes()

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
