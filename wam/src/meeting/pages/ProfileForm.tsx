import { useState } from 'react'
import {
  DEPARTMENTS,
  MEETING_FUNCTIONS,
  SCHOOLS,
  type Gender,
  type Profile,
} from '@tutorial/shared'
import { errorText, useFn } from '../api'
import { Banner, Button, Field, Segmented, Stepper } from '../ui'

export default function ProfileForm({
  initial,
  onSaved,
}: {
  initial: Profile | null
  onSaved: (profile: Profile) => void
}) {
  const save = useFn(MEETING_FUNCTIONS.saveProfile)
  const [school, setSchool] = useState<string>(
    initial?.school ?? SCHOOLS[0].name
  )
  const [department, setDepartment] = useState(
    initial?.department ?? DEPARTMENTS[0]
  )
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'male')
  const [age, setAge] = useState(initial?.age ?? 21)
  const [studentYear, setStudentYear] = useState(initial?.studentYear ?? 24)
  const [contact, setContact] = useState(initial?.contact ?? '')
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    const profile: Profile = {
      school,
      department,
      gender,
      age,
      studentYear,
      contact,
    }
    try {
      await save.call({ ...profile })
      onSaved(profile)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <div className="page">
      {!initial && (
        <div className="hero hero-small">
          <h2>블라인드 프로필 만들기</h2>
          <p>
            매칭 전에는 <b>학교 · 학과 · 나이 · 학번</b>만 공개돼요.
            <br />
            이름·연락처는 서로 애프터를 선택했을 때만 직접 공유할 수 있어요.
          </p>
        </div>
      )}
      <Field label="학교">
        <select
          value={school}
          onChange={(event) => setSchool(event.target.value)}
        >
          {SCHOOLS.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>
      </Field>
      <Field label="학과">
        <select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        >
          {DEPARTMENTS.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Field>
      <Field label="성별">
        <Segmented
          value={gender}
          onChange={setGender}
          options={[
            { value: 'male', label: '남자' },
            { value: 'female', label: '여자' },
          ]}
        />
      </Field>
      <div className="row-2">
        <Field label="나이">
          <Stepper
            value={age}
            min={18}
            max={40}
            onChange={setAge}
            suffix="세"
          />
        </Field>
        <Field label="학번">
          <Stepper
            value={studentYear}
            min={10}
            max={30}
            onChange={setStudentYear}
            suffix="학번"
          />
        </Field>
      </div>
      <Field
        label="연락처 / SNS"
        hint="비공개 · 애프터 개인 채팅에서 내가 공유할 때만 전달"
      >
        <input
          value={contact}
          maxLength={80}
          placeholder="예) 카톡 ID, 인스타 @아이디"
          onChange={(event) => setContact(event.target.value)}
        />
      </Field>
      {error && <Banner tone="error">{error}</Banner>}
      <Button
        block
        onClick={() => void submit()}
        disabled={save.loading}
      >
        {save.loading ? '저장 중…' : initial ? '프로필 저장' : '시작하기'}
      </Button>
    </div>
  )
}
