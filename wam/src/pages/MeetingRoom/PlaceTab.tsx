import { useState } from 'react'
import { PLACE_CATEGORIES, type MeetingDetail } from '@tutorial/shared'

import { useApi } from '../../api'
import { useAction, useLoad } from '../../hooks/useLoad'
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Notice,
} from '../../components/ui'

interface Props {
  meeting: MeetingDetail
  reload: () => Promise<void>
}

const PRICE = ['₩', '₩₩', '₩₩₩']

export function PlaceTab({ meeting, reload }: Props) {
  const api = useApi()
  const [category, setCategory] = useState('')
  const [reservedFor, setReservedFor] = useState('')
  const [note, setNote] = useState('')
  const { busy, error, run } = useAction()

  const places = useLoad(
    () =>
      api.placeRecommend({
        meetingId: meeting.id,
        category: category || undefined,
      }),
    `${meeting.id}|${category}`
  )

  const canSelect = meeting.isHost && meeting.status !== 'recruiting'
  const chosen = meeting.place

  const select = (placeId: string) =>
    void run(async () => {
      await api.placeSelect({ meetingId: meeting.id, placeId })
      await reload()
    })

  const reserve = () =>
    void run(async () => {
      await api.placeReserve({
        meetingId: meeting.id,
        reservedFor: reservedFor.trim(),
        note: note.trim(),
      })
      setReservedFor('')
      setNote('')
      await reload()
    })

  return (
    <div>
      {chosen && (
        <div
          className="card"
          style={{ background: 'var(--primary-soft)' }}
        >
          <div className="row between">
            <b>📍 확정된 장소: {chosen.name}</b>
            <a
              className="link"
              href={chosen.url}
              target="_blank"
              rel="noreferrer"
            >
              예약하러 가기
            </a>
          </div>
          {chosen.reservedFor ? (
            <div>
              ✅ 예약 일정: {chosen.reservedFor}
              {chosen.note ? ` · ${chosen.note}` : ''}
            </div>
          ) : (
            <div className="muted small">
              예약을 마쳤다면 아래에서 예약 일정을 공유해 주세요.
            </div>
          )}
          {meeting.isHost && (
            <div
              className="stack"
              style={{ marginTop: 8 }}
            >
              <Field label="예약 일정 공유">
                <input
                  type="text"
                  maxLength={100}
                  placeholder="예) 금요일 19:00, 6명 예약 완료"
                  value={reservedFor}
                  onChange={(e) => setReservedFor(e.target.value)}
                />
              </Field>
              <Field label="메모 (선택)">
                <input
                  type="text"
                  maxLength={200}
                  placeholder="예) 창가 자리, 예약자명 김OO"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <Button
                small
                disabled={busy || !reservedFor.trim()}
                onClick={reserve}
              >
                단체 채팅에 공유
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="section-title">
        {meeting.region} · {meeting.size * 2}명 기준 추천 장소
      </div>
      <div className="chips">
        {['', ...PLACE_CATEGORIES].map((c) => (
          <button
            key={c || 'all'}
            type="button"
            className={c === category ? 'chip active' : 'chip'}
            onClick={() => setCategory(c)}
          >
            {c || '전체'}
          </button>
        ))}
      </div>

      <ErrorNote message={error || places.error} />
      {!canSelect && meeting.status === 'recruiting' && (
        <div style={{ marginTop: 8 }}>
          <Notice>
            미팅이 성사되면 모집한 사람이 장소를 확정할 수 있어요.
          </Notice>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {places.loading && !places.data ? (
          <Loading />
        ) : places.data && places.data.places.length > 0 ? (
          places.data.places.map((p) => (
            <div
              key={p.placeId}
              className="card"
            >
              <div className="row between">
                <b>{p.name}</b>
                <span>
                  ⭐ {p.rating.toFixed(1)}{' '}
                  <span className="muted small">
                    ({p.reviewCount > 0 ? `후기 ${p.reviewCount}` : '기본 평점'}
                    )
                  </span>
                </span>
              </div>
              <div className="row wrap small muted">
                <Badge>{p.category}</Badge>
                <span>{PRICE[p.priceLevel - 1]}</span>
                <span>최대 {p.capacityMax}명</span>
                <span>{p.address}</span>
              </div>
              <div className="small">{p.reason}</div>
              <div className="chips">
                {p.tags.map((t) => (
                  <Badge key={t}>#{t}</Badge>
                ))}
              </div>
              {p.perk && (
                <div style={{ marginTop: 6 }}>
                  <Badge tone="warn">🎁 {p.perk}</Badge>
                </div>
              )}
              {p.recentReviews.map((r, i) => (
                <div
                  key={i}
                  className="muted small"
                >
                  “{r}”
                </div>
              ))}
              <div
                className="row wrap"
                style={{ marginTop: 8 }}
              >
                <a
                  className="link"
                  href={p.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  🗺 위치 보기
                </a>
                <a
                  className="link"
                  href={p.reservationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  📅 예약 연결
                </a>
                {canSelect && (
                  <Button
                    small
                    variant={
                      chosen?.placeId === p.placeId ? 'ghost' : 'primary'
                    }
                    disabled={busy || chosen?.placeId === p.placeId}
                    onClick={() => select(p.placeId)}
                  >
                    {chosen?.placeId === p.placeId ? '확정됨' : '여기로 확정'}
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty icon="🍽">조건에 맞는 장소가 없어요.</Empty>
        )}
      </div>
      <p className="muted small">
        장소 정보는 데모용 샘플이며, 예약은 네이버 검색 결과로 연결돼요. 제휴가
        진행되면 참가자 전용 할인·쿠폰이 함께 표시돼요.
      </p>
    </div>
  )
}
