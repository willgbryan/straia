#!/usr/bin/env python
"""
Test runner script for agent API tests.

This script provides an easy way to run all agent API tests or specific test types.
Run with: python -m ai.api.agent.tests.run_tests [--simple] [--endpoints] [--all]
"""
import argparse
import asyncio
import subprocess
import sys
import os
from importlib import import_module


def run_endpoint_tests():
    """Run the endpoint integration tests."""
    print("\n=== Running Endpoint Tests ===")
    result = subprocess.run(
        [sys.executable, "-m", "ai.api.agent.tests.test_endpoints"],
        capture_output=True,
        text=True
    )
    
    print(result.stdout)
    if result.stderr:
        print("Errors:", result.stderr)
    
    return result.returncode == 0


async def run_simple_tests():
    """Run the simple direct API tests."""
    print("\n=== Running Simple API Tests ===")
    try:
        # Import and run the simple test module
        simple_test = import_module("ai.api.agent.tests.simple_test")
        return await simple_test.main() == 0
    except Exception as e:
        print(f"Error running simple tests: {e}")
        return False


async def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Run agent API tests")
    parser.add_argument("--simple", action="store_true", help="Run simple direct API tests")
    parser.add_argument("--endpoints", action="store_true", help="Run endpoint integration tests")
    parser.add_argument("--all", action="store_true", help="Run all tests")
    args = parser.parse_args()
    
    # If no specific tests are selected, run all tests
    if not (args.simple or args.endpoints):
        args.all = True
    
    results = {}
    
    # Run selected tests
    if args.all or args.simple:
        results["simple"] = await run_simple_tests()
    
    if args.all or args.endpoints:
        results["endpoints"] = run_endpoint_tests()
    
    # Print summary
    print("\n=== Test Results Summary ===")
    for test_name, success in results.items():
        print(f"{test_name.capitalize()} Tests: {'✅ PASSED' if success else '❌ FAILED'}")
    
    # Return overall success status
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main())) 