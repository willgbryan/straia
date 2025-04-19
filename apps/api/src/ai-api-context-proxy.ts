import express from 'express'
import axios from 'axios'
import { config } from './config/index.js'

const router = express.Router()

// Middleware to check HTTP Basic Auth
router.use((req, res, next) => {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }
  const b64 = auth.replace('Basic ', '')
  const [user, pass] = Buffer.from(b64, 'base64').toString().split(':')
  if (
    user !== config().AI_API_USERNAME ||
    pass !== config().AI_API_PASSWORD
  ) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  next()
})

// Proxy GET /ai-api/v1/workspaces/:workspaceId/documents/:documentId/
router.get('/workspaces/:workspaceId/documents/:documentId/', async (req, res) => {
  try {
    const { workspaceId, documentId } = req.params
    const url = `${config().API_URL}/v1/workspaces/${workspaceId}/documents/${documentId}/`
    const response = await axios.get(url, { headers: { cookie: req.headers.cookie || '', 'x-internal-proxy': 'true' } })
    res.status(response.status).json(response.data)
  } catch (err: any) {
    console.error('Proxy error [documents]:', err?.message, err?.response?.data)
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
})

// Proxy GET /ai-api/v1/workspaces/:workspaceId/documents/:documentId/blocks
router.get('/workspaces/:workspaceId/documents/:documentId/blocks', async (req, res) => {
  try {
    const { workspaceId, documentId } = req.params
    const url = `${config().API_URL}/v1/workspaces/${workspaceId}/documents/${documentId}/blocks`
    const response = await axios.get(url, { headers: { cookie: req.headers.cookie || '', 'x-internal-proxy': 'true' } })
    res.status(response.status).json(response.data)
  } catch (err: any) {
    console.error('Proxy error [blocks]:', err?.message, err?.response?.data)
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
})

// Proxy GET /ai-api/v1/workspaces/:workspaceId/datasources
router.get('/workspaces/:workspaceId/datasources', async (req, res) => {
  try {
    const { workspaceId } = req.params
    const url = `${config().API_URL}/v1/workspaces/${workspaceId}/datasources`
    const response = await axios.get(url, { headers: { cookie: req.headers.cookie || '', 'x-internal-proxy': 'true' } })
    res.status(response.status).json(response.data)
  } catch (err: any) {
    console.error('Proxy error [datasources]:', err?.message, err?.response?.data)
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
})

// Proxy GET /ai-api/v1/datasources/:datasourceId/schema
router.get('/datasources/:datasourceId/schema', async (req, res) => {
  try {
    const { datasourceId } = req.params
    const url = `${config().API_URL}/v1/datasources/${datasourceId}/schema`
    const response = await axios.get(url, { headers: { cookie: req.headers.cookie || '', 'x-internal-proxy': 'true' } })
    res.status(response.status).json(response.data)
  } catch (err: any) {
    console.error('Proxy error [datasource schema]:', err?.message, err?.response?.data)
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
})

// Proxy GET /ai-api/v1/documents/:documentId/variables
router.get('/documents/:documentId/variables', async (req, res) => {
  try {
    const { documentId } = req.params
    const url = `${config().API_URL}/v1/documents/${documentId}/variables`
    const response = await axios.get(url, { headers: { cookie: req.headers.cookie || '', 'x-internal-proxy': 'true' } })
    res.status(response.status).json(response.data)
  } catch (err: any) {
    console.error('Proxy error [variables]:', err?.message, err?.response?.data)
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
})

export default router 