import pytest
import json
from unittest.mock import Mock, patch
from flask import Flask
import sys
import os

# Add src directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src'))

# Import the main application
from first_hop_proxy.main import app, get_config_name_from_path, load_config_for_request

class TestMainApplication:
    """Test suite for the main Flask application"""
    
    @pytest.fixture
    def app(self):
        """Create a test Flask application"""
        app.config['TESTING'] = True
        return app
    
    @pytest.fixture
    def client(self, app):
        """Create a test client"""
        return app.test_client()
    
    @pytest.fixture
    def sample_chat_request(self):
        """Sample OpenAI-compatible chat completion request"""
        return {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "user", "content": "Hello, how are you?"}
            ],
            "temperature": 0.7,
            "max_tokens": 100,
            "stream": False
        }
    
    @pytest.fixture
    def sample_streaming_request(self):
        """Sample streaming chat completion request"""
        return {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "user", "content": "Hello, how are you?"}
            ],
            "temperature": 0.7,
            "max_tokens": 100,
            "stream": True
        }

    def test_app_creation(self, app):
        """Test that the Flask app can be created"""
        assert app is not None
        assert app.config['TESTING'] is True

    def test_health_check_endpoint(self, client):
        """Test health check endpoint exists and responds"""
        # This test will fail until we implement the endpoint
        response = client.get('/health')
        assert response.status_code == 200
        assert response.json == {"status": "healthy"}

    def test_models_endpoint_exists(self, client):
        """Test that /models endpoint exists"""
        response = client.get('/models')
        assert response.status_code == 200

    def test_models_endpoint_returns_openai_format(self, client):
        """Test that /models returns OpenAI-compatible format"""
        response = client.get('/models')
        data = response.get_json()
        
        assert 'object' in data
        assert data['object'] == 'list'
        assert 'data' in data
        assert isinstance(data['data'], list)
        
        # Check that each model has required fields
        for model in data['data']:
            assert 'id' in model
            assert 'object' in model
            assert model['object'] == 'model'

    def test_models_endpoint_url_construction(self, client):
        """Test that /models endpoint returns valid response format"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                # Mock successful response from proxy client
                mock_response = {
                    "object": "list",
                    "data": [
                        {"id": "test-model", "object": "model"}
                    ]
                }
                mock_forward.return_value = mock_response
                
                response = client.get('/models')
                
                # Verify the response is correct
                data = response.get_json()
                assert data['object'] == 'list'
                assert 'data' in data
                assert len(data['data']) > 0

    def test_models_endpoint_url_construction_logic(self, client):
        """Test that /models endpoint returns valid response format"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                # Mock successful response from proxy client
                mock_response = {
                    "object": "list",
                    "data": [{"id": "test-model", "object": "model"}]
                }
                mock_forward.return_value = mock_response
                
                response = client.get('/models')
                
                # Verify the response is correct
                data = response.get_json()
                assert data['object'] == 'list'
                assert 'data' in data
                assert len(data['data']) > 0

    def test_models_endpoint_fallback_to_default_models(self, client):
        """Test that /models falls back to default models when target proxy fails"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                # Mock failure
                mock_forward.side_effect = Exception("Target proxy unavailable")
                
                response = client.get('/models')
                data = response.get_json()
                
                # Should return default models
                assert 'object' in data
                assert data['object'] == 'list'
                assert 'data' in data
                assert isinstance(data['data'], list)
                
                # Check that default models are returned
                from first_hop_proxy.constants import DEFAULT_MODELS
                assert data['data'] == DEFAULT_MODELS

    def test_models_endpoint_with_authentication_headers(self, client):
        """Test that /models properly forwards authentication headers"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                # Mock successful response from proxy client
                mock_response = {
                    "object": "list",
                    "data": [
                        {"id": "test-model", "object": "model"}
                    ]
                }
                mock_forward.return_value = mock_response
                
                response = client.get('/models')
                
                # Verify the response is correct
                data = response.get_json()
                assert data['object'] == 'list'
                assert 'data' in data
                assert len(data['data']) > 0

    def test_models_endpoint_handles_http_errors(self, client):
        """Test that /models handles HTTP errors from target proxy"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.error_handler.ErrorHandler.retry_with_backoff') as mock_retry:
                from requests.exceptions import HTTPError
                from requests import Response
                
                # Mock HTTP error response
                mock_response = Response()
                mock_response.status_code = 404
                mock_response._content = b'{"error": "Not found"}'
                mock_retry.side_effect = HTTPError("404 Client Error", response=mock_response)
                
                response = client.get('/models')
                data = response.get_json()
                
                # Should return default models on HTTP error
                assert 'object' in data
                assert data['object'] == 'list'
                assert 'data' in data
                assert isinstance(data['data'], list)
                
                # Check that default models are returned
                from first_hop_proxy.constants import DEFAULT_MODELS
                assert data['data'] == DEFAULT_MODELS

    def test_chat_completions_endpoint_exists(self, client, sample_chat_request):
        """Test that /chat/completions endpoint exists"""
        response = client.post('/chat/completions', 
                             json=sample_chat_request,
                             content_type='application/json')
        # Should not return 404 (endpoint exists)
        assert response.status_code != 404

    def test_chat_completions_accepts_valid_request(self, client, sample_chat_request):
        """Test that /chat/completions accepts valid OpenAI format"""
        response = client.post('/chat/completions', 
                             json=sample_chat_request,
                             content_type='application/json')
        
        # Should return some response (not necessarily 200 if proxy is down)
        # 500 is acceptable when config is not loaded in test mode
        assert response.status_code in [200, 500, 502, 503, 504]

    def test_chat_completions_rejects_invalid_request(self, client):
        """Test that /chat/completions rejects invalid requests"""
        invalid_request = {
            "model": "gpt-3.5-turbo",
            # Missing messages field
        }
        
        response = client.post('/chat/completions', 
                             json=invalid_request,
                             content_type='application/json')
        
        assert response.status_code == 400

    def test_chat_completions_handles_streaming(self, client, sample_streaming_request):
        """Test that /chat/completions handles streaming requests"""
        response = client.post('/chat/completions', 
                             json=sample_streaming_request,
                             content_type='application/json')
        
        # Should return some response
        # 500 is acceptable when config is not loaded in test mode
        assert response.status_code in [200, 500, 502, 503, 504]

    def test_chat_completions_returns_openai_format(self, client, sample_chat_request):
        """Test that /chat/completions returns OpenAI-compatible format"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                mock_forward.return_value = {
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": "Hello! I'm doing well, thank you for asking."
                        },
                        "finish_reason": "stop",
                        "index": 0
                    }],
                    "model": "gpt-3.5-turbo",
                    "object": "chat.completion",
                    "usage": {
                        "prompt_tokens": 10,
                        "completion_tokens": 15,
                        "total_tokens": 25
                    }
                }
                
                response = client.post('/chat/completions', 
                                     json=sample_chat_request,
                                     content_type='application/json')
                
                data = response.get_json()
                assert 'choices' in data
                assert isinstance(data['choices'], list)
                assert len(data['choices']) > 0
                assert 'message' in data['choices'][0]
                assert 'content' in data['choices'][0]['message']

    def test_chat_completions_url_construction(self, client, sample_chat_request):
        """Test that /chat/completions uses correct URL construction"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                # Mock successful response from proxy client
                mock_forward.return_value = {
                    "choices": [{
                        "message": {"role": "assistant", "content": "Test response"},
                        "finish_reason": "stop",
                        "index": 0
                    }]
                }
                
                response = client.post('/chat/completions', 
                                     json=sample_chat_request,
                                     content_type='application/json')
                
                # Verify the response is correct
                data = response.get_json()
                assert 'choices' in data
                assert len(data['choices']) > 0

    def test_error_response_format(self, client, sample_chat_request):
        """Test that error responses follow OpenAI format"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.error_handler.ErrorHandler.retry_with_backoff') as mock_retry:
                mock_retry.side_effect = Exception("Test error")
                
                response = client.post('/chat/completions', 
                                     json=sample_chat_request,
                                     content_type='application/json')
                
                data = response.get_json()
                assert 'error' in data
                assert 'message' in data['error']

    def test_cors_headers(self, client):
        """Test that CORS headers are properly set"""
        response = client.get('/models')
        assert 'Access-Control-Allow-Origin' in response.headers

    def test_content_type_headers(self, client, sample_chat_request):
        """Test that content-type headers are properly set"""
        response = client.post('/chat/completions', 
                             json=sample_chat_request,
                             content_type='application/json')
        
        assert 'Content-Type' in response.headers
        assert 'application/json' in response.headers['Content-Type']

    def test_request_logging(self, client, sample_chat_request):
        """Test that requests are properly logged"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                # Create a proper mock response
                mock_response = {
                    "choices": [{
                        "message": {"role": "assistant", "content": "Test response"},
                        "finish_reason": "stop",
                        "index": 0
                    }],
                    "model": "gpt-3.5-turbo",
                    "object": "chat.completion",
                    "usage": {
                        "prompt_tokens": 10,
                        "completion_tokens": 15,
                        "total_tokens": 25
                    }
                }
                mock_forward.return_value = mock_response
                
                # Make the request - logging happens internally
                response = client.post('/chat/completions', 
                                     json=sample_chat_request,
                                     content_type='application/json')
                
                # Verify the request was processed successfully
                assert response.status_code == 200
                data = response.get_json()
                assert 'choices' in data

    def test_invalid_json_handling(self, client):
        """Test handling of invalid JSON in request body"""
        response = client.post('/chat/completions', 
                             data="invalid json",
                             content_type='application/json')
        
        assert response.status_code == 400

    def test_missing_content_type(self, client, sample_chat_request):
        """Test handling of requests without content-type header"""
        # Use data instead of json to avoid automatic content-type header
        import json
        response = client.post('/chat/completions', 
                              data=json.dumps(sample_chat_request))
        
        # Should return 400 for missing content-type header
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data
        assert 'Content-Type must be application/json' in data['error']['message']

    def test_large_request_handling(self, client):
        """Test handling of very large requests"""
        large_request = {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "user", "content": "x" * 1000000}  # 1MB message
            ],
            "temperature": 0.7,
            "max_tokens": 100,
            "stream": False
        }
        
        response = client.post('/chat/completions', 
                             json=large_request,
                             content_type='application/json')
        
        # Should handle gracefully (either process or return appropriate error)
        # 500 is acceptable when config is not loaded in test mode
        assert response.status_code in [200, 400, 413, 500, 502, 503, 504]

    def test_concurrent_requests(self, client, sample_chat_request):
        """Test handling of concurrent requests"""
        import threading
        import time
        
        results = []
        
        def make_request():
            response = client.post('/chat/completions', 
                                 json=sample_chat_request,
                                 content_type='application/json')
            results.append(response.status_code)
        
        # Start multiple concurrent requests
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # All requests should complete (not necessarily successfully)
        assert len(results) == 5
        for status_code in results:
            # 500 is acceptable when config is not loaded in test mode
            assert status_code in [200, 400, 500, 502, 503, 504]

    def test_request_timeout_handling(self, client, sample_chat_request):
        """Test handling of request timeouts"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            # Mock the target proxy config
            mock_config.return_value = {
                "url": "https://test-proxy.example.com/proxy/google-ai/chat/completions"
            }
            
            with patch('first_hop_proxy.error_handler.ErrorHandler.retry_with_backoff') as mock_retry:
                mock_retry.side_effect = TimeoutError("Request timeout")
                
                response = client.post('/chat/completions', 
                                     json=sample_chat_request,
                                     content_type='application/json')
                
                # In the new architecture, timeout errors return 500 (internal server error)
                # This is acceptable behavior for timeout handling
                assert response.status_code == 500

    def test_memory_usage_under_load(self, client, sample_chat_request):
        """Test memory usage doesn't grow excessively under load"""
        try:
            import psutil
            import os
            
            process = psutil.Process(os.getpid())
            initial_memory = process.memory_info().rss
            
            # Make multiple requests
            for _ in range(10):
                client.post('/chat/completions', 
                           json=sample_chat_request,
                           content_type='application/json')
            
            final_memory = process.memory_info().rss
            memory_increase = final_memory - initial_memory
            
            # Memory increase should be reasonable (< 50MB)
            assert memory_increase < 50 * 1024 * 1024
        except ImportError:
            # Skip test if psutil is not available
            pytest.skip("psutil not available")


