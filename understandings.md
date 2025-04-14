# Briefer Codebase Understanding

## Overview

Briefer is a collaborative web application for code notebooks and dashboards. It allows technical users to create notebooks and dashboards using Markdown, Python, SQL, and native visualizations, while making it easy for non-technical users to view and interact with data.

## System Architecture

Briefer is built as a monorepo with several interconnected services:

### Core Services

1. **Web Service** (`apps/web`):
   - Frontend application built with Next.js
   - Provides the UI for creating, editing, and viewing notebooks and dashboards
   - Handles real-time collaboration features
   - Implements a dashboard mode for viewing and interacting with data
   - Contains React components for various block types (Markdown, SQL, Python, Visualization)

2. **API Service** (`apps/api`):
   - Backend service built with Node.js
   - Manages database connections, user authentication, and document operations
   - Integrates with the Jupyter server to execute Python and SQL code
   - Handles scheduling for notebook execution
   - Provides REST endpoints for CRUD operations on documents, workspaces, users, etc.
   - Sets up WebSocket connections for real-time updates
   - Manages document locking to prevent conflicts
   - Handles data source connections and query execution

3. **AI Service** (`ai/api`):
   - Python service built with FastAPI
   - Provides AI-powered code generation and editing capabilities
   - Integrates with OpenAI for LLM functionality
   - Supports SQL and Python code generation and improvement
   - Implements streaming responses for real-time code generation
   - Uses LangChain for prompt engineering and chain creation
   - Secures endpoints with basic HTTP authentication

4. **Database**:
   - PostgreSQL database for storing user data, notebooks, dashboards, and schedules
   - Includes tables for users, documents, workspaces, datasources, and more
   - Stores execution results and scheduled run history
   - Handles authentication and permission information

5. **Jupyter Server**:
   - Executes Python and SQL code blocks
   - Integrates with custom extensions for Briefer-specific functionality
   - Provides execution context for notebooks
   - Handles data processing with pandas, numpy, and other scientific libraries

### Shared Packages

1. **Types** (`packages/types`):
   - Shared TypeScript type definitions
   - Includes definitions for data structures like DataFrames, visualizations, and API responses
   - Uses Zod for schema validation
   - Defines interfaces for cross-service communication
   - Contains migrations and utilities for data format compatibility

2. **Database** (`packages/database`):
   - Database models and query utilities
   - Provides abstractions for interacting with the database
   - Implements data access patterns for various entities (users, documents, etc.)
   - Manages database schema and migrations

3. **Editor** (`packages/editor`):
   - Core functionality for the notebook editor
   - Handles block operations, execution, and dashboard generation
   - Implements the data structures for document representation
   - Provides utilities for document manipulation and transformation
   - Manages the execution context and results

## Communication Patterns

### API-Web Communication

1. **REST API Calls**:
   - The web service makes REST API calls to the API service for CRUD operations
   - Authentication is managed via cookies for user sessions
   - API responses are typed using the shared type definitions

2. **WebSockets**:
   - Real-time updates are communicated via WebSockets
   - The API service broadcasts changes to connected clients
   - The web service listens for updates and applies them to the UI
   - Socket.io is used for WebSocket implementation

3. **YJS for Collaboration**:
   - Y.js is used for conflict-free real-time collaboration
   - The API service sets up a YJS WebSocket server
   - Document changes are synchronized between clients in real-time

### API-Jupyter Communication

1. **Code Execution**:
   - The API service sends code execution requests to the Jupyter server
   - Results are received and processed before being sent back to the client
   - Execution context is maintained between requests

2. **Data Processing**:
   - The Jupyter server processes data from SQL queries and other sources
   - Results are returned as DataFrames that can be further manipulated

### API-AI Communication

1. **Code Generation Requests**:
   - The API service sends code generation requests to the AI service
   - Instructions, context, and constraints are included in the request
   - Generated code is streamed back to the client via the API service

## Key Features and Workflows

### Notebook and Dashboard Creation

1. Users create notebooks with mixed content blocks (Markdown, Python, SQL)
2. The web UI provides a WYSIWYG editor interface
3. Code blocks are executed by the Jupyter server via the API
4. Results are rendered in the UI with support for various output types (tables, charts, HTML)
5. Notebooks can be converted to dashboards by selecting which elements to display
6. Dashboard mode provides interactive filters and visualizations

### Data Source Integration

1. Users can connect to external databases (PostgreSQL, BigQuery, Redshift, Athena, MySQL)
2. The API service manages database connections and credentials
3. SQL queries can be executed against these data sources
4. Results are returned as DataFrames that can be manipulated in Python
5. Database schema information is used for code completion and AI assistance

### AI-Powered Code Generation

1. Users can request AI assistance for generating or editing code
2. Requests are sent to the AI service via the API
3. The AI service uses LLMs to generate code based on context and schemas
4. Generated code is streamed back to the UI
5. Code suggestions can be accepted, modified, or rejected

### Collaboration Features

1. Multiple users can work on the same notebook simultaneously
2. Changes are synchronized in real-time using WebSockets and Y.js
3. The API service manages document locking to prevent conflicts
4. User presence and cursor positions are shared in real-time

### Scheduling

1. Notebooks can be scheduled to run periodically
2. The API service manages schedule execution
3. Results are saved as snapshots for historical comparison
4. Email notifications can be sent when schedules complete
5. Scheduled runs can trigger webhooks or other integrations

## Data Models

### Document Structure

Documents are the core entity in Briefer and contain:
- Metadata (title, description, created/updated timestamps)
- Blocks (content elements like markdown, code, visualizations)
- Execution context (variables, data sources)
- Permissions and access control information

### Block Types

1. **Markdown Blocks**: Rich text content with formatting
2. **SQL Blocks**: SQL queries with connection information
3. **Python Blocks**: Python code with execution context
4. **Visualization Blocks**: Charts, graphs, and other data visualizations
5. **Output Blocks**: Results from code execution

### Data Flow

1. User creates/edits a document in the web UI
2. Changes are sent to the API service via REST or WebSockets
3. The API service updates the database and broadcasts changes
4. For code execution, the API service sends requests to the Jupyter server
5. Results are stored and sent back to the client
6. The web UI renders the updated content

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript, FastAPI (Python), PostgreSQL
- **Data Processing**: Jupyter, Python scientific stack (pandas, numpy)
- **Real-time Collaboration**: Y.js, Socket.io
- **AI**: LangChain, OpenAI API
- **Deployment**: Docker, Kubernetes (via Helm charts)

## Development Workflow

The project uses Turborepo for monorepo management, with Docker Compose for local development. The `start-dev.sh` script can be used to start all services in development mode.

Key development commands:
- `yarn build`: Build all packages and applications
- `yarn dev`: Start all services in development mode
- `docker-compose up`: Start all services with Docker Compose

## Security and Authentication

The system implements authentication with basic HTTP authentication and environment variables for API keys. The AI service requires authentication for all endpoints except health checks.

User authentication is handled through sessions stored in cookies, with CORS configured to allow requests from specific origins.

## Deployment

The application can be deployed in several ways:
1. Docker Compose for simple deployments
2. Kubernetes using the provided Helm charts
3. Cloud-specific deployments (instructions in docs)

The `docker-compose.yaml` file defines the production deployment configuration, while `docker-compose.dev.yaml` is used for development. 