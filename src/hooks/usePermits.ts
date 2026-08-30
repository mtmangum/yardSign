import { useEffect, useState } from 'react'
import { fetchPermits, type Permit, type PermitQuery } from '../api/permits'

interface PermitsState {
  permits: Permit[]
  loading: boolean
  error: string | null
}

export function usePermits(query: PermitQuery | null): PermitsState {
  const [state, setState] = useState<PermitsState>({ permits: [], loading: false, error: null })

  useEffect(() => {
    if (!query) {
      setState({ permits: [], loading: false, error: null })
      return
    }

    const controller = new AbortController()
    setState((previous) => ({ ...previous, loading: true, error: null }))

    fetchPermits(query, controller.signal)
      .then((permits) => setState({ permits, loading: false, error: null }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ permits: [], loading: false, error: error instanceof Error ? error.message : 'Something went wrong' })
      })

    return () => controller.abort()
  }, [query])

  return state
}
