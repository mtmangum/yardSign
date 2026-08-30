import { supabaseRequest } from './_shared/supabase.mts'

// City of Austin, Issued Construction Permits (Socrata).
// Ships 45 columns and no coordinates: geocoding is a separate pass.
const sourceUrl = 'https://data.austintexas.gov/resource/3syk-w9eu.json'
const sourceName = 'City of Austin Issued Construction Permits'

export interface AustinPermitRow {
  permit_number: string
  permittype?: string
  permit_type_desc?: string
  permit_class?: string
  permit_class_mapped?: string
  work_class?: string
  description?: string
  permit_location?: string
  original_address1?: string
  original_zip?: string
  council_district?: string
  tcad_id?: string
  project_id?: string
  masterpermitnum?: string
  applieddate?: string
  issue_date?: string
  status_current?: string
  statusdate?: string
  total_job_valuation?: string
  total_new_add_sqft?: string
  housing_units?: string
  number_of_floors?: string
  link?: { url?: string }
}

export const chunks = <T,>(values: T[], size = 500) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size))

export const toNumber = (value?: string) => {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const toInteger = (value?: string) => {
  const parsed = toNumber(value)
  return parsed === null ? null : Math.trunc(parsed)
}

export const toDate = (value?: string) => (value ? value.slice(0, 10) : null)

// One Socrata row -> one `permits` table record. Pure and exported so the field
// mapping can be tested without standing up Supabase. `city_code` is hard-wired
// to 'AUS' because this importer only ever pulls the City of Austin feed.
export function toPermitRecord(row: AustinPermitRow, sourceUpdatedAt: string) {
  return {
    city_code: 'AUS',
    permit_number: row.permit_number,
    project_id: row.project_id ?? null,
    master_permit_number: row.masterpermitnum ?? null,
    tcad_id: row.tcad_id ?? null,
    permit_type: row.permittype ?? null,
    permit_type_desc: row.permit_type_desc ?? null,
    permit_class: row.permit_class ?? null,
    permit_class_mapped: row.permit_class_mapped ?? null,
    work_class: row.work_class ?? null,
    description: row.description ?? null,
    address: row.original_address1 ?? row.permit_location ?? null,
    zip_code: row.original_zip ?? null,
    council_district: toInteger(row.council_district),
    applied_date: toDate(row.applieddate),
    issue_date: toDate(row.issue_date),
    status_current: row.status_current ?? null,
    status_date: toDate(row.statusdate),
    total_job_valuation: toNumber(row.total_job_valuation),
    total_new_add_sqft: toNumber(row.total_new_add_sqft),
    housing_units: toInteger(row.housing_units),
    number_of_floors: toInteger(row.number_of_floors),
    source_url: row.link?.url ?? null,
    source_payload: row,
    source_updated_at: sourceUpdatedAt,
  }
}

// Collapse repeated permit numbers, keeping the last occurrence. A single
// upsert statement cannot touch the same conflict target twice, and the Austin
// feed can repeat a permit number within one pull.
export function dedupeByPermitNumber(rows: AustinPermitRow[]) {
  const latestByPermit = new Map<string, AustinPermitRow>()
  for (const row of rows) latestByPermit.set(row.permit_number, row)
  return [...latestByPermit.values()]
}

// Re-pull this many days before the last successful run, so permits the city
// publishes a few days late are still picked up. Override with IMPORT_OVERLAP_DAYS.
const DEFAULT_OVERLAP_DAYS = 14

// A Socrata floating-timestamp literal: 'YYYY-MM-DDTHH:MM:SS', no zone. These
// compare correctly as plain strings because the format is fixed-width.
const toSocrataTs = (d: Date) => d.toISOString().slice(0, 19)

export interface WatermarkRead {
  watermark: string | null
  errored: boolean
}

// Most recent successful import, used as the incremental cursor.
export async function lastSuccessfulImport(): Promise<WatermarkRead> {
  try {
    const response = await supabaseRequest(
      `data_sources?select=retrieved_at&status=eq.success` +
        `&source_name=eq.${encodeURIComponent(sourceName)}` +
        `&order=retrieved_at.desc&limit=1`,
    )
    const rows = (await response.json()) as Array<{ retrieved_at: string }>
    return { watermark: rows[0]?.retrieved_at ?? null, errored: false }
  } catch (error) {
    console.warn(`Import watermark read failed: ${error instanceof Error ? error.message : error}`)
    return { watermark: null, errored: true }
  }
}

// Decide how far back to pull, in priority order:
//   1. ?since=YYYY-MM-DD          -> exactly that date
//   2. ?months=N                  -> now - N months (manual backfill knob)
//   3. ?full=1                    -> now - maxMonths (the configured full window)
//   4. no prior successful run    -> now - maxMonths (first run does the backfill)
//   5. watermark read errored     -> now - 45d  (safe slice, never the full window)
//   6. otherwise                  -> last success - overlap, clamped so a long
//                                    cron outage still cannot exceed maxMonths
export function resolveWindow(opts: {
  now: Date
  watermark: string | null
  watermarkErrored: boolean
  overlapDays: number
  maxMonths: number
  explicitSince?: string | null
  explicitMonths?: number | null
  full?: boolean
}): { since: string; mode: string } {
  const { now, watermark, watermarkErrored, overlapDays, maxMonths, explicitSince, explicitMonths, full } = opts
  // All arithmetic in UTC so the result does not depend on the runner's zone.
  const shifted = (from: Date, mutate: (d: Date) => void) => {
    const copy = new Date(from)
    mutate(copy)
    return copy
  }
  const monthsAgo = (m: number) => shifted(now, (d) => d.setUTCMonth(d.getUTCMonth() - m))
  const daysAgo = (n: number) => shifted(now, (d) => d.setUTCDate(d.getUTCDate() - n))
  const maxStart = toSocrataTs(monthsAgo(maxMonths))

  if (explicitSince) return { since: `${explicitSince.slice(0, 10)}T00:00:00`, mode: 'explicit-since' }
  if (explicitMonths && explicitMonths > 0) {
    return { since: toSocrataTs(monthsAgo(explicitMonths)), mode: `explicit-months:${explicitMonths}` }
  }
  if (full) return { since: maxStart, mode: 'full' }
  if (watermarkErrored) return { since: toSocrataTs(daysAgo(45)), mode: 'watermark-error-fallback' }
  if (!watermark) return { since: maxStart, mode: 'first-run' }

  const parsed = new Date(watermark)
  if (Number.isNaN(parsed.getTime())) return { since: toSocrataTs(daysAgo(45)), mode: 'bad-watermark-fallback' }

  const incremental = toSocrataTs(shifted(parsed, (d) => d.setDate(d.getDate() - overlapDays)))
  return incremental > maxStart
    ? { since: incremental, mode: 'incremental' }
    : { since: maxStart, mode: 'incremental-clamped' }
}

async function fetchPermitRows(since: string) {
  const allRows: AustinPermitRow[] = []
  const pageSize = 5000
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      $limit: String(pageSize),
      $offset: String(offset),
      $order: 'issue_date DESC',
      $where: `issue_date > '${since}'`,
    })
    const response = await fetch(`${sourceUrl}?${query}`)
    if (!response.ok) throw new Error(`Austin permit request failed (${response.status})`)
    const page = (await response.json()) as AustinPermitRow[]
    allRows.push(...page)
    if (page.length < pageSize) break
  }
  return allRows
}

