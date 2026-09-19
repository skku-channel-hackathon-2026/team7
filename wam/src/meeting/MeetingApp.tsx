import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWamClose, useWamSize } from '@channel.io/app-sdk-wam'
import {
  CancelIcon,
  ChevronLeftIcon,
  HeartIcon,
  HomeIcon,
  PersonIcon,
  TrophyIcon,
  type BezierIcon,
} from '@channel.io/bezier-icons'
import { MEETING_FUNCTIONS, type Profile } from '@tutorial/shared'
import { errorText, useFn, useMeetingWamData } from './api'
import type { Nav, View } from './nav'
import Create from './pages/Create'
import Detail from './pages/Detail'
import Home from './pages/Home'
import LiveScreen from './pages/LiveScreen'
import PrivateChat from './pages/PrivateChat'
import Rank from './pages/Rank'
import ProfileForm from './pages/ProfileForm'
import Room from './pages/Room'
import { Banner, Button } from './ui'
import './meeting.css'

const TABS: { view: View; icon: BezierIcon; label: string }[] = [
  { view: { name: 'home' }, icon: HomeIcon, label: '탐색' },
  { view: { name: 'mine' }, icon: HeartIcon, label: '내 미팅' },
  { view: { name: 'rank' }, icon: TrophyIcon, label: '랭크' },
  { view: { name: 'profile' }, icon: PersonIcon, label: '프로필' },
]

const TITLES: Record<View['name'], string> = {
  home: '과메기',
  mine: '내 미팅',
  rank: '학과 랭크',
  profile: '블라인드 프로필',
  create: '미팅 만들기',
  detail: '미팅 상세',
  room: '단체 채팅방',
  chat: '애프터 채팅',
}

export default function MeetingApp() {
  const { setSize } = useWamSize()
  const { close } = useWamClose()
  const wam = useMeetingWamData()
  const getMe = useFn<{
    profile: Profile | null
    liveMeetingId: string | null
  }>(MEETING_FUNCTIONS.getMe)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [stack, setStack] = useState<View[]>([{ name: 'home' }])
  const [liveMeetingId, setLiveMeetingId] = useState<string | null>(null)
  const getMeCall = getMe.call

  useEffect(() => {
    setSize({ width: 420, height: 720 })
    document.title = '과메기'
  }, [setSize])

  const loadProfile = useCallback(() => {
    setError('')
    getMeCall()
      .then((result) => setProfile(result.profile))
      .catch((err: unknown) => setError(errorText(err)))
  }, [getMeCall])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // The server decides whether a meeting is live. Polling it here means that
  // when any participant presses "미팅 시작", every participant's screen
  // switches to the event view, whatever page they are on.
  useEffect(() => {
    if (!profile) return
    const check = () =>
      getMeCall()
        .then((result) => setLiveMeetingId(result.liveMeetingId))
        .catch(() => undefined)
    void check()
    const timer = window.setInterval(check, 2000)
    return () => window.clearInterval(timer)
  }, [getMeCall, profile])

  // When the meeting ends, land everyone in the room for after picks and reviews.
  const lastLive = useRef<string | null>(null)
  useEffect(() => {
    if (liveMeetingId) {
      lastLive.current = liveMeetingId
    } else if (lastLive.current) {
      const ended = lastLive.current
      lastLive.current = null
      setStack([{ name: 'mine' }, { name: 'room', meetingId: ended }])
    }
  }, [liveMeetingId])
  const endLive = useCallback(() => setLiveMeetingId(null), [])

  const nav: Nav = useMemo(
    () => ({
      go: (view) => setStack((current) => [...current, view]),
      back: () =>
        setStack((current) =>
          current.length > 1 ? current.slice(0, -1) : current
        ),
      replace: (view) => setStack((current) => [...current.slice(0, -1), view]),
    }),
    []
  )

  const view = stack[stack.length - 1]
  const isRoot = stack.length === 1

  let body
  if (error)
    body = (
      <div className="page">
        <Banner tone="error">{error}</Banner>
        <Button onClick={loadProfile}>다시 시도</Button>
      </div>
    )
  else if (profile === undefined)
    body = <div className="loading">불러오는 중…</div>
  else if (profile === null)
    body = (
      <ProfileForm
        initial={null}
        onSaved={(saved) => setProfile(saved)}
      />
    )
  else {
    switch (view.name) {
      case 'home':
        body = (
          <Home
            key="home"
            nav={nav}
            profile={profile}
            mode="explore"
          />
        )
        break
      case 'mine':
        body = (
          <Home
            key="mine"
            nav={nav}
            profile={profile}
            mode="mine"
          />
        )
        break
      case 'rank':
        body = <Rank />
        break
      case 'profile':
        body = (
          <ProfileForm
            initial={profile}
            onSaved={(saved) => {
              setProfile(saved)
              setStack([{ name: 'home' }])
            }}
          />
        )
        break
      case 'create':
        body = (
          <Create
            nav={nav}
            profile={profile}
          />
        )
        break
      case 'detail':
        body = (
          <Detail
            key={view.meetingId}
            nav={nav}
            profile={profile}
            meetingId={view.meetingId}
          />
        )
        break
      case 'room':
        body = (
          <Room
            key={view.meetingId}
            nav={nav}
            meetingId={view.meetingId}
          />
        )
        break
      case 'chat':
        body = (
          <PrivateChat
            key={view.chatId}
            chatId={view.chatId}
          />
        )
        break
    }
  }

  const theme = `meeting-app${wam.appearance === 'dark' ? ' dark' : ''}`

  // Meeting mode: only the current event, no menus or other features.
  if (liveMeetingId)
    return (
      <div className={theme}>
        <LiveScreen
          key={liveMeetingId}
          meetingId={liveMeetingId}
          onEnded={endLive}
        />
      </div>
    )

  return (
    <div className={theme}>
      <header className="app-header">
        {!isRoot && profile ? (
          <button
            type="button"
            className="icon-btn"
            onClick={nav.back}
            aria-label="뒤로"
          >
            <ChevronLeftIcon />
          </button>
        ) : null}
        <div className="app-title">
          {profile === null ? '과메기' : TITLES[view.name]}
          {isRoot && <span className="app-sub">SKKU · 다른 학과와 3:3</span>}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={close}
          aria-label="닫기"
        >
          <CancelIcon />
        </button>
      </header>
      <main className="app-body">{body}</main>
      {profile && isRoot && (
        <nav className="tabbar">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.view.name}
              className={view.name === tab.view.name ? 'active' : ''}
              onClick={() => setStack([tab.view])}
            >
              <tab.icon />
              {tab.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
