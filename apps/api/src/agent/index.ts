import { Router } from 'express'
import { IOServer } from '../websocket/index.js'
import { authenticationMiddleware } from '../auth/token.js'
import conversationsRouter from './conversations.js'
import actionsRouter from './actions.js'

export default function agentRouter(socketServer: IOServer) {
  const router = Router({ mergeParams: true })

  // All agent routes require authentication
  router.use(authenticationMiddleware)

  // Routes for agent conversations
  router.use('/conversations', conversationsRouter(socketServer))

  // Routes for agent actions
  router.use('/actions', actionsRouter(socketServer))

  return router
} 