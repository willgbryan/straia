import React from 'react'
import LoadingIndicator from '../ui/LoadingIndicator'

interface LearningModalProps {
  topic: string
  onClose: () => void
  isLoading?: boolean
}

export default function LearningModal({ topic, onClose, isLoading = false }: LearningModalProps) {
  // If no content is provided, show a placeholder
  if (!topic) {
    return (
      <div className="fixed inset-0 overflow-y-auto z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose}></div>
        <div className="relative bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-xl transform transition-all">
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Educational Content</h3>
            <button
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-4">
            <p className="text-gray-500 italic">No educational content available for this topic.</p>
          </div>
          <div className="p-4 border-t border-gray-200">
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Try to parse the content as JSON if it's a string
  let parsedContent: any;
  try {
    if (typeof topic === 'string') {
      parsedContent = JSON.parse(topic);
    } else {
      parsedContent = topic;
    }
  } catch (error) {
    // If parsing fails, use the raw content
    parsedContent = { content: topic };
  }

  // Extract content from the parsed data
  const content = parsedContent.content || parsedContent.title || topic;

  // Process the content - in a real implementation, this could be markdown or HTML
  // Here we're doing some basic parsing to demonstrate the concept
  const lines = content.split('\n')
  const sections: { title: string; content: string[] }[] = []
  
  let currentSection: { title: string; content: string[] } | null = null
  
  // Process the content into sections
  lines.forEach((line: string) => {
    // Trim the line
    const trimmedLine = line.trim()
    
    // Skip empty lines
    if (!trimmedLine) return
    
    // Check if this is a header
    if (trimmedLine.startsWith('## ')) {
      // If we have a current section, push it
      if (currentSection) {
        sections.push(currentSection)
      }
      
      // Start a new section
      currentSection = {
        title: trimmedLine.replace('## ', ''),
        content: []
      }
    } else if (currentSection) {
      // Add to the current section
      currentSection.content.push(trimmedLine)
    } else {
      // If no section has been started yet, create one with a default title
      currentSection = {
        title: 'Overview',
        content: [trimmedLine]
      }
    }
  })
  
  // Don't forget to add the last section
  if (currentSection) {
    sections.push(currentSection)
  }

  return (
    <div className="fixed inset-0 overflow-y-auto z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-xl transform transition-all">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {parsedContent.title || 'Educational Content'}
          </h3>
          <button
            type="button"
            className="bg-white rounded-md text-gray-400 hover:text-gray-500"
            onClick={onClose}
          >
            <span className="sr-only">Close</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <LoadingIndicator size="large" />
              <p className="ml-4 text-gray-600">Loading educational content...</p>
            </div>
          ) : (
            <>
              {sections.map((section, index) => (
                <div key={index} className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{section.title}</h3>
                  <div className="prose prose-sm max-w-none">
                    {section.content.map((paragraph, i) => (
                      <p key={i} className="mb-3 text-gray-700">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Display definitions if available */}
              {parsedContent.definitions && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Definitions</h3>
                  <dl className="space-y-2">
                    {Object.entries(parsedContent.definitions).map(([term, definition], i) => (
                      <div key={i}>
                        <dt className="font-medium text-gray-800">{term}</dt>
                        <dd className="text-gray-700 ml-4">{String(definition)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              
              {/* Display resources if available */}
              {parsedContent.resources && parsedContent.resources.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Additional Resources</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {parsedContent.resources.map((resource: any, i: number) => (
                      <li key={i}>
                        <span className="font-medium">{resource.title}</span> - {resource.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <div className="p-4 border-t border-gray-200">
          <button
            type="button"
            className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
} 