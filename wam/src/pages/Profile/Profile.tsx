import { useState } from 'react'
import { DEPARTMENTS, type Gender, type Profile } from '@tutorial/shared'

import { useApi } from '../../api'
import { useAction } from '../../hooks/useLoad'
import { Button, Chips, ErrorNote, Field, Notice } from '../../components/ui'

interface Props {
  initial: Profile | null
  onSaved: () => void
  onCancel?: () => void
}

function ProfilePage({ initial, onSaved, onCancel }: Props) {
  const api = useApi()
  const { busy, error, run } = useAction()
  const [dept, setDept] = useState(initial?.dept ?? '')
  const [year, setYear] = useState(String(initial?.admissionYear ?? 24))
  const [age, setAge] = useState(String(initial?.age ?? 21))
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'male')

  const yearNumber = Number(year)
  const ageNumber = Number(age)
  const valid =
    dept !== '' &&
    Number.isInteger(yearNumber) &&
    yearNumber >= 0 &&
    yearNumber <= 99 &&
    Number.isInteger(ageNumber) &&
    ageNumber >= 18 &&
    ageNumber <= 40

  const save = async () => {
    const saved = await run(() =>
      api.profileSave({
        dept,
        admissionYear: yearNumber,
        age: ageNumber,
        gender,
      })
    )
    if (saved) onSaved()
  }

  return (
    <div className="stack">
      <Notice>
        미팅이 성사되기 전에는 <b>학과 · 학번 · 나이</b>만 상대에게 공개돼요.
        이름, 연락처, SNS는 서로 동의하기 전까지 절대 공개되지 않아요.
      </Notice>
      <Field label="학과">
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
        >
          <option value="">학과를 선택하세요</option>
          {DEPARTMENTS.map((d) => (
            <option
              key={d}
              value={d}
            >
              {d}
            </option>
          ))}
        </select>
      </Field>
      <div className="row">
        <div className="grow">
          <Field label="학번 (앞 두 자리)">
            <input
              type="number"
              min={0}
              max={99}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </Field>
        </div>
        <div className="grow">
          <Field label="나이">
            <input
              type="number"
              min={18}
              max={40}
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label="성별">
        <Chips
          value={gender}
          onChange={setGender}
          options={[
            { value: 'male', label: '남자' },
            { value: 'female', label: '여자' },
          ]}
        />
      </Field>
      <ErrorNote message={error} />
      <div className="row">
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
          >
            취소
          </Button>
        )}
        <div className="grow">
          <Button
            block
            disabled={!valid || busy}
            onClick={() => void save()}
          >
            {busy ? '저장 중…' : '프로필 저장'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
