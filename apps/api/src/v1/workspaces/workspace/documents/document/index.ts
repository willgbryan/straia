import { Router, Response, Request } from 'express'
import { z } from 'zod'
import {
  prisma,
  updateDocument,
  getDocument,
  ApiDocument,
  toApiDocument,
} from '@briefer/database'
import { uuidSchema } from '@briefer/types'
import { getParam } from '../../../../../utils/express.js'
import { IOServer } from '../../../../../websocket/index.js'
import {
  deleteDocument,
  duplicateDocument,
  moveDocument,
  restoreDocument,
} from '../../../../../document-tree.js'
import { getBlocks } from '@briefer/editor'
import { getSession } from '../../../../../python/index.js'

// Routers for document sub-resources
import iconRouter from './icon.js'
import commentsRouter from './comments.js'
import favoriteRouter from './favorite.js'
import filesRouter from './files.js'
import queriesRouter from './queries/index.js'
import schedulesRouter from './schedules/index.js'
import inputsRouter from './inputs.js'
import publishRouter from './publish.js'
import settingsRouter from './settings.js'
import { canUpdateWorkspace } from '../../../../../auth/token.js'
import { getYDocWithoutHistory } from '../../../../../yjs/v2/documents.js'
import { DocumentPersistor } from '../../../../../yjs/v2/persistors.js'
import { getDocId, getYDoc } from '../../../../../yjs/v2/index.js'

