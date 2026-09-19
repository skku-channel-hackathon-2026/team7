import type { MeetingDetail, MeetingSummary } from '@tutorial/shared'

import {
  conditionText,
  genderText,
  memberLine,
  sideName,
} from '../utils/format'
import { Badge } from './ui'

type SummaryLike = Pick<
  MeetingSummary,
  'size' | 'condA' | 'condB' | 'countA' | 'countB'
>

export function TeamCondition({ meeting }: { meeting: SummaryLike }) {
  return (
    <div className="stack">
      {(['a', 'b'] as const).map((side) => {
        const cond = side === 'a' ? meeting.condA : meeting.condB
        const count = side === 'a' ? meeting.countA : meeting.countB
        return (
          <div
            key={side}
            className="row between"
          >
            <span>
              <b>{sideName(side)}</b> {conditionText(cond)}
            </span>
            <Badge tone={count >= meeting.size ? 'ok' : 'primary'}>
              {count}/{meeting.size}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}

/** Blind roster: only alias, department, admission year and age are shown. */
export function Teams({ meeting }: { meeting: MeetingDetail }) {
  return (
    <div className="teams">
      {(['a', 'b'] as const).map((side) => {
        const members = meeting.members.filter((m) => m.side === side)
        const empty = Math.max(0, meeting.size - members.length)
        return (
          <div
            key={side}
            className="team"
          >
            <h4>
              {sideName(side)} ({members.length}/{meeting.size})
            </h4>
            {members.map((m) => (
              <div
                key={m.memberId}
                className={m.isMe ? 'member me' : 'member'}
              >
                {m.alias}
                {m.isMe ? ' (나)' : ''} · {genderText(m)}
                <br />
                <span className="muted">{memberLine(m)}</span>
                {m.isDemo && (
                  <>
                    {' '}
                    <Badge tone="warn">데모</Badge>
                  </>
                )}
              </div>
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <div
                key={`empty-${i}`}
                className="seat-empty"
              >
                빈자리
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
