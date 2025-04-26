"""Prompt & chain that asks the LLM for the *next single* agent step.

This replaces the earlier multi‑event planner so that we can iterate:
  clarifications -> plan 1 action -> execute -> observe -> plan next …
"""

from langchain.prompts import PromptTemplate
from langchain.output_parsers.json import SimpleJsonOutputParser


template = """
You are an expert analytics assistant working inside an interactive notebook.

VISUALIZATIONV2 RULES:
- dataframeName must match an existing Python variable.
- For chartType 'line' or 'area': xAxis must be a time or numeric column.
- For chartType 'bar', 'groupedColumn', 'stackedColumn': xAxis must be a categorical (non-numeric) column and different from any Y-series column.
- Always populate xAxis.field, yAxes[].series[].column, and aggregateFunction.
- Never choose the same column for both axes.

User question: {question}
Why: {why}
What: {what}

Current notebook blocks (JSON list, most recent last):
{notebook_blocks}
Each block is an object with at least a 'type' field. For visualizations, you will see: {{ type, chartType, dataframe, xAxis, yAxes, title }}. For code, you will see: {{ type, firstLine }}.

IMPORTANT: For code (python/sql) blocks, you may also see an 'output' object with structured information:
  - columns: array of column names (e.g., ["Year", "Global_Sales"])
  - rows: up to 3 sample rows (array of objects)
  - variable: the DataFrame variable name if assigned (e.g., 'sales_by_year')
Use this output to inform your next step—especially when planning visualizations or further analysis. For example, if a previous block outputs a DataFrame with columns ['Year', 'Global_Sales'], you can use those columns for chart axes or further calculations. Always use the actual columns and variable names from previous blocks when planning the next step.

Example notebook_blocks:
[
  {{"type": "visualizationV2", "chartType": "line", "dataframe": "sales_by_year", "xAxis": {{"field": "Year"}}, "yAxes": [{{"field": "Sales"}}], "title": "Sales by Year"}},
  {{"type": "python", "firstLine": "sales_by_year = last_5_years_df.groupby('Year')['Global_Sales'].sum().reset_index()", "output": {{"columns": ["Year", "Global_Sales"], "rows": [{{"Year": 2016, "Global_Sales": 49.76}}, {{"Year": 2017, "Global_Sales": 0.04}}], "variable": "sales_by_year"}}}}
]

IMPORTANT: Before using a dataframe or table in a visualization or analysis step, check if it is already present in notebook_blocks (look for a Python block that loads or creates the dataframe, or a visualization that uses it). If the dataframe is not present, first create a Python block to load or create the data (e.g., with pd.read_csv('filename.csv')). Only proceed to analysis or visualization after the data is loaded in the notebook.

IMPORTANT: When planning a visualization, always use the actual columns and variable names from the most recent relevant python/sql block's output. For example, if you want to plot a line chart of sales by year, use the variable and columns from the latest block that created or loaded that data.

IMPORTANT: Before proposing a new block, check notebook_blocks. Do NOT create a block (especially a visualization or code block) if a block with the same type and key properties (e.g., chartType, dataframe, axes, or content) already exists. Only create new blocks that add new value or move the analysis forward.

IMPORTANT: When creating a grouped, stacked, bar, or column chart (e.g., groupedColumn, stackedColumn, bar), the xAxis must be a categorical column (such as 'Genre', 'Platform', or another string/object type column), and the yAxis must be a numeric column (such as 'Global_Sales', 'Sales', or any column with numeric values). Never use a numeric column as the xAxis for these chart types. Never use the same column for both xAxis and yAxis. Never output xAxis: undefined. Always select valid, distinct columns for x and y axes based on the DataFrame's columns.

If a visualization with the same dataframe, chartType, xAxis, and yAxes already exists in notebook_blocks, do NOT create another one. Only create a new visualization if it is different in at least one of these properties.

Previous context (what has already happened):
{context}

Table information / available CSV files (if any):
{table_info}

Derived dataframe schemas (variables and columns):
{data_schema}

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

# --- UPDATE: For insight events ---
If you choose event: "insight", your JSON output SHOULD include:
  - summary: a short, plain-language summary of the insight (required)
  - reasoning: (optional) a detailed explanation of how you arrived at the insight, or your thought process
  - sql: (optional) the SQL query (if relevant to the insight)
  - chart: (optional) a chart spec or description (if relevant)

Example:
{{
  "event": "insight",
  "summary": "Sales increased 20% year-over-year.",
  "reasoning": "I compared the total sales for each year and found a 20% increase from 2021 to 2022.",
  "sql": "SELECT year, SUM(sales) FROM ... GROUP BY year",
  "chart": {{"type": "bar", "data": ...}}
}}

Return a JSON object with keys:
  event      – "action", "insight", or "done"
  action     – if event=="action", set to "create_block"
  blockType  – one of "python", "sql", "visualizationV2"
  content    – string payload:
                  * python code for python blocks
                  * SQL text for sql blocks
                  * Vega-Lite JSON spec for visualization blocks
  summary    – short english description (optional)
  reasoning  – (optional) detailed explanation for insight events
  sql        – (optional) SQL query for insight events
  chart      – (optional) chart spec for insight events

Do NOT wrap the JSON in markdown, return raw JSON only.
"""


def create_next_step_chain(llm):
    prompt = PromptTemplate(
        template=template,
        input_variables=[
            "question", "why", "what", "notebook_blocks", "context", "table_info", "data_schema"
        ],
    )
    def log_and_run(inputs):
        print(f"[agent_debug][prompt_input] agent_next_step prompt input: {inputs}")
        result = (prompt | llm | SimpleJsonOutputParser()).invoke(inputs)
        print(f"[agent_debug][prompt_output] agent_next_step LLM output: {result}")
        return result
    return log_and_run
