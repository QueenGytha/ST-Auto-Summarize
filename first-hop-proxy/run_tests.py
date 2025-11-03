#!/usr/bin/env python3
"""
Test runner script with enforced fast settings to prevent freezing.
This script overrides all retry and timeout settings for fast test execution.
"""

import os
import sys
import subprocess
import argparse

def set_test_environment():
    """Set environment variables for fast test execution"""
    test_env = {
        'TEST_MODE': 'true',
        'MAX_RETRIES': '1',
        'BASE_DELAY': '0.1', 
        'MAX_DELAY': '1.0',
        'CONDITIONAL_RETRY_ENABLED': 'false',
        'PROXY_TIMEOUT': '5',
        'PYTEST_TIMEOUT': '30',  # Override pytest timeout
        'PYTEST_ADDOPTS': '--timeout=30 --timeout-method=thread'
    }
    
    for key, value in test_env.items():
        os.environ[key] = value
        print(f"Set {key}={value}")

def run_tests_with_fast_settings(args):
    """Run pytest with enforced fast settings"""
    set_test_environment()
    
    # Build pytest command with fast settings
    pytest_cmd = [
        'python3', '-m', 'pytest',
        '--timeout=30',
        '--timeout-method=thread',
        '-v',
        '--tb=short',
        '--strict-markers'
    ]
    
    # Add any additional arguments
    if args.test_path:
        pytest_cmd.append(args.test_path)
    if args.markers:
        pytest_cmd.extend(['-m', args.markers])
    if args.verbose:
        pytest_cmd.append('-vv')
    if args.failed_first:
        pytest_cmd.append('--ff')
    if args.stop_on_failure:
        pytest_cmd.append('-x')
    
    print(f"Running tests with command: {' '.join(pytest_cmd)}")
    print("Fast settings applied:")
    print("  - max_retries: 1")
    print("  - base_delay: 0.1s")
    print("  - max_delay: 1.0s")
    print("  - conditional_retry_enabled: false")
    print("  - proxy_timeout: 5s")
    print("  - pytest_timeout: 30s")
    print()
    
    # Run the tests
    try:
        result = subprocess.run(pytest_cmd, check=False)
        return result.returncode
    except KeyboardInterrupt:
        print("\nTests interrupted by user")
        return 1
    except Exception as e:
        print(f"Error running tests: {e}")
        return 1

def main():
    parser = argparse.ArgumentParser(description='Run tests with enforced fast settings to prevent freezing')
    parser.add_argument('test_path', nargs='?', help='Path to test file or directory')
    parser.add_argument('-m', '--markers', help='Only run tests matching given marker expression')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')
    parser.add_argument('--ff', '--failed-first', action='store_true', dest='failed_first', 
                       help='Run the last failures first')
    parser.add_argument('-x', '--stop-on-failure', action='store_true', dest='stop_on_failure',
                       help='Stop after first failure')
    
    args = parser.parse_args()
    
    # Ensure we're in the right directory
    if not os.path.exists('pytest.ini'):
        print("Error: pytest.ini not found. Please run from the project root directory.")
        return 1
    
    return run_tests_with_fast_settings(args)

if __name__ == '__main__':
    sys.exit(main())
