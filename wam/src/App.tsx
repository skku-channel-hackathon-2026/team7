import { useCallback, useEffect, useMemo, useState } from 'react'
import { WamHeader, WamThemeProvider } from '@channel.io/app-sdk-wam-ui'
import {
  useTypedWamData,
  useWamClose,
  useWamSize,
} from '@channel.io/app-sdk-wam'

import { ApiProvider } from './ApiProvider'
import { useApi } from './api'
import { useLoad } from './hooks/useLoad'
import {
  MeContext,
  NavContext,
  type NavApi,
  type Route,
  type TabName,
} from './nav'
import { Button, ErrorNote, Loading, Notice } from './components/ui'
import Home from './pages/Home'
import CreateMeeting from './pages/CreateMeeting'
import MeetingRoom from './pages/MeetingRoom'
import DmRoom from './pages/DmRoom'
import ProfilePage from './pages/Profile'
import { DmList, Inbox, MyMeetings, Records, Stats } from './pages/Lists'

const TABS: { name: TabName; icon: string; label: string }[] = [
  { name: 'home', icon: '🏠', label: '홈' },
  { name: 'mine', icon: '🗓', label: '내 미팅' },
  { name: 'inbox', icon: '💌', label: '제안' },
  { name: 'dms', icon: '💬', label: '채팅' },
  { name: 'records', icon: '📒', label: '기록' },
  { name: 'stats', icon: '📊', label: '통계' },
]

const TITLES: Record<string, string> = {
  home: '모집 중인 미팅',
  mine: '내 미팅',
  inbox: '받은 제안',
  dms: '개인 채팅',
  records: '내 미팅 기록',
  stats: '학과별 미팅 통계',
  create: '미팅 만들기',
  meeting: '미팅',
  dm: '개인 채팅',
  profile: '내 프로필',
}

const HOME_ROUTE: Route = { name: 'home' }

function isTab(route: Route): route is { name: TabName } {
  return TABS.some((t) => t.name === route.name)
}

function Shell() {
  const api = useApi()
  const profileState = useLoad(() => api.profileGet(), 'profile')
  const inbox = useLoad(() => api.inbox(), 'inbox-badge', 20000)
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }])

  const route = stack[stack.length - 1] ?? HOME_ROUTE

  const nav: NavApi = useMemo(
    () => ({
      route,
      canBack: stack.length > 1,
      push: (next) => setStack((prev) => [...prev, next]),
      replace: (next) => setStack((prev) => [...prev.slice(0, -1), next]),
      back: () =>
        setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)),
      go: (tab) => setStack([{ name: tab }]),
    }),
    [route, stack.length]
  )

  const reloadProfile = profileState.reload
  const me = useMemo(
    () =>
      profileState.data?.profile
        ? { profile: profileState.data.profile, refresh: reloadProfile }
        : null,
    [profileState.data, reloadProfile]
  )

  const closeProfile = useCallback(async () => {
    await reloadProfile()
    nav.back()
  }, [reloadProfile, nav])

  if (profileState.loading && !profileState.data) return <Loading />
  if (profileState.error && !profileState.data)
    return (
      <div className="app-body">
        <ErrorNote message={profileState.error} />
        <Button onClick={() => void profileState.reload()}>다시 시도</Button>
      </div>
    )

  if (!me) {
    return (
      <div className="app-body">
        <h3 style={{ marginTop: 0 }}>환영해요! 먼저 프로필을 만들어 주세요</h3>
        <ProfilePage
          initial={null}
          onSaved={() => void reloadProfile()}
        />
      </div>
    )
  }

  const inboxCount = inbox.data?.meetings.length ?? 0
  const showTabs = isTab(route)

  return (
    <MeContext.Provider value={me}>
      <NavContext.Provider value={nav}>
        {nav.canBack && (
          <div className="topbar">
            <Button
              small
              variant="ghost"
              onClick={nav.back}
            >
              ← 뒤로
            </Button>
            <h2>{TITLES[route.name] ?? ''}</h2>
          </div>
        )}
        <div className="app-main">
          {isTab(route) && (
            <div className="app-body">
              {route.name === 'home' && <Home />}
              {route.name === 'mine' && <MyMeetings />}
              {route.name === 'inbox' && <Inbox />}
              {route.name === 'dms' && <DmList />}
              {route.name === 'records' && <Records />}
              {route.name === 'stats' && <Stats />}
            </div>
          )}
          {route.name === 'create' && (
            <div className="app-body">
              <CreateMeeting
                key={route.kind}
                kind={route.kind}
              />
            </div>
          )}
          {route.name === 'profile' && (
            <div className="app-body">
              <ProfilePage
                initial={me.profile}
                onSaved={() => void closeProfile()}
                onCancel={nav.back}
              />
            </div>
          )}
          {route.name === 'meeting' && (
            <MeetingRoom
              key={route.id}
              meetingId={route.id}
              initialTab={route.tab}
            />
          )}
          {route.name === 'dm' && (
            <DmRoom
              key={route.id}
              roomId={route.id}
            />
          )}
        </div>
        {showTabs && (
          <nav className="tabbar">
            {TABS.map((tab) => (
              <button
                key={tab.name}
                type="button"
                className={route.name === tab.name ? 'active' : ''}
                onClick={() => nav.go(tab.name)}
              >
                <span
                  className={
                    tab.name === 'inbox' && inboxCount > 0 ? 'ico dot' : 'ico'
                  }
                  data-count={inboxCount}
                >
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </NavContext.Provider>
    </MeContext.Provider>
  )
}

function App() {
  const { close } = useWamClose()
  const { setSize } = useWamSize()
  const appId = useTypedWamData('appId') ?? ''

  useEffect(() => {
    setSize({ width: 440, height: 720 })
    const appearance = window.ChannelIOWam?.getWamData('appearance')
    document.documentElement.dataset.theme =
      appearance === 'dark' ? 'dark' : 'light'
  }, [setSize])

  return (
    <WamThemeProvider>
      <div className="app">
        <WamHeader
          title="블라인드 미팅"
          onClose={close}
        />
        {appId ? (
          <ApiProvider appId={appId}>
            <Shell />
          </ApiProvider>
        ) : (
          <div className="app-body">
            <Notice>채널톡 데스크에서 /meeting 커맨드로 열어 주세요.</Notice>
          </div>
        )}
      </div>
    </WamThemeProvider>
  )
}

export default App
