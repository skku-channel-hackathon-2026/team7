import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CalendarIcon,
  ChatBubbleIcon,
  GroupIcon,
  PersonAddIcon,
  type BezierIcon,
} from '@channel.io/bezier-icons'
import { MEETING_FUNCTIONS, type RoomOutput } from '@tutorial/shared'
import { errorText, useFn, useMeetingWamData } from '../api'
import { clock, planLabel, shortDept } from '../format'
import type { Nav } from '../nav'
import { Banner, Button, StatusBadge } from '../ui'
import ChatPanel from './room/ChatPanel'
import MeetingPanel from './room/MeetingPanel'
import PlanPanel from './room/PlanPanel'

type Tab = 'chat' | 'plan' | 'meeting'

export default function Room({
  nav,
  meetingId,
}: {
  nav: Nav
  meetingId: string
}) {
  const wam = useMeetingWamData()
  const room = useFn<RoomOutput>(MEETING_FUNCTIONS.room)
  const linkGroup = useFn<{ sent: boolean }>(MEETING_FUNCTIONS.linkGroup)
  const [data, setData] = useState<RoomOutput | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<Tab | null>(null)
  const roomCall = room.call
  const inFlight = useRef(false)

  const reload = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      setData(await roomCall({ meetingId }))
      setError('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      inFlight.current = false
    }
  }, [roomCall, meetingId])

  useEffect(() => {
    void reload()
    const timer = window.setInterval(() => void reload(), 2500)
    return () => window.clearInterval(timer)
  }, [reload])

  if (!data)
    return (
      <div className="page">
        {error ? (
          <Banner tone="error">{error}</Banner>
        ) : (
          <div className="loading">채팅방 여는 중…</div>
        )}
      </div>
    )

  if (data.catfish.waiting)
    return (
      <CatfishWaiting
        data={data}
        reload={reload}
      />
    )

  const status = data.meeting.status
  const activeTab: Tab = tab ?? (status === 'finished' ? 'meeting' : 'chat')
  const other = data.meeting.guestDepartment ?? '상대 학과'

  const doLink = async () => {
    try {
      const result = await linkGroup.call({
        meetingId,
        targetToken: wam.targetToken,
      })
      setNotice(
        result.sent
          ? '알림방을 연결했어요.'
          : '알림방을 연결했어요. (봇 메시지는 공개 그룹에서만 전송돼요)'
      )
      await reload()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="room">
      <div className="room-head">
        <div className="room-title">
          <b>
            {shortDept(data.meeting.department)} × {shortDept(other)}
          </b>
          <StatusBadge status={status} />
        </div>
        <div className="room-sub">
          <CalendarIcon />
          {planLabel(data.meeting)}
        </div>
        <div className="member-strip">
          {data.members.map((member) => (
            <span
              key={member.key}
              className={`avatar avatar-${member.side}${member.isMe ? ' me' : ''}`}
              title={`${member.profile.school} ${member.profile.department}`}
            >
              {member.alias}
            </span>
          ))}
        </div>
      </div>

      {!data.linkedGroup && wam.targetToken && (
        <div className="link-group">
          <span>채널톡 그룹에도 알림 받기</span>
          <Button
            small
            onClick={() => void doLink()}
            disabled={linkGroup.loading}
          >
            연결
          </Button>
        </div>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}

      <div className="tabs">
        {(
          [
            ['chat', ChatBubbleIcon, '채팅'],
            ['plan', CalendarIcon, '약속 정하기'],
            ['meeting', GroupIcon, '미팅'],
          ] as [Tab, BezierIcon, string][]
        ).map(([key, Icon, label]) => (
          <button
            type="button"
            key={key}
            className={activeTab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>

      <div className="room-body">
        {activeTab === 'chat' && (
          <ChatPanel
            data={data}
            reload={reload}
          />
        )}
        {activeTab === 'plan' && (
          <PlanPanel
            data={data}
            reload={reload}
          />
        )}
        {activeTab === 'meeting' && (
          <MeetingPanel
            data={data}
            reload={reload}
            openChat={(chatId) => nav.go({ name: 'chat', chatId })}
          />
        )}
      </div>
    </div>
  )
}

function CatfishWaiting({
  data,
  reload,
}: {
  data: RoomOutput
  reload: () => Promise<void>
}) {
  const enter = useFn(MEETING_FUNCTIONS.enterCatfish)
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')
  const waiting = data.catfish.waiting!

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const left = waiting.availableAt
    ? Math.max(0, Math.ceil((waiting.availableAt - now) / 1000))
    : null

  return (
    <div className="page center-page">
      <div className="icon-circle">
        <PersonAddIcon />
      </div>
      <h2>메기로 초대됐어요</h2>
      <p className="muted">
        {data.meeting.school} {data.meeting.department} ×{' '}
        {data.meeting.guestSchool} {data.meeting.guestDepartment}
      </p>
      <p>
        {data.meeting.status !== 'live'
          ? '미팅이 시작되고 1시간 후에 입장할 수 있어요.'
          : left
            ? `입장까지 ${clock(left)}`
            : '지금 입장할 수 있어요!'}
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      <Button
        block
        disabled={!waiting.canEnter || enter.loading || !!left}
        onClick={() =>
          void enter
            .call({ meetingId: data.meeting.id })
            .then(reload)
            .catch((err: unknown) => setError(errorText(err)))
        }
      >
        미팅 입장하기
      </Button>
    </div>
  )
}
