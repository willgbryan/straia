import { YBlock, BlockType } from '@briefer/editor/src/blocks/index.js'
import { switchBlockType } from '@briefer/editor/src/index.js'
import * as Y from 'yjs'

// Example: Set a componentId on a block, handling all block types
export function setComponentIdOnBlock(block: YBlock, componentId: string) {
  return switchBlockType(block, {
    onSQL: (block) => block.setAttribute('componentId', componentId),
    onPython: (block) => block.setAttribute('componentId', componentId),
    onRichText: () => {},
    onVisualization: () => {},
    onVisualizationV2: () => {},
    onFileUpload: () => {},
    onDashboardHeader: () => {},
    onWriteback: () => {},
    onInput: () => {},
    onDropdownInput: () => {},
    onDateInput: () => {},
    onPivotTable: () => {},
    onAnalyst: () => {},
  })
}

// Example: Check if a block is of a certain type
export function isSQLBlock(block: YBlock): boolean {
  return switchBlockType(block, {
    onSQL: () => true,
    onPython: () => false,
    onRichText: () => false,
    onVisualization: () => false,
    onVisualizationV2: () => false,
    onFileUpload: () => false,
    onDashboardHeader: () => false,
    onWriteback: () => false,
    onInput: () => false,
    onDropdownInput: () => false,
    onDateInput: () => false,
    onPivotTable: () => false,
    onAnalyst: () => false,
  })
}

// Add more utility functions as needed for your workspace/component logic 