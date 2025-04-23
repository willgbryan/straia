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

IMPORTANT: For loading and preprocessing CSV files, prefer Python blocks (use blockType "python" with pandas, e.g. pd.read_csv). Use SQL blocks (blockType "sql") only when querying an existing database datasource.
For any plotting or charting tasks, never propose Python plotting code (e.g., matplotlib); always use blockType "visualizationV2" with a structured `input` object specifying the dataframe, axes, and chartType (do NOT emit matplotlib code).

You must decide the SINGLE next step to move the analysis forward.  Choose from:
  • create_block  – add a new block into the notebook
                    for python code use blockType "python"
                    for SQL queries use blockType "sql"
                    for plots or charts use blockType "visualizationV2" (return a structured `input` field with dataframeName, chartType, xAxis, and yAxes)
                    for narrative or insights use blockType "richText"
  • insight       – send a plain‑language insight to the user (no block)
  • done          – analysis is complete

If you create a block provide:
  blockType : one of "python", "sql", "visualizationV2", "richText"
  content   : string payload (python code, SQL text, or markdown for richText)
  input     : JSON object for visualizationV2 blocks with keys dataframeName, chartType, xAxis, yAxes, etc.

Return a JSON object with keys:
  event      – "action" or "done"
  action     – if event=="action", set to "create_block"
  blockType  – one of "python", "sql", "visualizationV2", or "richText"
  content    – string payload:
                  * python code for python blocks
                  * SQL text for sql blocks
                  * Vega-Lite JSON spec for visualization blocks
                  * Markdown text for richText blocks
  summary    – short english description (optional)

Do NOT wrap the JSON in markdown, return raw JSON only.
"""


def create_next_step_chain(llm):
    prompt = PromptTemplate(
        template=template,
        input_variables=["question", "why", "what", "context", "table_info"],
    )
    return prompt | llm | SimpleJsonOutputParser()
