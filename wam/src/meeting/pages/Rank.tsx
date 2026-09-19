import { useEffect, useState } from 'react'
import { StarFilledIcon, TrophyIcon } from '@channel.io/bezier-icons'
import {
  MEETING_FUNCTIONS,
  type RankEntry,
  type RankOutput,
} from '@tutorial/shared'
import { errorText, useFn } from '../api'
import { Banner, Empty } from '../ui'

function Score({ entry }: { entry: RankEntry }) {
  return (
    <span className="rank-rating">
      <StarFilledIcon />
      <b>{entry.rating.toFixed(1)}</b>
      <span className="muted"> · 후기 {entry.reviews}</span>
    </span>
  )
}

// Visual order on the podium: 2nd, 1st, 3rd.
const PODIUM_ORDER = [1, 0, 2]

function Podium({ entries }: { entries: RankEntry[] }) {
  return (
    <div className="podium">
      {PODIUM_ORDER.filter((index) => entries[index]).map((index) => {
        const entry = entries[index]
        const place = index + 1
        return (
          <div
            key={entry.department + entry.schools.join()}
            className={`podium-spot podium-${place}`}
          >
            <span className="podium-medal">{place}</span>
            <span className="podium-school">{entry.schools.join(' · ')}</span>
            <b className="podium-dept">{entry.department}</b>
            <Score entry={entry} />
            <div className="podium-step">{place}위</div>
          </div>
        )
      })}
    </div>
  )
}

export default function Rank() {
  const rank = useFn<RankOutput>(MEETING_FUNCTIONS.rank)
  const [data, setData] = useState<RankOutput | null>(null)
  const [error, setError] = useState('')
  const rankCall = rank.call

  useEffect(() => {
    rankCall()
      .then(setData)
      .catch((err: unknown) => setError(errorText(err)))
  }, [rankCall])

  if (!data)
    return (
      <div className="page">
        {error ? (
          <Banner tone="error">{error}</Banner>
        ) : (
          <div className="loading">불러오는 중…</div>
        )}
      </div>
    )

  const top = data.entries.slice(0, 3)
  const rest = data.entries.slice(3, 10)

  return (
    <div className="page">
      {data.sample ? (
        <div className="rank-sample">
          <b>테스트 데이터</b> 실제 순위가 아니에요. 미팅 후기가 쌓이면 실제
          랭킹으로 바뀌어요.
        </div>
      ) : (
        <p className="muted small">
          미팅 후기의 &lsquo;상대 팀은 어땠나요?&rsquo; 별점을 학과별로 평균
          냈어요. (후기 {data.totalReviews}개)
        </p>
      )}
      {!data.entries.length && (
        <Empty icon={<TrophyIcon />}>아직 랭킹이 없어요.</Empty>
      )}
      {!!top.length && <Podium entries={top} />}
      {!!rest.length && (
        <ol
          className="rank-list"
          start={4}
        >
          {rest.map((entry, index) => (
            <li
              key={entry.department + entry.schools.join()}
              className="rank-row"
            >
              <span className="rank-no">{index + 4}</span>
              <span className="rank-body">
                <b>{entry.department}</b>
                <span className="muted small">{entry.schools.join(' · ')}</span>
              </span>
              <Score entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
