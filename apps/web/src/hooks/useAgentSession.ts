import { useEffect, useRef, useState } from 'react'

export type AgentEvent = {
  event: string
  [key: string]: any
}

export function useAgentSession(
  question: string,
  why: string,
  what: string,
  workspaceId?: string,
  notebookBlocks?: any[]
): {
  events: AgentEvent[]
  status: 'idle' | 'loading' | 'error' | 'done'
  start: (overrideQuestion?: string, overrideWhy?: string, overrideWhat?: string) => void
  stop: () => void
  // submit a user response to a clarification prompt
  submitAnswer: (term: string, answer: string) => Promise<void>
} {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')
  const controllerRef = useRef<AbortController | null>(null)
  // track session ID for sending clarification responses
  const sessionIdRef = useRef<string | null>(null)

  // start a new agent session; can override prompt texts
  const start = (
    overrideQuestion?: string,
    overrideWhy?: string,
    overrideWhat?: string
  ) => {
    if (controllerRef.current) return
    setEvents([])
    setStatus('loading')
    const q = overrideQuestion ?? question
    const w = overrideWhy ?? why
    const t = overrideWhat ?? what
    const baseUrl = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:8000'
    const url = `${baseUrl}/v1/agent/session/stream`
    const body = {
      question: q,
      why: w,
      what: t,
      workspace_id: workspaceId,
      notebook_blocks: notebookBlocks,
    }
    const controller = new AbortController()
    controllerRef.current = controller
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (resp) => {
        if (!resp.body) throw new Error('No response body')
        const reader = resp.body.getReader()
        let buffer = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += new TextDecoder().decode(value)
          let idx
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 1)
            if (!line) continue
            try {
              const data: AgentEvent = JSON.parse(line)
              console.log('Agent event received', data)
              if (data.event === 'session_started') {
                sessionIdRef.current = (data.session_id as string) || (data.sessionId as string) || null
              }
              if (data.event === 'execution_result') {
                window.dispatchEvent(new CustomEvent('agent:raw_execution_result', { detail: data }))
              }
              setEvents((prev) => [...prev, data])
              if (data.event === 'session_completed') {
                setStatus('done')
                controllerRef.current = null
                return
              }
            } catch {
              // ignore parse errors
            }
          }
        }
        setStatus('done')
        controllerRef.current = null
      })
      .catch(() => {
        setStatus('error')
        controllerRef.current = null
      })
  }

  const stop = () => {
    if (controllerRef.current) {
      controllerRef.current.abort()
      controllerRef.current = null
    }
    setStatus('idle')
  }

  useEffect(() => {
    return () => {
      if (controllerRef.current) controllerRef.current.abort()
    }
  }, [])

  // send a clarification response back to the agent
  const submitAnswer = async (term: string, answer: string) => {
    const sid = sessionIdRef.current
    if (!sid) {
      console.warn('No session ID, cannot submit clarification')
      return
    }
    try {
      const baseUrl = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:8000'
      const resp = await fetch(
        `${baseUrl}/v1/agent/session/respond`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid, term, answer }),
        }
      )
      if (!resp.ok) {
        console.error('Error submitting clarification, status:', resp.status)
      }
    } catch (err) {
      console.error('Error submitting clarification', err)
    }
  }
  return { events, status, start, stop, submitAnswer }
}