export default async (request: Request) => {
  const startedAt = new Date().toISOString()
  const maxMonths = Number(process.env.IMPORT_WINDOW_MONTHS ?? 18)
  const overlapDays = Number(process.env.IMPORT_OVERLAP_DAYS ?? DEFAULT_OVERLAP_DAYS)
  const params = new URL(request.url).searchParams

  try {
    const { watermark, errored } = await lastSuccessfulImport()
    const { since, mode } = resolveWindow({
      now: new Date(startedAt),
      watermark,
      watermarkErrored: errored,
      overlapDays: Number.isFinite(overlapDays) ? overlapDays : DEFAULT_OVERLAP_DAYS,
      maxMonths: Number.isFinite(maxMonths) ? maxMonths : 18,
      explicitSince: params.get('since'),
      explicitMonths: Number(params.get('months')) || null,
      full: params.get('full') === '1',
    })

    const rows = (await fetchPermitRows(since)).filter((row) => row.permit_number)
    console.log(`Austin permit import: mode=${mode} since=${since} fetched=${rows.length}`)

    const deduped = dedupeByPermitNumber(rows)

    for (const batch of chunks(deduped)) {
      await supabaseRequest('permits?on_conflict=city_code,permit_number', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch.map((row) => toPermitRecord(row, startedAt))),
      })
    }

    await supabaseRequest('data_sources', {
      method: 'POST',
      body: JSON.stringify({
        source_name: sourceName,
        source_url: sourceUrl,
        retrieved_at: startedAt,
        row_count: deduped.length,
        status: 'success',
        message: `mode=${mode} since=${since}`,
      }),
    })

    console.log(`Austin permit import completed: ${deduped.length} permits upserted (mode=${mode})`)
    return Response.json({ mode, since, fetchedRows: rows.length, upsertedPermits: deduped.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    console.error(`Austin permit import failed: ${message}`)
    await supabaseRequest('data_sources', {
      method: 'POST',
      body: JSON.stringify({
        source_name: sourceName, source_url: sourceUrl, retrieved_at: startedAt,
        status: 'failed', message,
      }),
    }).catch(() => undefined)
    return Response.json({ error: message }, { status: 500 })
  }
}

// Austin refreshes the permit feed daily; 07:00 UTC is ~1am local.
export const config = { schedule: '0 7 * * *' }
