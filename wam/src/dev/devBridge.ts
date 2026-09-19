// Local development only. In Desk, the host injects window.ChannelIOWam; here a
// stand-in forwards calls to the Vite dev proxy, which signs them like AppStore.
// Imported dynamically behind import.meta.env.DEV, so production bundles omit it.
import type { ChannelIOWam } from '@channel.io/app-sdk-wam'

interface Persona {
  id: string
  label: string
  profile: {
    school: string
    department: string
    gender: 'male' | 'female'
    age: number
    studentYear: number
    contact: string
  }
}

const CHANNEL_ID = 'local-demo-channel'
const GROUP = { id: 'local-demo-group', title: '앱_개발_검증 (로컬)' }

const persona = (
  id: string,
  label: string,
  school: string,
  department: string,
  gender: 'male' | 'female',
  age: number,
  studentYear: number,
  contact: string
): Persona => ({
  id,
  label,
  profile: { school, department, gender, age, studentYear, contact },
})

const SKKU = '성균관대 자과캠'
const EWHA = '이화여대'

// A full 3:3 cast plus one catfish candidate per team and a few other posters.
const PERSONAS: Persona[] = [
  persona(
    'demo-minjun',
    '민준 · 성대 컴공 남',
    SKKU,
    '컴퓨터공학과',
    'male',
    22,
    24,
    '@minjun.dev'
  ),
  persona(
    'demo-jihoon',
    '지훈 · 성대 컴공 남',
    SKKU,
    '컴퓨터공학과',
    'male',
    21,
    25,
    'kakao: jihoon25'
  ),
  persona(
    'demo-hyunwoo',
    '현우 · 성대 컴공 남',
    SKKU,
    '컴퓨터공학과',
    'male',
    23,
    23,
    '@hyunwoo_c'
  ),
  persona(
    'demo-seoyeon',
    '서연 · 이대 경영 여',
    EWHA,
    '경영학과',
    'female',
    21,
    25,
    '@seoyeon_biz'
  ),
  persona(
    'demo-haeun',
    '하은 · 이대 경영 여',
    EWHA,
    '경영학과',
    'female',
    22,
    24,
    'kakao: haeun22'
  ),
  persona(
    'demo-jimin',
    '지민 · 이대 경영 여',
    EWHA,
    '경영학과',
    'female',
    21,
    25,
    '@jimin.e'
  ),
  persona(
    'demo-taeo',
    '태오 · 메기 후보 남',
    SKKU,
    '기계공학부',
    'male',
    23,
    23,
    '@taeo_me'
  ),
  persona(
    'demo-sohee',
    '소희 · 메기 후보 여',
    EWHA,
    '심리학과',
    'female',
    22,
    24,
    '@sohee.psy'
  ),
  persona(
    'demo-yuna',
    '유나 · 연대 심리 여',
    '연세대',
    '심리학과',
    'female',
    20,
    26,
    '@yuna.psy'
  ),
  persona(
    'demo-dohyun',
    '도현 · 고대 기계 남',
    '고려대',
    '기계공학부',
    'male',
    23,
    23,
    '@dohyun_me'
  ),
]

function currentPersona(): Persona {
  // ?as=<id> gives each browser window its own participant, so several
  // windows can show the same meeting side by side.
  let saved = new URLSearchParams(window.location.search).get('as')
  try {
    saved ??= localStorage.getItem('meeting-dev-persona')
  } catch {
    /* storage unavailable */
  }
  return PERSONAS.find((p) => p.id === saved) ?? PERSONAS[0]
}

async function call(
  managerId: string,
  name: string,
  params: Record<string, unknown>
) {
  const response = await fetch('/__dev/function', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ managerId, channelId: CHANNEL_ID, name, params }),
  })
  const json = await response.json()
  if (json?.error) throw new Error(json.error.message ?? 'Function call failed')
  if (!response.ok) throw new Error(json?.message ?? `HTTP ${response.status}`)
  return json
}

function toast(text: string) {
  const node = document.createElement('div')
  node.className = 'dev-toast'
  node.textContent = text
  document.body.appendChild(node)
  window.setTimeout(() => node.remove(), 5000)
}

async function saveProfiles() {
  for (const p of PERSONAS) await call(p.id, 'meeting.saveProfile', p.profile)
}

async function seed() {
  await saveProfiles()
  const existing = await call('demo-yuna', 'meeting.list', {})
  if (existing?.result?.mine?.length) return
  const posts: [string, Record<string, unknown>][] = [
    [
      'demo-yuna',
      { department: '심리학과', size: 3, intro: '보드게임 좋아해요 ' },
    ],
    [
      'demo-sohee',
      { department: '심리학과', size: 2, intro: '맛집 탐방 좋아해요!' },
    ],
    [
      'demo-dohyun',
      { department: '기계공학부', size: 3, intro: '방탈출 같이 가요' },
    ],
    [
      'demo-jimin',
      {
        kind: 'proposal',
        targetDepartment: '컴퓨터공학과',
        department: '경영학과',
        size: 3,
        intro: '컴공이랑 미팅하고 싶어요!',
      },
    ],
  ]
  for (const [managerId, params] of posts)
    await call(managerId, 'meeting.create', { kind: 'open', ...params })
}

