# from langchain.globals import set_debug
# set_debug(True)
# from langchain.globals import set_verbose
# set_verbose(True)

import json
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel
import uuid
from api.agent.session import sessions as _agent_sessions
from typing import List, Optional
from decouple import config
from api.llms import initialize_llm
from api.chains.stream.python_edit import create_python_edit_stream_query_chain
from api.chains.stream.sql_edit import create_sql_edit_stream_query_chain
import secrets


app = FastAPI()
# Enable CORS for the front-end application
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config("FRONTEND_URL", default="http://localhost:4000")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

security = HTTPBasic()

def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(credentials.username, config("BASIC_AUTH_USERNAME"))
    correct_password = secrets.compare_digest(credentials.password, config("BASIC_AUTH_PASSWORD"))
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="",
            headers={"WWW-Authenticate": "Basic"},
        )
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

@app.get("/ping")
async def ping():
    return "pong"

# Agent session streaming endpoint
from api.agent.session import AgentSessionManager, StartAgentSessionRequest

@app.post("/v1/agent/session/stream")
async def v1_stream_agent_session(
    data: StartAgentSessionRequest
):
    """
    Start an agent session and stream back events (clarifications, actions, insights).
    This POST endpoint consumes a JSON body with question, why, what, and optional workspace_id.
    """
    # Debug: log incoming agent session POST request
    print(f"[agent_debug] POST /v1/agent/session/stream called with: question={data.question!r}, why={data.why!r}, what={data.what!r}, workspace_id={data.workspace_id!r}")
    llm = initialize_llm()
    manager = AgentSessionManager(llm)
    # Register session for clarifications
    session_id = str(uuid.uuid4())
    _agent_sessions[session_id] = manager

    async def generate():
        # Debug: start streaming events (POST)
        print("[agent_debug] Starting event stream (POST)")
        first = True
        async for event in manager.astream(data):
            # Inject session_id in first event
            if first:
                event["session_id"] = session_id
                first = False
            # Debug: log each event before sending
            print(f"[agent_debug] POST event: {event}")
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
  
# Endpoint to receive clarification responses from client and resume session
class ClarificationResponse(BaseModel):
    session_id: str
    term: str
    answer: str

@app.post("/v1/agent/session/respond")
async def v1_agent_session_respond(data: ClarificationResponse):
    """Receive a user's answer to a clarification term and resume the agent session."""
    manager = _agent_sessions.get(data.session_id)
    if not manager:
        raise HTTPException(status_code=404, detail="Session not found")
    manager.submit_clarification(data.term, data.answer)
    return {"status": "ok"}

@app.get("/v1/agent/session/stream")
async def v1_stream_agent_session_get(
    question: str,
    why: str,
    what: str,
    workspace_id: Optional[str] = None
):
    """
    Start an agent session and stream back events via GET parameters.
    Accepts question, why, what, and optional workspace_id as query parameters.
    """
    # Debug: log incoming agent session GET request
    print(f"[agent_debug] GET /v1/agent/session/stream called with: question={question!r}, why={why!r}, what={what!r}, workspace_id={workspace_id!r}")
    # Build request data from query params
    data = StartAgentSessionRequest(
        question=question,
        why=why,
        what=what,
        workspace_id=workspace_id,
    )
    llm = initialize_llm()
    manager = AgentSessionManager(llm)
    # Register session for clarifications
    session_id = str(uuid.uuid4())
    _agent_sessions[session_id] = manager

    async def generate():
        # Debug: start streaming events (GET)
        print("[agent_debug] Starting event stream (GET)")
        first = True
        async for event in manager.astream(data):
            # Inject session_id in first event
            if first:
                event["session_id"] = session_id
                first = False
            # Debug: log each event before sending
            print(f"[agent_debug] GET event: {event}")
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
