import { useState } from 'react'

import { useApi } from '../../api'
import { useAction, useLoad } from '../../hooks/useLoad'
import {
  Button,
  Chips,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Notice,
  Stars,
} from '../../components/ui'

interface Props {
  meetingId: string
}

const CATEGORIES = [
  { key: 'mood', label: '전체적인 분위기' },
  { key: 'talk', label: '대화 분위기' },
  { key: 'place', label: '장소 만족도' },
  { key: 'content', label: '미팅 진행 콘텐츠 만족도' },
] as const

type ScoreKey = (typeof CATEGORIES)[number]['key']

function AfterReviewForm({
  roomId,
  partnerAlias,
  onDone,
}: {
  roomId: string
  partnerAlias: string
  onDone: () => Promise<void>
}) {
  const api = useApi()
  const { busy, error, run } = useAction()
  const [met, setMet] = useState<'yes' | 'no'>('yes')
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')

  const submit = () =>
    void run(async () => {
      await api.afterReviewSubmit({
        roomId,
        met: met === 'yes',
        score: met === 'yes' ? score : null,
        comment: comment.trim(),
      })
      await onDone()
    })

  return (
    <div className="card">
      <b>애프터 후기 · {partnerAlias}</b>
      <div
        className="stack"
        style={{ marginTop: 8 }}
      >
        <Field label="애프터를 했나요?">
          <Chips
            value={met}
            onChange={setMet}
            options={[
              { value: 'yes', label: '했어요' },
              { value: 'no', label: '아직이에요' },
            ]}
          />
        </Field>
        {met === 'yes' && (
          <Stars
            label="애프터 만족도"
            value={score}
            onChange={setScore}
          />
        )}
        <textarea
          maxLength={500}
          placeholder="애프터는 어땠나요? (선택)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <ErrorNote message={error} />
        <Button
          disabled={busy || (met === 'yes' && score === 0)}
          onClick={submit}
        >
          애프터 후기 남기기
        </Button>
      </div>
    </div>
  )
}

export function ReviewTab({ meetingId }: Props) {
  const api = useApi()
  const { busy, error, run } = useAction()
  const state = useLoad(() => api.reviewGet(meetingId), meetingId)
  const [scores, setScores] = useState<Record<ScoreKey, number>>({
    mood: 0,
    talk: 0,
    place: 0,
    content: 0,
  })
  const [rejoin, setRejoin] = useState<'yes' | 'no'>('yes')
  const [comment, setComment] = useState('')

  const data = state.data
  if (!data) {
    return state.error ? <ErrorNote message={state.error} /> : <Loading />
  }

  const allScored = CATEGORIES.every((c) => scores[c.key] > 0)

  const submit = () =>
    void run(async () => {
      await api.reviewSubmit({
        meetingId,
        ...scores,
        rejoin: rejoin === 'yes',
        comment: comment.trim(),
      })
      await state.reload()
    })

  return (
    <div>
      {data.review ? (
        <div className="card">
          <b>내가 남긴 미팅 후기</b>
          <div
            className="stack"
            style={{ marginTop: 6 }}
          >
            {CATEGORIES.map((c) => (
              <Stars
                key={c.key}
                label={c.label}
                value={data.review?.[c.key] ?? 0}
              />
            ))}
            <div>
              다시 참여하고 싶어요:{' '}
              <b>{data.review.rejoin ? '네' : '아니요'}</b>
            </div>
            {data.review.comment && (
              <div className="muted">“{data.review.comment}”</div>
            )}
          </div>
        </div>
      ) : !data.canReview ? (
        <Empty icon="📝">미팅이 끝난 뒤에 후기를 남길 수 있어요.</Empty>
      ) : (
        <div className="card">
          <b>미팅 후기</b>
          <div
            className="stack"
            style={{ marginTop: 8 }}
          >
            {CATEGORIES.map((c) => (
              <Stars
                key={c.key}
                label={c.label}
                value={scores[c.key]}
                onChange={(v) => setScores((prev) => ({ ...prev, [c.key]: v }))}
              />
            ))}
            <Field label="다시 미팅에 참여하고 싶나요?">
              <Chips
                value={rejoin}
                onChange={setRejoin}
                options={[
                  { value: 'yes', label: '네' },
                  { value: 'no', label: '아니요' },
                ]}
              />
            </Field>
            <textarea
              maxLength={500}
              placeholder="한 줄 후기를 남겨 주세요 (선택)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <ErrorNote message={error} />
            <Button
              disabled={busy || !allScored}
              onClick={submit}
            >
              후기 남기기
            </Button>
          </div>
        </div>
      )}

      {data.afterReviews.length > 0 && (
        <>
          <div className="section-title">애프터 후기</div>
          {data.afterReviews.map((r) =>
            r.submitted ? (
              <Notice key={r.roomId}>
                {r.partnerAlias}:{' '}
                {r.met ? `애프터 완료 · ${r.score}점` : '아직 애프터 전'}
                {r.comment ? ` · “${r.comment}”` : ''}
              </Notice>
            ) : (
              <AfterReviewForm
                key={r.roomId}
                roomId={r.roomId}
                partnerAlias={r.partnerAlias}
                onDone={state.reload}
              />
            )
          )}
        </>
      )}
      <p className="muted small">
        후기는 더 잘 맞는 미팅을 추천하고 서비스 품질을 높이는 데 활용돼요.
      </p>
    </div>
  )
}
