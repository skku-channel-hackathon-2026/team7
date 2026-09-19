import { useState } from 'react'
import {
  CheckCircleFilledIcon,
  CheckCircleIcon,
  MapPinIcon,
} from '@channel.io/bezier-icons'
import {
  MEETING_FUNCTIONS,
  type PollKind,
  type PollOptionView,
  type RoomOutput,
} from '@tutorial/shared'
import { errorText, useFn } from '../../api'
import { dateLabel } from '../../format'
import { Banner, Button } from '../../ui'
import TimeGrid from './TimeGrid'

function bookingLink(query: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`
}

export default function PlanPanel({
  data,
  reload,
}: {
  data: RoomOutput
  reload: () => Promise<void>
}) {
  const { meeting } = data
  const propose = useFn<{ placeId: string }>(MEETING_FUNCTIONS.proposePlace)
  const vote = useFn(MEETING_FUNCTIONS.votePlace)
  const decide = useFn(MEETING_FUNCTIONS.decidePoll)
  const [error, setError] = useState('')
  const busy = propose.loading || vote.loading || decide.loading
  const locked = meeting.status === 'finished'

  const act = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      await reload()
    } catch (err) {
      setError(errorText(err))
    }
  }
  const add = (poll: PollKind, name: string, category = '') =>
    act(() => propose.call({ meetingId: meeting.id, poll, name, category }))
  const choose = (poll: PollKind, name: string, category = '') =>
    act(async () => {
      const { placeId } = await propose.call({
        meetingId: meeting.id,
        poll,
        name,
        category,
      })
      await decide.call({ meetingId: meeting.id, placeId })
    })

  const options = (poll: PollKind, decided: string) =>
    data.polls[poll].map((option: PollOptionView) => (
      <div
        key={option.id}
        className={`poll-option${option.label === decided ? ' decided' : ''}`}
      >
        <button
          type="button"
          className={`vote${option.votedByMe ? ' on' : ''}`}
          disabled={busy || locked}
          onClick={() =>
            void act(() =>
              vote.call({ meetingId: meeting.id, placeId: option.id })
            )
          }
        >
          {option.votedByMe ? <CheckCircleFilledIcon /> : <CheckCircleIcon />}
          {option.votes}
        </button>
        <span className="poll-label">{option.label}</span>
        {option.label === decided ? (
          <span className="tag">확정</span>
        ) : (
          !locked && (
            <Button
              small
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  decide.call({ meetingId: meeting.id, placeId: option.id })
                )
              }
            >
              확정
            </Button>
          )
        )}
      </div>
    ))

  const decidedDate = meeting.meetDate
    ? `${meeting.meetDate} ${meeting.meetTime}`
    : ''

  return (
    <div className="panel">
      {error && <Banner tone="error">{error}</Banner>}

      <CatfishCard
        data={data}
        reload={reload}
      />

      <div className={`step${decidedDate ? ' done' : ''}`}>
        <div className="step-head">
          <span className="step-no">1</span>
          <b>날짜 정하기</b>
          {decidedDate && (
            <span className="step-result">
              {dateLabel(meeting.meetDate)} {meeting.meetTime}
            </span>
          )}
        </div>
        <TimeGrid
          data={data}
          reload={reload}
          locked={locked}
        />
      </div>

      <div className={`step${meeting.region ? ' done' : ''}`}>
        <div className="step-head">
          <span className="step-no">2</span>
          <b>지역 투표</b>
          {meeting.region && (
            <span className="step-result">{meeting.region}</span>
          )}
        </div>
        {options('region', meeting.region)}
        {!locked && (
          <>
            <div className="muted small">
              <MapPinIcon /> {meeting.school} · {meeting.guestSchool} 위치 기준
              추천
            </div>
            <div className="suggest-grid">
              {data.regionSuggestions
                .filter(
                  (s) => !data.polls.region.some((o) => o.label === s.name)
                )
                .map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.name}
                    className="suggest"
                    disabled={busy}
                    onClick={() => void add('region', suggestion.name)}
                  >
                    <b>+ {suggestion.name}</b>
                    <span className="muted small">{suggestion.note}</span>
                  </button>
                ))}
            </div>
          </>
        )}
      </div>

      <div className={`step${meeting.place ? ' done' : ''}`}>
        <div className="step-head">
          <span className="step-no">3</span>
          <b>장소 선택</b>
          {meeting.place && (
            <span className="step-result">{meeting.place}</span>
          )}
        </div>
        {!meeting.region ? (
          <p className="muted small">지역이 정해지면 장소를 추천해 드려요.</p>
        ) : (
          <>
            {meeting.place && (
              <a
                className="btn btn-primary btn-block booking"
                href={bookingLink(meeting.place)}
                target="_blank"
                rel="noreferrer"
              >
                예약 페이지 열기 ↗
              </a>
            )}
            {!locked &&
              data.placeSuggestions.map((suggestion) => (
                <div
                  key={suggestion.name}
                  className={`place${meeting.place === suggestion.name ? ' decided' : ''}`}
                >
                  <div>
                    <b>{suggestion.name}</b>
                    <div className="muted small">
                      {suggestion.category} · {suggestion.note}
                    </div>
                  </div>
                  <Button
                    small
                    variant={
                      meeting.place === suggestion.name
                        ? 'primary'
                        : 'secondary'
                    }
                    disabled={busy}
                    onClick={() =>
                      void choose('place', suggestion.name, suggestion.category)
                    }
                  >
                    {meeting.place === suggestion.name ? '선택됨' : '선택'}
                  </Button>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  )
}

function CatfishCard({
  data,
  reload,
}: {
  data: RoomOutput
  reload: () => Promise<void>
}) {
  const voteCatfish = useFn(MEETING_FUNCTIONS.catfishVote)
  const [error, setError] = useState('')
  const { catfish } = data
  if (catfish.decision === 'no') return null

  if (catfish.decision === 'yes')
    return (
      <div className="catfish-card">
        <b>메기남/녀 추가 확정</b>
        <p className="muted small">
          각 팀에서 한 명씩, 미팅 시작 1시간 후 입장해요. ({catfish.joined}/2명
          초대됨)
        </p>
        {catfish.code && (
          <div className="invite">
            <div>
              <div className="muted small">우리 팀 메기 초대 코드</div>
              <div className="invite-code">{catfish.code}</div>
            </div>
          </div>
        )}
      </div>
    )

  if (data.meeting.status !== 'matched' || data.myRole !== 'member') return null

  const cast = (agree: boolean) =>
    voteCatfish
      .call({ meetingId: data.meeting.id, agree })
      .then(reload)
      .catch((err: unknown) => setError(errorText(err)))

  return (
    <div className="catfish-card">
      <b>메기남/녀를 추가할까요?</b>
      <p className="muted small">
        찬성이 과반이면 각 팀에 한 명씩 새 참가자가 미팅 1시간 후 합류해요. (
        {catfish.yes + catfish.no}/{catfish.voters}명 투표)
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      <div className="button-row">
        <Button
          small
          variant={catfish.myVote === true ? 'primary' : 'secondary'}
          disabled={voteCatfish.loading}
          onClick={() => void cast(true)}
        >
          찬성 {catfish.yes}
        </Button>
        <Button
          small
          variant={catfish.myVote === false ? 'primary' : 'secondary'}
          disabled={voteCatfish.loading}
          onClick={() => void cast(false)}
        >
          반대 {catfish.no}
        </Button>
      </div>
    </div>
  )
}
