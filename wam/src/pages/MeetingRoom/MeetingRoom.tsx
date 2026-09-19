import { useCallback, useState } from 'react'

import { useApi } from '../../api'
import { useNav, type MeetingTab } from '../../nav'
import { useLoad } from '../../hooks/useLoad'
import { ChatPanel } from '../../components/ChatPanel'
import { Badge, ErrorNote, Loading, Segmented } from '../../components/ui'
import { STATUS_LABEL } from '../../utils/format'
import { InfoTab } from './InfoTab'
import { PlaceTab } from './PlaceTab'
import { SessionTab } from './SessionTab'
import { AfterTab } from './AfterTab'
import { ReviewTab } from './ReviewTab'

interface Props {
  meetingId: string
  initialTab?: MeetingTab
}

function MeetingRoom({ meetingId, initialTab }: Props) {
  const api = useApi()
  const nav = useNav()
  const [tab, setTab] = useState<MeetingTab>(initialTab ?? 'info')
  const state = useLoad(() => api.get(meetingId), meetingId, 6000)
  const meeting = state.data?.meeting
  const reload = state.reload

  const refresh = useCallback(async () => {
    await reload()
  }, [reload])

  if (!meeting) {
    return state.error ? <ErrorNote message={state.error} /> : <Loading />
  }

  const joined = meeting.mySide !== null
  const matched =
    meeting.status !== 'recruiting' && meeting.status !== 'cancelled'
  const started =
    meeting.status === 'in_progress' || meeting.status === 'finished'
  const chatReady = joined && matched
  const activeTab: MeetingTab =
    (tab === 'chat' || tab === 'place') && !chatReady
      ? 'info'
      : (tab === 'session' || tab === 'after' || tab === 'review') &&
          !(joined && matched)
        ? 'info'
        : tab

  return (
    <>
      <div
        className="row between"
        style={{ padding: '8px 16px 0' }}
      >
        <b className="grow">{meeting.title}</b>
        <Badge tone={meeting.status === 'recruiting' ? 'primary' : 'neutral'}>
          {STATUS_LABEL[meeting.status]}
        </Badge>
      </div>
      <Segmented<MeetingTab>
        value={activeTab}
        onChange={setTab}
        options={[
          { value: 'info', label: '정보' },
          { value: 'chat', label: '단체 채팅', disabled: !chatReady },
          { value: 'place', label: '장소', disabled: !chatReady },
          { value: 'session', label: '미팅 진행', disabled: !chatReady },
          { value: 'after', label: '애프터', disabled: !chatReady || !started },
          { value: 'review', label: '후기', disabled: !chatReady || !started },
        ]}
      />
      {activeTab === 'chat' ? (
        <ChatPanel
          roomType="meeting"
          roomId={meetingId}
        />
      ) : (
        <div className="app-body">
          {activeTab === 'info' && (
            <InfoTab
              meeting={meeting}
              reload={refresh}
              onLeft={() => nav.back()}
            />
          )}
          {activeTab === 'place' && (
            <PlaceTab
              meeting={meeting}
              reload={refresh}
            />
          )}
          {activeTab === 'session' && (
            <SessionTab
              meetingId={meetingId}
              onFinished={() => void refresh()}
            />
          )}
          {activeTab === 'after' && <AfterTab meetingId={meetingId} />}
          {activeTab === 'review' && <ReviewTab meetingId={meetingId} />}
        </div>
      )}
    </>
  )
}

export default MeetingRoom
