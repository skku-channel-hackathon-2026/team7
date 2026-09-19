import {
  GENDER_LABEL,
  describeCondition,
  type MeetingSummary,
  type MemberView,
  type SideCondition,
} from '@tutorial/shared'

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const clockFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export const formatDateTime = (iso: string): string =>
  dateFormat.format(new Date(iso))

export const formatClock = (iso: string): string =>
  clockFormat.format(new Date(iso))

export const percent = (value: number | null): string =>
  value === null ? '-' : `${Math.round(value * 100)}%`

export const STATUS_LABEL: Record<string, string> = {
  recruiting: '모집 중',
  matched: '성사됨',
  in_progress: '진행 중',
  finished: '종료',
  cancelled: '취소됨',
}

export const sideName = (side: 'a' | 'b'): string =>
  side === 'a' ? 'A팀' : 'B팀'

export const conditionText = (cond: SideCondition): string =>
  describeCondition(cond)

/** "컴퓨터공학과 남자 3명 구함" style headline for each side that still has seats. */
export function recruitHeadlines(meeting: MeetingSummary): string[] {
  const lines: string[] = []
  const sides = [
    { cond: meeting.condA, open: meeting.size - meeting.countA },
    { cond: meeting.condB, open: meeting.size - meeting.countB },
  ]
  for (const { cond, open } of sides) {
    if (open <= 0) continue
    const gender = cond.gender === 'any' ? '' : ` ${GENDER_LABEL[cond.gender]}`
    lines.push(`${cond.dept || '학과 무관'}${gender} ${open}명 구함`)
  }
  return lines
}

export const memberLine = (member: MemberView): string =>
  `${member.dept} · ${member.admissionYear}학번 · ${member.age}세`

export const genderText = (member: Pick<MemberView, 'gender'>): string =>
  member.gender === 'male' ? '남' : '여'

/** Converts a `datetime-local` value (local time) to an ISO string. */
export const localToIso = (value: string): string =>
  new Date(value).toISOString()

export function defaultStartLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
  d.setHours(19, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
