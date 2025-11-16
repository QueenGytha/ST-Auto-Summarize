"""
Test script to verify rate limit detection logic works with the exact error from the log
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from first_hop_proxy.config import Config
from first_hop_proxy.response_parser import ResponseParser
import json

# Load config
config = Config()
config.load_from_file("config.yaml")

# Create response parser
parser = ResponseParser(config)

# Exact error response from the log file
error_response_text = json.dumps({
    "error": {
        "code": "too_many_requests",
        "message": "Too many requests",
        "type": "rate_limit_error"
    }
})

# Test parsing
print("=" * 80)
print("Testing rate limit detection with exact error from log")
print("=" * 80)
print(f"Original status: 200")
print(f"Error response: {error_response_text}")
print()

new_status, parsing_info = parser.parse_and_recategorize(error_response_text, 200)

print(f"New status: {new_status}")
print(f"Parsing info: {json.dumps(parsing_info, indent=2)}")
print()

if parsing_info.get("recategorized"):
    print("✅ SUCCESS! Status was recategorized from 200 → 429")
    print("   Rate limit retry should have been triggered!")
else:
    print("❌ FAILURE! Status was NOT recategorized")
    print(f"   Reason: {parsing_info.get('reason')}")
    print(f"   Error messages extracted: {parsing_info.get('error_messages')}")

print("=" * 80)
