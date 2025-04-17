import { Transition } from '@headlessui/react'
import { useRef, useEffect, useState, useCallback } from 'react'
import { ChevronDoubleRightIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useStringQuery } from '@/hooks/useQueryArgs'
import ScrollBar from '../ScrollBar'
import ConversationList from './ConversationList'
import ConversationView from './ConversationView'
import { useAgentWebSocket } from '@/hooks/useAgentWebSocket'

interface Props {
  documentId: string
  workspaceId: string
  visible: boolean
  onHide: () => void
}

/**
 * AgentSidebar is the main container for the agent interface.
 * It handles the display of conversations and messages.
 */
export default function AgentSidebar(props: Props) {
  const { documentId, workspaceId, visible, onHide } = props
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [featureError, setFeatureError] = useState<string | null>(null)
  
  // Use the agent WebSocket hook
  const { createConversation, isLoading, error } = useAgentWebSocket(documentId)
  
  // Scroll to bottom when content changes
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current && visible) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [visible, activeConversationId])

  // Handle back button from conversation view to list
  const handleBackToList = useCallback(() => {
    setActiveConversationId(null)
  }, [])

  // Handle selecting a conversation
  const handleSelectConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId)
  }, [])

  // Handle creating a new conversation
  const handleCreateConversation = useCallback(async () => {
    try {
      const newConversationId = await createConversation()
      if (newConversationId) {
        setActiveConversationId(newConversationId)
        setFeatureError(null) // Clear any previous error
      }
    } catch (error) {
      console.error('Error creating conversation:', error)
      
      // Check if this is a "feature not available" error
      if (error instanceof Error && 
          error.message && 
          error.message.includes('Feature not available')) {
        setFeatureError('The AI Agent feature is not fully configured yet. The database tables for agent conversations have not been created.');
      }
    }
  }, [createConversation])

  // Check for feature availability error from the WebSocket hook
  useEffect(() => {
    if (error && error.includes('Feature not available')) {
      setFeatureError('The AI Agent feature is not fully configured yet. The database tables for agent conversations have not been created.');
    }
  }, [error])

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
      <div className="relative h-full w-[360px] flex flex-col bg-white shadow-xl border-l border-gray-200">
        <div className="sticky top-0 z-10 flex justify-end px-4 py-3 bg-white border-b border-gray-200">
          <button
            className="rounded-full bg-gray-100 p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            onClick={onHide}
            aria-label="Close sidebar"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        
        {featureError ? (
          <div className="flex-1 p-6">
            <div className="bg-yellow-50 p-4 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">Feature Not Available</h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>{featureError}</p>
                    <p className="mt-2">Please contact your administrator to complete the configuration.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ScrollBar
            className="flex-1 flex flex-col overflow-y-auto h-full"
            ref={ref}
          >
            {activeConversationId ? (
              <ConversationView
                documentId={documentId}
                workspaceId={workspaceId}
                conversationId={activeConversationId}
                onBack={handleBackToList}
              />
            ) : (
              <ConversationList
                documentId={documentId}
                workspaceId={workspaceId}
                onSelectConversation={handleSelectConversation}
                onCreateConversation={handleCreateConversation}
              />
            )}
          </ScrollBar>
        )}
      </div>
    </Transition>
  )
} 