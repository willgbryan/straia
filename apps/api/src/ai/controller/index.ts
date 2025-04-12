import { FastifyRequest, FastifyReply } from 'fastify';
import { DataAssistantClient } from '../client';
import { StreamingAIResponse, UserSessionInfo } from '../../types';

// Initialize the data assistant client
const dataAssistant = new DataAssistantClient(
  process.env.OPENAI_API_KEY || '', 
  process.env.OPENAI_API_BASE_URL
);

/**
 * Extracts user session information from the request
 */
export function extractSessionInfo(request: FastifyRequest): UserSessionInfo {
  // Extract real session info if available
  if (request.user) {
    return {
      userId: request.user.id || 'user-123',
      organizationId: request.user.organizationId || 'org-123',
      email: request.user.email || 'user@example.com',
      name: request.user.name || 'Test User'
    };
  }

  // Return mock session info as fallback
  return {
    userId: 'user-123',
    organizationId: 'org-123',
    email: 'user@example.com',
    name: 'Test User'
  };
}

/**
 * Handles query analysis requests
 */
export async function handleQueryAnalysis(
  request: FastifyRequest<{ Body: { query: string; motivation?: string; problem?: string } }>,
  reply: FastifyReply
): Promise<StreamingAIResponse> {
  const { query } = request.body;
  const sessionInfo = extractSessionInfo(request);
  
  try {
    const response = await dataAssistant.analyzeQuery(query, sessionInfo);
    return reply.send(response);
  } catch (error) {
    return reply.status(500).send({
      id: `error-${Date.now()}`,
      content: 'Failed to analyze query',
      done: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handles insight generation requests
 */
export async function handleInsightGeneration(
  request: FastifyRequest<{ 
    Body: { 
      query: string; 
      motivation?: string; 
      problem?: string; 
      clarifiedTerms: Record<string, string> 
    } 
  }>,
  reply: FastifyReply
): Promise<StreamingAIResponse> {
  const { query, motivation, problem, clarifiedTerms } = request.body;
  const sessionInfo = extractSessionInfo(request);
  
  // Format the context for the insights generation
  const context = `
User Question: ${query}

${motivation ? `User's Motivation: ${motivation}` : ''}

${problem ? `User's Problem: ${problem}` : ''}

Clarified Terms:
${Object.entries(clarifiedTerms).map(([term, value]) => `- ${term}: ${value}`).join('\n')}
  `.trim();
  
  try {
    const response = await dataAssistant.generateInsights(context, sessionInfo);
    return reply.send(response);
  } catch (error) {
    return reply.status(500).send({
      id: `error-${Date.now()}`,
      content: 'Failed to generate insights',
      done: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handles educational content generation requests
 */
export async function handleEducationalContent(
  request: FastifyRequest<{ Body: { topic: string; level?: string } }>,
  reply: FastifyReply
): Promise<StreamingAIResponse> {
  const { topic, level = 'educational administrators' } = request.body;
  const sessionInfo = extractSessionInfo(request);
  
  try {
    const response = await dataAssistant.generateEducationalContent(topic, level, sessionInfo);
    return reply.send(response);
  } catch (error) {
    return reply.status(500).send({
      id: `error-${Date.now()}`,
      content: 'Failed to generate educational content',
      done: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 