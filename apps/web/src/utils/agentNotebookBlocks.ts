export interface AgentNotebookBlock {
  type: string;
  input?: {
    chartType?: string;
    xAxis?: any;
    yAxes?: any;
    title?: string;
  };
  content?: string;
}

export function getAgentNotebookBlocks(blocks: any[]): AgentNotebookBlock[] {
  return blocks.map(block => {
    if (block.type === 'visualizationV2') {
      return {
        type: block.type,
        chartType: block.input?.chartType,
        dataframe: block.input?.dataframeName,
        xAxis: block.input?.xAxis,
        yAxes: block.input?.yAxes,
        title: block.input?.title,
      }
    }
    if (block.type === 'richText') {
      return {
        type: block.type,
        contentSnippet: (block.content || '').slice(0, 100),
      }
    }
    if (block.type === 'python' || block.type === 'sql') {
      return {
        type: block.type,
        firstLine: (block.content || block.source || '').split('\n')[0].slice(0, 100),
      }
    }
    // Add more block types as needed
    return { type: block.type }
  })
} 