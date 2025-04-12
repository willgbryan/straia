import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import WebSocket from 'ws';
import { DataAssistantClient } from '../../ai/client';
import { StreamingAIResponse, UserSessionInfo } from '../../types';
import { getDataSources } from '@briefer/database';
import { IOServer } from '../../websocket/index.js';
import { extractSessionInfo } from '../../ai/controller/index.js';
import { logAIInteraction } from '../../utils/audit.js';

// Schema definitions
const QueryInputSchema = z.object({
  query: z.string(),
  motivation: z.string().optional(),
  problem: z.string().optional(),
  dataSourceId: z.string(),
  workspaceId: z.string(),
});

const ClarifyTermsInputSchema = z.object({
  query: z.string(),
  motivation: z.string().optional(),
  problem: z.string().optional(),
  clarified_terms: z.record(z.string()),
  workspaceId: z.string(),
});

const LearningInputSchema = z.object({
  topic: z.string(),
  level: z.string().optional(),
  workspaceId: z.string(),
});

const InsightGenerationInputSchema = z.object({
  query: z.string(),
  motivation: z.string().optional(),
  problem: z.string().optional(),
  clarified_terms: z.record(z.string()),
  data_source_id: z.string(),
  workspaceId: z.string(),
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

// Initialize the data assistant client
const dataAssistant = new DataAssistantClient(
  process.env.OPENAI_API_KEY || '', 
  process.env.OPENAI_API_BASE_URL
);

// WebSocket message types
type DataAssistantMessage = 
  | { type: 'analyze_query'; payload: z.infer<typeof QueryInputSchema> }
  | { type: 'clarify_terms'; payload: z.infer<typeof ClarifyTermsInputSchema> }
  | { type: 'educational_content'; payload: z.infer<typeof LearningInputSchema> }
  | { type: 'generate_insights'; payload: z.infer<typeof InsightGenerationInputSchema> }
  | { type: 'translate_to_sql'; payload: z.infer<typeof SqlTranslationSchema> }
  | { type: 'execute_query'; payload: z.infer<typeof QueryExecutionSchema> };

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
        case 'clarify_terms': {
          const validatedData = ClarifyTermsInputSchema.parse(data.payload);
          
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
            type: 'clarify_terms_response',
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
        case 'generate_insights': {
          const validatedData = InsightGenerationInputSchema.parse(data.payload);
          
          const result = await dataAssistant.generateInsightsFromQueryResults(
            validatedData.query,
            validatedData.clarified_terms,
            validatedData.motivation || '',
            validatedData.problem || '',
            validatedData.results,
            sessionInfo
          );
          
          ws.send(JSON.stringify({
            type: 'generate_insights_response',
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
  
  // Middleware to verify workspace access authorization
  const verifyWorkspaceAccess = async (workspaceId: string, request: any) => {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }
    
    // Check if the user has access to this workspace
    const userWorkspaces = request?.user?.workspaces || request?.session?.userWorkspaces || {};
    const isAuthorized = userWorkspaces[workspaceId] !== undefined;
    
    if (!isAuthorized) {
      throw new Error('Unauthorized access to workspace');
    }
    
    return true;
  };
  
  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok' };
  });
  
  // Endpoint to get available data sources for a workspace
  fastify.get<{ Querystring: { workspaceId: string } }>('/datasources', async (request, reply) => {
    try {
      const { workspaceId } = request.query;
      
      if (!workspaceId) {
        return reply.code(400).send({ error: 'workspaceId is required' });
      }
      
      // Verify workspace access
      try {
        await verifyWorkspaceAccess(workspaceId, request);
      } catch (authError) {
        console.error('Unauthorized workspace access attempt:', authError);
        return reply.code(403).send({ error: 'Unauthorized access to workspace' });
      }
      
      // Get data sources for the workspace
      const dataSources = await getDataSources({
        workspaceId,
      });
      
      return dataSources;
    } catch (error) {
      console.error('Error fetching data sources:', error);
      return reply.code(500).send({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
  
  // WebSocket setup
  fastify.io.on('connection', (socket) => {
    console.log('WebSocket client connected');
    
    // Handle data-assistant-analyze-query event
    socket.on('data-assistant-analyze-query', async (data) => {
      try {
        const validatedData = QueryInputSchema.parse(data);
        
        // Verify workspace access
        try {
          await verifyWorkspaceAccess(validatedData.workspaceId, socket.request);
        } catch (authError) {
          console.error('Unauthorized workspace access attempt:', authError);
          socket.emit('data-assistant-analyze-query-error', { 
            error: 'Unauthorized access to workspace' 
          });
          return;
        }
        
        const sessionInfo = extractSessionInfo({
          user: {
            id: socket.request.user?.id || 'anonymous',
            organizationId: socket.request.user?.organizationId || 'anonymous',
          }
        } as any);
        
        console.log('Analyzing query:', validatedData.query);
        
        // Log the AI interaction for audit purposes
        logAIInteraction({
          userId: sessionInfo.userId,
          workspaceId: validatedData.workspaceId,
          action: 'analyze_query',
          input: { query: validatedData.query },
          timestamp: new Date()
        });
        
        const result = await dataAssistant.analyzeQuery(validatedData.query, sessionInfo);
        
        socket.emit('data-assistant-analyze-query-output', result);
        socket.emit('data-assistant-analyze-query-finish');
      } catch (error) {
        console.error('Error analyzing query via WebSocket:', error);
        socket.emit('data-assistant-analyze-query-error', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    // Handle data-assistant-clarify-terms event
    socket.on('data-assistant-clarify-terms', async (data) => {
      try {
        const validatedData = ClarifyTermsInputSchema.parse(data);
        
        // Verify workspace access
        try {
          await verifyWorkspaceAccess(validatedData.workspaceId, socket.request);
        } catch (authError) {
          console.error('Unauthorized workspace access attempt:', authError);
          socket.emit('data-assistant-clarify-terms-error', { 
            error: 'Unauthorized access to workspace' 
          });
          return;
        }
        
        const sessionInfo = extractSessionInfo({
          user: {
            id: socket.request.user?.id || 'anonymous',
            organizationId: socket.request.user?.organizationId || 'anonymous',
          }
        } as any);
        
        // Log the AI interaction for audit purposes
        logAIInteraction({
          userId: sessionInfo.userId,
          workspaceId: validatedData.workspaceId,
          action: 'clarify_terms',
          input: { 
            query: validatedData.query, 
            clarified_terms: validatedData.clarified_terms 
          },
          timestamp: new Date()
        });
        
        // Format context for insights generation
        const context = `
User Question: ${validatedData.query}

${validatedData.motivation ? `User's Motivation: ${validatedData.motivation}` : ''}

${validatedData.problem ? `User's Problem: ${validatedData.problem}` : ''}

Clarified Terms:
${Object.entries(validatedData.clarified_terms).map(([term, value]) => `- ${term}: ${value}`).join('\n')}
        `.trim();
        
        const result = await dataAssistant.generateInsights(context, sessionInfo);
        
        socket.emit('data-assistant-clarify-terms-output', result);
        socket.emit('data-assistant-clarify-terms-finish');
      } catch (error) {
        console.error('Error clarifying terms via WebSocket:', error);
        socket.emit('data-assistant-clarify-terms-error', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    // Handle data-assistant-generate-insights event
    socket.on('data-assistant-generate-insights', async (data) => {
      try {
        const validatedData = InsightGenerationInputSchema.parse(data);
        
        // Verify workspace access
        try {
          await verifyWorkspaceAccess(validatedData.workspaceId, socket.request);
        } catch (authError) {
          console.error('Unauthorized workspace access attempt:', authError);
          socket.emit('data-assistant-generate-insights-error', { 
            error: 'Unauthorized access to workspace' 
          });
          return;
        }
        
        const sessionInfo = extractSessionInfo({
          user: {
            id: socket.request.user?.id || 'anonymous',
            organizationId: socket.request.user?.organizationId || 'anonymous',
          }
        } as any);
        
        // Log the AI interaction for audit purposes
        logAIInteraction({
          userId: sessionInfo.userId,
          workspaceId: validatedData.workspaceId,
          action: 'generate_insights',
          input: { 
            query: validatedData.query, 
            data_source_id: validatedData.data_source_id 
          },
          timestamp: new Date()
        });
        
        // Generate SQL from the clarified terms and query
        let sql = '';
        try {
          // Get data source type
          const dataSources = await getDataSources({
            workspaceId: validatedData.workspaceId,
          });
          
          const dataSource = dataSources.find(ds => ds.id === validatedData.data_source_id);
          
          if (dataSource) {
            sql = await dataAssistant.translateToSQL(
              validatedData.query,
              validatedData.clarified_terms,
              validatedData.data_source_id,
              dataSource.type,
              sessionInfo,
              socketServer
            );
            
            // Execute the query
            const results = await dataAssistant.executeQuery(
              sql,
              validatedData.data_source_id,
              dataSource.type,
              sessionInfo
            );
            
            // Generate insights from the results
            const insightsResult = await dataAssistant.generateInsightsFromQueryResults(
              validatedData.query,
              validatedData.clarified_terms,
              validatedData.motivation || '',
              validatedData.problem || '',
              results,
              sessionInfo
            );
            
            socket.emit('data-assistant-generate-insights-output', insightsResult);
          } else {
            throw new Error(`Data source with ID ${validatedData.data_source_id} not found`);
          }
        } catch (sqlError) {
          console.error('Error generating/executing SQL:', sqlError);
          
          // Fallback to direct insight generation
          const context = `
User Question: ${validatedData.query}

${validatedData.motivation ? `User's Motivation: ${validatedData.motivation}` : ''}

${validatedData.problem ? `User's Problem: ${validatedData.problem}` : ''}

Clarified Terms:
${Object.entries(validatedData.clarified_terms).map(([term, value]) => `- ${term}: ${value}`).join('\n')}
          `.trim();
          
          const result = await dataAssistant.generateInsights(context, sessionInfo);
          socket.emit('data-assistant-generate-insights-output', result);
        }
        
        socket.emit('data-assistant-generate-insights-finish');
      } catch (error) {
        console.error('Error generating insights via WebSocket:', error);
        socket.emit('data-assistant-generate-insights-error', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    // Handle data-assistant-educational-content event
    socket.on('data-assistant-educational-content', async (data) => {
      try {
        const validatedData = LearningInputSchema.parse(data);
        
        // Verify workspace access
        try {
          await verifyWorkspaceAccess(validatedData.workspaceId, socket.request);
        } catch (authError) {
          console.error('Unauthorized workspace access attempt:', authError);
          socket.emit('data-assistant-educational-content-error', { 
            error: 'Unauthorized access to workspace' 
          });
          return;
        }
        
        const sessionInfo = extractSessionInfo({
          user: {
            id: socket.request.user?.id || 'anonymous',
            organizationId: socket.request.user?.organizationId || 'anonymous',
          }
        } as any);
        
        // Log the AI interaction for audit purposes
        logAIInteraction({
          userId: sessionInfo.userId,
          workspaceId: validatedData.workspaceId,
          action: 'educational_content',
          input: { topic: validatedData.topic },
          timestamp: new Date()
        });
        
        const result = await dataAssistant.generateEducationalContent(
          validatedData.topic,
          validatedData.level || 'educational administrators',
          sessionInfo
        );
        
        socket.emit('data-assistant-educational-content-output', result);
        socket.emit('data-assistant-educational-content-finish');
      } catch (error) {
        console.error('Error generating educational content via WebSocket:', error);
        socket.emit('data-assistant-educational-content-error', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('WebSocket client disconnected');
    });
  });
  
  // REST endpoint for non-streaming query analysis
  fastify.post('/analyze-query', {
    schema: {
      body: QueryInputSchema,
    }
  }, async (request, reply) => {
    const sessionInfo = extractSessionInfo(request);
    
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
      body: ClarifyTermsInputSchema,
    }
  }, async (request, reply) => {
    const sessionInfo = extractSessionInfo(request);
    
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
    const sessionInfo = extractSessionInfo(request);
    
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
      body: InsightGenerationInputSchema,
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