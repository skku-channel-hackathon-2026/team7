import { useState } from 'react'
import { MEETING_FUNCTIONS, type RoomOutput } from '@tutorial/shared'
import { errorText, useFn } from '../../api'
import { Banner, Button, Section } from '../../ui'
import AfterSection from './AfterSection'
import ReviewSection from './ReviewSection'

export default function MeetingPanel({
  data,
  reload,
  openChat,
}: {
  data: RoomOutput
  reload: () => Promise<void>
  openChat: (chatId: string) => void
}) {
  const start = useFn(MEETING_FUNCTIONS.startMc)
  const [error, setError] = useState('')
  const { meeting } = data
  const code = data.hostCode ?? data.guestCode

  const begin = (demo: boolean) =>
    start
      .call({ meetingId: meeting.id, demo })
      .then(reload)
      .catch((err: unknown) => setError(errorText(err)))

  if (meeting.status === 'finished')
    return (
      <div className="panel">
        <AfterSection
          data={data}
          reload={reload}
          openChat={openChat}
        />
        <ReviewSection
          data={data}
          reload={reload}
        />
      </div>
    )

  if (meeting.status === 'live')
    return (
      <div className="panel center-page">
        <p>미팅이 진행 중이에요. 이벤트 화면으로 전환하는 중…</p>
      </div>
    )

  return (
    <div className="panel">
      <div className="start-card">
        <h3>만났다면 미팅을 시작하세요</h3>
        <p className="muted small">
          누군가 시작하면 {data.members.length}명 모두의 화면이 이벤트 화면으로
          바뀌어요. 대화 주제·미션·게임·호감 투표가 랜덤하게 찾아와요.
        </p>
        {error && <Banner tone="error">{error}</Banner>}
        <Button
          block
          disabled={start.loading}
          onClick={() => void begin(false)}
        >
          미팅 시작
        </Button>
        <Button
          block
          variant="ghost"
          disabled={start.loading}
          onClick={() => void begin(true)}
        >
          데모 모드로 시작 (30배속)
        </Button>
      </div>
      {code && (
        <Section title="팀원 초대 코드">
          <div className="invite">
            <div>
              <div className="muted small">
                같은 학과 친구에게 공유하면 우리 팀으로 들어와요
              </div>
              <div className="invite-code">{code}</div>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}
