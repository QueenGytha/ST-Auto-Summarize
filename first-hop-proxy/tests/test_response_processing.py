"""
Tests for response processing functionality
"""
import unittest
import json
import sys
import os

# Add src directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src'))

from first_hop_proxy.utils import process_response_with_regex


class TestResponseProcessing(unittest.TestCase):
    """Test cases for response processing functionality"""
    
    def test_process_response_with_regex_basic(self):
        """Test basic response processing with malformed Unicode"""
        response_data = {
            "id": "test-123",
            "object": "chat.completion",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Her mouth was a perfect, full\u00e2\u20ac\u201dlipped bow"
                    },
                    "finish_reason": "stop",
                    "index": 0
                }
            ]
        }
        
        rules = [
            {
                "pattern": "\\u00e2\\u20ac\\u201d",
                "replacement": "—",
                "flags": "",
                "description": "Fix malformed em dash encoding"
            }
        ]
        
        result = process_response_with_regex(response_data, rules)
        
        # Check that the malformed Unicode was fixed
        content = result["choices"][0]["message"]["content"]
        self.assertIn("—", content)
        self.assertNotIn("\\u00e2\\u20ac\\u201d", content)
        self.assertEqual(content, "Her mouth was a perfect, full—lipped bow")
    
    def test_process_response_with_regex_multiple_rules(self):
        """Test response processing with multiple rules"""
        response_data = {
            "id": "test-123",
            "object": "chat.completion",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "She had a full\u00e2\u20ac\u201dlipped smile and wore a \u00e2\u20ac\u009cquoted\u00e2\u20ac\u009d dress"
                    },
                    "finish_reason": "stop",
                    "index": 0
                }
            ]
        }
        
        rules = [
            {
                "pattern": "\\u00e2\\u20ac\\u201d",
                "replacement": "—",
                "flags": "",
                "description": "Fix malformed em dash encoding"
            },
            {
                "pattern": "\\u00e2\\u20ac\\u009c",
                "replacement": "\"",
                "flags": "",
                "description": "Fix malformed left double quotation mark"
            },
            {
                "pattern": "\\u00e2\\u20ac\\u009d",
                "replacement": "\"",
                "flags": "",
                "description": "Fix malformed right double quotation mark"
            }
        ]
        
        result = process_response_with_regex(response_data, rules)
        
        content = result["choices"][0]["message"]["content"]
        self.assertIn("—", content)
        self.assertIn("\"", content)
        self.assertIn("\"", content)
        self.assertNotIn("\\u00e2\\u20ac\\u201d", content)
        self.assertNotIn("\\u00e2\\u20ac\\u009c", content)
        self.assertNotIn("\\u00e2\\u20ac\\u009d", content)
        self.assertEqual(content, "She had a full—lipped smile and wore a \"quoted\" dress")
    
    def test_process_response_with_regex_no_rules(self):
        """Test response processing with no rules"""
        response_data = {
            "id": "test-123",
            "object": "chat.completion",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Her mouth was a perfect, full\u00e2\u20ac\u201dlipped bow"
                    },
                    "finish_reason": "stop",
                    "index": 0
                }
            ]
        }
        
        result = process_response_with_regex(response_data, [])
        
        # Should return unchanged response
        self.assertEqual(result, response_data)
    
    def test_process_response_with_regex_empty_response(self):
        """Test response processing with empty response"""
        response_data = {}
        rules = [
            {
                "pattern": "\\u00e2\\u20ac\\u201d",
                "replacement": "—",
                "flags": "",
                "description": "Fix malformed em dash encoding"
            }
        ]
        
        result = process_response_with_regex(response_data, rules)
        
        # Should return unchanged response
        self.assertEqual(result, response_data)
    
    def test_process_response_with_regex_no_choices(self):
        """Test response processing with response that has no choices"""
        response_data = {
            "id": "test-123",
            "object": "chat.completion",
            "choices": []
        }
        
        rules = [
            {
                "pattern": "\\u00e2\\u20ac\\u201d",
                "replacement": "—",
                "flags": "",
                "description": "Fix malformed em dash encoding"
            }
        ]
        
        result = process_response_with_regex(response_data, rules)
        
        # Should return unchanged response
        self.assertEqual(result, response_data)
    
    def test_process_response_with_regex_multiple_choices(self):
        """Test response processing with multiple choices"""
        response_data = {
            "id": "test-123",
            "object": "chat.completion",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "First choice with full\u00e2\u20ac\u201dlipped"
                    },
                    "finish_reason": "stop",
                    "index": 0
                },
                {
                    "message": {
                        "role": "assistant",
                        "content": "Second choice with \u00e2\u20ac\u009cquotes\u00e2\u20ac\u009d"
                    },
                    "finish_reason": "stop",
                    "index": 1
                }
            ]
        }
        
        rules = [
            {
                "pattern": "\\u00e2\\u20ac\\u201d",
                "replacement": "—",
                "flags": "",
                "description": "Fix malformed em dash encoding"
            },
            {
                "pattern": "\\u00e2\\u20ac\\u009c",
                "replacement": "\"",
                "flags": "",
                "description": "Fix malformed left double quotation mark"
            },
            {
                "pattern": "\\u00e2\\u20ac\\u009d",
                "replacement": "\"",
                "flags": "",
                "description": "Fix malformed right double quotation mark"
            }
        ]
        
        result = process_response_with_regex(response_data, rules)
        
        # Check both choices were processed
        content1 = result["choices"][0]["message"]["content"]
        content2 = result["choices"][1]["message"]["content"]
        
        self.assertIn("—", content1)
        self.assertIn("\"", content2)
        self.assertIn("\"", content2)
        self.assertEqual(content1, "First choice with full—lipped")
        self.assertEqual(content2, "Second choice with \"quotes\"")
    
    def test_process_response_with_regex_literal_garbled_characters(self):
        """Test response processing with literal garbled characters (â€")"""
        response_data = {
            "id": "test-123",
            "object": "chat.completion",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Her eyesâ€\"the color of a winter sky"
                    },
                    "finish_reason": "stop",
                    "index": 0
                }
            ]
        }
        
        rules = [
            {
                "pattern": "â€\"",
                "replacement": "—",
                "flags": "",
                "description": "Fix literal display of malformed em dash encoding"
            }
        ]
        
        result = process_response_with_regex(response_data, rules)
        
        content = result["choices"][0]["message"]["content"]
        self.assertIn("—", content)
        self.assertNotIn("â€\"", content)
        self.assertEqual(content, "Her eyes—the color of a winter sky")
    
    def test_process_response_with_regex_specific_unicode_pattern(self):
        """Test the specific Unicode pattern we found in logs (\u00e2\u20ac")"""
        response_data = {
            "id": "test-123",
            "object": "chat.completion",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "full\u00e2\u20ac\"lipped bow"
                    },
                    "finish_reason": "stop",
                    "index": 0
                }
            ]
        }
        
        rules = [
            {
                "pattern": "\\u00e2\\u20ac\"",
                "replacement": "—",
                "flags": "",
                "description": "Fix Unicode escape sequence for malformed em dash"
            }
        ]
        
        result = process_response_with_regex(response_data, rules)
        
        content = result["choices"][0]["message"]["content"]
        self.assertIn("—", content)
        self.assertNotIn("\\u00e2\\u20ac\"", content)
        self.assertEqual(content, "full—lipped bow")
    
    def test_process_response_with_regex_comprehensive_unicode_fixes(self):
        """Test comprehensive Unicode fixes covering all patterns we identified"""
        response_data = {
            "id": "test-123",
            "object": "chat.completion",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "She had a full\u00e2\u20ac\"lipped smile, wore a \u00e2\u20ac\u009cquoted\u00e2\u20ac\u009d dress, and said \u00e2\u20ac\u0098hello\u00e2\u20ac\u0099"
                    },
                    "finish_reason": "stop",
                    "index": 0
                }
            ]
        }
        
        rules = [
            # Malformed Unicode escape sequences
            {
                "pattern": "\\u00e2\\u20ac\"",
                "replacement": "—",
                "flags": "",
                "description": "Fix Unicode escape sequence for malformed em dash"
            },
            {
                "pattern": "\\u00e2\\u20ac\\u009c",
                "replacement": "\"",
                "flags": "",
                "description": "Fix Unicode escape sequence for malformed left double quote"
            },
            {
                "pattern": "\\u00e2\\u20ac\\u009d",
                "replacement": "\"",
                "flags": "",
                "description": "Fix Unicode escape sequence for malformed right double quote"
            },
            {
                "pattern": "\\u00e2\\u20ac\\u0098",
                "replacement": "'",
                "flags": "",
                "description": "Fix Unicode escape sequence for malformed left single quote"
            },
            {
                "pattern": "\\u00e2\\u20ac\\u0099",
                "replacement": "'",
                "flags": "",
                "description": "Fix Unicode escape sequence for malformed right single quote"
            }
        ]
        
        result = process_response_with_regex(response_data, rules)
        
        content = result["choices"][0]["message"]["content"]
        self.assertIn("—", content)
        self.assertIn("\"", content)
        self.assertIn("\"", content)
        self.assertIn("'", content)
        self.assertIn("'", content)
        self.assertNotIn("\\u00e2\\u20ac\"", content)
        self.assertNotIn("\\u00e2\\u20ac\\u201c", content)
        self.assertNotIn("\\u00e2\\u20ac\\u201d", content)
        self.assertNotIn("\\u00e2\\u20ac\\u2018", content)
        self.assertNotIn("\\u00e2\\u20ac\\u2019", content)
        self.assertEqual(content, "She had a full—lipped smile, wore a \"quoted\" dress, and said 'hello'")


if __name__ == "__main__":
    unittest.main()
