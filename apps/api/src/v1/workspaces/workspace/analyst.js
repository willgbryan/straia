import { Router } from 'express'
import { generateClarificationsStreamed, generateAnalysisStreamed } from '../../../ai-api.js'
import { z } from 'zod'
import { getDatasource, listDataSources } from '@briefer/database'
import prisma from '@briefer/database'
import { getParam } from '../../../utils/express.js'
import { config } from '../../../config/index.js'

const router = Router({ mergeParams: true })

// Schema for the clarifications request
const clarificationsRequestSchema = z.object({
  question: z.string(),
  context: z.string(),
  goal: z.string(),
  databaseSchema: z.string().optional(),
  modelId: z.string().optional(),
})

// Schema for the analysis request
const analysisRequestSchema = z.object({
  question: z.string(),
  context: z.string(),
  goal: z.string(),
  clarifications: z.record(z.string()),
  databaseSchema: z.string().optional(),
  modelId: z.string().optional(),
})

// Helper type for schema structure
const getFallbackSchema = () => {
  return {
    tables: {
      'public.customers': {
        columns: [
          { name: 'customer_id', type: 'integer' },
          { name: 'first_name', type: 'string' },
          { name: 'last_name', type: 'string' },
          { name: 'email', type: 'string' }
        ]
      },
      'public.products': {
        columns: [
          { name: 'product_id', type: 'integer' },
          { name: 'product_name', type: 'string' },
          { name: 'price', type: 'number' }
        ]
      },
      'public.orders': {
        columns: [
          { name: 'order_id', type: 'integer' },
          { name: 'customer_id', type: 'integer' },
          { name: 'order_date', type: 'timestamp' },
          { name: 'total_amount', type: 'number' }
        ]
      }
    }
  }
}

// Get the database schema from the workspace datasources
async function getDataSourceSchema(workspaceId, datasource) {
  try {
    // Try to get cached schema first
    try {
      const cachedSchema = await prisma().dataSourceSchema.findFirst({
        where: { 
          dataSourceId: datasource.data.id,
          type: datasource.type
        },
        include: {
          tables: true
        }
      })
      
      if (cachedSchema) {
        const schema = { tables: {} }
        
        for (const table of cachedSchema.tables) {
          const tableKey = `${table.schema}.${table.name}`
          schema.tables[tableKey] = {
            columns: JSON.parse(table.columns).map(column => ({
              name: column.name,
              type: column.type
            }))
          }
        }
        
        return schema
      }
    } catch (error) {
      console.error('Error getting cached schema:', error)
    }
    
    // Return fallback schema if we couldn't get the actual schema
    return getFallbackSchema()
  } catch (error) {
    console.error('Error getting schema:', error)
    return getFallbackSchema()
  }
}

// GET the database schema for the workspace
router.get('/database-schema', async (req, res) => {
  try {
    const workspaceId = getParam(req, 'workspaceId')

    // Get all datasources for the workspace
    const datasources = await listDataSources(workspaceId)
    
    if (datasources.length === 0) {
      return res.json({ 
        schema: '{}',
        message: 'No datasources found for this workspace'
      })
    }
    
    // For now, use the first datasource
    const firstDatasource = datasources[0]
    if (!firstDatasource) {
      return res.status(404).json({ error: 'Datasource not found' })
    }
    
    try {
      // Get the datasource object using the existing infrastructure
      const datasource = await getDatasource(
        workspaceId, 
        firstDatasource.id, 
        firstDatasource.type
      )
      
      if (!datasource) {
        return res.status(404).json({ error: 'Datasource not found' })
      }
      
      // Get the schema from the datasource
      const schema = await getDataSourceSchema(workspaceId, datasource)
      
      return res.json({ schema: JSON.stringify(schema) })
    } catch (error) {
      console.error('Error getting schema from datasource:', error)
      
      // Return a fallback schema
      return res.json({ schema: JSON.stringify(getFallbackSchema()) })
    }
  } catch (error) {
    console.error('Error getting database schema:', error)
    return res.status(500).json({ error: 'Failed to get database schema' })
  }
})

// POST to generate clarifications
router.post('/clarifications', async (req, res) => {
  try {
    const validatedBody = clarificationsRequestSchema.parse(req.body)
    const { question, context, goal, databaseSchema, modelId } = validatedBody
    
    // Get the OpenAI API key from the workspace settings
    // In a real implementation, you would fetch this from the database
    const openaiApiKey = null // Will use system API key
    
    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    
    // Generate clarifications stream
    const { promise, abortController } = await generateClarificationsStreamed(
      question,
      context,
      goal,
      databaseSchema || JSON.stringify(getFallbackSchema()),
      (clarifications) => {
        res.write(JSON.stringify({ clarifications }))
      },
      modelId || null,
      openaiApiKey
    )
    
    // Handle client disconnect
    req.on('close', () => {
      abortController.abort()
    })
    
    // Wait for the stream to complete
    await promise
    res.end()
  } catch (error) {
    console.error('Error generating clarifications:', error)
    if (!res.headersSent) {
      return res.status(400).json({ error: 'Invalid request parameters' })
    }
  }
})

// POST to generate analysis
router.post('/analysis', async (req, res) => {
  try {
    const validatedBody = analysisRequestSchema.parse(req.body)
    const { question, context, goal, clarifications, databaseSchema, modelId } = validatedBody
    
    // Get the OpenAI API key from the workspace settings
    // In a real implementation, you would fetch this from the database
    const openaiApiKey = null // Will use system API key
    
    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    
    // Generate analysis stream
    const { promise, abortController } = await generateAnalysisStreamed(
      question,
      context,
      goal,
      clarifications,
      databaseSchema || JSON.stringify(getFallbackSchema()),
      (result) => {
        res.write(JSON.stringify(result))
      },
      modelId || null,
      openaiApiKey
    )
    
    // Handle client disconnect
    req.on('close', () => {
      abortController.abort()
    })
    
    // Wait for the stream to complete
    await promise
    res.end()
  } catch (error) {
    console.error('Error generating analysis:', error)
    if (!res.headersSent) {
      return res.status(400).json({ error: 'Invalid request parameters' })
    }
  }
})

export default router 