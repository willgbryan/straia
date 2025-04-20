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
    const handler = (e: CustomEvent) => {
      const { blockType, content } = e.detail as {
        blockType: string
        content: string
      }
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
        // Explicit markdown handling – convert to rich text block
        addConfig = { type: BlockType.RichText, content }
      } else {
        // default to markdown via rich text
        addConfig = { type: BlockType.RichText, content }
      }
      // Create the block at end of layout
      const blockId = addBlockGroup(yLayout, yBlocks, addConfig, yLayout.length)
      // Enqueue execution if code block
      if (addConfig.type === BlockType.Python || addConfig.type === BlockType.SQL) {
        executionQueue.enqueueBlock(blockId, userId, null, { _tag: 'run-code' } as any)
      }
    }
    window.addEventListener('agent:create_block', handler as any)
    return () => {
      window.removeEventListener('agent:create_block', handler as any)
    }
  }, [yDoc, executionQueue, userId])

  return null
}