import React from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { useSession } from '@/hooks/useAuth'
import DataAssistantSimple from '@/components/dataAssistant/simplified/DataAssistantSimple'

export default function DataAssistantPage() {
  const router = useRouter()
  const { workspaceId } = router.query
  const session = useSession({ redirectToLogin: true })

  // Check if workspaceId is available
  React.useEffect(() => {
    if (!router.isReady) return
    if (!workspaceId) {
      router.push('/')
    }
  }, [router, workspaceId])

  if (!session || !workspaceId || typeof workspaceId !== 'string') {
    return null
  }

  return (
    <Layout
      title="Data Assistant"
      workspaceId={workspaceId}
      showBreadcrumbs={true}
      breadcrumbs={[
        { name: 'Workspaces', href: '/workspaces' },
        { name: `Workspace ${workspaceId}`, href: `/workspaces/${workspaceId}` },
        { name: 'Data Assistant', href: `/workspaces/${workspaceId}/data-assistant` },
      ]}
    >
      <div className="flex flex-col h-full">
        <div className="px-4 sm:px-6 lg:px-8 py-6 flex-1 overflow-auto">
          <div className="sm:flex sm:items-center mb-6">
            <div className="sm:flex-auto">
              <h1 className="text-xl font-semibold text-gray-900">Data Assistant</h1>
              <p className="mt-2 text-sm text-gray-700">
                Ask questions about your data and get instant insights. The assistant will help you
                clarify your intent and provide meaningful analysis.
              </p>
            </div>
          </div>

          <DataAssistantSimple workspaceId={workspaceId} />
        </div>
      </div>
    </Layout>
  )
} 