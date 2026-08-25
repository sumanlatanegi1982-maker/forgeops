interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  disabled: boolean
}

export function ChatInput({ value, onChange, onSubmit, disabled }: ChatInputProps) {
  return (
    <form className="chat-input-form" onSubmit={onSubmit}>
      <div className="chat-input-wrapper">
        <input
          type="text"
          className="chat-input"
          placeholder={
            disabled
              ? 'Agent is working…'
              : 'Ask ForgeOps to review a PR or debug an incident…'
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoFocus
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={disabled || !value.trim()}
        >
          Send →
        </button>
      </div>
    </form>
  )
}
