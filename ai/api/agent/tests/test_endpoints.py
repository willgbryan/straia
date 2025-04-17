#!/usr/bin/env python
"""
Integration tests for agent API endpoints.

This module contains pytest-based tests for the agent API endpoints,
including both synchronous and streaming response endpoints.

Run with: pytest -xvs ai/api/agent/tests/test_endpoints.py
"""
import pytest
import httpx
import asyncio
import json
import os
from typing import Dict, Any, List, Optional

# Test configuration
TEST_CONFIG = {
    "api_base_url": os.environ.get("API_BASE_URL", "http://localhost:8000"),
    "document_id": os.environ.get("TEST_DOCUMENT_ID", "test-document-123"),
    "user_id": os.environ.get("TEST_USER_ID", "test-user-456"),
    "workspace_id": os.environ.get("TEST_WORKSPACE_ID", "test-workspace-789"),
    "timeout": 30.0,  # Request timeout in seconds
}

# Try to load config from file if it exists
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "test_config.json")
if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, "r") as f:
            file_config = json.load(f)
            TEST_CONFIG.update(file_config)
    except Exception as e:
        print(f"Warning: Failed to load test configuration from {CONFIG_FILE}: {e}")


@pytest.fixture
async def client():
    """Provides an HTTP client for testing."""
    async with httpx.AsyncClient(
        base_url=TEST_CONFIG["api_base_url"],
        timeout=TEST_CONFIG["timeout"]
    ) as client:
        yield client


def create_test_request(
    question: str = "What is the capital of France?",
    stream: bool = False,
    prev_messages: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Create a test request payload."""
    return {
        "question": question,
        "documentId": TEST_CONFIG["document_id"],
        "userId": TEST_CONFIG["user_id"],
        "workspaceId": TEST_CONFIG["workspace_id"],
        "streamResponse": stream,
        "previousMessages": prev_messages or [],
        "context": "This is a test context for integration testing."
    }


@pytest.mark.asyncio
async def test_query_endpoint(client: httpx.AsyncClient):
    """Test the synchronous query endpoint."""
    # Create request payload
    payload = create_test_request(question="What is the capital of France?")
    
    # Send request
    response = await client.post("/agent/query", json=payload)
    
    # Validate response
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    
    data = response.json()
    assert "answer" in data, "Response should contain an 'answer' field"
    assert isinstance(data["answer"], str), "Answer should be a string"
    assert len(data["answer"]) > 0, "Answer should not be empty"
    
    # Check metadata fields
    assert "metadata" in data, "Response should contain a 'metadata' field"
    metadata = data["metadata"]
    assert "timestamp" in metadata, "Metadata should contain a timestamp"
    assert "userId" in metadata, "Metadata should contain the user ID"
    assert metadata["userId"] == TEST_CONFIG["user_id"], "User ID should match the request"
    assert "documentId" in metadata, "Metadata should contain the document ID"
    assert metadata["documentId"] == TEST_CONFIG["document_id"], "Document ID should match the request"


@pytest.mark.asyncio
async def test_stream_endpoint(client: httpx.AsyncClient):
    """Test the streaming response endpoint."""
    # Create request payload
    payload = create_test_request(
        question="Tell me about machine learning.",
        stream=True
    )
    
    # Send request
    async with client.stream("POST", "/agent/stream", json=payload) as response:
        assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
        
        # Collect response chunks
        chunks = []
        async for chunk in response.aiter_lines():
            if not chunk.strip():
                continue
                
            try:
                data = json.loads(chunk.replace("data: ", ""))
                chunks.append(data)
            except json.JSONDecodeError:
                pytest.fail(f"Invalid JSON in stream chunk: {chunk}")
        
        # Validate response chunks
        assert len(chunks) > 0, "Should receive at least one chunk"
        
        # Check the final chunk should have done=True
        assert chunks[-1].get("done") is True, "Final chunk should have done=True"
        
        # Reconstruct the full answer
        full_answer = "".join(chunk.get("content", "") for chunk in chunks 
                             if "content" in chunk)
        assert len(full_answer) > 0, "Reconstructed answer should not be empty"


@pytest.mark.asyncio
async def test_conversation_context(client: httpx.AsyncClient):
    """Test that the agent maintains conversation context."""
    # First message
    first_payload = create_test_request(
        question="My name is John. What's the capital of France?"
    )
    
    first_response = await client.post("/agent/query", json=first_payload)
    assert first_response.status_code == 200
    first_data = first_response.json()
    
    # Create a follow-up message that references the previous conversation
    prev_messages = [
        {
            "role": "user",
            "content": first_payload["question"]
        },
        {
            "role": "assistant",
            "content": first_data["answer"]
        }
    ]
    
    follow_up_payload = create_test_request(
        question="What's my name?",
        prev_messages=prev_messages
    )
    
    follow_up_response = await client.post("/agent/query", json=follow_up_payload)
    assert follow_up_response.status_code == 200
    follow_up_data = follow_up_response.json()
    
    # The agent should remember the name "John" from the previous message
    answer = follow_up_data["answer"].lower()
    assert "john" in answer, "Agent should remember the user's name from previous message"


@pytest.mark.asyncio
async def test_error_handling(client: httpx.AsyncClient):
    """Test API error handling with an invalid request."""
    # Create an invalid request payload (missing required fields)
    payload = {
        "invalidField": "This should cause an error"
    }
    
    response = await client.post("/agent/query", json=payload)
    
    # Endpoint should return a 4xx error
    assert 400 <= response.status_code < 500, f"Expected 4xx status code, got {response.status_code}"
    
    data = response.json()
    assert "error" in data, "Error response should contain an 'error' field"
    assert isinstance(data["error"], str), "Error should be a string"


if __name__ == "__main__":
    # Allow running with pytest or as a standalone script
    pytest.main(["-xvs", __file__]) 