import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { IOServer } from '../websocket/index.js'
import { prisma } from '@briefer/database'
import { getParam } from '../utils/express.js'
import { validate } from 'uuid'
import { logger } from '../logger.js'

export default function actionsRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

  // Execute an agent action
  router.post('/', async (req: Request, res: Response) => {
    try {
      const payload = z.object({
        documentId: z.string(),
        action: z.object({
          type: z.enum(['sql_query', 'python_code', 'visualization', 'markdown', 'execute_block', 'update_block']),
          content: z.string(),
          blockId: z.string().optional(),
          position: z.string().optional(),
          metadata: z.record(z.any()).optional(),
        }),
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

      // This is a placeholder for action execution logic
      // In the real implementation, we'll handle different action types
      // For now, we'll just return a success message
      
      const result = {
        success: true,
        message: `Action of type ${payload.action.type} executed successfully`,
        actionResult: {
          blockId: payload.action.blockId || 'new-block-id',
          content: payload.action.content,
          executed: true,
        }
      }

      // Send event via socket to notify clients
      const room = `document:${document.id}`
      socketServer.io.to(room).emit('agent:action', {
        documentId: document.id,
        action: payload.action,
        result,
      })

      res.json(result)
    } catch (error) {
      logger().error({ error }, 'Error executing agent action')
      res.status(500).json({ error: 'Error executing action' })
    }
  })

  return router
} 