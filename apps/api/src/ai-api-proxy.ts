import express from 'express'
import axios from 'axios'
import { config } from './config/index.js'

const router = express.Router()

// Proxy agent streaming requests to the Python agent
router.post('/v2/agent/stream', async (req, res) => {
  try {
    const response = await axios.post(
      `${config().AI_API_URL}/v2/agent/stream`,
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(
            `${config().AI_API_USERNAME}:${config().AI_API_PASSWORD}`
          ).toString('base64')}`,
        },
        responseType: 'stream',
      }
    )
    res.setHeader('Content-Type', 'application/json')
    response.data.pipe(res)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Unknown error' })
  }
})

export default router 