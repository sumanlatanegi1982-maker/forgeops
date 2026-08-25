import type { ChatMessage as ChatMessageType } from '@/types/events'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-agent'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className="markdown-body">
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            ) : (
              <span className="typing-indicator">
                <span /> <span /> <span />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
