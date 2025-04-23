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

Current notebook blocks (JSON list, most recent last):
Each block is an object with at least a 'type' field. For visualizations, you will see: {{ type, chartType, dataframe, xAxis, yAxes, title }}. For code, you will see: {{ type, firstLine }}.

Example notebook_blocks:
[
  {{"type": "visualizationV2", "chartType": "line", "dataframe": "sales_by_year", "xAxis": {{"field": "Year"}}, "yAxes": [{{"field": "Sales"}}], "title": "Sales by Year"}},
  {{"type": "python", "firstLine": "import pandas as pd"}}
]

IMPORTANT: Before using a dataframe or table in a visualization or analysis step, check if it is already present in notebook_blocks (look for a Python block that loads or creates the dataframe, or a visualization that uses it). If the dataframe is not present, first create a Python block to load the data (e.g., with pd.read_csv('filename.csv')). Only proceed to analysis or visualization after the data is loaded in the notebook.

IMPORTANT: Before proposing a new block, check notebook_blocks. Do NOT create a block (especially a visualization or code block) if a block with the same type and key properties (e.g., chartType, dataframe, axes, or content) already exists. Only create new blocks that add new value or move the analysis forward.

If a visualization with the same dataframe, chartType, xAxis, and yAxes already exists in notebook_blocks, do NOT create another one. Only create a new visualization if it is different in at least one of these properties.

Previous context (what has already happened):
{context}

Table information / available CSV files (if any):
{table_info}

IMPORTANT: For loading and preprocessing CSV files, prefer Python blocks (use blockType "python" with pandas, e.g. pd.read_csv). Use SQL blocks (blockType "sql") only when querying an existing database datasource.
For any plotting or charting tasks, never propose Python plotting code (e.g., matplotlib); always use blockType "visualizationV2" with a structured `input` object specifying the dataframe, axes, and chartType (do NOT emit matplotlib code).

IMPORTANT: Do not propose a chart or code block that already exists in the notebook. Build on what is already present.

You must decide the SINGLE next step to move the analysis forward.  Choose from:
  • create_block  – add a new block into the notebook
                    for python code use blockType "python"
                    for SQL queries use blockType "sql"
                    for plots or charts use blockType "visualizationV2" (return a structured `input` field with dataframeName, chartType, xAxis, yAxes, etc.)
  • insight       – send a plain‑language insight or narrative to the user (message bubble only, do NOT create a notebook block)
  • done          – analysis is complete

If you create a block provide:
  blockType : one of "python", "sql", "visualizationV2"
  content   : string payload (python code, SQL text, or Vega-Lite JSON spec for visualization blocks)
  input     : JSON object for visualizationV2 blocks with keys dataframeName, chartType, xAxis, yAxes, etc.

Return a JSON object with keys:
  event      – "action" or "done"
  action     – if event=="action", set to "create_block"
  blockType  – one of "python", "sql", "visualizationV2"
  content    – string payload:
                  * python code for python blocks
                  * SQL text for sql blocks
                  * Vega-Lite JSON spec for visualization blocks
  summary    – short english description (optional)

Do NOT wrap the JSON in markdown, return raw JSON only.
"""


def create_next_step_chain(llm):
    prompt = PromptTemplate(
        template=template,
        input_variables=["question", "why", "what", "notebook_blocks", "context", "table_info"],
    )
    return prompt | llm | SimpleJsonOutputParser()
