import { describe, expect, it } from 'vitest'
import type { Permit } from '../api/permits'
import { permitKind } from './PermitList'

const permit = (overrides: Partial<Permit> = {}): Permit => ({
  id: 'p1',
  permit_number: '2025-000001 BP',
  permit_type_desc: 'Building Permit',
  permit_class_mapped: 'Residential',
  work_class: null,
  description: null,
  address: '100 CONGRESS AVE',
  issue_date: '2025-06-01',
  applied_date: '2025-05-01',
  status_current: 'Active',
  total_job_valuation: 100000,
  housing_units: 1,
  latitude: 30.26,
  longitude: -97.74,
  source_url: null,
  distance_m: 100,
  ...overrides,
})

describe('permitKind', () => {
  // Every distinct work_class value in the trailing-18-month feed, checked
  // 2026-08-30, with the bucket a neighbor would expect it in.
  const cases: Array<[string, ReturnType<typeof permitKind>]> = [
    ['New', 'new'],
    ['Shell', 'new'],
    ['Homebuilder Loop', 'new'],
    ['Demolition', 'demolition'],
    ['Demo', 'demolition'],
    ['Remodel', 'remodel'],
    ['Addition', 'remodel'],
    ['Addition and Remodel', 'remodel'],
    ['Remodel Mobile Home', 'remodel'],
    ['Repair', 'remodel'],
    ['Interior Demo Non-Structural', 'remodel'],
    ['Change Out', 'other'],
    ['Upgrade', 'other'],
    ['Irrigation', 'other'],
    ['Wall', 'other'],
    ['Auxiliary Power', 'other'],
    ['Auxiliary Water', 'other'],
    ['Special Inspections Program', 'other'],
    ['Temporary  Loop', 'other'], // the feed really does ship a double space
    ['Fireline', 'other'],
    ['Freestanding', 'other'],
    ['Projecting', 'other'],
    ['Awning', 'other'],
    ['Roof', 'other'],
    ['Relocation', 'other'],
    ['Modification', 'other'],
    ['Plumbing Service Line', 'other'],
    ['Plumbing Utility Connection', 'other'],
    ['Grease Interceptor (GI) replacement', 'other'],
    ['Cut Over/Tank Abandonment', 'other'],
  ]

  it.each(cases)('classifies %j as %s', (workClass, expected) => {
    expect(permitKind(permit({ work_class: workClass }))).toBe(expected)
  })

  it('keeps interior, non-structural demo out of the demolition bucket', () => {
    expect(permitKind(permit({ work_class: 'Interior Demo Non-Structural' }))).toBe('remodel')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(permitKind(permit({ work_class: '  DEMOLITION  ' }))).toBe('demolition')
    expect(permitKind(permit({ work_class: 'addition\tand\tremodel' }))).toBe('remodel')
  })

  it('falls back to other for a missing or empty work_class', () => {
    expect(permitKind(permit({ work_class: null }))).toBe('other')
    expect(permitKind(permit({ work_class: '   ' }))).toBe('other')
  })

  it('does not treat a "new" substring inside another word as new construction', () => {
    // The old implementation returned "new" for anything containing "new".
    expect(permitKind(permit({ work_class: 'Renewal' }))).toBe('other')
  })

  describe('unknown work_class values fall through to substring heuristics', () => {
    it('routes an unrecognised demolition variant to demolition', () => {
      expect(permitKind(permit({ work_class: 'Total Demolition of Structure' }))).toBe('demolition')
    })

    it('still keeps an unrecognised interior-demo variant in remodel', () => {
      expect(permitKind(permit({ work_class: 'Interior Demo - Suite 200' }))).toBe('remodel')
    })

    it('routes an unrecognised renovation variant to remodel', () => {
      expect(permitKind(permit({ work_class: 'Full Gut Renovation' }))).toBe('remodel')
    })

    it('routes an unrecognised new-construction variant to new', () => {
      expect(permitKind(permit({ work_class: 'New Multifamily Building' }))).toBe('new')
    })

    it('leaves a genuinely unknown value as other', () => {
      expect(permitKind(permit({ work_class: 'Solar Array' }))).toBe('other')
    })
  })

  it('ignores permit_type_desc, which carries no kind signal in the real feed', () => {
    expect(permitKind(permit({ work_class: null, permit_type_desc: 'Building Permit' }))).toBe('other')
  })
})
