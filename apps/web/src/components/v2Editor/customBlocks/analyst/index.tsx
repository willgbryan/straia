import React, { useState, useCallback, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import clsx from 'clsx'
import { 
  AnalystStage, ClarificationStatus,
  type Clarification, type ClarificationOption,
  type AnalystResult, type AnalystVisualization,
  educationDataSchema, sampleQuestions, analysisContextExamples
} from './mockData'
import { 
  generateClarifications, 
  generateAnalysis, 
  getDatabaseSchema 
} from '@/utils/analystApi'

interface AnalystBlockProps {
  editable?: boolean
  blockId: string
  onDelete?: () => void
  workspaceId: string
  documentId: string
}

/**
 * Analyst Block Component
 * Provides an interface for data analysis using LLM-driven insights
 */
export const AnalystBlock: React.FC<AnalystBlockProps> = ({
  editable = false,
  blockId,
  onDelete,
  workspaceId,
  documentId
}) => {
  // State for tracking current stage
  const [stage, setStage] = useState<AnalystStage>(AnalystStage.Initial)
  
  // State for initial query
  const [initialQuery, setInitialQuery] = useState({
    question: '',
    context: '',
    goal: '',
  })
  
  // State for clarifications
  const [clarifications, setClarifications] = useState<Clarification[]>([])
  
  // State for the analysis result
  const [result, setResult] = useState<AnalystResult | null>(null)
  
  // State for loading and errors
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Abort controller references
  const [abortController, setAbortController] = useState<{ abort: () => void } | null>(null)
  
  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort()
      }
    }
  }, [abortController])
  
  // Generate clarifications based on initial query
  const handleGenerateClarifications = useCallback(async () => {
    // Don't proceed if already loading or query is empty
    if (isLoading || !initialQuery.question.trim()) return
    
    // Clear previous errors
    setError(null)
    setIsLoading(true)
    
    try {
      // Get the database schema from the API (will use mock data if API fails)
      let databaseSchema = null
      try {
        databaseSchema = await getDatabaseSchema(workspaceId)
      } catch (err) {
        console.warn('Unable to fetch database schema, using mock data:', err)
        databaseSchema = JSON.stringify(educationDataSchema)
      }
      
      // Abort any ongoing requests
      if (abortController) {
        abortController.abort()
      }
      
      // Call the LLM API to generate clarifications
      const controller = await generateClarifications(
        workspaceId,
        {
          question: initialQuery.question,
          context: initialQuery.context,
          goal: initialQuery.goal,
          databaseSchema
        },
        (newClarifications) => {
          setClarifications(newClarifications)
          setStage(AnalystStage.Clarification)
          setIsLoading(false)
        },
        (error) => {
          setError(`Error generating clarifications: ${error.message}`)
          setIsLoading(false)
        }
      )
      
      setAbortController(controller)
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Failed to generate clarifications'}`)
      setIsLoading(false)
    }
  }, [initialQuery, isLoading, workspaceId, abortController])
  
  // Handle option selection for a clarification
  const handleOptionSelect = useCallback((clarificationId: string, optionId: string) => {
    setClarifications(prev => 
      prev.map(c => {
        if (c.id === clarificationId) {
          const updatedOptions = c.options.map(o => ({
            ...o,
            selected: o.id === optionId
          }))
          
          return {
            ...c,
            options: updatedOptions,
            status: ClarificationStatus.Completed,
            completed: true
          }
        }
        return c
      })
    )
  }, [])
  
  // Check if all clarifications have been completed
  const allClarificationsComplete = useCallback(() => 
    clarifications.every(c => c.completed), 
    [clarifications]
  )
  
  // Generate analysis based on clarifications
  const handleGenerateAnalysis = useCallback(async () => {
    // Don't proceed if already loading or not all clarifications are complete
    if (isLoading || !allClarificationsComplete()) return
    
    // Clear previous errors
    setError(null)
    setIsLoading(true)
    
    try {
      // Get the database schema from the API (will use mock data if API fails)
      let databaseSchema = null
      try {
        databaseSchema = await getDatabaseSchema(workspaceId)
      } catch (err) {
        console.warn('Unable to fetch database schema, using mock data:', err)
        databaseSchema = JSON.stringify(educationDataSchema)
      }
      
      // Create a map of clarification IDs to selected option values
      const clarificationSelections: Record<string, string> = {}
      clarifications.forEach(c => {
        const selectedOption = c.options.find(o => o.selected)
        if (selectedOption) {
          clarificationSelections[c.id] = selectedOption.value
        }
      })
      
      // Abort any ongoing requests
      if (abortController) {
        abortController.abort()
      }
      
      // Call the LLM API to generate analysis
      const controller = await generateAnalysis(
        workspaceId,
        {
          question: initialQuery.question,
          context: initialQuery.context,
          goal: initialQuery.goal,
          clarifications: clarificationSelections,
          databaseSchema
        },
        (analysisResult) => {
          setResult(analysisResult)
          setStage(AnalystStage.Result)
          setIsLoading(false)
        },
        (error) => {
          setError(`Error generating analysis: ${error.message}`)
          setIsLoading(false)
        }
      )
      
      setAbortController(controller)
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Failed to generate analysis'}`)
      setIsLoading(false)
    }
  }, [initialQuery, clarifications, isLoading, allClarificationsComplete, workspaceId, abortController])
  
  // Reset analysis and start over
  const handleReset = useCallback(() => {
    // Abort any ongoing requests
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
    
    setStage(AnalystStage.Initial)
    setError(null)
    setClarifications([])
    setResult(null)
  }, [abortController])
  
  // Render initial query stage
  const InitialQueryStage = () => (
    <div className="w-full flex flex-col space-y-6">
      <h2 className="text-lg font-medium">Ask the Analyst</h2>
      
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Question
        </label>
        <select 
          className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-gray-400 sm:text-sm"
          onChange={(e) => {
            if (e.target.value) {
              setInitialQuery(prev => ({ ...prev, question: e.target.value }))
            }
          }}
          disabled={isLoading}
        >
          <option value="">Select a sample question</option>
          {sampleQuestions.map((q, i) => (
            <option key={i} value={q}>{q}</option>
          ))}
        </select>
        <textarea 
          className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-gray-400 sm:text-sm"
          rows={3}
          placeholder="Or type your own question here..."
          value={initialQuery.question}
          onChange={(e) => setInitialQuery(prev => ({ ...prev, question: e.target.value }))}
          disabled={isLoading}
        />
      </div>
      
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Context
        </label>
        <textarea 
          className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-gray-400 sm:text-sm"
          rows={2}
          placeholder="Who is this analysis for? What is their role?"
          value={initialQuery.context}
          onChange={(e) => setInitialQuery(prev => ({ ...prev, context: e.target.value }))}
          disabled={isLoading}
        />
      </div>
      
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Goal
        </label>
        <textarea 
          className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-gray-400 focus:outline-none focus:ring-gray-400 sm:text-sm"
          rows={2}
          placeholder="What decisions will be made with this information?"
          value={initialQuery.goal}
          onChange={(e) => setInitialQuery(prev => ({ ...prev, goal: e.target.value }))}
          disabled={isLoading}
        />
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
          {error}
        </div>
      )}
      
      <button 
        className={clsx(
          "w-full py-2 px-4 rounded-md",
          isLoading
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : initialQuery.question.trim() 
              ? "bg-blue-600 hover:bg-blue-700 text-white" 
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
        )}
        disabled={isLoading || !initialQuery.question.trim()}
        onClick={handleGenerateClarifications}
      >
        {isLoading ? "Generating..." : "Generate Analysis"}
      </button>
    </div>
  )
  
  // Render clarification stage
  const ClarificationStage = () => (
    <div className="w-full flex flex-col space-y-6">
      <h2 className="text-lg font-medium">Clarify Your Question</h2>
      <p className="text-gray-700">
        To provide the most accurate analysis of "{initialQuery.question}", 
        please answer the following clarification questions:
      </p>
      
      {clarifications.length === 0 && isLoading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 rounded-full border-t-transparent"></div>
        </div>
      ) : (
        <>
          {clarifications.map((clarification) => (
            <div key={clarification.id} className="border border-gray-200 p-4 rounded-md">
              <div className="flex flex-col space-y-4">
                <p className="font-medium">{clarification.question}</p>
                
                <div className="space-y-2">
                  {clarification.options.map((option) => (
                    <div 
                      key={option.id}
                      className={clsx(
                        "p-3 border rounded-md cursor-pointer transition-colors",
                        option.selected 
                          ? "border-blue-500 bg-blue-50" 
                          : "border-gray-200 hover:border-gray-400"
                      )}
                      onClick={() => !isLoading && handleOptionSelect(clarification.id, option.id)}
                    >
                      <div className="font-medium">{option.label}</div>
                      {option.description && (
                        <div className="text-sm text-gray-600 mt-1">{option.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
          {error}
        </div>
      )}
      
      <div className="flex space-x-4">
        <button
          className="py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          onClick={handleReset}
          disabled={isLoading}
        >
          Back
        </button>
        
        <button
          className={clsx(
            "flex-1 py-2 px-4 rounded-md",
            isLoading
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : allClarificationsComplete() 
                ? "bg-blue-600 hover:bg-blue-700 text-white" 
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
          )}
          disabled={isLoading || !allClarificationsComplete()}
          onClick={handleGenerateAnalysis}
        >
          {isLoading ? "Generating..." : "Generate Analysis"}
        </button>
      </div>
    </div>
  )
  
  // Render the visualization
  const renderVisualization = (viz: AnalystVisualization) => {
    // Basic visualization renderer
    const highest = Math.max(...Object.values(viz.data))
    
    switch (viz.type) {
      case 'bar_chart':
        return (
          <div className="w-full h-[220px] flex flex-col space-y-2">
            <p className="font-medium mb-2">{viz.title}</p>
            <div className="h-[180px] flex items-end space-x-2">
              {Object.entries(viz.data).map(([key, value]) => (
                <div key={key} className="h-full flex flex-col justify-end flex-1">
                  <div 
                    className="w-full bg-blue-500 rounded-sm"
                    style={{ height: `${(value / highest) * 100}%`, minHeight: '10px' }}
                  />
                  <p className="text-xs truncate text-center">{key}</p>
                  <p className="text-sm font-medium text-center">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )
        
      case 'pie_chart':
        // A very basic pie chart representation
        return (
          <div className="w-full">
            <p className="font-medium mb-2">{viz.title}</p>
            <div className="flex">
              <div className="relative w-[150px] h-[150px]">
                {/* In a real implementation, this would be a proper pie chart */}
                <div className="bg-gray-100 rounded-full w-[150px] h-[150px]" />
              </div>
              <div className="flex flex-col flex-1 space-y-2">
                {Object.entries(viz.data).map(([key, value]) => (
                  <div key={key} className="flex items-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-sm" />
                    <span className="text-sm flex-1 ml-2">{key}</span>
                    <span className="text-sm font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
        
      default:
        return (
          <div>
            <p className="font-medium">{viz.title}</p>
            <p className="text-sm">Visualization type not supported</p>
          </div>
        )
    }
  }
  
  // Render result stage
  const ResultStage = () => {
    if (!result && isLoading) {
      return (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 rounded-full border-t-transparent"></div>
        </div>
      )
    }
    
    if (!result) return null
    
    return (
      <div className="w-full flex flex-col space-y-6">
        <h2 className="text-lg font-medium">Analysis Results</h2>
        
        <div className="p-4 border border-gray-200 rounded-md">
          <p className="text-gray-700">{result.summary}</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {result.visualizations.map((viz, index) => (
            <div key={index} className="border border-gray-200 p-4 rounded-md">
              {renderVisualization(viz)}
            </div>
          ))}
        </div>
        
        <div className="bg-gray-50 p-4 rounded-md">
          <h4 className="font-medium mb-2">Methodology Note</h4>
          <p className="text-sm text-gray-600">{result.methodologyNote}</p>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
            {error}
          </div>
        )}
        
        <button 
          className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          onClick={handleReset}
          disabled={isLoading}
        >
          Start New Analysis
        </button>
      </div>
    )
  }
  
  // Render current stage
  return (
    <div className="w-full p-4 border border-gray-200 rounded-md shadow-sm">
      {stage === AnalystStage.Initial && <InitialQueryStage />}
      {stage === AnalystStage.Clarification && <ClarificationStage />}
      {stage === AnalystStage.Result && <ResultStage />}
    </div>
  )
}

export default AnalystBlock 