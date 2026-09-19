import { useState } from 'react'
import type { Side } from '@tutorial/shared'

import { useApi } from '../../api'
import { useNav } from '../../nav'
import { useAction, useLoad } from '../../hooks/useLoad'
import { MeetingCard } from '../../components/MeetingCard'
import { Badge, Button, Empty, ErrorNote, Loading } from '../../components/ui'
import { memberLine, percent } from '../../utils/format'

export function MyMeetings() {
  const api = useApi()
  const nav = useNav()
  const list = useLoad(() => api.mine(), 'mine', 10000)

  return (
    <div>
      <ErrorNote message={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data && list.data.meetings.length > 0 ? (
        list.data.meetings.map((m) => (
          <MeetingCard
            key={m.id}
            meeting={m}
            onOpen={() => nav.push({ name: 'meeting', id: m.id })}
          />
        ))
      ) : (
        <Empty icon="🗓">
          아직 참여한 미팅이 없어요.
          <br />
          홈에서 미팅을 찾아 신청해 보세요!
        </Empty>
      )}
    </div>
  )
}

export function Inbox() {
  const api = useApi()
  const nav = useNav()
  const list = useLoad(() => api.inbox(), 'inbox', 10000)
  const { busy, error, run } = useAction()

  const accept = async (meetingId: string, side: Side) => {
    const done = await run(async () => {
      await api.apply({ meetingId, side })
      return true
    })
    if (done) nav.push({ name: 'meeting', id: meetingId })
    else await list.reload()
  }

  const decline = (meetingId: string) =>
    void run(async () => {
      await api.decline(meetingId)
      await list.reload()
    })

  return (
    <div>
      <p className="muted small">
        다른 학과에서 우리 학과에 보낸 미팅 제안이에요. 수락하면 자리가 채워지고
        모두 모이면 미팅이 성사돼요.
      </p>
      <ErrorNote message={error || list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data && list.data.meetings.length > 0 ? (
        list.data.meetings.map((m) => (
          <MeetingCard
            key={m.id}
            meeting={m}
            busy={busy}
            onOpen={() => nav.push({ name: 'meeting', id: m.id })}
            onApply={(side) => void accept(m.id, side)}
            extra={
              <Button
                small
                variant="ghost"
                disabled={busy}
                onClick={() => decline(m.id)}
              >
                거절
              </Button>
            }
          />
        ))
      ) : (
        <Empty icon="📭">받은 제안이 없어요.</Empty>
      )}
    </div>
  )
}

export function DmList() {
  const api = useApi()
  const nav = useNav()
  const list = useLoad(() => api.dmList(), 'dms', 10000)

  return (
    <div>
      <p className="muted small">
        서로 애프터를 원한 상대와의 개인 채팅방이에요. 연락처·SNS는 두 사람이
        모두 동의해야 공개돼요.
      </p>
      <ErrorNote message={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data && list.data.rooms.length > 0 ? (
        list.data.rooms.map((room) => (
          <div
            key={room.roomId}
            className="card clickable"
            role="button"
            tabIndex={0}
            onClick={() => nav.push({ name: 'dm', id: room.roomId })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') nav.push({ name: 'dm', id: room.roomId })
            }}
          >
            <div className="row between">
              <b>
                💌 {room.partner.alias}{' '}
                <span className="muted small">({room.meetingTitle})</span>
              </b>
              {room.partnerContact !== null ? (
                <Badge tone="ok">연락처 교환됨</Badge>
              ) : room.myConsent ? (
                <Badge tone="warn">상대 동의 대기</Badge>
              ) : (
                <Badge>채팅 중</Badge>
              )}
            </div>
            <div className="muted small">{memberLine(room.partner)}</div>
          </div>
        ))
      ) : (
        <Empty icon="💬">아직 열린 개인 채팅방이 없어요.</Empty>
      )}
    </div>
  )
}

export function Records() {
  const api = useApi()
  const nav = useNav()
  const list = useLoad(() => api.recordList(), 'records', 20000)

  return (
    <div>
      <ErrorNote message={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.data && list.data.records.length > 0 ? (
        list.data.records.map((r) => (
          <div
            key={r.meetingId}
            className="card clickable"
            role="button"
            tabIndex={0}
            onClick={() =>
              nav.push({ name: 'meeting', id: r.meetingId, tab: 'review' })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                nav.push({ name: 'meeting', id: r.meetingId, tab: 'review' })
            }}
          >
            <div className="muted small">{r.date}</div>
            <div className="headline">
              {r.myDept} × {r.otherDept || '-'}
            </div>
            <div>
              {r.size} : {r.size} 미팅
            </div>
            <div className="row wrap muted small">
              <span>📍 {r.placeName || r.region}</span>
              <Badge tone={r.afterCount > 0 ? 'primary' : 'neutral'}>
                애프터 {r.afterCount}명
              </Badge>
              {r.status === 'finished' && (
                <Badge tone={r.reviewed ? 'ok' : 'warn'}>
                  {r.reviewed ? '후기 작성됨' : '후기 작성하기'}
                </Badge>
              )}
            </div>
          </div>
        ))
      ) : (
        <Empty icon="📒">
          성사된 미팅이 여기에 기록돼요.
          <br />
          날짜, 상대 학과, 장소, 애프터 여부까지 한눈에 볼 수 있어요.
        </Empty>
      )}
    </div>
  )
}

export function Stats() {
  const api = useApi()
  const list = useLoad(() => api.stats(), 'stats', 30000)
  const [showAll, setShowAll] = useState(false)
  const data = list.data

  return (
    <div>
      <p className="muted small">
        학과에 점수를 매기지 않고, 실제 미팅 데이터에서 나온 통계만 보여줘요.
        데모 참가자는 집계에서 제외돼요.
      </p>
      <ErrorNote message={list.error} />
      {list.loading && !data ? (
        <Loading />
      ) : data && data.stats.length > 0 ? (
        <>
          {(showAll ? data.stats : data.stats.slice(0, 10)).map((s) => (
            <div
              key={s.dept}
              className="card"
            >
              <div className="row between">
                <div className="headline">{s.dept}</div>
                {s.reviewCount < data.minSample && (
                  <Badge tone="warn">표본 적음</Badge>
                )}
              </div>
              <div className="muted small">
                최근 30일 미팅 {s.recentMeetings}회 · 누적 {s.meetings}회
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <b>
                    {s.avgSatisfaction === null
                      ? '-'
                      : s.avgSatisfaction.toFixed(1)}
                  </b>
                  <span>평균 만족도</span>
                </div>
                <div className="stat">
                  <b>{percent(s.afterRate)}</b>
                  <span>애프터 발생률</span>
                </div>
                <div className="stat">
                  <b>{percent(s.matchRate)}</b>
                  <span>미팅 성사율</span>
                </div>
                <div className="stat">
                  <b>{percent(s.rejoinRate)}</b>
                  <span>재참여 의사</span>
                </div>
                <div className="stat">
                  <b>{s.reviewCount}</b>
                  <span>후기 수</span>
                </div>
              </div>
            </div>
          ))}
          {data.stats.length > 10 && (
            <Button
              variant="ghost"
              block
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? '접기' : `전체 ${data.stats.length}개 학과 보기`}
            </Button>
          )}
        </>
      ) : (
        <Empty icon="📊">
          아직 집계할 미팅 데이터가 없어요.
          <br />
          미팅이 쌓이면 학과별 통계가 만들어져요.
        </Empty>
      )}
    </div>
  )
}
