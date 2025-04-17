import { Transition } from '@headlessui/react'
import { useRef, useEffect, useState, useCallback } from 'react'
import { ChevronDoubleRightIcon } from '@heroicons/react/24/outline'
import { useStringQuery } from '@/hooks/useQueryArgs'
import ScrollBar from '../ScrollBar'
import ConversationList from './ConversationList'
import ConversationView from './ConversationView'

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
    // This will be implemented with WebSocket integration
    console.log('Creating new conversation for document', documentId)
    // For now, we'll just simulate creating a conversation
    setActiveConversationId('new-conversation')
  }, [documentId])

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
      <button
        className="absolute z-10 top-7 transform rounded-full border border-gray-300 text-gray-400 bg-white hover:bg-gray-100 w-6 h-6 flex justify-center items-center left-0 -translate-x-1/2"
        onClick={onHide}
      >
        <ChevronDoubleRightIcon className="w-3 h-3" />
      </button>
      <ScrollBar
        className="w-[360px] flex flex-col overflow-y-auto border-l border-gray-200 h-full bg-white"
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
    </Transition>
  )
} 