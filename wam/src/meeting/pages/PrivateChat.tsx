import { useCallback, useEffect, useRef, useState } from 'react'
import { MEETING_FUNCTIONS, type PrivateChatOutput } from '@tutorial/shared'
import { errorText, useFn } from '../api'
import { blindLine, fullDate, timeOf } from '../format'
import { Banner, Button } from '../ui'

export default function PrivateChat({ chatId }: { chatId: string }) {
  const get = useFn<PrivateChatOutput>(MEETING_FUNCTIONS.privateChat)
  const send = useFn(MEETING_FUNCTIONS.sendPrivate)
  const share = useFn(MEETING_FUNCTIONS.shareContact)
  const [data, setData] = useState<PrivateChatOutput | null>(null)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const getCall = get.call

  const load = useCallback(async () => {
    try {
      setData(await getCall({ chatId }))
    } catch (err) {
      setError(errorText(err))
    }
  }, [getCall, chatId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(timer)
  }, [load])

  const count = data?.messages.length ?? 0
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [count])

  const act = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      await load()
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (!data)
    return (
      <div className="page">
        {error ? (
          <Banner tone="error">{error}</Banner>
        ) : (
          <div className="loading">불러오는 중…</div>
        )}
      </div>
    )

  return (
    <div className="panel chat private">
      <div className="private-head">
        <span className="avatar avatar-guest">{data.partnerAlias}</span>
        <div>
          <b>애프터 매칭</b>
          <div className="muted small">
            {blindLine(data.partner)} · {fullDate(data.meetDate)} 미팅
          </div>
        </div>
      </div>
      <p className="muted small center">
        서로 애프터를 선택해서 열린 둘만의 채팅방이에요. 연락처는 원할 때 직접
        공유하세요.
      </p>
      <div className="messages">
        {data.messages.map((message) => (
          <div
            key={message.id}
            className={`bubble-row${message.mine ? ' mine' : ''}`}
          >
            <div className="bubble">{message.body}</div>
            <div className="bubble-time">{timeOf(message.createdAt)}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <Button
        small
        variant="secondary"
        disabled={share.loading}
        onClick={() => void act(() => share.call({ chatId }))}
      >
        내 연락처 공유하기
      </Button>
      <form
        className="input-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!body.trim()) return
          void act(async () => {
            await send.call({ chatId, body })
            setBody('')
          })
        }}
      >
        <input
          value={body}
          maxLength={500}
          placeholder="메시지 보내기"
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
