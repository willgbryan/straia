import { BoltIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'

interface Props {
  content: string
}

/**
 * StreamingResponse displays a message that is being streamed from the agent,
 * including a typing indicator when appropriate.
 */
export default function StreamingResponse({ content }: Props) {
  const [showCursor, setShowCursor] = useState(true)
  
  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 500)
    
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div className="flex justify-start">
      <div className="relative max-w-[85%] rounded-lg p-3 bg-white ring-1 ring-gray-200 text-gray-800">
        <div className="flex justify-between items-start gap-x-2 mb-1">
          <div className="flex items-center">
            <BoltIcon className="h-4 w-4 text-primary-600 mr-1" />
            <span className="text-xs font-medium">Assistant</span>
          </div>
          <div className="text-xs text-primary-500 animate-pulse">typing...</div>
        </div>
        
        <div className="whitespace-pre-wrap text-sm">
          {content}
          {showCursor && <span className="inline-block w-2 h-4 bg-primary-400 ml-0.5 align-middle animate-pulse"></span>}
        </div>
      </div>
    </div>
  )
} 