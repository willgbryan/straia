"""
Context pruning utilities for the agent.

This module provides functionality for selecting and prioritizing the most relevant
parts of a notebook context to fit within token limits.
"""
import logging
import re
from typing import Dict, List, Any, Optional, Set, Tuple, Union
import tiktoken

from .schemas.context import NotebookContext, BlockInfo, DataSourceInfo, TableInfo

# Configure logging
logger = logging.getLogger(__name__)

# Default token limits
DEFAULT_TOTAL_TOKEN_LIMIT = 6000
DEFAULT_TABLE_INFO_TOKEN_LIMIT = 1000
DEFAULT_BLOCKS_TOKEN_LIMIT = 4000
DEFAULT_SYSTEM_PROMPT_TOKEN_LIMIT = 1000

# Token estimator
def count_tokens(text: str, model: str = "gpt-4o") -> int:
    """Count the number of tokens in a text string."""
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except Exception as e:
        logger.warning(f"Error counting tokens, using character-based estimate: {e}")
        # Fallback: roughly estimate 4 characters per token
        return len(text) // 4


class ContextPruner:
    """
    Prunes and prioritizes notebook context to fit within token limits.
    
    This class analyzes notebook context, assigns relevance scores to different
    parts, and selects the most relevant content to fit within token limits.
    """
    
    def __init__(
        self,
        total_token_limit: int = DEFAULT_TOTAL_TOKEN_LIMIT,
        table_info_token_limit: int = DEFAULT_TABLE_INFO_TOKEN_LIMIT,
        blocks_token_limit: int = DEFAULT_BLOCKS_TOKEN_LIMIT,
        model: str = "gpt-4o"
    ):
        """
        Initialize the context pruner.
        
        Args:
            total_token_limit: Maximum total tokens for the entire context
            table_info_token_limit: Maximum tokens for table information
            blocks_token_limit: Maximum tokens for notebook blocks
            model: The model to use for token counting
        """
        self.total_token_limit = total_token_limit
        self.table_info_token_limit = table_info_token_limit
        self.blocks_token_limit = blocks_token_limit
        self.model = model
    
    def prune_context(
        self, 
        context: NotebookContext, 
        question: str,
        previous_messages: Optional[List[Dict[str, str]]] = None
    ) -> NotebookContext:
        """
        Prune notebook context to fit within token limits.
        
        Args:
            context: The full notebook context
            question: The user's question
            previous_messages: List of previous conversation messages
            
        Returns:
            Pruned notebook context with the most relevant information
        """
        logger.info("Pruning notebook context to fit within token limits")
        
        # Create a copy of the context to avoid modifying the original
        pruned_context = {
            "documentId": context.get("documentId", ""),
            "title": context.get("title", ""),
            "blocks": [],
            "dataSources": []
        }
        
        # Track token usage
        tokens_used = 0
        
        # Calculate tokens needed for previous messages
        messages_tokens = 0
        if previous_messages:
            messages_text = "\n".join([msg.get("content", "") for msg in previous_messages])
            messages_tokens = count_tokens(messages_text, self.model)
            tokens_used += messages_tokens
        
        logger.debug(f"Tokens used by previous messages: {messages_tokens}")
        
        # First, prioritize and select data sources and tables
        table_tokens, selected_data_sources = self._select_relevant_data_sources(
            context.get("dataSources", []),
            question,
            self.table_info_token_limit
        )
        tokens_used += table_tokens
        pruned_context["dataSources"] = selected_data_sources
        
        logger.debug(f"Tokens used by data sources: {table_tokens}")
        
        # Calculate remaining tokens for blocks
        remaining_block_tokens = max(0, self.total_token_limit - tokens_used)
        available_block_tokens = min(remaining_block_tokens, self.blocks_token_limit)
        
        # Then, prioritize and select notebook blocks
        block_tokens, selected_blocks = self._select_relevant_blocks(
            context.get("blocks", []),
            question,
            available_block_tokens
        )
        tokens_used += block_tokens
        pruned_context["blocks"] = selected_blocks
        
        logger.debug(f"Tokens used by blocks: {block_tokens}")
        logger.debug(f"Total tokens used: {tokens_used}")
        
        # Include variables if they don't exceed the token limit
        if "variables" in context:
            # Convert variables to string representation
            variables_str = str(context["variables"])
            var_tokens = count_tokens(variables_str, self.model)
            
            # Check if we can include the variables
            if tokens_used + var_tokens <= self.total_token_limit:
                pruned_context["variables"] = context["variables"]
                tokens_used += var_tokens
                logger.debug(f"Tokens used by variables: {var_tokens}")
            else:
                logger.debug("Skipping variables due to token limits")
        
        logger.info(f"Context pruning complete. Total tokens: {tokens_used}/{self.total_token_limit}")
        return pruned_context
    
    def _select_relevant_data_sources(
        self,
        data_sources: List[DataSourceInfo],
        question: str,
        token_limit: int
    ) -> Tuple[int, List[DataSourceInfo]]:
        """
        Select the most relevant data sources and tables.
        
        Args:
            data_sources: List of data sources with tables
            question: The user's question
            token_limit: Maximum tokens for data source information
            
        Returns:
            Tuple of (tokens_used, selected_data_sources)
        """
        if not data_sources:
            return 0, []
        
        # Extract key terms from the question
        question_terms = self._extract_key_terms(question.lower())
        
        # Score each table based on relevance to the question
        scored_tables: List[Tuple[float, DataSourceInfo, TableInfo]] = []
        
        for ds in data_sources:
            for table in ds.get("tables", []):
                score = self._score_table_relevance(table, question_terms)
                scored_tables.append((score, ds, table))
        
        # Sort tables by relevance score (highest first)
        scored_tables.sort(reverse=True, key=lambda x: x[0])
        
        # Select tables until we hit the token limit
        selected_data_sources: Dict[str, DataSourceInfo] = {}
        tokens_used = 0
        
        for score, ds, table in scored_tables:
            # Create text representation of this table info
            table_text = f"Table: {table['name']} (schema: {table['schema']})\nColumns:\n"
            for col in table.get('columns', []):
                col_desc = col.get('description', '')
                table_text += f"- {col['name']}: {col['type']}"
                if col_desc:
                    table_text += f" - {col_desc}"
                table_text += "\n"
            
            # Count tokens
            table_tokens = count_tokens(table_text, self.model)
            
            # Check if adding this table would exceed the limit
            if tokens_used + table_tokens > token_limit:
                # Skip this table if it would exceed the limit
                continue
            
            # Add this table to the selected data sources
            if ds["id"] not in selected_data_sources:
                # Create a new data source entry with just this table
                selected_data_sources[ds["id"]] = {
                    "id": ds["id"],
                    "name": ds["name"],
                    "type": ds.get("type", "unknown"),
                    "tables": [table]
                }
            else:
                # Add this table to an existing data source
                selected_data_sources[ds["id"]]["tables"].append(table)
            
            tokens_used += table_tokens
        
        # Convert from dict to list
        return tokens_used, list(selected_data_sources.values())
    
    def _select_relevant_blocks(
        self,
        blocks: List[BlockInfo],
        question: str,
        token_limit: int
    ) -> Tuple[int, List[BlockInfo]]:
        """
        Select the most relevant notebook blocks.
        
        Args:
            blocks: List of notebook blocks
            question: The user's question
            token_limit: Maximum tokens for blocks
            
        Returns:
            Tuple of (tokens_used, selected_blocks)
        """
        if not blocks:
            return 0, []
        
        # Extract key terms from the question
        question_terms = self._extract_key_terms(question.lower())
        
        # Score each block based on relevance
        scored_blocks: List[Tuple[float, BlockInfo]] = []
        
        for block in blocks:
            score = self._score_block_relevance(block, question_terms)
            scored_blocks.append((score, block))
        
        # Sort blocks by relevance score (highest first)
        scored_blocks.sort(reverse=True, key=lambda x: x[0])
        
        # Select blocks until we hit the token limit
        selected_blocks = []
        tokens_used = 0
        
        for score, block in scored_blocks:
            # Create text representation of this block
            block_text = f"Block ({block.get('type', 'unknown')}):\n{block.get('content', '')}\n"
            if "result" in block:
                # Include a truncated version of the result
                result_str = str(block["result"])
                if len(result_str) > 500:
                    result_str = result_str[:500] + "..."
                block_text += f"Result: {result_str}\n"
            
            # Count tokens
            block_tokens = count_tokens(block_text, self.model)
            
            # Check if adding this block would exceed the limit
            if tokens_used + block_tokens > token_limit:
                # Skip this block if it would exceed the limit
                continue
            
            # Add this block to the selected blocks
            selected_blocks.append(block)
            tokens_used += block_tokens
        
        return tokens_used, selected_blocks
    
    def _extract_key_terms(self, text: str) -> Set[str]:
        """Extract key terms from text."""
        # Remove common stop words and punctuation
        stop_words = {
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "with", "by", "about", "like", "through", "over", "before", "after",
            "between", "under", "above", "of", "from", "up", "down", "into", "during",
            "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
            "do", "does", "did", "can", "could", "will", "would", "should", "may",
            "might", "must", "that", "this", "these", "those", "there", "here",
            "where", "when", "why", "how", "all", "any", "both", "each", "few",
            "more", "most", "other", "some", "such", "no", "nor", "not", "only",
            "own", "same", "so", "than", "too", "very", "just", "i", "me", "my",
            "myself", "we", "our", "ours", "ourselves", "you", "your", "yours",
            "yourself", "yourselves", "he", "him", "his", "himself", "she", "her",
            "hers", "herself", "it", "its", "itself", "they", "them", "their",
            "theirs", "themselves", "what", "which", "who", "whom", "whose"
        }
        
        # Normalize text
        text = text.lower()
        
        # Extract words
        words = re.findall(r'\b\w+\b', text)
        
        # Remove stop words and keep unique terms
        key_terms = {word for word in words if word not in stop_words and len(word) > 2}
        
        # Also extract quoted phrases
        quoted_phrases = re.findall(r'"([^"]*)"', text)
        for phrase in quoted_phrases:
            if phrase:
                key_terms.add(phrase.lower())
        
        return key_terms
    
    def _score_table_relevance(self, table: TableInfo, question_terms: Set[str]) -> float:
        """
        Score a table's relevance to the question.
        
        Args:
            table: Table information
            question_terms: Set of key terms from the question
            
        Returns:
            Relevance score (higher is more relevant)
        """
        score = 0.0
        
        # Check table name
        table_name = table.get("name", "").lower()
        for term in question_terms:
            if term in table_name:
                score += 5.0  # High score for table name match
        
        # Check table schema
        schema_name = table.get("schema", "").lower()
        for term in question_terms:
            if term in schema_name:
                score += 1.0
        
        # Check column names and descriptions
        for column in table.get("columns", []):
            col_name = column.get("name", "").lower()
            col_desc = column.get("description", "").lower()
            
            for term in question_terms:
                if term in col_name:
                    score += 3.0  # Good score for column name match
                if term in col_desc:
                    score += 1.0  # Some score for description match
        
        return score
    
    def _score_block_relevance(self, block: BlockInfo, question_terms: Set[str]) -> float:
        """
        Score a block's relevance to the question.
        
        Args:
            block: Block information
            question_terms: Set of key terms from the question
            
        Returns:
            Relevance score (higher is more relevant)
        """
        # Base score
        score = 0.0
        
        # Get block type
        block_type = block.get("type", "unknown").lower()
        
        # Get block content
        content = block.get("content", "").lower()
        
        # Check for term matches
        for term in question_terms:
            if term in content:
                score += 1.0
        
        # Adjust score based on block type
        type_multipliers = {
            "sql": 1.5,       # SQL queries are highly relevant for data questions
            "python": 1.3,    # Python code is also quite relevant
            "markdown": 0.7,  # Markdown is less relevant for most queries
            "visualization": 1.2,  # Visualizations are relevant for data analysis
        }
        
        # Apply type multiplier
        multiplier = type_multipliers.get(block_type, 1.0)
        score *= multiplier
        
        # Boost score if block has a result (it was executed)
        if "result" in block:
            score *= 1.5
        
        # Special case: boost SQL blocks that mention tables in the question
        if block_type == "sql":
            # Extract table names from SQL
            sql_tables = self._extract_tables_from_sql(content)
            
            # Check if any table name appears in the question
            for table in sql_tables:
                if table in " ".join(question_terms):
                    score *= 2.0  # Double score for SQL with relevant tables
                    break
        
        return score
    
    def _extract_tables_from_sql(self, sql: str) -> Set[str]:
        """Extract table names from SQL query."""
        # Simple regex to find tables in FROM and JOIN clauses
        from_tables = re.findall(r'from\s+([a-zA-Z0-9_\.]+)', sql)
        join_tables = re.findall(r'join\s+([a-zA-Z0-9_\.]+)', sql)
        
        tables = set()
        for table in from_tables + join_tables:
            # Strip schema prefixes if present
            if '.' in table:
                schema, table_name = table.split('.', 1)
                tables.add(table_name.lower())
            else:
                tables.add(table.lower())
        
        return tables


def prune_context(
    context: NotebookContext,
    question: str,
    previous_messages: Optional[List[Dict[str, str]]] = None,
    total_token_limit: int = DEFAULT_TOTAL_TOKEN_LIMIT
) -> NotebookContext:
    # Bypass pruning: just return the full context
    return context


def prune_context(
    context: NotebookContext,
    question: str,
    previous_messages: Optional[List[Dict[str, str]]] = None,
    total_token_limit: int = DEFAULT_TOTAL_TOKEN_LIMIT
) -> NotebookContext:
    """
    Prune notebook context to fit within token limits.
    
    Args:
        context: The full notebook context
        question: The user's question
        previous_messages: List of previous conversation messages
        total_token_limit: Maximum total tokens for the entire context
        
    Returns:
        Pruned notebook context with the most relevant information
    """
    pruner = ContextPruner(total_token_limit=total_token_limit)
    return pruner.prune_context(context, question, previous_messages) 