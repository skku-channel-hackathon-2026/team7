import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessageView, ChatRoomType } from '@tutorial/shared'

import { useApi } from '../api'
import { errorText } from '../hooks/useLoad'
import { formatClock } from '../utils/format'
import { Button, ErrorNote } from './ui'

interface Props {
  roomType: ChatRoomType
  roomId: string
  /** Fired whenever new messages arrive so parents can refresh derived state. */
  onActivity?: () => void
}

const POLL_MS = 3000

export function ChatPanel({ roomType, roomId, onActivity }: Props) {
  const api = useApi()
  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const lastId = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)
  const activityRef = useRef(onActivity)
  activityRef.current = onActivity

  const poll = useCallback(async () => {
    try {
      const result = await api.chatList({
        roomType,
        roomId,
        afterId: lastId.current,
      })
      setError('')
      if (result.messages.length > 0) {
        const last = result.messages[result.messages.length - 1]
        if (last) lastId.current = last.id
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id))
          return [...prev, ...result.messages.filter((m) => !seen.has(m.id))]
        })
        activityRef.current?.()
      }
    } catch (e) {
      setError(errorText(e))
    }
  }, [api, roomType, roomId])

  useEffect(() => {
    lastId.current = 0
    setMessages([])
    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    return () => clearInterval(timer)
  }, [poll])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await api.chatSend({ roomType, roomId, body })
      setText('')
      await poll()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="chat">
      <div
        className="chat-log"
        ref={logRef}
      >
        {messages.length === 0 && (
          <div className="sys">아직 메시지가 없어요. 먼저 인사해 보세요 👋</div>
        )}
        {messages.map((m) =>
          m.kind === 'text' ? (
            <div
              key={m.id}
              className={m.mine ? 'bubble mine' : 'bubble'}
            >
              {!m.mine && <div className="who">{m.senderAlias}</div>}
              {m.body}
              <div className="time">{formatClock(m.createdAt)}</div>
            </div>
          ) : (
            <div
              key={m.id}
              className={`sys ${m.kind === 'prompt' ? 'prompt' : m.kind === 'nudge' ? 'nudge' : ''}`}
            >
              {m.body}
            </div>
          )
        )}
      </div>
      {error && (
        <div style={{ padding: '0 12px' }}>
          <ErrorNote message={error} />
        </div>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          type="text"
          value={text}
          maxLength={1000}
          placeholder="메시지를 입력하세요"
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          type="submit"
          disabled={!text.trim() || sending}
        >
          전송
        </Button>
      </form>
    </div>
  )
}
