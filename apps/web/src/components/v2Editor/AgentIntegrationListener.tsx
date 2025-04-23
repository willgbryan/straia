import React, { useEffect } from 'react'
import * as Y from 'yjs'
import { addBlockGroup, getLayout, getBlocks, getClosestDataframe } from '@briefer/editor'
import { ExecutionQueue } from '@briefer/editor'
import { BlockType } from '@briefer/editor'

interface AgentIntegrationListenerProps {
  yDoc: Y.Doc
  executionQueue: ExecutionQueue
  userId: string | null
}

// Handles agent create_block events by injecting blocks and queuing execution
export default function AgentIntegrationListener({
  yDoc,
  executionQueue,
  userId,
}: AgentIntegrationListenerProps) {
  useEffect(() => {
    const backendToUi = new Map<string, string>()
    let currentSessionId: string | null = null
    // Pre-fetch Yjs blocks map for raw execution injection
    const yBlocks = getBlocks(yDoc)

    const onSessionStarted = (ev: CustomEvent) => {
      currentSessionId = ev.detail.sessionId as string
    }

    const handler = (e: CustomEvent) => {
      const { blockType, content, blockId: backendId } = e.detail as any
      const yLayout = getLayout(yDoc)
      const yBlocks = getBlocks(yDoc)
      // Determine block config based on type
      let addConfig: any = { type: BlockType.RichText }
      if (blockType === 'python') {
        addConfig = { type: BlockType.Python, source: content }
      } else if (blockType === 'sql') {
        addConfig = { type: BlockType.SQL, dataSourceId: null, isFileDataSource: false, source: content }
      } else if (blockType === 'visualizationV2') {
        // Agent provided structured input for v2 visualization
        console.debug('[agent_debug] Received visualizationV2 event detail:', e.detail)
        const inputObj = (e.detail as any).input || {}
        console.debug('[agent_debug] visualizationV2 inputObj:', inputObj)
        addConfig = { type: BlockType.VisualizationV2, input: inputObj }
      } else if (blockType === 'visualization') {
        console.debug('[agent_debug] Received visualization (v1) event detail:', e.detail)
        // Sometimes the agent sends python code under visualization type.
        // Detect if it looks like code (starts with import/def/plt etc.)
        const trimmed = typeof content === 'string' ? content.trim() : ''
        const looksLikeCode = /^(import|def|plt\.|from)/.test(trimmed)
        if (looksLikeCode) {
          addConfig = { type: BlockType.Python, source: content }
        } else {
          // Assume a Vega-Lite spec; attempt JSON.parse, then fallback to JS eval
          let spec: any = {}
        if (typeof content === 'string') {
          try {
            spec = JSON.parse(content)
          } catch (_e) {
            // Fallback: interpret content as JS object literal
            try {
              // eslint-disable-next-line no-new-func
              spec = new Function('return (' + content + ')')()
            } catch (__e) {
              spec = {}
            }
          }
        } else {
          spec = content
        }
          // Pick the closest DataFrame to seed the visualization
          const df = getClosestDataframe(yDoc, yLayout.length - 1)
        // Create a v2 visualization block with default chartType from spec.mark.type
        const markType = spec?.mark?.type ?? 'line'
        addConfig = { type: BlockType.VisualizationV2, spec, chartType: markType }
        if (df && df.blockId) {
          addConfig.dataframeName = df.blockId
        }
        }
    } else if (blockType === 'richText') {
        // Create a rich‑text block and seed its content fragment with the markdown
        addConfig = { type: BlockType.RichText, initialContent: content }
      } else {
        // Default fallback: rich text block for any other content
        addConfig = { type: BlockType.RichText }
      }
      // Preserve backendId if provided
      if (backendId) {
        addConfig.id = backendId
      }

      const blockId = addBlockGroup(yLayout, yBlocks, addConfig, yLayout.length)

      if (backendId) backendToUi.set(backendId, blockId)

      // If we just inserted a RichText block, seed its Yjs content with the
      // markdown/plain‑text provided by the agent so it is visible immediately.
      // Enqueue execution if code block
      if (addConfig.type === BlockType.Python || addConfig.type === BlockType.SQL) {
        executionQueue.enqueueBlock(blockId, userId, null, { _tag: 'run-code' } as any)
        // Auto-run new Python/SQL blocks: delay to allow UI mount
        console.debug('[agent_debug] scheduling agent:run_block for', blockId)
        setTimeout(() => {
          console.debug('[agent_debug] dispatch agent:run_block for', blockId)
          window.dispatchEvent(new CustomEvent('agent:run_block', { detail: { blockId } }))
        }, 100)
      }
    }
    window.addEventListener('agent:create_block', handler as any)
    window.addEventListener('agent:session_started', onSessionStarted as any)
    // Listen for raw execution results from SSE and write to Yjs blocks
    const rawExecHandler = (e: CustomEvent) => {
      const { blockId: backendId, result } = e.detail as any
      const uiId = backendToUi.get(backendId)
      if (!uiId) return
      const yBlock = yBlocks.get(uiId)
      if (!yBlock) return
      // Write raw result array onto the block for feedback and context
      // Store execution result
      yBlock.doc?.transact(() => {
        (yBlock as any).setAttribute('result', result)
      })
      // Fallback: patch any visualization blocks with empty data values
      yBlocks.forEach((block) => {
        const bt = block.getAttribute('type')
        if (bt === BlockType.Visualization) {
          const spec = (block as any).getAttribute('spec') as any
          if (spec && spec.data && Array.isArray(spec.data.values) && spec.data.values.length === 0) {
            spec.data.values = result
            block.doc?.transact(() => {
              (block as any).setAttribute('spec', spec)
            })
          }
        }
      })
    }
    window.addEventListener('agent:raw_execution_result', rawExecHandler as any)

    const sendFeedback = (yBlock: any) => {
      const uiId = yBlock.getAttribute('id')
      const entry = Array.from(backendToUi.entries()).find(([, v]) => v === uiId)
      if (!entry) return
      const [backendId] = entry

      const result = yBlock.getAttribute('result') || []
      const errItem = result.find((r: any) => r.type === 'error')
      const txtItem = result.find((r: any) => r.type === 'text')
      // Summary field: include text, error, or chart placeholder
      let status: 'ok' | 'error' = 'ok'
      let output: string | null = null
      let error: string | null = null
      if (errItem) {
        status = 'error'
        error = String(errItem.traceback || '').slice(-300)
      } else if (txtItem) {
        output = String(txtItem.text).slice(0, 500)
      } else if (result.some((r: any) => ['image', 'plotly', 'html'].includes(r.type))) {
        // Chart or rich output placeholder
        output = '[chart output]'
      }

      if (currentSessionId) {
        const base = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:8000'
        fetch(`${base}/v1/agent/session/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: currentSessionId,
            block_id: backendId,
            status,
            output,
            error,
            result: result
          }),
        }).catch(() => {})
      }
    }

    const txnHandler = (txn: any) => {
      (txn.changed as Map<any, Set<string>>).forEach((set: Set<string>, type: any) => {
        if (set.has('result')) {
          console.debug('[agent_debug] txnHandler result attr on block id=', type.getAttribute('id'))
          sendFeedback(type)
          // Patch empty Vega-Lite specs with actual result data
          const resultData = (type as any).getAttribute('result') || []
          yBlocks.forEach((block) => {
            if (block.getAttribute('type') === BlockType.Visualization) {
              const spec = (block as any).getAttribute('spec') as any
              if (
                spec && spec.data && Array.isArray(spec.data.values) && spec.data.values.length === 0
              ) {
                spec.data.values = resultData
                block.doc?.transact(() => {
                  (block as any).setAttribute('spec', spec)
                })
              }
            }
          })
        }
      })
    }

    // @ts-ignore attach
    yDoc.on('afterTransaction', txnHandler)
    return () => {
      window.removeEventListener('agent:create_block', handler as any)
      window.removeEventListener('agent:session_started', onSessionStarted as any)
      window.removeEventListener('agent:raw_execution_result', rawExecHandler as any)
      // @ts-ignore detach
      yDoc.off('afterTransaction', txnHandler)
    }
  }, [yDoc, executionQueue, userId])

  return null
}