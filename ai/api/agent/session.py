from typing import AsyncGenerator, Dict, Any
import uuid
from pydantic import BaseModel
import asyncio
import uuid
from api.chains.stream.agent_clarify import template as clarify_template
# new iterative next‑step chain
# Iterative next‑step chain
from api.chains.stream.agent_next_step import create_next_step_chain
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
    notebook_blocks: Optional[list] = None  # <-- Added

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
        self._expected_terms: list[str] = []
        self._data_base_dir: str | None = None

        # Notebook cells history to feed back as context
        # (local history of all create_block contents)
        # Will be used to inform next-step chain of notebook state
        self._notebook_cells: list[str] = []
        # build the next‑step chain once
        self._next_step_chain = create_next_step_chain(llm)

        # Track block execution futures waiting for UI/kernel feedback
        self._pending_exec_futures: Dict[str, asyncio.Future] = {}

        # Execution context for python blocks – shared globals so subsequent
        # blocks can reference earlier variables just like a notebook.
        self._py_globals: Dict[str, any] = {}
    
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
            # store for later execution path resolution
            self._data_base_dir = base
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

    # ------------------------------------------------------------
    # Simple Python execution helper (synchronous for now)
    # ------------------------------------------------------------
    def _execute_python_block(self, code: str) -> dict:
        """Execute a python code block inside the shared globals."""
        import io, contextlib, traceback, sys

        stdout_buf, stderr_buf = io.StringIO(), io.StringIO()
        result: dict = {"event": "execution_result", "blockType": "python"}
        import os
        cwd_backup = os.getcwd()
        try:
            # Change to data dir if available
            if self._data_base_dir:
                os.chdir(self._data_base_dir)
            # Stub out server-side plotting to avoid in-process Matplotlib GUI
            try:
                import matplotlib
                matplotlib.use('Agg')
                import matplotlib.pyplot as plt
                self._py_globals['plt'] = plt
            except Exception:
                pass
            # Execute code
            with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stderr_buf):
                exec(code, self._py_globals)

            # ------------------------------------------------------------
            # Capture standard output *and* replicate the Jupyter‑style
            # behaviour where the value of the last expression is displayed.
            # ------------------------------------------------------------
            out = stdout_buf.getvalue()

            # Attempt to evaluate the value of the last expression so that
            # objects like DataFrames are rendered even when the block does
            # not explicitly print them.
            try:
                import ast

                parsed = ast.parse(code)
                if parsed.body and isinstance(parsed.body[-1], ast.Expr):
                    expr_node = parsed.body[-1].value
                    expr_code = compile(ast.Expression(expr_node), filename="<inline-eval>", mode="eval")
                    val = eval(expr_code, self._py_globals)
                    if val is not None:
                        out += ("\n" if out else "") + repr(val)
            except Exception:
                # Silently ignore problems evaluating the expression – the
                # code already executed successfully.
                pass

            out = out.strip()
            if out:
                # Prevent extremely large payloads in the event stream.
                if len(out) > 5000:
                    out = out[:5000] + "…"  # truncate
                result["output"] = out
            result["status"] = "ok"
        except Exception as exc:
            tb = traceback.format_exc()
            err_out = stderr_buf.getvalue() + "\n" + tb
            result["status"] = "error"
            result["error"] = err_out
            # For debugging
            print(f"[agent_debug] python exec error: {err_out}")
        finally:
            os.chdir(cwd_backup)
            stdout_buf.close()
            stderr_buf.close()
        return result

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
        # Initialize local notebook cell history and context summaries
        notebook_cells: list[str] = []

        notebook_blocks = request.notebook_blocks or []
        notebook_blocks_str = ""
        if notebook_blocks:
            import json
            notebook_blocks_str = json.dumps(notebook_blocks, indent=2)

        # Stage 1: Clarification using current agent prompt
        print(f"[agent_debug] Running clarification prompt")
        clar_prompt = PromptTemplate(
            template=clarify_template,
            input_variables=["question", "why", "what", "notebook_blocks"],
        )
        clar_text = clar_prompt.format(
            question=request.question,
            why=request.why,
            what=request.what,
            notebook_blocks=notebook_blocks_str,
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
        # store expected terms so we can wait for all answers
        self._expected_terms = [c.get("term") for c in clar_list if c.get("term")]
        yield {"event": "clarification", "clarifications": clar_list}

        # If there are clarification terms, wait for user input; otherwise we
        # continue immediately.
        if self._expected_terms:
            print(f"[agent_debug] Waiting for user clarification answers...")
            answers = await self._wait_for_clarification()
        else:
            answers = {}
        print(f"[agent_debug] Received clarification answers: {answers}")

        # ---------------- CSV discovery (once) ----------------
        csv_files: list[str] = []
        for base in (
            [f"/data/{request.workspace_id}/files"] if request.workspace_id else []
        ) + ["/home/jupyteruser", os.path.join(os.getcwd(), "jupyterfiles")]:
            if os.path.exists(base):
                csv_files = [f for f in os.listdir(base) if f.lower().endswith('.csv')]
                if csv_files:
                    self._data_base_dir = base
                    break

        # ---------------- Iterative FSM loop ----------------
        # Context summaries (exec results) – no longer used for FSM context
        context_lines: list[str] = []
        MAX_STEPS = 12

        for _ in range(MAX_STEPS):
            # Build 'notebook context' from actual cell contents
            recent_ctx = "\n\n".join(notebook_cells[-20:])
            # Append recent execution/insight summaries (including errors) to context
            full_ctx = recent_ctx
            if context_lines:
                # include last few context lines (e.g., errors, outputs, insights)
                recent_lines = context_lines[-10:]
                full_ctx += "\n\n" + "\n".join(recent_lines)
            # DEBUG: show combined context passed to next-step chain
            print(f"[agent_debug] FSM recent_ctx: {recent_ctx[:500]!r}")
            print(f"[agent_debug] FSM context_lines: {context_lines[-10:]!r}")
            print(f"[agent_debug] FSM full_ctx: {full_ctx[:500]!r}")
            # Invoke LLM for the next step using combined context
            step = self._next_step_chain.invoke(
                {
                    "question": request.question,
                    "why": request.why,
                    "what": request.what,
                    "context": full_ctx,
                    "table_info": table_info or "",
                    "notebook_blocks": notebook_blocks_str,
                }
            )

            ev = step
            print("[agent_debug] next step:", ev)

            if ev.get("event") == "done":
                yield {"event": "session_completed", "message": "Agent session completed."}
                break

            if table_info and ev.get("event") == "action" and "table_info" not in ev:
                ev["table_info"] = table_info

            # Ensure blockId for actions that create blocks
            if ev.get("event") == "action" and ev.get("action") == "create_block":
                if "blockId" not in ev:
                    ev["blockId"] = str(uuid.uuid4())

            # --- PATCH: Normalize yAxes for visualizationV2 blocks ---
            def normalize_yaxes(yaxes):
                import uuid
                def ensure_series_fields(s):
                    return {
                        'id': s.get('id', str(uuid.uuid4())),
                        'column': s.get('column') or s.get('field'),
                        'aggregateFunction': s.get('aggregateFunction', 'sum'),
                        'groupBy': s.get('groupBy', None),
                        'chartType': s.get('chartType', None),
                        'name': s.get('name', None),
                        'color': s.get('color', None),
                        'groups': s.get('groups', None),
                        'dateFormat': s.get('dateFormat', None),
                        'numberFormat': s.get('numberFormat', None),
                    }
                normalized = []
                for idx, y in enumerate(yaxes):
                    if isinstance(y, dict) and 'series' in y and isinstance(y['series'], list):
                        y['series'] = [ensure_series_fields(s) for s in y['series']]
                        normalized.append(y)
                        continue
                    if isinstance(y, str):
                        series = [ensure_series_fields({'column': y})]
                    elif isinstance(y, dict) and ('column' in y or 'field' in y):
                        series = [ensure_series_fields(y)]
                    elif isinstance(y, list):
                        series = [ensure_series_fields(s) for s in y]
                    else:
                        series = []
                    normalized.append({
                        'id': str(uuid.uuid4()),
                        'name': None,
                        'series': series
                    })
                return normalized

            if (
                ev.get("event") == "action"
                and ev.get("action") == "create_block"
                and ev.get("blockType") == "visualizationV2"
                and isinstance(ev.get("input"), dict)
                and "yAxes" in ev["input"]
            ):
                ev["input"]["yAxes"] = normalize_yaxes(ev["input"]["yAxes"])
                print("[agent_debug] visualizationV2 yAxes payload:", ev["input"]["yAxes"])

            yield ev

            # ------------------------------------------------------------
            # 1. Execute python blocks locally and capture output as context.
            # ------------------------------------------------------------
            if ev.get("event") == "action" and ev.get("action") == "create_block" and ev.get("blockType") == "python":
                blk_id = ev["blockId"]
                code = ev.get("content", "")
                # Record the cell content in notebook history
                notebook_cells.append(code)
                # Execute the code and capture result
                feedback = self._execute_python_block(code)
                feedback["blockId"] = blk_id
                yield feedback
                # Update context summaries
                status = feedback.get("status")
                out = feedback.get("output")
                err = feedback.get("error")
                snippet = code.strip().splitlines()[0][:120]
                if status == "error":
                    context_lines.append(f"ERROR: {err[:120]} running {snippet}")
                    # Automatically invoke Python-edit chain to fix the error
                    try:
                        from api.chains.stream.python_edit import create_python_edit_stream_query_chain
                        parser_ctx = ''  # no global variables
                        instr = f"The code above raised an error: {err.strip()}. Please correct the Python code."
                        py_edit_chain = create_python_edit_stream_query_chain(self.llm)
                        first_fix = True
                        async for edit in py_edit_chain.astream({
                            "source": code,
                            "instructions": instr,
                            "allowed_libraries": [],
                            "variables": parser_ctx,
                        }):
                            src = edit.get("source")
                            if first_fix and isinstance(src, str):
                                # Emit a single corrected Python cell
                                yield {"event": "action", "action": "create_block", "blockType": "python", "content": src}
                                first_fix = False
                                break
                    except Exception:
                        pass
                elif out:
                    context_lines.append(f"OUTPUT: {out[:120]} from {snippet}")
                else:
                    summary = ev.get("summary") or "executed"
                    context_lines.append(f"{summary}: {snippet}")

            # ------------------------------------------------------------
            # 2. Handle insight events – append to context so the LLM can
            #    build on previous insights.
            # ------------------------------------------------------------
            elif ev.get("event") == "insight":
                context_lines.append(ev.get("summary", "insight"))

            # 3.  For non‑python blocks (e.g. markdown, sql, etc.) we still
            #     add a short representation to the running context so the
            #     FSM is aware the action was taken and doesn't loop creating
            #     the same markdown repeatedly.
            elif (
                ev.get("event") == "action"
                and ev.get("action") == "create_block"
                and ev.get("blockType") != "python"
            ):
                # Record non-python block in notebook history
                notebook_cells.append(ev.get("content", ""))
                # Add summary or content snippet to context
                snippet = ev.get("summary") or ev.get("content", "")
                if snippet:
                    context_lines.append(str(snippet)[:120])

        else:
            yield {"event": "session_completed", "message": "Stopped after max iterations."}

    
    def submit_clarification(self, term: str, answer: str) -> None:
        """Receive a user's clarification answer for a term."""
        print(f"[agent_debug] submit_clarification called: term={term}, answer={answer}")
        self._answers[term] = answer
        # Only resolve future when we have answers for every expected term
        if (
            self._clarification_future
            and not self._clarification_future.done()
            and all(t in self._answers for t in self._expected_terms)
        ):
            self._clarification_future.set_result(self._answers)

    # -------- feedback from UI after kernel executes a block ---------
    def submit_execution_feedback(self, block_id: str, status: str, output: str | None, error: str | None):
        fut = self._pending_exec_futures.pop(block_id, None)
        if fut and not fut.done():
            fut.set_result(
                {
                    "event": "execution_result",
                    "blockType": "python",
                    "status": status,
                    "output": output,
                    "error": error,
                }
            )

    async def _wait_for_clarification(self) -> Dict[str, str]:
        """Await user clarification answers."""
        self._clarification_future = asyncio.get_event_loop().create_future()
        return await self._clarification_future