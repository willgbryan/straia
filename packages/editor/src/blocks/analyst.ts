import * as Y from 'yjs'
import { BaseBlock, BlockType, type YBlock, getBaseAttributes } from './index.js'

export enum ClarificationStatus {
  Idle = 'IDLE',
  InProgress = 'IN_PROGRESS',
  Completed = 'COMPLETED',
}

export enum AnalystStage {
  Initial = 'INITIAL', // Initial query input
  Clarification = 'CLARIFICATION', // Clarifying questions
  Result = 'RESULT', // Results display
}

export type ClarificationOption = {
  id: string
  label: string
  description?: string
  value: string
  selected: boolean
}

export type Clarification = {
  id: string
  question: string
  options: ClarificationOption[]
  status: ClarificationStatus
  completed: boolean
}

export type AnalystVisualization = {
  type: 'bar_chart' | 'line_chart' | 'pie_chart'
  title: string
  data: Record<string, number>
}

export type AnalystBlock = BaseBlock<BlockType.Analyst> & {
  question: {
    value: string
    newValue: string
  }
  why: {
    value: string
    newValue: string
  }
  goal: {
    value: string
    newValue: string
  }
  stage: AnalystStage
  clarifications: Clarification[]
  result: {
    summary: string
    visualizations: AnalystVisualization[]
    methodologyNote: string
  } | null
  error: string | null
}

export function getAnalystAttributes(
  block: Y.XmlElement<AnalystBlock>,
  blocks: Y.Map<YBlock>
): AnalystBlock {
  const baseAttributes = getBaseAttributes<BlockType.Analyst>(block)

  const question = block.getAttribute('question') ?? {
    value: '',
    newValue: '',
  }

  const why = block.getAttribute('why') ?? {
    value: '',
    newValue: '',
  }

  const goal = block.getAttribute('goal') ?? {
    value: '',
    newValue: '',
  }

  const stage = block.getAttribute('stage') ?? AnalystStage.Initial

  const clarifications = block.getAttribute('clarifications') ?? []

  const result = block.getAttribute('result') ?? null

  const error = block.getAttribute('error') ?? null

  return {
    ...baseAttributes,
    question,
    why,
    goal,
    stage,
    clarifications,
    result,
    error,
  }
}

export function updateAnalystQuestion(
  block: Y.XmlElement<AnalystBlock>,
  newValue: string
): void {
  const question = block.getAttribute('question') ?? {
    value: '',
    newValue: '',
  }
  
  block.setAttribute('question', {
    ...question,
    newValue,
  })
}

export function updateAnalystWhy(
  block: Y.XmlElement<AnalystBlock>,
  newValue: string
): void {
  const why = block.getAttribute('why') ?? {
    value: '',
    newValue: '',
  }
  
  block.setAttribute('why', {
    ...why,
    newValue,
  })
}

export function updateAnalystGoal(
  block: Y.XmlElement<AnalystBlock>,
  newValue: string
): void {
  const goal = block.getAttribute('goal') ?? {
    value: '',
    newValue: '',
  }
  
  block.setAttribute('goal', {
    ...goal,
    newValue,
  })
}

export function updateAnalystStage(
  block: Y.XmlElement<AnalystBlock>,
  stage: AnalystStage
): void {
  block.setAttribute('stage', stage)
}

export function updateAnalystClarifications(
  block: Y.XmlElement<AnalystBlock>,
  clarifications: Clarification[]
): void {
  block.setAttribute('clarifications', clarifications)
}

export function updateAnalystClarificationOption(
  block: Y.XmlElement<AnalystBlock>,
  clarificationId: string,
  optionId: string,
  selected: boolean
): void {
  const clarifications = block.getAttribute('clarifications') ?? []
  
  const updatedClarifications = clarifications.map(c => {
    if (c.id === clarificationId) {
      return {
        ...c,
        options: c.options.map(o => ({
          ...o,
          selected: o.id === optionId ? selected : false
        })),
        status: selected ? ClarificationStatus.Completed : ClarificationStatus.InProgress
      }
    }
    return c
  })
  
  block.setAttribute('clarifications', updatedClarifications)
}

export function updateAnalystResult(
  block: Y.XmlElement<AnalystBlock>,
  result: AnalystBlock['result']
): void {
  block.setAttribute('result', result)
}

export function updateAnalystError(
  block: Y.XmlElement<AnalystBlock>,
  error: string | null
): void {
  block.setAttribute('error', error)
}

export function createNewAnalystBlock(id: string): AnalystBlock {
  return {
    id,
    index: null,
    title: '',
    type: BlockType.Analyst,
    question: {
      value: '',
      newValue: '',
    },
    why: {
      value: '',
      newValue: '',
    },
    goal: {
      value: '',
      newValue: '',
    },
    stage: AnalystStage.Initial,
    clarifications: [],
    result: null,
    error: null,
  }
}

// Define type-safe error message getter
export function getAnalystBlockErrorMessage(
  block: Y.XmlElement<AnalystBlock>
): string | null {
  const attrs = getAnalystAttributes(block, new Y.Map())
  return attrs.error
}

export function getAnalystBlockResultStatus(
  block: Y.XmlElement<AnalystBlock>,
): 'idle' | 'error' | 'success' {
  const attrs = getAnalystAttributes(block, new Y.Map())
  
  if (attrs.error) {
    return 'error'
  }
  
  if (attrs.result) {
    return 'success'
  }
  
  return 'idle'
} 