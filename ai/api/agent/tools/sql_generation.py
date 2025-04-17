"""
SQL query generation tool.

This module provides functions for generating SQL queries using LLM
based on user questions and database schema information.
"""
import json
from typing import Dict, List, Optional, Any
import logging

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from ...config import settings
from ..schemas.context import TableInfo

logger = logging.getLogger(__name__)


class SQLGenerator:
    """
    Generates SQL queries using LLM based on schema information and user questions.
    """
    
    def __init__(self, openai_client: Optional[OpenAI] = None):
        """
        Initialize the SQL generator with an OpenAI client.
        
        Args:
            openai_client: Optional OpenAI client. If not provided, a default client will be created.
        """
        self.llm = openai_client or OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_default_model_name
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def generate_query(
        self, 
        question: str, 
        tables: List[TableInfo], 
        dialect: str = "postgresql"
    ) -> Dict[str, str]:
        """
        Generate a SQL query based on user question and available tables.
        
        Args:
            question: The user's question or request.
            tables: List of available tables with schema information.
            dialect: SQL dialect to use (postgresql, mysql, etc.).
            
        Returns:
            Dictionary with query and explanation.
        """
        # Create a system prompt with table information
        system_prompt = self._create_sql_system_prompt(tables, dialect)
        
        # Create the user message
        user_message = f"Generate a SQL query to answer this question: {question}"
        
        # Call the API
        response = await self.llm.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            response_format={"type": "json_object"}
        )
        
        # Extract the response content
        content = response.choices[0].message.content
        
        try:
            # Parse the JSON response
            result = json.loads(content)
            
            # Ensure required fields are present
            if "query" not in result:
                result["query"] = "SELECT 'Error: No query generated' as error"
            
            if "explanation" not in result:
                result["explanation"] = "No explanation provided."
                
            return result
        except Exception as e:
            logger.error(f"Error parsing SQL generation response: {str(e)}")
            # Return a fallback response
            return {
                "query": "SELECT 'Error generating query' as error",
                "explanation": f"Failed to parse response: {str(e)}"
            }
    
    def _create_sql_system_prompt(self, tables: List[TableInfo], dialect: str) -> str:
        """
        Create a system prompt for SQL generation with table information.
        
        Args:
            tables: List of available tables with schema information.
            dialect: SQL dialect to use.
            
        Returns:
            System prompt string.
        """
        tables_info = "\n\n".join([
            f"Table: {table['name']} (schema: {table['schema']})\n" +
            "Columns:\n" +
            "\n".join([f"- {col['name']}: {col['type']}" + 
                     (f" - {col['description']}" if col['description'] else "") 
                     for col in table['columns']])
            for table in tables
        ])
        
        return f"""You are a SQL expert that generates SQL queries to answer user questions.

You have access to the following tables:

{tables_info}

Please generate a SQL query in {dialect} dialect that answers the user's question. Follow these guidelines:

1. Use only the tables and columns provided above
2. Include appropriate joins when needed
3. Use proper filtering, grouping, and ordering
4. Use clear column aliases for readability
5. Provide explanatory comments for complex parts
6. Keep performance in mind (avoid unnecessary joins, use indexes)

Return your response as a JSON object with the following format:
{{
  "query": "The SQL query to execute",
  "explanation": "A brief explanation of what the query does and why it's appropriate for the question"
}}
"""


# Singleton instance for reuse
_sql_generator = None


def get_sql_generator() -> SQLGenerator:
    """
    Get (or create) a shared SQL generator instance.
    
    Returns:
        Shared SQLGenerator instance
    """
    global _sql_generator
    if _sql_generator is None:
        _sql_generator = SQLGenerator()
    return _sql_generator


async def generate_sql_query(
    question: str, 
    tables: List[TableInfo], 
    dialect: str = "postgresql"
) -> Dict[str, str]:
    """
    Convenience function to generate a SQL query.
    
    Args:
        question: The user's question.
        tables: Available tables with schema.
        dialect: SQL dialect to use.
        
    Returns:
        Dictionary with query and explanation.
    """
    generator = get_sql_generator()
    return await generator.generate_query(question, tables, dialect) 