/** Builds a matched 3:3 meeting (민준·지훈·현우 × 서연·하은·지민). */
async function makeSix() {
  await saveProfiles()
  const created = await call('demo-minjun', 'meeting.create', {
    department: '컴퓨터공학과',
    size: 3,
    intro: '데모용 3:3 미팅',
  })
  const meetingId = created.result.meetingId
  await call('demo-seoyeon', 'meeting.apply', {
    meetingId,
    message: '안녕하세요!',
  })
  const host = (await call('demo-minjun', 'meeting.get', { meetingId })).result
  await call('demo-minjun', 'meeting.decide', {
    applicationId: host.applications[0].id,
    accept: true,
  })
  for (const id of ['demo-jihoon', 'demo-hyunwoo'])
    await call(id, 'meeting.joinTeam', { code: host.hostCode })
  const guest = (await call('demo-seoyeon', 'meeting.get', { meetingId }))
    .result
  for (const id of ['demo-haeun', 'demo-jimin'])
    await call(id, 'meeting.joinTeam', { code: guest.guestCode })
}

function renderPanel(active: Persona) {
  const style = document.createElement('style')
  style.textContent = `
    body { background: #e9e6ee !important; overflow: auto !important; }
    #root { width: 420px; height: 720px; margin: 24px auto; border-radius: 22px; overflow: hidden;
      box-shadow: 0 20px 60px rgba(40,20,60,.25); background: #fff; position: relative; transform: translateZ(0); }
    #root .meeting-app { height: 100%; }
    .dev-panel { position: fixed; top: 16px; left: 16px; width: 250px; font: 12px/1.4 -apple-system, sans-serif;
      background: #1d1b22; color: #fff; border-radius: 16px; padding: 12px; z-index: 10; max-height: calc(100vh - 32px); overflow: auto; }
    .dev-panel h4 { margin: 0 0 4px; font-size: 13px; }
    .dev-panel p { margin: 0 0 8px; color: #a39dab; font-size: 11px; }
    .dev-row { display: flex; gap: 4px; margin: 3px 0; }
    .dev-panel button { flex: 1; text-align: left; padding: 7px 9px; border: 0;
      border-radius: 9px; background: #322f38; color: #fff; cursor: pointer; font: inherit; }
    .dev-panel a { color: #a39dab; text-decoration: none; padding: 7px 8px; border-radius: 9px; background: #28252d; }
    .dev-panel button.on { background: #f0457a; font-weight: 700; }
    .dev-panel .action { background: #4f6bff; text-align: center; margin-top: 6px; }
    .dev-toast { position: fixed; right: 24px; bottom: 24px; max-width: 320px; background: #1d1b22; color: #fff;
      padding: 12px 14px; border-radius: 12px; font: 12px/1.4 -apple-system, sans-serif; white-space: pre-wrap; z-index: 20; }
    @media (max-width: 760px) { .dev-panel { position: static; width: auto; margin: 12px; } }
  `
  document.head.appendChild(style)
  const panel = document.createElement('div')
  panel.className = 'dev-panel'
  panel.innerHTML = `<h4>로컬 시뮬레이터</h4>
    <p>채널 매니저 계정을 흉내 내요. ↗ 로 다른 참가자 창을 따로 열어 6명의 화면 동기화를 확인하세요.</p>`
  for (const p of PERSONAS) {
    const row = document.createElement('div')
    row.className = 'dev-row'
    const button = document.createElement('button')
    button.textContent = p.label
    if (p.id === active.id) button.className = 'on'
    button.onclick = () => {
      try {
        localStorage.setItem('meeting-dev-persona', p.id)
      } catch {
        /* storage unavailable */
      }
      window.location.search = `?as=${p.id}`
    }
    const open = document.createElement('a')
    open.href = `/?as=${p.id}`
    open.target = '_blank'
    open.textContent = '↗'
    open.title = '새 창에서 이 참가자로 열기'
    row.append(button, open)
    panel.appendChild(row)
  }
  const action = (label: string, run: () => Promise<void>, done: string) => {
    const button = document.createElement('button')
    button.className = 'action'
    button.textContent = label
    button.onclick = () => {
      button.textContent = '처리 중…'
      run()
        .then(() => {
          toast(done)
          window.setTimeout(() => window.location.reload(), 900)
        })
        .catch((error: unknown) => {
          button.textContent = label
          toast(String(error))
        })
    }
    panel.appendChild(button)
  }
  action('모집글 샘플 채우기', seed, '샘플 모집글을 만들었어요.')
  action(
    '6명 매칭 미팅 만들기',
    makeSix,
    '3:3 단체 채팅방이 열렸어요! 내 미팅 탭에서 확인하세요.'
  )
  document.body.appendChild(panel)
}

export async function installDevBridge(): Promise<void> {
  const me = currentPersona()
  const data: Record<string, unknown> = {
    appId: 'local-test-app',
    channelId: CHANNEL_ID,
    managerId: me.id,
    chatId: GROUP.id,
    chatType: 'group',
    chatTitle: GROUP.title,
    broadcast: false,
    appearance: 'light',
  }
  try {
    // Run the real command Function, exactly as Desk does when /meeting is used.
    const opened = await call(me.id, 'meeting.open', {
      chat: { type: 'group', id: GROUP.id },
      trigger: { type: 'command', attributes: { chatTitle: GROUP.title } },
      input: {},
    })
    Object.assign(data, opened?.result?.attributes?.wamArgs ?? {})
  } catch (error) {
    toast(`meeting.open 실패: ${String(error)}`)
  }

  const bridge: ChannelIOWam = {
    getWamData: (key) => data[key],
    setSize: () => undefined,
    close: () => toast('WAM close() 호출 — Desk에서는 창이 닫혀요.'),
    callFunction: (args) => call(me.id, args.name, args.params),
    callNativeFunction: async (args) => {
      const dto = (args.params as { dto?: { plainText?: string } }).dto
      toast(
        `[Native ${args.name}] ${GROUP.title}에 매니저로 전송됨 (로컬 시뮬레이션)\n\n${dto?.plainText ?? ''}`
      )
      return {} as never
    },
  }
  window.ChannelIOWam = bridge
  renderPanel(me)
}
