# Analyst Feature Implementation Plan

## Overview
The Analyst feature adds a new block type to Briefer that enables users to ask natural language questions about data, receive clarifying questions to refine their query, and get insights with visualizations and explanations. This workflow is designed to help non-technical users explore data effectively through natural language.

## Current Implementation Status

### Completed
- [x] Basic types and interfaces defined in `packages/editor/src/blocks/analyst.ts`
- [x] Core UI component created in `apps/web/src/components/v2Editor/customBlocks/analyst/index.tsx`
- [x] Block selection integration via PlusButton component
- [x] API endpoints for database schema retrieval, clarifications, and analysis
- [x] Database connectivity using existing datasource infrastructure
- [x] Integration with the existing workspace data source system
- [x] Integration with real language model APIs (connected through FastAPI and LangChain)
- [x] Basic visualizations tied to real data
- [x] Streaming response handling for better UX

### Future Enhancements
- [ ] Enhanced visualizations with interactive features
- [ ] More comprehensive testing with realistic database schemas and queries
- [ ] Follow-up question capability (conversation context)
- [ ] Optimization of prompt strategies for various data domains

## Implementation Steps

### 1. Feature Architecture
- [x] Define Analyst block type in the types system
- [x] Create block component structure (similar to other block types)
- [x] Design data model for storing queries, clarifications, and results
- [x] Create API endpoints for analyst operations

### 2. UI Components
- [x] Initial Query Form
  - [x] Natural language question input
  - [x] "Context" field (formerly "Why")
  - [x] "Goal" context field
  - [x] Submit button
- [x] Clarification UI
  - [x] Question display
  - [x] Option selection interface
  - [x] Back button for revising previous queries
  - [ ] Progress indicator for multi-stage clarifications
- [x] Results/Insights Panel
  - [x] Text summary section
  - [x] Basic visualization area
  - [x] Methodology explanation section
  - [x] Start new analysis button
  - [ ] Enhanced visualizations with more interactive features

### 3. Backend Logic
- [x] API endpoints for analyst feature (database schema, clarifications, analysis)
- [x] Database schema retrieval using existing datasource infrastructure
- [x] Language model integration for processing data questions
  - [x] Connected to LLM APIs through AI service
  - [x] Developed prompting strategy for analytics
  - [x] Implemented streaming responses for better UX
- [x] Clarification generation logic based on actual data schema
- [x] Results generation (text summaries and visualization configs)
- [ ] Enhanced query parsing service (identify ambiguous terms)
- [ ] Advanced query translation with error recovery

### 4. Data Source Integration
- [x] Use existing datasource infrastructure (PostgreSQL, MySQL, etc.)
- [x] Leverage existing schema cache and structure retrieval
- [x] Support for all datasource types available in the workspace
- [x] Basic data access patterns for LLM use
- [ ] Advanced schema representation for complex databases

### 5. Integration with Existing Components
- [x] Add Analyst block to the block selector menu
- [x] Integrate with existing datasource system
- [x] Integrate with editor flow and state management
- [x] Connect to basic visualization rendering system
- [ ] Implement export and sharing capabilities for analysis results

### 6. Testing
- [x] Manual testing with sample data
- [ ] Automated unit tests for core components
- [ ] Integration testing with complex schemas
- [ ] UI/UX testing for clarity and usability
- [ ] Performance testing with large datasets

## LLM Integration Strategy (Implemented)

The implementation now has working API endpoints for LLM interactions:
- `generateClarificationsStreamed()` - Backend API function for generating clarifications
- `generateAnalysisStreamed()` - Backend API function for generating analysis

Completed language model integration:

1. ✅ Connected existing API endpoints to LLM service through FastAPI
2. ✅ Implemented prompt engineering for domain-specific analytics
3. ✅ Designed schema conversion from real database schema to LLM-friendly format
4. ✅ Leveraged actual database schema for better query understanding
5. ✅ Implemented proper error handling and fallback mechanisms
6. ✅ Optimized streaming responses for better user experience

Future LLM enhancements:

1. Implement multi-model support for different types of analysis
2. Add domain-specific prompt templates for various industries
3. Integrate with larger context window models for more complex schemas
4. Develop fine-tuning strategies for specialized analysis

## Technical Architecture

### Frontend Components
- Analyst Block UI (`apps/web/src/components/v2Editor/customBlocks/analyst/index.tsx`)
- API utilities (`apps/web/src/utils/analystApi.ts`)
- Mock data for development (`apps/web/src/components/v2Editor/customBlocks/analyst/mockData.ts`)

### Backend Components
- Analyst router (`apps/api/src/v1/workspaces/workspace/analyst.js`)
- AI API integration (`apps/api/src/ai-api.ts`)

### LLM Chain Implementations
- Clarifications chain (`ai/api/chains/stream/analyst_clarifications.py`)
- Analysis chain (`ai/api/chains/stream/analyst_analysis.py`)
- FastAPI endpoints (`ai/api/app.py`)

## Dependencies
- Language model API (OpenAI or equivalent)
- Existing datasource connections (PostgreSQL, MySQL, etc.)
- Visualization rendering components
- Data transformation utilities

## Phase 1 Implementation (Completed)
1. ✅ Define the analyst block type
2. ✅ Create the basic UI components
3. ✅ Connect to existing datasource infrastructure
4. ✅ Implement the query form and clarification workflow
5. ✅ Create API endpoints for all analyst operations
6. ✅ Create a basic results display

## Phase 2 Implementation (Completed)
1. ✅ Connect API endpoints to actual language model service
2. ✅ Use real database schema for LLM context
3. ✅ Implement proper data analysis functions
4. ✅ Create basic visualization components
5. ✅ Add proper state management and persistence

## Phase 3 Implementation (Future Work)
1. Advanced query processing with feedback loops
2. Follow-up questions and conversation context
3. Learning tooltips and documentation
4. Export and sharing capabilities
5. Enhanced visualizations with interactivity
6. Domain-specific optimization for various industries 