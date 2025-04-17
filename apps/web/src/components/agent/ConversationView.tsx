import { useState, useEffect, useRef, FormEvent } from 'react'
import { ArrowLeftIcon, PaperAirplaneIcon, FaceSmileIcon, FaceFrownIcon } from '@heroicons/react/24/outline'
import MessageBubble from './MessageBubble'
import StreamingResponse from './StreamingResponse'
import { useSession } from '@/hooks/useAuth'
import { useAgentWebSocket } from '@/hooks/useAgentWebSocket'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  actions?: AgentAction[]
}

interface AgentAction {
  id: string
  type: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  details: any
  result?: any
}

interface Props {
  documentId: string
  workspaceId: string
  conversationId: string
  onBack: () => void
}

/**
 * ConversationView displays a single conversation thread with all messages
 * and actions, and provides an input for sending new messages.
 */
export default function ConversationView(props: Props) {
  const { documentId, workspaceId, conversationId, onBack } = props
  const session = useSession({ redirectToLogin: true })
  const [inputValue, setInputValue] = useState('')
  const [showFeedback, setShowFeedback] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  
  // Use the agent WebSocket hook
  const {
    messages,
    isLoading,
    error,
    isStreaming,
    streamingContent,
    loadConversation,
    sendMessage,
    provideFeedback
  } = useAgentWebSocket(documentId)
  
  // Reference to the messages container for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])
  
  // Load the conversation when the component mounts or conversationId changes
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId).catch(error => {
        console.error('Failed to load conversation:', error)
      })
    }
  }, [conversationId, loadConversation])
  
  // Handle sending a new message
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!inputValue.trim() || !conversationId) return
    
    try {
      // Send the message via WebSocket
      await sendMessage(conversationId, inputValue.trim())
      
      // Clear the input value after sending
      setInputValue('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }
  
  // Handle message feedback
  const handleFeedback = async (messageId: string, isPositive: boolean) => {
    try {
      await provideFeedback(messageId, isPositive, feedbackText)
      setShowFeedback(null)
      setFeedbackText('')
    } catch (error) {
      console.error('Failed to send feedback:', error)
    }
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-4 py-4 border-b border-gray-200">
        <button 
          onClick={onBack}
          className="mr-2 rounded-full p-1 text-gray-400 hover:text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <div>
          <h3 className="text-base font-medium text-gray-900">
            {conversationId === 'new-conversation' ? 'New Conversation' : 'Conversation'}
          </h3>
          <p className="text-xs text-gray-500">
            {isLoading ? 'Loading...' : `${messages.length} messages`}
          </p>
        </div>
      </div>
      
      {/* Messages content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-pulse text-gray-400">Loading conversation...</div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-40">
            <div className="text-red-500">{error}</div>
          </div>
        ) : (
          <>
            {messages.map(message => (
              <div key={message.id} className="space-y-1">
                <MessageBubble 
                  message={message}
                  documentId={documentId}
                />
                
                {message.role === 'assistant' && (
                  <div className="flex justify-end space-x-2 text-gray-400 text-xs">
                    {showFeedback === message.id ? (
                      <div className="flex items-center bg-gray-50 p-2 rounded-md">
                        <input
                          type="text"
                          placeholder="Optional feedback..."
                          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 w-48"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                        />
                        <button 
                          className="ml-2 text-green-500 hover:text-green-600"
                          onClick={() => handleFeedback(message.id, true)}
                        >
                          <FaceSmileIcon className="h-5 w-5" />
                        </button>
                        <button 
                          className="ml-1 text-red-500 hover:text-red-600"
                          onClick={() => handleFeedback(message.id, false)}
                        >
                          <FaceFrownIcon className="h-5 w-5" />
                        </button>
                        <button 
                          className="ml-1 text-gray-500 hover:text-gray-600 text-xs"
                          onClick={() => setShowFeedback(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        className="hover:text-gray-500"
                        onClick={() => setShowFeedback(message.id)}
                      >
                        Feedback
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            
            {isStreaming && (
              <StreamingResponse content={streamingContent} />
            )}
            
            {/* Invisible element for auto-scrolling */}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      {/* Message input */}
      <div className="border-t border-gray-200 px-4 py-4">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <div className="flex-1 min-w-0">
            <textarea
              rows={1}
              name="message"
              id="message"
              className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 resize-none"
              placeholder="Ask a question about your data..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSendMessage(e)
                }
              }}
            />
            <p className="mt-1 text-xs text-gray-500 text-right">
              Press <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded">⌘</kbd> + <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded">Enter</kbd> to send
            </p>
          </div>
          <button
            type="submit"
            disabled={isStreaming || !inputValue.trim()}
            className="inline-flex items-center justify-center rounded-md bg-primary-600 p-2 text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  )
} 