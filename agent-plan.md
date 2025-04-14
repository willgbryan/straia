# Briefer Agent Implementation Plan

## Overview

This document outlines the implementation plan for adding an agentic assistant to Briefer that can:
1. Chat with users to understand their data analysis needs
2. Generate and execute SQL queries in the notebook
3. Create and customize visualizations
4. Generate Python code for data manipulation
5. Add blocks to the notebook and execute them
6. Explain its reasoning and provide insights on the data
7. Create and update Markdown blocks for documentation and insights

## Architecture

### Component Architecture

```
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Web UI      │ ◄─┤   API Server  │ ◄─┤  Agent Service│
│ (React/Next.js)│   │  (Node.js)    │   │   (Python)    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Agent Sidebar │   │ Notebook Ops  │   │   LLM Models  │
│  Components   │   │    Manager    │   │    (OpenAI)   │
└───────────────┘   └───────────────┘   └───────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │Jupyter Service│
                    │ (Execution)   │
                    └───────────────┘
```

### Data Flow

1. User submits a question via the Agent Sidebar
2. Question is sent to the API Server via WebSocket
3. API Server:
   - Collects context about the notebook
   - Forwards the request to the Agent Service
4. Agent Service:
   - Processes the request using LLM
   - Plans a series of actions to take
   - Returns the plan to the API Server
5. API Server:
   - Executes the actions (adding blocks, running code, etc.)
   - Streams the results back to the Web UI
6. Web UI updates with:
   - Agent's thought process
   - New notebook blocks
   - Execution results
   - Visualizations

## Implementation Details

### 1. Frontend Components

#### New Components

```
apps/web/src/components/agent/
├── AgentSidebar.tsx            // Main sidebar container
├── AgentChatThread.tsx         // Chat history display
├── AgentMessage.tsx            // Individual message component 
├── AgentInput.tsx              // Question input field
├── AgentThinking.tsx           // Thinking/processing state
├── AgentActionIndicator.tsx    // Shows current action being performed
└── AgentSettings.tsx           // Configuration options
```

#### UI States

1. **Idle**: Ready to receive questions
2. **Thinking**: Processing user request
3. **Executing**: Running operations on the notebook
4. **Streaming**: Sending back incremental results
5. **Error**: Showing error state with recovery options

#### Integration Points

- Add the Agent Sidebar to the notebook view (`apps/web/src/pages/[documentId].tsx`)
- Create agent state management with context providers
- Add WebSocket listeners for agent events

### 2. API Service Extensions

#### New Modules

```
apps/api/src/agent/
├── index.ts                    // Route definitions
├── controller.ts               // Request handling
├── context-collector.ts        // Notebook context gathering
├── action-executor.ts          // Action execution logic
├── block-creator.ts            // Block creation utilities
├── visualization-helper.ts     // Visualization creation helpers
└── types.ts                    // Type definitions
```

#### Key Functions

1. **Context Collection**:
   - `getNotebookContext(documentId)`: Retrieve all notebook blocks and metadata
   - `getDataSourceSchema(dataSourceId)`: Get schema information for data sources
   - `getExecutionHistory(documentId)`: Get recent execution results

2. **Action Execution**:
   - `createBlock(documentId, blockType, content)`: Create a new block
   - `executeBlock(documentId, blockId)`: Execute a specific block
   - `updateBlock(documentId, blockId, content)`: Update block content
   - `createVisualization(documentId, dataframeRef, config)`: Create visualization

3. **Events & Communication**:
   - `broadcastAgentAction(action)`: Send action details to connected clients
   - `streamAgentResponse(response)`: Stream agent responses to the client

### 3. Agent Service Implementation

#### New Python Modules

```
ai/api/agent/
├── __init__.py
├── agent.py                    // Main agent implementation
├── tools/
│   ├── __init__.py
│   ├── sql_generation.py       // SQL query generation
│   ├── python_generation.py    // Python code generation
│   ├── visualization.py        // Visualization configuration
│   ├── block_ops.py            // Block operation tools
│   ├── markdown_generation.py  // Markdown content generation
│   └── explanation.py          // Explanation generation
├── prompts/
│   ├── __init__.py
│   ├── system.py               // System prompts
│   └── examples.py             // Few-shot examples
└── schemas/
    ├── __init__.py
    ├── input.py                // Input schemas
    ├── actions.py              // Action schemas
    └── context.py              // Context schemas
```

