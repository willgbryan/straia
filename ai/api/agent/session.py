from typing import AsyncGenerator, Dict
from pydantic import BaseModel
import asyncio
import uuid
from api.chains.stream.agent_clarify import template as clarify_template
from api.chains.stream.agent_plan import template as plan_template
# Registry of active agent sessions for handling user clarifications
sessions: Dict[str, 'AgentSessionManager'] = {}
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
        # For awaiting clarifications
        self._clarification_future: asyncio.Future | None = None
        self._answers: Dict[str, str] = {}
    
    def _table_info_from_files(self, workspace_id: Optional[str]) -> str:
        """Fallback: synthesize SQL table info from CSV files for a workspace."""
        if not workspace_id:
            return ""
        # Primary location for workspace files
        base = f"/data/{workspace_id}/files"
        # Developer-only: check for project-local jupyterfiles (local dev)
        proj_base = os.path.join(os.getcwd(), "jupyterfiles")
        if os.path.exists(proj_base):
            print(f"[agent_debug] using project jupyterfiles base path: {proj_base}")
            base = proj_base
        else:
            # Fallback to example datasets if primary path does not exist
            if not os.path.exists(base):
                print(f"[agent_debug] primary base not found, checking example datasets")
                for alt in ["data/psql/ecommerce", "data/mysql/ecommerce"]:
                    print(f"[agent_debug] checking example alt path: {alt}")
                    if os.path.exists(alt):
                        base = alt
                        print(f"[agent_debug] using example dataset path: {alt}")
                        break
        table_info = ""
        # Verify final base path or fallback to Jupyter home
        print(f"[agent_debug] _table_info_from_files: final base path: {base}")
        if not os.path.exists(base):
            # Fallback: check for Jupyter user file uploads
            home_base = "/home/jupyteruser"
            print(f"[agent_debug] base path does not exist, trying home_base: {home_base}")
            if os.path.exists(home_base):
                base = home_base
                print(f"[agent_debug] using home_base as base path: {home_base}")
            else:
                # Further fallback: project-level jupyterfiles directory (repo root)
                repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, os.pardir))
                repo_jup = os.path.join(repo_root, "jupyterfiles")
                print(f"[agent_debug] home_base not found, trying repo jupyterfiles: {repo_jup}")
                if os.path.exists(repo_jup):
                    base = repo_jup
                    print(f"[agent_debug] using repo jupyterfiles base path: {repo_jup}")
                else:
                    print(f"[agent_debug] no fallback paths found, cannot locate files for workspace {workspace_id}")
                    return ""
        # List CSV files in the directory
        print(f"[agent_debug] listing CSV files in: {base}")
        csv_files = [f for f in os.listdir(base) if f.lower().endswith('.csv')]
        print(f"[agent_debug] CSV files found: {csv_files}")
        if csv_files:
            table_info += f"Available files: {', '.join(csv_files)}\n"
        for filename in csv_files:
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
        # Yield clarifications and wait for user response
        clar_list = clar_data.get("clarifications", [])
        yield {"event": "clarification", "clarifications": clar_list}
        # Wait for user to submit clarification answers
        print(f"[agent_debug] Waiting for user clarification answers...")
        answers = await self._wait_for_clarification()
        print(f"[agent_debug] Received clarification answers: {answers}")

        # Stage 2: Agent plan/actions -- inject table_info and file_names to agent plan prompt
        # NOTE: You'll need to extend the agent_plan chain and LLM prompt if you want table_info injected!
        # Prepare file_names context (scan workspace files and Jupyter uploads)
        # Prepare file_names context (scan workspace files and Jupyter uploads)
        print(f"[agent_debug] Running planning prompt with file context")
        csv_files = []
        # Determine base directories to search for CSV files
        base_paths = []
        if request.workspace_id:
            base_paths.append(f"/data/{request.workspace_id}/files")
        # Fallback to Jupyter user upload directory
        base_paths.append("/home/jupyteruser")
        # Project-local jupyterfiles directory
        base_paths.append(os.path.join(os.getcwd(), "jupyterfiles"))
        print(f"[agent_debug] file search base_paths: {base_paths}")
        # Search for existing base path and list CSVs
        for base in base_paths:
            print(f"[agent_debug] checking base path: {base}")
            if os.path.exists(base):
                print(f"[agent_debug] found base path: {base}")
                csv_files = [f for f in os.listdir(base) if f.lower().endswith('.csv')]
                break
        print(f"[agent_debug] csv_files after scanning bases: {csv_files}")
        file_names = ", ".join(csv_files)
        plan_prompt = PromptTemplate(
            template=plan_template,
            input_variables=["question", "why", "what", "table_info", "file_names"],
        )
        plan_text = plan_prompt.format(
            question=request.question,
            why=request.why,
            what=request.what,
            table_info=table_info or "",
            file_names=file_names,
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
    
    def submit_clarification(self, term: str, answer: str) -> None:
        """Receive a user's clarification answer for a term."""
        print(f"[agent_debug] submit_clarification called: term={term}, answer={answer}")
        self._answers[term] = answer
        if self._clarification_future and not self._clarification_future.done():
            self._clarification_future.set_result(self._answers)

    async def _wait_for_clarification(self) -> Dict[str, str]:
        """Await user clarification answers."""
        self._clarification_future = asyncio.get_event_loop().create_future()
        return await self._clarification_future