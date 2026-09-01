import { DEFAULT_RADIUS } from './geo'
import { KIND_ORDER, type PermitKind } from './permitKind'

export const DEFAULT_DAYS = 180

export type LocationSource = 'default' | 'address' | 'pin' | 'geo'

export interface SearchState {
  /** A human address (from the search box) - preferred in the URL. */
  address: string | null
  /** Raw coordinates - used for the locate button and dropped pins, which have
   *  no address. */
  ll: [number, number] | null
  radius: number
  days: number
  kinds: PermitKind[]
}

const isKind = (value: string): value is PermitKind => (KIND_ORDER as readonly string[]).includes(value)

export function parseSearchState(search: string): SearchState {
  const p = new URLSearchParams(search)

  let ll: [number, number] | null = null
  const raw = p.get('ll')
  if (raw) {
    const [lat, lng] = raw.split(',').map(Number)
    if (Number.isFinite(lat) && Number.isFinite(lng)) ll = [lat, lng]
  }

  const radius = Number(p.get('r'))
  const days = Number(p.get('d'))

  return {
    address: p.get('q'),
    ll,
    radius: Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_RADIUS,
    days: Number.isFinite(days) && days > 0 ? days : DEFAULT_DAYS,
    kinds: (p.get('k')?.split(',') ?? []).filter(isKind),
  }
}

/** Serialize to a query string, or "/" when everything is at its default (so the
 *  bare domain stays clean until the user does something). */
export function toSearchString(input: {
  source: LocationSource
  address: string | null
  ll: [number, number] | null
  radius: number
  days: number
  kinds: PermitKind[]
}): string {
  const p = new URLSearchParams()

  if (input.source === 'address' && input.address) {
    p.set('q', input.address)
  } else if ((input.source === 'pin' || input.source === 'geo') && input.ll) {
    p.set('ll', `${input.ll[0]},${input.ll[1]}`)
  }

  if (input.radius !== DEFAULT_RADIUS) p.set('r', String(input.radius))
  if (input.days !== DEFAULT_DAYS) p.set('d', String(input.days))
  if (input.kinds.length) p.set('k', input.kinds.join(','))

  const query = p.toString()
  return query ? `?${query}` : '/'
}
