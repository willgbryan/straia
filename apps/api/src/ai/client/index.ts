import { UserSessionInfo } from "../../types";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { StreamingAIResponse } from "../../types";
import { DataSource } from "@briefer/database";
import * as dataSourceModule from "../../datasources/index.js";
import { fetchDataSourceStructure } from "../../datasources/structure.js";
import { IOServer } from "../../websocket/index.js";
import { config } from "../../config/index.js";
import fs from 'fs';
import path from 'path';

// Class for handling data analysis AI operations
export class DataAssistantClient {
  private client: OpenAI;

  constructor(private readonly apiKey: string, private readonly baseUrl: string = "https://api.openai.com/v1") {
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl
    });
  }

  /**
   * Analyzes a user query about their data
   */
  async analyzeQuery(query: string, sessionInfo: UserSessionInfo): Promise<StreamingAIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_DEFAULT_MODEL_NAME || "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert educational data analyst. You are helping a university administrator understand their student data.

Your task is to analyze a question about educational data and identify any ambiguous terms that need clarification before an accurate answer can be provided.

Specifically, look for ambiguity in the following areas:
1. "at-risk" - Different meanings of student risk (GPA, engagement, retention)
2. "first-gen" - Different definitions of first-generation students
3. "commuter" - Different ways to define commuters (residence type, distance)
4. "this semester" or time references - Which specific term or academic period

For each ambiguous term you find, explain why it's ambiguous and what clarification options should be presented.

Return your response as a JSON object with these keys:
- "ambiguousTerms": Array of objects with "term", "reason" and "options" keys
- "analysisRequired": Boolean indicating if query can be directly answered or needs data analysis
- "dataSourcesNeeded": Array of data source types likely needed (e.g. "student_records", "enrollment", "grades")

IMPORTANT: If terms are already clearly defined or no ambiguity exists, return an empty array for ambiguousTerms.`
          },
          {
            role: "user",
            content: `User Question: ${query}`
          }
        ],
        response_format: { type: "json_object" }
      });

      return {
        id: uuidv4(),
        content: response.choices[0]?.message.content || "{}",
        done: true
      };
    } catch (error) {
      console.error("Error in analyzeQuery:", error);
      throw new Error(error instanceof Error ? error.message : "Unknown error in query analysis");
    }
  }

  /**
   * Generates insights based on a data analysis
   */
  async generateInsights(context: string, sessionInfo: UserSessionInfo): Promise<StreamingAIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_DEFAULT_MODEL_NAME || "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert educational data analyst. You are helping a university administrator understand their student data.

The user has asked a question about educational data and has clarified any ambiguous terms. Your task is to generate insights based on the query and clarifications.

Based on the query and clarifications, provide:
1. A summary insight that directly answers the user's question
2. Relevant visualizations that would help illustrate the answer
3. Explanations of how data was analyzed and interpreted
4. Potential follow-up questions the user might want to ask

Return your response as a JSON object with these keys:
- "summary": A concise summary of the insights (1-3 paragraphs)
- "visualizations": Array of objects describing visualizations with "type", "title", and "data" keys
- "explanations": Array of strings explaining the methodology
- "followupQuestions": Array of strings with potential follow-up questions

IMPORTANT: The insights should be directly relevant to the user's stated problem and motivation.`
          },
          {
            role: "user",
            content: `${context}`
          }
        ],
        response_format: { type: "json_object" }
      });

      return {
        id: uuidv4(),
        content: response.choices[0]?.message.content || "{}",
        done: true
      };
    } catch (error) {
      console.error("Error in generateInsights:", error);
      throw new Error(error instanceof Error ? error.message : "Unknown error in generating insights");
    }
  }

  /**
   * Creates educational content to help users learn from their data
   */
  async generateEducationalContent(topic: string, level: string, sessionInfo: UserSessionInfo): Promise<StreamingAIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_DEFAULT_MODEL_NAME || "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an educational data expert. You are providing detailed information about educational data concepts and methodologies.

Your task is to create educational content about a specific educational data topic. This content will be used to help users understand key concepts related to student data analysis.

For the requested topic, provide:
1. A comprehensive explanation of the concept
2. Key definitions and variations in how the concept is used
3. Best practices related to the concept
4. Practical examples that illustrate the concept in action

Format your response as a JSON object with these keys:
- "title": A clear title for the educational content
- "content": A structured explanation with sections (use markdown formatting)
- "definitions": Object with key terms and their definitions
- "resources": Array of objects with "title" and "description" for further reading

