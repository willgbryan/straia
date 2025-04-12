// User session information for AI requests
export interface UserSessionInfo {
  userId: string;
  organizationId: string;
  email?: string;
  name?: string;
}

// Generic streaming AI response type
export interface StreamingAIResponse {
  id: string;
  content: string;
  done: boolean;
  error?: string;
} 