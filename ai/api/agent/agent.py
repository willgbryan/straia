"""
Core Agent Implementation

This module contains the main agent logic for processing requests and generating responses.
"""
import logging
import asyncio
from typing import List, Dict, Any, Optional, AsyncIterator, Union
import os
from datetime import datetime

from .schemas.request import AgentRequest
from .schemas.response import AgentMessage, AgentResponse, MessageRole, AgentStreamResponse
from .context_pruner import prune_context, DEFAULT_TOTAL_TOKEN_LIMIT

# Configure logging
logger = logging.getLogger(__name__)


class Agent:
    """Main Agent class responsible for processing requests and generating responses."""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Initialize the Agent with optional configuration.
        
        Args:
            config: Optional configuration dictionary
        """
        self.config = config or {}
        # Get token limit from config or use default
        self.token_limit = self.config.get("token_limit", DEFAULT_TOTAL_TOKEN_LIMIT)
        
        # Additional initialization logic can be added here, such as:
        # - Loading models
        # - Setting up connections to external services
        # - Loading environment variables
        
        # Log agent initialization
        logger.info("Agent initialized with config: %s", self.config)
    
    async def process_request(self, request: AgentRequest) -> AgentResponse:
        """Process an agent request and return a response.
        
        Args:
            request: The agent request to process
            
        Returns:
            AgentResponse object containing the agent's response
        """
        try:
            logger.info("Processing request with question: %s", request.get("question", ""))
            
            # Extract needed information from the request
            question = request.get("question", "")
            context = request.get("context", {})
            user_id = request.get("userId")
            document_id = request.get("documentId")
            previous_messages = request.get("previousMessages", [])
            
            # Prune context to fit within token limits
            if context:
                logger.info("Pruning context to fit within token limits")
                pruned_context = prune_context(
                    context,
                    question,
                    previous_messages,
                    total_token_limit=self.token_limit
                )
                
                # Log context pruning stats
                original_blocks = len(context.get("blocks", []))
                pruned_blocks = len(pruned_context.get("blocks", []))
                original_tables = sum(len(ds.get("tables", [])) for ds in context.get("dataSources", []))
                pruned_tables = sum(len(ds.get("tables", [])) for ds in pruned_context.get("dataSources", []))
                
                logger.info(
                    f"Context pruned: blocks {pruned_blocks}/{original_blocks}, "
                    f"tables {pruned_tables}/{original_tables}"
                )
                
                # Replace the original context with the pruned version
                context = pruned_context
            
            # TODO: Implement actual agent logic here
            # For now, we'll just return a dummy response
            messages = []
            
            # If there are previous messages, include them
            messages.extend(previous_messages)
            
            # Add the new response
            response_content = f"This is a placeholder response to: {question}"
            if context:
                context_summary = f"{len(context.get('blocks', []))} blocks, {sum(len(ds.get('tables', [])) for ds in context.get('dataSources', []))} tables"
                response_content += f"\n\nI considered this context: {context_summary}"
                
            messages.append({
                "role": MessageRole.ASSISTANT,
                "content": response_content
            })
            
            # Prepare metadata
            metadata = {
                "timestamp": datetime.utcnow().isoformat(),
                "processed": True,
                "userId": user_id,
                "documentId": document_id,
                "contextSize": {
                    "blocks": len(context.get("blocks", [])),
                    "tables": sum(len(ds.get("tables", [])) for ds in context.get("dataSources", []))
                }
            }
            
            return AgentResponse(
                messages=messages,
                metadata=metadata
            )
            
        except Exception as e:
            logger.exception("Error processing agent request")
            return AgentResponse(
                error=f"Error processing request: {str(e)}",
                metadata={"timestamp": datetime.utcnow().isoformat()}
            )
    
    async def stream_response(self, request: AgentRequest) -> AgentStreamResponse:
        """Stream an agent response.
        
        Args:
            request: The agent request to process
            
        Yields:
            AgentMessage objects as they are generated
        """
        try:
            question = request.get("question", "")
            context = request.get("context", {})
            previous_messages = request.get("previousMessages", [])
            
            logger.info("Streaming response for question: %s", question)
            
            # Prune context if provided
            if context:
                logger.info("Pruning context for streaming response")
                context = prune_context(
                    context,
                    question,
                    previous_messages,
                    total_token_limit=self.token_limit
                )
            
            # Simulate streaming response with chunks of text
            response_parts = [
                "I'm processing your request...",
                f"You asked: {question}",
                "Here's what I found:",
                "This is a placeholder streaming response.",
                "Let me know if you need additional information."
            ]
            
            for part in response_parts:
                # Simulate processing time
                await asyncio.sleep(0.5)
                
                yield AgentMessage(
                    role=MessageRole.ASSISTANT,
                    content=part
                )
                
        except Exception as e:
            logger.exception("Error streaming agent response")
            yield AgentMessage(
                role=MessageRole.ASSISTANT,
                content=f"Error generating streaming response: {str(e)}"
            )


# Create a singleton instance
agent = Agent() 