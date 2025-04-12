import React from 'react'
import { AmbiguityTerm } from './simplified/DataAssistantSimple'
import AmbiguityResolver, { Option } from './AmbiguityResolver'

interface ClarificationInterfaceProps {
  query: string
  termsToDefine: Record<string, string>
  onComplete: (clarifiedTerms: Record<string, string>) => void
  onShowLearning?: (topic: string) => void
  isLoading?: boolean
}

type ActiveTerm = AmbiguityTerm | null

export default function ClarificationInterface({
  query,
  termsToDefine,
  onComplete,
  onShowLearning = () => {},
  isLoading = false
}: ClarificationInterfaceProps) {
  const [clarifiedTerms, setClarifiedTerms] = React.useState<Record<string, string>>({})
  const [currentTermIndex, setCurrentTermIndex] = React.useState(0)
  
  // Extract terms that need to be resolved
  const termsToResolve = React.useMemo(() => 
    Object.keys(termsToDefine) as AmbiguityTerm[], 
  [termsToDefine])
  
  // Calculate progress
  const progress = React.useMemo(() => 
    Object.keys(clarifiedTerms).length,
  [clarifiedTerms])
  
  // Determine the active term
  const activeTerm = React.useMemo(() => 
    currentTermIndex < termsToResolve.length ? termsToResolve[currentTermIndex] : null,
  [currentTermIndex, termsToResolve])
  
  // Sample data for the terms - in a real implementation, this would come from the backend
  const termTitles: Record<string, string> = {
    'at-risk': 'At-Risk Students',
    'first-gen': 'First-Generation Students',
    'commuter': 'Commuter Students',
    'this-semester': 'Current Time Period'
  }
  
  const termPrompts: Record<string, string> = {
    'at-risk': 'What criteria would you like to use to identify "at-risk" students?',
    'first-gen': 'How would you like to define "first-generation" students?',
    'commuter': 'What distance qualifies as a "commuter" student?',
    'this-semester': 'Which time period are you interested in when referring to "this semester"?'
  }
  
  // Sample options for each term
  const termOptions: Record<string, Option[]> = {
    'at-risk': [
      {
        id: 'gpa',
        label: 'GPA Below 2.0',
        description: 'Students with a current GPA below 2.0',
        value: 'gpa_below_2.0'
      },
      {
        id: 'attendance',
        label: 'Poor Attendance',
        description: 'Students who have missed more than 20% of their classes',
        value: 'poor_attendance'
      },
      {
        id: 'multiple',
        label: 'Multiple Risk Factors',
        description: 'Students with a combination of GPA, attendance, and financial risk factors',
        value: 'multiple_factors'
      }
    ],
    'first-gen': [
      {
        id: 'no-bachelor',
        label: 'Neither Parent Has a 4-Year Degree',
        description: 'Students whose parents have not completed a bachelor\'s degree',
        value: 'no_parent_bachelors'
      },
      {
        id: 'no-college',
        label: 'First in Family to Attend College',
        description: 'Students who are the first in their immediate family to attend any college',
        value: 'first_in_family'
      }
    ],
    'commuter': [
      {
        id: 'off-campus',
        label: 'Any Off-Campus Housing',
        description: 'Students who live in any housing not owned by the institution',
        value: 'off_campus'
      },
      {
        id: '10-miles',
        label: 'More than 10 Miles',
        description: 'Students who travel more than 10 miles to campus',
        value: 'more_than_10_miles'
      },
      {
        id: '30-min',
        label: 'More than 30 Minutes',
        description: 'Students who have a commute longer than 30 minutes',
        value: 'more_than_30_minutes'
      }
    ],
    'this-semester': [
      {
        id: 'current',
        label: 'Current Academic Term',
        description: 'The current academic term in progress',
        value: 'current_term'
      },
      {
        id: 'previous',
        label: 'Previous Academic Term',
        description: 'The most recently completed academic term',
        value: 'previous_term'
      },
      {
        id: 'academic-year',
        label: 'Current Academic Year',
        description: 'All terms in the current academic year',
        value: 'current_academic_year'
      }
    ]
  }
  
  // Learning topics for each term
  const topics: Record<string, string> = {
    'at-risk': 'Student Risk Models',
    'first-gen': 'First-Generation Student Definitions',
    'commuter': 'Commuter Student Classifications',
    'this-semester': 'Academic Terms'
  }
  
  // When an option is selected for a term
  const handleSelectOption = React.useCallback((term: AmbiguityTerm, value: string) => {
    setClarifiedTerms((prev: Record<string, string>) => ({
      ...prev,
      [term]: value,
    }))
    
    // Move to the next term
    setCurrentTermIndex((index: number) => index + 1)
    
    // If all terms are resolved, submit the result
    if (currentTermIndex === termsToResolve.length - 1) {
      onComplete({
        ...clarifiedTerms,
        [term]: value,
      })
    }
  }, [clarifiedTerms, termsToResolve, currentTermIndex, onComplete])
  
  // Handle "Learn more" clicks
  const handleLearnMore = React.useCallback((term: AmbiguityTerm) => {
    if (!onShowLearning) {
      return
    }
    
    onShowLearning(topics[term] || 'Educational Content')
  }, [onShowLearning, topics])
  
  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900">Clarifying Your Question</h2>
        <p className="text-sm text-gray-500 mt-1">
          Let's clarify some terms in your question to make sure we provide the most accurate answer.
        </p>
        <div className="text-sm font-medium text-gray-800 mt-2 p-3 bg-gray-100 rounded-md">
          "{query}"
        </div>
      </div>
      
      <div className="mb-4">
        <div className="flex items-center">
          <div className="flex-1">
            <div className="relative">
              <div className="overflow-hidden h-2 mb-1 text-xs flex rounded bg-gray-200">
                <div
                  style={{ width: `${(progress / termsToResolve.length) * 100}%` }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-600"
                ></div>
              </div>
            </div>
          </div>
          <div className="ml-2 text-xs text-gray-500">
            {progress} of {termsToResolve.length}
          </div>
        </div>
      </div>
      
      {activeTerm && termOptions[activeTerm] && (
        <AmbiguityResolver
          term={activeTerm}
          title={termTitles[activeTerm] || activeTerm}
          prompt={termPrompts[activeTerm] || `How would you like to define "${activeTerm}"?`}
          options={termOptions[activeTerm] || []}
          onSelectOption={(value) => handleSelectOption(activeTerm, value)}
          onLearnMore={() => handleLearnMore(activeTerm)}
        />
      )}
      
      {isLoading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-sm text-gray-600">Processing your clarifications...</p>
        </div>
      )}
      
      {!activeTerm && !isLoading && (
        <div className="text-center py-4">
          <svg className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="mt-2 text-sm text-gray-600">All terms have been clarified! Generating insights...</p>
        </div>
      )}
    </div>
  )
} 