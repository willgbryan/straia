from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import json
import uuid

# Template for generating clarification questions
template = """You are an expert data analyst who helps non-technical users ask better questions about their data.
Your job is to ask clarifying questions when a user query is ambiguous or could be interpreted in multiple ways.

For each clarification needed, you should provide:
1. A clear question
2. 2-4 options that cover the range of possible interpretations
3. A brief description for each option to help the user understand what it means

DATABASE SCHEMA:
{database_schema}

USER QUERY: {question}
USER CONTEXT: {context}
USER GOAL: {goal}

Generate 2-4 clarification questions that would help answer this query more effectively.
Your response must be valid JSON that fits this schema:

```
{
  "clarifications": [
    {
      "id": "uuid-string",
      "question": "A clear question about an ambiguous aspect of the query",
      "options": [
        {
          "id": "uuid-string",
          "label": "Option 1",
          "description": "Brief explanation of this option",
          "value": "machine_readable_value"
        },
        ...more options...
      ]
    },
    ...more clarifications...
  ]
}
```

IMPORTANT NOTES:
- Each clarification question should focus on a DIFFERENT aspect of the query
- Each "id" field must be a unique UUID string
- Each "label" should be concise but clear, ideally with an emoji at the start
- Each "value" should be a machine-readable string (no spaces, lowercase, underscore-separated)
- Don't invent options that wouldn't apply to the schema
- Your response must be ONLY the JSON, properly formatted

JSON RESPONSE:"""

def create_analyst_clarifications_stream_chain(llm):
    """
    Creates a chain for generating clarification questions for an analyst query.
    
    Args:
        llm: The language model to use for generating clarifications
        
    Returns:
        A chain that can generate clarification questions
    """
    prompt = PromptTemplate(
        template=template,
        input_variables=["database_schema", "question", "context", "goal"]
    )
    
    chain = LLMChain(llm=llm, prompt=prompt)
    
    return chain 