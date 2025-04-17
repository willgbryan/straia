import { useEffect, useState } from 'react'
import { ChatBubbleLeftRightIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import timeAgo from '@/utils/timeAgo'
import { useAgentWebSocket } from '@/hooks/useAgentWebSocket'

interface AgentConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastMessage?: string
}

interface Props {
  documentId: string
  workspaceId: string
  onSelectConversation: (conversationId: string) => void
  onCreateConversation: () => void
}

/**
 * ConversationList displays all conversations for the current document
 * and allows creating new ones.
 */
export default function ConversationList(props: Props) {
  const { documentId, workspaceId, onSelectConversation, onCreateConversation } = props
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  
  // Use the agent WebSocket hook to get conversations
  const {
    conversations,
    isLoading,
    error,
    deleteConversation,
    refreshConversations
  } = useAgentWebSocket(documentId)
  
  // Refresh conversations when the component mounts
  useEffect(() => {
    refreshConversations()
  }, [refreshConversations])
  
  // Handle deleting a conversation
  const handleDeleteConfirm = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation() // Prevent triggering onSelectConversation
    setDeleteConfirm(conversationId)
  }
  
  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering onSelectConversation
    setDeleteConfirm(null)
  }
  
  const handleDeleteConversation = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation() // Prevent triggering onSelectConversation
    try {
      await deleteConversation(conversationId)
      setDeleteConfirm(null)
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }
  
  // Get the last message content for display
  const getLastMessagePreview = (conversation: AgentConversation) => {
    if (conversation.lastMessage) {
      return conversation.lastMessage
    }
    return 'No messages yet'
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Agent Conversations</h3>
          <button
            onClick={onCreateConversation}
            className="rounded-full bg-primary-600 p-1.5 text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Start a new conversation with the Briefer AI Assistant
        </p>
      </div>

      <div className="border-t border-gray-200">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-pulse text-gray-400">Loading conversations...</div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-40 text-red-500">
            {error}
            <button 
              onClick={() => refreshConversations()}
              className="ml-2 text-primary-600 hover:text-primary-800 underline"
            >
              Retry
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 h-40">
            <ChatBubbleLeftRightIcon className="h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No conversations yet</p>
            <button
              onClick={onCreateConversation}
              className="mt-4 inline-flex items-center px-3 py-2 text-sm font-semibold text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-500"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
              New Conversation
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {conversations.map((conversation) => (
              <li
                key={conversation.id}
                className="relative hover:bg-gray-50 cursor-pointer"
              >
                {deleteConfirm === conversation.id ? (
                  <div className="px-4 py-3 bg-red-50">
                    <p className="text-sm text-red-700">Delete this conversation?</p>
                    <div className="mt-1 flex space-x-2">
                      <button 
                        className="text-xs bg-red-600 text-white px-2 py-1 rounded"
                        onClick={(e) => handleDeleteConversation(e, conversation.id)}
                      >
                        Delete
                      </button>
                      <button 
                        className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded"
                        onClick={handleDeleteCancel}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="px-4 py-3 flex justify-between gap-x-3"
                    onClick={() => onSelectConversation(conversation.id)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {conversation.title || "New Conversation"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 truncate">
                        {getLastMessagePreview(conversation)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end py-0.5">
                      <p className="text-xs text-gray-400">
                        {timeAgo(new Date(conversation.updatedAt))}
                      </p>
                      <button 
                        className="mt-1 text-gray-400 hover:text-red-500"
                        onClick={(e) => handleDeleteConfirm(e, conversation.id)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
} 