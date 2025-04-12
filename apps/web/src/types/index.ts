// Data Assistant Types
export interface DataSource {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'bigquery' | 'csv' | 'excel' | string;
  description?: string;
}

export interface Term {
  term: string;
  description: string;
  options?: {
    value: string;
    label: string;
    description?: string;
  }[];
}

export interface ClarificationRequest {
  terms: Term[];
  message: string;
}

export interface InsightResponse {
  text: string;
  visualizations?: Visualization[];
  learnMore?: LearnMoreContent[];
}

export interface Visualization {
  type: 'table' | 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  description?: string;
  data: any; // This would be more specifically typed based on visualization library
  config?: any;
}

export interface LearnMoreContent {
  title: string;
  content: string;
  links?: {
    text: string;
    url: string;
  }[];
} 