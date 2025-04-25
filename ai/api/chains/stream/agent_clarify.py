from langchain.prompts import PromptTemplate
from langchain.output_parsers.json import SimpleJsonOutputParser

# Prompt template for clarification questions
# Updated: Always ask for 'why' and 'what' if missing or unclear, and use data_schema for context-aware clarifications

template = """
You are an expert analytics assistant helping a user clarify their intent before starting an analysis.

User's initial question: {question}

If available, here is additional context:
Why: {why}
What: {what}
Data schema (JSON): {data_schema}

Your job is to:
- Identify any ambiguous terms, missing context, or unclear goals in the user's question.
- For each, generate a clear, specific clarification question.
- If "why" (motivation) or "what" (goal) are missing or unclear, ask for them as clarifications.
- Use the data schema to make your clarifications as specific and relevant as possible (e.g., reference available files, tables, or columns).
- For ambiguous terms, provide multiple-choice options with short tooltips or explanations (see examples below).
- For each clarification, include:
    - term: the ambiguous term or missing context
    - question: the clarification question to ask the user
    - options: (optional) a list of options, each with a label and a tooltip/teaching moment
- If a term is best clarified with free text, do not include options.

Example Output:
{{
  "clarifications": [
    {{
      "term": "at risk",
      "question": "When you say 'at risk,' what outcome are you concerned about?",
      "options": [
        {{ "label": "GPA Risk", "tooltip": "Flag students with GPAs below a defined threshold. This helps assess academic performance concerns." }},
        {{ "label": "Engagement Risk", "tooltip": "Looks at LMS activity, advisor check-ins, or missed deadlines. Great for identifying students slipping through the cracks." }},
        {{ "label": "Retention Risk", "tooltip": "Predicts likelihood of student departure based on multi-factor indicators." }},
        {{ "label": "Other", "tooltip": "Something else (please specify in your own words)." }}
      ]
    }},
    {{
      "term": "why",
      "question": "Why are you asking this question? (What's driving your interest?)"
    }},
    {{
      "term": "what",
      "question": "What are you ultimately trying to solve or accomplish?"
    }}
  ]
}}

Instructions:
- Return a JSON object with a "clarifications" array as shown above.
- Do not wrap the JSON in markdown.
- Only ask for "why" or "what" if they are missing or unclear.
- Use the data schema to make your clarifications as specific and relevant as possible.
"""

def create_clarification_stream_query_chain(llm):
    """
    Create a streaming chain that returns JSON with clarification questions.
    """
    prompt = PromptTemplate(
        template=template,
        input_variables=["question", "why", "what", "data_schema"],
    )
    # Build stream chain: prompt -> llm -> json parser
    return prompt | llm | SimpleJsonOutputParser()