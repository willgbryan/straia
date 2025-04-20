from langchain.prompts import PromptTemplate
from langchain.output_parsers.json import SimpleJsonOutputParser

# Prompt template for planning agent actions based on user input, clarifications, and file schema
template = """
You are an expert analytics assistant. The user has provided:

Question: {question}
Why: {why}
What: {what}
Table Info: {table_info}
Available CSV files: {file_names}

Data Context:
- If Table Info lists CSV tables and Available CSV files lists one or more names, these files reside in the workspace and should be read using pandas in Python blocks.
- Otherwise, you may use SQL blocks for database queries.

Your task is to determine the sequence of actions needed to fulfill the user's request.
Actions may include creating blocks (Python, SQL, visualization, markdown) or emitting insights.
For each action, output a JSON object with keys:
  - event: one of "action" or "insight"
  - action: for creation, always "create_block"; omit for insights
  - blockType: one of "python", "sql", "visualization", "markdown"
  - content: the code or text for the block
  - summary/details: for insight events

Return a JSON object with a single key "events" whose value is an array of these action/insight objects.
Do not include any additional text.
"""

def create_agent_plan_stream_query_chain(llm):
    """
    Create a streaming chain that returns a JSON list of agent events (actions/insights).
    Includes file-based schema fallback via table_info and file_names.
    """
    prompt = PromptTemplate(
        template=template,
        input_variables=["question", "why", "what", "table_info", "file_names"],
    )
    # Build the chain: prompt -> llm -> JSON parser
    return prompt | llm | SimpleJsonOutputParser()