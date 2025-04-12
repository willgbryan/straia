import React from 'react'

interface InitialQueryFormProps {
  onSubmit: (query: string, motivation: string, problem: string, dataSourceId: string) => void
  initialQuery?: string
  initialMotivation?: string
  initialProblem?: string
  dataSources: Array<{
    id: string
    name: string
    type: string
  }>
  loading?: boolean
}

export default function InitialQueryForm({
  onSubmit,
  initialQuery = '',
  initialMotivation = '',
  initialProblem = '',
  dataSources = [],
  loading = false
}: InitialQueryFormProps) {
  const [query, setQuery] = React.useState(initialQuery)
  const [motivation, setMotivation] = React.useState(initialMotivation)
  const [problem, setProblem] = React.useState(initialProblem)
  const [dataSourceId, setDataSourceId] = React.useState<string>('')
  const [errors, setErrors] = React.useState<{
    query?: string
    motivation?: string
    problem?: string
    dataSourceId?: string
  }>({})

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    // Validate the form
    const newErrors: {
      query?: string
      motivation?: string
      problem?: string
      dataSourceId?: string
    } = {}
    
    if (!query.trim()) {
      newErrors.query = 'Please enter your question'
    }
    
    if (!motivation.trim()) {
      newErrors.motivation = 'Please explain why you want to know this'
    }
    
    if (!problem.trim()) {
      newErrors.problem = 'Please describe what you are trying to solve'
    }
    
    if (!dataSourceId) {
      newErrors.dataSourceId = 'Please select a data source'
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    
    // If validation passes, submit the form
    onSubmit(query, motivation, problem, dataSourceId)
  }

  const handleQueryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value)
    if (errors.query) {
      setErrors({ ...errors, query: undefined })
    }
  }

  const handleMotivationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMotivation(e.target.value)
    if (errors.motivation) {
      setErrors({ ...errors, motivation: undefined })
    }
  }

  const handleProblemChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setProblem(e.target.value)
    if (errors.problem) {
      setErrors({ ...errors, problem: undefined })
    }
  }

  const handleDataSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDataSourceId(e.target.value)
    if (errors.dataSourceId) {
      setErrors({ ...errors, dataSourceId: undefined })
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-lg font-medium text-gray-900 mb-6">Ask your data a question</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="mb-4">
          <label htmlFor="dataSource" className="block text-sm font-medium text-gray-700 mb-1">
            Select a data source
          </label>
          <select
            id="dataSource"
            className={`block w-full px-3 py-2 border ${
              errors.dataSourceId ? 'border-red-500' : 'border-gray-300'
            } rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500`}
            value={dataSourceId}
            onChange={handleDataSourceChange}
            disabled={loading}
          >
            <option value="">Select a data source</option>
            {dataSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name} ({source.type})
              </option>
            ))}
          </select>
          {errors.dataSourceId && (
            <p className="mt-1 text-sm text-red-600">{errors.dataSourceId}</p>
          )}
        </div>
        
        <div>
          <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
            Your question
          </label>
          <textarea
            id="query"
            name="query"
            rows={3}
            placeholder="What do you want to know about your data? (e.g., Are first-gen commuter students at risk this semester?)"
            className={`block w-full px-3 py-2 border ${
              errors.query ? 'border-red-500' : 'border-gray-300'
            } rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500`}
            value={query}
            onChange={handleQueryChange}
          />
          {errors.query && (
            <p className="mt-1 text-sm text-red-600">{errors.query}</p>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="motivation" className="block text-sm font-medium text-gray-700 mb-1">
              Why do you want to know?
            </label>
            <textarea
              id="motivation"
              name="motivation"
              rows={3}
              placeholder="What's driving this question? (e.g., I want to know whether my advising staff should proactively reach out to this group)"
              className={`block w-full px-3 py-2 border ${
                errors.motivation ? 'border-red-500' : 'border-gray-300'
              } rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500`}
              value={motivation}
              onChange={handleMotivationChange}
            />
            {errors.motivation && (
              <p className="mt-1 text-sm text-red-600">{errors.motivation}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="problem" className="block text-sm font-medium text-gray-700 mb-1">
              What are you trying to solve?
            </label>
            <textarea
              id="problem"
              name="problem"
              rows={3}
              placeholder="What problem are you trying to address? (e.g., I need to improve retention rates among vulnerable student populations)"
              className={`block w-full px-3 py-2 border ${
                errors.problem ? 'border-red-500' : 'border-gray-300'
              } rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500`}
              value={problem}
              onChange={handleProblemChange}
            />
            {errors.problem && (
              <p className="mt-1 text-sm text-red-600">{errors.problem}</p>
            )}
          </div>
        </div>
        
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Ask Question'}
          </button>
        </div>
      </form>
    </div>
  )
} 