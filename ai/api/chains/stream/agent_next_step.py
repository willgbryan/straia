"""Prompt & chain that asks the LLM for the *next single* agent step.

This replaces the earlier multi‑event planner so that we can iterate:
  clarifications -> plan 1 action -> execute -> observe -> plan next …
"""

from langchain.prompts import PromptTemplate
from langchain.output_parsers.json import SimpleJsonOutputParser


template = """
You are an expert analytics assistant working inside an interactive notebook.

User question: {question}
Why: {why}
What: {what}

Previous context (what has already happened):
{context}

Table information / available CSV files (if any):
{table_info}

You must decide the SINGLE next step to move the analysis forward.  Choose from:
  • create_block  – add a new block (python / sql / visualization / markdown)
  • insight       – send a plain‑language insight to the user (no block)
  • done          – analysis is complete

If you create a block provide:
  blockType : one of "python", "sql", "visualization", "markdown"
  content   : the code or markdown text

Return a JSON object with keys:
  event      – "action", "insight", or "done"
  action     – if event=="action", set to "create_block"
  blockType  – as above (required when action == create_block)
  content    – string (required for create_block)
  summary    – short english description (optional)

Do NOT wrap the JSON in markdown, return raw JSON only.
"""


def create_next_step_chain(llm):
    prompt = PromptTemplate(
        template=template,
        input_variables=["question", "why", "what", "context", "table_info"],
    )
    return prompt | llm | SimpleJsonOutputParser()
