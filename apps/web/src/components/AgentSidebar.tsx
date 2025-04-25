import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { Transition } from '@headlessui/react'
import {
  AgentEvent,
  useAgentSession,
} from '@/hooks/useAgentSession'
import { ChevronDoubleRightIcon } from '@heroicons/react/24/outline'
import { getAgentNotebookBlocks } from '@/utils/agentNotebookBlocks'
import * as Y from 'yjs'
import { YBlock } from '@briefer/editor'

interface Props {
  workspaceId: string
  visible: boolean
  onHide: () => void
  yDoc: Y.Doc
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
  yDoc,
}: Props) {
  // Only require the initial question
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'Hi there! What question would you like to explore today?',
  }])

  // Track clarifications and answers
  type Clarification = {
    term: string
    question: string
    options: { label: string; value: string; tooltip?: string }[]
  }
  const clarQueueRef = useRef<Clarification[]>([])
  const [currentClar, setCurrentClar] = useState<Clarification | undefined>()
  const [answeredClarifications, setAnsweredClarifications] = useState<Record<string, string>>({})

  // Get blocks from yDoc and summarize for agent context
  const blocks = useMemo(() => yDoc.getMap<YBlock>('blocks'), [yDoc])
  const [notebookBlocks, setNotebookBlocks] = useState(() => getAgentNotebookBlocks(Array.from(blocks.values())))
  useEffect(() => {
    setNotebookBlocks(getAgentNotebookBlocks(Array.from(blocks.values())))
  }, [blocks])

  const { events, status, start, stop, submitAnswer } = useAgentSession(question, '', '', workspaceId, notebookBlocks)
  const processedIdx = useRef(0)
  const sessionIdRef = useRef<string | null>(null)
  const hasProgressRef = useRef(false)

  // Reset state when sidebar hides
  useEffect(() => {
    if (!visible) {
      stop()
      setMessages([{ role: 'assistant', content: 'Hi there! What question would you like to explore today?' }])
      setQuestion('')
      processedIdx.current = 0
      clarQueueRef.current = []
      setCurrentClar(undefined)
      setAnsweredClarifications({})
    }
  }, [visible])

  // Process agent events
  useEffect(() => {
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
          const newClars: Clarification[] = ev.clarifications.map((c: any) => ({
            term: c.term,
            question: c.question,
            options: Array.isArray(c.options) ? c.options : [],
          }))
          clarQueueRef.current.push(...newClars)
        }
      }
      // Show next clarification if not already being shown
      if (!currentClar && clarQueueRef.current.length > 0) {
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
      if (ev.event === 'insight') {
        hasProgressRef.current = true
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: ev.summary ?? 'Here are the insights I found.',
          },
        ])
      } else if (ev.event === 'execution_result') {
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
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `I've created a ${ev.blockType} block with the relevant content in your notebook.`,
            },
          ])
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
  }, [events, currentClar])

  // State for the unified input field
  const [chatInput, setChatInput] = useState('')

  // Handle user input for initial question and follow-up
  const onSend = useCallback(() => {
    if (!chatInput.trim()) return
    setMessages((prev) => [...prev, { role: 'user', content: chatInput }])
    if (question === '') {
      setQuestion(chatInput)
      // Start agent session after question is submitted
      if (status === 'idle') {
        start(chatInput, '', '')
      }
    }
    // For follow-up, you may want to implement follow-up logic here
    setChatInput('')
  }, [chatInput, question, status, start])

  // Handle clarification answer (single-select, show selected state)
  const answerClarification = useCallback(
    async (term: string, value: string) => {
      // Prevent multiple answers for the same clarification
      if (answeredClarifications[term]) return
      setAnsweredClarifications((prev) => ({ ...prev, [term]: value }))
      setMessages((prev) => [...prev, { role: 'user', content: value }])
      await submitAnswer(term, value)
      // Show next clarification if any
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
        setCurrentClar(undefined)
      }
    },
    [submitAnswer, answeredClarifications]
  )

  // After handling agent:create_block, update notebookBlocks
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setTimeout(() => {
        setNotebookBlocks(getAgentNotebookBlocks(Array.from(yDoc.getMap<YBlock>('blocks').values())))
      }, 100)
    }
    window.addEventListener('agent:create_block', handler as any)
    return () => {
      window.removeEventListener('agent:create_block', handler as any)
    }
  }, [yDoc])

  // Track the current active clarification (unanswered)
  const activeClar = messages.findLast(
    (msg) => msg.role === 'assistant_clarify' && !answeredClarifications[msg.term]
  ) as (ChatMessage & { term: string; options: any[] }) | undefined

  useEffect(() => {
    // Clear input when a new clarification or question is expected
    setChatInput('')
  }, [activeClar?.term, question])

  // Ref for input focus management
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Focus input when it appears
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [activeClar?.term, question, status])

  return (
    <Transition
      show={visible}
      as={Fragment}
      enter="transition ease-in-out duration-300 transform"
      enterFrom="translate-x-full"
      enterTo="translate-x-0"
      leave="transition ease-in-out duration-300 transform"
      leaveFrom="translate-x-0"
      leaveTo="translate-x-full"
    >
      <div
        className="fixed top-0 right-0 bottom-0 z-30 w-[324px] h-screen flex flex-col bg-white border-l border-gray-200"
        style={{ maxWidth: 400 }}
      >
        {/* Collapse button */}
        <button
          className="absolute z-10 top-7 transform rounded-full border border-gray-300 text-gray-400 bg-white hover:bg-gray-100 w-6 h-6 flex justify-center items-center left-0 -translate-x-1/2"
          onClick={onHide}
        >
          <ChevronDoubleRightIcon className="w-3 h-3" />
        </button>

        <div className="flex flex-col h-full w-full">
          {/* Header */}
          <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Analytics Agent</h3>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 min-h-0">
            {messages.map((msg, idx) => {
              if (msg.role === 'assistant') {
                return (
                  <div key={idx} className="flex flex-col space-y-1">
                    <span className="text-xs text-gray-400 flex items-center gap-x-1">
                      Assistant
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
                const selected = answeredClarifications[msg.term]
                // For all clarifications, show quick-reply buttons if options exist
                if (msg.options && msg.options.length > 0 && !selected) {
                  return (
                    <div key={idx} className="flex flex-col space-y-1">
                      <span className="text-xs text-gray-400 flex items-center gap-x-1">
                        Assistant
                      </span>
                      <div className="flex">
                        <div className="bg-gray-100 p-2 rounded-lg text-sm max-w-[85%] space-y-2">
                          <p>{msg.question}</p>
                          <div className="flex flex-col space-y-1">
                            {msg.options.map((opt, j) => (
                              <button
                                key={j}
                                className={`text-left border border-indigo-500 rounded px-2 py-1 hover:bg-indigo-50 ${selected === (opt.value ?? opt.label)
                                  ? 'bg-indigo-500 text-white font-semibold' : 'text-indigo-700'}`}
                                title={opt.tooltip}
                                onClick={() => answerClarification(msg.term, opt.value ?? opt.label)}
                                disabled={!!selected}
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
                // For all clarifications, if already answered, show the answer
                if (selected) {
                  return (
                    <div key={idx} className="flex flex-col space-y-1">
                      <span className="text-xs text-gray-400 flex items-center gap-x-1">
                        Assistant
                      </span>
                      <div className="flex">
                        <div className="bg-gray-100 p-2 rounded-lg text-sm max-w-[85%] space-y-2">
                          <p>{msg.question}</p>
                          <div className="text-xs text-green-600 pt-1">Selected: {selected}</div>
                        </div>
                      </div>
                    </div>
                  )
                }
                // For clarifications with no options and not yet answered, just show the question (input is at bottom)
                return (
                  <div key={idx} className="flex flex-col space-y-1">
                    <span className="text-xs text-gray-400 flex items-center gap-x-1">
                      Assistant
                    </span>
                    <div className="flex">
                      <div className="bg-gray-100 p-2 rounded-lg text-sm max-w-[85%] space-y-2">
                        <p>{msg.question}</p>
                      </div>
                    </div>
                  </div>
                )
              }
              return null
            })}
          </div>

          {/* Unified input area at the bottom */}
          <div className="border-t border-gray-200 p-3 bg-white">
            {(() => {
              // If a clarification with options is active, disable input and show placeholder
              if (activeClar && activeClar.options && activeClar.options.length > 0 && !answeredClarifications[activeClar.term]) {
                return (
                  <input
                    type="text"
                    className="border-2 border-gray-200 rounded p-2 text-sm w-full bg-gray-100 text-gray-400 cursor-not-allowed"
                    placeholder="Select an option above..."
                    value=""
                    disabled
                  />
                )
              }
              // If a clarification with no options is active, show input for free text
              if (activeClar && (!activeClar.options || activeClar.options.length === 0) && !answeredClarifications[activeClar.term]) {
                return (
                  <div className="flex gap-x-2">
                    <textarea
                      ref={inputRef}
                      rows={2}
                      className="flex-1 border-2 border-indigo-400 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Type your answer and hit Enter..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (chatInput.trim()) answerClarification(activeClar.term, chatInput.trim())
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (chatInput.trim()) answerClarification(activeClar.term, chatInput.trim())
                      }}
                      className={`bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600 self-end ${!chatInput.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!chatInput.trim()}
                    >
                      Send
                    </button>
                  </div>
                )
              }
              // If no clarification is active, show input for initial question or follow-up
              if (question === '' || (!activeClar && status !== 'done')) {
                return (
                  <div className="flex gap-x-2">
                    <textarea
                      ref={inputRef}
                      rows={2}
                      className="flex-1 border-2 border-indigo-400 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder={question === '' ? 'Type your question and hit Enter...' : 'Type your follow-up and hit Enter...'}
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (chatInput.trim()) onSend()
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (chatInput.trim()) onSend()
                      }}
                      className={`bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600 self-end ${!chatInput.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!chatInput.trim()}
                    >
                      Send
                    </button>
                  </div>
                )
              }
              // Otherwise, hide input (e.g., session done)
              return null
            })()}
          </div>
        </div>
      </div>
    </Transition>
  )
}
