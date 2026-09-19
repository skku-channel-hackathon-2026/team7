import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MEETING_FUNCTIONS,
  type LiveEventKind,
  type LiveOutput,
} from '@tutorial/shared'
import { errorText, useFn } from '../api'

// The meeting itself keeps playful emojis; the rest of the app uses icons.
const EVENT_EMOJI: Record<LiveEventKind | 'idle', string> = {
  idle: '💬',
  start: '🎬',
  topic: '💬',
  mission: '🎯',
  game: '🎲',
  vote: '💘',
  catfish: '🐟',
}

/**
 * Full-screen meeting mode. Everything shown here comes from the server's
 * live state (meeting.live); the browser never decides when an event happens.
 */
export default function LiveScreen({
  meetingId,
  onEnded,
}: {
  meetingId: string
  onEnded: () => void
}) {
  const live = useFn<LiveOutput>(MEETING_FUNCTIONS.live)
  const vote = useFn(MEETING_FUNCTIONS.eventVote)
  const finish = useFn(MEETING_FUNCTIONS.finish)
  const next = useFn(MEETING_FUNCTIONS.nextMc)
  const [data, setData] = useState<LiveOutput | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [error, setError] = useState('')
  const liveCall = live.call
  const inFlight = useRef(false)

  const reload = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const next = await liveCall({ meetingId })
      setData(next)
      setError('')
      if (next.status !== 'live') onEnded()
    } catch (err) {
      setError(errorText(err))
    } finally {
      inFlight.current = false
    }
  }, [liveCall, meetingId, onEnded])

  useEffect(() => {
    void reload()
    const poll = window.setInterval(() => void reload(), 1500)
    return () => window.clearInterval(poll)
  }, [reload])

  const act = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      await reload()
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (!data)
    return (
      <div className="live-screen">
        <div className="live-center">미팅 화면 준비 중…</div>
      </div>
    )

  const minutes = Math.floor(data.elapsedMinutes)
  const event = data.event
  const showEvent = event && (event.active || event.kind === 'vote')
  const kind = showEvent ? event.kind : 'idle'

  return (
    <div className={`live-screen live-${kind}`}>
      <div className="live-top">
        <span>{data.title}</span>
        <span>
          {data.people}명 · {minutes}분째
        </span>
      </div>

      <div
        className="live-card"
        key={showEvent ? `${event.id}-${data.vote?.open}` : 'idle'}
      >
        <div className="live-emoji">{EVENT_EMOJI[kind]}</div>
        {!showEvent && (
          <>
            <div className="live-title">자유 대화 시간</div>
            <div className="live-body">
              편하게 이야기 나누세요. 다음 이벤트는 MC가 깜짝 발표해요!
            </div>
          </>
        )}

        {showEvent && event.kind !== 'vote' && (
          <>
            <div className="live-title">{event.title}</div>
            <div className="live-body">{event.body}</div>
          </>
        )}

        {showEvent && event.kind === 'vote' && data.vote?.open && (
          <>
            <div className="live-title">호감 투표</div>
            <div className="live-body small">
              지금 가장 호감 가는 사람을 골라 주세요. 누가 누구를 골랐는지는
              공개되지 않아요.
            </div>
            <div className="live-picks">
              {data.candidates.map((candidate) => (
                <button
                  type="button"
                  key={candidate.key}
                  className={`live-pick${data.vote?.myVote === candidate.key ? ' on' : ''}`}
                  disabled={vote.loading}
                  onClick={() =>
                    void act(() =>
                      vote.call({
                        meetingId,
                        eventId: event.id,
                        targetKey: candidate.key,
                      })
                    )
                  }
                >
                  <b>{candidate.alias}</b>
                  <span>
                    {candidate.profile.age}세 · {candidate.profile.studentYear}
                    학번
                  </span>
                </button>
              ))}
            </div>
            <div className="live-foot">
              {data.vote.votedCount}/{data.vote.voterCount}명 투표 완료
            </div>
          </>
        )}

        {showEvent && event.kind === 'vote' && !data.vote?.open && (
          <>
            <div className="live-title">호감 투표 결과</div>
            <div className="live-count">
              나를 선택한 사람 <b>{data.vote?.receivedByMe ?? 0}명</b>
            </div>
            <div className="live-body small">
              누가 선택했는지는 공개되지 않아요.
            </div>
          </>
        )}
      </div>

      {error && <div className="live-error">{error}</div>}

      <div className="live-bottom">
        {data.isDemo && (
          <div className="live-demo">
            <span>DEMO</span>
            <button
              type="button"
              disabled={next.loading}
              onClick={() =>
                void act(() => next.call({ meetingId, kind: 'random' }))
              }
            >
              다음 이벤트
            </button>
            <button
              type="button"
              disabled={next.loading}
              onClick={() =>
                void act(() => next.call({ meetingId, kind: 'vote' }))
              }
            >
              호감 투표
            </button>
          </div>
        )}
        {confirmEnd ? (
          <div className="live-end">
            <span>미팅을 종료할까요?</span>
            <button
              type="button"
              onClick={() => setConfirmEnd(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="danger"
              disabled={finish.loading}
              onClick={() => void act(() => finish.call({ meetingId }))}
            >
              종료
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="live-end-link"
            onClick={() => setConfirmEnd(true)}
          >
            미팅 종료
          </button>
        )}
      </div>
    </div>
  )
}