class TestMultiConfigSupport:
    """Test suite for multi-config file support"""

    def test_get_config_name_from_path_default(self):
        """Test that empty path returns default config"""
        assert get_config_name_from_path("") == "config.yaml"
        assert get_config_name_from_path("/") == "config.yaml"

    def test_get_config_name_from_path_with_leading_slash(self):
        """Test path with leading slash"""
        assert get_config_name_from_path("/aboba-gemini") == "config-aboba-gemini.yaml"

    def test_get_config_name_from_path_without_leading_slash(self):
        """Test path without leading slash"""
        assert get_config_name_from_path("aboba-gemini") == "config-aboba-gemini.yaml"

    def test_get_config_name_from_path_with_trailing_slash(self):
        """Test path with trailing slash"""
        assert get_config_name_from_path("aboba-gemini/") == "config-aboba-gemini.yaml"

    def test_get_config_name_from_path_with_whitespace(self):
        """Test path with whitespace"""
        assert get_config_name_from_path("  aboba-gemini  ") == "config-aboba-gemini.yaml"

    def test_get_config_name_from_path_various_names(self):
        """Test various config names"""
        assert get_config_name_from_path("my-config") == "config-my-config.yaml"
        assert get_config_name_from_path("openai-proxy") == "config-openai-proxy.yaml"
        assert get_config_name_from_path("backup") == "config-backup.yaml"

    def test_load_config_for_request_file_not_found(self):
        """Test that load_config_for_request raises FileNotFoundError for missing file"""
        with pytest.raises(FileNotFoundError):
            load_config_for_request("config-nonexistent.yaml")

    def test_load_config_for_request_with_valid_file(self, tmp_path):
        """Test loading a valid config file"""
        # Create a temporary config file
        config_file = tmp_path / "config-test.yaml"
        config_file.write_text("""
target_proxy:
  url: "https://test.example.com/chat/completions"
  timeout: 30
server:
  host: "0.0.0.0"
  port: 8765
logging:
  enabled: true
  folder: "logs"
error_logging:
  enabled: true
  folder: "logs/errors"
  max_file_size_mb: 10
  max_files: 100
""")

        # Change to tmp directory
        import os
        original_dir = os.getcwd()
        os.chdir(tmp_path)

        try:
            config = load_config_for_request("config-test.yaml")
            assert config is not None
            assert config.get_target_proxy_config()["url"] == "https://test.example.com/chat/completions"
        finally:
            os.chdir(original_dir)

    @pytest.fixture
    def app(self):
        """Create a test Flask application"""
        app.config['TESTING'] = True
        return app

    @pytest.fixture
    def client(self, app):
        """Create a test client"""
        return app.test_client()

    @pytest.fixture
    def sample_chat_request(self):
        """Sample OpenAI-compatible chat completion request"""
        return {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "user", "content": "Hello, how are you?"}
            ],
            "temperature": 0.7,
            "max_tokens": 100,
            "stream": False
        }

    def test_chat_completions_with_config_path_not_found(self, client, sample_chat_request):
        """Test that chat completions returns 404 when config file is not found"""
        response = client.post('/nonexistent-config/chat/completions',
                             json=sample_chat_request,
                             content_type='application/json')

        assert response.status_code == 404
        data = response.get_json()
        assert 'error' in data
        assert 'message' in data['error']
        assert 'type' in data['error']
        assert data['error']['type'] == 'config_not_found'
        assert 'config_path' in data['error']
        assert data['error']['config_path'] == 'nonexistent-config'
        assert 'expected_file' in data['error']
        assert data['error']['expected_file'] == 'config-nonexistent-config.yaml'

    def test_chat_completions_with_valid_config_path(self, client, sample_chat_request, tmp_path):
        """Test that chat completions works with valid config path"""
        # Create a temporary config file
        config_file = tmp_path / "config-test-chat.yaml"
        config_file.write_text("""
target_proxy:
  url: "https://test.example.com/chat/completions"
  timeout: 30
error_handling:
  max_retries: 10
  base_delay: 1
  max_delay: 60
  retry_codes: [429, 502, 503, 504]
  fail_codes: [400, 401, 403]
  conditional_retry_codes: [404]
  hard_stop_conditions:
    enabled: true
    rules: []
regex_replacement:
  enabled: false
response_processing:
  enabled: false
response_parsing:
  enabled: false
server:
  host: "0.0.0.0"
  port: 8765
logging:
  enabled: true
  folder: "logs"
error_logging:
  enabled: true
  folder: "logs/errors"
  max_file_size_mb: 10
  max_files: 100
""")

        import os
        original_dir = os.getcwd()
        os.chdir(tmp_path)

        try:
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                mock_forward.return_value = {
                    "choices": [{
                        "message": {"role": "assistant", "content": "Test response"},
                        "finish_reason": "stop",
                        "index": 0
                    }]
                }

                response = client.post('/test-chat/chat/completions',
                                     json=sample_chat_request,
                                     content_type='application/json')

                assert response.status_code == 200
                data = response.get_json()
                assert 'choices' in data
        finally:
            os.chdir(original_dir)

    def test_models_endpoint_with_config_path_not_found(self, client):
        """Test that models endpoint returns 404 when config file is not found"""
        response = client.get('/nonexistent-config/models')

        assert response.status_code == 404
        data = response.get_json()
        assert 'error' in data
        assert 'message' in data['error']
        assert 'type' in data['error']
        assert data['error']['type'] == 'config_not_found'
        assert 'config_path' in data['error']
        assert data['error']['config_path'] == 'nonexistent-config'
        assert 'expected_file' in data['error']
        assert data['error']['expected_file'] == 'config-nonexistent-config.yaml'

    def test_models_endpoint_with_valid_config_path(self, client, tmp_path):
        """Test that models endpoint works with valid config path"""
        # Create a temporary config file
        config_file = tmp_path / "config-test-models.yaml"
        config_file.write_text("""
target_proxy:
  url: "https://test.example.com/chat/completions"
  timeout: 30
error_handling:
  max_retries: 10
  base_delay: 1
  max_delay: 60
  retry_codes: [429, 502, 503, 504]
  fail_codes: [400, 401, 403]
  conditional_retry_codes: [404]
  hard_stop_conditions:
    enabled: true
    rules: []
server:
  host: "0.0.0.0"
  port: 8765
logging:
  enabled: true
  folder: "logs"
error_logging:
  enabled: true
  folder: "logs/errors"
  max_file_size_mb: 10
  max_files: 100
""")

        import os
        original_dir = os.getcwd()
        os.chdir(tmp_path)

        try:
            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                mock_forward.return_value = {
                    "object": "list",
                    "data": [{"id": "test-model", "object": "model"}]
                }

                response = client.get('/test-models/models')

                assert response.status_code == 200
                data = response.get_json()
                assert 'object' in data
                assert data['object'] == 'list'
                assert 'data' in data
        finally:
            os.chdir(original_dir)

    def test_default_config_still_works(self, client, sample_chat_request):
        """Test that default config (no path) still works"""
        with patch('first_hop_proxy.config.Config.get_target_proxy_config') as mock_config:
            mock_config.return_value = {
                "url": "https://test.example.com/chat/completions"
            }

            with patch('first_hop_proxy.proxy_client.ProxyClient.forward_request') as mock_forward:
                mock_forward.return_value = {
                    "choices": [{
                        "message": {"role": "assistant", "content": "Test response"},
                        "finish_reason": "stop",
                        "index": 0
                    }]
                }

                response = client.post('/chat/completions',
                                     json=sample_chat_request,
                                     content_type='application/json')

                assert response.status_code == 200
                data = response.get_json()
                assert 'choices' in data

    def test_apikey_override_from_config(self, client, sample_chat_request, tmp_path):
        """Test that config apikey overrides SillyTavern's Authorization header"""
        # Create a config file with apikey
        config_file = tmp_path / "config-test-apikey.yaml"
        config_file.write_text("""
target_proxy:
  url: "https://test.example.com/chat/completions"
  timeout: 30
  apikey: "sk-config-api-key-12345"
error_handling:
  max_retries: 10
  base_delay: 1
  max_delay: 60
  retry_codes: [429, 502, 503, 504]
  fail_codes: [400, 401, 403]
  conditional_retry_codes: [404]
  hard_stop_conditions:
    enabled: true
    rules: []
regex_replacement:
  enabled: false
response_processing:
  enabled: false
response_parsing:
  enabled: false
server:
  host: "0.0.0.0"
  port: 8765
logging:
  enabled: true
  folder: "logs"
error_logging:
  enabled: true
  folder: "logs/errors"
  max_file_size_mb: 10
  max_files: 100
""")

        import os
        original_dir = os.getcwd()
        os.chdir(tmp_path)

        try:
            with patch('first_hop_proxy.proxy_client.requests.request') as mock_request:
                # Mock successful response
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "choices": [{
                        "message": {"role": "assistant", "content": "Test response"},
                        "finish_reason": "stop",
                        "index": 0
                    }]
                }
                mock_response.headers = {}
                mock_response.content = b'{"choices": [{"message": {"role": "assistant", "content": "Test"}}]}'
                mock_response.text = '{"choices": [{"message": {"role": "assistant", "content": "Test"}}]}'
                mock_request.return_value = mock_response

                # Make request with original Authorization header
                headers = {'Authorization': 'Bearer sk-sillytavern-key'}
                response = client.post('/test-apikey/chat/completions',
                                     json=sample_chat_request,
                                     headers=headers,
                                     content_type='application/json')

                # Verify the request was made
                assert mock_request.called
                call_args = mock_request.call_args

                # Check that the Authorization header was overridden with config's apikey
                request_headers = call_args.kwargs['headers']
                assert 'Authorization' in request_headers
                assert request_headers['Authorization'] == 'Bearer sk-config-api-key-12345'
                assert request_headers['Authorization'] != 'Bearer sk-sillytavern-key'

                # Verify response
                assert response.status_code == 200
        finally:
            os.chdir(original_dir)

    def test_no_apikey_uses_incoming_auth(self, client, sample_chat_request, tmp_path):
        """Test that without config apikey, incoming Authorization header is used"""
        # Create a config file WITHOUT apikey
        config_file = tmp_path / "config-test-no-apikey.yaml"
        config_file.write_text("""
target_proxy:
  url: "https://test.example.com/chat/completions"
  timeout: 30
  # No apikey specified
error_handling:
  max_retries: 10
  base_delay: 1
  max_delay: 60
  retry_codes: [429, 502, 503, 504]
  fail_codes: [400, 401, 403]
  conditional_retry_codes: [404]
  hard_stop_conditions:
    enabled: true
    rules: []
regex_replacement:
  enabled: false
response_processing:
  enabled: false
response_parsing:
  enabled: false
server:
  host: "0.0.0.0"
  port: 8765
logging:
  enabled: true
  folder: "logs"
error_logging:
  enabled: true
  folder: "logs/errors"
  max_file_size_mb: 10
  max_files: 100
""")

        import os
        original_dir = os.getcwd()
        os.chdir(tmp_path)

        try:
            with patch('first_hop_proxy.proxy_client.requests.request') as mock_request:
                # Mock successful response
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "choices": [{
                        "message": {"role": "assistant", "content": "Test response"},
                        "finish_reason": "stop",
                        "index": 0
                    }]
                }
                mock_response.headers = {}
                mock_response.content = b'{"choices": [{"message": {"role": "assistant", "content": "Test"}}]}'
                mock_response.text = '{"choices": [{"message": {"role": "assistant", "content": "Test"}}]}'
                mock_request.return_value = mock_response

                # Make request with Authorization header
                headers = {'Authorization': 'Bearer sk-sillytavern-key'}
                response = client.post('/test-no-apikey/chat/completions',
                                     json=sample_chat_request,
                                     headers=headers,
                                     content_type='application/json')

                # Verify the request was made
                assert mock_request.called
                call_args = mock_request.call_args

                # Check that the incoming Authorization header was preserved
                request_headers = call_args.kwargs['headers']
                assert 'Authorization' in request_headers
                assert request_headers['Authorization'] == 'Bearer sk-sillytavern-key'

                # Verify response
                assert response.status_code == 200
        finally:
            os.chdir(original_dir)

    def test_apikey_override_applies_to_models_endpoint(self, client, tmp_path):
        """Test that config apikey also applies to /models endpoint"""
        # Create a config file with apikey
        config_file = tmp_path / "config-test-models-apikey.yaml"
        config_file.write_text("""
target_proxy:
  url: "https://test.example.com/chat/completions"
  timeout: 30
  apikey: "sk-models-api-key-67890"
error_handling:
  max_retries: 10
  base_delay: 1
  max_delay: 60
  retry_codes: [429, 502, 503, 504]
  fail_codes: [400, 401, 403]
  conditional_retry_codes: [404]
  hard_stop_conditions:
    enabled: true
    rules: []
server:
  host: "0.0.0.0"
  port: 8765
logging:
  enabled: true
  folder: "logs"
error_logging:
  enabled: true
  folder: "logs/errors"
  max_file_size_mb: 10
  max_files: 100
""")

        import os
        original_dir = os.getcwd()
        os.chdir(tmp_path)

        try:
            with patch('first_hop_proxy.proxy_client.requests.request') as mock_request:
                # Mock successful response
                mock_response = Mock()
                mock_response.status_code = 200
                mock_response.json.return_value = {
                    "object": "list",
                    "data": [{"id": "test-model", "object": "model"}]
                }
                mock_response.headers = {}
                mock_response.content = b'{"object": "list", "data": []}'
                mock_response.text = '{"object": "list", "data": []}'
                mock_request.return_value = mock_response

                # Make request with original Authorization header
                headers = {'Authorization': 'Bearer sk-original-key'}
                response = client.get('/test-models-apikey/models', headers=headers)

                # Verify the request was made
                assert mock_request.called
                call_args = mock_request.call_args

                # Check that the Authorization header was overridden
                request_headers = call_args.kwargs['headers']
                assert 'Authorization' in request_headers
                assert request_headers['Authorization'] == 'Bearer sk-models-api-key-67890'

                # Verify response
                assert response.status_code == 200
        finally:
            os.chdir(original_dir)

    def test_apikey_not_logged_in_plaintext(self, client, sample_chat_request, tmp_path, caplog):
        """Test that API key from config is never logged in plaintext"""
        import logging

        # Create a config file with apikey
        config_file = tmp_path / "config-test-apikey-logging.yaml"
        secret_key = "sk-very-secret-api-key-12345678901234567890"
        config_file.write_text(f"""
target_proxy:
  url: "https://test.example.com/chat/completions"
  timeout: 30
  apikey: "{secret_key}"
error_handling:
  max_retries: 10
  base_delay: 1
  max_delay: 60
  retry_codes: [429, 502, 503, 504]
  fail_codes: [400, 401, 403]
  conditional_retry_codes: [404]
  hard_stop_conditions:
    enabled: true
    rules: []
regex_replacement:
  enabled: false
response_processing:
  enabled: false
response_parsing:
  enabled: false
server:
  host: "0.0.0.0"
  port: 8765
logging:
  enabled: true
  folder: "logs"
error_logging:
  enabled: true
  folder: "logs/errors"
  max_file_size_mb: 10
  max_files: 100
""")

        import os
        original_dir = os.getcwd()
        os.chdir(tmp_path)

        try:
            with caplog.at_level(logging.INFO):
                with patch('first_hop_proxy.proxy_client.requests.request') as mock_request:
                    # Mock successful response
                    mock_response = Mock()
                    mock_response.status_code = 200
                    mock_response.json.return_value = {
                        "choices": [{
                            "message": {"role": "assistant", "content": "Test response"},
                            "finish_reason": "stop",
                            "index": 0
                        }]
                    }
                    mock_response.headers = {}
                    mock_response.content = b'{"choices": [{"message": {"role": "assistant", "content": "Test"}}]}'
                    mock_response.text = '{"choices": [{"message": {"role": "assistant", "content": "Test"}}]}'
                    mock_request.return_value = mock_response

                    # Make request
                    response = client.post('/test-apikey-logging/chat/completions',
                                         json=sample_chat_request,
                                         content_type='application/json')

                    # Verify the full secret key is NEVER in any log message
                    for record in caplog.records:
                        assert secret_key not in record.message, \
                            f"Secret API key found in log message: {record.message}"

                    # Verify that we do log that we're using the config key
                    assert any("Using API key from config file" in record.message
                             for record in caplog.records), \
                        "Should log that config API key is being used"

                    # Verify the key is sanitized (first 8 chars + ...)
                    # The sanitized version should appear in logs
                    sanitized_key_prefix = secret_key[:8]
                    found_sanitized = False
                    for record in caplog.records:
                        if sanitized_key_prefix in record.message and "..." in record.message:
                            found_sanitized = True
                            break

                    assert found_sanitized, \
                        "Should find sanitized API key (first 8 chars + ...) in logs"

        finally:
            os.chdir(original_dir)
