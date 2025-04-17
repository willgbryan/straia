"""
Schema definitions for agent requests.
"""
from typing import Dict, List, Optional, TypedDict

from .context import NotebookContext


class AgentRequest(TypedDict, total=False):
    """
    Request structure for the AI agent.
    
    Attributes:
        question: The user's question or request.
        documentId: The ID of the document/notebook.
        context: Context information about the notebook.
        userId: The ID of the user making the request.
        workspaceId: The ID of the workspace.
        sessionId: Unique identifier for the conversation session.
        previousMessages: List of previous messages in the conversation.
        streamResponse: Whether to stream the response or not.
    """
    question: str
    documentId: str
    context: NotebookContext
    userId: str
    workspaceId: str
    sessionId: Optional[str]
    previousMessages: Optional[List[Dict[str, str]]]
    streamResponse: Optional[bool] 