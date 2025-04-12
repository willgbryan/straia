import React from 'react'

interface LearningModalProps {
  content: string
}

export default function LearningModal({ content }: LearningModalProps) {
  // If no content is provided, show a placeholder
  if (!content) {
    return (
      <div className="p-4">
        <p className="text-gray-500 italic">No educational content available for this topic.</p>
      </div>
    )
  }

  // Process the content - in a real implementation, this could be markdown or HTML
  // Here we're doing some basic parsing to demonstrate the concept
  const lines = content.split('\n')
  const sections: { title: string; content: string[] }[] = []
  
  let currentSection: { title: string; content: string[] } | null = null
  
  // Process the content into sections
  lines.forEach(line => {
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
    <div className="p-4 max-h-[70vh] overflow-y-auto">
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
    </div>
  )
} 