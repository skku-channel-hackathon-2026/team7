import { createContext, useContext } from 'react'
import {
  AfterGetOutputSchema,
  ChatListOutputSchema,
  DemoFillOutputSchema,
  DmGetOutputSchema,
  DmListOutputSchema,
  MEETING_FUNCTIONS as FN,
  MeetingCreateOutputSchema,
  MeetingGetOutputSchema,
  MeetingListOutputSchema,
  NudgeOutputSchema,
  OkOutputSchema,
  PlaceRecommendOutputSchema,
  PlaceSelectOutputSchema,
  ProfileGetOutputSchema,
  RecordListOutputSchema,
  ReviewGetOutputSchema,
  SessionGetOutputSchema,
  StatsOutputSchema,
  type AfterReviewInput,
  type AfterSubmitInput,
  type ChatListInput,
  type ChatSendInput,
  type DmConsentInput,
  type MeetingApplyInput,
  type MeetingCreateInput,
  type MeetingListInput,
  type PlaceRecommendInput,
  type PlaceReserveInput,
  type PlaceSelectInput,
  type Profile,
  type ReviewInput,
  type SessionPickInput,
  type SessionStartInput,
  type SessionVoteInput,
} from '@tutorial/shared'

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

/** The host may hand back either the raw function output or a `{ result }` envelope. */
function unwrap<T>(raw: unknown, parser: Parser<T>): T {
  const direct = parser.safeParse(raw)
  if (direct.success) return direct.data
  if (raw && typeof raw === 'object') {
    const envelope = raw as Record<string, unknown>
    for (const key of ['result', 'data']) {
      if (key in envelope) {
        const inner = parser.safeParse(envelope[key])
        if (inner.success) return inner.data
      }
    }
  }
  throw new Error(
    '서버 응답 형식이 올바르지 않아요. 잠시 후 다시 시도해 주세요.'
  )
}

async function invoke<T>(
  appId: string,
  name: string,
  params: Record<string, unknown>,
  parser: Parser<T>
): Promise<T> {
  const wam = window.ChannelIOWam
  if (!wam || typeof wam.callFunction !== 'function') {
    throw new Error('채널톡 데스크 안에서 /meeting 커맨드로 열어 주세요.')
  }
  const raw = await wam.callFunction<unknown>({ appId, name, params })
  return unwrap(raw, parser)
}

export function createApi(appId: string) {
  const call = <T>(
    name: string,
    params: object,
    parser: Parser<T>
  ): Promise<T> =>
    invoke(appId, name, params as Record<string, unknown>, parser)
  const ok = (name: string, params: object) =>
    call(name, params, OkOutputSchema).then(() => undefined)

  return {
    profileGet: () => call(FN.profileGet, {}, ProfileGetOutputSchema),
    profileSave: (profile: Profile) =>
      call(FN.profileSave, profile, ProfileGetOutputSchema),
    list: (input: Partial<MeetingListInput>) =>
      call(FN.list, input, MeetingListOutputSchema),
    mine: () => call(FN.mine, {}, MeetingListOutputSchema),
    inbox: () => call(FN.inbox, {}, MeetingListOutputSchema),
    get: (meetingId: string) =>
      call(FN.get, { meetingId }, MeetingGetOutputSchema),
    create: (input: MeetingCreateInput) =>
      call(FN.create, input, MeetingCreateOutputSchema),
    apply: (input: MeetingApplyInput) => ok(FN.apply, input),
    leave: (meetingId: string) => ok(FN.leave, { meetingId }),
    cancel: (meetingId: string) => ok(FN.cancel, { meetingId }),
    decline: (meetingId: string) => ok(FN.decline, { meetingId }),
    ack: (meetingId: string) => ok(FN.ack, { meetingId }),
    nudge: (meetingId: string) =>
      call(FN.nudge, { meetingId }, NudgeOutputSchema),
    demoFill: (meetingId: string) =>
      call(FN.demoFill, { meetingId }, DemoFillOutputSchema),
    chatList: (input: Pick<ChatListInput, 'roomType' | 'roomId' | 'afterId'>) =>
      call(FN.chatList, input, ChatListOutputSchema),
    chatSend: (input: ChatSendInput) => ok(FN.chatSend, input),
    sessionGet: (meetingId: string) =>
      call(FN.sessionGet, { meetingId }, SessionGetOutputSchema),
    sessionStart: (input: SessionStartInput) => ok(FN.sessionStart, input),
    sessionFinish: (meetingId: string) => ok(FN.sessionFinish, { meetingId }),
    sessionPick: (input: SessionPickInput) => ok(FN.sessionPick, input),
    sessionVote: (input: SessionVoteInput) => ok(FN.sessionVote, input),
    afterGet: (meetingId: string) =>
      call(FN.afterGet, { meetingId }, AfterGetOutputSchema),
    afterSubmit: (input: AfterSubmitInput) => ok(FN.afterSubmit, input),
    dmList: () => call(FN.dmList, {}, DmListOutputSchema),
    dmGet: (roomId: string) => call(FN.dmGet, { roomId }, DmGetOutputSchema),
    dmConsent: (input: DmConsentInput) =>
      call(FN.dmConsent, input, DmGetOutputSchema),
    placeRecommend: (input: PlaceRecommendInput) =>
      call(FN.placeRecommend, input, PlaceRecommendOutputSchema),
    placeSelect: (input: PlaceSelectInput) =>
      call(FN.placeSelect, input, PlaceSelectOutputSchema),
    placeReserve: (input: PlaceReserveInput) =>
      call(FN.placeReserve, input, PlaceSelectOutputSchema),
    reviewGet: (meetingId: string) =>
      call(FN.reviewGet, { meetingId }, ReviewGetOutputSchema),
    reviewSubmit: (input: ReviewInput) => ok(FN.reviewSubmit, input),
    afterReviewSubmit: (input: AfterReviewInput) =>
      ok(FN.afterReviewSubmit, input),
    recordList: () => call(FN.recordList, {}, RecordListOutputSchema),
    stats: () => call(FN.statsDepartments, {}, StatsOutputSchema),
  }
}

export type MeetingApi = ReturnType<typeof createApi>

export const ApiContext = createContext<MeetingApi | null>(null)

export function useApi(): MeetingApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('ApiProvider is missing')
  return api
}
