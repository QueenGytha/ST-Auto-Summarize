#!/usr/bin/env python3
"""
Test script to verify concurrent logging works without race conditions.

This test creates multiple threads that simultaneously create log files,
verifying that:
1. No log numbers are duplicated
2. All log files are created successfully
3. No race conditions occur
"""

import os
import sys
import time
import threading
import tempfile
import shutil
from pathlib import Path

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from first_hop_proxy.request_logger import RequestLogger
from first_hop_proxy.error_logger import ErrorLogger


def test_concurrent_request_logging():
    """Test concurrent request log creation"""
    print("=" * 80)
    print("Testing Concurrent Request Logging")
    print("=" * 80)

    # Create temporary directory for logs
    temp_dir = tempfile.mkdtemp()
    log_folder = os.path.join(temp_dir, "logs", "characters", "test_char", "test_chat")
    os.makedirs(log_folder, exist_ok=True)

    try:
        # Create request logger
        config = {
            "logging": {
                "enabled": True,
                "include_request_data": True,
                "include_response_data": True,
                "include_headers": True,
                "include_timing": True
            }
        }
        request_logger = RequestLogger(config)

        # Track created log files
        created_files = []
        errors = []
        lock = threading.Lock()

        def create_log(thread_id):
            """Create a log file in a thread"""
            try:
                character_chat_info = ("test_char", "test_chat", f"operation_{thread_id}")

                # Start a log
                filepath = request_logger.start_request_log(
                    request_id=f"req_{thread_id}",
                    endpoint="/chat/completions",
                    request_data={"messages": [{"role": "user", "content": f"Test {thread_id}"}]},
                    headers={"Authorization": "Bearer test"},
                    start_time=time.time(),
                    character_chat_info=character_chat_info
                )

                if filepath:
                    with lock:
                        created_files.append(filepath)

                    # Simulate some processing time
                    time.sleep(0.01)

                    # Complete the log
                    request_logger.complete_request_log(
                        filepath=filepath,
                        response_data={"choices": [{"message": {"content": f"Response {thread_id}"}}]},
                        end_time=time.time(),
                        duration=0.01
                    )
                else:
                    with lock:
                        errors.append(f"Thread {thread_id}: Failed to create log")

            except Exception as e:
                with lock:
                    errors.append(f"Thread {thread_id}: {str(e)}")

        # Create 20 threads to simulate concurrent requests
        threads = []
        num_threads = 20

        print(f"\nCreating {num_threads} concurrent log files...")
        start_time = time.time()

        for i in range(num_threads):
            thread = threading.Thread(target=create_log, args=(i,))
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        duration = time.time() - start_time

        # Verify results
        print(f"\nCompleted in {duration:.3f}s")
        print(f"Created files: {len(created_files)}")
        print(f"Errors: {len(errors)}")

        if errors:
            print("\nErrors:")
            for error in errors:
                print(f"  - {error}")

        # Check for duplicate log numbers
        log_numbers = []
        for filepath in created_files:
            filename = os.path.basename(filepath)
            # Extract log number (format: 00001-operation.md)
            parts = filename.split('-')
            if parts and parts[0].isdigit():
                log_numbers.append(int(parts[0]))

        duplicates = [num for num in log_numbers if log_numbers.count(num) > 1]
        unique_duplicates = list(set(duplicates))

        if unique_duplicates:
            print(f"\n[FAILED] Found duplicate log numbers: {unique_duplicates}")
            print(f"Log numbers: {sorted(log_numbers)}")
            return False

        # Check all files were created
        if len(created_files) != num_threads:
            print(f"\n[FAILED] Expected {num_threads} files, got {len(created_files)}")
            return False

        # Check log numbers are sequential (continuous range, may not start at 1)
        sorted_numbers = sorted(log_numbers)
        min_num = sorted_numbers[0]
        max_num = sorted_numbers[-1]
        expected_numbers = list(range(min_num, max_num + 1))

        if sorted_numbers != expected_numbers:
            print(f"\n[FAILED] Log numbers not continuous")
            print(f"Expected: {expected_numbers}")
            print(f"Got: {sorted_numbers}")
            return False

        print("\n[SUCCESS] All concurrent logs created correctly!")
        print(f"   - No duplicate log numbers")
        print(f"   - All {num_threads} files created")
        print(f"   - Log numbers are sequential: {min_num}-{max_num}")
        return True

    finally:
        # Clean up
        shutil.rmtree(temp_dir)


