#!/usr/bin/env python3
"""
Entry point for First Hop Proxy application
"""
import sys
import os

# Add src directory to Python path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from first_hop_proxy.main import main

if __name__ == "__main__":
    main()
