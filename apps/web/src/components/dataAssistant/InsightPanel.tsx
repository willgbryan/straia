import React from 'react'

interface Visualization {
  type: 'bar' | 'line' | 'pie' | 'table'
  title: string
  data: any
}

interface InsightPanelProps {
  insights: {
    summary: string
    explanations: string[]
    visualizations: Visualization[]
  }
  query: string
  clarifiedTerms: Record<string, string>
  onReset: () => void
  onAskFollowUp?: () => void
  onShowLearning?: (topic: string) => void
  sql?: string
}

export default function InsightPanel({
  insights,
  query,
  clarifiedTerms,
  onReset,
  onAskFollowUp,
  onShowLearning,
  sql
}: InsightPanelProps) {
  const [copied, setCopied] = React.useState(false)
  const [showSQL, setShowSQL] = React.useState(false)

  const handleCopyInsight = React.useCallback(() => {
    if (insights.summary) {
      navigator.clipboard.writeText(insights.summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [insights.summary])

  const handleLearnMoreAboutMethodology = React.useCallback(() => {
    if (onShowLearning) {
      onShowLearning('Retention Calculation Methodology')
    }
  }, [onShowLearning])

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900">Your Analysis Results</h2>
        <div className="text-sm font-medium text-gray-700 mt-2 p-3 bg-gray-50 rounded-md">
          "{query}"
        </div>
      </div>

      <div className="mt-4 space-y-6">
        {/* Summary Section */}
        {insights.summary && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-md font-medium text-gray-900">Summary</h3>
              <button
                className="text-gray-500 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100"
                onClick={handleCopyInsight}
                title="Copy to clipboard"
                type="button"
              >
                {copied ? (
                  <span className="text-green-600 text-sm">Copied!</span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-gray-700 text-sm">{insights.summary}</p>
          </div>
        )}

        {/* Visualizations Section */}
        {insights.visualizations && insights.visualizations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {insights.visualizations.map((viz, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-md font-medium text-gray-900">{viz.title}</h3>
                </div>

                {/* Simplified visualization rendering */}
                <div className="h-60 bg-gray-50 rounded-md border border-gray-200 flex items-center justify-center">
                  {viz.type === 'bar' && (
                    <div className="w-full h-full p-4 flex items-end justify-around">
                      {viz.data.labels.map((label: string, i: number) => {
                        const value = viz.data.values[i]
                        const height = `${Math.min(Math.max((value / 100) * 80, 10), 90)}%`
                        const colors = ['bg-indigo-500', 'bg-green-500', 'bg-blue-500', 'bg-purple-500']
                        return (
                          <div key={i} className="flex flex-col items-center">
                            <div 
                              className={`w-12 ${colors[i % colors.length]} rounded-t-md flex items-end justify-center`}
                              style={{ height }}
                            >
                              <span className="text-xs font-medium text-white mb-1">
                                {value}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 mt-1 max-w-[60px] truncate text-center">
                              {label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {viz.type === 'line' && (
                    <div className="w-full h-full p-4 flex flex-col justify-between relative">
                      <div className="flex-1 flex items-end relative">
                        <svg className="absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <polyline
                            points={viz.data.values.map((v: number, i: number) => 
                              `${(i / (viz.data.values.length - 1)) * 100},${100 - v}`
                            ).join(' ')}
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth="2"
                          />
                        </svg>
                        
                        {viz.data.values.map((value: number, i: number) => {
                          const x = (i / (viz.data.values.length - 1)) * 100
                          const y = 100 - value
                          return (
                            <div key={i} className="absolute" style={{ left: `${x}%`, bottom: `${y}%` }}>
                              <div className="w-2 h-2 rounded-full bg-indigo-500 border border-white -ml-1 -mb-1"></div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex justify-between mt-2">
                        {viz.data.labels.map((label: string, i: number) => (
                          <span key={i} className="text-xs text-gray-500 max-w-[40px] truncate text-center">
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {viz.type === 'table' && (
                    <div className="w-full h-full overflow-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {viz.data.columns.map((column: string, i: number) => (
                              <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {viz.data.rows.map((row: any[], rowIndex: number) => (
                            <tr key={rowIndex}>
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Explanation Section */}
        {insights.explanations && insights.explanations.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
              </svg>
              <h3 className="text-md font-medium text-blue-700">How We Calculated This</h3>
            </div>
            <ul className="text-sm text-blue-700 space-y-1 ml-7 list-disc">
              {insights.explanations.map((explanation, index) => (
                <li key={index}>{explanation}</li>
              ))}
            </ul>
            {onShowLearning && (
              <button 
                className="text-blue-600 text-sm font-medium hover:underline mt-2 ml-7"
                onClick={handleLearnMoreAboutMethodology}
                type="button"
              >
                Learn more about how this metric is calculated
              </button>
            )}
          </div>
        )}

        {/* SQL Display (Optional) */}
        {sql && (
          <div className="mt-4">
            <button
              className="text-sm text-indigo-600 hover:text-indigo-800"
              onClick={() => setShowSQL(!showSQL)}
              type="button"
            >
              {showSQL ? 'Hide SQL Query' : 'Show SQL Query'}
            </button>
            
            {showSQL && (
              <div className="mt-2 bg-gray-800 text-gray-200 p-3 rounded-md overflow-x-auto">
                <pre className="text-xs">{sql}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mt-8">
        <button
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          onClick={onReset}
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          New Question
        </button>
        
        {onAskFollowUp && (
          <button
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            onClick={onAskFollowUp}
            type="button"
          >
            Ask Follow-Up
          </button>
        )}
        
        <button
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          onClick={handleCopyInsight}
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
          </svg>
          {copied ? 'Copied!' : 'Copy Summary'}
        </button>
      </div>
    </div>
  )
} 