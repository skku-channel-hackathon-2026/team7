import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { CheckCircleFilledIcon } from '@channel.io/bezier-icons'
import { MEETING_FUNCTIONS, type RoomOutput } from '@tutorial/shared'
import { errorText, useFn } from '../../api'
import { dateLabel } from '../../format'
import { Banner, Button, Segmented } from '../../ui'

const slotOf = (date: string, hour: number) =>
  `${date} ${String(hour).padStart(2, '0')}:00`

function slotLabel(slot: string): string {
  const [date, time] = slot.split(' ')
  return `${dateLabel(date)} ${time}`
}

/**
 * TimePick-style date vote: each person paints the hours they are free by
 * dragging over the grid; the group view shades each hour by how many
 * people overlap and ranks the best times.
 */
export default function TimeGrid({
  data,
  reload,
  locked,
}: {
  data: RoomOutput
  reload: () => Promise<void>
  locked: boolean
}) {
  const { availability, meeting } = data
  const save = useFn(MEETING_FUNCTIONS.setAvailability)
  const decide = useFn(MEETING_FUNCTIONS.decideSlot)
  const [mode, setMode] = useState<'mine' | 'group'>(
    availability.mine.length ? 'group' : 'mine'
  )
  const [mine, setMine] = useState<Set<string>>(
    () => new Set(availability.mine)
  )
  const [focus, setFocus] = useState<string | null>(null)
  const [error, setError] = useState('')
  const drag = useRef<{ adding: boolean } | null>(null)
  const dirty = useRef(false)
  const serverMine = availability.mine.join('|')
  const mineRef = useRef(mine)
  mineRef.current = mine

  // Follow the server copy unless I am in the middle of editing.
  useEffect(() => {
    if (!drag.current && !dirty.current)
      setMine(new Set(serverMine ? serverMine.split('|') : []))
  }, [serverMine])

  const paint = (slot: string | undefined) => {
    if (!slot || !drag.current) return
    const adding = drag.current.adding
    setMine((current) => {
      if (current.has(slot) === adding) return current
      const next = new Set(current)
      if (adding) next.add(slot)
      else next.delete(slot)
      return next
    })
  }

  const slotAt = (event: PointerEvent) =>
    (
      document.elementFromPoint(
        event.clientX,
        event.clientY
      ) as HTMLElement | null
    )?.dataset?.slot

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if (mode !== 'mine' || locked) return
    const slot = slotAt(event)
    if (!slot) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { adding: !mine.has(slot) }
    dirty.current = true
    paint(slot)
  }

  const onUp = () => {
    if (!drag.current) return
    drag.current = null
    const slots = [...mineRef.current]
    save
      .call({ meetingId: meeting.id, slots })
      .then(() => {
        dirty.current = false
        return reload()
      })
      .catch((err: unknown) => setError(errorText(err)))
  }

  const total = Math.max(1, availability.total)
  const decidedSlot = meeting.meetDate
    ? `${meeting.meetDate} ${meeting.meetTime}`
    : ''

  return (
    <div className="timegrid">
      <Segmented
        value={mode}
        onChange={(value) => {
          setMode(value)
          setFocus(null)
        }}
        options={[
          { value: 'mine', label: '내 가능 시간' },
          {
            value: 'group',
            label: `모두의 시간 (${availability.responded}/${availability.total}명)`,
          },
        ]}
      />
      <p className="muted small">
        {mode === 'mine'
          ? '가능한 시간을 누르거나 드래그해서 칠해 주세요. 다시 칠하면 지워져요.'
          : '진할수록 많은 사람이 가능한 시간이에요. 칸을 누르면 누가 되는지 보여요.'}
      </p>

      <div
        className={`grid-wrap${mode === 'mine' ? ' editing' : ''}`}
        onPointerDown={onDown}
        onPointerMove={(event) => drag.current && paint(slotAt(event))}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `34px repeat(${availability.dates.length}, 1fr)`,
          }}
        >
          <span />
          {availability.dates.map((date) => (
            <span
              key={date}
              className="grid-date"
            >
              {dateLabel(date).replace('(', '\n(')}
            </span>
          ))}
          {availability.hours.map((hour) => [
            <span
              key={`h${hour}`}
              className="grid-hour"
            >
              {hour}시
            </span>,
            ...availability.dates.map((date) => {
              const slot = slotOf(date, hour)
              const people = availability.available[slot] ?? []
              if (mode === 'mine')
                return (
                  <span
                    key={slot}
                    data-slot={slot}
                    className={`cell${mine.has(slot) ? ' on' : ''}`}
                  />
                )
              const ratio = people.length / total
              return (
                <button
                  type="button"
                  key={slot}
                  className={`cell heat${focus === slot ? ' focus' : ''}${slot === decidedSlot ? ' decided' : ''}`}
                  style={{
                    background: people.length
                      ? `rgba(240, 69, 122, ${0.15 + ratio * 0.85})`
                      : undefined,
                  }}
                  onClick={() => setFocus(focus === slot ? null : slot)}
                >
                  {people.length || ''}
                </button>
              )
            }),
          ])}
        </div>
      </div>

      {mode === 'group' && focus && (
        <div className="grid-focus">
          <b>{slotLabel(focus)}</b>
          <span>
            {(availability.available[focus] ?? []).length
              ? `${availability.available[focus].join(', ')} 가능 · ${availability.available[focus].length}/${availability.total}명`
              : '가능한 사람이 없어요'}
          </span>
        </div>
      )}

      {save.loading && <p className="muted small">저장 중…</p>}
      {error && <Banner tone="error">{error}</Banner>}

      {!!availability.best.length && (
        <div className="best">
          <div className="best-title">가장 많이 겹치는 시간</div>
          {availability.best.map(({ slot, count }) => (
            <div
              key={slot}
              className={`best-row${slot === decidedSlot ? ' decided' : ''}`}
            >
              <span className="best-slot">{slotLabel(slot)}</span>
              <span className="best-count">
                {count === availability.total && (
                  <CheckCircleFilledIcon className="ok-icon" />
                )}
                {count}/{availability.total}명
              </span>
              {slot === decidedSlot ? (
                <span className="tag">확정</span>
              ) : (
                !locked && (
                  <Button
                    small
                    variant="ghost"
                    disabled={decide.loading}
                    onClick={() =>
                      void decide
                        .call({ meetingId: meeting.id, slot })
                        .then(reload)
                        .catch((err: unknown) => setError(errorText(err)))
                    }
                  >
                    확정
                  </Button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
