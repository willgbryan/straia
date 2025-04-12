// Simple test script for the LearningModal component
// Run with Node.js

const fs = require('fs');
const path = require('path');

// Read the LearningModal component
const learningModalPath = path.join(__dirname, 'apps', 'web', 'src', 'components', 'dataAssistant', 'LearningModal.tsx');
const loadingIndicatorPath = path.join(__dirname, 'apps', 'web', 'src', 'components', 'ui', 'LoadingIndicator.tsx');

console.log('=== Testing LearningModal Component ===\n');

// Check if LearningModal component exists
if (fs.existsSync(learningModalPath)) {
  const learningModalContent = fs.readFileSync(learningModalPath, 'utf8');
  console.log('✅ LearningModal component found');
  
  // Check if isLoading prop is defined in the interface
  if (learningModalContent.includes('isLoading?: boolean')) {
    console.log('✅ isLoading prop is defined in the interface');
  } else {
    console.log('❌ isLoading prop is NOT defined in the interface');
  }
  
  // Check if LoadingIndicator is imported
  if (learningModalContent.includes("import LoadingIndicator from '../ui/LoadingIndicator'")) {
    console.log('✅ LoadingIndicator is properly imported');
  } else {
    console.log('❌ LoadingIndicator is NOT properly imported');
  }
  
  // Check if LoadingIndicator is used conditionally
  if (learningModalContent.includes('isLoading ?') && 
      learningModalContent.includes('<LoadingIndicator')) {
    console.log('✅ LoadingIndicator is conditionally displayed based on isLoading prop');
  } else {
    console.log('❌ LoadingIndicator is NOT conditionally displayed');
  }
} else {
  console.log('❌ LearningModal component not found at:', learningModalPath);
}

// Check if LoadingIndicator component exists
if (fs.existsSync(loadingIndicatorPath)) {
  console.log('✅ LoadingIndicator component found');
} else {
  console.log('❌ LoadingIndicator component not found at:', loadingIndicatorPath);
}

console.log('\n=== Test Complete ==='); 