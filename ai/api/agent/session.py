from typing import AsyncGenerator
from pydantic import BaseModel
from api.chains.stream.agent_clarify import template as clarify_template
from api.chains.stream.agent_plan import template as plan_template
from langchain.prompts import PromptTemplate
from langchain.output_parsers.json import SimpleJsonOutputParser
import os
import csv
from typing import Optional

class StartAgentSessionRequest(BaseModel):
    """
    Schema for starting an agent session with an initial query and context.
    """
    question: str  # Main user question or intent
    why: str       # User explanation for why they are asking
    what: str      # Description of what the user is trying to solve
    workspace_id: Optional[str] = None  # New: workspace context for file fallback

class AgentSessionManager:
    """
    Orchestrates an agent session, streaming back events such as clarifications,
    actions, and final insights.
    """
    def __init__(self, llm):
        # Initialize with a language model or other dependencies
        self.llm = llm
    
    def _table_info_from_files(self, workspace_id: Optional[str]) -> str:
        """Fallback: synthesize SQL table info from CSV files for a workspace."""
        if not workspace_id:
            return ""
        base = f"/data/{workspace_id}/files"
        table_info = ""
        if not os.path.exists(base):
            return ""
        for filename in os.listdir(base):
            if filename.lower().endswith(".csv"):
                try:
                    with open(os.path.join(base, filename), "r") as f:
                        reader = csv.reader(f)
                        headers = next(reader)
                        table = os.path.splitext(filename)[0]
                        table_info += f"Table {table}: columns: {', '.join(headers)}\n"
                except Exception:
                    continue
        return table_info

    async def astream(self, request: StartAgentSessionRequest) -> AsyncGenerator[dict, None]:
        """
        Stream a sequence of agent-generated events for the session.
        Each event is a dict that may represent a clarification request, action, or insight.
        """
        # Debug: log entry into astream
        print(f"[agent_debug] AgentSessionManager.astream called with: question={request.question!r}, why={request.why!r}, what={request.what!r}, workspace_id={request.workspace_id!r}")
        # Acknowledge session start
        yield {"event": "session_started", "message": f"Agent session started: {request.question}"}
        # Detect DB/datasource -- here just simulating: set table_info from files if no DB is available.
        # PATCH: Use files-as-tables as fallback schema for agent.
        table_info = self._table_info_from_files(request.workspace_id)
        # Debug: log table_info fetched
        print(f"[agent_debug] table_info fetched: {table_info!r}")

        # Stage 1: Clarification using current agent prompt
        print(f"[agent_debug] Running clarification prompt")
        clar_prompt = PromptTemplate(
            template=clarify_template,
            input_variables=["question", "why", "what"],
        )
        clar_text = clar_prompt.format(
            question=request.question,
            why=request.why,
            what=request.what,
        )
        # Call LLM synchronously
        raw_clar = None
        try:
            # ChatOpenAI/AzureChatOpenAI support invoke(messages)
            raw_clar = self.llm.invoke([("system", clar_text)])
        except Exception:
            raw_clar = self.llm(clar_text)
        # Extract text from LLM result
        if hasattr(raw_clar, 'content'):
            clar_text_out = raw_clar.content
        else:
            clar_text_out = raw_clar if isinstance(raw_clar, str) else str(raw_clar)
        clar_data = SimpleJsonOutputParser().parse(clar_text_out)
        print(f"[agent_debug] clarification response: {clar_data}")
        yield {"event": "clarification", "clarifications": clar_data.get("clarifications", [])}

        # Stage 2: Agent plan/actions -- inject table_info to agent plan prompt if needed
        # NOTE: You'll need to extend the agent_plan chain and LLM prompt if you want table_info injected!
        # Stage 2: Agent plan/actions -- inject table_info
        print(f"[agent_debug] Running planning prompt")
        plan_prompt = PromptTemplate(
            template=plan_template,
            input_variables=["question", "why", "what", "table_info"],
        )
        plan_text = plan_prompt.format(
            question=request.question,
            why=request.why,
            what=request.what,
            table_info=table_info or "",
        )
        try:
            raw_plan = self.llm.invoke([("system", plan_text)])
        except Exception:
            raw_plan = self.llm(plan_text)
        # Extract text from LLM result for planning
        if hasattr(raw_plan, 'content'):
            plan_text_out = raw_plan.content
        else:
            plan_text_out = raw_plan if isinstance(raw_plan, str) else str(raw_plan)
        plan_data = SimpleJsonOutputParser().parse(plan_text_out)
        print(f"[agent_debug] plan response: {plan_data}")
        # Stream planned events
        for ev in plan_data.get("events", []):
            # Optionally, add table_info to event if it is relevant
            if table_info and ev.get("event") == "action" and "table_info" not in ev:
                ev["table_info"] = table_info
            yield ev
        # Finalize session
        yield {"event": "session_completed", "message": "Agent session completed."}