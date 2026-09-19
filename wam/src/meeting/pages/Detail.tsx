import { useCallback, useEffect, useState } from 'react'
import { SendIcon } from '@channel.io/bezier-icons'
import {
  MEETING_FUNCTIONS,
  type MeetingDetail,
  type Profile,
} from '@tutorial/shared'
import { errorText, useFn, useShareToGroup } from '../api'
import { blindLine, genderLabel, headline, shareText } from '../format'
import type { Nav } from '../nav'
import {
  Banner,
  Button,
  Empty,
  JoinWithCode,
  Section,
  StatusBadge,
} from '../ui'

export default function Detail({
  nav,
  profile,
  meetingId,
}: {
  nav: Nav
  profile: Profile
  meetingId: string
}) {
  const get = useFn<MeetingDetail>(MEETING_FUNCTIONS.get)
  const apply = useFn<{ matched: boolean }>(MEETING_FUNCTIONS.apply)
  const decide = useFn(MEETING_FUNCTIONS.decide)
  const cancel = useFn(MEETING_FUNCTIONS.cancel)
  const joinTeam = useFn<{ meetingId: string }>(MEETING_FUNCTIONS.joinTeam)
  const shareToGroup = useShareToGroup()
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState<{
    tone: 'error' | 'success'
    text: string
  } | null>(null)
  const getCall = get.call

  const load = useCallback(async () => {
    try {
      setDetail(await getCall({ meetingId }))
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err) })
    }
  }, [getCall, meetingId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(timer)
  }, [load])

  const act = async (action: () => Promise<unknown>, success?: string) => {
    setNotice(null)
    try {
      await action()
      if (success) setNotice({ tone: 'success', text: success })
      await load()
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err) })
    }
  }

  if (!detail)
    return (
      <div className="page">
        {notice ? (
          <Banner tone={notice.tone}>{notice.text}</Banner>
        ) : (
          <div className="loading">불러오는 중…</div>
        )}
      </div>
    )

  const { meeting } = detail
  const isProposal = meeting.kind === 'proposal'
  const matched =
    meeting.status !== 'recruiting' && meeting.status !== 'cancelled'
  const canApply =
    meeting.status === 'recruiting' &&
    !meeting.isMember &&
    !detail.myApplication
  const pending = detail.applications.filter((app) => app.status === 'pending')
  const code = detail.hostCode ?? detail.guestCode

  return (
    <div className="page">
      <div className="detail-hero">
        <div className="detail-badges">
          <StatusBadge status={meeting.status} />
          {isProposal && (
            <span className="badge badge-proposal">학과 제안</span>
          )}
        </div>
        <h2>{headline(meeting)}</h2>
        {isProposal && (
          <div className="detail-target">
            → {meeting.targetDepartment}에 미팅 제안
          </div>
        )}
        <div className="detail-school">{meeting.school}</div>
        <div className="detail-sub">
          {genderLabel(meeting.targetGender)} 팀 찾는 중 · 팀원{' '}
          {meeting.hostCount}/{meeting.size}명
        </div>
        {meeting.intro && <p className="detail-intro">“{meeting.intro}”</p>}
        <div className="blind-note">
          매칭 전에는 학교·학과·나이·학번만 공개돼요. 날짜와 지역은 매칭 후
          채팅방에서 정해요.
        </div>
      </div>

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      {matched && meeting.isMember && (
        <Button
          block
          onClick={() => nav.replace({ name: 'room', meetingId })}
        >
          단체 채팅방 입장하기
        </Button>
      )}

      {canApply && (
        <Section title={isProposal ? '제안 수락하기' : '미팅 신청하기'}>
          {profile.department === meeting.department ? (
            <Banner>
              같은 학과 모집글이에요. 팀원이라면 호스트에게 초대 코드를 받아
              합류하세요.
            </Banner>
          ) : (
            <>
              <p className="muted small">
                내 블라인드 프로필({blindLine(profile)})이 상대 호스트에게
                공개돼요.
              </p>
              {!isProposal && (
                <textarea
                  rows={2}
                  maxLength={200}
                  value={message}
                  placeholder="우리 팀 소개 한마디 (예: 경영 3명, 텐션 좋아요!)"
                  onChange={(event) => setMessage(event.target.value)}
                />
              )}
              <Button
                block
                disabled={apply.loading}
                onClick={() =>
                  void act(
                    async () => {
                      const result = await apply.call({ meetingId, message })
                      if (result.matched)
                        nav.replace({ name: 'room', meetingId })
                    },
                    isProposal
                      ? undefined
                      : '신청했어요! 호스트가 수락하면 미팅방이 열려요.'
                  )
                }
              >
                {isProposal
                  ? `${profile.department} 대표로 수락하기`
                  : '우리 팀으로 신청하기'}
              </Button>
            </>
          )}
        </Section>
      )}

      {detail.myApplication && !meeting.isMember && (
        <Banner
          tone={detail.myApplication.status === 'rejected' ? 'error' : 'info'}
        >
          {detail.myApplication.status === 'pending'
            ? '신청 완료! 호스트의 수락을 기다리는 중이에요.'
            : detail.myApplication.status === 'rejected'
              ? '아쉽게도 다른 팀과 매칭됐어요. 다른 미팅을 찾아보세요!'
              : '매칭됐어요!'}
        </Banner>
      )}

      {meeting.isHost && meeting.status === 'recruiting' && (
        <Section title={`받은 신청 ${pending.length}건`}>
          {!pending.length && (
            <Empty icon={<SendIcon />}>
              아직 신청한 팀이 없어요. 그룹에 모집글을 공유해 보세요!
            </Empty>
          )}
          {pending.map((application) => (
            <div
              key={application.id}
              className="application"
            >
              <div className="application-head">
                <b>
                  {application.school} {application.department} 팀
                </b>
                {application.profile && (
                  <span className="muted small">
                    대표 {blindLine(application.profile)}
                  </span>
                )}
              </div>
              {application.message && <p>“{application.message}”</p>}
              <div className="button-row">
                <Button
                  small
                  variant="secondary"
                  disabled={decide.loading}
                  onClick={() =>
                    void act(() =>
                      decide.call({
                        applicationId: application.id,
                        accept: false,
                      })
                    )
                  }
                >
                  거절
                </Button>
                <Button
                  small
                  disabled={decide.loading}
                  onClick={() =>
                    void act(async () => {
                      await decide.call({
                        applicationId: application.id,
                        accept: true,
                      })
                      nav.replace({ name: 'room', meetingId })
                    })
                  }
                >
                  수락하고 매칭
                </Button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {meeting.isMember && code && (
        <Section title="팀원 초대">
          <div className="invite">
            <div>
              <div className="muted small">
                {detail.mySide === 'host' ? 'A팀' : 'B팀'} 초대 코드 · 같은 학과
                친구에게 공유
              </div>
              <div className="invite-code">{code}</div>
            </div>
            <Button
              small
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(code)}
            >
              복사
            </Button>
          </div>
        </Section>
      )}

      {!meeting.isMember &&
        meeting.status !== 'cancelled' &&
        profile.department === meeting.department && (
          <JoinWithCode
            loading={joinTeam.loading}
            onJoin={(value) =>
              act(async () => {
                const result = await joinTeam.call({ code: value })
                nav.replace({ name: 'detail', meetingId: result.meetingId })
              }, '팀에 합류했어요!')
            }
          />
        )}

      {meeting.isHost && meeting.status === 'recruiting' && (
        <div className="button-row">
          <Button
            variant="secondary"
            disabled={!shareToGroup.available || shareToGroup.loading}
            onClick={() =>
              void act(
                () => shareToGroup.share(shareText(meeting)),
                `${shareToGroup.chatTitle || '그룹'}에 내 이름으로 모집글을 공유했어요.`
              )
            }
          >
            그룹에 공유
          </Button>
          <Button
            variant="danger"
            disabled={cancel.loading}
            onClick={() =>
              void act(async () => {
                await cancel.call({ meetingId })
                nav.back()
              })
            }
          >
            모집 취소
          </Button>
        </div>
      )}
      {meeting.isHost &&
        meeting.status === 'recruiting' &&
        !shareToGroup.available && (
          <p className="muted small center">
            그룹 채팅에서 /meeting 을 실행하면 모집글을 공유할 수 있어요.
          </p>
        )}
    </div>
  )
}
