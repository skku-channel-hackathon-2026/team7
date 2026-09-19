import { useState } from 'react'

import { useApi } from '../../api'
import { useAction, useLoad } from '../../hooks/useLoad'
import { ChatPanel } from '../../components/ChatPanel'
import {
  Badge,
  Button,
  ErrorNote,
  Field,
  Loading,
  Notice,
} from '../../components/ui'
import { memberLine } from '../../utils/format'

interface Props {
  roomId: string
}

function DmRoom({ roomId }: Props) {
  const api = useApi()
  const { busy, error, run } = useAction()
  const [contact, setContact] = useState('')
  const [open, setOpen] = useState(false)
  const state = useLoad(() => api.dmGet(roomId), roomId, 5000)
  const room = state.data?.room

  if (!room) {
    return state.error ? <ErrorNote message={state.error} /> : <Loading />
  }

  const agree = () =>
    void run(async () => {
      await api.dmConsent({ roomId, consent: true, contact: contact.trim() })
      setOpen(false)
      await state.reload()
    })

  const withdraw = () =>
    void run(async () => {
      await api.dmConsent({ roomId, consent: false, contact: '' })
      await state.reload()
    })

  return (
    <>
      <div style={{ padding: '10px 16px 0' }}>
        <div className="row between">
          <div>
            <b>💌 {room.partner.alias}</b>
            <div className="muted small">
              {memberLine(room.partner)} · {room.meetingTitle}
            </div>
          </div>
          {room.partnerContact !== null ? (
            <Badge tone="ok">연락처 교환됨</Badge>
          ) : (
            <Button
              small
              variant="soft"
              onClick={() => setOpen(!open)}
            >
              연락처 교환
            </Button>
          )}
        </div>

        {room.partnerContact !== null && (
          <Notice>
            🎉 상대의 연락처: <b>{room.partnerContact}</b>
            <div className="row between small">
              <span>내가 공유한 정보: {room.myContact}</span>
              <Button
                small
                variant="ghost"
                disabled={busy}
                onClick={withdraw}
              >
                동의 철회
              </Button>
            </div>
          </Notice>
        )}
        {room.partnerContact === null && room.myConsent && (
          <Notice>
            내 동의를 보냈어요. 상대도 동의하면 서로의 연락처가 공개돼요.
            <div>
              <Button
                small
                variant="ghost"
                disabled={busy}
                onClick={withdraw}
              >
                동의 철회
              </Button>
            </div>
          </Notice>
        )}
        {room.partnerContact === null &&
          !room.myConsent &&
          room.partnerConsent && (
            <Notice>
              상대가 연락처 교환에 동의했어요. 동의하면 서로 공개돼요.
            </Notice>
          )}
        {open && !room.myConsent && (
          <div
            className="card stack"
            style={{ marginTop: 6 }}
          >
            <Field label="공유할 연락처 / SNS 아이디">
              <input
                type="text"
                maxLength={100}
                placeholder="예) 인스타 @myid, 카카오톡 myid"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </Field>
            <div className="muted small">
              두 사람이 모두 동의해야 서로에게 공개돼요. 언제든 철회할 수
              있어요.
            </div>
            <Button
              disabled={busy || !contact.trim()}
              onClick={agree}
            >
              동의하고 공유하기
            </Button>
          </div>
        )}
        <ErrorNote message={error || state.error} />
      </div>
      <ChatPanel
        roomType="dm"
        roomId={roomId}
        onActivity={() => void state.reload()}
      />
    </>
  )
}

export default DmRoom
