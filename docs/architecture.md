# Briefer Core Architecture & Developer Guide

## 1. High-Level Architecture

```
+---------+      +---------+      +---------+      +---------+
| Browser +----->+ HAProxy +----->+  Web    |      |  API    |
|         |      |         |      | Service |<---->| Service |
+---------+      +---------+      +---------+      +---------+
                                   |   ^             |
                                   v   |             v
                                +---------+      +---------+
                                |  AI     |      |Database |
                                | Service |      +---------+
                                +---------+
```

**HAProxy** acts as the central reverse proxy and load balancer for all user/browser traffic. It routes requests to the appropriate backend services (Web, API, and, if needed, AI). In development, all services are orchestrated via Docker Compose and HAProxy.

---

## 2. Core Services

### A. HAProxy (Reverse Proxy)

- **Role:** Central entrypoint for all HTTP traffic. Routes requests to the web and API services, and can load balance between multiple instances.
- **Config:** See `haproxy.cfg`.
- **Dev Mode:** Started automatically via Docker Compose when running `./start-dev.sh`.

### B. Web Service (`apps/web`)

- **Tech Stack:** Next.js (React, TypeScript), Tailwind CSS, Yarn.
- **Entry Point:** `src/pages/_app.tsx` and `src/pages/index.tsx`
- **Block UI:** Components in `src/components/v2Editor/customBlocks/` (e.g., `python`, `sql`, `richText`, `visualization`).
- **Block Orchestration:** The editor (`src/components/v2Editor/index.tsx`) manages block creation, ordering, and execution.
- **Agent Integration:** `AgentIntegrationListener.tsx` and `AgentSidebar.tsx` handle agent-driven UI actions and feedback.

---

### C. API Service (`apps/api`)

- **Tech Stack:** Node.js, Express, TypeScript, Pino (logging), Postgres (via `@briefer/database`), Yjs (real-time collaboration).
- **Entry Point:** `src/index.ts`
- **Responsibilities:**
  - Auth, user/session management (`src/auth/`)
  - Notebook and block CRUD (`src/v1/`)
  - Real-time collaboration (Yjs, WebSockets)
  - Orchestrates execution of Python/SQL/Visualization blocks
  - Proxies AI requests to the AI service (`src/ai-api.ts`)
- **Block Model:** Blocks are managed as Yjs documents, with types and attributes for Python, SQL, Text, Visualization, etc.
- **Jupyter Integration:** Manages Python execution via Jupyter (`src/jupyter/`).

---

### D. AI Service (`ai/`)

- **Tech Stack:** Python 3.9, FastAPI, LangChain, Pydantic.
- **Entry Point:** `ai/api/app.py`
- **Responsibilities:**
  - Handles AI-powered code generation, block suggestions, and agent sessions.
  - Exposes endpoints for Python/SQL code editing, agent session streaming, and feedback.
  - Integrates with LLMs (OpenAI, etc.) via `llms.py` and chain modules.
  - Communicates with the API service (and, indirectly, the web service) via HTTP endpoints.

#### AI Service Request Flow & Agent Session Lifecycle

- **Endpoints:**
  - `/v1/stream/python/edit` and `/v1/stream/sql/edit`: Streaming code edit suggestions for Python and SQL blocks.
  - `/v1/agent/session/stream`: Starts an agent session, streams back agent actions, clarifications, and insights as a sequence of events (Server-Sent Events or chunked HTTP response).
  - `/v1/agent/session/feedback`: Receives execution results and feedback from the API or web service, allowing the agent to react to block execution outcomes.
  - `/v1/agent/session/respond`: Receives user clarifications to agent questions.

- **Agent Session Lifecycle:**
  1. **Session Start:** API/web service initiates a session by POSTing to `/v1/agent/session/stream` with a user question and context.
  2. **Event Streaming:** The AI service streams back a sequence of events (clarifications, block creation requests, insights, etc.).
  3. **Block Execution:** When the agent requests a block execution, the API/web service executes the block and POSTs the result to `/v1/agent/session/feedback`.
  4. **Clarifications:** If the agent needs more info, it emits a clarification event; the user's response is POSTed to `/v1/agent/session/respond`.
  5. **Session End:** The session ends when the agent completes its workflow or the user cancels.

- **Integration:**
  - The API service acts as the orchestrator, relaying user actions and block execution results between the web and AI services.
  - The web service displays agent-driven actions and clarifications in the UI, and relays user responses back to the AI service.

---

## 5. Agent Functionality: Current State, Shortcomings & Alternatives

### Current State

