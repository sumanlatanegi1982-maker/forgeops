import { useState } from 'react'
import type { ApprovalRequest } from '@/types/events'

interface ApprovalCardProps {
  approval: ApprovalRequest
  onApprove: () => void
  onDeny: (reason: string) => void
}

export function ApprovalCard({ approval, onApprove, onDeny }: ApprovalCardProps) {
  const [showDenyInput, setShowDenyInput] = useState(false)
  const [reason, setReason] = useState('')

  const argPreview = JSON.stringify(approval.toolArguments, null, 2)

  return (
    <div className="approval-card">
      <div className="approval-header">
        <span className="approval-icon">⚠️</span>
        <div>
          <h4>Approval Required</h4>
          <p>The agent wants to run a write/destructive tool.</p>
        </div>
      </div>

      <div className="approval-body">
        <div className="approval-tool">
          <label>Tool</label>
          <code>{approval.toolName}</code>
        </div>
        <div className="approval-args">
          <label>Arguments</label>
          <pre>{argPreview}</pre>
        </div>
      </div>

      {showDenyInput ? (
        <div className="deny-input">
          <input
            type="text"
            placeholder="Why are you denying this? (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          <div className="deny-actions">
            <button className="btn-deny" onClick={() => onDeny(reason)}>
              Confirm Deny
            </button>
            <button className="btn-cancel" onClick={() => setShowDenyInput(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="approval-actions">
          <button className="btn-approve" onClick={onApprove}>
            ✓ Allow
          </button>
          <button className="btn-deny-outline" onClick={() => setShowDenyInput(true)}>
            ✕ Deny
          </button>
        </div>
      )}
    </div>
  )
}
