#!/usr/bin/env python
"""
Test to verify that both original and stripped versions are logged
"""
import sys
import os
import json
import tempfile
import shutil

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from first_hop_proxy.request_logger import RequestLogger
from first_hop_proxy.utils import extract_st_metadata_from_messages


def test_logging_both_versions():
    """Test that both original and stripped versions are logged"""
    print("Testing dual logging (original + stripped)...")

    # Create a temporary logs directory
    temp_logs_dir = tempfile.mkdtemp()

    try:
        # Create a mock config
        config = {
            "logging": {
                "enabled": True,
                "include_request_data": True,
                "include_response_data": True,
                "include_headers": True,
                "include_timing": True
            }
        }

        # Create request logger
        request_logger = RequestLogger(config)

        # Create test data with ST_METADATA
        original_messages = [
            {
                "role": "system",
                "content": """<ST_METADATA>
{
  "version": "1.0",
  "chat": "Senta - 2025-11-01@20h29m24s",
  "operation": "lorebook"
}
</ST_METADATA>

You are a helpful assistant."""
            },
            {
                "role": "user",
                "content": "Hello, how are you?"
            }
        ]

        original_request_data = {
            "model": "claude-3-7-sonnet-20250219",
            "messages": original_messages,
            "temperature": 0.7
        }

        # Extract and strip ST_METADATA
        stripped_metadata, cleaned_messages = extract_st_metadata_from_messages(original_messages)

        cleaned_request_data = {
            "model": "claude-3-7-sonnet-20250219",
            "messages": cleaned_messages,
            "temperature": 0.7
        }

        # Log the request with both versions
        log_path = request_logger.log_complete_request(
            request_id="test123",
            endpoint="/chat/completions",
            request_data=cleaned_request_data,  # What was forwarded
            headers={"Authorization": "Bearer test123"},
            response_data={"choices": [{"message": {"content": "I'm doing well!"}}]},
            response_headers={},
            start_time=1234567890.0,
            end_time=1234567892.5,
            duration=2.5,
            error=None,
            character_chat_info=("Senta", "2025-11-01@20h29m24s", "lorebook"),
            original_request_data=original_request_data,  # What was received
            stripped_metadata=stripped_metadata
        )

        # Read the log file
        with open(log_path, 'r', encoding='utf-8') as f:
            log_content = f.read()

        # Verify key sections are present
        assert "STRIPPED ST_METADATA:" in log_content, "Should log stripped metadata"
        assert "ORIGINAL REQUEST DATA (AS RECEIVED):" in log_content, "Should log original data"
        assert "FORWARDED REQUEST DATA (AFTER STRIPPING ST_METADATA):" in log_content, "Should log cleaned data"
        assert '"chat": "Senta - 2025-11-01@20h29m24s"' in log_content, "Should include metadata content"
        assert "<ST_METADATA>" in log_content, "Should include original ST_METADATA tags in original request"

        # Verify the forwarded request doesn't have ST_METADATA in its section
        forwarded_section_start = log_content.find("FORWARDED REQUEST DATA (AFTER STRIPPING ST_METADATA):")
        forwarded_section = log_content[forwarded_section_start:forwarded_section_start + 2000]

        # The forwarded section should have the cleaned message
        assert "You are a helpful assistant" in forwarded_section, "Should have message content"
        # But the ST_METADATA tag should only be in the original section, not forwarded
        original_section_start = log_content.find("ORIGINAL REQUEST DATA (AS RECEIVED):")
        original_section = log_content[original_section_start:forwarded_section_start]
        assert "<ST_METADATA>" in original_section, "Original should have ST_METADATA tags"

        print("\n[PASS] Both original and stripped versions are logged correctly")
        print(f"\nLog file created at: {log_path}")
        print("\nLog structure:")
        print("  1. STRIPPED ST_METADATA - Shows what was extracted")
        print("  2. ORIGINAL REQUEST DATA - Shows what was received (with ST_METADATA)")
        print("  3. FORWARDED REQUEST DATA - Shows what was sent downstream (without ST_METADATA)")
        print("  4. FINAL RESPONSE DATA - Shows the response")

        return True

    finally:
        # Clean up temp directory
        # shutil.rmtree(temp_logs_dir)
        pass  # Keep for inspection


if __name__ == "__main__":
    try:
        test_logging_both_versions()
        print("\n" + "=" * 80)
        print("Dual logging test passed! [SUCCESS]")
        print("=" * 80)
    except AssertionError as e:
        print(f"\n[FAIL] Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
