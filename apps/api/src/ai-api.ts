import axios, { CanceledError } from 'axios'
import split2 from 'split2'
import { config } from './config/index.js'
import { z } from 'zod'
import { DataFrame } from '@briefer/types'
import { decrypt } from '@briefer/database'
import * as Y from 'yjs'

const base64Credentials = () =>
  Buffer.from(
    `${config().AI_API_USERNAME}:${config().AI_API_PASSWORD}`
  ).toString('base64')

export async function sqlEditStreamed(
  query: string,
  instructions: string,
  dialect: string,
  onSQL: (sql: string) => void,
  tableInfo: string | null,
  modelId: string | null,
  openaiApiKey: string | null
): Promise<{
  promise: Promise<void>
  abortController: AbortController
}> {
  const abortController = new AbortController()
  const responseP = axios.post(
    `${config().AI_API_URL}/v1/stream/sql/edit`,
    {
      query,
      instructions,
      dialect,
      tableInfo,
      modelId,
      openaiApiKey: openaiApiKey
        ? decrypt(openaiApiKey, config().WORKSPACE_SECRETS_ENCRYPTION_KEY)
        : null,
    },
    {
      headers: {
        Authorization: `Basic ${base64Credentials()}`,
        'Content-Type': 'application/json',
      },
      responseType: 'stream',
      signal: abortController.signal,
    }
  )

  return {
    abortController,
    promise: new Promise(async (resolve, reject) => {
      try {
        const response = await responseP

        let success = false
        let error: Error | null = null
        response.data
          .pipe(split2(JSON.parse))
          .on('data', (obj: any) => {
            const parse = z.object({ sql: z.string() }).safeParse(obj)
            if (parse.success) {
              onSQL(parse.data.sql)
              success = true
            } else {
              error = parse.error
            }
          })
          .on('error', reject)
          .on('finish', () => {
            if (!success) {
              reject(error ?? new Error('Got no data'))
            } else {
              resolve()
            }
          })
      } catch (e) {
        if (e instanceof CanceledError) {
          resolve()
          return
        }
        reject(e)
      }
    }),
  }
}

export type PythonEditResponse = {
  source: string
}

export async function pythonEdit(
  source: string,
  instructions: string
): Promise<PythonEditResponse> {
  const allowedLibraries = (config().PYTHON_ALLOWED_LIBRARIES ?? '')
    .split(',')
    .map((s) => s.trim())

  const res = await fetch(`${config().AI_API_URL}/v1/python/edit`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64Credentials()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source,
      instructions,
      allowedLibraries,
    }),
  })

  return (await res.json()) as PythonEditResponse
}

function dataframesToPython(dataframes: DataFrame[]): string {
  return dataframes
    .map((df) => {
      const columns = df.columns.map((c) => `'${c.name}'`).join(', ')
      return `${df.name} = pd.DataFrame(columns=[${columns}])`
    })
    .join('\n')
}

export async function pythonEditStreamed(
  source: string,
  instructions: string,
  dataFrames: DataFrame[],
  onSource: (source: string) => void,
  modelId: string | null,
  openaiApiKey: string | null
): Promise<{
  promise: Promise<void>
  abortController: AbortController
}> {
  const allowedLibraries = (config().PYTHON_ALLOWED_LIBRARIES ?? '')
    .split(',')
    .map((s) => s.trim())

  const variables = dataframesToPython(dataFrames)

  const abortController = new AbortController()
  const responseP = axios.post(
    `${config().AI_API_URL}/v1/stream/python/edit`,
    {
      source,
      instructions,
      allowedLibraries,
      variables,
      modelId,
      openaiApiKey: openaiApiKey
        ? decrypt(openaiApiKey, config().WORKSPACE_SECRETS_ENCRYPTION_KEY)
        : null,
    },
    {
      headers: {
        Authorization: `Basic ${base64Credentials()}`,
        'Content-Type': 'application/json',
      },
      responseType: 'stream',
    }
  )

  return {
    abortController,
    promise: new Promise<void>(async (resolve, reject) => {
      try {
        const response = await responseP
        let success = false
        let error: Error | null = null
        response.data
          .pipe(split2(JSON.parse))
          .on('data', (obj: any) => {
            const parse = z.object({ source: z.string() }).safeParse(obj)
            if (parse.success) {
              onSource(parse.data.source)
              success = true
            } else {
              error = parse.error
            }
          })
          .on('error', reject)
          .on('finish', () => {
            if (!success) {
              reject(error ?? new Error('Got no data'))
            } else {
              resolve()
            }
          })
      } catch (e) {
        if (e instanceof CanceledError) {
          resolve()
          return
        }
        reject(e)
      }
    }),
  }
}

