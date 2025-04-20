from typing import AsyncGenerator
from pydantic import BaseModel
from api.chains.stream.agent_clarify import create_clarification_stream_query_chain
from api.chains.stream.agent_plan import create_agent_plan_stream_query_chain

class StartAgentSessionRequest(BaseModel):
    """
    Schema for starting an agent session with an initial query and context.
    """
    question: str  # Main user question or intent
    why: str       # User explanation for why they are asking
    what: str      # Description of what the user is trying to solve

class AgentSessionManager:
    """
    Orchestrates an agent session, streaming back events such as clarifications,
    actions, and final insights.
    """
    def __init__(self, llm):
        # Initialize with a language model or other dependencies
        self.llm = llm

    async def astream(self, request: StartAgentSessionRequest) -> AsyncGenerator[dict, None]:
        """
        Stream a sequence of agent-generated events for the session.
        Each event is a dict that may represent a clarification request, action, or insight.
        """
        # Acknowledge session start
        yield {"event": "session_started", "message": f"Agent session started: {request.question}"}
        # Clarification stage: identify ambiguous terms and ask for clarifications
        chain = create_clarification_stream_query_chain(self.llm)
        # Run the chain to get all clarifications at once
        response = await chain.arun({
            "question": request.question,
            "why": request.why,
            "what": request.what,
        })
        # response is a dict with key 'clarifications'
        yield {"event": "clarification", "clarifications": response.get("clarifications", [])}
        # Plan and execute actions dynamically based on user input and clarifications
        plan_chain = create_agent_plan_stream_query_chain(self.llm)
        # Run the planning chain to get JSON with key 'events'
        plan_output = await plan_chain.arun({
            "question": request.question,
            "why": request.why,
            "what": request.what,
        })
        # plan_output is a dict with 'events': list of action/insight dicts
        for ev in plan_output.get("events", []):
            yield ev
        # Finalize session
        yield {"event": "session_completed", "message": "Agent session completed."}