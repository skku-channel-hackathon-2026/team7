import { useEffect, useState } from 'react'
import {
  SPEED_OPTIONS,
  type MemberView,
  type PromptView,
  type SessionState,
} from '@tutorial/shared'

import { useApi } from '../../api'
import { useAction, useLoad } from '../../hooks/useLoad'
import {
  Badge,
  Button,
  Chips,
  Empty,
  ErrorNote,
  Loading,
  Notice,
} from '../../components/ui'
import { formatCountdown, genderText, memberLine } from '../../utils/format'

interface Props {
  meetingId: string
  onFinished: () => void
}

const KIND_ICON: Record<string, string> = {
  intro: '👋',
  question: '❓',
  event: '🎲',
  pick: '💘',
  mission: '🎯',
  after: '💌',
  topic: '💬',
}

function useTicker(seconds: number | null, seedKey: string): number | null {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    setLeft(seconds)
    if (seconds === null) return
    const timer = setInterval(
      () => setLeft((v) => (v === null ? null : Math.max(0, v - 1))),
      1000
    )
    return () => clearInterval(timer)
  }, [seconds, seedKey])
  return left
}

function MemberChoice({
  member,
  selected,
  onSelect,
  disabled,
}: {
  member: MemberView
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={selected ? 'chip active' : 'chip'}
      disabled={disabled}
      onClick={onSelect}
    >
      {member.alias} · {genderText(member)} · {memberLine(member)}
    </button>
  )
}

