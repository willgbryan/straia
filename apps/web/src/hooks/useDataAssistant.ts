import { useState, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { NEXT_PUBLIC_API_WS_URL } from '@/utils/env';

// Types for different stages of the data assistant workflow
export type AmbiguityTerm = string;

export interface DataAssistantResult {
  stage: 'initial' | 'analyze' | 'clarify' | 'query' | 'insight';
  data?: any;
  loading: boolean;
  error?: Error;
}

export interface DataAssistantAPI {
  analyzeQuery: (query: string, motivation: string, problem: string, dataSourceId: string) => Promise<any>;
  clarifyTerms: (query: string, motivation: string, problem: string, clarifiedTerms: Record<string, string>) => Promise<any>;
  generateInsights: (query: string, motivation: string, problem: string, clarifiedTerms: Record<string, string>, dataSourceId: string) => Promise<any>;
  getEducationalContent: (topic: string) => Promise<any>;
  reset: () => void;
}

export type UseDataAssistant = [DataAssistantResult, DataAssistantAPI];

export interface QueryAnalysisInput {
  query: string;
  motivation: string;
  problem: string;
  dataSourceId: string;
}

export interface ClarifyTermsInput {
  query: string;
  motivation: string;
  problem: string;
  clarified_terms: Record<string, string>;
}

export interface InsightGenerationInput {
  query: string;
  motivation: string;
  problem: string;
  clarified_terms: Record<string, string>;
  data_source_id: string;
}

export interface EducationalContentInput {
  topic: string;
  level?: string;
}

/**
 * Custom hook for interacting with the Data Assistant API
 * @param workspaceId The ID of the current workspace
 * @returns A tuple with the current state and API methods
 */
export const useDataAssistant = (workspaceId: string): UseDataAssistant => {
  const [state, setState] = useState<DataAssistantResult>({
    stage: 'initial',
    data: undefined,
    loading: false,
    error: undefined,
  });

  // Method to analyze a natural language query
  const analyzeQuery = useCallback(
    async (query: string, motivation: string, problem: string, dataSourceId: string): Promise<any> => {
      setState({
        stage: 'analyze',
        loading: true,
        error: undefined,
        data: undefined,
      });

      return new Promise<any>((resolve, reject) => {
        let finished = false;
        let error: Error | undefined = undefined;
        let finalData: any = null;

        const socket = io(NEXT_PUBLIC_API_WS_URL(), {
          withCredentials: true,
        });

        socket.on('data-assistant-analyze-query-output', (data) => {
          finalData = JSON.parse(data.content);
          setState((s) => ({ ...s, data: finalData }));
        });

        socket.on('data-assistant-analyze-query-finish', () => {
          finished = true;
          setState((s) => ({ ...s, loading: false, stage: 'clarify' }));
        });

        socket.on('disconnect', () => {
          if (finished) {
            resolve(finalData);
          } else {
            const err = error ?? new Error('Disconnected from the server');
            console.error(err);
            setState((s) => ({
              ...s,
              loading: false,
              error: err,
            }));
            reject(err);
          }
        });

        socket.on('error', (err) => {
          setState((s) => ({
            ...s,
            loading: false,
            error: new Error(`Socket error: ${err.message}`),
          }));
        });

        socket.on('data-assistant-analyze-query-error', (data) => {
          error = new Error(data.error);
          setState((s) => ({
            ...s,
            loading: false,
            error,
          }));
        });

        socket.emit('data-assistant-analyze-query', {
          workspaceId,
          query,
          motivation,
          problem,
          dataSourceId,
        });
      });
    },
    [workspaceId, setState]
  );

  // Method to clarify ambiguous terms
  const clarifyTerms = useCallback(
    async (query: string, motivation: string, problem: string, clarifiedTerms: Record<string, string>): Promise<any> => {
      setState({
        stage: 'clarify',
        loading: true,
        error: undefined,
        data: {
          ...state.data,
          clarifiedTerms,
        },
      });

      return new Promise<any>((resolve, reject) => {
        let finished = false;
        let error: Error | undefined = undefined;
        let finalData: any = null;

        const socket = io(NEXT_PUBLIC_API_WS_URL(), {
          withCredentials: true,
        });

        socket.on('data-assistant-clarify-terms-output', (data) => {
          finalData = JSON.parse(data.content);
          setState((s) => ({ ...s, data: { ...s.data, ...finalData } }));
        });

        socket.on('data-assistant-clarify-terms-finish', () => {
          finished = true;
          setState((s) => ({ ...s, loading: false, stage: 'query' }));
        });

        socket.on('disconnect', () => {
          if (finished) {
            resolve(finalData);
          } else {
            const err = error ?? new Error('Disconnected from the server');
            console.error(err);
            setState((s) => ({
              ...s,
              loading: false,
              error: err,
            }));
            reject(err);
          }
        });

        socket.on('error', (err) => {
          setState((s) => ({
            ...s,
            loading: false,
            error: new Error(`Socket error: ${err.message}`),
          }));
        });

        socket.on('data-assistant-clarify-terms-error', (data) => {
          error = new Error(data.error);
          setState((s) => ({
            ...s,
            loading: false,
            error,
          }));
        });

        socket.emit('data-assistant-clarify-terms', {
          workspaceId,
          query,
          motivation,
          problem,
          clarified_terms: clarifiedTerms,
        });
      });
    },
    [workspaceId, setState, state.data]
  );

  // Method to generate insights
  const generateInsights = useCallback(
    async (
      query: string,
      motivation: string,
      problem: string,
      clarifiedTerms: Record<string, string>,
      dataSourceId: string
    ): Promise<any> => {
      setState({
        stage: 'query',
        loading: true,
        error: undefined,
        data: {
          ...state.data,
          clarifiedTerms,
        },
      });

      return new Promise<any>((resolve, reject) => {
        let finished = false;
        let error: Error | undefined = undefined;
        let finalData: any = null;

        const socket = io(NEXT_PUBLIC_API_WS_URL(), {
          withCredentials: true,
        });

        socket.on('data-assistant-generate-insights-output', (data) => {
          finalData = JSON.parse(data.content);
          setState((s) => ({ ...s, data: { ...s.data, insights: finalData } }));
        });

        socket.on('data-assistant-generate-insights-finish', () => {
          finished = true;
          setState((s) => ({ ...s, loading: false, stage: 'insight' }));
        });

        socket.on('disconnect', () => {
          if (finished) {
            resolve(finalData);
          } else {
            const err = error ?? new Error('Disconnected from the server');
            console.error(err);
            setState((s) => ({
              ...s,
              loading: false,
              error: err,
            }));
            reject(err);
          }
        });

        socket.on('error', (err) => {
          setState((s) => ({
            ...s,
            loading: false,
            error: new Error(`Socket error: ${err.message}`),
          }));
        });

        socket.on('data-assistant-generate-insights-error', (data) => {
          error = new Error(data.error);
          setState((s) => ({
            ...s,
            loading: false,
            error,
          }));
        });

        socket.emit('data-assistant-generate-insights', {
          workspaceId,
          query,
          motivation,
          problem,
          clarified_terms: clarifiedTerms,
          data_source_id: dataSourceId,
        });
      });
    },
    [workspaceId, setState, state.data]
  );

  // Method to get educational content
  const getEducationalContent = useCallback(
    async (topic: string): Promise<any> => {
      return new Promise<any>((resolve, reject) => {
        let finished = false;
        let error: Error | undefined = undefined;
        let finalData: any = null;

        const socket = io(NEXT_PUBLIC_API_WS_URL(), {
          withCredentials: true,
        });

        socket.on('data-assistant-educational-content-output', (data) => {
          finalData = JSON.parse(data.content);
        });

        socket.on('data-assistant-educational-content-finish', () => {
          finished = true;
          resolve(finalData);
        });

        socket.on('disconnect', () => {
          if (finished) {
            resolve(finalData);
          } else {
            const err = error ?? new Error('Disconnected from the server');
            console.error(err);
            reject(err);
          }
        });

        socket.on('error', (err) => {
          reject(new Error(`Socket error: ${err.message}`));
        });

        socket.on('data-assistant-educational-content-error', (data) => {
          error = new Error(data.error);
          reject(error);
        });

        socket.emit('data-assistant-educational-content', {
          workspaceId,
          topic,
          level: 'educational administrators', // Default level
        });
      });
    },
    [workspaceId]
  );

  // Method to reset the state
  const reset = useCallback(() => {
    setState({
      stage: 'initial',
      data: undefined,
      loading: false,
      error: undefined,
    });
  }, [setState]);

  // Return the current state and API methods
  return useMemo(
    () => [
      state,
      {
        analyzeQuery,
        clarifyTerms,
        generateInsights,
        getEducationalContent,
        reset,
      },
    ],
    [state, analyzeQuery, clarifyTerms, generateInsights, getEducationalContent, reset]
  );
}; 