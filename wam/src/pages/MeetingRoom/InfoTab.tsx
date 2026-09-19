import type { MeetingDetail, Side } from '@tutorial/shared'

import { useApi } from '../../api'
import { useAction } from '../../hooks/useLoad'
import { TeamCondition, Teams } from '../../components/Teams'
import { Badge, Button, ErrorNote, Notice } from '../../components/ui'
import { formatDateTime, sideName } from '../../utils/format'

interface Props {
  meeting: MeetingDetail
  reload: () => Promise<void>
  onLeft: () => void
}

export function InfoTab({ meeting, reload, onLeft }: Props) {
  const api = useApi()
  const { busy, error, run } = useAction()
  const joined = meeting.mySide !== null
  const live = meeting.status === 'matched' || meeting.status === 'in_progress'

  const act = (action: () => Promise<unknown>, after?: () => void) =>
    void run(async () => {
      await action()
      await reload()
      after?.()
    })

  return (
    <div>
      <div className="card">
        <div className="row between">
          <b>{meeting.title}</b>
          {meeting.kind === 'proposal' && <Badge tone="primary">제안</Badge>}
        </div>
        {meeting.description && (
          <p style={{ margin: '6px 0' }}>{meeting.description}</p>
        )}
        <div className="row wrap muted small">
          <span>🗓 {formatDateTime(meeting.startAt)}</span>
          <span>📍 {meeting.region}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <TeamCondition meeting={meeting} />
        </div>
      </div>

      <div className="section-title">참가자 (블라인드 정보만 공개)</div>
      <Teams meeting={meeting} />

      <ErrorNote message={error} />

      {meeting.status === 'recruiting' && (
        <div
          className="row wrap"
          style={{ marginTop: 12 }}
        >
          {!joined &&
            meeting.applicableSides.map((side: Side) => (
              <Button
                key={side}
                disabled={busy}
                onClick={() =>
                  act(() => api.apply({ meetingId: meeting.id, side }))
                }
              >
                {sideName(side)}로{' '}
                {meeting.kind === 'proposal' ? '수락' : '신청'}
              </Button>
            ))}
          {!joined && meeting.applicableSides.length === 0 && (
            <Notice>
              내 프로필이 이 미팅의 조건과 맞지 않거나 자리가 없어요.
            </Notice>
          )}
          {joined && !meeting.isHost && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => act(() => api.leave(meeting.id), onLeft)}
            >
              참여 취소
            </Button>
          )}
          {meeting.isHost && (
            <>
              <Button
                variant="soft"
                disabled={busy}
                onClick={() => act(() => api.demoFill(meeting.id))}
              >
                🧪 데모 참가자로 채우기
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => act(() => api.cancel(meeting.id), onLeft)}
              >
                모집 취소
              </Button>
            </>
          )}
        </div>
      )}
      {meeting.status === 'recruiting' && meeting.isHost && (
        <p className="muted small">
          🧪 시연용: 남은 자리를 표시된 &quot;데모&quot; 참가자로 채워 혼자서도
          전체 흐름을 체험할 수 있어요.
        </p>
      )}

      {live && joined && (
        <div style={{ marginTop: 12 }}>
          <div className="card">
            <div className="row between">
              <div>
                <b>미팅 일정 확인</b>
                <div className="muted small">
                  {meeting.pendingAcks > 0
                    ? `아직 ${meeting.pendingAcks}명이 확인하지 않았어요`
                    : '모든 참가자가 확인했어요 ✅'}
                </div>
              </div>
              {meeting.myScheduleAcked ? (
                <Badge tone="ok">확인함</Badge>
              ) : (
                <Button
                  small
                  disabled={busy}
                  onClick={() => act(() => api.ack(meeting.id))}
                >
                  일정 확인
                </Button>
              )}
            </div>
            {meeting.pendingAcks > 0 && (
              <div style={{ marginTop: 8 }}>
                <Button
                  small
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(() => api.nudge(meeting.id))}
                >
                  🔔 확인 요청 보내기
                </Button>
              </div>
            )}
          </div>
          {meeting.place && (
            <div className="card">
              <b>📍 {meeting.place.name}</b>
              {meeting.place.reservedFor && (
                <div>예약: {meeting.place.reservedFor}</div>
              )}
              <a
                className="link"
                href={meeting.place.url}
                target="_blank"
                rel="noreferrer"
              >
                예약 보기
              </a>
            </div>
          )}
        </div>
      )}
      {meeting.status === 'cancelled' && (
        <Notice error>취소된 미팅이에요.</Notice>
      )}
    </div>
  )
}
