/**
 * ForgeOps — Type Definitions
 *
 * Minimal event types for the TrueForge turn stream.
 * https://trueforge.dev/api/use-agent#turn-events-reference
 */

export interface TurnEvent {
  type: string
  id: string
  threadId: string | null
  sequenceNumber: number
  content?: string
  toolName?: string
  toolArguments?: Record<string, unknown>
  toolResult?: unknown
  sourceEventId?: string
  state?: {
    status: 'running' | 'done' | 'paused' | 'cancelled' | 'error'
    output?: { content?: string }
    requiredActions?: PendingAction[]
  }
}

export interface PendingAction {
  type: 'tool_approval' | 'mcp_auth' | 'question'
  ref: string
  sourceEventId?: string
  toolName?: string
  toolArguments?: Record<string, unknown>
  authUrl?: string
  question?: string
  choices?: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  timestamp: number
  graphNodes?: GraphNode[]
}

export interface ToolCallInfo {
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  status: 'running' | 'done' | 'awaiting_approval' | 'denied'
}

export interface ApprovalRequest {
  id: string
  toolName: string
  toolArguments: Record<string, unknown>
  sourceEventId: string
}

export interface GraphNode {
  id: number
  type: NodeType
  label: string
  x: number
  y: number
  tx: number
  ty: number
  r: number
  targetR: number
  born: number
  parent: number | null
  pulse: number
  ringPhase: number
  detail: NodeDetail
}

export type NodeType = 'root' | 'think' | 'tool' | 'task' | 'file' | 'search' | 'output' | 'approval' | 'error'

export interface NodeDetail {
  thinking?: string
  model?: string
  duration?: string
  toolName?: string
  fileName?: string
  status?: string
  result?: string
}

export const NODE_TYPES: Record<NodeType, { color: string; label: string; ring: boolean }> = {
  root:     { color: '#b4a0ff', label: 'Prompt',     ring: true  },
  think:    { color: '#7dd3c0', label: 'Thinking',   ring: false },
  tool:     { color: '#e0b34a', label: 'Tool Call',  ring: false },
  task:     { color: '#d98ca8', label: 'Task',       ring: false },
  file:     { color: '#8ab4f5', label: 'File Edit',  ring: false },
  search:   { color: '#c9a3e8', label: 'Search',     ring: false },
  output:   { color: '#6fcf97', label: 'Answer',     ring: true  },
  approval: { color: '#f97316', label: 'Approval',   ring: true  },
  error:    { color: '#ef6b6b', label: 'Error',      ring: true  },
}
