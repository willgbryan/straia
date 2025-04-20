from langchain.prompts import PromptTemplate
from langchain.output_parsers.json import SimpleJsonOutputParser

# Prompt template for planning agent actions based on user input and clarifications
template = """
You are an expert analytics assistant. The user has provided:

Question: {question}
Why: {why}
What: {what}

Your task is to determine the sequence of actions needed to fulfill the user's request.
Actions may include creating blocks (SQL, Python, visualization, markdown) or emitting insights.
For each action, output a JSON object with keys:
  - event: one of "action" or "insight"
  - action: for creation, always "create_block"; omit for insights
  - blockType: one of "sql", "python", "markdown", etc. (for create_block events)
  - content: the code or text for the block
  - summary/details: for insight events

Return a JSON object with a single key "events" whose value is an array of these action/insight objects.
Do not include any additional text.
"""

def create_agent_plan_stream_query_chain(llm):
    """
    Create a streaming chain that returns a JSON list of agent events (actions/insights).
    """
    prompt = PromptTemplate(
        template=template,
        input_variables=["question", "why", "what"],
    )
    # Build the chain: prompt -> llm -> JSON parser
    return prompt | llm | SimpleJsonOutputParser()