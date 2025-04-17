"""
Schema definitions for notebook context.
"""
from typing import Dict, List, Optional, Union, TypedDict, Any


class TableInfo(TypedDict):
    """
    Information about a database table.
    
    Attributes:
        name: The name of the table.
        schema: The schema the table belongs to.
        columns: List of column information with name, type, and description.
    """
    name: str
    schema: str
    columns: List[Dict[str, str]]


class BlockInfo(TypedDict, total=False):
    """
    Information about a notebook block.
    
    Attributes:
        id: The block ID.
        type: The type of block (sql, python, markdown, visualization).
        content: The content of the block.
        result: The execution result of the block, if available.
    """
    id: str
    type: str
    content: str
    result: Optional[Any]


class DataSourceInfo(TypedDict):
    """
    Information about a data source.
    
    Attributes:
        id: The data source ID.
        name: The name of the data source.
        type: The type of data source (e.g., postgres, bigquery).
        tables: List of tables in the data source.
    """
    id: str
    name: str
    type: str
    tables: List[TableInfo]


class NotebookContext(TypedDict, total=False):
    """
    Context information about a notebook.
    
    Attributes:
        documentId: The document ID.
        title: The title of the notebook.
        blocks: List of blocks in the notebook.
        dataSources: List of data sources available to the notebook.
        variables: Dictionary of Python variables and their values from previous executions.
    """
    documentId: str
    title: str
    blocks: List[BlockInfo]
    dataSources: List[DataSourceInfo]
    variables: Dict[str, Any] 