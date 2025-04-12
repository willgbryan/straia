from typing import Dict, List, Any, AsyncIterator
from langchain.schema.runnable import RunnableMap, RunnablePassthrough
from langchain.prompts import ChatPromptTemplate
from langchain.schema import StrOutputParser
from langchain.schema.document import Document
from langchain.schema.runnable import RunnableConfig
from langchain.schema.language_model import BaseLanguageModel
import json

ANALYZE_QUERY_SYSTEM_PROMPT = """You are an expert educational data analyst. You are helping a university administrator understand their student data.

Your task is to analyze a question about educational data and identify any ambiguous terms that need clarification before an accurate answer can be provided.

Specifically, look for ambiguity in the following areas:
1. "at-risk" - Different meanings of student risk (GPA, engagement, retention)
2. "first-gen" - Different definitions of first-generation students
3. "commuter" - Different ways to define commuters (residence type, distance)
4. "this semester" or time references - Which specific term or academic period

For each ambiguous term you find, explain why it's ambiguous and what clarification options should be presented to the user.

Return your response as a JSON object with these keys:
- "ambiguousTerms": Array of objects with "term", "reason" and "options" keys
- "analysisRequired": Boolean indicating if query can be directly answered or needs data analysis
- "dataSourcesNeeded": Array of data source types likely needed (e.g. "student_records", "enrollment", "grades")

IMPORTANT: If terms are already clearly defined or no ambiguity exists, return an empty array for ambiguousTerms.
"""

ANALYZE_QUERY_USER_PROMPT = """User Question: {query}

User's Motivation: {motivation}

User's Problem: {problem}

Based on this information, analyze the query for ambiguous terms and provide your response in the requested JSON format.
"""

GENERATE_INSIGHTS_SYSTEM_PROMPT = """You are an expert educational data analyst. You are helping a university administrator understand their student data.

The user has asked a question about educational data and has clarified any ambiguous terms. Your task is to generate insights based on the query and clarifications.

Based on the query and clarifications, provide:
1. A summary insight that directly answers the user's question
2. Relevant visualizations that would help illustrate the answer
3. Explanations of how data was analyzed and interpreted
4. Potential follow-up questions the user might want to ask

Return your response as a JSON object with these keys:
- "summary": A concise summary of the insights (1-3 paragraphs)
- "visualizations": Array of objects describing visualizations with "type", "title", and "data" keys
- "explanations": Array of strings explaining the methodology
- "followupQuestions": Array of strings with potential follow-up questions

IMPORTANT: The insights should be directly relevant to the user's stated problem and motivation.
"""

GENERATE_INSIGHTS_USER_PROMPT = """User Question: {query}

User's Motivation: {motivation}

User's Problem: {problem}

Clarified Terms:
{clarified_terms}

Based on this information, generate insights in the requested JSON format.
"""

EDUCATIONAL_CONTENT_SYSTEM_PROMPT = """You are an educational data expert. You are providing detailed information about educational data concepts and methodologies.

Your task is to create educational content about a specific educational data topic. This content will be used to help users understand key concepts related to student data analysis.

For the requested topic, provide:
1. A comprehensive explanation of the concept
2. Key definitions and variations in how the concept is used
3. Best practices related to the concept
4. Practical examples that illustrate the concept in action

Format your response as a JSON object with these keys:
- "title": A clear title for the educational content
- "content": A structured explanation with sections (use markdown formatting)
- "definitions": Object with key terms and their definitions
- "resources": Array of objects with "title" and "description" for further reading

IMPORTANT: The content should be educational, accurate, and written at a level appropriate for educational administrators who may not have data science expertise.
"""

EDUCATIONAL_CONTENT_USER_PROMPT = """Please provide educational content about: {topic}

The user is an educational administrator who wants to understand this concept better.

Return the educational content in the requested JSON format.
"""

def create_analyze_query_stream_chain(llm: BaseLanguageModel):
    """Creates a chain for analyzing a query to identify ambiguous terms."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", ANALYZE_QUERY_SYSTEM_PROMPT),
        ("human", ANALYZE_QUERY_USER_PROMPT),
    ])
    
    chain = (
        RunnableMap({
            "query": lambda x: x["query"],
            "motivation": lambda x: x["motivation"],
            "problem": lambda x: x["problem"],
        })
        | prompt
        | llm
        | StrOutputParser()
    )
    
    async def stream_result(
        input_dict: Dict[str, Any], config: RunnableConfig = None
    ) -> AsyncIterator[Dict[str, Any]]:
        buffer = ""
        async for chunk in chain.astream(input_dict, config=config):
            buffer += chunk
            try:
                # Try to parse as JSON
                result = json.loads(buffer)
                yield {"ambiguities": result}
                buffer = ""
            except json.JSONDecodeError:
                # If we can't parse as JSON yet, continue buffering
                pass
                
        # If there's any remaining buffer, try to parse it
        if buffer:
            try:
                result = json.loads(buffer)
                yield {"ambiguities": result}
            except json.JSONDecodeError:
                # If we still can't parse, return an error
                yield {"error": "Failed to parse response as JSON"}
    
    return stream_result

def create_generate_insights_stream_chain(llm: BaseLanguageModel):
    """Creates a chain for generating insights based on a clarified query."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", GENERATE_INSIGHTS_SYSTEM_PROMPT),
        ("human", GENERATE_INSIGHTS_USER_PROMPT),
    ])
    
    clarified_terms_formatter = lambda x: "\n".join([f"- {term}: {value}" for term, value in x["clarified_terms"].items()])
    
    chain = (
        RunnableMap({
            "query": lambda x: x["query"],
            "motivation": lambda x: x["motivation"],
            "problem": lambda x: x["problem"],
            "clarified_terms": clarified_terms_formatter,
        })
        | prompt
        | llm
        | StrOutputParser()
    )
    
    async def stream_result(
        input_dict: Dict[str, Any], config: RunnableConfig = None
    ) -> AsyncIterator[Dict[str, Any]]:
        buffer = ""
        async for chunk in chain.astream(input_dict, config=config):
            buffer += chunk
            try:
                # Try to parse as JSON
                result = json.loads(buffer)
                yield {"insights": result}
                buffer = ""
            except json.JSONDecodeError:
                # If we can't parse as JSON yet, continue buffering
                pass
                
        # If there's any remaining buffer, try to parse it
        if buffer:
            try:
                result = json.loads(buffer)
                yield {"insights": result}
            except json.JSONDecodeError:
                # If we still can't parse, return an error
                yield {"error": "Failed to parse response as JSON"}
    
    return stream_result

def create_educational_content_stream_chain(llm: BaseLanguageModel):
    """Creates a chain for generating educational content about data concepts."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", EDUCATIONAL_CONTENT_SYSTEM_PROMPT),
        ("human", EDUCATIONAL_CONTENT_USER_PROMPT),
    ])
    
    chain = (
        {"topic": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )
    
    async def stream_result(
        input_dict: Dict[str, Any], config: RunnableConfig = None
    ) -> AsyncIterator[Dict[str, Any]]:
        buffer = ""
        async for chunk in chain.astream(input_dict["topic"], config=config):
            buffer += chunk
            try:
                # Try to parse as JSON
                result = json.loads(buffer)
                yield {"content": result}
                buffer = ""
            except json.JSONDecodeError:
                # If we can't parse as JSON yet, continue buffering
                pass
                
        # If there's any remaining buffer, try to parse it
        if buffer:
            try:
                result = json.loads(buffer)
                yield {"content": result}
            except json.JSONDecodeError:
                # If we still can't parse, return an error
                yield {"error": "Failed to parse response as JSON"}
    
    return stream_result 