# Straia Analytics Agent — Implementation Plan

## Overview
This document tracks the plan and progress for building the Straia Analytics Agent: an LLM-powered assistant that helps non-technical users perform data analytics via natural language, clarifying questions, and actionable insights.

---

## 1. Understanding the Existing AI & Analytics Workflow
- The current "Edit with AI" feature for Python/SQL blocks uses a backend executor to orchestrate LLM calls, streaming suggestions to the frontend.
- The frontend uses forms and hooks to manage user input, socket connections, and streaming results.
- Data models for blocks already support AI prompts, suggestions, and UI state.
- **Analytics workflows (query, DataFrame, visualization, export) are already implemented and will be orchestrated by the agent for real, non-mocked insights.**

---

## 2. Inventory of Relevant Processes & Integration Points

| Functionality         | Backend File(s)                                      | Frontend File(s)                                         |
|----------------------|------------------------------------------------------|----------------------------------------------------------|
| SQL/Python Query     | `apps/api/src/python/query/athena.ts`                | `customBlocks/sql/`, `customBlocks/python/`              |
| DataFrame Handling   | `@briefer/types`, `@briefer/editor`                  | `customBlocks/visualization/`, `visualizationV2/`        |
| Visualization Exec   | `apps/api/src/yjs/v2/executor/visualization.ts`      | `customBlocks/visualization/index.tsx`                   |
| LLM Orchestration    | `ai/python.ts`, `ai/sql.ts`, `ai-api.ts`             | `EditWithAIForm.tsx`, `useAI.ts`                         |
| Notebook/Insight     | `@briefer/editor`, `@briefer/database`               | `v2Editor/`, `Notebook/`, `Dashboard/`                   |
| Export/Share         | `docs/product/sharing.mdx`                           | `VisualizationView.tsx`, `visualizationV2/VisualizationView.tsx` |

- **DataFrames** are the core structure for analytics, passed between query, transformation, and visualization blocks.
- **Visualization executors** handle chart generation, using DataFrames and chart specs, and return results to the frontend.
- **Export and sharing** workflows are already implemented for notebooks, dashboards, and individual visualizations.
- **Session and state management** patterns exist for tracking block status, results, and user actions.

---

## 3. Agent-Driven Notebook Actions

The agent will be able to:
- **Create new blocks** (SQL, Python, Visualization, Markdown, Input, etc.) using the same APIs as the UI (`createBlock`, `addBlockGroup`, `addGroupedBlock`).
- **Populate blocks** with code, queries, text, or configuration by setting block attributes.
- **Execute blocks** by enqueuing them in the execution queue (`enqueueBlock`), triggering the same backend logic as user-initiated runs.
- **Update/annotate blocks** with results, explanations, or follow-up prompts as needed.
- **Chain actions** (e.g., create a SQL block, run it, then create a visualization block from its DataFrame).

This enables the agent to act as a true co-pilot, automating multi-step analytics workflows directly in the notebook.

---

## 4. Agent Session Handler: Alignment with "Edit with AI"

- The agent session handler will follow the same **task/session orchestration** as "edit with AI":
  - Each agent session is a task, with observable, abortable state.
  - Progress, clarifications, and results are streamed to the frontend (via sockets/events).
  - The agent uses the same block/task APIs for notebook actions, ensuring collaborative, real-time updates.
  - Sessions can be cancelled or observed by multiple users.
- This ensures a consistent, collaborative, and real-time user experience across all AI-driven workflows.

---

## 5. Agent Workflow — Demo Use Case
**Example:** "Are first-gen commuter students at risk this semester?"

### Step 1: Query Input Form
- [ ] UI: Large input for the question, plus two required fields: "Why" and "What are you trying to solve?"
- [ ] Placeholder text for hints.

### Step 2: Clarification Flow
- [ ] Detect ambiguous terms (e.g., "at risk", "first-gen", etc.)
- [ ] UI: Chat-style or side-panel clarifying questions with quick reply buttons and tooltips.
- [ ] LLM: Generate clarifying questions and validate user responses.

### Step 3: Insight Generation & Output
- [ ] LLM: Synthesize clarified query, map to data model/logic.
- [ ] Backend: Retrieve relevant data (using real DataFrame/query/visualization workflows).
- [ ] **Agent: Create, populate, and execute notebook blocks as needed to fulfill the workflow.**
- [ ] UI: Display summary insight, chart(s), methodology note.
- [ ] UI: Action buttons (Save, Export, Set Alert, Follow-Up).

### Step 4: Learning Modal (Optional)
- [ ] UI: Tooltip/info card for definitions, data dictionary, metric explanations.

---

## 6. Technical Plan

### A. UI/UX
- [ ] New agent entry point (button or menu)
- [ ] Query input form (step 1)
- [ ] Clarification dialog (step 2)
- [ ] Insight panel (step 3)
- [ ] Learning/info modals (step 4)

### B. LLM Orchestration & Backend
- [ ] New backend endpoint for agent session
- [ ] LLM prompt templates for:
    - Query interpretation
    - Clarifying question generation
    - Semantic mapping
    - Insight synthesis
- [ ] Session state management (track clarifications, user choices)
- [ ] **Orchestrate real analytics workflows:**
    - Use DataFrame/query/visualization executors for real data and charts
    - **Create, populate, and execute notebook blocks as needed**
    - Chain actions and update notebook state in real time
- [ ] **Agent sessions are observable, abortable, and stream updates to the frontend (via sockets/events) for real-time, collaborative UX.**

### C. Data & Logic Layer
- [ ] Semantic mapping logic (LLM-driven, mapped to real data model)
- [ ] Data retrieval (via existing query and DataFrame logic)
- [ ] Chart/visualization generation (via existing executors)

### D. Output & Actions
- [ ] Render summary, chart(s), methodology
- [ ] Implement export, save, alert, and follow-up actions (using existing features)
- [ ] Learning/teaching layer (info modals, data dictionary)

### E. Integration
- [ ] Reuse/extend existing AI orchestration and UI patterns
- [ ] Ensure agent can be invoked from anywhere relevant (notebook, dashboard, etc.)
- [ ] **Agent actions should be collaborative and visible to all users in real time.**

---

## 7. Next Steps / TODO
- [ ] Review and refine plan
- [ ] Design initial UI wireframes
- [x] Scaffold agent session backend
- [ ] Implement query input form
- [x] Implement clarification flow (backend)
  - Note: UI integration pending
- [x] Integrate agent session proxy in apps/api
  - Enables front-end to consume clarification & action SSE
- [x] Scaffold front-end hook `useAgentSession` to consume SSE proxy
- [x] Build Agent modal component and button in v2Editor
- [x] Implement SSE listener and render clarification UI
- [x] Implement stub insight generation (backend + UI)
  - Revisit for real analytics workflow (block creation & execution chaining)
- [x] Implement agent-driven notebook actions (block creation, execution, chaining)
- [ ] Add export and learning features

---

## 8. References
- See user-provided demo JSON schema and workflow for detailed requirements.
- See existing "Edit with AI" and analytics code for orchestration patterns.
- See `packages/editor/src/operations/document.ts` and `execution/queue.ts` for block/action APIs.


*This plan will be updated as development progresses.* 