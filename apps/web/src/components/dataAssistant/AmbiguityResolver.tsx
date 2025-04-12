import React from 'react'
import { AmbiguityTerm } from './simplified/DataAssistantSimple'

export type Option = {
  id: string
  label: string
  description: string
  value: string
}

interface AmbiguityResolverProps {
  term: AmbiguityTerm
  title: string
  prompt: string
  options: Option[]
  onSelectOption: (value: string) => void
  onLearnMore: () => void
}

export default function AmbiguityResolver({
  term,
  title,
  prompt,
  options,
  onSelectOption,
  onLearnMore,
}: AmbiguityResolverProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          <button
            className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
            onClick={onLearnMore}
            aria-label="Learn more"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">{prompt}</p>
      </div>
      
      <div className="p-4">
        <ul className="space-y-3">
          {options.map((option) => (
            <li key={option.id}>
              <button
                className="w-full text-left p-3 border border-gray-200 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                onClick={() => onSelectOption(option.value)}
                type="button"
              >
                <div className="flex flex-col">
                  <span className="text-md font-medium text-gray-900">{option.label}</span>
                  <span className="text-sm text-gray-500 mt-1">{option.description}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
} 