import type { ReactNode } from 'react'
import type { MeetingSummary, Side } from '@tutorial/shared'

import {
  STATUS_LABEL,
  formatDateTime,
  recruitHeadlines,
  sideName,
} from '../utils/format'
import { Badge, Button } from './ui'
import { TeamCondition } from './Teams'

interface Props {
  meeting: MeetingSummary
  onOpen: () => void
  onApply?: (side: Side) => void
  busy?: boolean
  extra?: ReactNode
}

export function MeetingCard({ meeting, onOpen, onApply, busy, extra }: Props) {
  const headlines =
    meeting.status === 'recruiting'
      ? recruitHeadlines(meeting)
      : [`${meeting.size}:${meeting.size} 미팅`]
  return (
    <div className="card">
      <div
        className="clickable"
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen()
        }}
      >
        <div className="row between">
          <div className="headline">{headlines.join(' / ')}</div>
          <Badge tone={meeting.status === 'recruiting' ? 'primary' : 'neutral'}>
            {STATUS_LABEL[meeting.status] ?? meeting.status}
          </Badge>
        </div>
        <div className="muted small">
          {meeting.title}
          {meeting.kind === 'proposal' ? ' · 제안' : ''}
        </div>
        <div style={{ margin: '8px 0' }}>
          <TeamCondition meeting={meeting} />
        </div>
        <div className="row wrap muted small">
          <span>🗓 {formatDateTime(meeting.startAt)}</span>
          <span>📍 {meeting.region}</span>
          {meeting.mySide && (
            <Badge tone="ok">{sideName(meeting.mySide)}로 참여 중</Badge>
          )}
          {meeting.isHost && <Badge tone="primary">내가 모집</Badge>}
        </div>
      </div>
      {(onApply || extra) && (
        <div
          className="row wrap"
          style={{ marginTop: 10 }}
        >
          {onApply &&
            meeting.applicableSides.map((side) => (
              <Button
                key={side}
                small
                disabled={busy}
                onClick={() => onApply(side)}
              >
                {sideName(side)}로{' '}
                {meeting.kind === 'proposal' ? '수락' : '신청'}
              </Button>
            ))}
          {extra}
        </div>
      )}
    </div>
  )
}
