import { supabaseRequest } from './_shared/supabase.mts'

// GET /api/permit?number=2025-114646+PP[&lat=..&lng=..]
// One permit by its city permit number, for opening a shared card. lat/lng are
// optional and only used to fill distance_m relative to the current search.

const FIELDS = [
  'id', 'permit_number', 'permit_type_desc', 'permit_class', 'permit_class_mapped',
  'work_class', 'description', 'address', 'issue_date', 'applied_date',
  'status_current', 'total_job_valuation', 'housing_units', 'latitude', 'longitude',
  'source_url',
].join(',')

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

const haversineMeters = (aLat: number, aLng: number, bLat: number, bLng: number) =>
  2 * 6371000 * Math.asin(Math.sqrt(
    Math.sin(toRadians(bLat - aLat) / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) *
    Math.sin(toRadians(bLng - aLng) / 2) ** 2,
  ))

export default async (request: Request) => {
  const params = new URL(request.url).searchParams
  const number = params.get('number')?.trim()
  if (!number) return Response.json({ error: 'number is required' }, { status: 400 })

  try {
    const response = await supabaseRequest(
      `permits?select=${FIELDS}` +
        `&city_code=eq.AUS&permit_number=eq.${encodeURIComponent(number)}` +
        `&latitude=not.is.null&limit=1`,
    )
    const rows = (await response.json()) as Array<Record<string, unknown> & { latitude: number; longitude: number }>
    const permit = rows[0]
    if (!permit) return Response.json({ error: 'Permit not found or not yet on the map' }, { status: 404 })

    const lat = Number(params.get('lat'))
    const lng = Number(params.get('lng'))
    permit.distance_m = Number.isFinite(lat) && Number.isFinite(lng)
      ? haversineMeters(lat, lng, permit.latitude, permit.longitude)
      : 0

    return new Response(JSON.stringify({ permit }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400, durable',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Permit lookup failed'
    console.error(`Permit lookup failed: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}

export const config = { path: '/api/permit' }
