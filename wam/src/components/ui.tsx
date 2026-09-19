import type { ReactNode } from 'react'

export function Button({
  children,
  onClick,
  variant = 'primary',
  small = false,
  block = false,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'soft' | 'danger'
  small?: boolean
  block?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const cls = [
    'btn',
    variant === 'primary' ? '' : variant,
    small ? 'small' : '',
    block ? 'block' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type={type}
      className={cls}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'ok' | 'warn' | 'male' | 'female'
}) {
  return (
    <span className={tone === 'neutral' ? 'badge' : `badge ${tone}`}>
      {children}
    </span>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

export function Notice({
  children,
  error = false,
}: {
  children: ReactNode
  error?: boolean
}) {
  return <div className={error ? 'notice error' : 'notice'}>{children}</div>
}

export function ErrorNote({ message }: { message: string }) {
  return message ? <Notice error>{message}</Notice> : null
}

export function Empty({
  icon = '🫧',
  children,
}: {
  icon?: string
  children: ReactNode
}) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      {children}
    </div>
  )
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return <div className="spinner">{label}</div>
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="chips">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'chip active' : 'chip'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Stars({
  value,
  onChange,
  label,
}: {
  value: number
  onChange?: (value: number) => void
  label: string
}) {
  return (
    <div className="row between">
      <span>{label}</span>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n}점`}
            disabled={!onChange}
            className={n <= value ? 'on' : ''}
            onClick={() => onChange?.(n)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}
