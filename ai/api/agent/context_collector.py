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
from http.cookies import SimpleCookie

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
        self.session_cookie = None
        self.client = None

    async def ensure_logged_in(self):
        if self.client is not None:
            return
        login_url = self.api_url.replace("/v1", "") + "/auth/sign-in/password"
        payload = {
            "email": self.auth["username"],
            "password": self.auth["password"]
        }
        print(f"[DEBUG] Logging in to {login_url} as {self.auth['username']}")
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.post(login_url, json=payload)
            if resp.status_code != 200:
                logger.error(f"[ERROR] Login failed: {resp.status_code} {resp.text}")
                raise Exception(f"Login failed: {resp.status_code} {resp.text}")
            # Extract session cookie
            set_cookie = resp.headers.get("set-cookie")
            if not set_cookie:
                logger.error("[ERROR] No set-cookie header in login response")
                raise Exception("No set-cookie header in login response")
            cookie = SimpleCookie()
            cookie.load(set_cookie)
            if "token" not in cookie:
                logger.error(f"[ERROR] No 'token' cookie in set-cookie: {set_cookie}")
                raise Exception("No 'token' cookie in set-cookie")
            token_value = cookie["token"].value
            self.session_cookie = {"token": token_value}
            print(f"[DEBUG] Login successful, session token: {token_value[:4]}...{token_value[-4:]}")
            self.client = httpx.AsyncClient(cookies=self.session_cookie)

    async def collect_notebook_context(self, workspace_id: str, document_id: str) -> NotebookContext:
        """
        Collect all context for a notebook using workspaceId and documentId.
        Now also includes uploaded files.
        """
        await self.ensure_logged_in()
        try:
            document_info = await self._get_document_info_with_workspace(workspace_id, document_id)
            blocks = await self._get_document_blocks(workspace_id, document_id)
            data_sources = await self._get_workspace_data_sources(workspace_id) if workspace_id else []
            variables = await self._get_execution_variables(workspace_id, document_id)
            files = await self._get_workspace_files(workspace_id)
            context: NotebookContext = {
                "documentId": document_id,
                "title": document_info.get("title", "Untitled Notebook"),
                "blocks": blocks,
                "dataSources": data_sources,
                "files": files,
            }
            print(f"[DEBUG] Notebook context files: {files}")
            if variables:
                context["variables"] = variables
            return context
        except Exception as e:
            logger.error(f"Error collecting notebook context: {str(e)}")
            return {
                "documentId": document_id,
                "title": "Error fetching notebook context",
                "blocks": [],
                "dataSources": [],
                "files": []
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
            # First, try to find the workspaceId for this document
            # We'll use a fallback endpoint if needed
            # Try to fetch from /v1/workspaces/*/documents/{document_id}/
            # If you already have workspaceId, use it directly
            # For now, try a brute-force approach (you may want to optimize this)
            # This assumes you have a way to get workspaceId for a document
            # For now, try the legacy endpoint and fallback if needed
            # (You may want to refactor this for efficiency)
            #
            # This implementation expects the caller to provide workspaceId if possible
            #
            # For now, try to fetch all workspaces and search for the document
            # (You may want to optimize this in production)
            #
            # If you have a mapping of documentId to workspaceId, use it here
            #
            # For now, raise an error if workspaceId is not provided
            raise NotImplementedError("You must provide workspaceId to _get_document_info")
        except Exception as e:
            logger.error(f"Error fetching document info: {str(e)}")
            return {"id": document_id}

    async def _get_document_info_with_workspace(self, workspace_id: str, document_id: str) -> Dict[str, Any]:
        """
        Get document info using the correct endpoint with workspaceId.
        """
        await self.ensure_logged_in()
        try:
            url = f"{self.api_url}/workspaces/{workspace_id}/documents/{document_id}/"
            print(f"[DEBUG] [REQ] GET {url} with session cookie")
            logger.error(f"[DEBUG] Fetching document info: url={url} workspace_id={workspace_id} document_id={document_id}")
            response = await self.client.get(url)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching document info (with workspace): {str(e)}")
            return {"id": document_id, "workspaceId": workspace_id}

    async def _get_document_blocks(self, workspace_id: str, document_id: str) -> List[BlockInfo]:
        """
        Get all blocks in a document with their content and execution results.
        Args:
            workspace_id: ID of the workspace
            document_id: ID of the document
        Returns:
            List of blocks with content and results
        """
        await self.ensure_logged_in()
        try:
            url = f"{self.api_url}/workspaces/{workspace_id}/documents/{document_id}/blocks"
            print(f"[DEBUG] [REQ] GET {url} with session cookie")
            logger.error(f"[DEBUG] Fetching document blocks: url={url} workspace_id={workspace_id} document_id={document_id}")
            response = await self.client.get(url)
            response.raise_for_status()
            blocks_data = response.json()
            if not isinstance(blocks_data, list):
                logger.error(f"Expected list from /blocks endpoint, got {type(blocks_data)}: {blocks_data}")
                return []
            blocks: List[BlockInfo] = []
            for block in blocks_data:
                if not isinstance(block, dict):
                    logger.warning(f"Skipping non-dict block: {block}")
                    continue
                block_info: BlockInfo = {
                    "id": block.get("id", ""),
                    "type": block.get("type", "unknown"),
                    "content": block.get("content", "")
                }
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
        """
        await self.ensure_logged_in()
        try:
            url = f"{self.api_url}/workspaces/{workspace_id}/data-sources"
            print(f"[DEBUG] [REQ] GET {url} with session cookie")
            logger.error(f"[DEBUG] Fetching workspace data sources: url={url} workspace_id={workspace_id}")
            response = await self.client.get(url)
            print(f"[DEBUG] Response status: {response.status_code}")
            print(f"[DEBUG] Response headers: {response.headers}")
            print(f"[DEBUG] Response raw content: {response.text}")
            response.raise_for_status()
            try:
                datasources_data = response.json()
                print(f"[DEBUG] Parsed JSON: {datasources_data}")
            except Exception as json_exc:
                logger.error(f"[DEBUG] Failed to parse JSON: {json_exc}")
                print(f"[DEBUG] Failed to parse JSON: {json_exc}")
                return []
            if not isinstance(datasources_data, list):
                logger.error(f"[DEBUG] datasources_data is not a list: {type(datasources_data)}")
                print(f"[DEBUG] datasources_data is not a list: {type(datasources_data)}")
                return []
            datasources: List[DataSourceInfo] = []
            for idx, ds in enumerate(datasources_data):
                print(f"[DEBUG] Processing datasource #{idx}: {ds}")
                if not isinstance(ds, dict):
                    logger.error(f"[DEBUG] Skipping non-dict datasource: {ds}")
                    print(f"[DEBUG] Skipping non-dict datasource: {ds}")
                    continue
                ds_type = ds.get("type", "unknown")
                data = ds.get("data", {})
                ds_id = data.get("id")
                ds_name = data.get("name")
                print(f"[DEBUG] Extracted id: {ds_id}, name: {ds_name}, type: {ds_type}")
                if ds_id is None:
                    logger.error(f"[DEBUG] Skipping datasource missing 'id': {ds}")
                    print(f"[DEBUG] Skipping datasource missing 'id': {ds}")
                    continue
                try:
                    tables = await self._get_datasource_tables(ds_id, workspace_id)
                except Exception as table_exc:
                    logger.error(f"[DEBUG] Error fetching tables for datasource {ds_id}: {table_exc}")
                    print(f"[DEBUG] Error fetching tables for datasource {ds_id}: {table_exc}")
                    tables = []
                datasource: DataSourceInfo = {
                    "id": ds_id,
                    "name": ds_name,
                    "type": ds_type,
                    "tables": tables
                }
                datasources.append(datasource)
            print(f"[DEBUG] Final datasources list: {datasources}")
            return datasources
        except Exception as e:
            logger.error(f"Error fetching workspace data sources: {str(e)}")
            print(f"[DEBUG] Exception in _get_workspace_data_sources: {e}")
            return []
    
    async def _get_datasource_tables(self, datasource_id: str, workspace_id: Optional[str] = None) -> List[TableInfo]:
        """
        Get table information for a specific data source.
        Tries both /v1/datasources/<id>/schema and /v1/workspaces/<workspaceId>/datasources/<id>/schema if the first returns 404.
        """
        await self.ensure_logged_in()
        endpoints = [
            f"{self.api_url}/datasources/{datasource_id}/schema"
        ]
        if workspace_id:
            endpoints.append(f"{self.api_url}/workspaces/{workspace_id}/datasources/{datasource_id}/schema")
        for url in endpoints:
            try:
                print(f"[DEBUG] Trying schema endpoint: {url}")
                response = await self.client.get(url)
                if response.status_code == 404:
                    print(f"[DEBUG] Schema endpoint 404: {url}")
                    continue
                response.raise_for_status()
                schema_data = response.json()
                print(f"[DEBUG] Schema data from {url}: {schema_data}")
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
                print(f"[DEBUG] Error fetching schema from {url}: {e}")
                logger.error(f"Error fetching data source tables from {url}: {str(e)}")
        return []

    async def _get_workspace_files(self, workspace_id: str) -> List[Dict[str, Any]]:
        """
        Fetch uploaded files for a workspace.
        """
        await self.ensure_logged_in()
        url = f"{self.api_url}/workspaces/{workspace_id}/files"
        try:
            print(f"[DEBUG] [REQ] GET {url} for files with session cookie")
            response = await self.client.get(url)
            response.raise_for_status()
            files = response.json()
            print(f"[DEBUG] Files fetched: {files}")
            if not isinstance(files, list):
                print(f"[DEBUG] Files response is not a list: {type(files)}")
                return []
            return files
        except Exception as e:
            print(f"[DEBUG] Error fetching files for workspace {workspace_id}: {e}")
            logger.error(f"Error fetching files for workspace {workspace_id}: {str(e)}")
            return []
    
    async def _get_execution_variables(self, workspace_id: str, document_id: str) -> Optional[Dict[str, Any]]:
        """
        Get execution variables for a document, if available.
        
        Args:
            workspace_id: ID of the workspace
            document_id: ID of the document
            
        Returns:
            Dictionary of variable names and values
        """
        await self.ensure_logged_in()
        try:
            url = f"{self.api_url}/workspaces/{workspace_id}/documents/{document_id}/variables"
            print(f"[DEBUG] [REQ] GET {url} with session cookie")
            logger.error(f"[DEBUG] Fetching execution variables: url={url} document_id={document_id}")
            response = await self.client.get(url)
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


async def get_notebook_context(workspace_id: str, document_id: str) -> NotebookContext:
    """
    Convenience function to get notebook context by ID.
    
    Args:
        workspace_id: ID of the workspace
        document_id: ID of the document
        
    Returns:
        Notebook context information
    """
    collector = get_context_collector()
    return await collector.collect_notebook_context(workspace_id, document_id) 