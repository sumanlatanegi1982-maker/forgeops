interface SidebarProps {
  sessionId: string | null
  onReset: () => void
}

export function Sidebar({ sessionId, onReset }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">⚡</span>
        <span className="logo-text">ForgeOps</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <h3>Workspace</h3>
          <button className="nav-item active">
            <span>💬</span> Chat
          </button>
          <button className="nav-item" disabled>
            <span>📋</span> Code Reviews
          </button>
          <button className="nav-item" disabled>
            <span>🚨</span> Incidents
          </button>
        </div>

        <div className="nav-section">
          <h3>Agent</h3>
          <div className="agent-status">
            <div className="status-row">
              <span className="status-label">Model</span>
              <span className="status-value">claude-sonnet-4-6</span>
            </div>
            <div className="status-row">
              <span className="status-label">MCP</span>
              <span className="status-value">GitHub</span>
            </div>
            <div className="status-row">
              <span className="status-label">Sandbox</span>
              <span className="status-value">Daytona</span>
            </div>
            <div className="status-row">
              <span className="status-label">Approval</span>
              <span className="status-value">Write + Destructive</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="sidebar-footer">
        {sessionId && (
          <button className="btn-reset" onClick={onReset}>
            New Session
          </button>
        )}
        <p className="version">ForgeOps v0.1 · TrueForge Hackathon</p>
      </div>
    </aside>
  )
}
