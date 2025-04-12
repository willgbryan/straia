/**
 * Utility functions for audit logging
 */

interface AIInteractionLog {
  userId: string;
  workspaceId: string;
  action: string;
  input: any;
  output?: any;
  timestamp: Date;
}

/**
 * Logs an AI interaction for audit purposes
 * @param interaction The interaction details to log
 */
export function logAIInteraction(interaction: AIInteractionLog): void {
  // Get the formatted timestamp
  const timestamp = interaction.timestamp.toISOString();
  
  // Create a simplified version of the interaction for logging
  const logEntry = {
    timestamp,
    userId: interaction.userId,
    workspaceId: interaction.workspaceId,
    action: interaction.action,
    input: interaction.input
  };
  
  // For real implementation, this would write to a database or audit log service
  // For now, just log to console with a distinct prefix for easy filtering
  console.log(`[AI-AUDIT] ${JSON.stringify(logEntry)}`);
  
  // TODO: In a production environment, implement:
  // 1. Write to database (e.g., using Prisma)
  // 2. Send to external logging service
  // 3. Implement log rotation and retention policies
} 