import { useEffect, useState } from 'react'
import { StarFilledIcon, TrophyIcon } from '@channel.io/bezier-icons'
import { MEETING_FUNCTIONS, type RankOutput } from '@tutorial/shared'
import { errorText, useFn } from '../api'
import { Banner, Empty } from '../ui'

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span className="rank-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarFilledIcon
          key={n}
          className={n <= full ? 'on' : ''}
        />
      ))}
    </span>
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

  return (
    <div className="page">
      <p className="muted small">
        미팅 후기에서 &lsquo;상대 팀은 어땠나요?&rsquo; 별점을 모아 학과별로
        계산해요. (후기 {data.totalReviews}개)
      </p>
      {!data.entries.length && (
        <Empty icon={<TrophyIcon />}>
          아직 후기가 없어요.
          <br />
          미팅 후 후기를 남기면 랭크가 만들어져요.
        </Empty>
      )}
      <div className="rank-list">
        {data.entries.map((entry, index) => (
          <div
            key={entry.department}
            className="rank-item"
          >
            <span className={`rank-no rank-${index + 1}`}>{index + 1}</span>
            <span className="rank-body">
              <b>{entry.department}</b>
              <span className="muted small">{entry.schools.join(' · ')}</span>
            </span>
            <span className="rank-score">
              <Stars rating={entry.rating} />
              <span>
                <b>{entry.rating.toFixed(1)}</b>
                <span className="muted small"> · 후기 {entry.reviews}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
