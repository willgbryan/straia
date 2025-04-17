# from langchain.globals import set_debug
# set_debug(True)
# from langchain.globals import set_verbose
# set_verbose(True)

import json
import logging
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi import FastAPI, Depends, HTTPException, status, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, AsyncGenerator
import secrets
from uuid import uuid4
from decouple import config
from .llms import initialize_llm
from .chains.stream.python_edit import create_python_edit_stream_query_chain
from .chains.stream.sql_edit import create_sql_edit_stream_query_chain
from .agent import BrieferAgent
from .agent.schemas.request import AgentRequest
from .agent.schemas.response import AgentResponse, AgentMessage
from .agent.context_collector import get_notebook_context
# Import the new agent module
from .agent.agent import agent as new_agent

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

security = HTTPBasic()

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    # Get credentials from config with fallbacks for testing
    expected_username = config("BASIC_AUTH_USERNAME", default="admin")
    expected_password = config("BASIC_AUTH_PASSWORD", default="password")
    
    # Log auth attempt (without passwords)
    logger.debug(f"Auth attempt with username: {credentials.username}")
    
    correct_username = secrets.compare_digest(credentials.username, expected_username)
    correct_password = secrets.compare_digest(credentials.password, expected_password)
    
    if not (correct_username and correct_password):
        logger.warning(f"Failed authentication attempt for user: {credentials.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    
    logger.debug(f"Successful authentication for user: {credentials.username}")
    return credentials.username


class SQLEditInputData(BaseModel):
    query: str
    instructions: str
    dialect: str
    tableInfo: Optional[str] = None
    modelId: Optional[str] = None
    openaiApiKey: Optional[str] = None

@app.post("/v1/stream/sql/edit")
async def v1_steam_sql_edit(data: SQLEditInputData, _ = Depends(get_current_username)):
    llm = initialize_llm(model_id=data.modelId, openai_api_key=data.openaiApiKey)
    chain = create_sql_edit_stream_query_chain(llm, data.dialect, data.tableInfo)

    async def generate():
        async for result in chain.astream({"query": data.query, "instructions": data.instructions}):
            yield json.dumps(result) + "\n"

    return StreamingResponse(generate(), media_type="text/plain")

class PythonEditInputData(BaseModel):
    source: str
    instructions: str
    allowedLibraries: List[str]
    variables: str
    modelId: Optional[str] = None
    openaiApiKey: Optional[str] = None


@app.post("/v1/stream/python/edit")
async def v1_stream_python_edit(data: PythonEditInputData, _ = Depends(get_current_username)):
    llm = initialize_llm(model_id=data.modelId, openai_api_key=data.openaiApiKey)
    chain = create_python_edit_stream_query_chain(llm)

    async def generate():
        stream = chain.astream({
            "source": data.source,
            "instructions": data.instructions,
            "allowed_libraries": data.allowedLibraries,
            "variables": data.variables
        })
        async for result in stream:
            yield json.dumps(result) + "\n"

    return StreamingResponse(generate(), media_type="text/plain")

# Create an instance of BrieferAgent
agent = BrieferAgent()

# ----- Legacy Agent Endpoints -----

@app.post("/v1/agent/process")
async def process_agent_request(request: AgentRequest, _ = Depends(get_current_username)):
    """
    Process an agent request and return actions.
    
    This is a non-streaming endpoint that returns the complete response.
    """
    document_id = request.get("documentId")
    logger.info(f"Received agent request for document {document_id}")
    
    # Extract context from request or fetch it if not provided
    context = request.get("context")
    if not context and document_id:
        # Collect context from notebook if not provided in the request
        logger.info(f"Collecting context for document {document_id}")
        context = await get_notebook_context(document_id)
    
    question = request.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    
    # Process request with agent
    actions = await agent.process_request(question, context)
    
    # Construct response
    response = {
        "answer": f"I've processed your question: '{question}'",
        "actions": [{"type": action["type"], "payload": action} for action in actions],
        "followupQuestions": ["Can you explain the results?", "What insights can you derive from this data?"]
    }
    
    return response

@app.post("/v1/agent/stream")
async def stream_agent_response(request: AgentRequest, _ = Depends(get_current_username)):
    """
    Stream an agent's response and actions.
    
    Returns a streaming response with chunks of the agent's thinking and actions.
    """
    document_id = request.get("documentId")
    logger.info(f"Received streaming agent request for document {document_id}")
    
    # Extract context from request or fetch it if not provided
    context = request.get("context")
    if not context and document_id:
        # Collect context from notebook if not provided in the request
        logger.info(f"Collecting context for document {document_id}")
        context = await get_notebook_context(document_id)
    
    question = request.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    
    async def response_stream():
        try:
            async for chunk in agent.stream_response(question, context):
                # Convert chunk to JSON string and yield
                yield json.dumps(chunk) + "\n"
                
            # End of stream marker
            yield json.dumps({"type": "end"}) + "\n"
        except Exception as e:
            logger.error(f"Error in streaming response: {str(e)}")
            yield json.dumps({"type": "error", "content": str(e)}) + "\n"
    
    return StreamingResponse(
        response_stream(),
        media_type="application/x-ndjson"
    )

# ----- New Agent Endpoints -----

async def get_request_body(request: Request) -> Dict[str, Any]:
    """Helper function to get the request body."""
    try:
        return await request.json()
    except Exception as e:
        logger.error(f"Error parsing request body: {e}")
        raise HTTPException(status_code=400, detail="Invalid request body")


async def validate_agent_request(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate that the request contains the minimum required fields."""
    # Check for required fields
    if "question" not in data:
        raise HTTPException(status_code=400, detail="Missing required field: question")
    
    # Convert to AgentRequest (TypedDict)
    request = {
        "question": data["question"],
        **{k: v for k, v in data.items() if k != "question"}
    }
    
    # Add session ID if not provided
    if "sessionId" not in request:
        request["sessionId"] = str(uuid4())

    return request


@app.post("/v2/agent/query")
async def query_agent_v2(
    data: Dict[str, Any] = Depends(get_request_body),
    _ = Depends(get_current_username)
) -> Dict[str, Any]:
    """Process an agent query and return a complete response."""
    try:
        request = await validate_agent_request(data)
        logger.info(f"Processing agent query: {request.get('question')}")
        
        # Force streaming to false for this endpoint
        request["streamResponse"] = False
        
        # Extract context from request or fetch it if not provided
        context = request.get("context")
        document_id = request.get("documentId")
        if not context and document_id:
            logger.info(f"Collecting context for document {document_id}")
            context = await get_notebook_context(document_id)
            request["context"] = context
        
        # Process the request
        response = await new_agent.process_request(request)
        
        return response.model_dump()
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.exception("Error processing agent query")
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")


@app.post("/v2/agent/stream")
async def stream_agent_response_v2(
    data: Dict[str, Any] = Depends(get_request_body),
    _ = Depends(get_current_username)
) -> StreamingResponse:
    """Stream an agent response."""
    try:
        request = await validate_agent_request(data)
        logger.info(f"Streaming agent response for: {request.get('question')}")
        
        # Force streaming to true for this endpoint
        request["streamResponse"] = True
        
        # Extract context from request or fetch it if not provided
        context = request.get("context")
        document_id = request.get("documentId")
        if not context and document_id:
            logger.info(f"Collecting context for document {document_id}")
            context = await get_notebook_context(document_id)
            request["context"] = context
        
        # Define the streaming content generator
        async def response_generator():
            async for message in new_agent.stream_response(request):
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

# ----- Test Endpoints (No Auth) -----

@app.post("/test/v2/agent/query")
async def test_query_agent_v2(data: Dict[str, Any] = Depends(get_request_body)) -> Dict[str, Any]:
    """
    Test endpoint for agent query - NO AUTHENTICATION (only for testing purposes).
    """
    logger.info("Using test endpoint without authentication")
    try:
        request = await validate_agent_request(data)
        logger.info(f"Processing test agent query: {request.get('question')}")
        
        # Force streaming to false for this endpoint
        request["streamResponse"] = False
        
        # For test endpoints, we don't fetch context to avoid external dependencies
        if "context" not in request:
            request["context"] = {"documentId": request.get("documentId", "test-doc"), "blocks": []}
        
        # Process the request
        response = await new_agent.process_request(request)
        
        return response.model_dump()
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.exception("Error processing test agent query")
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")


@app.post("/test/v2/agent/stream")
async def test_stream_agent_response_v2(data: Dict[str, Any] = Depends(get_request_body)) -> StreamingResponse:
    """
    Test endpoint for agent streaming - NO AUTHENTICATION (only for testing purposes).
    """
    logger.info("Using test streaming endpoint without authentication")
    try:
        request = await validate_agent_request(data)
        logger.info(f"Streaming test agent response for: {request.get('question')}")
        
        # Force streaming to true for this endpoint
        request["streamResponse"] = True
        
        # For test endpoints, we don't fetch context to avoid external dependencies
        if "context" not in request:
            request["context"] = {"documentId": request.get("documentId", "test-doc"), "blocks": []}
        
        # Define the streaming content generator
        async def response_generator():
            async for message in new_agent.stream_response(request):
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
        logger.exception("Error streaming test agent response")
        raise HTTPException(status_code=500, detail=f"Error streaming response: {str(e)}")


@app.post("/test/v1/agent/process")
async def test_process_agent_request(request: AgentRequest) -> Dict[str, Any]:
    """
    Test endpoint for legacy agent process - NO AUTHENTICATION (only for testing purposes).
    """
    logger.info("Using test legacy endpoint without authentication")
    document_id = request.get("documentId", "test-doc")
    logger.info(f"Received test agent request for document {document_id}")
    
    # For test endpoints, we don't fetch context to avoid external dependencies
    context = request.get("context", {"documentId": document_id, "blocks": []})
    
    question = request.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    
    # Create a simple test action
    test_action = {
        "type": "markdown",
        "content": f"This is a test response to: {question}"
    }
    
    # Construct response
    response = {
        "answer": f"I've processed your test question: '{question}'",
        "actions": [{"type": "markdown", "payload": test_action}],
        "followupQuestions": ["Can you explain more?", "What else would you like to know?"]
    }
    
    return response

@app.get("/ping")
async def ping():
    return "pong"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
