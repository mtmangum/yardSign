import { fromAddressSlug, toAddressSlug } from './addressSlug'
import { DEFAULT_RADIUS } from './geo'
import { KIND_ORDER, type PermitKind } from './permitKind'

export const DEFAULT_DAYS = 180

export type LocationSource = 'default' | 'address' | 'pin' | 'geo'

export interface SearchState {
  /** A human address - lives in the path as a slug. */
  address: string | null
  /** Raw coordinates - used for the locate button and dropped pins, which have
   *  no address. Lives in ?ll=. */
  ll: [number, number] | null
  radius: number
  days: number
  kinds: PermitKind[]
  /** City permit number of the open card, if any. */
  permit: string | null
}

const isKind = (value: string): value is PermitKind => (KIND_ORDER as readonly string[]).includes(value)

export function parseUrl(pathname: string, search: string): SearchState {
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
    // Path slug wins; ?q= is still read so older shared links keep working.
    address: fromAddressSlug(pathname) || p.get('q'),
    ll,
    radius: Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_RADIUS,
    days: Number.isFinite(days) && days > 0 ? days : DEFAULT_DAYS,
    kinds: (p.get('k')?.split(',') ?? []).filter(isKind),
    permit: p.get('p'),
  }
}

/** Build the shareable URL: an address search becomes a path slug, a pin/GPS
 *  search a ?ll=, the default view the bare "/". Radius / window / filters /
 *  open-card ride along as query params. */
export function toUrl(input: {
  source: LocationSource
  address: string | null
  ll: [number, number] | null
  radius: number
  days: number
  kinds: PermitKind[]
  permit?: string | null
}): string {
  const p = new URLSearchParams()

  let path = '/'
  if (input.source === 'address' && input.address) {
    path = `/${toAddressSlug(input.address)}`
  } else if ((input.source === 'pin' || input.source === 'geo') && input.ll) {
    p.set('ll', `${input.ll[0]},${input.ll[1]}`)
  }

  if (input.radius !== DEFAULT_RADIUS) p.set('r', String(input.radius))
  if (input.days !== DEFAULT_DAYS) p.set('d', String(input.days))
  if (input.kinds.length) p.set('k', input.kinds.join(','))
  if (input.permit) p.set('p', input.permit)

  const query = p.toString()
  return query ? `${path}?${query}` : path
}
