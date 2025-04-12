import React from 'react';

interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

export default function LoadingIndicator({ 
  size = 'medium', 
  color = 'indigo' 
}: LoadingIndicatorProps) {
  // Map size to dimensions
  const dimensions = {
    small: 'h-4 w-4',
    medium: 'h-8 w-8',
    large: 'h-12 w-12',
  };

  // Map color to Tailwind color classes
  const colorClass = `border-${color}-600`;
  
  return (
    <div className="flex items-center justify-center">
      <div className={`${dimensions[size]} border-2 border-t-transparent ${colorClass} rounded-full animate-spin`}></div>
    </div>
  );
} 