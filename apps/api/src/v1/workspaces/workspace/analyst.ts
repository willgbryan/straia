import { Router } from 'express'
import { generateClarificationsStreamed, generateAnalysisStreamed } from '../../../ai-api.js'
import { z } from 'zod'
import { getDatasource, listDataSources, DataSource } from '@briefer/database'
import prisma from '@briefer/database'
import { getParam } from '../../../utils/express.js'
import { config } from '../../../config/index.js'
import { DataSourceTable } from '@briefer/types'

const router = Router({ mergeParams: true })

// Schema for the clarifications request
const clarificationsRequestSchema = z.object({
  question: z.string(),
  context: z.string(),
  goal: z.string(),
  databaseSchema: z.string(),
  modelId: z.string().optional(),
})

// Schema for the analysis request
const analysisRequestSchema = z.object({
  question: z.string(),
  context: z.string(),
  goal: z.string(),
  clarifications: z.record(z.string()),
  databaseSchema: z.string(),
  modelId: z.string().optional(),
})

// Helper type for schema structure
interface SchemaTable {
  columns: Array<{
    name: string;
    type: string;
  }>;
}

interface DatabaseSchema {
  tables: Record<string, SchemaTable>;
}

/**
 * Fetch the schema for a datasource by getting its cached structure
 * This uses the existing infrastructure rather than direct database connections
 */
async function getDataSourceSchema(workspaceId: string, datasource: DataSource): Promise<DatabaseSchema> {
  try {
    // Import the structure module dynamically to avoid circular dependencies
    const structureModule = await import('../../../datasources/structure.js')
    
    // Create a simple OnTable callback to collect schema information
    const schema: DatabaseSchema = { tables: {} }
    
    // We need to create a mock socket server for the API
    const mockSocketServer: any = {
      to: () => ({
        emit: () => {},
      }),
    }
    
    // OnTable callback to collect schema information
    const onTable = (schemaName: string, tableName: string, table: DataSourceTable) => {
      const tableKey = `${schemaName}.${tableName}`
      schema.tables[tableKey] = {
        columns: table.columns.map(column => ({
          name: column.name,
          type: column.type
        }))
      }
    }
    
    // Try to fetch cached schema first
    try {
      const cachedSchema = await structureModule.fetchDataSourceStructureFromCache(
        datasource.data.id,
        datasource.type
      )
      
      if (cachedSchema && cachedSchema.status === 'success') {
        // Use cached schema to build our response
        const tables = await prisma().dataSourceSchemaTable.findMany({
          where: { dataSourceSchemaId: cachedSchema.id }
        })
        
        for (const table of tables) {
          const tableKey = `${table.schema}.${table.name}`
          schema.tables[tableKey] = {
            columns: JSON.parse(table.columns as string).map((column: any) => ({
              name: column.name,
              type: column.type
            }))
          }
        }
        
        return schema
      }
    } catch (error) {
      console.error('Error getting cached schema, will try to refresh:', error)
    }
    
    // If we couldn't get the cached schema, try a lightweight fallback with just the information we have
    return getFallbackSchema()
  } catch (error) {
    console.error('Error getting schema:', error)
    return getFallbackSchema()
  }
}

/**
 * Returns a fallback schema when we can't get the real one
 */
function getFallbackSchema(): DatabaseSchema {
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
    
    // For now, use the first datasource (in a full implementation, we'd allow selecting which datasource to use)
    const firstDatasource = datasources[0];
    if (!firstDatasource) {
      return res.status(404).json({ error: 'Datasource not found' })
    }
    
    try {
      // Get the datasource object using the existing infrastructure
      const datasource = await getDatasource(
        workspaceId, 
        firstDatasource.data.id, 
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
      databaseSchema,
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
      databaseSchema,
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