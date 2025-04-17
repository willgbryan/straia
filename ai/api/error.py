"""
Error handling utilities for the AI service API.
"""
import functools
import logging
import traceback
from typing import Callable, Any

from fastapi import HTTPException, Request, Response

logger = logging.getLogger(__name__)

class AIServiceError(Exception):
    """Base class for AI service errors."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class InvalidRequestError(AIServiceError):
    """Error for invalid requests."""
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class ModelError(AIServiceError):
    """Error for model-related issues."""
    def __init__(self, message: str):
        super().__init__(message, status_code=500)


class ContextError(AIServiceError):
    """Error for context-related issues."""
    def __init__(self, message: str):
        super().__init__(message, status_code=400)


def handle_ai_service_errors(func: Callable) -> Callable:
    """
    Decorator to handle AI service errors and convert them to appropriate HTTP responses.
    
    Args:
        func: The function to wrap.
        
    Returns:
        The wrapped function with error handling.
    """
    @functools.wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await func(*args, **kwargs)
        except AIServiceError as e:
            logger.error(f"AI service error: {str(e)}")
            raise HTTPException(status_code=e.status_code, detail=str(e))
        except ValueError as e:
            logger.error(f"Value error: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            # Log the full traceback for unexpected errors
            logger.error(f"Unexpected error: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(status_code=500, detail="An unexpected error occurred")
    
    return wrapper 