# Agent Sidebar UX & Agent Alignment Plan

## 1. Clarification Event Handling Fix
- [ ] Remove the `step === 'running'` guard in the event processing effect in `AgentSidebar.tsx` so clarifications are always processed and shown.
- [ ] Test: Ensure clarifications always appear, regardless of timing.

## 2. Agent Workflow & Dynamic Inquiry Improvements
- [ ] Move "what" and "why" to the agent's clarification logic (not pre-form UI fields).
- [ ] Allow the agent to generate any clarification question (not just "what" and "why").
- [ ] Backend: Update the agent's prompt and FSM to dynamically request missing context (e.g., "what are you trying to solve?") if not provided.
- [ ] Frontend: The sidebar should only require the initial question, then display clarifications as they are requested by the agent.

## 3. Clarification Inputs Should Impact Agent Output
- [ ] Backend: When a clarification is answered, update the agent session's context and re-invoke the FSM with the new information.
- [ ] Frontend: After each clarification answer, stream the next agent action/insight, reflecting the updated context.

## 4. Sidebar UI/UX: Streaming & Collapsing Message Bubbles
- [ ] Streaming: As the agent generates output (e.g., SQL, summary, insight), stream the content into the bubble in real time.
- [ ] Thinking State: Show a "thinking"/typing indicator while streaming.
- [ ] Collapse: After streaming completes, collapse the bubble to a summary or top-level insight, with an option to expand for details (e.g., full SQL, reasoning).
- [ ] Message Types: Support different message types (e.g., agent summary, reasoning, SQL, chart, clarification) with appropriate UI.
- [ ] **All agent narrative/insight should be delivered via message bubbles (insight events) in the sidebar, not as notebook blocks.**
- [ ] **Remove all text/markdown/richText blocks for narrative from the notebook. Narrative should only appear in the chat/side panel.**

## 5. UI/UX Polish
- [ ] Clarification UI: Use quick reply buttons, tooltips, and teaching moments as in the reference.
- [ ] Insight Panel: After clarifications, show a summary insight panel with text, charts, and follow-up options.
- [ ] Follow-up Actions: Allow users to save, export, share, set alerts, or ask follow-up questions. 