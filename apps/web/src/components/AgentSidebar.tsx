import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Transition } from '@headlessui/react'
import {
  AgentEvent,
  useAgentSession,
} from '@/hooks/useAgentSession'
import { ChevronDoubleRightIcon } from '@heroicons/react/24/outline'

interface Props {
  workspaceId: string
  visible: boolean
  onHide: () => void
}

type ChatMessage =
  | {
      role: 'assistant' | 'user'
      content: string
    }
  | {
      role: 'assistant_clarify'
      term: string
      question: string
      options: { label: string; value: string; tooltip?: string }[]
    }

export default function AgentSidebar({
  workspaceId,
  visible,
  onHide,
}: Props) {
  // conversation steps: gather the three required inputs sequentially
  const [step, setStep] = useState<'question' | 'why' | 'what' | 'running'>('question')
  const [question, setQuestion] = useState('')
  const [why, setWhy] = useState('')
  const [what, setWhat] = useState('')

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      role: 'assistant',
      content: 'Hi there! What question would you like to explore today?',
    },
  ])

  // Track the index of the most recent assistant message so we can attach
  // the "thinking" indicator to its label when the agent is working.
  // index of the latest assistant‑side message (assistant or assistant_clarify)
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'user') return i
    }
    return -1
  }, [messages])

  // queue up clarification prompts sent by the backend so that we can
  // surface them to the user one‑at‑a‑time in a conversational manner
  type Clarification = {
    term: string
    question: string
    options: { label: string; value: string; tooltip?: string }[]
  }

  // A mutable ref that keeps the pending clarifications in order of arrival
  const clarQueueRef = useRef<Clarification[]>([])
  // React state that always reflects the *current* clarification presented
  // to the user. When this becomes undefined it means there is no active
  // clarification awaiting a response.
  const [currentClar, setCurrentClar] = useState<Clarification | undefined>()

  const {
    events,
    status,
    start,
    stop,
    submitAnswer,
  } = useAgentSession(question, why, what, workspaceId)

  // keep track of processed SSE events to prevent duplication
  const processedIdx = useRef(0)
  // current session id from backend
  const sessionIdRef = useRef<string | null>(null)

  // once the agent starts emitting actionable results we should no longer
  // surface clarification prompts that might arrive late due to streaming
  // delays. this flag is set when we see the first non‑clarification event
  // that represents progress (insight or action).
  const hasProgressRef = useRef(false)

  // cleanup when sidebar hides
  useEffect(() => {
    if (!visible) {
      stop()
      setMessages([
        {
          role: 'assistant',
          content: 'Hi there! What question would you like to explore today?',
        },
      ])
      setStep('question')
      setQuestion('')
      setWhy('')
      setWhat('')
      processedIdx.current = 0
      clarQueueRef.current = []
      setCurrentClar(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // handle new events from agent
  useEffect(() => {
    if (step !== 'running') return
    for (let i = processedIdx.current; i < events.length; i++) {
      const ev = events[i]
      if (ev.event === 'session_started') {
        const sid = (ev.session_id as string) || (ev.sessionId as string)
        if (sid) {
          sessionIdRef.current = sid
          window.dispatchEvent(new CustomEvent('agent:session_started', { detail: { sessionId: sid } }))
        }
      }
      if (ev.event === 'clarification' && !hasProgressRef.current) {
        if (Array.isArray(ev.clarifications)) {
          // Push all received clarifications into the queue.
          const newClars: Clarification[] = ev.clarifications.map((c: any) => ({
            term: c.term,
            question: c.question,
            options: Array.isArray(c.options) ? c.options : [],
          }))
          clarQueueRef.current.push(...newClars)

          // If we are not already waiting on a clarification, present the next one.
          if (!currentClar) {
            const next = clarQueueRef.current.shift()
            if (next) {
              setCurrentClar(next)
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant_clarify',
                  term: next.term,
                  question: next.question,
                  options: next.options,
                },
              ])
            }
          }
        }
      } else if (ev.event === 'insight') {
        hasProgressRef.current = true
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: ev.summary ?? 'Here are the insights I found.',
          },
        ])
      } else if (ev.event === 'execution_result') {
        // surface execution outcome to user
        const status: string = ev.status
        if (status === 'error') {
          const msgText =
            'I tried running that code but encountered an error: ' +
            (typeof ev.error === 'string' ? ev.error.split('\n').slice(-3).join('\n') : '')
          setMessages((prev) => [...prev, { role: 'assistant', content: msgText }])
        } else {
          const out = ev.output ?? 'Code executed successfully.'
          setMessages((prev) => [...prev, { role: 'assistant', content: String(out).slice(0, 500) }])
        }
      } else if (ev.event === 'action') {
        hasProgressRef.current = true
        if (ev.action === 'create_block') {
        hasProgressRef.current = true
        // Inform user about new block creation
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `I've created a ${ev.blockType} block with the relevant content in your notebook.`,
          },
        ])
        // Dispatch event so the notebook can handle block creation
        window.dispatchEvent(
          new CustomEvent('agent:create_block', {
            detail: {
              blockType: ev.blockType,
              content: ev.content,
              blockId: ev.blockId,
              input: ev.input,
            },
          })
        )
        }
      }
    }
    processedIdx.current = events.length
  }, [events, step, currentClar])

  // handle user submission for sequential Q/A before running agent
  const sendUserMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return
      setMessages((prev) => [...prev, { role: 'user', content: text }])

      if (step === 'question') {
        setQuestion(text)
        setStep('why')
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Got it. Why are you asking this question?',
          },
        ])
      } else if (step === 'why') {
        setWhy(text)
        setStep('what')
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Understood. What are you ultimately trying to solve or accomplish?',
          },
        ])
      } else if (step === 'what') {
        setWhat(text)
        // move to running state; the effect hook will trigger the agent start once state is updated
        setStep('running')
      }
    },
    [step, question, what, why, start]
  )

  // Quick fix: ensure agent starts after what is set
  useEffect(() => {
    if (step === 'running' && status === 'idle') {
      // call start once
      start(question, why, what)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, status])

  // answer clarification
  const answerClarification = useCallback(
    async (term: string, value: string) => {
      // Immediately reflect the user's answer in the UI.
      setMessages((prev) => [...prev, { role: 'user', content: value }])

      // Persist the answer to the backend right away.
      await submitAnswer(term, value)

      // Present the next clarification (if any).
      const next = clarQueueRef.current.shift()
      if (next) {
        setCurrentClar(next)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant_clarify',
            term: next.term,
            question: next.question,
            options: next.options,
          },
        ])
      } else {
        // No more pending clarifications.
        setCurrentClar(undefined)
      }
    },
    [submitAnswer]
  )

  // input form handlers
  const [input, setInput] = useState('')
  const onSend = useCallback(() => {
    sendUserMessage(input)
    setInput('')
  }, [input, sendUserMessage])

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSend()
      }
    },
    [onSend]
  )

  // Determine whether to show input: only before running agent
  const showInput = step !== 'running'

  return (
    <Transition
      show={visible}
      as="div"
      className="top-0 right-0 h-full absolute z-30"
      enter="transition ease-in-out duration-300 transform"
      enterFrom="translate-x-full"
      enterTo="translate-x-0"
      leave="transition ease-in-out duration-300 transform"
      leaveFrom="translate-x-0"
      leaveTo="translate-x-full"
    >
      {/* Collapse button */}
      <button
        className="absolute z-10 top-7 transform rounded-full border border-gray-300 text-gray-400 bg-white hover:bg-gray-100 w-6 h-6 flex justify-center items-center left-0 -translate-x-1/2"
        onClick={onHide}
      >
        <ChevronDoubleRightIcon className="w-3 h-3" />
      </button>

      <div className="w-[324px] h-full bg-white border-l border-gray-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Analytics Agent</h3>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
          {messages.map((msg, idx) => {
            if (msg.role === 'assistant') {
              return (
                <div key={idx} className="flex flex-col space-y-1">
                  <span className="text-xs text-gray-400 flex items-center gap-x-1">
                    Assistant
                    {step === 'running' && status === 'loading' && idx === lastAssistantIdx && (
                      <span className="flex items-center space-x-0.5">
                        <span className="animate-bounce">.</span>
                        <span className="animate-bounce delay-100">.</span>
                        <span className="animate-bounce delay-200">.</span>
                      </span>
                    )}
                  </span>
                  <div className="flex">
                    <div className="bg-gray-100 text-gray-900 p-2 rounded-lg text-sm max-w-[85%]">
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            }
            if (msg.role === 'user') {
              return (
                <div key={idx} className="flex flex-col items-end space-y-1">
                  <span className="text-xs text-gray-400">You</span>
                  <div className="flex justify-end">
                    <div className="bg-indigo-500 text-white p-2 rounded-lg text-sm max-w-[85%]">
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            }
            // assistant clarification with options
            if (msg.role === 'assistant_clarify') {
              return (
                <div key={idx} className="flex flex-col space-y-1">
                  <span className="text-xs text-gray-400 flex items-center gap-x-1">
                    Assistant
                    {step === 'running' && status === 'loading' && idx === lastAssistantIdx && (
                      <span className="flex items-center space-x-0.5">
                        <span className="animate-bounce">.</span>
                        <span className="animate-bounce delay-100">.</span>
                        <span className="animate-bounce delay-200">.</span>
                      </span>
                    )}
                  </span>
                  <div className="flex">
                    <div className="bg-gray-100 p-2 rounded-lg text-sm max-w-[85%] space-y-2">
                      <p>{msg.question}</p>
                      <div className="flex flex-col space-y-1">
                        {msg.options.map((opt, j) => (
                          <button
                            key={j}
                            className="text-left border border-indigo-500 text-indigo-700 rounded px-2 py-1 hover:bg-indigo-50"
                            title={opt.tooltip}
                            onClick={() => answerClarification(msg.term, opt.value ?? opt.label)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            }
            return null
          })}
        </div>

        {/* Input area */}
        {showInput && (
          <div className="border-t border-gray-200 p-3">
            <div className="flex gap-x-2">
              <textarea
                rows={2}
                className="flex-1 border rounded p-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Type your response and hit Enter..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button
                onClick={onSend}
                className="bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </Transition>
  )
}
