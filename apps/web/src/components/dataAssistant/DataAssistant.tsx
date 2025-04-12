import React from 'react'
import { useDataSources } from '../../hooks/useDatasources'
import { AmbiguityTerm } from './simplified/DataAssistantSimple'
import InitialQueryForm from './InitialQueryForm'
import ClarificationInterface from './ClarificationInterface'
import InsightPanel from './InsightPanel'
import LearningModal from './LearningModal'

// Types for the different states of the data assistant
type QueryStage = 'initial' | 'clarify' | 'query' | 'insight'

interface BaseState {
  stage: QueryStage
  query: string
  motivation: string
  problem: string
  dataSourceId: string
  isLoading: boolean
  error: string | null
}

interface InitialState extends BaseState {
  stage: 'initial'
}

interface ClarifyState extends BaseState {
  stage: 'clarify'
  termsToDefine: Record<string, string>
  clarifiedTerms: Record<string, string>
}

interface QueryState extends BaseState {
  stage: 'query'
  clarifiedTerms: Record<string, string>
  sql: string
}

interface InsightState extends BaseState {
  stage: 'insight'
  clarifiedTerms: Record<string, string>
  sql: string
  insights: {
    summary: string
    visualizations: Array<{
      type: 'bar' | 'line' | 'pie' | 'table'
      title: string
      data: any
    }>
    explanations: string[]
  }
}

type DataAssistantState = InitialState | ClarifyState | QueryState | InsightState

interface DataAssistantProps {
  workspaceId: string
}

export default function DataAssistant({ workspaceId }: DataAssistantProps) {
  // State for the data assistant
  const [state, setState] = React.useState<DataAssistantState>({
    stage: 'initial',
    query: '',
    motivation: '',
    problem: '',
    dataSourceId: '',
    isLoading: false,
    error: null
  })
  
  // State for the learning modal
  const [showLearningModal, setShowLearningModal] = React.useState(false)
  const [learningContent, setLearningContent] = React.useState('')
  
  // Fetch data sources
  const { dataSources, loading: isLoadingDataSources } = useDataSources(workspaceId)
  
  // Handle the submission of the initial query
  const handleSubmitQuery = React.useCallback((query: string, motivation: string, problem: string, dataSourceId: string) => {
    setState((prev: DataAssistantState) => ({
      ...prev,
      stage: 'clarify',
      query,
      motivation,
      problem,
      dataSourceId,
      isLoading: false,
      // These terms would typically come from the backend analysis
      termsToDefine: {
        'first-gen': 'First generation students',
        'at-risk': 'Students at risk of failing or dropping out',
        'this-semester': 'The current academic term'
      },
      clarifiedTerms: {}
    } as ClarifyState))
  }, [])
  
  // Handle the completion of the clarification stage
  const handleClarificationComplete = React.useCallback((clarifiedTerms: Record<string, string>) => {
    setState((prev: DataAssistantState) => ({
      ...prev,
      stage: 'query',
      clarifiedTerms,
      isLoading: true,
      sql: 'SELECT student_id, first_gen_status, gpa, risk_score FROM students WHERE term_id = "SPRING_2023" AND is_active = true'
    } as QueryState))
    
    // Simulate a delay for the query execution
    setTimeout(() => {
      setState((prev: DataAssistantState) => ({
        ...prev as QueryState,
        stage: 'insight',
        isLoading: false,
        insights: {
          summary: 'Based on your query about first-generation students at risk of failing this semester, the data shows that 32% of first-generation students have a GPA below 2.0, compared to 18% of non-first-generation students.',
          visualizations: [
            {
              type: 'bar',
              title: 'At-Risk Students by First-Generation Status',
              data: {
                labels: ['First-Gen', 'Non-First-Gen'],
                datasets: [
                  {
                    label: 'Percentage of At-Risk Students',
                    data: [32, 18]
                  }
                ]
              }
            },
            {
              type: 'pie',
              title: 'Distribution of At-Risk Students',
              data: {
                labels: ['First-Gen At Risk', 'First-Gen Not At Risk', 'Non-First-Gen At Risk', 'Non-First-Gen Not At Risk'],
                datasets: [
                  {
                    data: [15, 32, 12, 53]
                  }
                ]
              }
            }
          ]
        }
      } as InsightState))
    }, 2000)
  }, [])
  
  // Handle showing the learning modal
  const handleShowLearning = React.useCallback((topic: string) => {
    setShowLearningModal(true)
    setLearningContent(topic)
  }, [])
  
  // Handle hiding the learning modal
  const handleCloseLearning = React.useCallback(() => {
    setShowLearningModal(false)
  }, [])
  
  // Handle starting a new query
  const handleStartNewQuery = React.useCallback(() => {
    setState({
      stage: 'initial',
      query: '',
      motivation: '',
      problem: '',
      dataSourceId: '',
      error: null,
      isLoading: false
    } as InitialState)
    
    // These state variables are managed separately from the main DataAssistantState
    setShowLearningModal(false)
    setLearningContent('')
  }, [])
  
  // Handle resetting the data assistant
  const handleReset = React.useCallback(() => {
    setState({
      stage: 'initial',
      query: '',
      motivation: '',
      problem: '',
      dataSourceId: '',
      isLoading: false,
      error: null
    } as InitialState)
  }, [])
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* Error display */}
      {state.error && (
        <div className="mb-4 bg-red-50 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{state.error}</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Initial query form */}
      {state.stage === 'initial' && (
        <InitialQueryForm
          onSubmit={handleSubmitQuery}
          dataSources={dataSources}
          loading={isLoadingDataSources || state.isLoading}
        />
      )}
      
      {/* Clarification interface */}
      {state.stage === 'clarify' && (
        <ClarificationInterface
          query={state.query}
          termsToDefine={(state as ClarifyState).termsToDefine}
          onComplete={handleClarificationComplete}
          onShowLearning={handleShowLearning}
          isLoading={state.isLoading}
        />
      )}
      
      {/* Query execution and loading state */}
      {state.stage === 'query' && state.isLoading && (
        <div className="p-6 bg-white rounded-lg shadow text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Processing Your Request</h2>
          <p className="text-gray-600">We're analyzing your data and generating insights...</p>
        </div>
      )}
      
      {/* Insight display */}
      {state.stage === 'insight' && (
        <InsightPanel
          insights={(state as InsightState).insights}
          query={state.query}
          clarifiedTerms={(state as InsightState).clarifiedTerms}
          onReset={handleReset}
          onAskFollowUp={() => {}}
          onShowLearning={handleShowLearning}
          sql={(state as InsightState).sql}
        />
      )}
      
      {/* Learning modal */}
      {showLearningModal && (
        <div className="fixed inset-0 overflow-y-auto z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={handleCloseLearning}></div>
          <div className="relative bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-xl transform transition-all">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Educational Content</h3>
              <button
                type="button"
                className="bg-white rounded-md text-gray-400 hover:text-gray-500"
                onClick={handleCloseLearning}
              >
                <span className="sr-only">Close</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <LearningModal content={learningContent} />
            <div className="p-4 border-t border-gray-200">
              <button
                type="button"
                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
                onClick={handleCloseLearning}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 