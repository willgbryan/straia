import { useState, useEffect } from 'react';
import { DataSource } from '../types';

interface UseDataSourcesResult {
  dataSources: DataSource[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch and manage data sources for a specified workspace
 * @param workspaceId The ID of the workspace to fetch data sources for
 * @returns Object containing data sources, loading state, error state, and refetch function
 */
export function useDataSources(workspaceId: string): UseDataSourcesResult {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDataSources = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/data-assistant/datasources?workspaceId=${workspaceId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data sources: ${response.status}`);
      }

      const data = await response.json();
      setDataSources(data);
    } catch (err) {
      console.error("Error fetching data sources:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      
      // Set mock data for development
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        setDataSources([
          { id: '1', name: 'Sales Database', type: 'postgresql', description: 'Main sales transactions database' },
          { id: '2', name: 'Customer Analytics', type: 'bigquery', description: 'Customer behavior analytics' },
          { id: '3', name: 'Product Metrics', type: 'mysql', description: 'Product usage metrics' },
          { id: '4', name: 'Marketing Data', type: 'csv', description: 'Marketing campaign data' },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchDataSources();
    }
  }, [workspaceId]);

  return { dataSources, loading, error, refetch: fetchDataSources };
} 