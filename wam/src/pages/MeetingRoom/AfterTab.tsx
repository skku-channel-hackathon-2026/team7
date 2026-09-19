import { useState } from 'react'

import { useApi } from '../../api'
import { useNav } from '../../nav'
import { useAction, useLoad } from '../../hooks/useLoad'
import { Button, Empty, ErrorNote, Loading, Notice } from '../../components/ui'
import { genderText, memberLine } from '../../utils/format'

interface Props {
  meetingId: string
}

export function AfterTab({ meetingId }: Props) {
  const api = useApi()
  const nav = useNav()
  const { busy, error, run } = useAction()
  const [selected, setSelected] = useState<number[]>([])
  const [none, setNone] = useState(false)
  const state = useLoad(() => api.afterGet(meetingId), meetingId, 4000)
  const after = state.data?.after

  if (!after) {
    return state.error ? <ErrorNote message={state.error} /> : <Loading />
  }

  if (!after.open) {
    return (
      <Empty icon="⏳">
        애프터 의사 확인은 미팅 진행 후반(75분 단계)부터 열려요.
      </Empty>
    )
  }

  const toggle = (id: number) => {
    setNone(false)
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const submit = () =>
    void run(async () => {
      await api.afterSubmit({
        meetingId,
        targetMemberIds: none ? [] : selected,
      })
      await state.reload()
    })

  return (
    <div>
      <ErrorNote message={error || state.error} />
      {!after.submitted ? (
        <div className="card">
          <b>애프터를 하고 싶은 사람을 선택해 주세요</b>
          <p className="muted small">
            선택은 <b>완전히 익명</b>이에요. 서로 선택한 경우에만 결과가
            공개되고 개인 채팅방이 열려요. 일치하지 않으면 상대에게 아무것도
            알려지지 않아요.
          </p>
          <div className="chips">
            {after.candidates.map((m) => (
              <button
                key={m.memberId}
                type="button"
                className={
                  selected.includes(m.memberId) ? 'chip active' : 'chip'
                }
                onClick={() => toggle(m.memberId)}
              >
                {m.alias} · {genderText(m)} · {memberLine(m)}
              </button>
            ))}
            <button
              type="button"
              className={none ? 'chip active' : 'chip'}
              onClick={() => {
                setNone(!none)
                setSelected([])
              }}
            >
              없음
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <Button
              block
              disabled={busy || (!none && selected.length === 0)}
              onClick={submit}
            >
              익명으로 제출
            </Button>
          </div>
        </div>
      ) : (
        <Notice>
          제출했어요.{' '}
          {after.final
            ? '모든 참가자가 응답했어요.'
            : `아직 ${after.waitingCount}명이 응답하지 않았어요.`}
        </Notice>
      )}

      {after.submitted && (
        <div className="card">
          <b>결과</b>
          {after.matches.length > 0 ? (
            after.matches.map((m) => (
              <div
                key={m.roomId}
                className="row between"
                style={{ marginTop: 8 }}
              >
                <span>
                  💌 {m.partner.alias} · {memberLine(m.partner)}
                  <br />
                  <span className="muted small">서로 애프터를 원했어요!</span>
                </span>
                <Button
                  small
                  onClick={() => nav.push({ name: 'dm', id: m.roomId })}
                >
                  채팅 열기
                </Button>
              </div>
            ))
          ) : (
            <p className="muted small">
              {after.final
                ? '이번에는 서로 선택한 사람이 없어요. 다음 미팅에서 더 좋은 인연을 만나길 바라요 🍀'
                : '아직 서로 일치한 상대가 없어요. 모두 응답하면 최종 결과가 확정돼요.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