#### Tool Definitions

1. **Query Generation Tool**:
   ```python
   def generate_sql_query(question: str, tables: List[TableInfo], dialect: str) -> str:
       """Generate a SQL query based on the user question and available tables."""
       # Implementation using LLM
   ```

2. **Block Creation Tool**:
   ```python
   def create_notebook_block(block_type: str, content: str, 
                           position: Optional[str] = None) -> ActionSpec:
       """Create a specification for adding a new block to the notebook."""
       # Returns action spec for API to execute
   ```

3. **Visualization Creation Tool**:
   ```python
   def create_visualization(dataframe_var: str, 
                          chart_type: str,
                          x_axis: str, 
                          y_axis: str,
                          group_by: Optional[str] = None) -> ActionSpec:
       """Create a visualization based on a dataframe reference."""
       # Returns visualization configuration
   ```

4. **Execution Tool**:
   ```python
   def execute_block(block_id: str) -> ActionSpec:
       """Create an action to execute a specific block."""
       # Returns action spec for API to execute
   ```

5. **Markdown Creation Tool**:
   ```python
   def create_markdown_block(content: str, 
                           position: Optional[str] = None,
                           formatting: Optional[Dict[str, Any]] = None) -> ActionSpec:
       """Create a specification for adding a new markdown block to the notebook.
       
       Args:
           content: The markdown content to add
           position: Optional position to insert (after blockId, beginning, end)
           formatting: Optional formatting options (headings, etc.)
       
       Returns:
           Action specification for creating a markdown block
       """
       # Returns action spec for API to execute
   ```

6. **Markdown Update Tool**:
   ```python
   def update_markdown_block(block_id: str, 
                           content: str,
                           append: bool = False) -> ActionSpec:
       """Create a specification for updating an existing markdown block.
       
       Args:
           block_id: The ID of the block to update
           content: The new content or content to append
           append: Whether to append to existing content or replace it
       
       Returns:
           Action specification for updating a markdown block
       """
       # Returns action spec for API to execute
   ```

#### Agent Implementation

1. **Main Agent Class**:
   ```python
   class BrieferAgent:
       def __init__(self, llm_provider, tools):
           self.llm = llm_provider
           self.tools = tools
           # Initialize other components
           
       async def process_request(self, question, context):
           """Process user request and return actions to take."""
           # Implement agent logic using function calling
           
       async def stream_response(self, question, context):
           """Stream the agent's response and actions."""
           # Implementation for streaming
   ```

2. **Function Calling Flow**:
   - Define tool schemas compatible with OpenAI function calling
   - Process user request to determine which tools to use
   - Call appropriate tools and collect results
   - Format results for streaming back to the user

### 4. API Endpoints

#### New Endpoints

1. **Start Agent Conversation**:
   ```
   POST /v1/agent/conversations
   Body: { documentId: string }
   Response: { conversationId: string }
   ```

2. **Send Message**:
   ```
   POST /v1/agent/conversations/:conversationId/messages
   Body: { content: string }
   Response: Stream of { type: "thinking"|"action"|"message", content: any }
   ```

3. **Execute Agent Action**:
   ```
   POST /v1/agent/actions
   Body: { documentId: string, action: ActionSpec }
   Response: { success: boolean, result: any }
   ```

### 5. Database Changes

#### New Tables

1. **agent_conversations**:
   - `id` (primary key)
   - `document_id` (foreign key to documents)
   - `user_id` (foreign key to users)
   - `created_at`
   - `updated_at`
   - `metadata` (JSON)

2. **agent_messages**:
   - `id` (primary key)
   - `conversation_id` (foreign key)
   - `role` ("user"|"assistant")
   - `content` (text)
   - `created_at`
   - `metadata` (JSON)

3. **agent_actions**:
   - `id` (primary key)
   - `message_id` (foreign key)
   - `action_type` (enum)
   - `status` (enum)
   - `details` (JSON)
   - `result` (JSON)
   - `created_at`
   - `completed_at`

### 6. Agent Actions and Capabilities

#### SQL Query Generation

1. The agent analyzes the user's question to understand the data need
2. It reviews available data sources and schema information
3. It generates an appropriate SQL query
4. It creates a new SQL block in the notebook with the query
5. It executes the block and awaits results
6. It explains the query to the user

#### Visualization Creation

