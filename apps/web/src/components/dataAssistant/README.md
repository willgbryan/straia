# Data Assistant Component

## Overview
The Data Assistant feature provides a conversational "talk to your data" experience that helps users get exactly what they're looking for from their data. The component guides users through a structured process of:

1. Asking an initial question with context
2. Clarifying ambiguous terms
3. Viewing generated insights with visualizations
4. Learning about data concepts and methodology

## Component Structure

### Main Components

- **DataAssistant.tsx**: The main container component that manages state and flow between stages
- **InitialQueryForm.tsx**: Form for users to enter their question and provide context
- **ClarificationInterface.tsx**: Interface for resolving ambiguous terms
- **AmbiguityResolver.tsx**: Reusable component for resolving each individual ambiguous term
- **InsightPanel.tsx**: Display of results with visualizations and explanations
- **LearningModal.tsx**: Educational overlay for explaining data concepts

### Flow

1. User enters a question and provides motivational context
2. System identifies ambiguous terms that need clarification
3. User resolves each ambiguity by selecting from predefined options
4. System generates insights based on the clarified query
5. User can learn more about methodology or specific terms

## Implementation Details

### State Management

The main component uses React's useState to manage the overall state of the assistant:

```tsx
type QueryStage = 'initial' | 'clarification' | 'insight';

type DataAssistantState = {
  query: string;
  motivation: string;
  problem: string;
  clarifiedTerms: Record<string, string>;
  stage: QueryStage;
  // ...other state
};
```

State transitions happen through callback functions passed to child components.

### Visualization Implementation

The InsightPanel component includes simple visualization implementations for:

- Bar charts
- Line charts

In a production environment, these would be replaced with more sophisticated chart libraries.

### Educational Content

The LearningModal component contains a comprehensive collection of educational content about:

- Student risk models
- First-generation student definitions
- Commuter student classifications
- Academic term data
- Retention calculation methodology

This content is stored within the component for simplicity but should be loaded from an API in production.

## API Integration

Currently, the AI/data insights functionality is mocked with setTimeout and static data. In a real integration:

1. The clarification component would send the user query to an API endpoint to identify ambiguous terms
2. The insight component would call an API endpoint with the clarified query to generate real insights
3. Educational content would be loaded from a CMS or API endpoint

## Usage Guidelines

### Adding New Ambiguous Terms

To add new ambiguous terms that the system can clarify:

1. Add the term to the `AmbiguityTerm` type in `DataAssistant.tsx`
2. Add corresponding options in the `termOptions` object in `ClarificationInterface.tsx`
3. Add educational content in `LearningModal.tsx`

### Styling

The components use Tailwind CSS for styling with a consistent set of colors and spacing:

- Primary brand color: `primary-200`
- Text colors: `gray-700`, `gray-900`
- Rounded corners: `rounded-md`, `rounded-lg`
- Consistent spacing: `p-6`, `mb-4`, etc.

## Future Enhancements

1. Integration with a real AI service for query analysis
2. Saving and sharing insights
3. More advanced visualizations
4. User history of previous queries
5. Personalized learning paths based on user role and interests

## Dependencies

- React
- Heroicons
- Headless UI (for the modal component)
- Tailwind CSS (for styling) 