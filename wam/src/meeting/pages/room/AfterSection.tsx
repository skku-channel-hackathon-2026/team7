import { useEffect, useState } from 'react'
import { CheckCircleFilledIcon, CheckIcon } from '@channel.io/bezier-icons'
import { MEETING_FUNCTIONS, type RoomOutput } from '@tutorial/shared'
import { errorText, useFn } from '../../api'
import { blindLine } from '../../format'
import { Banner, Button, Section } from '../../ui'

export default function AfterSection({
  data,
  reload,
  openChat,
}: {
  data: RoomOutput
  reload: () => Promise<void>
  openChat: (chatId: string) => void
}) {
  const { after } = data
  const submit = useFn(MEETING_FUNCTIONS.submitAfter)
  const [selected, setSelected] = useState<string[]>(after.myChoices)
  const [editing, setEditing] = useState(!after.submitted)
  const [error, setError] = useState('')
  const opponents = data.members.filter((member) => member.side !== data.mySide)
  const submittedKey = after.myChoices.join(',')

  useEffect(() => {
    setSelected(submittedKey ? submittedKey.split(',') : [])
  }, [submittedKey])

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key]
    )

  const send = async (keys: string[]) => {
    setError('')
    try {
      await submit.call({ meetingId: data.meeting.id, targetKeys: keys })
      setEditing(false)
      await reload()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <Section title="애프터 선택">
      {error && <Banner tone="error">{error}</Banner>}
      {editing ? (
        <>
          <p className="muted small">
            애프터를 하고 싶은 사람을 선택해 주세요. 선택은 익명이고,{' '}
            <b>서로 선택한 경우에만</b> 결과가 공개돼요.
          </p>
          <div className="pick-grid">
            {opponents.map((member) => (
              <button
                type="button"
                key={member.key}
                className={`pick${selected.includes(member.key) ? ' on' : ''}`}
                onClick={() => toggle(member.key)}
              >
                <span className={`avatar avatar-${member.side}`}>
                  {member.alias}
                </span>
                <span className="small">{blindLine(member.profile)}</span>
                {selected.includes(member.key) && (
                  <span className="pick-check">
                    <CheckIcon />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="button-row">
            <Button
              variant="secondary"
              disabled={submit.loading}
              onClick={() => void send([])}
            >
              없음
            </Button>
            <Button
              disabled={submit.loading || !selected.length}
              onClick={() => void send(selected)}
            >
              {selected.length
                ? `${selected.length}명 선택 완료`
                : '선택해 주세요'}
            </Button>
          </div>
        </>
      ) : (
        <div className="after-status">
          <div>
            <CheckCircleFilledIcon className="ok-icon" /> 제출 완료{' '}
            <span className="muted small">
              ({after.submittedCount}/{data.members.length}명 제출)
            </span>
          </div>
          <Button
            small
            variant="ghost"
            onClick={() => setEditing(true)}
          >
            선택 수정
          </Button>
        </div>
      )}

      {after.matches.map((match) => (
        <div
          key={match.chatId}
          className="after-match"
        >
          <div>
            <div className="after-match-title">
              {match.alias}님과 서로 애프터를 선택했어요
            </div>
            <div className="muted small">{blindLine(match.profile)}</div>
          </div>
          <Button
            small
            onClick={() => openChat(match.chatId)}
          >
            개인 채팅
          </Button>
        </div>
      ))}
      {after.submitted && !after.matches.length && (
        <p className="muted small">
          아직 서로 선택된 상대가 없어요. 상대가 제출하면 결과가 업데이트돼요.
        </p>
      )}
    </Section>
  )
}
