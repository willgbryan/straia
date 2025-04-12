import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import WebSocket from 'ws';
import { DataAssistantClient } from '../../ai/client';
import { StreamingAIResponse, UserSessionInfo } from '../../types';
import { getDataSources } from '@briefer/database';
import { IOServer } from '../../websocket/index.js';

// Schema definitions
const QueryInputSchema = z.object({
  query: z.string(),
  motivation: z.string().optional(),
  problem: z.string().optional(),
});

const ClarifyInputSchema = z.object({
  query: z.string(),
  motivation: z.string().optional(),
  problem: z.string().optional(),
  clarified_terms: z.record(z.string()),
});

const LearningInputSchema = z.object({
  topic: z.string(),
  level: z.string().optional(),
});

const SqlTranslationSchema = z.object({
  query: z.string(),
  motivation: z.string().optional(),
  problem: z.string().optional(),
  clarified_terms: z.record(z.string()),
  data_source_id: z.string(),
  data_source_type: z.string(),
});

const QueryExecutionSchema = z.object({
  sql: z.string(),
  data_source_id: z.string(),
  data_source_type: z.string(),
});

const InsightGenerationSchema = z.object({
  query: z.string(),
  motivation: z.string().optional(),
  problem: z.string().optional(),
  clarified_terms: z.record(z.string()),
  results: z.any(),
});

// Initialize the data assistant client
const dataAssistant = new DataAssistantClient(
  process.env.OPENAI_API_KEY || '', 
  process.env.OPENAI_API_BASE_URL
);

// WebSocket message types
type DataAssistantMessage = 
  | { type: 'analyze_query'; payload: z.infer<typeof QueryInputSchema> }
  | { type: 'generate_insights'; payload: z.infer<typeof ClarifyInputSchema> }
  | { type: 'educational_content'; payload: z.infer<typeof LearningInputSchema> }
  | { type: 'translate_to_sql'; payload: z.infer<typeof SqlTranslationSchema> }
  | { type: 'execute_query'; payload: z.infer<typeof QueryExecutionSchema> }
  | { type: 'generate_insights_from_results'; payload: z.infer<typeof InsightGenerationSchema> };