def test_concurrent_error_logging():
    """Test concurrent error log creation"""
    print("\n" + "=" * 80)
    print("Testing Concurrent Error Logging")
    print("=" * 80)

    # Create temporary directory for logs
    temp_dir = tempfile.mkdtemp()
    log_folder = os.path.join(temp_dir, "logs", "characters", "test_char", "test_chat")
    os.makedirs(log_folder, exist_ok=True)

    try:
        # Create error logger
        config = {
            "error_logging": {
                "enabled": True,
                "include_stack_traces": True,
                "include_request_context": True,
                "include_timing": True,
                "max_file_size_mb": 10,
                "max_files": 100
            }
        }
        error_logger = ErrorLogger(config)

        # Track created log files
        created_files = []
        errors = []
        lock = threading.Lock()

        def create_error_log(thread_id):
            """Create an error log file in a thread"""
            try:
                character_chat_info = ("test_char", "test_chat", f"operation_{thread_id}")

                # Create an error
                test_error = Exception(f"Test error {thread_id}")

                # Log the error
                filepath = error_logger.log_error(
                    error=test_error,
                    context={"thread_id": thread_id},
                    character_chat_info=character_chat_info
                )

                if filepath:
                    with lock:
                        created_files.append(filepath)
                else:
                    with lock:
                        errors.append(f"Thread {thread_id}: Failed to create error log")

            except Exception as e:
                with lock:
                    errors.append(f"Thread {thread_id}: {str(e)}")

        # Create 20 threads to simulate concurrent errors
        threads = []
        num_threads = 20

        print(f"\nCreating {num_threads} concurrent error log files...")
        start_time = time.time()

        for i in range(num_threads):
            thread = threading.Thread(target=create_error_log, args=(i,))
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        duration = time.time() - start_time

        # Verify results
        print(f"\nCompleted in {duration:.3f}s")
        print(f"Created files: {len(created_files)}")
        print(f"Errors: {len(errors)}")

        if errors:
            print("\nErrors:")
            for error in errors:
                print(f"  - {error}")

        # Check for duplicate log numbers
        log_numbers = []
        for filepath in created_files:
            filename = os.path.basename(filepath)
            # Extract log number (format: 00001-operation-ERROR.md)
            parts = filename.split('-')
            if parts and parts[0].isdigit():
                log_numbers.append(int(parts[0]))

        duplicates = [num for num in log_numbers if log_numbers.count(num) > 1]
        unique_duplicates = list(set(duplicates))

        if unique_duplicates:
            print(f"\n[FAILED] Found duplicate log numbers: {unique_duplicates}")
            print(f"Log numbers: {sorted(log_numbers)}")
            return False

        # Check all files were created
        if len(created_files) != num_threads:
            print(f"\n[FAILED] Expected {num_threads} files, got {len(created_files)}")
            return False

        print("\n[SUCCESS] All concurrent error logs created correctly!")
        print(f"   - No duplicate log numbers")
        print(f"   - All {num_threads} files created")
        return True

    finally:
        # Clean up
        shutil.rmtree(temp_dir)


if __name__ == "__main__":
    print("\nConcurrent Logging Test Suite")
    print("=" * 80)

    # Run tests
    test1_passed = test_concurrent_request_logging()
    test2_passed = test_concurrent_error_logging()

    # Summary
    print("\n" + "=" * 80)
    print("Test Summary")
    print("=" * 80)
    print(f"Request Logging: {'[PASSED]' if test1_passed else '[FAILED]'}")
    print(f"Error Logging:   {'[PASSED]' if test2_passed else '[FAILED]'}")

    if test1_passed and test2_passed:
        print("\nAll tests passed!")
        sys.exit(0)
    else:
        print("\nSome tests failed")
        sys.exit(1)
