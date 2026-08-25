import type { ToolCallInfo } from '@/types/events'

interface ToolCallBadgeProps {
  toolCall: ToolCallInfo
}

const STATUS_CONFIG = {
  running: { icon: '⏳', label: 'Running', className: 'tc-running' },
  done: { icon: '✓', label: 'Done', className: 'tc-done' },
  awaiting_approval: { icon: '⚠️', label: 'Needs Approval', className: 'tc-approval' },
  denied: { icon: '✕', label: 'Denied', className: 'tc-denied' },
} as const

export function ToolCallBadge({ toolCall }: ToolCallBadgeProps) {
  const config = STATUS_CONFIG[toolCall.status] ?? STATUS_CONFIG.running

  return (
    <div className={`tool-badge ${config.className}`}>
      <span className="tool-badge-icon">{config.icon}</span>
      <span className="tool-badge-name">{toolCall.name}</span>
      <span className="tool-badge-status">{config.label}</span>
    </div>
  )
}
