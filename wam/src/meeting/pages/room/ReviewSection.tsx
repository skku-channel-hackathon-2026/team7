import { useState } from 'react'
import { MEETING_FUNCTIONS, type RoomOutput } from '@tutorial/shared'
import { errorText, useFn } from '../../api'
import { Banner, Button, Section, Segmented, Stars } from '../../ui'

const QUESTIONS = [
  ['partner', '상대 팀은 어땠나요? (랭크 반영)'],
  ['mood', '미팅 분위기'],
  ['conversation', '대화 분위기'],
  ['place', '장소 만족도'],
  ['content', '미팅 콘텐츠 만족도'],
] as const

type ScoreKey = (typeof QUESTIONS)[number][0]

export default function ReviewSection({
  data,
  reload,
}: {
  data: RoomOutput
  reload: () => Promise<void>
}) {
  const submit = useFn(MEETING_FUNCTIONS.submitReview)
  const [scores, setScores] = useState<Record<ScoreKey, number>>({
    partner: 4,
    mood: 4,
    conversation: 4,
    place: 4,
    content: 4,
  })
  const [wantAgain, setWantAgain] = useState<'yes' | 'no'>('yes')
  const [afterReview, setAfterReview] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  if (data.reviewed && !editing)
    return (
      <Section title="미팅 후기">
        <div className="after-status">
          <div>후기를 남겨 주셔서 감사해요! 기록 탭에서 확인할 수 있어요.</div>
          <Button
            small
            variant="ghost"
            onClick={() => setEditing(true)}
          >
            다시 작성
          </Button>
        </div>
      </Section>
    )

  const send = async () => {
    setError('')
    try {
      await submit.call({
        meetingId: data.meeting.id,
        ...scores,
        wantAgain: wantAgain === 'yes',
        afterReview,
        comment,
      })
      setEditing(false)
      await reload()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <Section title="미팅 후기">
      {QUESTIONS.map(([key, label]) => (
        <div
          key={key}
          className="review-row"
        >
          <span>{label}</span>
          <Stars
            value={scores[key]}
            onChange={(value) =>
              setScores((current) => ({ ...current, [key]: value }))
            }
          />
        </div>
      ))}
      <div className="review-row">
        <span>다시 미팅에 참여하고 싶나요?</span>
        <Segmented
          value={wantAgain}
          onChange={setWantAgain}
          options={[
            { value: 'yes', label: '네!' },
            { value: 'no', label: '글쎄요' },
          ]}
        />
      </div>
      {!!data.after.matches.length && (
        <textarea
          rows={2}
          maxLength={300}
          value={afterReview}
          placeholder="애프터 후기 (선택)"
          onChange={(event) => setAfterReview(event.target.value)}
        />
      )}
      <textarea
        rows={2}
        maxLength={300}
        value={comment}
        placeholder="한 줄 후기 (선택)"
        onChange={(event) => setComment(event.target.value)}
      />
      {error && <Banner tone="error">{error}</Banner>}
      <Button
        block
        disabled={submit.loading}
        onClick={() => void send()}
      >
        후기 저장
      </Button>
    </Section>
  )
}
