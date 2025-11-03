"""
Tests for regex replacement functionality
"""
import unittest
import sys
import os

# Add the parent directory to the path so we can import the modules
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src'))

from first_hop_proxy.utils import apply_regex_replacements, process_messages_with_regex


class TestRegexReplacement(unittest.TestCase):
    """Test cases for regex replacement functionality"""
    
    def test_apply_regex_replacements_basic(self):
        """Test basic regex replacement"""
        text = "Hello world, hello there"
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "i",
                "apply_to": "all"
            }
        ]
        
        result = apply_regex_replacements(text, rules)
        expected = "hi world, hi there"
        self.assertEqual(result, expected)
    
    def test_apply_regex_replacements_multiple_rules(self):
        """Test multiple regex replacement rules"""
        text = "Hello world, hello there"
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "i",
                "apply_to": "all"
            },
            {
                "pattern": "world",
                "replacement": "earth",
                "flags": "",
                "apply_to": "all"
            }
        ]
        
        result = apply_regex_replacements(text, rules)
        expected = "hi earth, hi there"
        self.assertEqual(result, expected)
    
    def test_apply_regex_replacements_with_flags(self):
        """Test regex replacement with different flags"""
        text = "Hello\nWorld\nHello"
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "im",  # case insensitive and multiline
                "apply_to": "all"
            }
        ]
        
        result = apply_regex_replacements(text, rules)
        expected = "hi\nWorld\nhi"
        self.assertEqual(result, expected)
    
    def test_apply_regex_replacements_empty_text(self):
        """Test regex replacement with empty text"""
        text = ""
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "i",
                "apply_to": "all"
            }
        ]
        
        result = apply_regex_replacements(text, rules)
        self.assertEqual(result, "")
    
    def test_apply_regex_replacements_no_rules(self):
        """Test regex replacement with no rules"""
        text = "Hello world"
        rules = []
        
        result = apply_regex_replacements(text, rules)
        self.assertEqual(result, text)
    
    def test_apply_regex_replacements_invalid_rule(self):
        """Test regex replacement with invalid rule (should continue processing)"""
        text = "Hello world"
        rules = [
            {
                "pattern": "[invalid",  # Invalid regex pattern
                "replacement": "hi",
                "flags": "",
                "apply_to": "all"
            },
            {
                "pattern": "world",
                "replacement": "earth",
                "flags": "",
                "apply_to": "all"
            }
        ]
        
        result = apply_regex_replacements(text, rules)
        expected = "Hello earth"  # Should still apply the second rule
        self.assertEqual(result, expected)
    
    def test_process_messages_with_regex(self):
        """Test processing messages with regex replacement"""
        messages = [
            {
                "role": "user",
                "content": "Hello world"
            },
            {
                "role": "assistant",
                "content": "Hello there"
            }
        ]
        
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "i",
                "apply_to": "user"
            }
        ]
        
        result = process_messages_with_regex(messages, rules)
        
        expected = [
            {
                "role": "user",
                "content": "hi world"
            },
            {
                "role": "assistant",
                "content": "Hello there"  # Should not be changed
            }
        ]
        
        self.assertEqual(result, expected)
    
    def test_process_messages_with_regex_all_roles(self):
        """Test processing messages with regex replacement for all roles"""
        messages = [
            {
                "role": "user",
                "content": "Hello world"
            },
            {
                "role": "assistant",
                "content": "Hello there"
            },
            {
                "role": "system",
                "content": "Hello system"
            }
        ]
        
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "i",
                "apply_to": "all"
            }
        ]
        
        result = process_messages_with_regex(messages, rules)
        
        expected = [
            {
                "role": "user",
                "content": "hi world"
            },
            {
                "role": "assistant",
                "content": "hi there"
            },
            {
                "role": "system",
                "content": "hi system"
            }
        ]
        
        self.assertEqual(result, expected)
    
    def test_process_messages_with_regex_empty_messages(self):
        """Test processing empty messages"""
        messages = []
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "i",
                "apply_to": "all"
            }
        ]
        
        result = process_messages_with_regex(messages, rules)
        self.assertEqual(result, [])
    
    def test_process_messages_with_regex_no_content(self):
        """Test processing messages with no content"""
        messages = [
            {
                "role": "user",
                "content": ""
            },
            {
                "role": "assistant",
                "content": None
            }
        ]
        
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "i",
                "apply_to": "all"
            }
        ]
        
        result = process_messages_with_regex(messages, rules)
        expected = [
            {
                "role": "user",
                "content": ""
            },
            {
                "role": "assistant",
                "content": None
            }
        ]
        
        self.assertEqual(result, expected)
    
    def test_process_messages_with_regex_preserves_other_fields(self):
        """Test that other message fields are preserved"""
        messages = [
            {
                "role": "user",
                "content": "Hello world",
                "name": "test_user",
                "timestamp": "2023-01-01"
            }
        ]
        
        rules = [
            {
                "pattern": "hello",
                "replacement": "hi",
                "flags": "i",
                "apply_to": "all"
            }
        ]
        
        result = process_messages_with_regex(messages, rules)
        
        expected = [
            {
                "role": "user",
                "content": "hi world",
                "name": "test_user",
                "timestamp": "2023-01-01"
            }
        ]
        
        self.assertEqual(result, expected)


if __name__ == "__main__":
    unittest.main()
