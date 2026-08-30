import { supabaseRequest } from './_shared/supabase.mts'

// The Austin permit feed has no coordinates, so every row needs geocoding
// before it can appear in a radius search. Ported from ScoreScout, with a
// geocode_status column added so permanent no-matches stop being retried.

interface GeocodeCandidate {
  id: string
  route_number: number
  permit_number: string
  address: string
  zip_code: string | null
}

interface CensusMatch {
  coordinates: { x: number; y: number }
  matchedAddress: string
}

interface CensusResponse {
  result: { addressMatches: CensusMatch[] }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function geocode(address: string) {
  const query = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' })
  const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${query}`)
  if (!response.ok) throw new Error(`Census geocoder request failed (${response.status})`)
  const payload = (await response.json()) as CensusResponse
  return payload.result.addressMatches[0] ?? null
}

export default async (request: Request) => {
  const secret = process.env.IMPORT_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const requestedLimit = Number(requestUrl.searchParams.get('limit') ?? 100)
  const limit = Math.max(1, Math.min(200, Number.isFinite(requestedLimit) ? requestedLimit : 100))
  const requestedAfter = Number(requestUrl.searchParams.get('after') ?? 0)
  const after = Math.max(0, Number.isFinite(requestedAfter) ? requestedAfter : 0)

  const response = await supabaseRequest(
    `permits_needing_geocode?route_number=gt.${after}&order=route_number.asc&limit=${limit}`,
  )
  const candidates = (await response.json()) as GeocodeCandidate[]

  let matched = 0
  let noMatch = 0
  let failed = 0
  const attemptedAt = new Date().toISOString()

  for (const candidate of candidates) {
    const fullAddress = `${candidate.address}, Austin, TX${candidate.zip_code ? ` ${candidate.zip_code}` : ''}`
    let match: CensusMatch | null = null
    let errored = false
    try {
      match = await geocode(fullAddress)
    } catch (error) {
      errored = true
      console.error(`Census geocode failed for ${candidate.permit_number}: ${error instanceof Error ? error.message : error}`)
    }

    // 'failed' is a transient error and can be reset to 'pending' to retry.
    // 'no_match' is the address genuinely not being in the Census file, which
    // is common for brand new subdivisions, and leaves the queue for good.
    const patch = match
      ? {
          latitude: match.coordinates.y,
          longitude: match.coordinates.x,
          geocode_status: 'matched',
          geocode_attempted_at: attemptedAt,
        }
      : {
          geocode_status: errored ? 'failed' : 'no_match',
          geocode_attempted_at: attemptedAt,
        }

    await supabaseRequest(`permits?id=eq.${candidate.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    })

    if (match) matched += 1
    else if (errored) failed += 1
    else noMatch += 1

    await sleep(120)
  }

  const lastRouteNumber = candidates.at(-1)?.route_number ?? after
  console.log(JSON.stringify({ attempted: candidates.length, matched, noMatch, failed, after, lastRouteNumber }))
  return Response.json({ attempted: candidates.length, matched, noMatch, failed, after, lastRouteNumber })
}

export const config = { path: '/api/geocode-census' }
