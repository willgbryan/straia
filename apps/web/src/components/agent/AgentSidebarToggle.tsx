import { SparklesIcon } from '@heroicons/react/24/outline'
import { useState, useCallback } from 'react'
import { Tooltip } from '../Tooltips'
import AgentSidebar from './AgentSidebar'

interface Props {
  documentId: string
  workspaceId: string
}

/**
 * AgentSidebarToggle provides a button to open and close the agent sidebar
 * for interacting with notebooks through natural language.
 */
export default function AgentSidebarToggle({ documentId, workspaceId }: Props) {
  const [isOpen, setIsOpen] = useState(false)

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <>
      <Tooltip
        title="AI Assistant"
        message="Get help working with your data using natural language"
        position="bottom"
        tooltipClassname="w-64"
      >
        <button
          onClick={handleToggle}
          className="flex items-center rounded-sm px-3 py-1 text-sm text-cyan-600 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 gap-x-1.5 relative"
          data-testid="agent-sidebar-toggle"
        >
          <SparklesIcon className="w-4 h-4" />
          <span>AI Assistant</span>
          
          {/* Indicator dot for when AI is active */}
          {isOpen && (
            <span className="absolute top-0 right-0 -mt-1 -mr-1 h-2 w-2 rounded-full bg-cyan-500"></span>
          )}
        </button>
      </Tooltip>

      <AgentSidebar
        documentId={documentId}
        workspaceId={workspaceId}
        visible={isOpen}
        onHide={handleClose}
      />
    </>
  )
} 