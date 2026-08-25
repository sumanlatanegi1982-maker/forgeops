import { useState, useRef, useEffect } from 'react'
import { useAgentSession } from '@/hooks/useAgentSession'
import { ChatMessage } from '@/components/ChatMessage'
import { ApprovalCard } from '@/components/ApprovalCard'
import { ToolCallBadge } from '@/components/ToolCallBadge'
import { Sidebar } from '@/components/Sidebar'
import { ChatInput } from '@/components/ChatInput'
import '@/styles/app.css'

export function App() {
  const {
    messages,
    isStreaming,
    approvalRequests,
    sessionId,
    error,
    sendMessage,
    approveTool,
    resetSession,
  } = useAgentSession()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="app">
      <Sidebar sessionId={sessionId} onReset={resetSession} />

      <main className="chat-main">
        <header className="chat-header">
          <div className="header-title">
            <span className="logo-icon">⚡</span>
            <h1>ForgeOps</h1>
            <span className="badge">Agent Dashboard</span>
          </div>
          <div className="header-status">
            {isStreaming && <span className="status-dot streaming" />}
            {sessionId && <span className="session-id">Session: {sessionId.slice(0, 8)}…</span>}
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="messages-container">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🔧</div>
              <h2>ForgeOps Agent</h2>
              <p>Code review and incident debugging, powered by TrueForge.</p>
              <div className="suggestions">
                <button
                  className="suggestion-card"
                  onClick={() => sendMessage('Review PR #42 — check for security issues and run the test suite')}
                >
                  <span className="suggestion-icon">📋</span>
                  <span>Review a pull request</span>
                  <small>Read the diff, run tests, post a review</small>
                </button>
                <button
                  className="suggestion-card"
                  onClick={() => sendMessage('Payment failures are spiking. Investigate recent deploys and find the root cause.')}
                >
                  <span className="suggestion-icon">🚨</span>
                  <span>Debug an incident</span>
                  <small>Bisect deploys, find the culprit, propose a fix</small>
                </button>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="tool-calls-container">
                  {msg.toolCalls.map((tc, i) => (
                    <ToolCallBadge key={i} toolCall={tc} />
                  ))}
                </div>
              )}
              <ChatMessage message={msg} />
            </div>
          ))}

          {approvalRequests.map((ar) => (
            <ApprovalCard
              key={ar.id}
              approval={ar}
              onApprove={() => approveTool(ar.id, true)}
              onDeny={(reason) => approveTool(ar.id, false, reason)}
            />
          ))}

          <div ref={messagesEndRef} />
        </div>

        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isStreaming || approvalRequests.length > 0}
        />
      </main>
    </div>
  )
}
