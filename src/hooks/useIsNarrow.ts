import { useEffect, useState } from 'react'

const QUERY = '(max-width: 860px)'

/** True on the narrow (mobile) layout, reactive to resize / orientation. */
export function useIsNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return narrow
}
