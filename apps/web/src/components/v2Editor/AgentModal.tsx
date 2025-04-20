import React, { useState, useEffect, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { useAgentSession, AgentEvent } from '../../hooks/useAgentSession'

interface AgentModalProps {
  open: boolean
  onClose: () => void
}

export default function AgentModal({ open, onClose }: AgentModalProps) {
  const [question, setQuestion] = useState('')
  const [why, setWhy] = useState('')
  const [what, setWhat] = useState('')
  const { events, status, start, stop, submitAnswer } = useAgentSession(question, why, what)
  // hold user’s answers to clarifications
  const [clarAnswers, setClarAnswers] = useState<Record<string, string>>({})
  // track which clarification terms have been submitted
  const [answeredTerms, setAnsweredTerms] = useState<string[]>([])

  const handleStart = () => {
    start()
  }

  const handleClose = () => {
    stop()
    onClose()
  }

  // track which SSE events have been processed for action dispatch
  const processedRef = React.useRef(0)
  // dispatch create_block actions to AgentIntegrationListener
  React.useEffect(() => {
    const startIdx = processedRef.current
    for (let i = startIdx; i < events.length; i++) {
      const ev = events[i]
      if (ev.event === 'action' && ev.action === 'create_block') {
        window.dispatchEvent(
          new CustomEvent('agent:create_block', {
            detail: { blockType: ev.blockType, content: ev.content },
          })
        )
      }
    }
    processedRef.current = events.length
  }, [events])
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-md shadow-lg w-full max-w-lg mx-4 p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Analytics Agent</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2 mb-4">
          <input
            type="text"
            placeholder="Enter your question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full border px-2 py-1 rounded"
          />
          <input
            type="text"
            placeholder="Why are you asking?"
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            className="w-full border px-2 py-1 rounded"
          />
          <input
            type="text"
            placeholder="What are you trying to solve?"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            className="w-full border px-2 py-1 rounded"
          />
        </div>
        <div className="flex justify-end mb-4 space-x-2">
          <button
            onClick={handleStart}
            disabled={status === 'loading'}
            className="bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'loading' ? 'Running...' : 'Start'}
          </button>
          <button
            onClick={() => {
              // sample commuter use case demo
              const dq =
                "Show me the total number of commuter rides per day from the rides table"
              const dw =
                "To analyze daily commuter ridership trends"
              const dt = "commuter use case demo"
              setQuestion(dq)
              setWhy(dw)
              setWhat(dt)
              start(dq, dw, dt)
            }}
            disabled={status === 'loading'}
            className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 disabled:opacity-50"
          >
            Run Commuter Demo
          </button>
        </div>
        <div className="space-y-3 max-h-64 overflow-auto">
          {events.map((ev: AgentEvent, idx: number) => {
            if (ev.event === 'clarification') {
              return (
                <div key={idx} className="p-2 border rounded space-y-2">
                  <p className="font-medium">Clarification Required:</p>
                  {Array.isArray(ev.clarifications) &&
                    ev.clarifications.map((c: any, i: number) => {
                      // skip if already answered
                      if (answeredTerms.includes(c.term)) return null
                      const opts = Array.isArray(c.options) ? c.options : []
                      return (
                        <div key={i} className="mt-2">
                          <p className="italic mb-1">{c.question}</p>
                          <div className="space-y-1">
                            {opts.map((opt: any, j: number) => {
                              const val = opt.value ?? opt.label
                              const checked = clarAnswers[c.term] === val
                              return (
                                <label key={j} className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    name={c.term}
                                    value={val}
                                    checked={checked}
                                    onChange={() =>
                                      setClarAnswers((prev) => ({ ...prev, [c.term]: val }))
                                    }
                                  />
                                  <span title={opt.tooltip}>{opt.label}</span>
                                </label>
                              )
                            })}
                          </div>
                          <button
                            onClick={() => {
                              const ans = clarAnswers[c.term]
                              if (!ans) return
                              submitAnswer(c.term, ans)
                              setAnsweredTerms((prev) => [...prev, c.term])
                            }}
                            disabled={!clarAnswers[c.term]}
                            className="mt-2 bg-blue-600 text-white px-2 py-1 rounded disabled:opacity-50"
                          >
                            Submit Answer
                          </button>
                        </div>
                      )
                    })}
                </div>
              )
            } else if (ev.event === 'action' && ev.action === 'create_block') {
              return (
                <div key={idx} className="p-2 border-l-4 border-blue-400 bg-blue-50 rounded">
                  <p className="font-medium">Action: Create Block</p>
                  <p>Type: {ev.blockType}</p>
                  <pre className="whitespace-pre-wrap">{ev.content}</pre>
                </div>
              )
            } else if (ev.event === 'action_complete') {
              return (
                <div key={idx} className="p-2 border-l-4 border-green-400 bg-green-50 rounded">
                  <p className="font-medium">Action Complete:</p>
                  <p>{ev.message}</p>
                </div>
              )
            } else if (ev.event === 'insight') {
              return (
                <div key={idx} className="p-2 border rounded bg-green-50">
                  <p className="font-medium">Insight:</p>
                  <p>{ev.summary}</p>
                  <ul className="list-disc pl-5 mt-2">
                    {Array.isArray(ev.details) &&
                      ev.details.map((d: any, j: number) => (
                        <li key={j}>{`${d.metric}: ${d.value}`}</li>
                      ))}
                  </ul>
                </div>
              )
            }
            // Fallback
            return (
              <div key={idx} className="p-2 border rounded">
                <pre>{JSON.stringify(ev, null, 2)}</pre>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}