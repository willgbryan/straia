import { Socket, IOServer } from '../index.js'
import { Session } from '../../types.js'
import { z } from 'zod'
import { logger } from '../../logger.js'
import { prisma } from '@briefer/database'
import axios, { AxiosError } from 'axios'
import { config } from '../../config/index.js'
import { AgentRole, Prisma } from '@prisma/client'
import { createAdapter } from '@socket.io/postgres-adapter'

// Define types for agent-related data
interface AgentMessage {
  id: string
  conversationId: string
  role: AgentRole
  content: string
  createdAt: Date
  metadata?: any
}

interface AgentAction {
  id: string
  messageId: string
  actionType: string
  status: string
  details: any
  result?: any
  createdAt: Date
  completedAt?: Date
}

// Agent WebSocket event handlers

/**
 * Handle sending messages to agent and streaming responses back
 */
export const handleAgentMessage = (
  io: IOServer,
  socket: Socket,
  session: Session
) => {
  return async (data: unknown, ack: (data: any) => void) => {
    try {
      // Validate the input data
      const schema = z.object({
        conversationId: z.string().uuid(),
        message: z.string(),
        streamResponse: z.boolean().default(true),
      })

      const { conversationId, message, streamResponse } = schema.parse(data)

      // Check if conversation exists and user has access to it
      try {
        const conversation = await prisma().agentConversation.findUnique({
          where: {
            id: conversationId,
          },
          include: {
            document: {
              select: {
                workspaceId: true,
              },
            },
          },
        })

        if (!conversation) {
          ack({ error: 'Conversation not found' })
          return
        }

        // Check if user has access to the workspace
        const isAuthorized =
          session.userWorkspaces[conversation.document.workspaceId] !== undefined
        if (!isAuthorized) {
          ack({ error: 'Unauthorized' })
          return
        }

        // Create the user message in the database
        const userMessage = await prisma().agentMessage.create({
          data: {
            conversationId,
            role: 'user' as AgentRole,
            content: message,
          },
        })

        // Join socket to conversation room if not already joined
        const room = `agent:conversation:${conversationId}`
        await socket.join(room)

        // Emit the user message to all clients in the room
        io.to(room).emit('agent:message', {
          conversationId,
          message: userMessage,
        })

        // Acknowledge the message receipt
        ack({ success: true, messageId: userMessage.id })

        // Determine which endpoint to call based on streaming preference
        const endpoint = streamResponse
          ? `${config().AI_API_URL}/v2/agent/stream`
          : `${config().AI_API_URL}/v2/agent/query`

        const aiApiHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(
            `${config().AI_API_USERNAME}:${config().AI_API_PASSWORD}`
          ).toString('base64')}`,
        }

        // Get previous messages for context
        const previousMessages = await prisma().agentMessage.findMany({
          where: {
            conversationId,
            id: { not: userMessage.id }, // Exclude the message we just created
          },
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            role: true,
            content: true,
          },
        })

        const requestPayload = {
          question: message,
          documentId: conversation.documentId,
          userId: session.user.id,
          workspaceId: conversation.document.workspaceId,
          sessionId: conversationId,
          previousMessages: previousMessages,
        }

        if (streamResponse) {
          // Handle streaming response
          try {
            const response = await axios.post(endpoint, requestPayload, {
              headers: aiApiHeaders,
              responseType: 'stream',
            })

            // Process the streaming response
            let fullResponse = ''
            response.data.on('data', async (chunk: Buffer) => {
              try {
                const text = chunk.toString('utf-8')
                const lines = text.split('\n').filter((line) => line.trim())

                for (const line of lines) {
                  try {
                    const message = JSON.parse(line)
                    io.to(room).emit('agent:stream', {
                      conversationId,
                      message,
                    })
                    
                    // Accumulate the full response
                    if (message.content) {
                      fullResponse += message.content
                    }
                  } catch (err) {
                    // Ignore non-JSON lines
                  }
                }
              } catch (err) {
                logger().error({ err }, 'Error processing agent stream chunk')
              }
            })

            // When the stream ends, create the assistant message in the database
            response.data.on('end', async () => {
              try {
                // Create the assistant message
                const assistantMessage = await prisma().agentMessage.create({
                  data: {
                    conversationId,
                    role: 'assistant' as AgentRole,
                    content: fullResponse || 'Sorry, there was an error generating a response.',
                  },
                })

                // Emit completion event
                io.to(room).emit('agent:response:complete', {
                  conversationId,
                  messageId: assistantMessage.id,
                })
              } catch (err) {
                logger().error({ err }, 'Error finalizing agent response')
              }
            })

            // Handle errors in the stream
            response.data.on('error', (err: Error) => {
              logger().error({ err }, 'Error in agent response stream')
              io.to(room).emit('agent:error', {
                conversationId,
                error: err.message,
              })
            })
          } catch (err) {
            logger().error({ err }, 'Error setting up streaming request')
            io.to(room).emit('agent:error', {
              conversationId,
              error: 'Error processing your request.',
            })
          }
        } else {
          // Handle non-streaming response
          try {
            const response = await axios.post(endpoint, requestPayload, {
              headers: aiApiHeaders,
            })

            // Create the assistant message in the database
            const assistantMessage = await prisma().agentMessage.create({
              data: {
                conversationId,
                role: 'assistant' as AgentRole,
                content: response.data.answer || 'No response content.',
                metadata: response.data.metadata || {},
              },
            })

            // Emit the assistant message to all clients
            io.to(room).emit('agent:message', {
              conversationId,
              message: assistantMessage,
            })

            // If there are actions, process them
            if (response.data.actions && response.data.actions.length > 0) {
              for (const action of response.data.actions) {
                // Create the action record
                const actionRecord = await prisma().agentAction.create({
                  data: {
                    messageId: assistantMessage.id,
                    actionType: action.type,
                    status: 'pending',
                    details: action,
                  },
                })

                // Emit the action to clients
                io.to(room).emit('agent:action', {
                  conversationId,
                  messageId: assistantMessage.id,
                  action: actionRecord,
                })
              }
            }
          } catch (err) {
            logger().error({ err }, 'Error getting agent response')
            io.to(room).emit('agent:error', {
              conversationId,
              error: 'Error processing your request.',
            })
          }
        }
      } catch (dbError: unknown) {
        // Check if the error is related to a missing table or relation
        const errorMsg = typeof dbError === 'object' && dbError !== null && 'message' in dbError 
          ? String(dbError.message) 
          : '';
        
        const isMissingTableError = 
          errorMsg.includes('does not exist') || 
          errorMsg.includes('relation') || 
          errorMsg.includes('table') ||
          errorMsg.includes('agentConversation') ||
          errorMsg.includes('agentMessage');

        if (isMissingTableError) {
          logger().warn({ err: dbError }, 'Agent tables may not exist yet');
          ack({ error: 'Feature not available. Agent database tables have not been created yet.' });
        } else {
          // For other database errors, rethrow so they're handled by the outer catch
          throw dbError;
        }
      }
    } catch (err) {
      logger().error({ err }, 'Error in handleAgentMessage')
      ack({ error: 'Error processing your request' })
    }
  }
}

/**
 * Handle creating a new agent conversation
 */
export const handleCreateAgentConversation = (
  io: IOServer,
  socket: Socket,
  session: Session
) => {
  return async (data: unknown, ack: (data: any) => void) => {
    try {
      // Validate the input data
      const schema = z.object({
        documentId: z.string().uuid(),
        title: z.string().optional(),
      })

      const { documentId, title } = schema.parse(data)

      // Check if user has access to the document's workspace
      const document = await prisma().document.findUnique({
        where: {
          id: documentId,
        },
        select: {
          workspaceId: true,
        },
      })

      if (!document) {
        ack({ error: 'Document not found' })
        return
      }

      const isAuthorized =
        session.userWorkspaces[document.workspaceId] !== undefined
      if (!isAuthorized) {
        ack({ error: 'Unauthorized' })
        return
      }

      try {
        // Create a new conversation
        const conversation = await prisma().agentConversation.create({
          data: {
            documentId,
            userId: session.user.id,
          },
        })

        // Join the conversation room
        const room = `agent:conversation:${conversation.id}`
        await socket.join(room)

        // Return the new conversation
        ack({ success: true, conversation })
      } catch (dbError: unknown) {
        // Check if the error is related to a missing table or relation
        const errorMsg = typeof dbError === 'object' && dbError !== null && 'message' in dbError 
          ? String(dbError.message) 
          : '';
        
        const isMissingTableError = 
          errorMsg.includes('does not exist') || 
          errorMsg.includes('relation') || 
          errorMsg.includes('table') ||
          errorMsg.includes('agentConversation');

        if (isMissingTableError) {
          logger().warn({ err: dbError }, 'Agent tables may not exist yet');
          ack({ error: 'Feature not available. Agent database tables have not been created yet.' });
        } else {
          // For other database errors, rethrow so they're handled by the outer catch
          throw dbError;
        }
      }
    } catch (err) {
      logger().error({ err }, 'Error in handleCreateAgentConversation')
      ack({ error: 'Error creating conversation' })
    }
  }
}

/**
 * Handle fetching a specific agent conversation with messages
 */
export const handleGetAgentConversation = (
  socket: Socket,
  session: Session
) => {
  return async (data: unknown, ack: (data: any) => void) => {
    try {
      // Validate the input data
      const schema = z.object({
        conversationId: z.string().uuid(),
      })

      const { conversationId } = schema.parse(data)

      // Check if conversation exists and user has access to it
      try {
        const conversation = await prisma().agentConversation.findUnique({
          where: {
            id: conversationId,
          },
          include: {
            document: {
              select: {
                workspaceId: true,
              },
            },
          },
        })

        if (!conversation) {
          ack({ error: 'Conversation not found' })
          return
        }

        // Check if user has access to the workspace
        const isAuthorized =
          session.userWorkspaces[conversation.document.workspaceId] !== undefined
        if (!isAuthorized) {
          ack({ error: 'Unauthorized' })
          return
        }

        // Join the conversation room if not already joined
        const room = `agent:conversation:${conversationId}`
        await socket.join(room)

        // Get conversation messages
        const messages = await prisma().agentMessage.findMany({
          where: {
            conversationId,
          },
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            actions: true,
          },
        })

        // Return the conversation with messages
        ack({
          success: true,
          conversation: {
            ...conversation,
            messages,
          },
        })
      } catch (dbError: unknown) {
        // Check if the error is related to a missing table or relation
        const errorMsg = typeof dbError === 'object' && dbError !== null && 'message' in dbError 
          ? String(dbError.message) 
          : '';
        
        const isMissingTableError = 
          errorMsg.includes('does not exist') || 
          errorMsg.includes('relation') || 
          errorMsg.includes('table') ||
          errorMsg.includes('agentConversation') ||
          errorMsg.includes('agentMessage');

        if (isMissingTableError) {
          logger().warn({ err: dbError }, 'Agent tables may not exist yet');
          ack({ error: 'Feature not available. Agent database tables have not been created yet.' });
        } else {
          // For other database errors, rethrow so they're handled by the outer catch
          throw dbError;
        }
      }
    } catch (err) {
      logger().error({ err }, 'Error in handleGetAgentConversation')
      ack({ error: 'Error fetching conversation' })
    }
  }
}

/**
 * Handle fetching all agent conversations for a document
 */
export const handleGetDocumentAgentConversations = (
  socket: Socket,
  session: Session
) => {
  return async (data: unknown, ack: (data: any) => void) => {
    try {
      // Validate the input data
      const schema = z.object({
        documentId: z.string().uuid(),
      })

      const { documentId } = schema.parse(data)

      // Check if user has access to the document's workspace
      const document = await prisma().document.findUnique({
        where: {
          id: documentId,
        },
        select: {
          workspaceId: true,
        },
      })

      if (!document) {
        ack({ error: 'Document not found' })
        return
      }

      const isAuthorized =
        session.userWorkspaces[document.workspaceId] !== undefined
      if (!isAuthorized) {
        ack({ error: 'Unauthorized' })
        return
      }

      try {
        // Get all conversations for the document
        const conversations = await prisma().agentConversation.findMany({
          where: {
            documentId,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        })

        // Return the conversations
        ack({ success: true, conversations })
      } catch (dbError: unknown) {
        // Check if the error is related to a missing table or relation
        const errorMsg = typeof dbError === 'object' && dbError !== null && 'message' in dbError 
          ? String(dbError.message) 
          : '';
        
        const isMissingTableError = 
          errorMsg.includes('does not exist') || 
          errorMsg.includes('relation') || 
          errorMsg.includes('table') ||
          errorMsg.includes('agentConversation');

        if (isMissingTableError) {
          // If tables don't exist yet, return an empty array rather than an error
          logger().warn({ err: dbError }, 'Agent tables may not exist yet');
          ack({ success: true, conversations: [] });
        } else {
          // For other database errors, rethrow so they're handled by the outer catch
          throw dbError;
        }
      }
    } catch (err) {
      logger().error({ err }, 'Error in handleGetDocumentAgentConversations')
      ack({ error: 'Error fetching conversations' })
    }
  }
} 