"""
Simple direct test script for agent API endpoints.

This script tests the no-auth test endpoints directly.
Run with: python -m ai.api.agent.tests.simple_test
"""
import asyncio
import json
import os
import sys
import httpx
from typing import Dict, Any

# Configure test parameters
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
TEST_DOCUMENT_ID = os.environ.get("TEST_DOCUMENT_ID", "00000000-0000-0000-0000-000000000000")

# Try to load config from file if available
try:
    config_path = os.path.join(os.path.dirname(__file__), "config.json")
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            config = json.load(f)
            API_BASE_URL = os.environ.get("API_BASE_URL", config.get("api_base_url", API_BASE_URL))
            TEST_DOCUMENT_ID = os.environ.get("TEST_DOCUMENT_ID", config.get("test_document_id", TEST_DOCUMENT_ID))
except Exception as e:
    print(f"Warning: Could not load config file: {e}")

async def test_query_endpoint():
    """Test the synchronous query endpoint without auth."""
    url = f"{API_BASE_URL}/test/v2/agent/query"
    
    request_data = {
        "question": "What is the purpose of this application?",
        "documentId": TEST_DOCUMENT_ID,
    }
    
    print(f"\nTesting query endpoint: {url}")
    print(f"Request: {json.dumps(request_data, indent=2)}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=request_data, timeout=30.0)
            print(f"Status code: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"Response preview: {json.dumps(result, indent=2, default=str)[:500]}...")
                return True
            else:
                print(f"Error response: {response.text}")
                return False
        except Exception as e:
            print(f"Request error: {e}")
            return False

async def test_stream_endpoint():
    """Test the streaming endpoint without auth."""
    url = f"{API_BASE_URL}/test/v2/agent/stream"
    
    request_data = {
        "question": "Generate a sample SQL query for reporting.",
        "documentId": TEST_DOCUMENT_ID,
    }
    
    print(f"\nTesting stream endpoint: {url}")
    print(f"Request: {json.dumps(request_data, indent=2)}")
    
    async with httpx.AsyncClient() as client:
        try:
            async with client.stream("POST", url, json=request_data, timeout=60.0) as response:
                print(f"Status code: {response.status_code}")
                
                if response.status_code == 200:
                    print("Streaming response:")
                    received_data = []
                    async for chunk in response.aiter_lines():
                        if chunk.strip():
                            print(f"Chunk: {chunk[:100]}..." if len(chunk) > 100 else f"Chunk: {chunk}")
                            received_data.append(chunk)
                    
                    print(f"Received {len(received_data)} chunks")
                    return True
                else:
                    print(f"Error response: {response.text}")
                    return False
        except Exception as e:
            print(f"Request error: {e}")
            return False

async def main():
    """Run the direct tests."""
    print("=== SIMPLE API TEST ===")
    print(f"API Base URL: {API_BASE_URL}")
    print(f"Document ID: {TEST_DOCUMENT_ID}")
    
    query_success = await test_query_endpoint()
    stream_success = await test_stream_endpoint()
    
    print("\n=== TEST SUMMARY ===")
    print(f"Query endpoint: {'✅ SUCCESS' if query_success else '❌ FAILED'}")
    print(f"Stream endpoint: {'✅ SUCCESS' if stream_success else '❌ FAILED'}")
    
    return 0 if query_success and stream_success else 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main())) 