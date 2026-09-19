export type View =
  | { name: 'home' }
  | { name: 'mine' }
  | { name: 'rank' }
  | { name: 'profile' }
  | { name: 'create' }
  | { name: 'detail'; meetingId: string }
  | { name: 'room'; meetingId: string }
  | { name: 'chat'; chatId: string }

export interface Nav {
  go: (view: View) => void
  back: () => void
  replace: (view: View) => void
}
