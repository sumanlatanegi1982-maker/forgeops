/**
 * ForgeOps — useAgentSession Hook
 *
 * Manages the TrueForge session lifecycle: create session, stream turns,
 * render model deltas, handle tool calls, pause for approval, resume after
 * user decision. Uses Sarvam 105B via OpenAI-compatible endpoint.
 *
 * https://trueforge.dev/api/use-agent
 */

import { useState, useCallback, useRef } from 'react'
import type { ChatMessage, ApprovalRequest, GraphNode, NodeDetail } from './types'
import { AgentGraph } from './agent-graph'

const SDK_URL = 'https://esm.sh/@truefoundry/trueforge-sdk@latest'

/**
 * Resolve the TrueForge server URL.
 *
 * - Localhost (npm run dev): http://localhost:8790
 * - GitHub Codespaces: replace the port in the codespace URL from 3000 to 8790
 *   e.g. https://super-duper-goldfish-5gp65q5pv7p3p6qq-3000.app.github.dev
 *    -> https://super-duper-goldfish-5gp65q5pv7p3p6qq-8790.app.github.dev
 * - Otherwise: same origin (for production builds where frontend and API share a domain)
 */
function getTrueForgeBaseUrl(): string {
  const origin = window.location.origin
  if (origin.startsWith('http://localhost')) {
    return 'http://localhost:8790'
  }
  // GitHub Codespaces: URL pattern is https://<name>-<port>.app.github.dev
  // Replace -3000 (or any port) with -8790
  const codespaceMatch = origin.match(/^(https:\/\/[^-]+-[^-]+)-(\d+)(\.app\.github\.dev.*)$/)
  if (codespaceMatch) {
    return `${codespaceMatch[1]}-8790${codespaceMatch[3]}`
  }
  return origin
}

const TRUEFORGE_BASE_URL = getTrueForgeBaseUrl()

/** Sarvam 105B — configured via TrueForge Custom provider with Sarvam endpoint */
const AGENT_SPEC = {
  model: { name: 'custom/sarvam-105b' },
  instructions: `You are ForgeOps, a software engineering agent that does two jobs:

1. Code Review: When given a pull request URL or number, fetch the PR diff and changed files via the GitHub MCP. Read the surrounding code for context. Clone the repo into the sandbox and run the test suite. Analyze the code for bugs, security issues, and logic errors. Post a structured review comment on the PR summarizing findings. Always pause before posting the review comment.

2. Incident Debugging: When given an incident alert or bug report, fetch recent deploys and relevant code via the GitHub MCP. Write and run a bisect script in the sandbox to find the culprit commit. Analyze logs and test outputs in the sandbox. Identify the root cause. Propose a fix or rollback. ALWAYS pause for human approval before any irreversible action.

Rules:
- Never skip the approval gate for write or destructive actions
- Show your reasoning at each step
- If you find multiple issues, prioritise by severity
- Keep sandbox scripts focused and well-commented`,
  mcp_servers: [
    { name: 'github', enable_tools: ['@all'], require_approval_for_tools: ['@write', '@destructive'] },
  ],
  config: {
    sandbox: { enabled: true, file_downloads: true },
    iteration_limit: 50,
  },
}

let trueForgeClient: any = null

async function loadClient() {
  if (trueForgeClient) return trueForgeClient
  try {
    const mod = await import(/* @vite-ignore */ SDK_URL)
    const TrueForge = mod.TrueForge || mod.default?.TrueForge || mod.default
    trueForgeClient = new TrueForge({ baseUrl: TRUEFORGE_BASE_URL, timeoutInSeconds: 600 })
    return trueForgeClient
  } catch {
    return null
  }
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '\u2026' : s }

