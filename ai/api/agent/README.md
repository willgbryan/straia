# AI Agent API

This module implements an AI assistant agent for Briefer that can process user questions, analyze notebook context, and generate appropriate responses and actions.

## Architecture

The agent implementation consists of several key components:

1. **Core Agent Logic (`agent.py`)**: Implements the main `Agent` class that processes requests and generates responses.

2. **Schema Definitions**:
   - `request.py`: Defines the structure of incoming agent requests
   - `response.py`: Defines the structure of agent responses
   - `actions.py`: Defines action specifications
   - `context.py`: Defines notebook context structure

3. **API Endpoints**: 
   - `/v2/agent/query`: Synchronous endpoint for complete responses
   - `/v2/agent/stream`: Streaming endpoint for real-time responses

4. **Tools**:
   - `sql_generation.py`: Generates SQL queries from natural language
   - `python_generation.py`: Generates Python code for data analysis

## API Endpoints

### Process Agent Query (Synchronous)

```
POST /v2/agent/query
```

**Request Body**:
```json
{
  "question": "Show me sales by region",
  "documentId": "uuid-of-document",
  "userId": "uuid-of-user",
  "workspaceId": "uuid-of-workspace",
  "sessionId": "optional-session-id",
  "previousMessages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

**Response**:
```json
{
  "messages": [
    {"role": "user", "content": "Show me sales by region"},
    {"role": "assistant", "content": "Here's a query to show sales by region..."}
  ],
  "metadata": {
    "timestamp": "2025-04-25T12:34:56.789Z",
    "userId": "user-uuid",
    "documentId": "document-uuid"
  }
}
```

### Stream Agent Response

```
POST /v2/agent/stream
```

**Request Body**: Same as `/v2/agent/query`

**Response**: Stream of JSON objects representing messages:

```json
{"role": "assistant", "content": "I'm processing your request..."}
{"role": "assistant", "content": "Analyzing the available data sources..."}
{"role": "assistant", "content": "Here's a query to show sales by region..."}
```

## Usage Example

```python
import httpx

async def ask_agent(question, document_id):
    response = await httpx.post(
        "http://localhost:8000/v2/agent/query", 
        json={
            "question": question,
            "documentId": document_id
        },
        auth=("admin", "password")
    )
    return response.json()

# Example usage
result = await ask_agent("Show me monthly sales trends", "document-uuid")
print(result["messages"][-1]["content"])  # Print the last message from the assistant
```

## Development

### Adding New Capabilities

1. Define new action types in `actions.py`
2. Implement tool functions in the `tools/` directory
3. Integrate tools into the agent's processing logic

### Error Handling

All endpoints include comprehensive error handling with appropriate HTTP status codes:

- `400 Bad Request`: Invalid input or missing required fields
- `500 Internal Server Error`: Error during processing 