"""
Context collection utilities for the agent.

This module handles collecting and preparing context from various sources:
1. Notebook blocks and structure
2. Data source schemas and tables
3. Execution results
4. Variable state
"""
import json
import logging
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from ..config import settings
from .schemas.context import NotebookContext, BlockInfo, DataSourceInfo, TableInfo

logger = logging.getLogger(__name__)


class ContextCollector:
    """
    Responsible for collecting context about the notebook and data sources.
    
    This class handles:
    - Fetching notebook blocks and structure
    - Getting data source schema information
    - Retrieving execution results and variables
    - Formatting everything into the NotebookContext structure
    """
    
    def __init__(self, api_url: str = None, auth: Dict[str, str] = None):
        """
        Initialize the context collector with API connection details.
        
        Args:
            api_url: URL for the Node.js API server
            auth: Authentication details (usually username/password for basic auth)
        """
        self.api_url = api_url or settings.node_api_url
        self.auth = auth or {
            "username": settings.node_api_username,
            "password": settings.node_api_password
        }
        self.client = httpx.AsyncClient(auth=(self.auth["username"], self.auth["password"]))
    
    async def collect_notebook_context(self, document_id: str) -> NotebookContext:
        """
        Collect all context for a notebook.
        
        Args:
            document_id: ID of the document/notebook
            
        Returns:
            Comprehensive context about the notebook
        """
        try:
            # Get basic document info
            document_info = await self._get_document_info(document_id)
            
            # Get blocks in the document
            blocks = await self._get_document_blocks(document_id)
            
            # Get available data sources for the workspace
            workspace_id = document_info.get("workspaceId")
            data_sources = await self._get_workspace_data_sources(workspace_id) if workspace_id else []
            
            # Get execution variables if available
            variables = await self._get_execution_variables(document_id)
            
            # Assemble the context
            context: NotebookContext = {
                "documentId": document_id,
                "title": document_info.get("title", "Untitled Notebook"),
                "blocks": blocks,
                "dataSources": data_sources,
            }
            
            # Add variables if available
            if variables:
                context["variables"] = variables
                
            return context
        
        except Exception as e:
            logger.error(f"Error collecting notebook context: {str(e)}")
            # Return minimal context on error
            return {
                "documentId": document_id,
                "title": "Error fetching notebook context",
                "blocks": [],
                "dataSources": []
            }
    
    async def _get_document_info(self, document_id: str) -> Dict[str, Any]:
        """
        Get basic information about a document.
        
        Args:
            document_id: ID of the document
            
        Returns:
            Document information including title, workspace ID, etc.
        """
        try:
            response = await self.client.get(f"{self.api_url}/v1/documents/{document_id}")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching document info: {str(e)}")
            return {"id": document_id}
    
    async def _get_document_blocks(self, document_id: str) -> List[BlockInfo]:
        """
        Get all blocks in a document with their content and execution results.
        
        Args:
            document_id: ID of the document
            
        Returns:
            List of blocks with content and results
        """
        try:
            response = await self.client.get(f"{self.api_url}/v1/documents/{document_id}/blocks")
            response.raise_for_status()
            blocks_data = response.json()
            
            # Transform to our schema format
            blocks: List[BlockInfo] = []
            for block in blocks_data:
                block_info: BlockInfo = {
                    "id": block.get("id", ""),
                    "type": block.get("type", "unknown"),
                    "content": block.get("content", "")
                }
                
                # Add execution result if available
                if "result" in block:
                    block_info["result"] = block["result"]
                
                blocks.append(block_info)
            
            return blocks
        except Exception as e:
            logger.error(f"Error fetching document blocks: {str(e)}")
            return []
    
    async def _get_workspace_data_sources(self, workspace_id: str) -> List[DataSourceInfo]:
        """
        Get all data sources available in a workspace.
        
        Args:
            workspace_id: ID of the workspace
            
        Returns:
            List of data sources with tables and schema information
        """
        try:
            response = await self.client.get(f"{self.api_url}/v1/workspaces/{workspace_id}/datasources")
            response.raise_for_status()
            datasources_data = response.json()
            
            datasources: List[DataSourceInfo] = []
            for ds in datasources_data:
                # Get tables for this data source
                tables = await self._get_datasource_tables(ds["id"])
                
                datasource: DataSourceInfo = {
                    "id": ds["id"],
                    "name": ds["name"],
                    "type": ds.get("type", "unknown"),
                    "tables": tables
                }
                datasources.append(datasource)
            
            return datasources
        except Exception as e:
            logger.error(f"Error fetching workspace data sources: {str(e)}")
            return []
    
    async def _get_datasource_tables(self, datasource_id: str) -> List[TableInfo]:
        """
        Get table information for a specific data source.
        
        Args:
            datasource_id: ID of the data source
            
        Returns:
            List of tables with schema information
        """
        try:
            response = await self.client.get(f"{self.api_url}/v1/datasources/{datasource_id}/schema")
            response.raise_for_status()
            schema_data = response.json()
            
            tables: List[TableInfo] = []
            for table in schema_data.get("tables", []):
                table_info: TableInfo = {
                    "name": table["name"],
                    "schema": table.get("schema", "public"),
                    "columns": [
                        {
                            "name": col["name"],
                            "type": col["type"],
                            "description": col.get("description", "")
                        }
                        for col in table.get("columns", [])
                    ]
                }
                tables.append(table_info)
            
            return tables
        except Exception as e:
            logger.error(f"Error fetching data source tables: {str(e)}")
            return []
    
    async def _get_execution_variables(self, document_id: str) -> Optional[Dict[str, Any]]:
        """
        Get execution variables for a document, if available.
        
        Args:
            document_id: ID of the document
            
        Returns:
            Dictionary of variable names and values
        """
        try:
            response = await self.client.get(f"{self.api_url}/v1/documents/{document_id}/variables")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching execution variables: {str(e)}")
            return None


# Singleton instance for reuse
_context_collector = None


def get_context_collector() -> ContextCollector:
    """
    Get (or create) a shared context collector instance.
    
    Returns:
        Shared ContextCollector instance
    """
    global _context_collector
    if _context_collector is None:
        _context_collector = ContextCollector()
    return _context_collector


async def get_notebook_context(document_id: str) -> NotebookContext:
    """
    Convenience function to get notebook context by ID.
    
    Args:
        document_id: ID of the document
        
    Returns:
        Notebook context information
    """
    collector = get_context_collector()
    return await collector.collect_notebook_context(document_id) 