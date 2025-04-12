import React from 'react'

interface SimpleComponentProps {
  title: string
}

export default function SimpleComponent({ title }: SimpleComponentProps) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-medium text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-700">
        This is a simplified component using React 18 patterns
      </p>
    </div>
  )
} 