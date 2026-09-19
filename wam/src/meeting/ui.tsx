import { useState, type ReactNode } from 'react'
import { StarFilledIcon } from '@channel.io/bezier-icons'
import type { MeetingCard } from '@tutorial/shared'
import { STATUS_LABEL, genderLabel, headline } from './format'

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  small,
  block,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  small?: boolean
  block?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${small ? ' btn-small' : ''}${block ? ' btn-block' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`chip${active ? ' chip-active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  )
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  suffix?: string
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="줄이기"
      >
        −
      </button>
      <span>
        {value}
        {suffix}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="늘리기"
      >
        +
      </button>
    </div>
  )
}

export function Stars({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          type="button"
          key={score}
          className={score <= value ? 'on' : ''}
          onClick={() => onChange(score)}
          aria-label={`${score}점`}
        >
          <StarFilledIcon />
        </button>
      ))}
    </div>
  )
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success'
  children: ReactNode
}) {
  return <div className={`banner banner-${tone}`}>{children}</div>
}

export function Empty({
  icon,
  children,
}: {
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div>{children}</div>
    </div>
  )
}

export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function StatusBadge({ status }: { status: MeetingCard['status'] }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
}

export function MeetingCardView({
  card,
  onClick,
}: {
  card: MeetingCard
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`meeting-card${card.kind === 'proposal' ? ' proposal' : ''}`}
      onClick={onClick}
    >
      <span className={`gender-dot gender-${card.gender}`}>
        {card.gender === 'male' ? '남' : '여'}
      </span>
      <span className="meeting-card-body">
        <span className="meeting-card-school">{card.school}</span>
        <span className="meeting-card-title">{headline(card)}</span>
        <span className="meeting-card-meta">
          {card.kind === 'proposal'
            ? `${card.targetDepartment}에 제안`
            : card.status === 'recruiting'
              ? `${genderLabel(card.targetGender)} 팀 찾는 중`
              : card.guestDepartment
                ? `× ${card.guestSchool ?? ''} ${card.guestDepartment}`
                : ''}
        </span>
      </span>
      <span className="meeting-card-side">
        <span className="meeting-card-size">
          {card.size}:{card.size}
        </span>
        {card.status !== 'recruiting' ? (
          <StatusBadge status={card.status} />
        ) : card.isHost ? (
          <span className="badge badge-mine">내 모집</span>
        ) : card.applied ? (
          <span className="badge badge-applied">신청함</span>
        ) : null}
      </span>
    </button>
  )
}

export function JoinWithCode({
  loading,
  onJoin,
}: {
  loading: boolean
  onJoin: (code: string) => Promise<void>
}) {
  const [code, setCode] = useState('')
  return (
    <Section title="초대 코드로 팀 합류">
      <div className="input-row">
        <input
          value={code}
          maxLength={12}
          placeholder="팀 대표에게 받은 코드 (예: K7P2QX)"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <Button
          disabled={loading || code.length < 4}
          onClick={() => void onJoin(code)}
        >
          합류
        </Button>
      </div>
    </Section>
  )
}