export function SessionTab({ meetingId, onFinished }: Props) {
  const api = useApi()
  const { busy, error, run } = useAction()
  const [speed, setSpeed] = useState<number>(1)
  const state = useLoad(() => api.sessionGet(meetingId), meetingId, 3000)
  const session = state.data?.session
  const countdown = useTicker(
    session?.nextStageInSec ?? null,
    `${session?.elapsedMin ?? 0}`
  )

  useEffect(() => {
    if (session?.status === 'finished') onFinished()
  }, [session?.status, onFinished])

  const act = (action: () => Promise<unknown>) =>
    void run(async () => {
      await action()
      await state.reload()
    })

  if (!session) {
    return state.error ? <ErrorNote message={state.error} /> : <Loading />
  }

  if (!session.started) {
    return (
      <div>
        <Empty icon="⏱">
          {session.status === 'matched'
            ? '미팅이 시작되면 앱이 진행자가 되어 질문·미션·이벤트를 제공해요.'
            : '미팅이 성사되면 진행 콘텐츠를 사용할 수 있어요.'}
        </Empty>
        {session.canStart && (
          <div className="card">
            <b>미팅 시작하기</b>
            <p className="muted small">
              장소에 모였다면 시작해 주세요. 시연할 때는 배속을 높이면 75분
              분량이 몇 분 안에 지나가요.
            </p>
            <Chips
              value={String(speed)}
              onChange={(v) => setSpeed(Number(v))}
              options={SPEED_OPTIONS.map((s) => ({
                value: String(s),
                label: s === 1 ? '실시간' : `데모 ${s}배속`,
              }))}
            />
            <div style={{ marginTop: 10 }}>
              <ErrorNote message={error} />
              <Button
                block
                disabled={busy}
                onClick={() =>
                  act(() => api.sessionStart({ meetingId, speed }))
                }
              >
                🚀 미팅 시작
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const prompts = [...session.prompts].reverse()

  return (
    <div>
      <SessionHeader
        session={session}
        countdown={countdown}
      />
      <ErrorNote message={error || state.error} />

      {session.pick.open && (
        <PickCard
          session={session}
          busy={busy}
          onPick={(id) =>
            act(() => api.sessionPick({ meetingId, targetMemberId: id }))
          }
        />
      )}

      <div className="section-title">진행 콘텐츠</div>
      {prompts.map((p, index) => (
        <PromptCard
          key={p.slot}
          prompt={p}
          latest={index === 0 && session.status === 'in_progress'}
          members={session.members}
          busy={busy}
          canVote={session.status === 'in_progress'}
          onVote={(id) =>
            act(() =>
              api.sessionVote({ meetingId, slot: p.slot, targetMemberId: id })
            )
          }
        />
      ))}

      {session.isHost && session.status === 'in_progress' && (
        <div style={{ marginTop: 12 }}>
          <Button
            variant="ghost"
            block
            disabled={busy}
            onClick={() => act(() => api.sessionFinish(meetingId))}
          >
            🏁 미팅 종료하기
          </Button>
        </div>
      )}
    </div>
  )
}

function SessionHeader({
  session,
  countdown,
}: {
  session: SessionState
  countdown: number | null
}) {
  const current = session.stages.find((s) => s.state === 'active')
  return (
    <div className="card">
      <div className="row between">
        <div>
          <div className="muted small">
            {session.status === 'finished' ? '미팅 종료' : '진행 시간'}
            {session.speed > 1 ? ` · 데모 ${session.speed}배속` : ''}
          </div>
          <div className="timer">
            {Math.floor(session.elapsedMin)}분
            <span className="muted small"> 경과</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {current && session.status !== 'finished' && (
            <Badge tone="primary">지금: {current.label}</Badge>
          )}
          {countdown !== null && (
            <div className="muted small">
              다음 단계까지 {formatCountdown(countdown)}
            </div>
          )}
        </div>
      </div>
      <div
        className="stepper"
        style={{ marginTop: 10, marginBottom: 0 }}
      >
        {session.stages.map((s) => (
          <div
            key={s.key}
            className={`step ${s.state === 'upcoming' ? '' : s.state}`}
            title={`${s.startMin}분`}
          >
            {s.startMin}분
            <br />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  )
}

function PickCard({
  session,
  busy,
  onPick,
}: {
  session: SessionState
  busy: boolean
  onPick: (memberId: number) => void
}) {
  const { pick } = session
  return (
    <div className="card">
      <b>💘 사랑의 짝대기</b>
      {!pick.revealed ? (
        <>
          <p className="muted small">
            지금 가장 같이 이야기해보고 싶은 사람을 선택하세요. 선택은
            비공개이고, 서로 선택한 경우에만 결과가 공개돼요.
          </p>
          <div className="chips">
            {pick.candidates.map((m) => (
              <MemberChoice
                key={m.memberId}
                member={m}
                selected={pick.myPick === m.memberId}
                disabled={busy}
                onSelect={() => onPick(m.memberId)}
              />
            ))}
          </div>
          {pick.myPick !== null && (
            <div className="muted small">
              선택 완료! 결과는 애프터 단계에서 공개돼요.
            </div>
          )}
        </>
      ) : (
        <div>
          <p style={{ margin: '6px 0' }}>
            나를 선택한 사람: <b>{pick.receivedCount}명</b>
          </p>
          {pick.mutual.length > 0 ? (
            <Notice>
              🎉 서로 선택했어요:{' '}
              {pick.mutual
                .map((m) => `${m.alias}(${memberLine(m)})`)
                .join(', ')}
            </Notice>
          ) : (
            <div className="muted small">
              이번에는 서로 선택한 사람이 없어요. (선택 내용은 상대에게 공개되지
              않아요)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PromptCard({
  prompt,
  latest,
  members,
  busy,
  canVote,
  onVote,
}: {
  prompt: PromptView
  latest: boolean
  members: MemberView[]
  busy: boolean
  canVote: boolean
  onVote: (memberId: number) => void
}) {
  const others = members.filter((m) => !m.isMe)
  const cls = `card prompt-card ${prompt.kind === 'topic' ? 'topic' : ''} ${latest ? 'latest' : ''}`
  const maxVotes = Math.max(1, ...(prompt.voteResult ?? []).map((v) => v.votes))
  return (
    <div className={cls}>
      <div className="row between">
        <b>
          {KIND_ICON[prompt.kind] ?? '•'} {prompt.title}
        </b>
        <span className="muted small">{prompt.minute}분</span>
      </div>
      <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>
        {prompt.body}
      </div>
      {prompt.voteable && (
        <div>
          {prompt.voteResult === null ? (
            <>
              <div className="chips">
                {others.map((m) => (
                  <MemberChoice
                    key={m.memberId}
                    member={m}
                    selected={prompt.myVote === m.memberId}
                    disabled={busy || !canVote}
                    onSelect={() => onVote(m.memberId)}
                  />
                ))}
              </div>
              <div className="muted small">
                {prompt.myVote === null
                  ? '한 명을 선택해 투표하세요.'
                  : '투표 완료! 모두 투표하면 결과가 공개돼요.'}
              </div>
            </>
          ) : prompt.voteResult.length === 0 ? (
            <div className="muted small">투표가 없었어요.</div>
          ) : (
            prompt.voteResult.map((v) => {
              const m = members.find((x) => x.memberId === v.memberId)
              return (
                <div
                  key={v.memberId}
                  className="vote-row"
                >
                  <span style={{ minWidth: 70 }}>{m?.alias ?? '참가자'}</span>
                  <div className="bar-wrap">
                    <div
                      className="bar"
                      style={{ width: `${(v.votes / maxVotes) * 100}%` }}
                    />
                  </div>
                  <span>{v.votes}표</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
