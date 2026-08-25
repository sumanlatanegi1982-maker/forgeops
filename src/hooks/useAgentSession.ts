import { useState, useCallback, useRef } from 'react'
import { trueForgeClient } from '@/lib/trueforge-client'
import { forgeopsAgentSpec, FORGEOPS_AGENT_NAME } from '@/lib/agent-spec'
import type { ChatMessage, ApprovalRequest, ToolCallInfo } from '@/types/events'

interface UseAgentSessionReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  approvalRequests: ApprovalRequest[]
  sessionId: string | null
  error: string | null
  sendMessage: (content: string) => Promise<void>
  approveTool: (approvalId: string, allow: boolean, reason?: string) => Promise<void>
  resetSession: () => void
}

export function useAgentSession(): UseAgentSessionReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<string | null>(null)
  const eventIndex = useRef<Map<string, ChatMessage>>(new Map())

  const createSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current
    try {
      const { data: session } = await trueForgeClient.sessions.create({
        agent: { spec: forgeopsAgentSpec as any },
      })
      sessionRef.current = session.id
      setSessionId(session.id)
      return session.id
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create session'
      setError(msg)
      return null
    }
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    setError(null)
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content, timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    const sid = await createSession()
    if (!sid) return
    setIsStreaming(true)
    const agentMsgId = `agent-${Date.now()}`
    const agentMsg: ChatMessage = { id: agentMsgId, role: 'agent', content: '', timestamp: Date.now(), toolCalls: [] }
    eventIndex.current.set(agentMsgId, agentMsg)
    setMessages((prev) => [...prev, agentMsg])
    try {
      const stream = await trueForgeClient.sessions.createTurnStream(sid, { input: [{ type: 'user.message', content }] })
      const toolCallsMap = new Map<string, ToolCallInfo>()
      const pendingApprovals: ApprovalRequest[] = []
      for await (const { data: event } of stream.withMetadata()) {
        switch (event.type) {
          case 'model.message.delta':
            if (event.content) setMessages((prev) => prev.map((m) => m.id === agentMsgId ? { ...m, content: m.content + event.content! } : m))
            break
          case 'tool.call': {
            const tc: ToolCallInfo = { name: event.toolName ?? 'unknown', arguments: (event.toolArguments ?? {}) as Record<string, unknown>, status: 'running' }
            toolCallsMap.set(event.id, tc)
            setMessages((prev) => prev.map((m) => m.id === agentMsgId ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] } : m))
            break
          }
          case 'tool.result':
            setMessages((prev) => prev.map((m) => { if (m.id !== agentMsgId || !m.toolCalls) return m; return { ...m, toolCalls: m.toolCalls.map((tc) => tc.status === 'running' ? { ...tc, status: 'done', result: event.toolResult } : tc) } }))
            break
          case 'tool.approval_required': {
            const approval: ApprovalRequest = { id: event.id, toolName: event.toolName ?? 'unknown tool', toolArguments: (event.toolArguments ?? {}) as Record<string, unknown>, sourceEventId: event.sourceEventId ?? '' }
            pendingApprovals.push(approval)
            setApprovalRequests((prev) => [...prev, approval])
            setMessages((prev) => prev.map((m) => { if (m.id !== agentMsgId || !m.toolCalls) return m; return { ...m, toolCalls: m.toolCalls.map((tc) => tc.status === 'running' ? { ...tc, status: 'awaiting_approval' } : tc) } }))
            break
          }
          case 'turn.done':
            if (event.state?.status === 'error') setError('Agent turn ended with an error.')
            break
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Streaming failed'
      setError(msg)
    } finally {
      setIsStreaming(false)
    }
  }, [createSession])

  const approveTool = useCallback(async (approvalId: string, allow: boolean, reason?: string) => {
    const sid = sessionRef.current
    if (!sid) return
    setApprovalRequests((prev) => prev.filter((a) => a.id !== approvalId))
    if (!allow) setMessages((prev) => prev.map((m) => { if (!m.toolCalls) return m; return { ...m, toolCalls: m.toolCalls.map((tc) => tc.status === 'awaiting_approval' ? { ...tc, status: 'denied' } : tc) } }))
    setIsStreaming(true)
    try {
      const stream = await trueForgeClient.sessions.createTurnStream(sid, { input: [{ type: 'user.tool_approval', ...(allow ? { allow: true } : { allow: false, reason: reason ?? 'Denied by user' }) } as any] })
      const agentMsgId = `agent-${Date.now()}`
      const agentMsg: ChatMessage = { id: agentMsgId, role: 'agent', content: '', timestamp: Date.now(), toolCalls: [] }
      setMessages((prev) => [...prev, agentMsg])
      for await (const { data: event } of stream.withMetadata()) {
        if (event.type === 'model.message.delta' && event.content) setMessages((prev) => prev.map((m) => m.id === agentMsgId ? { ...m, content: m.content + event.content! } : m))
        if (event.type === 'tool.approval_required') { const approval: ApprovalRequest = { id: event.id, toolName: event.toolName ?? 'unknown tool', toolArguments: (event.toolArguments ?? {}) as Record<string, unknown>, sourceEventId: event.sourceEventId ?? '' }; setApprovalRequests((prev) => [...prev, approval]) }
        if (event.type === 'turn.done' && event.state?.status === 'error') setError('Agent turn ended with an error after approval.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval flow failed'
      setError(msg)
    } finally {
      setIsStreaming(false)
    }
  }, [])

  const resetSession = useCallback(() => {
    sessionRef.current = null
    setSessionId(null)
    setMessages([])
    setApprovalRequests([])
    setError(null)
    eventIndex.current.clear()
  }, [])

  return { messages, isStreaming, approvalRequests, sessionId, error, sendMessage, approveTool, resetSession }
}