1. The agent analyzes query results to determine appropriate visualization
2. It creates a visualization block configured for the data
3. It determines appropriate:
   - Chart type (bar, line, pie, etc.)
   - X and Y axis columns
   - Grouping/aggregation options
   - Labels and titles
4. It explains the visualization choices to the user

#### Python Code Generation

1. The agent determines when Python code is needed (complex transformations, etc.)
2. It generates appropriate Python code with pandas/numpy operations
3. It creates a Python block with the code
4. It executes the block and evaluates results
5. It explains the code to the user

#### Multi-Step Workflows

1. The agent can plan multi-step operations:
   - Query data → Transform data → Visualize results
   - Combine multiple data sources
   - Create multiple related visualizations
2. It maintains context across steps
3. It explains the overall workflow and insights

#### Markdown Content Generation

1. The agent generates explanatory text in Markdown format to:
   - Introduce analysis and provide context
   - Explain data findings and insights
   - Document the approach taken in the analysis
   - Summarize results and recommendations

2. Markdown formatting capabilities include:
   - Headers and subheaders for organization
   - Bullet points and numbered lists
   - Tables for structured data presentation
   - Code blocks with syntax highlighting
   - Bold/italic for emphasis
   - Links to reference materials or documentation

3. Contextual markdown generation:
   - Before SQL queries to explain the data question
   - After visualizations to highlight insights
   - Between analysis steps to document the workflow
   - At the end to summarize findings and next steps

4. Interactive documentation:
   - Generating data dictionaries for referenced tables
   - Creating guided tutorials for complex notebook workflows
   - Adding explanatory comments next to complex code blocks

#### Narrative Generation

1. The agent can create a coherent narrative throughout the notebook by:
   - Adding introductory text explaining the analysis goal
   - Inserting transition text between analytical steps
   - Providing contextual explanations of technical concepts
   - Creating conclusion blocks summarizing key findings

2. Narrative capabilities include:
   - Problem statements and business context
   - Methodology explanations
   - Results interpretation
   - Recommendations based on data findings
   - Further questions to explore

3. The agent maintains a consistent tone and level of technical detail based on:
   - The user's role and technical proficiency
   - The intended audience for the notebook
   - The complexity of the analysis

### 7. Error Handling and Recovery

1. **Query Errors**:
   - Detect SQL syntax errors
   - Understand error messages
   - Generate fixed queries

2. **Execution Errors**:
   - Handle Python runtime errors
   - Propose fixes for common errors
   - Explain errors in plain language

3. **Context Limitations**:
   - Handle missing data sources
   - Manage token limits with large notebooks
   - Prioritize relevant context

### 8. Security Considerations

1. **Code Execution Safety**:
   - Validate generated code before execution
   - Run in isolated environments
   - Implement timeouts for long-running operations

2. **Data Access Control**:
   - Respect user permissions on data sources
   - Don't expose sensitive information in explanations
   - Log all agent actions for audit purposes

3. **Rate Limiting**:
   - Implement rate limits for agent requests
   - Prevent resource exhaustion from complex operations

## Implementation Phases

### Phase 1: Core Infrastructure (2-3 weeks)

1. Build Agent UI components
2. Implement WebSocket communication
3. Set up database schemas
4. Create basic context collection

### Phase 2: Basic Query Capabilities (2-3 weeks)

1. Implement SQL generation
2. Add block creation functionality
3. Create basic explanation capabilities
4. Set up execution flow

### Phase 3: Visualization Support (2-3 weeks)

1. Add visualization creation
2. Implement chart type selection logic
3. Add configuration options
4. Improve explanations

### Phase 4: Advanced Features (3-4 weeks)

1. Add Python code generation
2. Implement multi-step planning
3. Add error recovery mechanisms
4. Improve context handling

### Phase 5: Polish and Optimization (2-3 weeks)

1. Improve response quality
2. Optimize performance
3. Add user feedback mechanisms
4. Implement advanced security measures

## Examples of Agent Interactions

### Example 1: Basic Data Query

**User**: "Show me monthly sales by category"

**Agent Actions**:
1. Creates SQL block with query:
   ```sql
   SELECT 
     DATE_TRUNC('month', order_date) as sale_month,
     category_name,
     SUM(sale_amount) as sale_amount
   FROM orders
   JOIN products ON orders.product_id = products.id
   JOIN product_categories ON products.category_id = product_categories.id
   GROUP BY sale_month, category_name
   ORDER BY sale_month, category_name
   ```
