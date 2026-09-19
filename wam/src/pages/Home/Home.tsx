import { useState } from 'react'
import {
  DEPARTMENTS,
  REGIONS,
  type GenderCondition,
  type Side,
} from '@tutorial/shared'

import { useApi } from '../../api'
import { useAction, useLoad } from '../../hooks/useLoad'
import { useMe, useNav } from '../../nav'
import { MeetingCard } from '../../components/MeetingCard'
import { Button, Chips, Empty, ErrorNote, Loading } from '../../components/ui'

function Home() {
  const api = useApi()
  const nav = useNav()
  const { profile } = useMe()
  const [dept, setDept] = useState('')
  const [region, setRegion] = useState('')
  const [gender, setGender] = useState<GenderCondition>('any')
  const [onlyApplicable, setOnlyApplicable] = useState(false)
  const { busy, error, run } = useAction()

  const key = `${dept}|${region}|${gender}|${onlyApplicable}`
  const list = useLoad(
    () =>
      api.list({
        dept: dept || undefined,
        region: region || undefined,
        gender,
        onlyApplicable,
      }),
    key,
    15000
  )

  const apply = async (meetingId: string, side: Side) => {
    const done = await run(async () => {
      await api.apply({ meetingId, side })
      return true
    })
    if (done) nav.push({ name: 'meeting', id: meetingId })
    else await list.reload()
  }

  return (
    <div>
      <div
        className="card row between"
        style={{ background: 'var(--primary-soft)' }}
      >
        <div className="small">
          내 블라인드 프로필
          <div>
            <b>
              {profile.dept} · {profile.admissionYear}학번 · {profile.age}세
            </b>
          </div>
        </div>
        <Button
          small
          variant="ghost"
          onClick={() => nav.push({ name: 'profile' })}
        >
          수정
        </Button>
      </div>

      <div className="row wrap">
        <div className="grow">
          <Button
            block
            onClick={() => nav.push({ name: 'create', kind: 'recruit' })}
          >
            ✏️ 미팅 모집하기
          </Button>
        </div>
        <div className="grow">
          <Button
            block
            variant="soft"
            onClick={() => nav.push({ name: 'create', kind: 'proposal' })}
          >
            💌 다른 학과에 제안
          </Button>
        </div>
      </div>

      <div className="section-title">모집 중인 미팅</div>
      <div className="stack">
        <div className="row">
          <div className="grow">
            <select
              aria-label="학과 필터"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
            >
              <option value="">모든 학과</option>
              {DEPARTMENTS.map((d) => (
                <option
                  key={d}
                  value={d}
                >
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="grow">
            <select
              aria-label="지역 필터"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">모든 지역</option>
              {REGIONS.map((r) => (
                <option
                  key={r}
                  value={r}
                >
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Chips
          value={gender}
          onChange={setGender}
          options={[
            { value: 'any', label: '전체' },
            { value: 'male', label: '남자' },
            { value: 'female', label: '여자' },
          ]}
        />
        <label className="row small">
          <input
            type="checkbox"
            checked={onlyApplicable}
            onChange={(e) => setOnlyApplicable(e.target.checked)}
          />
          내가 신청할 수 있는 미팅만 보기
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <ErrorNote message={error || list.error} />
        {list.loading && !list.data ? (
          <Loading />
        ) : list.data && list.data.meetings.length > 0 ? (
          list.data.meetings.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              busy={busy}
              onOpen={() => nav.push({ name: 'meeting', id: m.id })}
              onApply={(side) => void apply(m.id, side)}
            />
          ))
        ) : (
          <Empty icon="🔍">
            조건에 맞는 미팅이 없어요.
            <br />
            직접 모집글을 올려 보세요!
          </Empty>
        )}
      </div>
    </div>
  )
}

export default Home
