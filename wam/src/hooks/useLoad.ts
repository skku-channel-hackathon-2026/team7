import { useCallback, useEffect, useRef, useState } from 'react'

export interface LoadState<T> {
  data: T | null
  error: string
  loading: boolean
  reload: () => Promise<void>
}

export function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '알 수 없는 오류가 발생했어요.'
}

/**
 * Loads data when `key` changes and optionally polls. Polling failures keep the
 * last good data on screen and only surface the error text.
 */
export function useLoad<T>(
  fetcher: () => Promise<T>,
  key: string,
  intervalMs?: number
): LoadState<T> {
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const mounted = useRef(true)
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const next = await fetcherRef.current()
      if (!mounted.current) return
      setData(next)
      setError('')
    } catch (e) {
      if (mounted.current) setError(errorText(e))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    void reload()
    const timer = intervalMs ? setInterval(() => void reload(), intervalMs) : 0
    return () => {
      mounted.current = false
      if (timer) clearInterval(timer)
    }
  }, [key, intervalMs, reload])

  return { data, error, loading, reload }
}

/** Runs an async action and exposes busy/error state for buttons. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(
    async <R>(action: () => Promise<R>): Promise<R | undefined> => {
      setBusy(true)
      setError('')
      try {
        return await action()
      } catch (e) {
        if (mounted.current) setError(errorText(e))
        return undefined
      } finally {
        if (mounted.current) setBusy(false)
      }
    },
    []
  )
  return { busy, error, run, clearError: () => setError('') }
}
