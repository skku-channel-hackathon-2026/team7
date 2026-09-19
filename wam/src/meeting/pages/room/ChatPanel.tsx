import { useEffect, useRef, useState } from 'react'
import { MEETING_FUNCTIONS, type RoomOutput } from '@tutorial/shared'
import { errorText, useFn } from '../../api'
import { timeOf } from '../../format'
import { Banner, Button } from '../../ui'

export default function ChatPanel({
  data,
  reload,
}: {
  data: RoomOutput
  reload: () => Promise<void>
}) {
  const send = useFn(MEETING_FUNCTIONS.sendMessage)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const count = data.messages.length

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [count])

  const submit = async () => {
    const text = body.trim()
    if (!text) return
    setError('')
    try {
      await send.call({ meetingId: data.meeting.id, body: text })
      setBody('')
      await reload()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="panel chat">
      <div className="messages">
        {data.messages.map((message) =>
          message.kind === 'chat' ? (
            <div
              key={message.id}
              className={`bubble-row${message.mine ? ' mine' : ''}`}
            >
              {!message.mine && (
                <div className="bubble-alias">{message.senderAlias}</div>
              )}
              <div className="bubble">{message.body}</div>
              <div className="bubble-time">{timeOf(message.createdAt)}</div>
            </div>
          ) : (
            <div
              key={message.id}
              className={`system-message ${message.kind}`}
            >
              {message.body}
            </div>
          )
        )}
        <div ref={bottom} />
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <form
        className="input-row"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          value={body}
          maxLength={500}
          placeholder="단체방에 메시지 보내기"
          onChange={(event) => setBody(event.target.value)}
        />
        <Button
          type="submit"
          disabled={send.loading || !body.trim()}
        >
          전송
        </Button>
      </form>
    </div>
  )
}