function renderMarkdown(text: string): string {
  let html = text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _l, c) => `<pre><code>${c}</code></pre>`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  html = html.replace(/^### (.+)$/gm, '<p><b>$1</b></p>')
  html = html.replace(/^## (.+)$/gm, '<p><b>$1</b></p>')
  html = html.replace(/^# (.+)$/gm, '<p><b>$1</b></p>')
  html = html.replace(/\n/g, '<br>')
  return html
}

interface UseAgentSessionReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  approvalRequests: ApprovalRequest[]
  sessionId: string | null
  error: string | null
  sendMessage: (content: string, graph: AgentGraph) => Promise<void>
  approveTool: (approvalId: string, allow: boolean, reason?: string, graph?: AgentGraph) => Promise<void>
  resetSession: () => void
}

export function useAgentSession(): UseAgentSessionReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<string | null>(null)

  const createSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current
    try {
      const client = await loadClient()
      if (!client) return null
      const { data: session } = await client.sessions.create({ agent: { spec: AGENT_SPEC } })
      sessionRef.current = session.id
      setSessionId(session.id)
      return session.id
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
      return null
    }
  }, [])

  const sendMessage = useCallback(async (content: string, graph: AgentGraph) => {
    setError(null)
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content, timestamp: Date.now() }
    setMessages((p) => [...p, userMsg])
    const sid = await createSession()
    if (!sid) return
    setIsStreaming(true)
    const agentMsgId = `agent-${Date.now()}`
    setMessages((p) => [...p, { id: agentMsgId, role: 'agent', content: '', timestamp: Date.now() }])
    graph.reset()
    const root = graph.addNode('root', truncate(content, 32), null, { thinking: `User prompt: "${content}"`, model: 'sarvam-105b', status: 'processing' })
    root.pulse = 1
    let currentNode = root
    let agentText = ''
    try {
      const client = await loadClient()
      if (!client) throw new Error('SDK not available')
      const stream = await client.sessions.createTurnStream(sid, { input: [{ type: 'user.message', content }] })
      for await (const { data: event } of stream.withMetadata()) {
        switch (event.type) {
          case 'model.message.delta':
            if (event.content) { agentText += event.content; setMessages((p) => p.map((m) => m.id === agentMsgId ? { ...m, content: agentText } : m)) }
            break
          case 'tool.call': {
            const node = graph.addNode('tool', truncate(event.toolName || 'tool', 24), currentNode, { thinking: `Calling tool: ${event.toolName}`, toolName: event.toolName, status: 'running' })
            node.pulse = 1; currentNode = node
            break
          }
          case 'tool.result': {
            const node = graph.addNode('think', 'Processing result', currentNode, { thinking: 'Analyzing tool output', status: 'completed' })
            node.pulse = 1; currentNode = node
            break
          }
          case 'tool.approval_required': {
            const approval: ApprovalRequest = { id: event.id, toolName: event.toolName || 'unknown', toolArguments: (event.toolArguments ?? {}) as Record<string, unknown>, sourceEventId: event.sourceEventId ?? '' }
            setApprovalRequests((p) => [...p, approval])
            const node = graph.addNode('approval', truncate(event.toolName || 'Approval', 24), currentNode, { thinking: 'Write/destructive action — waiting for human approval', toolName: event.toolName, status: 'awaiting approval' })
            node.pulse = 1; currentNode = node
            break
          }
          case 'turn.done':
            if (event.state?.status === 'error') setError('Agent turn ended with an error.')
            break
        }
      }
      const out = graph.addNode('output', 'Response complete', currentNode, { thinking: 'Agent finished processing.', status: 'completed' })
      out.pulse = 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Streaming failed'
      setError(msg)
      const errNode = graph.addNode('error', 'Stream error', currentNode, { thinking: msg, status: 'error' })
      errNode.pulse = 1
    } finally {
      setIsStreaming(false)
    }
  }, [createSession])

  const approveTool = useCallback(async (approvalId: string, allow: boolean, reason?: string, graph?: AgentGraph) => {
    const sid = sessionRef.current
    if (!sid) return
    setApprovalRequests((p) => p.filter((a) => a.id !== approvalId))
    setIsStreaming(true)
    try {
      const client = await loadClient()
      if (!client || !graph) return
      const stream = await client.sessions.createTurnStream(sid, { input: [{ type: 'user.tool_approval', allow, ...(reason ? { reason } : {}) }] })
      let agentText = ''
      const agentMsgId = `agent-${Date.now()}`
      setMessages((p) => [...p, { id: agentMsgId, role: 'agent', content: '', timestamp: Date.now() }])
      for await (const { data: event } of stream.withMetadata()) {
        if (event.type === 'model.message.delta' && event.content) { agentText += event.content; setMessages((p) => p.map((m) => m.id === agentMsgId ? { ...m, content: agentText } : m)) }
        if (event.type === 'tool.call') { const node = graph.addNode('tool', truncate(event.toolName || 'tool', 24), null, { thinking: `Calling: ${event.toolName}`, status: 'running' }); node.pulse = 1 }
        if (event.type === 'turn.done') break
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval flow failed')
    } finally {
      setIsStreaming(false)
    }
  }, [])

  const resetSession = useCallback(() => {
    sessionRef.current = null; setSessionId(null); setMessages([]); setApprovalRequests([]); setError(null)
  }, [])

  return { messages, isStreaming, approvalRequests, sessionId, error, sendMessage, approveTool, resetSession }
}

export { renderMarkdown }
