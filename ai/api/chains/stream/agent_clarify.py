from langchain.prompts import PromptTemplate
from langchain.output_parsers.json import SimpleJsonOutputParser

# Prompt template for clarification questions
template = """
You are an expert analytics assistant. A user has provided the following:

Question: {question}
Why: {why}
What: {what}

Your task is to identify ambiguous terms in the user's question and generate clarifying questions for each term.
For each ambiguous term, provide:
  - term: the word or phrase that needs clarification
  - question: a single-sentence prompt asking the user to clarify that term
  - options: a list of choices, each with 'label' (short option text) and 'tooltip' (a brief explanation)

Respond with a JSON object containing a single key 'clarifications', whose value is an array of these objects.
Do not include any additional keys or explanatory text.
"""

def create_clarification_stream_query_chain(llm):
    """
    Create a streaming chain that returns JSON with clarification questions.
    """
    prompt = PromptTemplate(
        template=template,
        input_variables=["question", "why", "what"],
    )
    # Build stream chain: prompt -> llm -> json parser
    return prompt | llm | SimpleJsonOutputParser()