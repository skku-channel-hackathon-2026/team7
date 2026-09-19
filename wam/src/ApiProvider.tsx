import { useMemo, type ReactNode } from 'react'
import { ApiContext, createApi } from './api'

export function ApiProvider({
  appId,
  children,
}: {
  appId: string
  children: ReactNode
}) {
  const api = useMemo(() => createApi(appId), [appId])
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}
