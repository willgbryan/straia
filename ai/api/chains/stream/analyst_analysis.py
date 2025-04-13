from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import json

# Template for generating analysis results
template = """You are an expert data analyst who helps non-technical users get insights from their data.
Your job is to analyze data and provide clear, actionable insights based on the user's query.

DATABASE SCHEMA:
{database_schema}

USER QUERY: {question}
USER CONTEXT: {context}
USER GOAL: {goal}

USER CLARIFICATIONS:
{clarifications_json}

Based on the query and clarifications, provide a comprehensive analysis with:
1. A clear summary of the main findings (3-5 sentences)
2. 1-3 meaningful visualizations that illustrate key insights
3. A brief methodology note explaining how the analysis was conducted

Your response must be valid JSON that fits this schema:

```
{
  "summary": "A clear explanation of the main findings in 3-5 sentences",
  "visualizations": [
    {
      "type": "bar_chart", // Or "line_chart" or "pie_chart"
      "title": "Descriptive title for the visualization",
      "data": {
        "Category 1": 100, // Key-value pairs for the data points
        "Category 2": 75,
        // More data points...
      }
    },
    // More visualizations...
  ],
  "methodologyNote": "Brief explanation of methodology, data sources, and any caveats"
}
```

IMPORTANT NOTES:
- Visualizations should be meaningful and directly related to the query
- Each visualization should have a clear title
- Data in visualizations should be realistic based on the database schema
- Choose the most appropriate visualization type for the data
- Keep the number of data points reasonable (5-10 at most per chart)
- Your response must be ONLY the JSON, properly formatted

JSON RESPONSE:"""

def create_analyst_analysis_stream_chain(llm):
    """
    Creates a chain for generating analysis results for a clarified analyst query.
    
    Args:
        llm: The language model to use for generating analysis
        
    Returns:
        A chain that can generate analysis results
    """
    prompt = PromptTemplate(
        template=template,
        input_variables=["database_schema", "question", "context", "goal", "clarifications_json"]
    )
    
    chain = LLMChain(llm=llm, prompt=prompt)
    
    return chain 