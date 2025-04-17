import { 
  CodeBracketIcon, 
  ChartBarIcon, 
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon
} from '@heroicons/react/24/outline'
import { useState } from 'react'

interface AgentAction {
  id: string
  type: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  details: any
  result?: any
}

interface Props {
  action: AgentAction
  documentId: string
}

/**
 * ActionDisplay shows agent actions with appropriate formatting and options
 * based on the action type (SQL, Python, Visualization, etc.).
 */
export default function ActionDisplay({ action, documentId }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const toggleExpanded = () => {
    setIsExpanded(prev => !prev)
  }
  
  // Function to navigate to a specific block in the document
  const navigateToBlock = (blockId: string) => {
    // This will be implemented properly with router/navigation
    console.log(`Navigate to block ${blockId} in document ${documentId}`)
    window.alert(`This would navigate to block ${blockId}`)
  }
  
  // Determine icon based on action type
  const getActionIcon = () => {
    switch (action.type) {
      case 'sql_query':
        return <CodeBracketIcon className="h-4 w-4 text-blue-500" />
      case 'python_code':
        return <CodeBracketIcon className="h-4 w-4 text-green-500" />
      case 'visualization':
        return <ChartBarIcon className="h-4 w-4 text-purple-500" />
      case 'markdown':
        return <DocumentTextIcon className="h-4 w-4 text-gray-500" />
      default:
        return <CodeBracketIcon className="h-4 w-4 text-gray-500" />
    }
  }
  
  // Determine status icon based on action status
  const getStatusIcon = () => {
    switch (action.status) {
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />
      case 'pending':
        return <ClockIcon className="h-4 w-4 text-yellow-500" />
      case 'in_progress':
        return <ArrowPathIcon className="h-4 w-4 text-blue-500" />
      case 'failed':
        return <XCircleIcon className="h-4 w-4 text-red-500" />
      default:
        return <ClockIcon className="h-4 w-4 text-gray-500" />
    }
  }
  
  // Format action type for display
  const getActionTypeDisplay = () => {
    switch (action.type) {
      case 'sql_query':
        return 'SQL Query'
      case 'python_code':
        return 'Python Code'
      case 'visualization':
        return 'Visualization'
      case 'markdown':
        return 'Markdown'
      case 'execute_block':
        return 'Execute Block'
      case 'update_block':
        return 'Update Block'
      default:
        return action.type.replace(/_/g, ' ')
    }
  }
  
  // Render content based on action type
  const renderActionContent = () => {
    if (!isExpanded) return null
    
    switch (action.type) {
      case 'sql_query':
        return (
          <div className="mt-1 p-2 bg-gray-50 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto">
            {action.details.query}
          </div>
        )
      case 'python_code':
        return (
          <div className="mt-1 p-2 bg-gray-50 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto">
            {action.details.code}
          </div>
        )
      case 'visualization':
        return (
          <div className="mt-1">
            <div className="text-xs">
              <span className="font-semibold">Chart Type:</span> {action.details.chartType}
            </div>
            {action.details.xAxis && (
              <div className="text-xs">
                <span className="font-semibold">X Axis:</span> {action.details.xAxis}
              </div>
            )}
            {action.details.yAxis && (
              <div className="text-xs">
                <span className="font-semibold">Y Axis:</span> {action.details.yAxis}
              </div>
            )}
          </div>
        )
      default:
        return null
    }
  }
  
  return (
    <div className="border border-gray-200 rounded-md p-2 bg-gray-50 text-xs">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          {getActionIcon()}
          <span className="font-medium">{getActionTypeDisplay()}</span>
          <span className="text-gray-500">·</span>
          <span className="flex items-center">
            {getStatusIcon()}
            <span className="ml-1 text-gray-600 capitalize">{action.status}</span>
          </span>
        </div>
        
        <div className="flex space-x-1">
          <button 
            onClick={toggleExpanded}
            className="text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? 'Hide' : 'Show'}
          </button>
          
          {action.result?.blockId && (
            <button
              onClick={() => navigateToBlock(action.result.blockId)}
              className="ml-2 inline-flex items-center text-primary-600 hover:text-primary-800"
            >
              <ArrowTopRightOnSquareIcon className="h-3 w-3 mr-1" />
              View
            </button>
          )}
        </div>
      </div>
      
      {renderActionContent()}
    </div>
  )
} 