/**
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
  toolCalls?: ToolCallInfo[]
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
