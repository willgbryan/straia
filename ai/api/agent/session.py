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
import json

class StartAgentSessionRequest(BaseModel):
    """
    Schema for starting an agent session with an initial query and context.
    """
    question: str  # Main user question or intent
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
        # Derived DataFrame schemas from executed Python blocks
        self._derived_schema: Dict[str, list] = {}
        # Structured history of created notebook blocks for LLM context
        self._notebook_blocks: list[dict] = []
    
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
        # Update derived dataframe schemas for LLM context
        try:
            import pandas as _pd
            for var_name, obj in self._py_globals.items():
                if isinstance(obj, _pd.DataFrame):
                    self._derived_schema[var_name] = list(obj.columns)
        except Exception:
            pass
        return result

    async def astream(self, request: StartAgentSessionRequest) -> AsyncGenerator[dict, None]:
        """
        Stream a sequence of agent-generated events for the session.
        Each event is a dict that may represent a clarification request, action, or insight.
        """
        print(f"[agent_debug][session] AgentSessionManager.astream called with: question={request.question!r}, workspace_id={request.workspace_id!r}")
        yield {"event": "session_started", "message": f"Agent session started: {request.question}"}
        table_info = self._table_info_from_files(request.workspace_id)
        print(f"[agent_debug][session] table_info fetched: {table_info!r}")
        data_schema = self._gather_data_schema(request.workspace_id)
        print(f"[agent_debug][session] data_schema: {data_schema!r}")
        notebook_cells: list[str] = []

        # Stage 1: Clarification using current agent prompt
        print(f"[agent_debug][session] Running clarification prompt")
        from api.chains.stream.agent_clarify import create_clarification_stream_query_chain
        clar_chain = create_clarification_stream_query_chain(self.llm)
        clar_data = clar_chain.invoke({
            "question": request.question,
            "why": "",
            "what": "",
            "data_schema": data_schema,
        })
        print(f"[agent_debug][clarification] clarification response: {clar_data}")
        clar_list = clar_data.get("clarifications", [])
        self._expected_terms = [c.get("term") for c in clar_list if c.get("term")]
        yield {"event": "clarification", "clarifications": clar_list}

        # Wait for clarifications if needed
        answers = {}
        if self._expected_terms:
            print(f"[agent_debug][clarification] Waiting for user clarification answers...")
            answers = await self._wait_for_clarification()
        print(f"[agent_debug][clarification] Received clarification answers: {answers}")

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

        for step_idx in range(MAX_STEPS):
            # Build 'notebook context' from actual cell contents
            recent_ctx = "\n\n".join(notebook_cells[-20:])
            # Append recent execution/insight summaries (including errors) to context
            full_ctx = recent_ctx
            if context_lines:
                # include last few context lines (e.g., errors, outputs, insights)
                recent_lines = context_lines[-10:]
                full_ctx += "\n\n" + "\n".join(recent_lines)
            # DEBUG: show combined context passed to next-step chain
            print(f"[agent_debug][context] FSM step {step_idx}: recent_ctx: {recent_ctx[:500]!r}")
            print(f"[agent_debug][context] FSM step {step_idx}: context_lines: {context_lines[-10:]!r}")
            print(f"[agent_debug][context] FSM step {step_idx}: full_ctx: {full_ctx[:500]!r}")
            # Log notebook_blocks for deduplication
            print(f"[agent_debug][dedup] FSM step {step_idx}: notebook_blocks (summarized):")
            # TODO: If you have a notebook_blocks summary, print it here
            # (This is handled on the frontend, but you can log the context here if available)
            # Invoke LLM for the next step using combined context
            # Call next-step chain, include structured notebook_blocks history
            step = self._next_step_chain({
                "question": request.question,
                "why": "",
                "what": "",
                "notebook_blocks": self._notebook_blocks,
                "context": full_ctx,
                "table_info": table_info or "",
                "data_schema": data_schema,
            })

            ev = step
            print(f"[agent_debug][llm_output] FSM step {step_idx}: next step: {ev}")
            # Record structured block history for context
            if ev.get("event") == "action" and ev.get("action") == "create_block":
                bt = ev.get("blockType")
                if bt == "python":
                    first = ev.get("content", "").splitlines()[0] if ev.get("content") else ""
                    self._notebook_blocks.append({"type": "python", "firstLine": first})
                elif bt == "visualizationV2":
                    inp = ev.get("input", {}) or {}
                    self._notebook_blocks.append({
                        "type": "visualizationV2",
                        "chartType": inp.get("chartType"),
                        "dataframe": inp.get("dataframeName"),
                        "xAxis": inp.get("xAxis"),
                        "yAxes": inp.get("yAxes"),
                        "title": inp.get("title"),
                    })

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
                """Return a *stable* normalized yAxes structure.

                The previous implementation generated fresh UUID4 values for
                every axis and series on each call.  That made otherwise-
                identical visualization configs look different which, in
                turn, defeated deduplication logic and confused the
                front-end (it disposed an ECharts instance and created a new
                one with a slightly different shape, sometimes missing the
                expected xAxis).

                We now generate deterministic UUID5 values based on the
                semantic content (column, aggregate function, groupBy, …).
                If a caller already provided ids we keep them as-is to avoid
                breaking persisted documents.
                """

                import uuid

                def _stable_uuid(*parts: str) -> str:
                    """Return a stable UUID5 derived from the given parts."""
                    seed = "|".join(parts)
                    # Using NAMESPACE_DNS gives a constant namespace while
                    # still producing a real UUID object.
                    return str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))

                def ensure_series_fields(s):
                    # Normalise field aliases first
                    column = s.get("column") or s.get("field")
                    aggregate_fn = s.get("aggregateFunction", "sum")
                    group_by = s.get("groupBy", "") or ""

                    # Preserve an existing id or generate a stable one
                    sid = s.get("id") or _stable_uuid(column or "", aggregate_fn, str(group_by))

                    return {
                        "id": sid,
                        "column": column,
                        "aggregateFunction": aggregate_fn,
                        "groupBy": group_by if group_by else None,
                        "chartType": s.get("chartType", None),
                        "name": s.get("name", None),
                        "color": s.get("color", None),
                        "groups": s.get("groups", None),
                        "dateFormat": s.get("dateFormat", None),
                        "numberFormat": s.get("numberFormat", None),
                    }

                normalized = []

                for y in yaxes:
                    # The axis may already be in full form -> normalise series ids
                    if isinstance(y, dict) and "series" in y and isinstance(y["series"], list):
                        y_series = [ensure_series_fields(s) for s in y["series"]]

                        # Derive a stable axis id from the ordered series ids
                        axis_id = y.get("id") or _stable_uuid(*(s["id"] for s in y_series))

                        normalized.append({
                            **{k: v for k, v in y.items() if k != "series" and k != "id" and k != "name"},
                            "id": axis_id,
                            "name": y.get("name", None),
                            "series": y_series,
                        })
                        continue

                    # Shorthand forms --------------------------------------------------
                    if isinstance(y, str):
                        series_list = [ensure_series_fields({"column": y})]
                    elif isinstance(y, dict) and ("column" in y or "field" in y):
                        series_list = [ensure_series_fields(y)]
                    elif isinstance(y, list):
                        series_list = [ensure_series_fields(s) for s in y]
                    else:
                        series_list = []

                    axis_id = _stable_uuid(*(s["id"] for s in series_list)) if series_list else _stable_uuid("empty")

                    normalized.append({
                        "id": axis_id,
                        "name": None,
                        "series": series_list,
                    })

                return normalized

            if (
                ev.get("event") == "action"
                and ev.get("action") == "create_block"
                and ev.get("blockType") == "visualizationV2"
                and isinstance(ev.get("input"), dict)
                and "yAxes" in ev["input"]
            ):
                # Log axis mapping before normalization
                print(f"[agent_debug][axis] FSM step {step_idx}: visualizationV2 input before normalization: {ev['input']}")
                ev["input"]["yAxes"] = normalize_yaxes(ev["input"]["yAxes"])
                print(f"[agent_debug][axis] FSM step {step_idx}: visualizationV2 yAxes after normalization: {ev['input']['yAxes']}")

                # ----------------------------------------------------
                #   Deduplicate identical visualization blocks
                # ----------------------------------------------------
                if not hasattr(self, "_seen_viz_signatures"):
                    self._seen_viz_signatures: set[str] = set()

                def _strip_ids(obj):
                    """Return a copy of *obj* without volatile keys (id, name, color)."""
                    if isinstance(obj, dict):
                        return {k: _strip_ids(v) for k, v in obj.items() if k not in ("id", "name", "color")}
                    if isinstance(obj, list):
                        return [_strip_ids(x) for x in obj]
                    return obj

                import json as _json

                signature = _json.dumps(_strip_ids(ev["input"]), sort_keys=True)

                if signature in self._seen_viz_signatures:
                    # Skip emitting this duplicate block, but still allow the
                    # FSM to continue with next iterations.
                    print(
                        f"[agent_debug][dedup][viz] FSM step {step_idx}: duplicate visualizationV2 block suppressed"
                    )
                    continue  # Skip yielding

                self._seen_viz_signatures.add(signature)
                # ----------------------------------------------------
                # Axis sanity-check – make sure there is a *different*
                # column on the X axis than what we are plotting on Y.
                # If the agent omitted the xAxis or accidentally picked
                # the same numeric column (Global_Sales vs Global_Sales)
                # we try to auto-fix it so charts remain readable.
                # ----------------------------------------------------

                chart_type = ev["input"].get("chartType")
                x_axis = ev["input"].get("xAxis")
                df_name = ev["input"].get("dataframeName")
                data_schema_obj = None
                try:
                    data_schema_obj = json.loads(data_schema)
                except Exception:
                    data_schema_obj = None
                # Apply validation to *all* discrete-x charts.  Line charts
                # can live with a numeric x-axis (e.g. Year) but if it is
                # the exact same column as Y (Global_Sales) we still fix.

                # Disable auto-fix logic by setting empty chart check list
                ALL_CHARTS_CHECK = []

                if chart_type in ALL_CHARTS_CHECK:
                    # Helper: get columns for this dataframe
                    import pandas as _pd
                    _pandas = _pd  # alias for type inspection convenience

                    def get_columns_for_df(df_name, data_schema_obj):
                        """Return list of columns for a given dataframe name.

                        1. If the dataframe exists in the live python globals
                           (created earlier in this session) inspect it
                           directly – this covers derived dataframes like
                           *sales_by_genre* that do not appear in the schema.
                        2. Otherwise fall back to the original file schema we
                           sent to the LLM (files entry in data_schema).
                        """

                        # 1️⃣  inspect live pandas dataframe
                        if df_name and df_name in self._py_globals:
                            obj = self._py_globals[df_name]
                            if isinstance(obj, _pd.DataFrame):
                                return obj  # return dataframe itself for rich inspection

                        # 2️⃣  fall back to schema for original CSV files
                        if not data_schema_obj or "files" not in data_schema_obj:
                            return []
                        for f in data_schema_obj["files"]:
                            if (
                                f.get("name") == df_name or
                                (df_name and df_name in f.get("name", ""))
                            ):
                                return f.get("columns", [])
                        return []
                    # Determine if x_axis is missing or numeric
                    x_type = x_axis.get("type") if isinstance(x_axis, dict) else None
                    y_first_col = None
                    if ev["input"].get("yAxes"):
                        try:
                            y_first_col = ev["input"]["yAxes"][0]["series"][0]["column"]
                        except Exception:
                            pass

                    is_numeric_axis = isinstance(x_type, str) and (
                        x_type.startswith("int") or x_type.startswith("float") or x_type == "number"
                    )

                    # For bar / column charts we require categorical (non-numeric)
                    requires_categorical = chart_type in [
                        "bar",
                        "groupedColumn",
                        "stackedColumn",
                    ]

                    # Basic validations common to all charts
                    is_invalid_common = (
                        not x_axis or  # missing completely
                        (isinstance(x_axis, dict) and not x_axis.get("field")) or  # missing field key
                        (
                            y_first_col
                            and isinstance(x_axis, dict)
                            and x_axis.get("field") == y_first_col
                        )  # identical to Y column
                    )

                    # Extra rule: categorical axis required
                    is_invalid = is_invalid_common or (
                        requires_categorical and is_numeric_axis
                    )
                    if is_invalid:
                        # Try to find a categorical column
                        columns = get_columns_for_df(df_name, data_schema_obj)
                        # If columns are dicts, get type; if strings, skip
                        # We'll assume columns are list of dicts with 'name' and 'type', or just names
                        cat_col = None
                        df_ref = None
                        if isinstance(columns, _pd.DataFrame):
                            df_ref = columns
                            col_iter = list(df_ref.columns)
                        else:
                            col_iter = columns

                        for col in col_iter:
                            col_name = col["name"] if isinstance(col, dict) else col

                            if not col_name or col_name == y_first_col:
                                continue

                            # If we have dtype info (from live df or schema) and
                            # it is numeric, skip – we want categorical.
                            is_numeric = False
                            if df_ref is not None:
                                try:
                                    is_numeric = _pandas.api.types.is_numeric_dtype(
                                        df_ref[col_name]
                                    )
                                except Exception:
                                    pass
                            elif isinstance(col, dict):
                                col_type = str(col.get("type", "")).lower()
                                is_numeric = any(
                                    tok in col_type for tok in ("int", "float", "number")
                                )

                            if is_numeric:
                                continue

                            cat_col = {"name": col_name, "type": "str"}
                            break
                        if cat_col:
                            # Patch the xAxis to the first categorical column
                            ev["input"]["xAxis"] = {
                                "field": cat_col["name"],
                                "name": cat_col["name"],
                                "type": cat_col.get("type", "str"),
                            }
                            print(f"[agent_debug][axis][FIXED] FSM step {step_idx}: Patched invalid xAxis for {chart_type} to categorical column: {ev['input']['xAxis']}")
                    else:
                        # No valid categorical column, skip block creation and yield insight
                        msg = (
                            f"Cannot create {chart_type} chart: could not find a suitable categorical x-axis "
                            f"for dataframe '{df_name}'."
                        )
                        print(f"[agent_debug][axis][ERROR] FSM step {step_idx}: {msg}")
                        yield {
                            "event": "action",
                            "action": "insight",
                            "blockType": "",
                            "content": msg,
                            "summary": msg,
                            "table_info": table_info,
                        }
                        continue  # Skip yielding the invalid block

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
                # Always yield all available fields for insight events
                insight_event = {
                    "event": "insight",
                    "summary": ev.get("summary"),
                }
                # Optionally include reasoning, sql, chart if present
                if ev.get("reasoning") is not None:
                    insight_event["reasoning"] = ev["reasoning"]
                if ev.get("sql") is not None:
                    insight_event["sql"] = ev["sql"]
                if ev.get("chart") is not None:
                    insight_event["chart"] = ev["chart"]
                yield insight_event
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

    def _gather_data_schema(self, workspace_id: Optional[str]) -> str:
        """
        Return a JSON string summarizing available files and their columns.
        Example:
        {
            "files": [
                {
                    "name": "global_video_game_sales.csv",
                    "columns": ["Rank", "Name", ...]
                }
            ]
        }
        """
        base = f"/data/{workspace_id}/files" if workspace_id else None
        proj_base = os.path.join(os.getcwd(), "jupyterfiles")
        if os.path.exists(proj_base):
            base = proj_base
        elif base and not os.path.exists(base):
            for alt in ["data/psql/ecommerce", "data/mysql/ecommerce"]:
                if os.path.exists(alt):
                    base = alt
                    break
        if not base or not os.path.exists(base):
            home_base = "/home/jupyteruser"
            if os.path.exists(home_base):
                base = home_base
            else:
                repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, os.pardir))
                repo_jup = os.path.join(repo_root, "jupyterfiles")
                if os.path.exists(repo_jup):
                    base = repo_jup
                else:
                    # Return combined file and derived DataFrame schemas
                    return json.dumps({"files": [], "derived": self._derived_schema})

        files = []
        for fname in os.listdir(base):
            if fname.lower().endswith('.csv'):
                try:
                    with open(os.path.join(base, fname), "r") as f:
                        reader = csv.reader(f)
                        headers = next(reader)
                        files.append({"name": fname, "columns": headers})
                except Exception:
                    continue
        # Return combined file and derived DataFrame schemas
        return json.dumps({"files": files, "derived": self._derived_schema})