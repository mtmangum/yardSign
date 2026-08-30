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

function importWindowStart(months: number) {
  const start = new Date()
  start.setMonth(start.getMonth() - months)
  return start.toISOString().slice(0, 19)
}

async function fetchPermitRows(months: number) {
  const allRows: AustinPermitRow[] = []
  const pageSize = 5000
  const since = importWindowStart(months)
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

export default async () => {
  const startedAt = new Date().toISOString()
  const months = Number(process.env.IMPORT_WINDOW_MONTHS ?? 18)
  try {
    const rows = (await fetchPermitRows(months)).filter((row) => row.permit_number)
    console.log(`Austin permit import fetched ${rows.length} permits from the last ${months} months`)

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
      }),
    })

    console.log(`Austin permit import completed: ${deduped.length} permits upserted`)
    return Response.json({ fetchedRows: rows.length, upsertedPermits: deduped.length })
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