IMPORTANT: The content should be educational, accurate, and written at a level appropriate for ${level} who may not have data science expertise.`
          },
          {
            role: "user",
            content: `Please provide educational content about: ${topic}`
          }
        ],
        response_format: { type: "json_object" }
      });

      return {
        id: uuidv4(),
        content: response.choices[0]?.message.content || "{}",
        done: true
      };
    } catch (error) {
      console.error("Error in generateEducationalContent:", error);
      throw new Error(error instanceof Error ? error.message : "Unknown error in generating educational content");
    }
  }

  /**
   * Translates a natural language query into SQL based on clarified terms and data schema
   */
  async translateToSQL(
    query: string, 
    clarifiedTerms: Record<string, string>,
    dataSourceId: string,
    dataSourceType: DataSource['type'],
    sessionInfo: UserSessionInfo,
    socketServer: IOServer
  ): Promise<string> {
    try {
      // Check if this is a test/demo data source
      let schemaStructure;
      if (dataSourceId === 'sample-educational-data') {
        // Load sample educational data schema
        schemaStructure = await this.loadSampleSchema('educational-data');
      } else {
        // Fetch the data source structure to get schema information
        const dataSource = await this.getDataSource(dataSourceId, dataSourceType);
        if (!dataSource) {
          throw new Error(`Data source with ID ${dataSourceId} not found`);
        }

        // Fetch schema information
        schemaStructure = await fetchDataSourceStructure(
          socketServer,
          dataSource.config,
          { forceRefresh: false, additionalInfo: null }
        );
      }

      if (!schemaStructure) {
        throw new Error("Failed to fetch data source schema");
      }

      // Format schema information for the AI prompt
      const schemaInfo = this.formatSchemaForPrompt(schemaStructure);

      // Create the prompt for SQL generation
      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_DEFAULT_MODEL_NAME || "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert SQL query generator. Your task is to translate a natural language query about educational data into a valid SQL query.

The query should be compatible with ${dataSourceType} dialect.
You have been provided with schema information to help you construct the query. 
Make sure to use the exact table and column names from the schema.
The terms have been clarified by the user and should be incorporated into the SQL logic.

Return your response as a JSON object with these keys:
- "sql": The generated SQL query
- "explanation": A clear explanation of how the query addresses the user's question
- "tables": Array of table names used in the query
- "columns": Array of column names used in the query
- "conditions": Array of conditions applied in the query

IMPORTANT: Ensure the SQL query is well-formed, properly escaped, and optimized. If any information is missing to construct a complete query, explain what additional information is needed.`
          },
          {
            role: "user",
            content: `User Question: ${query}

Clarified Terms:
${Object.entries(clarifiedTerms).map(([term, value]) => `- ${term}: ${value}`).join('\n')}

Database Schema:
${schemaInfo}

Please generate a SQL query that addresses the user's question using the provided schema information.`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error("Failed to generate SQL query");
      }

      const result = JSON.parse(content);
      return result.sql;
    } catch (error) {
      console.error("Error in translateToSQL:", error);
      throw new Error(error instanceof Error ? error.message : "Unknown error in SQL translation");
    }
  }

  /**
   * Executes a SQL query against a data source and returns the results
   */
  async executeQuery(
    sql: string,
    dataSourceId: string,
    dataSourceType: DataSource['type'],
    sessionInfo: UserSessionInfo
  ): Promise<any> {
    try {
      // Check if this is a test/demo data source
      if (dataSourceId === 'sample-educational-data') {
        // For sample data, generate mock results based on the SQL query
        return this.generateMockResults(sql);
      }
      
      // For real data sources, use the actual data source
      const dataSource = await this.getDataSource(dataSourceId, dataSourceType);
      if (!dataSource) {
        throw new Error(`Data source with ID ${dataSourceId} not found`);
      }
      
      // TODO: Implement actual query execution against the data source
      // For now, return mock results
      return this.generateMockResults(sql);
    } catch (error) {
      console.error("Error in executeQuery:", error);
      throw new Error(error instanceof Error ? error.message : "Unknown error in query execution");
    }
  }

  /**
   * Generates insights based on query results
   */
  async generateInsightsFromQueryResults(
    query: string,
    clarifiedTerms: Record<string, string>,
    motivation: string,
    problem: string,
    queryResults: any,
    sessionInfo: UserSessionInfo
  ): Promise<StreamingAIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: process.env.OPENAI_DEFAULT_MODEL_NAME || "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert educational data analyst. Your task is to analyze query results and generate insights for an educational administrator.

Based on the query results, provide:
1. A summary insight that directly answers the user's question
2. Relevant visualizations that would help illustrate the answer
3. Explanations of how the data was analyzed and interpreted
4. Recommendations for actions or follow-up questions

Return your response as a JSON object with these keys:
- "summary": A concise summary of the insights (1-3 paragraphs)
- "visualizations": Array of objects describing visualizations with "type", "title", and "data" keys
- "explanations": Array of strings explaining the methodology and interpretation
- "recommendations": Array of strings with action recommendations
- "followupQuestions": Array of strings with potential follow-up questions

