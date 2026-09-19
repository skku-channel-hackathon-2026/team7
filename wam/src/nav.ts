import { createContext, useContext } from 'react'
import type { Profile } from '@tutorial/shared'

export type TabName = 'home' | 'mine' | 'inbox' | 'dms' | 'records' | 'stats'

export type Route =
  | { name: TabName }
  | { name: 'create'; kind: 'recruit' | 'proposal' }
  | { name: 'meeting'; id: string; tab?: MeetingTab }
  | { name: 'dm'; id: string }
  | { name: 'profile' }

export type MeetingTab =
  'info' | 'chat' | 'place' | 'session' | 'after' | 'review'

export interface NavApi {
  route: Route
  push: (route: Route) => void
  replace: (route: Route) => void
  back: () => void
  /** Clears the stack and shows a top-level tab. */
  go: (tab: TabName) => void
  canBack: boolean
}

export const NavContext = createContext<NavApi | null>(null)

export function useNav(): NavApi {
  const nav = useContext(NavContext)
  if (!nav) throw new Error('NavContext is missing')
  return nav
}

export interface MeApi {
  profile: Profile
  refresh: () => Promise<void>
}

export const MeContext = createContext<MeApi | null>(null)

export function useMe(): MeApi {
  const me = useContext(MeContext)
  if (!me) throw new Error('MeContext is missing')
  return me
}
