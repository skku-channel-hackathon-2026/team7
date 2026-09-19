import { useState } from 'react'
import { DEPARTMENTS, MEETING_FUNCTIONS, type Profile } from '@tutorial/shared'
import { errorText, useFn, useMeetingWamData } from '../api'
import { genderLabel } from '../format'
import type { Nav } from '../nav'
import { Banner, Button, Field, Segmented, Stepper } from '../ui'

export default function Create({
  nav,
  profile,
}: {
  nav: Nav
  profile: Profile
}) {
  const wam = useMeetingWamData()
  const create = useFn<{ meetingId: string }>(MEETING_FUNCTIONS.create)
  const [kind, setKind] = useState<'open' | 'proposal'>('open')
  const [department, setDepartment] = useState(profile.department)
  const [size, setSize] = useState(3)
  const [targetDepartment, setTargetDepartment] = useState(
    DEPARTMENTS.find((name) => name !== profile.department) ?? ''
  )
  const [intro, setIntro] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    try {
      const { meetingId } = await create.call({
        kind,
        department,
        size,
        targetDepartment: kind === 'proposal' ? targetDepartment : undefined,
        intro,
        targetToken: wam.targetToken,
      })
      nav.replace({ name: 'detail', meetingId })
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="page">
      <div className="preview-card">
        <span className={`gender-dot gender-${profile.gender}`}>
          {profile.gender === 'male' ? '남' : '여'}
        </span>
        <div>
          <div className="meeting-card-school">{profile.school}</div>
          <div className="meeting-card-title">
            {department} {genderLabel(profile.gender)} {size}명
          </div>
          <div className="muted small">
            {kind === 'proposal'
              ? `${targetDepartment}에 제안`
              : `${genderLabel(profile.gender === 'male' ? 'female' : 'male')} 팀에게만 보여요`}
          </div>
        </div>
      </div>

      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'open', label: '모집글' },
          { value: 'proposal', label: '특정 학과에 제안' },
        ]}
      />
      <Field label="우리 학과">
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          {DEPARTMENTS.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Field>
      {kind === 'proposal' && (
        <Field label="제안할 학과">
          <select
            value={targetDepartment}
            onChange={(e) => setTargetDepartment(e.target.value)}
          >
            {DEPARTMENTS.filter((name) => name !== department).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="모집 인원">
        <Stepper
          value={size}
          min={1}
          max={6}
          onChange={setSize}
          suffix="명"
        />
      </Field>
      <Field
        label="한마디"
        hint="선택"
      >
        <input
          value={intro}
          maxLength={200}
          placeholder="예) 텐션 좋은 컴공 3명이에요"
          onChange={(e) => setIntro(e.target.value)}
        />
      </Field>
      <p className="muted small center">
        날짜와 지역은 매칭 후 단체 채팅방에서 함께 정해요.
      </p>
      {error && <Banner tone="error">{error}</Banner>}
      <Button
        block
        onClick={() => void submit()}
        disabled={create.loading}
      >
        {create.loading
          ? '등록 중…'
          : kind === 'open'
            ? '모집글 올리기'
            : '제안 보내기'}
      </Button>
    </div>
  )
}