- **Agent endpoints** in AI service (`/v1/agent/session/stream`, `/v1/agent/session/feedback`) allow streaming of agent actions and feedback.
- **Integration Issues:** The agent's ability to create, populate, and execute blocks—especially text and visualization blocks—is limited and not robustly abstracted.
- **Code:** See `ai/api/agent/session.py` and `apps/web/src/components/AgentSidebar.tsx`.

### Specific Shortcomings

- **State Management:** The agent's internal state is not robustly modeled. There is no clear state machine or workflow engine, making it hard to reason about or extend agent behavior.
- **Block Orchestration:** The agent issues block creation and execution requests, but lacks a unified, extensible interface for orchestrating complex workflows (e.g., chaining SQL → Visualization → Text summary).
- **Extensibility:** Adding new block types or agent actions is difficult due to tightly coupled logic and lack of clear abstraction boundaries.
- **Error Handling:** The agent has limited mechanisms for handling execution errors, retries, or user interventions.
- **Feedback Loops:** The feedback mechanism (via `/feedback` endpoint) is ad-hoc, making it hard to synchronize agent state with block execution outcomes, especially for multi-step workflows.
- **Integration with UI:** The agent's events are not always mapped cleanly to UI actions, leading to inconsistent user experiences.

### Better Alternatives & Recommendations

- **State Machine/Workflow Engine:**
  - Use a formal state machine (e.g., XState, Sagas, or custom FSM) to model agent sessions, transitions, and side effects. This makes agent behavior explicit, testable, and extensible.
  - Each agent session should have a well-defined lifecycle (e.g., Idle → Planning → Executing → Awaiting Feedback → Completed/Error).

- **Event-Driven Orchestration:**
  - Adopt an event-driven architecture where agent actions, block executions, and user responses are all modeled as events. Use an event bus or pub/sub pattern to decouple components.
  - This enables easier chaining of actions (e.g., SQL → Visualization → Text) and better error recovery.

- **Clear Agent-Block API:**
  - Define a standard API/interface for agent-to-block interactions (create, update, execute, get result, etc.), both in the backend and frontend.
  - Use typed contracts (e.g., OpenAPI/Swagger, TypeScript interfaces) to ensure consistency.

- **Workflow/Task Queues:**
  - For complex, multi-step agent workflows, consider using a workflow/task queue (e.g., Celery, Temporal, or BullMQ) to manage execution, retries, and dependencies.

- **Improved Feedback & Error Handling:**
  - Implement structured feedback and error reporting, so the agent can adapt its plan or prompt the user for intervention.
  - Use correlation IDs to track agent actions and their outcomes across services.

- **UI Integration:**
  - Ensure agent events map cleanly to UI actions and feedback, providing clear user prompts and progress updates.

**Example Modernized Agent Flow:**
1. User asks agent to "analyze sales data."
2. Agent (modeled as a state machine) plans a workflow: create SQL block → execute → create Visualization block → execute → create Text block with summary.
3. Each step is an event; execution results and errors are fed back into the agent's state machine.
4. The UI displays agent progress, requests clarifications, and shows results in real time.

---

## 6. Getting Started for New Developers

- **Clone the repo and follow the dev setup above.**
- **Explore `/ai`, `/apps/web`, and `/apps/api` for core logic.**
- **Try running each service locally and creating a notebook with blocks.**
- **Suggested first tasks:**
  - Add a new block type (e.g., a new visualization).
  - Improve agent-block integration.
  - Write tests for block execution.

---

## 7. Diagrams

### System Architecture

```
+---------+      +---------+      +---------+      +---------+
| Browser +----->+ HAProxy +----->+  Web    |      |  API    |
|         |      |         |      | Service |<---->| Service |
+---------+      +---------+      +---------+      +---------+
                                   |   ^             |
                                   v   |             v
                                +---------+      +---------+
                                |  AI     |      |Database |
                                | Service |      +---------+
                                +---------+
```

### Block Lifecycle

```
[User/Agent] --(create)--> [API Service] --(store)--> [Database/Yjs]
      |                           |
      |--(populate/update)--------|
      |                           |
      |--(execute)----------------|
      |                           v
      |                    [Jupyter/SQL/AI]
      |                           |
      |<------(result)------------|
      v
[Web Service UI]
```

---

## 8. References

- **Block UI:** `apps/web/src/components/v2Editor/customBlocks/`
- **Agent Integration:** `ai/api/agent/session.py`, `apps/web/src/components/AgentSidebar.tsx`
- **API Entrypoint:** `apps/api/src/index.ts`
- **AI Entrypoint:** `ai/api/app.py`
- **HAProxy Config:** `haproxy.cfg` 