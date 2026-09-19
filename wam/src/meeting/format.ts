import type {
  BlindProfile,
  Gender,
  MeetingCard,
  MeetingStatus,
  TargetGender,
} from '@tutorial/shared'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export function genderLabel(gender: Gender | TargetGender): string {
  return gender === 'male' ? '남자' : gender === 'female' ? '여자' : '성별 무관'
}

export function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()]
  return `${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}(${weekday})`
}

export function fullDate(date: string): string {
  return date.replace(/-/g, '.')
}

export function shortDept(department: string): string {
  return department.replace(/(학과|학부)$/, '')
}

export function headline(card: MeetingCard): string {
  return `${card.department} ${genderLabel(card.gender)} ${card.size}명`
}

export function blindLine(profile: BlindProfile): string {
  return `${profile.school} ${profile.department} · ${profile.age}세 · ${profile.studentYear}학번`
}

export function planLabel(card: MeetingCard): string {
  if (!card.meetDate) return '날짜·지역은 채팅방에서 정해요'
  return `${dateLabel(card.meetDate)} ${card.meetTime}${card.region ? ` · ${card.region}` : ''}`
}

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  recruiting: '모집 중',
  matched: '매칭 완료',
  live: '미팅 진행 중',
  finished: '종료',
  cancelled: '취소됨',
}

export function today(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function clock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function timeOf(epoch: number): string {
  const date = new Date(epoch)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function shareText(card: MeetingCard): string {
  return [
    `[과메기] ${card.school} ${headline(card)}`,
    card.kind === 'proposal'
      ? `→ ${card.targetDepartment}에 미팅 제안`
      : `${genderLabel(card.targetGender)} 팀 찾는 중`,
    '/tutorial 에서 신청해 주세요!',
  ].join('\n')
}
