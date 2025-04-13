import axios from 'axios'
import { NEXT_PUBLIC_API_URL } from './env'
import { 
  ClarificationStatus,
  Clarification as AnalystClarification,
  ClarificationOption as AnalystClarificationOption,
  AnalystResult as BlockAnalystResult,
  AnalystVisualization as BlockAnalystVisualization
} from '../components/v2Editor/customBlocks/analyst/mockData'

export type ClarificationOption = {
  id: string
  label: string
  description?: string
  value: string
}

export type Clarification = {
  id: string
  question: string
  options: ClarificationOption[]
}

export type AnalystVisualization = {
  type: 'bar_chart' | 'line_chart' | 'pie_chart'
  title: string
  data: Record<string, number>
}

export type AnalystResult = {
  summary: string
  visualizations: AnalystVisualization[]
  methodologyNote: string
}

interface GenerateClarificationsRequest {
  question: string
  context: string
  goal: string
  databaseSchema?: string
  modelId?: string
}

interface GenerateAnalysisRequest {
  question: string
  context: string
  goal: string
  clarifications: Record<string, string> // Map of clarification IDs to selected option values
  databaseSchema?: string
  modelId?: string
}

/**
 * Get the database schema for the specified workspace
 */
export async function getDatabaseSchema(workspaceId: string): Promise<string> {
  try {
    const response = await axios({
      method: 'GET',
      url: `${NEXT_PUBLIC_API_URL()}/v1/workspaces/${workspaceId}/analyst/database-schema`,
      withCredentials: true,
    })
    
    return response.data.schema
  } catch (error) {
    console.error('Error fetching database schema:', error)
    throw error instanceof Error ? error : new Error('Failed to fetch database schema')
  }
}

/**
 * Generates clarification questions based on the initial query
 */
export async function generateClarifications(
  workspaceId: string,
  request: GenerateClarificationsRequest,
  onClarificationsUpdate: (clarifications: AnalystClarification[]) => void,
  onError: (error: Error) => void
): Promise<{ abort: () => void }> {
  const controller = new AbortController()
  
  try {
    // First, fetch the database schema if not provided
    if (!request.databaseSchema) {
      try {
        request.databaseSchema = await getDatabaseSchema(workspaceId)
      } catch (error) {
        console.warn('Could not fetch database schema, proceeding without it:', error)
      }
    }
    
    // Make the API request
    const response = await fetch(`${NEXT_PUBLIC_API_URL()}/v1/workspaces/${workspaceId}/analyst/clarifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`)
    }
    
    // Handle the streaming response
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }
    
    const decoder = new TextDecoder()
    
    const readChunk = async () => {
      try {
        const { done, value } = await reader.read()
        
        if (done) {
          return
        }
        
        const chunk = decoder.decode(value, { stream: true })
        
        // Process each line (in case we get multiple events)
        const lines = chunk.split('\n').filter(line => line.trim())
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.clarifications) {
              // Convert to our internal format
              const clarifications = data.clarifications.map((c: any) => ({
                ...c,
                status: ClarificationStatus.Idle,
                completed: false,
                options: c.options.map((o: any) => ({
                  ...o,
                  selected: false
                }))
              }))
              onClarificationsUpdate(clarifications)
            }
          } catch (error) {
            console.error('Error parsing clarifications chunk:', error)
          }
        }
        
        // Continue reading
        readChunk()
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Stream reading aborted')
        } else {
          console.error('Error reading stream:', error)
          onError(error instanceof Error ? error : new Error('Failed to read stream'))
        }
      }
    }
    
    // Start reading the stream
    readChunk()
    
    return {
      abort: () => controller.abort()
    }
  } catch (error) {
    console.error('Error generating clarifications:', error)
    onError(error instanceof Error ? error : new Error('Failed to generate clarifications'))
    return {
      abort: () => controller.abort()
    }
  }
}

/**
 * Generates analysis results based on the clarified query
 */
export async function generateAnalysis(
  workspaceId: string,
  request: GenerateAnalysisRequest,
  onAnalysisUpdate: (result: BlockAnalystResult) => void,
  onError: (error: Error) => void
): Promise<{ abort: () => void }> {
  const controller = new AbortController()
  
  try {
    // First, fetch the database schema if not provided
    if (!request.databaseSchema) {
      try {
        request.databaseSchema = await getDatabaseSchema(workspaceId)
      } catch (error) {
        console.warn('Could not fetch database schema, proceeding without it:', error)
      }
    }
    
    // Make the API request
    const response = await fetch(`${NEXT_PUBLIC_API_URL()}/v1/workspaces/${workspaceId}/analyst/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`)
    }
    
    // Handle the streaming response
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }
    
    const decoder = new TextDecoder()
    
    const readChunk = async () => {
      try {
        const { done, value } = await reader.read()
        
        if (done) {
          return
        }
        
        const chunk = decoder.decode(value, { stream: true })
        
        // Process each line (in case we get multiple events)
        const lines = chunk.split('\n').filter(line => line.trim())
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.summary && data.visualizations && data.methodologyNote) {
              onAnalysisUpdate({
                summary: data.summary,
                visualizations: data.visualizations,
                methodologyNote: data.methodologyNote
              })
            }
          } catch (error) {
            console.error('Error parsing analysis chunk:', error)
          }
        }
        
        // Continue reading
        readChunk()
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Stream reading aborted')
        } else {
          console.error('Error reading stream:', error)
          onError(error instanceof Error ? error : new Error('Failed to read stream'))
        }
      }
    }
    
    // Start reading the stream
    readChunk()
    
    return {
      abort: () => controller.abort()
    }
  } catch (error) {
    console.error('Error generating analysis:', error)
    onError(error instanceof Error ? error : new Error('Failed to generate analysis'))
    return {
      abort: () => controller.abort()
    }
  }
} 