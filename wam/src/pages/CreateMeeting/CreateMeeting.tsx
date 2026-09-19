import { useState } from 'react'
import { REGIONS, type SideCondition } from '@tutorial/shared'

import { useApi } from '../../api'
import { useAction } from '../../hooks/useLoad'
import { useMe, useNav } from '../../nav'
import { ConditionEditor } from '../../components/ConditionEditor'
import { Button, ErrorNote, Field, Notice } from '../../components/ui'
import { defaultStartLocal, localToIso } from '../../utils/format'

interface Props {
  kind: 'recruit' | 'proposal'
}

function CreateMeeting({ kind }: Props) {
  const api = useApi()
  const nav = useNav()
  const { profile } = useMe()
  const { busy, error, run } = useAction()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [size, setSize] = useState(3)
  const [startAt, setStartAt] = useState(defaultStartLocal())
  const [region, setRegion] = useState<string>(REGIONS[0])
  const [condA, setCondA] = useState<SideCondition>({
    dept: profile.dept,
    gender: profile.gender,
    ageMin: 18,
    ageMax: 40,
    yearMin: 0,
    yearMax: 99,
  })
  const [condB, setCondB] = useState<SideCondition>({
    dept: '',
    gender: profile.gender === 'male' ? 'female' : 'male',
    ageMin: 18,
    ageMax: 40,
    yearMin: 0,
    yearMax: 99,
  })

  const isProposal = kind === 'proposal'
  const startValid =
    startAt !== '' && !Number.isNaN(new Date(startAt).getTime())
  const valid =
    title.trim() !== '' && startValid && (!isProposal || condB.dept !== '')

  const submit = async () => {
    const result = await run(() =>
      api.create({
        kind,
        title: title.trim(),
        description: description.trim(),
        size,
        startAt: localToIso(startAt),
        region,
        condA,
        condB,
      })
    )
    if (result) nav.replace({ name: 'meeting', id: result.meetingId })
  }

  return (
    <div className="stack">
      <Notice>
        {isProposal
          ? '상대 학과를 정해서 미팅을 제안해요. 그 학과 학생이 수락하면 미팅이 성사돼요.'
          : '조건을 정해서 모집글을 올려요. 조건에 맞는 사람이 신청하면 자리가 채워져요.'}
      </Notice>
      <Field label="제목">
        <input
          type="text"
          maxLength={60}
          placeholder={
            isProposal
              ? '예) 경영학과 분들, 같이 미팅해요!'
              : '예) 금요일 성수 3:3 미팅'
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="소개 (선택)">
        <textarea
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="row">
        <div className="grow">
          <Field label="팀당 인원">
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option
                  key={n}
                  value={n}
                >
                  {n}:{n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grow">
          <Field label="지역">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {REGIONS.map((r) => (
                <option
                  key={r}
                  value={r}
                >
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <Field label="날짜 및 시간">
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
        />
      </Field>

      <div className="section-title">A팀 (우리 팀) 조건</div>
      <div className="card">
        <ConditionEditor
          value={condA}
          onChange={setCondA}
        />
      </div>
      <div className="section-title">
        {isProposal ? 'B팀 (제안할 상대 학과)' : 'B팀 (상대 팀) 조건'}
      </div>
      <div className="card">
        <ConditionEditor
          value={condB}
          onChange={setCondB}
          deptLabel={isProposal ? '상대 학과 (필수)' : '학과'}
          deptRequired={isProposal}
        />
      </div>

      <ErrorNote message={error} />
      <Button
        block
        disabled={!valid || busy}
        onClick={() => void submit()}
      >
        {busy ? '올리는 중…' : isProposal ? '제안 보내기' : '모집글 올리기'}
      </Button>
    </div>
  )
}

export default CreateMeeting
