// GET /api/geocode-address?q=1100+Congress+Ave
// Proxies the Census one-line geocoder so the browser is not exposed to the
// Census service's CORS behavior, and so results can be cached at the edge.

interface CensusMatch {
  coordinates: { x: number; y: number }
  matchedAddress: string
}

interface CensusResponse {
  result: { addressMatches: CensusMatch[] }
}

export default async (request: Request) => {
  const raw = new URL(request.url).searchParams.get('q')?.trim()
  if (!raw || raw.length < 4) {
    return Response.json({ error: 'A longer address is required' }, { status: 400 })
  }

  // Austin-scope the query so a bare street number does not match Ohio.
  const address = /\b(tx|texas)\b/i.test(raw) ? raw : `${raw}, Austin, TX`

  try {
    const query = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' })
    const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${query}`)
    if (!response.ok) throw new Error(`Census geocoder request failed (${response.status})`)
    const payload = (await response.json()) as CensusResponse

    const matches = payload.result.addressMatches.slice(0, 5).map((match) => ({
      label: match.matchedAddress,
      lat: match.coordinates.y,
      lng: match.coordinates.x,
    }))

    return new Response(JSON.stringify({ matches }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Geocode failed'
    console.error(`Address geocode failed: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}

export const config = { path: '/api/geocode-address' }
