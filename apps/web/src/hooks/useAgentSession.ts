import { useEffect, useRef, useState } from 'react'

export type AgentEvent = {
  event: string
  [key: string]: any
}

export function useAgentSession(
  question: string,
  why: string,
  what: string
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
  const esRef = useRef<EventSource | null>(null)
  // track session ID for sending clarification responses
  const sessionIdRef = useRef<string | null>(null)

  // start a new agent session; can override prompt texts
  const start = (
    overrideQuestion?: string,
    overrideWhy?: string,
    overrideWhat?: string
  ) => {
    if (esRef.current) return
    setEvents([])
    setStatus('loading')
    const q = overrideQuestion ?? question
    const w = overrideWhy ?? why
    const t = overrideWhat ?? what
    const params = new URLSearchParams({ question: q, why: w, what: t })
    // Determine base URL for AI API (fallback to localhost:8000 if env var missing)
    const baseUrl = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:8000'
    const url = `${baseUrl}/v1/agent/session/stream?${params.toString()}`
    console.log('[agent_debug] Connecting EventSource to URL:', url)
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es
    es.onmessage = (e) => {
      try {
        const data: AgentEvent = JSON.parse(e.data)
        // capture session ID on start
        if (data.event === 'session_started') {
          // backend may send session_id or sessionId
          sessionIdRef.current = (data.session_id as string) || (data.sessionId as string) || null
        }
        setEvents((prev) => [...prev, data])
        if (data.event === 'session_completed') {
          setStatus('done')
          es.close()
          esRef.current = null
        }
      } catch {
        // ignore parse errors
      }
    }
    es.onerror = () => {
      setStatus('error')
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }

  const stop = () => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setStatus('idle')
  }

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close()
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
      await fetch(
        `${process.env.NEXT_PUBLIC_AI_API_URL}/v1/agent/session/respond`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid, term, answer }),
        }
      )
    } catch (err) {
      console.error('Error submitting clarification', err)
    }
  }
  return { events, status, start, stop, submitAnswer }
}