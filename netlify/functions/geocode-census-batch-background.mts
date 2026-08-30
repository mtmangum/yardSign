import { supabaseRequest } from './_shared/supabase.mts'

// Batch counterpart to geocode-census-background. The Census geocoder has an
// address*batch* endpoint that accepts a CSV of up to 10,000 rows per upload
// and returns coordinates for all of them in one request. For the initial
// backfill of ~85k permits this turns a 7-10 hour sequential crawl into minutes.
// The one-at-a-time function is kept for the small daily incremental.
//
//   POST https://geocoding.geo.census.gov/geocoder/locations/addressbatch
//   multipart/form-data: addressFile=<csv>, benchmark=Public_AR_Current
//   csv columns (no header): Unique ID, Street, City, State, ZIP
//   response csv (no header): Unique ID, Input, Match|No_Match|Tie, Match Type,
//                             Matched Address, "lon,lat", TIGER ID, Side

const BATCH_ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'
const BENCHMARK = 'Public_AR_Current'

// Census caps a batch file at 10,000 rows. 5,000 keeps each upload well inside
// that and inside the geocoder's informal timeout.
const MAX_BATCH = 5000
const UPSERT_CHUNK = 500
// A large batch can take a few minutes to come back.
const BATCH_TIMEOUT_MS = 15 * 60 * 1000

interface GeocodeCandidate {
  id: string
  permit_number: string
  address: string | null
  zip_code: string | null
}

type BatchResult = { lat: number; lon: number } | 'no_match' | 'tie'

const chunk = <T,>(values: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size))

const csvField = (value: string | null) => `"${String(value ?? '').replace(/"/g, '""')}"`

export function buildAddressCsv(candidates: GeocodeCandidate[]): string {
  return candidates
    .map((c) => [csvField(c.id), csvField(c.address), csvField('Austin'), csvField('TX'), csvField(c.zip_code)].join(','))
    .join('\n')
}

// One CSV line -> fields. Handles quoted fields, embedded commas, and "" escapes,
// which the Census response uses for the input/matched address and the "lon,lat"
// coordinate pair.
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1 } else { inQuotes = false }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return fields
}

export function parseBatchResponse(text: string): Map<string, BatchResult> {
  const results = new Map<string, BatchResult>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cols = parseCsvLine(line)
    const id = cols[0]
    const status = cols[2]
    if (!id) continue
    if (status === 'Match') {
      const [lon, lat] = (cols[5] ?? '').split(',').map(Number)
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        results.set(id, { lat, lon })
        continue
      }
      results.set(id, 'no_match')
    } else if (status === 'Tie') {
      results.set(id, 'tie')
    } else {
      results.set(id, 'no_match')
    }
  }
  return results
}

// Query `permits` directly rather than the permits_needing_geocode view: the
// view's row_number() window function runs over every pending row on each call
// and times out at backfill scale. This hits the partial index on
// geocode_status = 'pending' instead.
//
// No ORDER BY: any pending row is as good as any other to geocode, and sorting
// ~70k filtered rows by issue_date on each call was itself intermittently
// tripping the Postgres statement timeout. No cursor is needed either - a
// geocoded row flips out of 'pending' and off the end of this queue.
async function fetchCandidates(limit: number): Promise<GeocodeCandidate[]> {
  const response = await supabaseRequest(
    `permits?select=id,permit_number,address,zip_code&geocode_status=eq.pending&limit=${limit}`,
  )
  return (await response.json()) as GeocodeCandidate[]
}

async function geocodeBatch(candidates: GeocodeCandidate[]): Promise<Map<string, BatchResult>> {
  const form = new FormData()
  form.append('benchmark', BENCHMARK)
  form.append('addressFile', new Blob([buildAddressCsv(candidates)], { type: 'text/csv' }), 'addresses.csv')

  const response = await fetch(BATCH_ENDPOINT, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Census batch request failed (${response.status})`)
  return parseBatchResponse(await response.text())
}

const isBlank = (value: string | null) => (value ?? '').trim() === ''

async function writeResults(candidates: GeocodeCandidate[], results: Map<string, BatchResult>, attemptedAt: string) {
  let matched = 0
  let noMatch = 0
  let tie = 0
  let blank = 0
  let failed = 0

  // Every fetched candidate must get a terminal status, or it stays in the
  // queue and the next pass fetches it again. A row missing from the Census
  // response is marked 'failed' (transient - resettable to 'pending' to retry),
  // never left 'pending'.
  // Every record carries the same key set - PostgREST rejects a bulk upsert
  // whose objects differ in shape ("All object keys must match") - so
  // latitude/longitude are always present, null for anything that did not match.
  const records = candidates.map((c) => {
    const base = {
      city_code: 'AUS',
      permit_number: c.permit_number,
      geocode_attempted_at: attemptedAt,
      latitude: null as number | null,
      longitude: null as number | null,
      geocode_status: 'no_match',
    }
    if (isBlank(c.address)) {
      blank += 1
      return base
    }
    const result = results.get(c.id)
    if (result && typeof result === 'object') {
      matched += 1
      return { ...base, latitude: result.lat, longitude: result.lon, geocode_status: 'matched' }
    }
    if (result === 'tie') {
      tie += 1
      return base
    }
    if (result === 'no_match') {
      noMatch += 1
      return base
    }
    failed += 1
    return { ...base, geocode_status: 'failed' }
  })

  // merge-duplicates upsert on the unique (city_code, permit_number): updates
  // only the columns sent, leaving source_payload and the rest untouched. Same
  // technique as the importer.
  for (const batch of chunk(records, UPSERT_CHUNK)) {
    await supabaseRequest('permits?on_conflict=city_code,permit_number', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    })
  }

  return { matched, noMatch, tie, blank, failed }
}

export async function runBatch(limit: number) {
  const candidates = await fetchCandidates(Math.max(1, Math.min(MAX_BATCH, limit)))
  if (candidates.length === 0) {
    return { attempted: 0, matched: 0, noMatch: 0, tie: 0, blank: 0, failed: 0, done: true }
  }
  const geocodable = candidates.filter((c) => !isBlank(c.address))
  const results = geocodable.length > 0 ? await geocodeBatch(geocodable) : new Map<string, BatchResult>()
  const counts = await writeResults(candidates, results, new Date().toISOString())
  return { attempted: candidates.length, ...counts, done: false }
}

export default async (request: Request) => {
  const secret = process.env.IMPORT_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const limit = Number(params.get('limit') ?? MAX_BATCH)

  try {
    const summary = await runBatch(Number.isFinite(limit) ? limit : MAX_BATCH)
    console.log(JSON.stringify(summary))
    return Response.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Batch geocode failed'
    console.error(`Batch geocode failed: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}

export const config = { path: '/api/geocode-census-batch' }