// WebSocket handler helper
const handleWebSocketConnection = (ws: WebSocket, sessionInfo: UserSessionInfo, socketServer: IOServer) => {
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString()) as DataAssistantMessage;
      
      switch (data.type) {
        case 'analyze_query': {
          const validatedData = QueryInputSchema.parse(data.payload);
          const result = await dataAssistant.analyzeQuery(validatedData.query, sessionInfo);
          
          ws.send(JSON.stringify({
            type: 'analyze_query_response',
            payload: result
          }));
          
          break;
        }
        case 'generate_insights': {
          const validatedData = ClarifyInputSchema.parse(data.payload);
          
          // Format context for insights generation
          const context = `
User Question: ${validatedData.query}

${validatedData.motivation ? `User's Motivation: ${validatedData.motivation}` : ''}

${validatedData.problem ? `User's Problem: ${validatedData.problem}` : ''}

Clarified Terms:
${Object.entries(validatedData.clarified_terms).map(([term, value]) => `- ${term}: ${value}`).join('\n')}
          `.trim();
          
          const result = await dataAssistant.generateInsights(context, sessionInfo);
          
          ws.send(JSON.stringify({
            type: 'generate_insights_response',
            payload: result
          }));
          
          break;
        }
        case 'educational_content': {
          const validatedData = LearningInputSchema.parse(data.payload);
          const result = await dataAssistant.generateEducationalContent(
            validatedData.topic, 
            validatedData.level || 'educational administrators',
            sessionInfo
          );
          
          ws.send(JSON.stringify({
            type: 'educational_content_response',
            payload: result
          }));
          
          break;
        }
        case 'translate_to_sql': {
          const validatedData = SqlTranslationSchema.parse(data.payload);
          
          const sql = await dataAssistant.translateToSQL(
            validatedData.query,
            validatedData.clarified_terms,
            validatedData.data_source_id,
            validatedData.data_source_type as any,
            sessionInfo,
            socketServer
          );
          
          ws.send(JSON.stringify({
            type: 'translate_to_sql_response',
            payload: { sql }
          }));
          
          break;
        }
        case 'execute_query': {
          const validatedData = QueryExecutionSchema.parse(data.payload);
          
          const results = await dataAssistant.executeQuery(
            validatedData.sql,
            validatedData.data_source_id,
            validatedData.data_source_type as any,
            sessionInfo
          );
          
          ws.send(JSON.stringify({
            type: 'execute_query_response',
            payload: { results }
          }));
          
          break;
        }
        case 'generate_insights_from_results': {
          const validatedData = InsightGenerationSchema.parse(data.payload);
          
          const result = await dataAssistant.generateInsightsFromQueryResults(
            validatedData.query,
            validatedData.clarified_terms,
            validatedData.motivation || '',
            validatedData.problem || '',
            validatedData.results,
            sessionInfo
          );
          
          ws.send(JSON.stringify({
            type: 'generate_insights_from_results_response',
            payload: result
          }));
          
          break;
        }
        default:
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Unknown message type' }
          }));
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
};

// HTTP route plugin
const dataAssistantRoutes: FastifyPluginAsync = async (fastify) => {
  // Instantiate IO server
  const socketServer: IOServer = fastify.io;
  
  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok' };
  });
  
  // WebSocket endpoint for streaming communications
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const sessionInfo: UserSessionInfo = {
      userId: req.user?.id || 'anonymous',
      organizationId: req.user?.organizationId || 'anonymous',
      // Add other relevant session information as needed
    };
    
    handleWebSocketConnection(connection.socket, sessionInfo, socketServer);
  });
  
  // REST endpoint for non-streaming query analysis
  fastify.post('/analyze-query', {
    schema: {
      body: QueryInputSchema,
    }
  }, async (request, reply) => {
    const sessionInfo: UserSessionInfo = {
      userId: request.user?.id || 'anonymous',
      organizationId: request.user?.organizationId || 'anonymous',
    };
    
    try {
      const result = await dataAssistant.analyzeQuery(request.body.query, sessionInfo);
      return result;
    } catch (error) {
      console.error('Error analyzing query:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  
  // REST endpoint for non-streaming insights generation
  fastify.post('/generate-insights', {
    schema: {
      body: ClarifyInputSchema,
    }
  }, async (request, reply) => {
    const sessionInfo: UserSessionInfo = {
      userId: request.user?.id || 'anonymous',
      organizationId: request.user?.organizationId || 'anonymous',
    };
    
    try {
      // Format context for insights generation
      const context = `
User Question: ${request.body.query}

${request.body.motivation ? `User's Motivation: ${request.body.motivation}` : ''}

${request.body.problem ? `User's Problem: ${request.body.problem}` : ''}

Clarified Terms:
${Object.entries(request.body.clarified_terms).map(([term, value]) => `- ${term}: ${value}`).join('\n')}
      `.trim();
      
      const result = await dataAssistant.generateInsights(context, sessionInfo);
      return result;
    } catch (error) {
      console.error('Error generating insights:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  
  // REST endpoint for educational content
  fastify.post('/educational-content', {
    schema: {
      body: LearningInputSchema,
    }
  }, async (request, reply) => {
    const sessionInfo: UserSessionInfo = {
      userId: request.user?.id || 'anonymous',
      organizationId: request.user?.organizationId || 'anonymous',
    };
    
    try {
      const result = await dataAssistant.generateEducationalContent(
        request.body.topic,
        request.body.level || 'educational administrators',
        sessionInfo
      );
      return result;
    } catch (error) {
      console.error('Error generating educational content:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  
  // REST endpoint for SQL translation
  fastify.post('/translate-to-sql', {
    schema: {
      body: SqlTranslationSchema,
    }
  }, async (request, reply) => {
    const sessionInfo: UserSessionInfo = {
      userId: request.user?.id || 'anonymous',
      organizationId: request.user?.organizationId || 'anonymous',
    };
    
    try {
      const sql = await dataAssistant.translateToSQL(
        request.body.query,
        request.body.clarified_terms,
        request.body.data_source_id,
        request.body.data_source_type as any,
        sessionInfo,
        socketServer
      );
      
      return { sql };
    } catch (error) {
      console.error('Error translating to SQL:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  
  // REST endpoint for query execution
  fastify.post('/execute-query', {
    schema: {
      body: QueryExecutionSchema,
    }
  }, async (request, reply) => {
    const sessionInfo: UserSessionInfo = {
      userId: request.user?.id || 'anonymous',
      organizationId: request.user?.organizationId || 'anonymous',
    };
    
    try {
      const results = await dataAssistant.executeQuery(
        request.body.sql,
        request.body.data_source_id,
        request.body.data_source_type as any,
        sessionInfo
      );
      
      return { results };
    } catch (error) {
      console.error('Error executing query:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  
  // REST endpoint for generating insights from results
  fastify.post('/generate-insights-from-results', {
    schema: {
      body: InsightGenerationSchema,
    }
  }, async (request, reply) => {
    const sessionInfo: UserSessionInfo = {
      userId: request.user?.id || 'anonymous',
      organizationId: request.user?.organizationId || 'anonymous',
    };
    
    try {
      const result = await dataAssistant.generateInsightsFromQueryResults(
        request.body.query,
        request.body.clarified_terms,
        request.body.motivation || '',
        request.body.problem || '',
        request.body.results,
        sessionInfo
      );
      
      return result;
    } catch (error) {
      console.error('Error generating insights from results:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  
  // Endpoint to list available data sources
  fastify.get('/data-sources/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    
    try {
      const dataSources = await getDataSources(workspaceId);
      return { dataSources };
    } catch (error) {
      console.error('Error fetching data sources:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
};

export default dataAssistantRoutes; 