// Analyst feature API functions

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

/**
 * Generates clarification questions based on the initial query
 */
export async function generateClarificationsStreamed(
  question: string,
  context: string,
  goal: string,
  databaseSchema: string,
  onClarifications: (clarifications: Clarification[]) => void,
  modelId: string | null,
  openaiApiKey: string | null
): Promise<{
  promise: Promise<void>
  abortController: AbortController
}> {
  const abortController = new AbortController()
  const responseP = axios.post(
    `${config().AI_API_URL}/v1/stream/analyst/clarifications`,
    {
      question,
      context,
      goal,
      databaseSchema,
      modelId,
      openaiApiKey: openaiApiKey
        ? decrypt(openaiApiKey, config().WORKSPACE_SECRETS_ENCRYPTION_KEY)
        : null,
    },
    {
      headers: {
        Authorization: `Basic ${base64Credentials()}`,
        'Content-Type': 'application/json',
      },
      responseType: 'stream',
      signal: abortController.signal,
    }
  )

  return {
    abortController,
    promise: new Promise(async (resolve, reject) => {
      try {
        const response = await responseP

        let success = false
        let error: Error | null = null
        response.data
          .pipe(split2(JSON.parse))
          .on('data', (obj: any) => {
            try {
              // Try to parse the result string if it's still a string
              const data = typeof obj === 'string' ? JSON.parse(obj) : obj
              
              const parse = z.object({ 
                clarifications: z.array(z.object({ 
                  id: z.string(),
                  question: z.string(),
                  options: z.array(z.object({
                    id: z.string(),
                    label: z.string(),
                    description: z.string().optional(),
                    value: z.string()
                  }))
                }))
              }).safeParse(data)
              
              if (parse.success) {
                onClarifications(parse.data.clarifications)
                success = true
              } else {
                error = new Error(parse.error.message)
              }
            } catch (err) {
              error = err instanceof Error ? err : new Error('Failed to parse clarifications')
            }
          })
          .on('error', reject)
          .on('finish', () => {
            if (!success) {
              reject(error ?? new Error('Got no clarification data'))
            } else {
              resolve()
            }
          })
      } catch (e) {
        if (e instanceof CanceledError) {
          resolve()
          return
        }
        reject(e)
      }
    }),
  }
}

/**
 * Generates analysis results based on the clarified query
 */
export async function generateAnalysisStreamed(
  question: string,
  context: string,
  goal: string,
  clarifications: Record<string, string>, // Map of clarification IDs to selected option values
  databaseSchema: string,
  onAnalysisResult: (result: AnalystResult) => void,
  modelId: string | null,
  openaiApiKey: string | null
): Promise<{
  promise: Promise<void>
  abortController: AbortController
}> {
  const abortController = new AbortController()
  const responseP = axios.post(
    `${config().AI_API_URL}/v1/stream/analyst/analysis`,
    {
      question,
      context,
      goal,
      clarifications,
      databaseSchema,
      modelId,
      openaiApiKey: openaiApiKey
        ? decrypt(openaiApiKey, config().WORKSPACE_SECRETS_ENCRYPTION_KEY)
        : null,
    },
    {
      headers: {
        Authorization: `Basic ${base64Credentials()}`,
        'Content-Type': 'application/json',
      },
      responseType: 'stream',
      signal: abortController.signal,
    }
  )

  return {
    abortController,
    promise: new Promise(async (resolve, reject) => {
      try {
        const response = await responseP

        let success = false
        let error: Error | null = null
        response.data
          .pipe(split2(JSON.parse))
          .on('data', (obj: any) => {
            try {
              // Try to parse the result string if it's still a string
              const data = typeof obj === 'string' ? JSON.parse(obj) : obj
              
              const parse = z.object({ 
                summary: z.string(),
                visualizations: z.array(z.object({
                  type: z.enum(['bar_chart', 'line_chart', 'pie_chart']),
                  title: z.string(),
                  data: z.record(z.string(), z.number())
                })),
                methodologyNote: z.string()
              }).safeParse(data)
              
              if (parse.success) {
                onAnalysisResult({
                  summary: parse.data.summary,
                  visualizations: parse.data.visualizations,
                  methodologyNote: parse.data.methodologyNote
                })
                success = true
              } else {
                error = new Error(parse.error.message)
              }
            } catch (err) {
              error = err instanceof Error ? err : new Error('Failed to parse analysis result')
            }
          })
          .on('error', reject)
          .on('finish', () => {
            if (!success) {
              reject(error ?? new Error('Got no analysis data'))
            } else {
              resolve()
            }
          })
      } catch (e) {
        if (e instanceof CanceledError) {
          resolve()
          return
        }
        reject(e)
      }
    }),
  }
}
