import {
  DEPARTMENTS,
  type GenderCondition,
  type SideCondition,
} from '@tutorial/shared'

import { Chips, Field } from './ui'

interface Props {
  value: SideCondition
  onChange: (value: SideCondition) => void
  deptLabel?: string
  deptRequired?: boolean
}

function num(text: string, fallback: number): number {
  const n = Number(text)
  return Number.isFinite(n) ? n : fallback
}

export function ConditionEditor({
  value,
  onChange,
  deptLabel = '학과',
  deptRequired = false,
}: Props) {
  const patch = (part: Partial<SideCondition>) =>
    onChange({ ...value, ...part })
  return (
    <div className="stack">
      <Field label={deptLabel}>
        <select
          value={value.dept}
          onChange={(e) => patch({ dept: e.target.value })}
        >
          {!deptRequired && <option value="">학과 무관</option>}
          {deptRequired && <option value="">학과를 선택하세요</option>}
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
      <Field label="성별">
        <Chips<GenderCondition>
          value={value.gender}
          onChange={(gender) => patch({ gender })}
          options={[
            { value: 'any', label: '무관' },
            { value: 'male', label: '남자' },
            { value: 'female', label: '여자' },
          ]}
        />
      </Field>
      <div className="row">
        <div className="grow">
          <Field label="나이 (최소)">
            <input
              type="number"
              min={18}
              max={40}
              value={value.ageMin}
              onChange={(e) => patch({ ageMin: num(e.target.value, 18) })}
            />
          </Field>
        </div>
        <div className="grow">
          <Field label="나이 (최대)">
            <input
              type="number"
              min={18}
              max={40}
              value={value.ageMax}
              onChange={(e) => patch({ ageMax: num(e.target.value, 40) })}
            />
          </Field>
        </div>
      </div>
      <div className="row">
        <div className="grow">
          <Field label="학번 (최소)">
            <input
              type="number"
              min={0}
              max={99}
              value={value.yearMin}
              onChange={(e) => patch({ yearMin: num(e.target.value, 0) })}
            />
          </Field>
        </div>
        <div className="grow">
          <Field label="학번 (최대)">
            <input
              type="number"
              min={0}
              max={99}
              value={value.yearMax}
              onChange={(e) => patch({ yearMax: num(e.target.value, 99) })}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}
