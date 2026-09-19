import { useCallback, useEffect, useState } from 'react'
import {
  CalendarIcon,
  ChevronRightIcon,
  SearchIcon,
} from '@channel.io/bezier-icons'
import {
  DEPARTMENTS,
  MEETING_FUNCTIONS,
  type HistoryOutput,
  type ListOutput,
  type MeetingCard,
  type Profile,
} from '@tutorial/shared'
import { errorText, useFn } from '../api'
import { blindLine, genderLabel } from '../format'
import type { Nav } from '../nav'
import {
  Banner,
  Button,
  Empty,
  JoinWithCode,
  MeetingCardView,
  Section,
} from '../ui'

export default function Home({
  nav,
  profile,
  mode,
}: {
  nav: Nav
  profile: Profile
  mode: 'explore' | 'mine'
}) {
  const list = useFn<ListOutput>(MEETING_FUNCTIONS.list)
  const history = useFn<HistoryOutput>(MEETING_FUNCTIONS.history)
  const joinTeam = useFn<{ meetingId: string }>(MEETING_FUNCTIONS.joinTeam)
  const [data, setData] = useState<ListOutput | null>(null)
  const [chats, setChats] = useState<HistoryOutput['privateChats']>([])
  const [error, setError] = useState('')
  const [department, setDepartment] = useState('')
  const listCall = list.call
  const historyCall = history.call

  const load = useCallback(async () => {
    try {
      setError('')
      setData(await listCall({ department: department || undefined }))
      if (mode === 'mine') setChats((await historyCall()).privateChats)
    } catch (err) {
      setError(errorText(err))
    }
  }, [listCall, historyCall, department, mode])

  useEffect(() => {
    void load()
  }, [load])

  const open = (card: MeetingCard) =>
    nav.go(
      card.isMember && card.status !== 'recruiting'
        ? { name: 'room', meetingId: card.id }
        : { name: 'detail', meetingId: card.id }
    )

  if (mode === 'mine') {
    const mine = data?.mine ?? []
    return (
      <div className="page">
        {error && <Banner tone="error">{error}</Banner>}
        {!!chats.length && (
          <Section title="애프터 채팅">
            {chats.map((chat) => (
              <button
                type="button"
                key={chat.chatId}
                className="chat-item"
                onClick={() => nav.go({ name: 'chat', chatId: chat.chatId })}
              >
                <span className="avatar avatar-guest">{chat.partnerAlias}</span>
                <span className="chat-item-body">
                  <b>{blindLine(chat.partner)}</b>
                  <span className="muted small">
                    {chat.lastMessage ?? '첫 메시지를 보내 보세요!'}
                  </span>
                </span>
                <ChevronRightIcon className="chevron" />
              </button>
            ))}
          </Section>
        )}
        <Section title="내 미팅">
          {data && !mine.length && (
            <Empty icon={<CalendarIcon />}>아직 참여 중인 미팅이 없어요.</Empty>
          )}
          <div className="card-list">
            {mine.map((card) => (
              <MeetingCardView
                key={card.id}
                card={card}
                onClick={() => open(card)}
              />
            ))}
          </div>
        </Section>
        <JoinWithCode
          loading={joinTeam.loading}
          onJoin={async (code) => {
            try {
              setError('')
              const result = await joinTeam.call({ code })
              nav.go({ name: 'detail', meetingId: result.meetingId })
            } catch (err) {
              setError(errorText(err))
            }
          }}
        />
      </div>
    )
  }

  const others = (data?.meetings ?? []).filter((card) => !card.isHost)
  const lookingFor = genderLabel(profile.gender === 'male' ? 'female' : 'male')

  return (
    <div className="page">
      <Button
        block
        onClick={() => nav.go({ name: 'create' })}
      >
        + 우리 팀 모집글 올리기
      </Button>

      {!!data?.proposals.length && (
        <Section title="우리 학과에 온 제안">
          <div className="card-list">
            {data.proposals.map((card) => (
              <MeetingCardView
                key={card.id}
                card={card}
                onClick={() => open(card)}
              />
            ))}
          </div>
        </Section>
      )}

      <Section
        title={`${lookingFor} 팀 모집글`}
        action={
          <select
            className="chip-select"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="">모든 학과</option>
            {DEPARTMENTS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        }
      >
        {error && <Banner tone="error">{error}</Banner>}
        {!data && !error && <div className="loading">불러오는 중…</div>}
        {data && !others.length && (
          <Empty icon={<SearchIcon />}>
            아직 모집글이 없어요.
            <br />
            먼저 모집글을 올려 보세요!
          </Empty>
        )}
        <div className="card-list">
          {others.map((card) => (
            <MeetingCardView
              key={card.id}
              card={card}
              onClick={() => open(card)}
            />
          ))}
        </div>
      </Section>
    </div>
  )
}
