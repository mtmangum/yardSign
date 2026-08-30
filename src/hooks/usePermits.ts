import { useEffect, useState } from 'react'
import { fetchPermits, type Permit, type PermitQuery } from '../api/permits'

interface PermitsState {
  permits: Permit[]
  total: number
  loading: boolean
  error: string | null
}

const EMPTY: PermitsState = { permits: [], total: 0, loading: false, error: null }

export function usePermits(query: PermitQuery | null): PermitsState {
  const [state, setState] = useState<PermitsState>(EMPTY)

  useEffect(() => {
    if (!query) {
      setState(EMPTY)
      return
    }

    const controller = new AbortController()
    setState((previous) => ({ ...previous, loading: true, error: null }))

    fetchPermits(query, controller.signal)
      .then(({ permits, total }) => setState({ permits, total, loading: false, error: null }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ ...EMPTY, error: error instanceof Error ? error.message : 'Something went wrong' })
      })

    return () => controller.abort()
  }, [query])

  return state
}
