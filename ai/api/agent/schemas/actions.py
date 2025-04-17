"""
Schema definitions for agent actions.
"""
from typing import Dict, List, Optional, Union, TypedDict, Literal, Any


class ActionSpec(TypedDict, total=False):
    """
    Specification for an action to be executed by the agent.
    
    Attributes:
        type: The type of action to execute.
        content: The content of the action (e.g., SQL query, Python code, markdown).
        position: Where to insert the block (beginning, end, or after a specific blockId).
        blockId: The ID of an existing block (for actions like execute_block or update_block).
        metadata: Additional metadata for the action.
        waitForResult: Whether to wait for execution result before continuing.
        dataSource: For SQL queries, the ID of the data source to use.
        chartConfig: For visualizations, the configuration details.
        title: Optional title for markdown or visualization blocks.
        description: Optional description for blocks.
    """
    type: Literal[
        "sql_query", 
        "python_code", 
        "visualization", 
        "markdown", 
        "execute_block", 
        "update_block",
        "create_markdown",
        "run_code"
    ]
    content: str
    position: Optional[str]
    blockId: Optional[str]
    metadata: Optional[Dict[str, Any]]
    waitForResult: Optional[bool]
    dataSource: Optional[str]
    chartConfig: Optional[Dict[str, Any]]
    title: Optional[str]
    description: Optional[str] 