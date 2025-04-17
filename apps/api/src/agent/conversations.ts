import { Router } from 'express'
import { z } from 'zod'
import { IOServer } from '../websocket/index.js'
import { prisma } from '@briefer/database'
import { getParam, rejectOnError } from '../utils/express.js'
import { validate } from 'uuid'
import { logger } from '../logger.js'
import axios from 'axios'
import { config } from '../config/index.js'

export default function conversationsRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

  // Create a new agent conversation
  router.post('/', rejectOnError(async (req, res) => {
    const payload = z.object({
      documentId: z.string(),
    }).parse(req.body)

    if (!validate(payload.documentId)) {
      res.status(400).json({ error: 'Invalid documentId' })
      return
    }

    // Check if user has access to the document
    const document = await prisma().document.findUnique({
      where: {
        id: payload.documentId,
      },
      select: {
        id: true,
        workspaceId: true,
      },
    })

    if (!document) {
      res.status(404).json({ error: 'Document not found' })
      return
    }

    // Check if user has access to the workspace
    const isAuthorized = req.session.userWorkspaces[document.workspaceId] !== undefined
    if (!isAuthorized) {
      res.status(403).json({ error: 'Unauthorized' })
      return
    }

    // Create a new conversation
    const conversation = await prisma().agentConversation.create({
      data: {
        documentId: payload.documentId,
        userId: req.session.user.id,
      },
    })

    res.status(201).json({ conversationId: conversation.id })
  }))

  // Get a conversation by ID
  router.get('/:conversationId', rejectOnError(async (req, res) => {
    const conversationId = getParam(req, 'conversationId')

    if (!validate(conversationId)) {
      res.status(400).json({ error: 'Invalid conversationId' })
      return
    }

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
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            actions: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    })

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' })
      return
    }

    // Check if user has access to the workspace
    const isAuthorized = req.session.userWorkspaces[conversation.document.workspaceId] !== undefined
    if (!isAuthorized) {
      res.status(403).json({ error: 'Unauthorized' })
      return
    }

    res.json(conversation)
  }))

  // Send a message to a conversation
  router.post('/:conversationId/messages', rejectOnError(async (req, res) => {
    const conversationId = getParam(req, 'conversationId')

    if (!validate(conversationId)) {
      res.status(400).json({ error: 'Invalid conversationId' })
      return
    }

    const payload = z.object({
      content: z.string(),
    }).parse(req.body)

    const conversation = await prisma().agentConversation.findUnique({
      where: {
        id: conversationId,
      },
      include: {
        document: {
          select: {
            id: true,
            workspaceId: true,
          },
        },
      },
    })

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' })
      return
    }

    // Check if user has access to the workspace
    const isAuthorized = req.session.userWorkspaces[conversation.document.workspaceId] !== undefined
    if (!isAuthorized) {
      res.status(403).json({ error: 'Unauthorized' })
      return
    }

    // Create user message
    const message = await prisma().agentMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: payload.content,
      },
    })

    // Send event via socket to notify clients
    const room = `document:${conversation.document.id}`
    socketServer.io.to(room).emit('agent:message', {
      conversationId,
      message,
    })

    // We'll implement a streaming response in the future
    // For now, we'll just call the AI service directly and create an assistant message
    
    try {
      // This is a placeholder - we'll implement actual AI service integration later
      // Normally we would collect context and make a proper request to the AI service
      const aiResponse = await callAIService(conversation.document.id, payload.content)
      
      // Create assistant message
      const assistantMessage = await prisma().agentMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: aiResponse.content,
        },
      })

      // Send event via socket to notify clients
      socketServer.io.to(room).emit('agent:message', {
        conversationId,
        message: assistantMessage,
      })

      res.json({ success: true })
    } catch (error) {
      logger().error({ error }, 'Error calling AI service')
      res.status(500).json({ error: 'Error processing request' })
    }
  }))

  return router
}

// Placeholder function - we'll implement this properly later
async function callAIService(documentId: string, content: string) {
  // This is just a temporary placeholder that returns a fake response
  // In the real implementation, we'll call the AI service with proper context
  return {
    content: `I'm the Briefer Assistant. This is a placeholder response. You asked: "${content}". I'll help you analyze your data once the AI service is fully implemented.`
  }
} 