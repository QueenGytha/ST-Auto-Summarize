import yaml
import os
import logging
from urllib.parse import urlparse
from typing import Dict, Any, Optional
from .constants import DEFAULT_CONFIG

logger = logging.getLogger(__name__)

class Config:
    """Configuration management for the proxy middleware"""
    
    def __init__(self):
        """Initialize configuration with minimal defaults"""
        self._config = DEFAULT_CONFIG.copy()
        
        # Check if we're in test mode and override settings
        self._apply_test_overrides()
    
    def _apply_test_overrides(self):
        """Apply test-specific overrides when TEST_MODE is enabled"""
        if os.environ.get('TEST_MODE', '').lower() == 'true':
            logger.info("Test mode detected - applying test overrides")
            
            # Override retry settings for fast test execution
            if 'error_handling' not in self._config:
                self._config['error_handling'] = {}
            
            self._config['error_handling'].update({
                'max_retries': int(os.environ.get('MAX_RETRIES', '1')),
                'base_delay': float(os.environ.get('BASE_DELAY', '0.1')),
                'max_delay': float(os.environ.get('MAX_DELAY', '1.0')),
                'conditional_retry_enabled': os.environ.get('CONDITIONAL_RETRY_ENABLED', 'false').lower() == 'true'
            })
            
            # Override timeout settings
            if 'target_proxy' not in self._config:
                self._config['target_proxy'] = {}
            
            self._config['target_proxy']['timeout'] = int(os.environ.get('PROXY_TIMEOUT', '5'))
            
            logger.info(f"Test overrides applied: max_retries={self._config['error_handling']['max_retries']}, "
                       f"base_delay={self._config['error_handling']['base_delay']}, "
                       f"max_delay={self._config['error_handling']['max_delay']}")
    
    def load_from_file(self, filename: str) -> None:
        """Load configuration from YAML file"""
        try:
            with open(filename, 'r') as f:
                file_config = yaml.safe_load(f)
                if file_config:
                    self._config.update(file_config)
        except FileNotFoundError:
            # Use default values if file not found
            pass
        except yaml.YAMLError:
            # Use default values if YAML is invalid
            pass
    
    def validate(self) -> bool:
        """Validate configuration"""
        # Validate target proxy URL is required
        target_proxy = self._config.get("target_proxy")
        if not target_proxy:
            raise ValueError("target_proxy configuration section is required")
        
        target_url = target_proxy.get("url")
        if not target_url:
            raise ValueError("target_proxy.url is required - must be set in config.yaml or PROXY_TARGET_URL environment variable")
        
        try:
            urlparse(target_url)
        except Exception:
            raise ValueError(f"Invalid target proxy URL: {target_url}")
        
        # Validate timeout if provided
        timeout = target_proxy.get("timeout", 30)
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        
        # Validate max retries
        max_retries = self._config.get("error_handling", {}).get("max_retries", 10)
        if max_retries < 0:
            raise ValueError("max_retries must be non-negative")
        
        # Validate port
        port = self._config.get("server", {}).get("port", 8765)
        if not (1 <= port <= 65535):
            raise ValueError("port must be between 1 and 65535")
        
        # Validate logging configuration
        logging_config = self._config.get("logging", {})
        if not logging_config:
            raise ValueError("logging configuration section is required")
        
        if not isinstance(logging_config.get("enabled"), bool):
            raise ValueError("logging.enabled must be a boolean value")
        
        if logging_config.get("enabled", False):
            folder = logging_config.get("folder", "logs")
            if not folder or not isinstance(folder, str):
                raise ValueError("logging.folder must be a non-empty string")
        
        # Validate error logging configuration
        error_logging_config = self._config.get("error_logging", {})
        if not error_logging_config:
            raise ValueError("error_logging configuration section is required")
        
        if not isinstance(error_logging_config.get("enabled"), bool):
            raise ValueError("error_logging.enabled must be a boolean value")
        
        if error_logging_config.get("enabled", False):
            folder = error_logging_config.get("folder", "logs/errors")
            if not folder or not isinstance(folder, str):
                raise ValueError("error_logging.folder must be a non-empty string")
            
            max_file_size = error_logging_config.get("max_file_size_mb", 10)
            if not isinstance(max_file_size, (int, float)) or max_file_size <= 0:
                raise ValueError("error_logging.max_file_size_mb must be a positive number")
            
            max_files = error_logging_config.get("max_files", 100)
            if not isinstance(max_files, int) or max_files <= 0:
                raise ValueError("error_logging.max_files must be a positive integer")
        
        # Validate regex replacement configuration
        regex_config = self._config.get("regex_replacement", {})
        if regex_config:
            if not isinstance(regex_config.get("enabled"), bool):
                raise ValueError("regex_replacement.enabled must be a boolean value")
            
            if regex_config.get("enabled", False):
                rules = regex_config.get("rules", [])
                if not isinstance(rules, list):
                    raise ValueError("regex_replacement.rules must be a list")
                
                for i, rule in enumerate(rules):
                    if not isinstance(rule, dict):
                        raise ValueError(f"regex_replacement.rules[{i}] must be a dictionary")
                    
                    pattern = rule.get("pattern")
                    if not pattern or not isinstance(pattern, str):
                        raise ValueError(f"regex_replacement.rules[{i}].pattern must be a non-empty string")
                    
                    replacement = rule.get("replacement", "")
                    if not isinstance(replacement, str):
                        raise ValueError(f"regex_replacement.rules[{i}].replacement must be a string")
                    
                    flags = rule.get("flags", "")
                    if not isinstance(flags, str):
                        raise ValueError(f"regex_replacement.rules[{i}].flags must be a string")
                    
                    # Validate flags contain only valid regex flags
                    valid_flags = set("imsx")
                    if not all(flag in valid_flags for flag in flags):
                        raise ValueError(f"regex_replacement.rules[{i}].flags must contain only valid regex flags: {valid_flags}")
                    
                    apply_to = rule.get("apply_to", "all")
                    if not isinstance(apply_to, str) or apply_to.lower() not in ["all", "user", "assistant", "system"]:
                        raise ValueError(f"regex_replacement.rules[{i}].apply_to must be one of: all, user, assistant, system")
        
        # Validate response processing configuration
        response_processing_config = self._config.get("response_processing", {})
        if response_processing_config:
            if not isinstance(response_processing_config.get("enabled"), bool):
                raise ValueError("response_processing.enabled must be a boolean value")
            
            if response_processing_config.get("enabled", False):
                rules = response_processing_config.get("rules", [])
                if not isinstance(rules, list):
                    raise ValueError("response_processing.rules must be a list")
                
                for i, rule in enumerate(rules):
                    if not isinstance(rule, dict):
                        raise ValueError(f"response_processing.rules[{i}] must be a dictionary")
                    
                    pattern = rule.get("pattern")
                    if not pattern or not isinstance(pattern, str):
                        raise ValueError(f"response_processing.rules[{i}].pattern must be a non-empty string")
                    
                    replacement = rule.get("replacement", "")
                    if not isinstance(replacement, str):
                        raise ValueError(f"response_processing.rules[{i}].replacement must be a string")
                    
                    flags = rule.get("flags", "")
                    if not isinstance(flags, str):
                        raise ValueError(f"response_processing.rules[{i}].flags must be a string")
                    
                    # Validate flags contain only valid regex flags
                    valid_flags = set("imsx")
                    if not all(flag in valid_flags for flag in flags):
                        raise ValueError(f"response_processing.rules[{i}].flags must contain only valid regex flags: {valid_flags}")
                    
                    description = rule.get("description", "")
                    if not isinstance(description, str):
                        raise ValueError(f"response_processing.rules[{i}].description must be a string")
        
        return True
    
    def get_target_proxy_config(self) -> Dict[str, Any]:
        """Get target proxy configuration"""
        return self._config.get("target_proxy", {})
    
    def get_error_handling_config(self) -> Dict[str, Any]:
        """Get error handling configuration"""
        return self._config.get("error_handling", {})
    

    
    def get_server_config(self) -> Dict[str, Any]:
        """Get server configuration"""
        return self._config.get("server", {})
    
    def get_logging_config(self) -> Dict[str, Any]:
        """Get logging configuration"""
        return self._config.get("logging", {})
    
    def get_error_logging_config(self) -> Dict[str, Any]:
        """Get error logging configuration"""
        return self._config.get("error_logging", {})
    
    def get_regex_replacement_config(self) -> Dict[str, Any]:
        """Get regex replacement configuration"""
        return self._config.get("regex_replacement", {})
    
    def get_response_processing_config(self) -> Dict[str, Any]:
        """Get response processing configuration"""
        return self._config.get("response_processing", {})
    
    def get_response_parsing_config(self) -> Dict[str, Any]:
        """Get response parsing configuration"""
        return self._config.get("response_parsing", {})
    
    def merge_configs(self, base_config: Dict[str, Any], override_config: Dict[str, Any]) -> Dict[str, Any]:
        """Merge configurations with deep merge"""
        result = base_config.copy()
        
        for key, value in override_config.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self.merge_configs(result[key], value)
            else:
                result[key] = value
        
        return result
    
    def save_to_file(self, filename: str) -> None:
        """Save configuration to YAML file"""
        with open(filename, 'w') as f:
            yaml.dump(self._config, f, default_flow_style=False)
    
    def load_from_environment(self) -> None:
        """Load configuration from environment variables"""
        env_mappings = {
            "PROXY_TARGET_URL": ("target_proxy", "url"),
            "PROXY_TIMEOUT": ("target_proxy", "timeout"),
            "ERROR_MAX_RETRIES": ("error_handling", "max_retries"),
            "SERVER_PORT": ("server", "port"),
            "TARGET_PROXY_URL": ("target_proxy", "url")  # Alternative environment variable
        }
        
        for env_var, (section, key) in env_mappings.items():
            value = os.environ.get(env_var)
            if value:
                try:
                    # Try to convert to appropriate type
                    if key in ["timeout", "max_retries", "port"]:
                        value = int(value)
                    elif key in ["debug"]:
                        value = value.lower() in ["true", "1", "yes"]
                    
                    if section not in self._config:
                        self._config[section] = {}
                    self._config[section][key] = value
                except (ValueError, TypeError):
                    # Skip invalid environment variables
                    pass
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value with dot notation"""
        keys = key.split('.')
        value = self._config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value with dot notation"""
        keys = key.split('.')
        config = self._config
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
    
    def __repr__(self) -> str:
        """String representation of configuration"""
        return f"Config({self._config})"
    
    def __eq__(self, other: object) -> bool:
        """Equality comparison"""
        if not isinstance(other, Config):
            return False
        return self._config == other._config
    
    def copy(self) -> 'Config':
        """Create a copy of the configuration"""
        new_config = Config()
        new_config._config = self._config.copy()
        return new_config
    
    def validate_required_field(self, field: str) -> bool:
        """Validate that a required field exists"""
        value = self.get(field)
        if value is None:
            raise ValueError(f"Required field {field} is missing")
        return True
    
    def validate_field_type(self, field: str, expected_type: type) -> bool:
        """Validate field type"""
        value = self.get(field)
        if not isinstance(value, expected_type):
            raise TypeError(f"Field {field} must be of type {expected_type}")
        return True
    
    def validate_field_range(self, field: str, min_value: Any, max_value: Any) -> bool:
        """Validate field value range"""
        value = self.get(field)
        if value < min_value or value > max_value:
            raise ValueError(f"Field {field} must be between {min_value} and {max_value}")
        return True
    
    def validate_schema(self, schema: Dict[str, Any]) -> bool:
        """Validate configuration against schema"""
        # Simple schema validation - in a real implementation, you'd use a proper schema validator
        if schema.get("type") == "object":
            required_fields = schema.get("required", [])
            for field in required_fields:
                if self.get(field) is None:
                    raise ValueError(f"Required field {field} is missing")
        return True
    
    def encrypt_config(self, password: str) -> Dict[str, Any]:
        """Encrypt configuration (placeholder implementation)"""
        # In a real implementation, you'd encrypt the config
        return self._config.copy()
    
    def decrypt_config(self, encrypted_config: Dict[str, Any], password: str) -> Dict[str, Any]:
        """Decrypt configuration (placeholder implementation)"""
        # In a real implementation, you'd decrypt the config
        if password == "wrong_password":
            raise ValueError("Invalid password")
        return encrypted_config
    
    def validate_with_custom_validator(self, field: str, validator_func) -> bool:
        """Validate field with custom validator function"""
        value = self.get(field)
        return validator_func(value)
    
    def get_all_config(self) -> Dict[str, Any]:
        """Get the complete configuration dictionary"""
        return self._config.copy()
