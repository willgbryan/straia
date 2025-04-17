"""
Visualization configuration tool.

This module provides functionality for recommending and configuring
appropriate visualizations based on data characteristics.
"""
import json
from typing import Dict, List, Optional, Any, Tuple
import logging

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from ...config import settings

logger = logging.getLogger(__name__)


class VisualizationConfig:
    """Configuration for a data visualization."""
    
    def __init__(
        self,
        chart_type: str,
        x_axis: Optional[str] = None,
        y_axis: Optional[List[str]] = None,
        group_by: Optional[str] = None,
        sort_by: Optional[str] = None,
        limit: Optional[int] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        color_scheme: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize visualization configuration.
        
        Args:
            chart_type: Type of chart (bar, line, pie, scatter, etc.)
            x_axis: Column to use for x-axis
            y_axis: Column(s) to use for y-axis
            group_by: Column to use for grouping data
            sort_by: Column to sort by
            limit: Maximum number of items to include
            title: Chart title
            description: Chart description
            color_scheme: Color scheme to use
            options: Additional chart-specific options
        """
        self.chart_type = chart_type
        self.x_axis = x_axis
        self.y_axis = y_axis or []
        self.group_by = group_by
        self.sort_by = sort_by
        self.limit = limit
        self.title = title
        self.description = description
        self.color_scheme = color_scheme
        self.options = options or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            "chartType": self.chart_type,
            "xAxis": self.x_axis,
            "yAxis": self.y_axis,
            "groupBy": self.group_by,
            "sortBy": self.sort_by,
            "limit": self.limit,
            "title": self.title,
            "description": self.description,
            "colorScheme": self.color_scheme,
            "options": self.options
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VisualizationConfig':
        """Create configuration from dictionary."""
        return cls(
            chart_type=data.get("chartType", "bar"),
            x_axis=data.get("xAxis"),
            y_axis=data.get("yAxis"),
            group_by=data.get("groupBy"),
            sort_by=data.get("sortBy"),
            limit=data.get("limit"),
            title=data.get("title"),
            description=data.get("description"),
            color_scheme=data.get("colorScheme"),
            options=data.get("options", {})
        )


class VisualizationRecommender:
    """
    Recommends appropriate visualizations based on data characteristics.
    Uses LLM to analyze data schema and query results to suggest visualizations.
    """
    
    def __init__(self, openai_client: Optional[OpenAI] = None):
        """
        Initialize visualization recommender with an OpenAI client.
        
        Args:
            openai_client: Optional OpenAI client. If not provided, a default client will be created.
        """
        self.llm = openai_client or OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_default_model_name
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def recommend_visualization(
        self,
        data_description: Dict[str, Any],
        columns: List[Dict[str, str]],
        sample_data: Optional[List[Dict[str, Any]]] = None,
        chart_purpose: Optional[str] = None
    ) -> Tuple[VisualizationConfig, str]:
        """
        Recommend visualization configuration based on data.
        
        Args:
            data_description: Description of the data (source, query purpose, etc.)
            columns: List of column information with name, type and description
            sample_data: Optional sample rows of data
            chart_purpose: Optional specific purpose of the chart
            
        Returns:
            Tuple of (visualization configuration, explanation of recommendation)
        """
        # Create a system prompt with data information
        system_prompt = self._create_visualization_system_prompt(
            data_description, columns, sample_data, chart_purpose
        )
        
        # Create the user message
        user_message = "Please recommend an appropriate visualization for this data."
        
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
            
            # Extract the configuration and explanation
            config_data = result.get("configuration", {})
            explanation = result.get("explanation", "No explanation provided.")
            
            # Create and return the visualization configuration
            config = VisualizationConfig.from_dict(config_data)
            return config, explanation
            
        except Exception as e:
            logger.error(f"Error parsing visualization recommendation: {str(e)}")
            # Return a fallback response
            fallback_config = VisualizationConfig(
                chart_type="bar",
                title="Data Visualization",
                description="Fallback visualization due to processing error"
            )
            return fallback_config, f"Error generating recommendation: {str(e)}"
    
    def _create_visualization_system_prompt(
        self,
        data_description: Dict[str, Any],
        columns: List[Dict[str, str]],
        sample_data: Optional[List[Dict[str, Any]]] = None,
        chart_purpose: Optional[str] = None
    ) -> str:
        """
        Create a system prompt for visualization recommendation.
        
        Args:
            data_description: Description of the data
            columns: List of column information
            sample_data: Optional sample data rows
            chart_purpose: Optional specific purpose
            
        Returns:
            System prompt string
        """
        # Create columns description
        columns_info = "\n".join([
            f"- {col['name']}: {col['type']}" + 
            (f" - {col['description']}" if 'description' in col else "") 
            for col in columns
        ])
        
        # Create sample data section if provided
        sample_data_section = ""
        if sample_data and len(sample_data) > 0:
            sample_rows = json.dumps(sample_data[:5], indent=2)
            sample_data_section = f"Sample data rows:\n```json\n{sample_rows}\n```"
        
        # Create purpose section if provided
        purpose_section = ""
        if chart_purpose:
            purpose_section = f"Chart purpose: {chart_purpose}"
        
        # Combine all sections
        data_context = f"""
Data description:
{json.dumps(data_description, indent=2)}

Columns:
{columns_info}

{sample_data_section}

{purpose_section}
""".strip()
        
        return f"""You are a data visualization expert that recommends the best visualization types for data.

Your task is to recommend an appropriate visualization based on the data described below.
Consider the data types, relationships, and analytical purpose when making your recommendation.

{data_context}

Choose the most appropriate visualization type based on these guidelines:

1. Bar charts: For comparing categories, especially with categorical x-axis and numeric y-axis
2. Line charts: For showing trends over time or continuous x-axis values
3. Pie charts: For part-to-whole relationships (but only with few categories)
4. Scatter plots: For showing correlation between two numeric variables
5. Heatmaps: For showing patterns in multi-dimensional data
6. Tables: For detailed data with many dimensions that needs precise values
7. Area charts: For showing cumulative totals over time
8. Stacked bar/area: For showing composition and total together

For each type, consider appropriate settings like:
- X and Y axes selection
- Grouping fields
- Sorting order
- Data limits
- Appropriate title and description

Return your response as a JSON object with the following structure:
{{
  "configuration": {{
    "chartType": "bar|line|pie|scatter|heatmap|table|area",
    "xAxis": "column_name",
    "yAxis": ["column_name"],
    "groupBy": "column_name",  // Optional
    "sortBy": "column_name",   // Optional
    "limit": 10,               // Optional
    "title": "Suggested chart title",
    "description": "Brief description of what this chart shows",
    "colorScheme": "default|blues|greens|etc",  // Optional
    "options": {{}}            // Any additional chart-specific options
  }},
  "explanation": "A detailed explanation of why this visualization is appropriate for the data"
}}

Focus on clarity, simplicity, and effectiveness in conveying the most important aspects of the data.
"""


# Singleton instance for reuse
_viz_recommender = None


def get_visualization_recommender() -> VisualizationRecommender:
    """
    Get (or create) a shared visualization recommender instance.
    
    Returns:
        Shared VisualizationRecommender instance
    """
    global _viz_recommender
    if _viz_recommender is None:
        _viz_recommender = VisualizationRecommender()
    return _viz_recommender


async def recommend_visualization(
    data_description: Dict[str, Any],
    columns: List[Dict[str, str]],
    sample_data: Optional[List[Dict[str, Any]]] = None,
    chart_purpose: Optional[str] = None
) -> Tuple[Dict[str, Any], str]:
    """
    Convenience function to recommend a visualization.
    
    Args:
        data_description: Description of the data
        columns: List of column information
        sample_data: Optional sample data rows
        chart_purpose: Optional specific purpose
        
    Returns:
        Tuple of (visualization configuration dict, explanation)
    """
    recommender = get_visualization_recommender()
    config, explanation = await recommender.recommend_visualization(
        data_description, columns, sample_data, chart_purpose)
    return config.to_dict(), explanation 