2. Executes the SQL block
3. Creates visualization block with:
   - Bar chart
   - X-axis: sale_month
   - Y-axis: sale_amount
   - Group by: category_name
4. Explains insights from the visualization

### Example 2: Data Transformation and Analysis

**User**: "What are our top selling products each month and how has that changed over the last year?"

**Agent Actions**:
1. Creates SQL block to fetch raw data
2. Creates Python block for transformation:
   ```python
   # Get top product by sales for each month
   import pandas as pd
   
   # Assuming df contains the query results
   monthly_top_products = df.sort_values(['sale_month', 'sales'], ascending=[True, False])
   monthly_top_products = monthly_top_products.groupby('sale_month').head(5)
   
   # Create a pivot for trend analysis
   trend_df = monthly_top_products.pivot(index='sale_month', columns='product_name', values='sales')
   trend_df = trend_df.fillna(0)
   ```
3. Creates visualization for trends
4. Provides analysis of changing product popularity

### Example 3: Complete Analytical Workflow with Documentation

**User**: "Create a sales performance analysis that shows our best and worst performing categories, including trends over time, and document the methodology."

**Agent Actions**:
1. Creates an introductory Markdown block:
   ```markdown
   # Sales Performance Analysis
   
   This analysis examines our sales performance across different product categories, 
   identifying top and bottom performers as well as key trends over time. We'll look at:
   
   - Overall category performance
   - Monthly trends by category
   - Seasonal patterns
   - Growth rates year-over-year
   
   ## Methodology
   
   We'll start by querying our sales data to get category performance metrics, then
   visualize the results to identify patterns. Finally, we'll perform trend analysis
   to understand how performance is changing over time.
   ```

2. Creates SQL block to fetch category performance data
3. Executes the SQL block
4. Adds explanatory Markdown after results:
   ```markdown
   ## Overall Category Performance
   
   The query above provides us with total sales by category. From these results, we can
   see that **Electronics** and **Home Goods** are our top performing categories, while
   **Office Supplies** and **Books** have the lowest sales volume.
   
   Let's now examine how these categories perform over time to identify trends.
   ```

5. Creates SQL block for time series data
6. Creates visualization for trend analysis
7. Adds final insights Markdown block:
   ```markdown
   ## Key Findings
   
   From our analysis, we can observe several important patterns:
   
   1. **Seasonal Effects**: Electronics shows strong Q4 performance, likely due to holiday shopping
   2. **Growing Categories**: Home Goods has shown consistent growth each quarter (15% YoY)
   3. **Declining Categories**: Office Supplies has been trending downward (-8% YoY)
   
   ## Recommendations
   
   Based on these findings, we should consider:
   
   - Increasing inventory of Home Goods leading into Q2 and Q3
   - Running promotional campaigns for Office Supplies to reverse the downward trend
   - Expanding our Electronics selection before the Q4 holiday season
   ```

## Technical Challenges and Solutions

### 1. Context Management

**Challenge**: Providing enough context to the LLM without exceeding token limits

**Solution**:
- Implement smart context pruning based on relevance
- Use embeddings to retrieve only relevant notebook blocks
- Maintain summary of notebook state for reference

### 2. Action Planning

**Challenge**: Determining the right sequence of actions for complex requests

**Solution**:
- Implement chain-of-thought reasoning for multi-step planning
- Use function calling to structure the agent's thinking
- Allow for revising plans based on execution results

### 3. Real-time Response

**Challenge**: Providing responsive feedback during long operations

**Solution**:
- Implement streaming responses for all agent communications
- Show intermediate thinking steps
- Use progressive rendering for long responses

### 4. Narrative Quality

**Challenge**: Generating high-quality narrative content that provides real value

**Solution**:
- Use specialized prompting for narrative generation
- Train the agent on exemplar notebooks with high-quality documentation
- Implement user feedback loop to improve narrative content over time
- Add parameters for controlling level of detail and technical complexity

## Success Metrics

1. **Usability**: Percentage of user requests successfully completed
2. **Accuracy**: Correctness of generated code and visualizations
3. **Satisfaction**: User ratings and feedback on agent interactions
4. **Efficiency**: Time saved compared to manual operations
5. **Adoption**: Percentage of users engaging with the agent feature 