IMPORTANT: The insights should be directly relevant to the user's stated problem and motivation.`
          },
          {
            role: "user",
            content: `User Question: ${query}

User's Motivation: ${motivation}

User's Problem: ${problem}

Clarified Terms:
${Object.entries(clarifiedTerms).map(([term, value]) => `- ${term}: ${value}`).join('\n')}

Query Results:
${JSON.stringify(queryResults, null, 2)}

Please analyze these results and generate meaningful insights.`
          }
        ],
        response_format: { type: "json_object" }
      });

      return {
        id: uuidv4(),
        content: response.choices[0]?.message.content || "{}",
        done: true
      };
    } catch (error) {
      console.error("Error in generateInsightsFromQueryResults:", error);
      throw new Error(error instanceof Error ? error.message : "Unknown error in insights generation");
    }
  }

  // Helper methods

  /**
   * Gets a data source by ID and type
   */
  private async getDataSource(dataSourceId: string, dataSourceType: DataSource['type']): Promise<any> {
    // This would use the datasource module to fetch the data source
    // The implementation would depend on the data source type
    // For now, we'll return a mock data source
    return {
      config: {
        type: dataSourceType,
        data: {
          id: dataSourceId,
          name: "Mock Data Source",
          host: "mock-host",
          port: 5432,
          database: "mock-db",
          username: "mock-user",
          password: "mock-password"
        }
      }
    };
  }

  /**
   * Formats schema information for use in AI prompts
   */
  private formatSchemaForPrompt(schemaStructure: any): string {
    // Check if this is a sample schema with a specific format
    if (schemaStructure?.tables && Array.isArray(schemaStructure.tables)) {
      // Format tables and columns
      let schemaInfo = '';
      
      schemaStructure.tables.forEach((table: any) => {
        schemaInfo += `Table: ${table.name}\n`;
        if (table.description) {
          schemaInfo += `Description: ${table.description}\n`;
        }
        schemaInfo += 'Columns:\n';
        
        if (Array.isArray(table.columns)) {
          table.columns.forEach((column: any) => {
            schemaInfo += `  - ${column.name} (${column.type})`;
            if (column.description) {
              schemaInfo += `: ${column.description}`;
            }
            schemaInfo += '\n';
          });
        }
        
        schemaInfo += '\n';
      });
      
      // Add relationships if available
      if (schemaStructure.relationships && Array.isArray(schemaStructure.relationships)) {
        schemaInfo += 'Relationships:\n';
        schemaStructure.relationships.forEach((rel: any) => {
          schemaInfo += `  - ${rel.from}.${rel.from_column} -> ${rel.to}.${rel.to_column}\n`;
        });
      }
      
      return schemaInfo;
    }
    
    // Default format for regular schema structure
    return JSON.stringify(schemaStructure, null, 2);
  }

  /**
   * Loads a sample schema from the sample-schemas directory
   */
  private async loadSampleSchema(schemaName: string): Promise<any> {
    try {
      const filePath = path.join(__dirname, '../../data/sample-schemas', `${schemaName}.json`);
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error loading sample schema ${schemaName}:`, error);
      return null;
    }
  }

  // Helper method to generate mock results based on SQL
  private generateMockResults(sql: string): any {
    // Parse the SQL to determine what kind of data to return
    const lowerSql = sql.toLowerCase();
    
    // For student retention queries
    if (lowerSql.includes('retention') && lowerSql.includes('first-gen')) {
      return {
        columns: ['term', 'enrolled_count', 'retained_count', 'retention_rate'],
        rows: [
          ['Fall 2024', 250, 213, 85.2],
          ['Spring 2025', 225, 171, 76.0],
          ['Summer 2025', 120, 98, 81.7],
          ['Fall 2025', 260, 218, 83.8]
        ]
      };
    }
    
    // For engagement queries
    if (lowerSql.includes('engagement') || lowerSql.includes('lms_activity')) {
      return {
        columns: ['student_id', 'first_name', 'last_name', 'avg_weekly_logins', 'avg_weekly_minutes', 'avg_completion_rate'],
        rows: [
          ['S001', 'John', 'Smith', 12.3, 245.6, 0.89],
          ['S002', 'Maria', 'Garcia', 8.7, 198.2, 0.76],
          ['S003', 'James', 'Wilson', 5.2, 112.5, 0.65],
          ['S004', 'Emily', 'Johnson', 14.8, 287.1, 0.92],
          ['S005', 'Omar', 'Hassan', 7.3, 156.8, 0.72]
        ]
      };
    }
    
    // For at-risk student queries
    if (lowerSql.includes('risk') || lowerSql.includes('at-risk')) {
      return {
        columns: ['student_id', 'first_name', 'last_name', 'overall_risk', 'predicted_retention', 'advising_sessions', 'last_advising_date', 'last_lms_login'],
        rows: [
          ['S006', 'Lisa', 'Chen', 85, 0.35, 1, '2025-04-15', '2025-05-01'],
          ['S007', 'David', 'Patel', 82, 0.38, 0, null, '2025-04-20'],
          ['S008', 'Olivia', 'Washington', 78, 0.42, 2, '2025-05-12', '2025-05-18'],
          ['S009', 'Miguel', 'Rodriguez', 77, 0.45, 1, '2025-04-05', '2025-05-10'],
          ['S010', 'Aisha', 'Mohammed', 76, 0.47, 3, '2025-05-15', '2025-05-19']
        ]
      };
    }
    
    // Default mock results
    return {
      columns: ['mock_column_1', 'mock_column_2'],
      rows: [
        ['Mock data 1', 123],
        ['Mock data 2', 456],
        ['Mock data 3', 789]
      ]
    };
  }
} 