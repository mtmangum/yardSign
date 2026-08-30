import { describe, expect, it } from 'vitest'
import {
  type AustinPermitRow,
  chunks,
  dedupeByPermitNumber,
  toDate,
  toInteger,
  toNumber,
  toPermitRecord,
} from '../import-austin-permits.mts'

describe('toNumber', () => {
  it('parses numeric strings', () => {
    expect(toNumber('1234.56')).toBe(1234.56)
    expect(toNumber('0')).toBe(0)
    expect(toNumber('-5')).toBe(-5)
  })

  it('returns null for empty, undefined, or non-numeric input', () => {
    expect(toNumber('')).toBeNull()
    expect(toNumber(undefined)).toBeNull()
    expect(toNumber('N/A')).toBeNull()
    expect(toNumber('$100,000')).toBeNull()
  })
})

describe('toInteger', () => {
  it('truncates toward zero', () => {
    expect(toInteger('3.9')).toBe(3)
    expect(toInteger('-3.9')).toBe(-3)
  })

  it('passes null through from toNumber', () => {
    expect(toInteger('')).toBeNull()
    expect(toInteger('two')).toBeNull()
  })
})

describe('toDate', () => {
  it('keeps only the date portion of a Socrata timestamp', () => {
    expect(toDate('2025-06-01T00:00:00.000')).toBe('2025-06-01')
    expect(toDate('2025-06-01')).toBe('2025-06-01')
  })

  it('returns null for missing input', () => {
    expect(toDate(undefined)).toBeNull()
    expect(toDate('')).toBeNull()
  })
})

describe('chunks', () => {
  it('splits into batches of the given size', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns an empty array for empty input', () => {
    expect(chunks([], 500)).toEqual([])
  })

  it('returns a single batch when input is smaller than the size', () => {
    expect(chunks([1, 2, 3], 500)).toEqual([[1, 2, 3]])
  })
})

describe('dedupeByPermitNumber', () => {
  it('keeps the last occurrence of a repeated permit number', () => {
    const rows: AustinPermitRow[] = [
      { permit_number: 'A', status_current: 'Pending' },
      { permit_number: 'B', status_current: 'Active' },
      { permit_number: 'A', status_current: 'Active' },
    ]
    const deduped = dedupeByPermitNumber(rows)
    expect(deduped).toHaveLength(2)
    expect(deduped.find((r) => r.permit_number === 'A')?.status_current).toBe('Active')
  })

  it('leaves a list with no duplicates untouched', () => {
    const rows: AustinPermitRow[] = [{ permit_number: 'A' }, { permit_number: 'B' }]
    expect(dedupeByPermitNumber(rows)).toHaveLength(2)
  })
})

describe('toPermitRecord', () => {
  const fullRow: AustinPermitRow = {
    permit_number: '2025-000123 BP',
    permittype: 'BP',
    permit_type_desc: 'Building Permit',
    permit_class: 'R- 101 Single Family Houses',
    permit_class_mapped: 'Residential',
    work_class: 'New',
    description: 'New single family residence',
    permit_location: '200 W 2ND ST',
    original_address1: '100 CONGRESS AVE',
    original_zip: '78701',
    council_district: '9',
    tcad_id: '0123456789',
    project_id: 'PR-1',
    masterpermitnum: 'MP-1',
    applieddate: '2025-05-01T00:00:00.000',
    issue_date: '2025-06-01T00:00:00.000',
    status_current: 'Active',
    statusdate: '2025-06-02T00:00:00.000',
    total_job_valuation: '350000',
    total_new_add_sqft: '2400',
    housing_units: '1',
    number_of_floors: '2',
    link: { url: 'https://example.test/permit/123' },
  }

  it('maps every column and coerces numbers and dates', () => {
    expect(toPermitRecord(fullRow, '2026-08-30T07:00:00.000Z')).toEqual({
      city_code: 'AUS',
      permit_number: '2025-000123 BP',
      project_id: 'PR-1',
      master_permit_number: 'MP-1',
      tcad_id: '0123456789',
      permit_type: 'BP',
      permit_type_desc: 'Building Permit',
      permit_class: 'R- 101 Single Family Houses',
      permit_class_mapped: 'Residential',
      work_class: 'New',
      description: 'New single family residence',
      address: '100 CONGRESS AVE',
      zip_code: '78701',
      council_district: 9,
      applied_date: '2025-05-01',
      issue_date: '2025-06-01',
      status_current: 'Active',
      status_date: '2025-06-02',
      total_job_valuation: 350000,
      total_new_add_sqft: 2400,
      housing_units: 1,
      number_of_floors: 2,
      source_url: 'https://example.test/permit/123',
      source_payload: fullRow,
      source_updated_at: '2026-08-30T07:00:00.000Z',
    })
  })

  it('falls back to permit_location when original_address1 is absent', () => {
    const { original_address1: _omit, ...noAddress } = fullRow
    expect(toPermitRecord(noAddress, 'now').address).toBe('200 W 2ND ST')
  })

  it('nulls every optional field when the row is nearly empty', () => {
    const record = toPermitRecord({ permit_number: 'X' }, 'now')
    expect(record).toMatchObject({
      city_code: 'AUS',
      permit_number: 'X',
      project_id: null,
      tcad_id: null,
      work_class: null,
      address: null,
      council_district: null,
      issue_date: null,
      total_job_valuation: null,
      housing_units: null,
      source_url: null,
    })
  })

  it('keeps the raw row in source_payload so a re-import is never needed to re-derive a column', () => {
    const record = toPermitRecord(fullRow, 'now')
    expect(record.source_payload).toBe(fullRow)
  })
})
