import React, { useEffect } from 'react'
import * as Y from 'yjs'
import { addBlockGroup, getLayout, getBlocks, getClosestDataframe, BlockType } from '@briefer/editor'
import { ExecutionQueue } from '@briefer/editor'

interface AgentIntegrationListenerProps {
  yDoc: Y.Doc
  executionQueue: ExecutionQueue
  userId: string | null
}

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
        console.debug('[agent_debug][integration][create_block] Received visualizationV2 event detail:', e.detail)
        const inputObj = (e.detail as any).input || {}
        console.debug('[agent_debug][integration][create_block] visualizationV2 inputObj:', inputObj)
        addConfig = { type: BlockType.VisualizationV2, input: inputObj }
      } else if (blockType === 'visualization') {
        console.debug('[agent_debug][integration][create_block] Received visualization (v1) event detail:', e.detail)
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

      // Log block creation config
      console.debug('[agent_debug][integration][create_block] addConfig:', addConfig)

      const blockId = addBlockGroup(yLayout, yBlocks, addConfig, yLayout.length)

      if (backendId) backendToUi.set(backendId, blockId)
      // Log mapping from backendId to UI blockId
      if (backendId) {
        console.debug('[agent_debug][integration][create_block] backendId to UI blockId mapping:', backendId, '=>', blockId)
      }

      // If we just inserted a RichText block, seed its Yjs content with the
      // markdown/plain‑text provided by the agent so it is visible immediately.
      // Enqueue execution if code block
      if (addConfig.type === BlockType.Python || addConfig.type === BlockType.SQL) {
        executionQueue.enqueueBlock(blockId, userId, null, { _tag: 'run-code' } as any)
        // Auto-run new Python/SQL blocks: delay to allow UI mount
        console.debug('[agent_debug][integration][run_block] scheduling agent:run_block for', blockId)
        setTimeout(() => {
          console.debug('[agent_debug][integration][run_block] dispatch agent:run_block for', blockId)
          window.dispatchEvent(new CustomEvent('agent:run_block', { detail: { blockId } }))
        }, 100)
      }
    }

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
      // Log execution feedback mapping
      console.debug('[agent_debug][integration][exec_feedback] backendId:', backendId, 'uiId:', uiId, 'result:', result)
      // Fallback: patch any visualization blocks with empty data values
      yBlocks.forEach((block: any) => {
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
  }, [yDoc, executionQueue, userId])
} 