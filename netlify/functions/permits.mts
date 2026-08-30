import { supabaseRequest } from './_shared/supabase.mts'

// GET /api/permits?lat=..&lng=..&radius=1609&days=180&workClass=Demolition
// Thin wrapper over the permits_near() SQL function so the browser never sees
// a Supabase key and the radius math stays in one place.

const MAX_RADIUS_M = 8046 // 5 miles
const MAX_DAYS = 1095

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function numberParam(params: URLSearchParams, key: string, fallback: number) {
  const raw = params.get(key)
  // An absent or blank param must fall back, not coerce: Number(null) and
  // Number('') are both 0, which is finite, so the old guard silently turned a
  // missing ?limit= into p_limit: 0 -> clamped to 1 -> one row per query.
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export default async (request: Request) => {
  const params = new URL(request.url).searchParams
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 })
  }
  if (lat < 29.5 || lat > 31 || lng < -98.5 || lng > -97) {
    return Response.json({ error: 'Coordinates are outside the Austin area' }, { status: 400 })
  }

  const radius = clamp(numberParam(params, 'radius', 1609), 100, MAX_RADIUS_M)
  const days = clamp(numberParam(params, 'days', 180), 1, MAX_DAYS)
  const limit = clamp(numberParam(params, 'limit', 500), 1, 2000)
  const minValuation = params.has('minValuation') ? numberParam(params, 'minValuation', 0) : null
  const workClasses = params.getAll('workClass').filter(Boolean)

  const since = new Date()
  since.setDate(since.getDate() - days)

  const rpcArgs = {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radius,
    p_since: since.toISOString().slice(0, 10),
    p_work_classes: workClasses.length ? workClasses : null,
    p_min_valuation: minValuation,
  }

  try {
    const [rowsResponse, countResponse] = await Promise.all([
      supabaseRequest('rpc/permits_near', {
        method: 'POST',
        body: JSON.stringify({ ...rpcArgs, p_limit: limit }),
      }),
      supabaseRequest('rpc/permits_near_count', {
        method: 'POST',
        body: JSON.stringify(rpcArgs),
      }),
    ])
    const permits = await rowsResponse.json()
    const total = await countResponse.json()
    return new Response(JSON.stringify({ permits, total, center: { lat, lng }, radius, days }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Permit lookup failed'
    console.error(`Permit lookup failed: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}

export const config = { path: '/api/permits' }
