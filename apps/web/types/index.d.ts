// Type declarations for modules that don't have proper type definitions
declare module 'react' {
  import * as React from 'react';
  export = React;
  export as namespace React;
}

declare module 'next/router' {
  export const useRouter: () => {
    query: Record<string, string | string[] | undefined>;
    isReady: boolean;
    push: (url: string) => Promise<boolean>;
  };
}

// Type declarations for JSX
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

// Type declarations for Layout component
declare module '@/components/Layout' {
  interface Props {
    children: React.ReactNode;
    workspaceId: string;
    showBreadcrumbs?: boolean;
    breadcrumbs?: Array<{ name: string; href: string }>;
    title?: string;
  }
  
  const Layout: React.FC<Props>;
  export default Layout;
}

// Type declarations for DataAssistant component
declare module '@/components/dataAssistant/DataAssistant' {
  interface DataAssistantProps {
    workspaceId: string;
  }
  
  const DataAssistant: React.FC<DataAssistantProps>;
  export default DataAssistant;
} 