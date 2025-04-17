"""
API router for the AI Agent endpoints.

This module defines FastAPI endpoints for interacting with the AI agent.
"""
from typing import Any, Dict, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
import logging
import json
import asyncio

from ai.api.agent.schemas.request import AgentRequest
from ai.api.agent.schemas.response import AgentResponse, AgentMessage
from ai.api.agent.agent import process_agent_request

# Set up logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/api/agent",
    tags=["agent"],
)

@router.post("/ask", response_model=AgentResponse)
async def ask_agent(request: AgentRequest) -> AgentResponse:
    """
    Process a request to the AI agent and return a response.
    
    Args:
        request: The agent request payload
        
    Returns:
        The agent's response
    """
    logger.info(f"Received agent request: {request.get('question')}")
    
    try:
        # Force streaming to false to get a complete response
        request_data = dict(request)
        request_data["streamResponse"] = False
        
        # Process the request
        response = await process_agent_request(request_data)
        
        return response
    except Exception as e:
        logger.error(f"Error processing agent request: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")

@router.post("/ask/stream")
async def stream_agent_response(request: AgentRequest):
    """
    Stream a response from the AI agent.
    
    Args:
        request: The agent request payload
        
    Returns:
        A streaming response of the agent's messages
    """
    logger.info(f"Received streaming agent request: {request.get('question')}")
    
    async def event_generator():
        """Generate server-sent events."""
        try:
            # Force streaming to true
            request_data = dict(request)
            request_data["streamResponse"] = True
            
            # Get the streaming response
            message_stream = await process_agent_request(request_data)
            
            # Stream each message
            async for message in message_stream:
                if isinstance(message, AgentMessage):
                    # Convert to dict for JSON serialization
                    message_dict = {
                        "role": message.role.value,
                        "content": message.content
                    }
                    yield f"data: {json.dumps(message_dict)}\n\n"
            
            # End of stream
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Error streaming agent response: {e}")
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"
            yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )

@router.get("/health")
async def health_check() -> Dict[str, str]:
    """
    Check the health of the agent API.
    
    Returns:
        A dictionary with the status
    """
    return {"status": "healthy"} 