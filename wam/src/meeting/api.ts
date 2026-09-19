import { useCallback, useMemo } from 'react'
import {
  useCallFunction,
  useNativeFunction,
  useTypedWamData,
  useWamData,
} from '@channel.io/app-sdk-wam'
import {
  MEETING_FUNCTIONS,
  MeetingWamArgsSchema,
  type MeetingWamArgs,
} from '@tutorial/shared'

export type FunctionName =
  (typeof MEETING_FUNCTIONS)[keyof typeof MEETING_FUNCTIONS]

/** Unwraps the Function response envelope and surfaces FunctionCallError messages. */
function unwrap<T>(response: unknown): T {
  if (response && typeof response === 'object') {
    const envelope = response as { result?: unknown; error?: unknown }
    if (envelope.error) {
      const error = envelope.error as { message?: string }
      throw new Error(error.message ?? '요청을 처리하지 못했어요.')
    }
    if ('result' in envelope) return envelope.result as T
  }
  return response as T
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * Calls one of this app's server Functions through the Channel App SDK. The
 * host signs the request, so the server knows which manager is calling.
 */
export function useFn<T = Record<string, unknown>>(name: FunctionName) {
  const appId = useTypedWamData('appId') ?? ''
  const { call, loading } = useCallFunction<unknown>({ appId, name })
  const run = useCallback(
    async (params: Record<string, unknown> = {}): Promise<T> =>
      unwrap<T>(await call(params)),
    [call]
  )
  return { call: run, loading }
}

export interface MeetingWamData extends MeetingWamArgs {
  channelId: string
  appearance: string
}

export function useMeetingWamData(): MeetingWamData {
  const channelId = useTypedWamData('channelId')
  const managerId = useTypedWamData('managerId')
  const chatId = useTypedWamData('chatId')
  const chatType = useTypedWamData('chatType')
  const chatTitle = useTypedWamData('chatTitle')
  const rootMessageId = useTypedWamData('rootMessageId')
  const broadcast = useTypedWamData('broadcast')
  const targetToken = useWamData('targetToken')
  const appearance = useWamData('appearance')

  return useMemo(() => {
    const parsed = MeetingWamArgsSchema.safeParse({
      chatId: chatId ?? '',
      chatType: chatType ?? '',
      chatTitle: chatTitle ?? '',
      managerId: managerId ?? '',
      rootMessageId: rootMessageId || undefined,
      broadcast: broadcast ?? false,
      targetToken: typeof targetToken === 'string' ? targetToken : undefined,
    })
    const args: MeetingWamArgs = parsed.success
      ? parsed.data
      : {
          chatId: '',
          chatType: '',
          chatTitle: '',
          managerId: '',
          broadcast: false,
        }
    return {
      ...args,
      channelId: channelId ?? '',
      appearance: typeof appearance === 'string' ? appearance : 'light',
    }
  }, [
    appearance,
    broadcast,
    channelId,
    chatId,
    chatTitle,
    chatType,
    managerId,
    rootMessageId,
    targetToken,
  ])
}

/**
 * Posts into the current Desk group chat as the signed-in manager, using the
 * manager's own Channel permission (native function, no app server hop).
 */
export function useShareToGroup() {
  const wam = useMeetingWamData()
  const { call, loading } = useNativeFunction<unknown>({
    name: MEETING_FUNCTIONS.writeAsManager,
  })
  const available = wam.chatType === 'group' && !!wam.chatId && !!wam.managerId
  const share = useCallback(
    async (plainText: string) => {
      if (!available)
        throw new Error('그룹 채팅에서 /meeting 을 실행해야 공유할 수 있어요.')
      await call({
        channelId: wam.channelId,
        groupId: wam.chatId,
        rootMessageId: wam.rootMessageId,
        broadcast: wam.broadcast,
        dto: { plainText, managerId: wam.managerId },
      })
    },
    [available, call, wam]
  )
  return { share, available, loading, chatTitle: wam.chatTitle }
}
