import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { IOServer } from '../websocket/index.js'
import { prisma } from '@briefer/database'
import { getParam } from '../utils/express.js'
import { validate } from 'uuid'
import { logger } from '../logger.js'
// Yjs and block factories
import { getDocId } from '../yjs/v2/index.js'
import { getYDocForUpdate } from '../yjs/v2/index.js'
import { DocumentPersistor } from '../yjs/v2/persistors.js'
import { makeSQLBlock } from '@briefer/editor/src/blocks/sql.js'
import { makePythonBlock } from '@briefer/editor/src/blocks/python.js'
import { makeRichTextBlock } from '@briefer/editor/src/blocks/richText.js'
import { BlockType } from '@briefer/editor/src/blocks/index.js'
import * as Y from 'yjs'
import { v4 as uuidv4 } from 'uuid'

function isYText(val: any): val is Y.Text {
  return val && typeof val.delete === 'function' && typeof val.insert === 'function';
}

// Utility: Insert plain text as a paragraph node into a Y.XmlFragment
function insertPlainTextToYFragment(fragment: Y.XmlFragment, text: string) {
  const paragraph = new Y.XmlElement('paragraph')
  const textNode = new Y.XmlText()
  textNode.insert(0, text)
  paragraph.push([textNode])
  fragment.push([paragraph])
}

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

      const { type, content, blockId, position, metadata } = payload.action
      let result: any = {}
      let actionError: string | null = null

      try {
        // Load the Yjs document for update
        const docId = getDocId(payload.documentId, null)
        const persistor = new DocumentPersistor(payload.documentId, '')
        await getYDocForUpdate(
          docId,
          socketServer,
          payload.documentId,
          document.workspaceId,
          async (ydoc) => {
            const blocks = ydoc.ydoc.get('blocks') as Y.Map<Y.XmlElement<any>>
            if (type === 'sql_query') {
              const newBlockId = uuidv4()
              const sqlBlock = makeSQLBlock(newBlockId, blocks)
              // Set the content if the block has a Y.Text child for source
              const source = sqlBlock.getAttribute('source')
              if (isYText(source)) {
                source.insert(0, content as string)
              }
              blocks.set(newBlockId, sqlBlock)
              result = {
                blockId: newBlockId,
                type: 'sql_query',
                content,
                executed: false,
              }
            } else if (type === 'python_code') {
              const newBlockId = uuidv4()
              const pythonBlock = makePythonBlock(newBlockId)
              const source = pythonBlock.getAttribute('source')
              if (isYText(source)) {
                source.insert(0, content as string)
              }
              blocks.set(newBlockId, pythonBlock)
              result = {
                blockId: newBlockId,
                type: 'python_code',
                content,
                executed: false,
              }
            } else if (type === 'markdown') {
              const newBlockId = uuidv4()
              const markdownBlock = makeRichTextBlock(newBlockId)
              // Insert plain text as a paragraph node into the Y.XmlFragment
              const fragment = markdownBlock.getAttribute('content')
              if (fragment instanceof Y.XmlFragment) {
                insertPlainTextToYFragment(fragment, content)
              }
              blocks.set(newBlockId, markdownBlock)
              result = {
                blockId: newBlockId,
                type: 'markdown',
                content,
              }
            } else if (type === 'update_block') {
              if (!blockId) throw new Error('blockId is required for update_block')
              const block = blocks.get(blockId)
              if (!block) throw new Error('Block not found')
              // For SQL/Python, update the source; for Markdown, update content
              const blockType = block.getAttribute('type')
              if (blockType === BlockType.SQL || blockType === BlockType.Python) {
                const source = block.getAttribute('source')
                if (isYText(source)) {
                  source.delete(0, source.length)
                  source.insert(0, content as string)
                }
              } else if (blockType === BlockType.RichText) {
                // Replace content in the Y.XmlFragment
                const fragment = block.getAttribute('content')
                if (fragment instanceof Y.XmlFragment) {
                  // Remove all children
                  while (fragment.length > 0) {
                    fragment.delete(0, 1)
                  }
                  insertPlainTextToYFragment(fragment, content)
                }
              }
              result = {
                blockId,
                type: 'update_block',
                content,
              }
            } else if (type === 'execute_block') {
              if (!blockId) throw new Error('blockId is required for execute_block')
              const block = blocks.get(blockId)
              if (!block) throw new Error('Block not found')
              // For execution, we can update a timestamp or a dummy attribute to trigger the execution system
              block.setAttribute('lastExecutionRequest', new Date().toISOString())
              result = {
                blockId,
                type: 'execute_block',
                executed: true,
              }
            } else {
              throw new Error(`Unsupported action type: ${type}`)
            }
          },
          persistor
        )
        // Emit event for block creation/update/execution
        const room = `document:${document.id}`
        socketServer.to(room).emit('agent:action', { action: { ...payload.action, result } })
      } catch (err: any) {
        actionError = err.message || 'Unknown error during action execution'
        result = { error: actionError }
        const room = `document:${document.id}`
        socketServer.to(room).emit('agent:action', { action: { ...payload.action, result } })
      }

      res.json(result)
    } catch (error) {
      logger().error({ error }, 'Error executing agent action')
      res.status(500).json({ error: 'Error executing action' })
    }
  })

  return router
} 