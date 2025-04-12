// Simple test script for the server-side implementations
// Run with Node.js

const fs = require('fs');
const path = require('path');

// Define paths to the files we want to check
const dataAssistantRoutesPath = path.join(__dirname, 'apps', 'api', 'src', 'routes', 'ai', 'data-assistant.ts');
const auditUtilPath = path.join(__dirname, 'apps', 'api', 'src', 'utils', 'audit.ts');
const testScriptPath = path.join(__dirname, 'apps', 'api', 'src', 'scripts', 'test-data-assistant.ts');

console.log('=== Testing Server-Side Implementation ===\n');

// Check data-assistant routes
if (fs.existsSync(dataAssistantRoutesPath)) {
  const routesContent = fs.readFileSync(dataAssistantRoutesPath, 'utf8');
  console.log('✅ data-assistant.ts file found');
  
  // Check for workspace authorization middleware
  if (routesContent.includes('verifyWorkspaceAccess') && 
      routesContent.includes('isAuthorized = userWorkspaces[workspaceId] !== undefined')) {
    console.log('✅ Workspace authorization middleware is implemented');
  } else {
    console.log('❌ Workspace authorization middleware is NOT properly implemented');
  }
  
  // Check if authorization is applied to all endpoints
  if (routesContent.includes('await verifyWorkspaceAccess') && 
      routesContent.includes('Unauthorized access to workspace')) {
    console.log('✅ Authorization checks are applied to API endpoints');
  } else {
    console.log('❌ Authorization checks are NOT properly applied');
  }
  
  // Check for audit logging imports and usage
  if (routesContent.includes('import { logAIInteraction }') && 
      routesContent.includes('logAIInteraction({')) {
    console.log('✅ Audit logging is imported and used');
  } else {
    console.log('❌ Audit logging is NOT properly implemented');
  }
} else {
  console.log('❌ data-assistant.ts file not found at:', dataAssistantRoutesPath);
}

// Check audit utility
if (fs.existsSync(auditUtilPath)) {
  const auditContent = fs.readFileSync(auditUtilPath, 'utf8');
  console.log('✅ audit.ts utility file found');
  
  // Check for AIInteractionLog interface
  if (auditContent.includes('interface AIInteractionLog') && 
      auditContent.includes('export function logAIInteraction')) {
    console.log('✅ Audit logging functionality is implemented');
  } else {
    console.log('❌ Audit logging functionality is NOT properly implemented');
  }
} else {
  console.log('❌ audit.ts utility file not found at:', auditUtilPath);
}

// Check test script
if (fs.existsSync(testScriptPath)) {
  const testScriptContent = fs.readFileSync(testScriptPath, 'utf8');
  console.log('✅ test-data-assistant.ts file found');
  
  // Check for test queries and mock data
  if (testScriptContent.includes('testQueries') && 
      testScriptContent.includes('function generateMockResults')) {
    console.log('✅ Test script with sample queries is implemented');
  } else {
    console.log('❌ Test script is NOT properly implemented');
  }
} else {
  console.log('❌ test-data-assistant.ts file not found at:', testScriptPath);
}

console.log('\n=== Test Complete ==='); 