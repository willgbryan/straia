import React from 'react'
import { useDataSources } from '../../hooks/useDatasources'
import { useDataAssistant } from '../../hooks/useDataAssistant'
import InitialQueryForm from './InitialQueryForm'
import ClarificationInterface from './ClarificationInterface'
import InsightPanel from './InsightPanel'
import LearningModal from './LearningModal'
import LoadingIndicator from '../ui/LoadingIndicator'

interface DataAssistantProps {
  workspaceId: string
}

export default function DataAssistant({ workspaceId }: DataAssistantProps) {
  // Use the data assistant hook for API communication
  const [dataAssistantState, dataAssistantApi] = useDataAssistant(workspaceId);
  
  // State for the learning modal
  const [showLearningModal, setShowLearningModal] = React.useState(false);
  const [learningContent, setLearningContent] = React.useState('');
  const [isLoadingLearning, setIsLoadingLearning] = React.useState(false);
  
  // Fetch data sources
  const { dataSources, loading: isLoadingDataSources } = useDataSources(workspaceId);
  
  // Handle the submission of the initial query
  const handleSubmitQuery = React.useCallback(
    (query: string, motivation: string, problem: string, dataSourceId: string) => {
      dataAssistantApi.analyzeQuery(query, motivation, problem, dataSourceId);
    },
    [dataAssistantApi]
  );
  
  // Handle the completion of the clarification stage
  const handleClarificationComplete = React.useCallback(
    (clarifiedTerms: Record<string, string>) => {
      if (dataAssistantState.data) {
        const { query, motivation, problem, dataSourceId } = dataAssistantState.data;
        dataAssistantApi.generateInsights(query, motivation, problem, clarifiedTerms, dataSourceId);
      }
    },
    [dataAssistantState.data, dataAssistantApi]
  );
  
  // Handle showing the learning modal
  const handleShowLearning = React.useCallback(async (topic: string) => {
    setShowLearningModal(true);
    setIsLoadingLearning(true);
    try {
      const content = await dataAssistantApi.getEducationalContent(topic);
      setLearningContent(JSON.stringify(content));
    } catch (error) {
      console.error('Error fetching educational content:', error);
      setLearningContent('Error loading educational content');
    } finally {
      setIsLoadingLearning(false);
    }
  }, [dataAssistantApi]);
  
  // Handle hiding the learning modal
  const handleCloseLearning = React.useCallback(() => {
    setShowLearningModal(false);
  }, []);
  
  // Handle resetting the data assistant
  const handleReset = React.useCallback(() => {
    dataAssistantApi.reset();
    setShowLearningModal(false);
    setLearningContent('');
  }, [dataAssistantApi]);
  
  // Map the state from the hook to the component's expected format
  const termsToDefine = React.useMemo(() => {
    if (dataAssistantState.stage === 'clarify' && dataAssistantState.data && dataAssistantState.data.ambiguousTerms) {
      // Convert from the API format to the component's expected format
      return dataAssistantState.data.ambiguousTerms.reduce((acc: Record<string, string>, term: any) => {
        acc[term.term] = term.reason;
        return acc;
      }, {});
    }
    return {};
  }, [dataAssistantState]);
  
  // Display a global loading indicator when the data assistant is in a loading state
  const isLoading = dataAssistantState.loading || isLoadingDataSources;
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* Global loading indicator */}
      {isLoading && (
        <div className="fixed top-4 right-4 z-50">
          <LoadingIndicator />
        </div>
      )}
      
      {/* Error display */}
      {dataAssistantState.error && (
        <div className="mb-4 bg-red-50 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{dataAssistantState.error.message}</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Initial query form */}
      {dataAssistantState.stage === 'initial' && (
        <InitialQueryForm
          onSubmit={handleSubmitQuery}
          dataSources={dataSources}
          loading={isLoadingDataSources || dataAssistantState.loading}
        />
      )}
      
      {/* Clarification interface */}
      {dataAssistantState.stage === 'clarify' && dataAssistantState.data && (
        <ClarificationInterface
          query={dataAssistantState.data.query}
          termsToDefine={termsToDefine}
          onComplete={handleClarificationComplete}
          onShowLearning={handleShowLearning}
          isLoading={dataAssistantState.loading}
        />
      )}
      
      {/* Query execution and loading state */}
      {dataAssistantState.stage === 'query' && (
        <div className="p-6 bg-white rounded-lg shadow text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Processing Your Request</h2>
          <p className="text-gray-600">We're analyzing your data and generating insights...</p>
          {dataAssistantState.data && dataAssistantState.data.progress && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-indigo-600 h-2.5 rounded-full" 
                  style={{ width: `${Math.min(dataAssistantState.data.progress * 100, 100)}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {dataAssistantState.data.statusMessage || 'Generating insights...'}
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Insight display */}
      {dataAssistantState.stage === 'insight' && dataAssistantState.data && (
        <InsightPanel
          insights={{
            summary: dataAssistantState.data.insights.summary || '',
            visualizations: dataAssistantState.data.insights.visualizations || [],
            explanations: dataAssistantState.data.insights.explanations || []
          }}
          query={dataAssistantState.data.query}
          clarifiedTerms={dataAssistantState.data.clarifiedTerms}
          onReset={handleReset}
          onAskFollowUp={() => {}}
          onShowLearning={handleShowLearning}
          sql={dataAssistantState.data.insights.sql}
        />
      )}
      
      {/* Learning modal */}
      {showLearningModal && (
        <LearningModal
          topic={learningContent}
          onClose={handleCloseLearning}
          isLoading={isLoadingLearning}
        />
      )}
    </div>
  );
} 