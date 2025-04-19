"""
Configuration settings for the AI API service.

This module contains the configuration settings for the AI API service,
loaded from environment variables.
"""
import os
from typing import Dict, Any
from pydantic import BaseModel, Field


class Settings(BaseModel):
    """Settings for the AI API service."""
    
    # OpenAI settings
    openai_api_key: str = Field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""))
    openai_default_model_name: str = Field(default_factory=lambda: os.environ.get("OPENAI_DEFAULT_MODEL_NAME", "gpt-4-turbo"))
    
    # Basic auth settings
    basic_auth_username: str = Field(default_factory=lambda: os.environ.get("BASIC_AUTH_USERNAME", "admin"))
    basic_auth_password: str = Field(default_factory=lambda: os.environ.get("BASIC_AUTH_PASSWORD", "password"))
    
    # Node.js API connection settings
    node_api_url: str = Field(default_factory=lambda: os.environ.get("NODE_API_URL", "http://api:8080"))
    node_api_username: str = Field(default_factory=lambda: os.environ.get("NODE_API_USERNAME", "agent_service"))
    node_api_password: str = Field(default_factory=lambda: os.environ.get("NODE_API_PASSWORD", "agent_password"))
    
    # Agent settings
    agent_context_token_limit: int = Field(default_factory=lambda: int(os.environ.get("AGENT_CONTEXT_TOKEN_LIMIT", "8000")))
    agent_default_model_name: str = Field(default_factory=lambda: os.environ.get("AGENT_DEFAULT_MODEL_NAME", "gpt-4-turbo"))
    
    # AWS settings
    aws_access_key_id: str = Field(default_factory=lambda: os.environ.get("AWS_ACCESS_KEY_ID", ""))
    aws_secret_access_key: str = Field(default_factory=lambda: os.environ.get("AWS_SECRET_ACCESS_KEY", ""))
    aws_region: str = Field(default_factory=lambda: os.environ.get("AWS_REGION", "us-east-1"))
    
    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


def load_env_vars_from_file(file_path: str = ".env") -> Dict[str, str]:
    """Load environment variables from a .env file."""
    if not os.path.exists(file_path):
        return {}
    
    env_vars = {}
    with open(file_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
                
            key, value = line.split("=", 1)
            env_vars[key.strip()] = value.strip().strip("\"'")
            
    return env_vars


# Try to load from .env file
try:
    env_vars = load_env_vars_from_file()
    for key, value in env_vars.items():
        if key not in os.environ:
            os.environ[key] = value
except Exception:
    # If loading fails, continue with environment variables
    pass

# Create a singleton instance
settings = Settings()
print(f"[DEBUG] NODE_API_URL loaded as: {settings.node_api_url}")
print(f"[DEBUG] Loaded NODE_API_USERNAME: {settings.node_api_username}")
masked_pw = settings.node_api_password[:2] + '***' + settings.node_api_password[-2:] if len(settings.node_api_password) > 4 else '***'
print(f"[DEBUG] Loaded NODE_API_PASSWORD: {masked_pw}") 