import React from 'react'

// Simple type definitions for the different states of the assistant
export type AmbiguityTerm = 'at-risk' | 'first-gen' | 'commuter' | 'this-semester' | string

type QueryStage = 'initial' | 'clarify' | 'insight'

interface DataAssistantState {
  stage: QueryStage
  query: string
  isLoading: boolean
  error: string | null
}

interface DataAssistantProps {
  workspaceId: string
}

export default function DataAssistantSimple({ workspaceId }: DataAssistantProps) {
  const [state, setState] = React.useState<DataAssistantState>({
    stage: 'initial',
    query: '',
    isLoading: false,
    error: null
  })

  const handleSubmitQuery = React.useCallback((query: string) => {
    setState((prev: DataAssistantState) => ({ 
      ...prev, 
      query, 
      isLoading: true,
      error: null
    }))
    
    // Simulate API call
    setTimeout(() => {
      setState((prev: DataAssistantState) => ({ 
        ...prev, 
        stage: 'clarify',
        isLoading: false 
      }))
    }, 1500)
  }, [])

  const handleClarification = React.useCallback(() => {
    setState((prev: DataAssistantState) => ({ 
      ...prev, 
      isLoading: true 
    }))
    
    // Simulate API call
    setTimeout(() => {
      setState((prev: DataAssistantState) => ({ 
        ...prev, 
        stage: 'insight',
        isLoading: false 
      }))
    }, 1500)
  }, [])

  const handleReset = React.useCallback(() => {
    setState({
      stage: 'initial',
      query: '',
      isLoading: false,
      error: null
    })
  }, [])

  return (
    <div className="p-6 bg-white rounded-lg shadow max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Assistant</h2>
      
      {/* Initial Stage */}
      {state.stage === 'initial' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Ask questions about your data in natural language and get instant insights
          </p>
          
          <div className="mb-4">
            <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
              Ask a question
            </label>
            <textarea
              id="query"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., What is the average GPA of first-generation students this semester?"
              value={state.query}
              onChange={(e) => setState((prev: DataAssistantState) => ({ ...prev, query: e.target.value }))}
            />
          </div>
          
          <button
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            onClick={() => handleSubmitQuery(state.query)}
            disabled={state.isLoading || !state.query.trim()}
          >
            {state.isLoading ? 'Processing...' : 'Ask Question'}
          </button>
        </div>
      )}
      
      {/* Clarification Stage */}
      {state.stage === 'clarify' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Let's clarify some terms in your question:
          </p>
          
          <div className="p-4 bg-gray-50 rounded-md mb-4">
            <p className="text-gray-700 font-medium">{state.query}</p>
          </div>
          
          <div className="mb-4 p-4 border border-gray-200 rounded-md">
            <h3 className="text-md font-medium mb-2">What do you mean by "first-generation"?</h3>
            <div className="space-y-2">
              <label className="flex items-start">
                <input type="radio" name="first-gen" className="mt-1 mr-2" />
                <div>
                  <span className="font-medium">Neither parent has a 4-year degree</span>
                  <p className="text-sm text-gray-500">The student is the first in their immediate family to attend a 4-year college</p>
                </div>
              </label>
              <label className="flex items-start">
                <input type="radio" name="first-gen" className="mt-1 mr-2" />
                <div>
                  <span className="font-medium">First in family to attend any college</span>
                  <p className="text-sm text-gray-500">Neither parent attended any form of higher education</p>
                </div>
              </label>
            </div>
          </div>
          
          <button
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mr-2"
            onClick={handleClarification}
            disabled={state.isLoading}
          >
            {state.isLoading ? 'Processing...' : 'Continue'}
          </button>
        </div>
      )}
      
      {/* Insight Stage */}
      {state.stage === 'insight' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Here are the insights for your question:
          </p>
          
          <div className="p-4 bg-gray-50 rounded-md mb-4">
            <p className="text-gray-700 font-medium">{state.query}</p>
          </div>
          
          <div className="mb-6">
            <h3 className="text-md font-medium mb-2">Summary</h3>
            <p className="text-gray-700">
              First-generation students (defined as neither parent having a 4-year degree) have an average GPA of 3.2 this semester, which is 0.3 points lower than non-first-generation students (3.5).
            </p>
          </div>
          
          <div className="mb-6">
            <h3 className="text-md font-medium mb-2">Visualization</h3>
            <div className="h-64 bg-gray-100 rounded border border-gray-200 flex items-end justify-around p-4">
              {/* Simple bar chart visualization */}
              <div className="flex flex-col items-center">
                <div style={{ height: '60%' }} className="w-16 bg-blue-500 rounded-t"></div>
                <p className="mt-2 text-sm">First-Gen (3.2)</p>
              </div>
              <div className="flex flex-col items-center">
                <div style={{ height: '70%' }} className="w-16 bg-green-500 rounded-t"></div>
                <p className="mt-2 text-sm">Non-First-Gen (3.5)</p>
              </div>
            </div>
          </div>
          
          <button
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            onClick={handleReset}
          >
            Ask Another Question
          </button>
        </div>
      )}
      
      {/* Error state */}
      {state.error && (
        <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
          <p className="font-medium">Error</p>
          <p className="text-sm">{state.error}</p>
        </div>
      )}
    </div>
  )
} 