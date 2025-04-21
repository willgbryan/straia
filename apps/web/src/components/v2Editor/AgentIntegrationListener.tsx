import React, { useEffect } from 'react'
import * as Y from 'yjs'
import { addBlockGroup } from '@briefer/editor'
import { getLayout, getBlocks } from '@briefer/editor'
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
      } else if (blockType === 'visualization') {
        // Sometimes the agent sends python code under visualization type.
        // Detect if it looks like code (starts with import/def/plt etc.)
        const trimmed = typeof content === 'string' ? content.trim() : ''
        const looksLikeCode = /^(import|def|plt\.|from)/.test(trimmed)
        if (looksLikeCode) {
          addConfig = { type: BlockType.Python, source: content }
        } else {
          // Assume vega/spec JSON
          let spec: any = {}
          try {
            spec = typeof content === 'string' ? JSON.parse(content) : content
          } catch {
            spec = content
          }
          addConfig = { type: BlockType.Visualization, spec }
        }
      } else if (blockType === 'markdown') {
        // Create a rich‑text block and seed its content with plain text
        addConfig = { type: BlockType.RichText }
      } else {
        // default to markdown via rich text
        addConfig = { type: BlockType.RichText, content }
      }
      // Preserve backendId if provided
      if (backendId) {
        addConfig.id = backendId
      }

      const blockId = addBlockGroup(yLayout, yBlocks, addConfig, yLayout.length)

      if (backendId) backendToUi.set(backendId, blockId)

      // If we just inserted a RichText block, seed its Yjs content with the
      // markdown/plain‑text provided by the agent so it is visible immediately.
      if (addConfig.type === BlockType.RichText) {
        const yBlock = yBlocks.get(blockId)
        if (yBlock) {
          // @ts-ignore – content is a valid RichText attribute
          const fragment = yBlock.getAttribute('content') as any
          if (fragment && typeof content === 'string') {
            // Build a Y.XmlText with the markdown string as its content so it
            // actually shows up in the editor instead of an empty block.
            // Older code attempted `new Y.XmlText(content)` which creates an
            // element node instead of a text node, leading to empty blocks
            // and the `el.toArray` runtime errors we saw.
            //
            // Correct approach:
            const yText = new (Y as any).XmlText()
            yText.insert(0, content)
            // Insert as child of the fragment
            fragment.insert(0, [yText])
          }
        }
      }
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
      yBlock.doc?.transact(() => {
        yBlock.setAttribute('result', result)
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
        if (set.has('result')) sendFeedback(type)
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