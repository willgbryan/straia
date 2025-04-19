"""
Python code generation tool.

This module provides functions for generating Python code for data analysis
using LLM based on user requests and context information.
"""
import json
from typing import Dict, List, Optional, Any
import logging

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from ...config import settings

logger = logging.getLogger(__name__)


class PythonGenerator:
    """
    Generates Python code using LLM based on variables, context, and user requests.
    """
    
    def __init__(self, openai_client: Optional[OpenAI] = None):
        """
        Initialize the Python generator with an OpenAI client.
        
        Args:
            openai_client: Optional OpenAI client. If not provided, a default client will be created.
        """
        self.llm = openai_client or OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_default_model_name
        self.allowed_libraries = [
            "pandas", "numpy", "matplotlib", "seaborn", "plotly", 
            "scipy", "statsmodels", "sklearn", "datetime"
        ]
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def generate_code(
        self, 
        task: str, 
        variables: Dict[str, Any] = None, 
        dataframes: Dict[str, Dict[str, Any]] = None,
        allowed_libraries: List[str] = None
    ) -> Dict[str, str]:
        """
        Generate Python code based on user request and available variables.
        
        Args:
            task: The user's request or task description.
            variables: Dictionary of available variables and their values.
            dataframes: Information about available dataframes (columns, types, etc.).
            allowed_libraries: List of allowed libraries to import.
            
        Returns:
            Dictionary with code and explanation.
        """
        # Create a system prompt with context information
        system_prompt = self._create_python_system_prompt(
            variables, 
            dataframes, 
            allowed_libraries or self.allowed_libraries
        )
        
        # Create the user message
        user_message = f"Generate Python code to accomplish this task: {task}"
        
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
            if "code" not in result:
                result["code"] = "# Error: No code generated\nprint('Error generating code')"
            
            if "explanation" not in result:
                result["explanation"] = "No explanation provided."
                
            return result
        except Exception as e:
            logger.error(f"Error parsing Python generation response: {str(e)}")
            # Return a fallback response
            return {
                "code": "# Error generating code\nprint('Error: Could not generate Python code')",
                "explanation": f"Failed to parse response: {str(e)}"
            }
    
    def _create_python_system_prompt(
        self, 
        variables: Dict[str, Any] = None, 
        dataframes: Dict[str, Dict[str, Any]] = None,
        allowed_libraries: List[str] = None
    ) -> str:
        """
        Create a system prompt for Python code generation with context information.
        
        Args:
            variables: Dictionary of available variables and their values.
            dataframes: Information about available dataframes (columns, types, etc.).
            allowed_libraries: List of allowed libraries to import.
            
        Returns:
            System prompt string.
        """
        # Create variables section
        variables_info = ""
        if variables:
            variables_info = "Available variables:\n" + "\n".join([
                f"- {var_name}: {type(var_value).__name__}" 
                for var_name, var_value in variables.items()
            ])
        
        # Create dataframes section
        dataframes_info = ""
        if dataframes:
            dataframes_sections = []
            for df_name, df_info in dataframes.items():
                columns = df_info.get("columns", [])
                columns_str = "\n".join([
                    f"  - {col.get('name')}: {col.get('type')} - {col.get('description', '')}"
                    for col in columns
                ])
                
                df_section = f"- {df_name}:\n  Columns:\n{columns_str}"
                dataframes_sections.append(df_section)
            
            dataframes_info = "Available dataframes:\n" + "\n".join(dataframes_sections)
        
        # Create allowed libraries section
        libraries_info = "Allowed libraries to import:\n" + ", ".join(allowed_libraries or self.allowed_libraries)
        
        # Combine all sections
        context_info = "\n\n".join(filter(None, [variables_info, dataframes_info, libraries_info]))
        
        # Few-shot example
        few_shot_example = '''\n\nExample:\nUser: "load in our advising sessions data"\nAgent:\n{\n  "actions": [\n    {\n      "type": "create_block",\n      "block_type": "python",\n      "content": "import pandas as pd\ndf = pd.read_csv('/home/jupyteruser/advising_sessions.csv')\ndf.head()",\n      "execute": true\n    }\n  ],\n  "explanation": "Loaded the 'advising_sessions.csv' file as a pandas DataFrame and displayed the first 5 rows."\n}\n'''
        
        return f"""You are an expert Python data analyst and notebook assistant.\n\nYou have access to the following context:\n- Notebook blocks and their content/results\n- Uploaded files (with names, paths, and types)\n- Data sources and their schemas/tables\n- Execution variables\n\nYour job is to:\n- Understand the user's intent, even if ambiguous or incomplete.\n- If the user refers to data, files, or tables in any way, use fuzzy/semantic matching to find the best match in the context.\n- Proactively generate Python code to load, analyze, or visualize the relevant data.\n- If appropriate, create a new notebook block, populate it with the generated code, and execute it.\n- If the user's request is unclear, make a best guess and take the most logical next step.\n- Always return your response as a JSON object with:\n  - \"actions\": a list of actions to take (e.g., create_block, execute_block)\n  - \"code\": the code to insert (if applicable)\n  - \"explanation\": a brief explanation of your reasoning and what you did\n\nBe proactive. Err on the side of action. If in doubt, do something helpful in the notebook.\n\n{context_info}\n{few_shot_example}\n\nPlease generate Python code and actions that accomplish the user's task. Follow these guidelines:\n\n1. Use only the allowed libraries listed above\n2. Follow PEP 8 style guidelines\n3. Include helpful comments to explain your logic\n4. Use clear variable names\n5. Handle potential errors appropriately\n6. Make sure your code is efficient and readable\n7. Utilize existing variables/dataframes when available\n8. Make use of pandas and numpy vectorized operations where appropriate\n\nReturn your response as a JSON object with the following format:\n{{\n  \"actions\": [\n    {{\n      \"type\": \"create_block\",\n      \"block_type\": \"python\",\n      \"content\": \"The Python code to execute\",\n      \"execute\": true\n    }}\n  ],\n  \"explanation\": \"A brief explanation of what the code does and how it works\"\n}}\n"""


# Singleton instance for reuse
_python_generator = None


def get_python_generator() -> PythonGenerator:
    """
    Get (or create) a shared Python generator instance.
    
    Returns:
        Shared PythonGenerator instance
    """
    global _python_generator
    if _python_generator is None:
        _python_generator = PythonGenerator()
    return _python_generator


async def generate_python_code(
    task: str, 
    variables: Dict[str, Any] = None, 
    dataframes: Dict[str, Dict[str, Any]] = None,
    allowed_libraries: List[str] = None
) -> Dict[str, str]:
    """
    Convenience function to generate Python code.
    
    Args:
        task: The user's request or task description.
        variables: Dictionary of available variables and their values.
        dataframes: Information about available dataframes (columns, types, etc.).
        allowed_libraries: List of allowed libraries to import.
        
    Returns:
        Dictionary with code and explanation.
    """
    generator = get_python_generator()
    return await generator.generate_code(task, variables, dataframes, allowed_libraries) 