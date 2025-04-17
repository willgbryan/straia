import { UserIcon, BoltIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import timeAgo from '@/utils/timeAgo'
import ActionDisplay from './ActionDisplay'

interface AgentAction {
  id: string
  type: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  details: any
  result?: any
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  actions?: AgentAction[]
}

interface Props {
  message: Message
  documentId: string
}

/**
 * MessageBubble displays a single message in the conversation
 * with appropriate styling based on the sender (user or assistant).
 */
export default function MessageBubble({ message, documentId }: Props) {
  const [expanded, setExpanded] = useState(false)
  
  const toggleExpanded = () => {
    setExpanded(prev => !prev)
  }
  
  const hasActions = message.actions && message.actions.length > 0
  
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`relative max-w-[85%] rounded-lg p-3 ${
          message.role === 'user' 
            ? 'bg-primary-100 text-gray-900'
            : 'bg-white ring-1 ring-gray-200 text-gray-800'
        }`}
      >
        <div className="flex justify-between items-start gap-x-2 mb-1">
          <div className="flex items-center">
            {message.role === 'user' ? (
              <UserIcon className="h-4 w-4 text-gray-500 mr-1" />
            ) : (
              <BoltIcon className="h-4 w-4 text-primary-600 mr-1" />
            )}
            <span className="text-xs font-medium">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </span>
          </div>
          <time className="text-xs text-gray-400">
            {timeAgo(new Date(message.createdAt))}
          </time>
        </div>
        
        <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        
        {hasActions && (
          <div className="mt-2">
            <div
              className="flex items-center text-xs text-gray-500 cursor-pointer"
              onClick={toggleExpanded}
            >
              <span className={`mr-1 ${expanded ? 'text-primary-600' : ''}`}>
                {expanded ? 'Hide actions' : 'Show actions'}
              </span>
              <span className="text-xs">
                ({message.actions?.length} {message.actions?.length === 1 ? 'action' : 'actions'})
              </span>
            </div>
            
            {expanded && (
              <div className="mt-2 space-y-2">
                {message.actions?.map(action => (
                  <ActionDisplay 
                    key={action.id} 
                    action={action}
                    documentId={documentId}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 