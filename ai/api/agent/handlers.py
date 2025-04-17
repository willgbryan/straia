"""
API Handlers for Agent Endpoints

This module contains the FastAPI endpoint handlers for the agent API.
"""
import logging
from typing import Union, Dict, Any, Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from .schemas.request import AgentRequest
from .schemas.response import AgentResponse, AgentMessage
from .agent import agent

# Configure logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/agent", tags=["Agent"])


async def get_request_body(request: Request) -> Dict[str, Any]:
    """Helper function to get the request body."""
    try:
        return await request.json()
    except Exception as e:
        logger.error(f"Error parsing request body: {e}")
        raise HTTPException(status_code=400, detail="Invalid request body")


async def validate_agent_request(data: Dict[str, Any]) -> AgentRequest:
    """Validate that the request contains the minimum required fields.
    
    Args:
        data: The raw request data
        
    Returns:
        Validated AgentRequest
        
    Raises:
        HTTPException: If validation fails
    """
    # Check for required fields
    if "question" not in data:
        raise HTTPException(status_code=400, detail="Missing required field: question")
    
    # Convert to AgentRequest (TypedDict)
    request: AgentRequest = {
        "question": data["question"],
        **{k: v for k, v in data.items() if k != "question"}
    }
    
    # Add session ID if not provided
    if "sessionId" not in request:
        request["sessionId"] = str(uuid4())

    return request


@router.post("/query", response_model=AgentResponse)
async def query_agent(
    data: Dict[str, Any] = Depends(get_request_body)
) -> AgentResponse:
    """Process an agent query and return a complete response.
    
    Args:
        data: The request data
        
    Returns:
        The agent's response
    """
    try:
        request = await validate_agent_request(data)
        logger.info(f"Processing agent query: {request.get('question')}")
        
        # Force streaming to false for this endpoint
        request["streamResponse"] = False
        
        # Process the request
        response = await agent.process_request(request)
        
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.exception("Error processing agent query")
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")


@router.post("/stream")
async def stream_agent_response(
    data: Dict[str, Any] = Depends(get_request_body)
) -> StreamingResponse:
    """Stream an agent response.
    
    Args:
        data: The request data
        
    Returns:
        A streaming response with the agent's messages
    """
    try:
        request = await validate_agent_request(data)
        logger.info(f"Streaming agent response for: {request.get('question')}")
        
        # Force streaming to true for this endpoint
        request["streamResponse"] = True
        
        # Define the streaming content generator
        async def response_generator():
            async for message in agent.stream_response(request):
                # Convert the message to JSON and yield
                yield message.model_dump_json() + "\n"
        
        # Return a streaming response
        return StreamingResponse(
            response_generator(),
            media_type="application/json",
            headers={"X-Session-Id": request.get("sessionId", "")}
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.exception("Error streaming agent response")
        raise HTTPException(status_code=500, detail=f"Error streaming response: {str(e)}") 