export default function documentRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res: Response<ApiDocument>) => {
    const documentId = getParam(req, 'documentId')
    const doc = await getDocument(documentId)
    if (!doc) {
      res.status(404).end()
      return
    }

    res.json(doc)
  })

  router.put(
    '/',
    canUpdateWorkspace,
    async (req, res: Response<ApiDocument>) => {
      const workspaceId = getParam(req, 'workspaceId')
      const documentId = getParam(req, 'documentId')
      const bodyResult = z
        .object({
          title: z.string().optional(),
          content: z.string().optional(),
          relations: z
            .object({
              parentId: uuidSchema.nullable(),
              orderIndex: z.number(),
            })
            .optional(),
        })
        .safeParse(req.body)

      if (!bodyResult.success) {
        res.status(400).end()
        return
      }

      const payload = bodyResult.data
      try {
        const previousDoc = await getDocument(documentId)
        if (!previousDoc) {
          res.status(404).end()
          return
        }

        if (payload.relations) {
          const { parentId, orderIndex } = payload.relations
          await prisma().$transaction(async (tx) =>
            moveDocument(previousDoc.id, workspaceId, parentId, orderIndex, tx)
          )
        }

        const doc = await updateDocument(documentId, {
          title: bodyResult.data.title,
        })

        res.json(await toApiDocument(doc))
      } catch (err) {
        req.log.error({ err, documentId }, 'Failed to update document')
        res.status(500).end()
      }
    }
  )

  router.delete(
    '/',
    canUpdateWorkspace,
    async (req, res: Response<ApiDocument>) => {
      const workspaceId = getParam(req, 'workspaceId')
      const documentId = getParam(req, 'documentId')
      const isPermanent = req.query['isPermanent'] === 'true'

      try {
        const document = await getDocument(documentId)
        if (!document) {
          res.status(404).end()
          return
        }

        const deletedDoc = await deleteDocument(
          documentId,
          workspaceId,
          !isPermanent
        )

        res.json({ ...document, deletedAt: deletedDoc.deletedAt })
      } catch (err) {
        req.log.error(
          { err, documentId, isPermanent },
          'Failed to delete document'
        )
        res.status(500).end()
      }
    }
  )

  router.post(
    '/restore',
    canUpdateWorkspace,
    async (req, res: Response<ApiDocument>) => {
      const documentId = getParam(req, 'documentId')
      const workspaceId = getParam(req, 'workspaceId')

      try {
        let doc = await prisma().document.findUnique({
          where: {
            id: documentId,
            workspaceId,
            deletedAt: { not: null },
          },
          select: { id: true },
        })
        if (!doc) {
          res.status(400).end()
          return
        }

        const restoredDocument = await prisma().$transaction(async (tx) =>
          restoreDocument(doc.id, workspaceId, tx)
        )

        res.json(await toApiDocument(restoredDocument))
      } catch (err) {
        req.log.error({ err, documentId }, 'Failed to restore document')
        res.status(500).end()
      }
    }
  )

  router.post(
    '/duplicate',
    canUpdateWorkspace,
    async (req, res: Response<ApiDocument>) => {
      const originalDocumentId = getParam(req, 'documentId')
      const workspaceId = getParam(req, 'workspaceId')

      try {
        const prevDoc = await prisma().document.findUnique({
          where: {
            id: originalDocumentId,
            workspaceId,
            deletedAt: null,
          },
        })
        if (!prevDoc) {
          req.log.error(
            { originalDocumentId, workspaceId },
            'Failed to duplicate document, document not found'
          )
          res.status(404).end()
          return
        }

        const duplicatedDocument = await duplicateDocument(
          prevDoc.id,
          workspaceId,
          socketServer
        )

        res.status(201).json(await toApiDocument(duplicatedDocument))
      } catch (err) {
        req.log.error(
          { originalDocumentId, workspaceId, err },
          'Failed to duplicate document'
        )
        res.status(500).end()
      }
    }
  )

  router.use('/queries', queriesRouter)
  router.use('/schedules', canUpdateWorkspace, schedulesRouter)
  router.use('/comments', commentsRouter(socketServer))
  router.use('/favorite', favoriteRouter)
  router.use('/files', canUpdateWorkspace, filesRouter)
  router.use('/icon', canUpdateWorkspace, iconRouter)
  router.use('/inputs', canUpdateWorkspace, inputsRouter)
  router.use('/publish', canUpdateWorkspace, publishRouter(socketServer))
  router.use('/settings', canUpdateWorkspace, settingsRouter(socketServer))

  // Add endpoint to get all blocks for a document
  router.get('/blocks', async (req, res) => {
    try {
      const workspaceId = getParam(req, 'workspaceId')
      const documentId = getParam(req, 'documentId')
      const docId = getDocId(documentId, null)
      const wsYDoc = await getYDoc(
        socketServer,
        docId,
        documentId,
        workspaceId,
        new DocumentPersistor(docId, documentId)
      )
      const yDoc = getYDocWithoutHistory(wsYDoc)
      const blocks = getBlocks(yDoc)
      // Convert Yjs blocks to plain objects
      const result = Array.from(blocks.values()).map(block =>
        typeof block.toJSON === 'function' ? block.toJSON() : block
      )
      res.json(result)
    } catch (err) {
      req.log.error({ err }, 'Failed to fetch document blocks')
      res.status(500).json({ error: 'Failed to fetch document blocks' })
    }
  })

  // Real implementation for document execution variables
  router.get('/variables', async (req: Request, res) => {
    const workspaceId = getParam(req, 'workspaceId')
    const documentId = getParam(req, 'documentId')
    try {
      const { kernel } = await getSession(workspaceId, documentId)
      // Python code to get all user variables as a JSON string
      const code = [
        'import json',
        'def _is_jsonable(x):',
        '    try:',
        '        json.dumps(x)',
        '        return True',
        '    except Exception:',
        '        return False',
        'variables = {k: v for k, v in globals().items() if not k.startswith("_") and _is_jsonable(v)}',
        'print(json.dumps(variables))'
      ].join('\n')
      let output = ''
      const future = kernel.requestExecute({ code, store_history: false })
      future.onIOPub = (msg: any) => {
        if (
          msg.header.msg_type === 'stream' &&
          msg.content &&
          typeof msg.content.name === 'string' &&
          msg.content.name === 'stdout' &&
          typeof msg.content.text === 'string'
        ) {
          output += msg.content.text
        }
      }
      await future.done
      let variables = {}
      try {
        variables = JSON.parse(output)
      } catch (e) {
        // If parsing fails, return empty object
        variables = {}
      }
      res.json(variables)
    } catch (err) {
      req.log?.error?.({ err, workspaceId, documentId }, 'Error fetching execution variables')
      res.json({})
    }
  })

  return router
}
