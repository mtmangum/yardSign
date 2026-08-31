import { useEffect, useState } from 'react'
import { fetchPermits, type Permit, type PermitQuery } from '../api/permits'

interface PermitsState {
  permits: Permit[]
  mapPermits: Permit[]
  total: number
  loading: boolean
  error: string | null
}

const EMPTY: PermitsState = { permits: [], mapPermits: [], total: 0, loading: false, error: null }

export function usePermits(query: PermitQuery | null): PermitsState {
  const [state, setState] = useState<PermitsState>(EMPTY)

  useEffect(() => {
    if (!query) {
      setState(EMPTY)
      return
    }

    const controller = new AbortController()
    // Keep the list readable during a refresh, but clear stale map points so a
    // radius change cannot look like it had no effect while the new spatial
    // sample is in flight.
    setState((previous) => ({ ...previous, mapPermits: [], loading: true, error: null }))

    fetchPermits(query, controller.signal)
      .then(({ permits, mapPermits, total }) =>
        setState({ permits, mapPermits, total, loading: false, error: null }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ ...EMPTY, error: error instanceof Error ? error.message : 'Something went wrong' })
      })

    return () => controller.abort()
  }, [query])

  return state
}
