export interface Permit {
  id: string
  permit_number: string
  permit_type_desc: string | null
  permit_class: string | null
  permit_class_mapped: string | null
  work_class: string | null
  description: string | null
  address: string | null
  issue_date: string | null
  applied_date: string | null
  status_current: string | null
  total_job_valuation: number | null
  housing_units: number | null
  latitude: number
  longitude: number
  source_url: string | null
  distance_m: number
}

import type { PermitKind } from '../lib/permitKind'

export interface PermitQuery {
  lat: number
  lng: number
  radius: number
  days: number
  limit?: number
  kinds?: PermitKind[]
}

export interface AddressMatch {
  label: string
  lat: number
  lng: number
}

export interface PermitResult {
  permits: Permit[]
  mapPermits: Permit[]
  /** Total in the radius before the marker cap - so the UI can say "500 of N". */
  total: number
}

export async function fetchPermits(query: PermitQuery, signal?: AbortSignal): Promise<PermitResult> {
  const params = new URLSearchParams({
    lat: String(query.lat),
    lng: String(query.lng),
    radius: String(query.radius),
    days: String(query.days),
  })
  if (query.limit) params.set('limit', String(query.limit))
  for (const kind of query.kinds ?? []) params.append('kind', kind)

  const response = await fetch(`/api/permits?${params}`, { signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `Permit lookup failed (${response.status})`)
  }
  const payload = (await response.json()) as { permits: Permit[]; mapPermits?: Permit[]; total?: number }
  return {
    permits: payload.permits,
    mapPermits: payload.mapPermits ?? payload.permits,
    total: payload.total ?? payload.permits.length,
  }
}

/** One permit by its city permit number, for opening a shared card. `near`
 *  fills distance_m relative to the current search centre. */
export async function fetchPermit(
  permitNumber: string,
  near?: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<Permit | null> {
  const params = new URLSearchParams({ number: permitNumber })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lng', String(near.lng))
  }
  const response = await fetch(`/api/permit?${params}`, { signal })
  if (!response.ok) return null
  const payload = (await response.json()) as { permit?: Permit }
  return payload.permit ?? null
}

export async function geocodeAddress(query: string, signal?: AbortSignal): Promise<AddressMatch[]> {
  const response = await fetch(`/api/geocode-address?q=${encodeURIComponent(query)}`, { signal })
  if (!response.ok) return []
  const payload = (await response.json()) as { matches: AddressMatch[] }
  return payload.matches
}
