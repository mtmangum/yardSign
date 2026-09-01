import { describe, expect, it } from 'vitest'
import type { Permit } from '../api/permits'
import { permitClassLabel, permitFacts } from './format'

const permit = (over: Partial<Permit>): Permit => ({
  id: '1', permit_number: '2024-000001 BP', permit_type_desc: 'Building Permit',
  permit_class: null, permit_class_mapped: null, work_class: 'New',
  description: null, address: '1 Main St', issue_date: '2025-06-01',
  applied_date: null, status_current: 'Active', total_job_valuation: null,
  total_new_add_sqft: null, housing_units: null, number_of_floors: null,
  latitude: 30, longitude: -97, source_url: null, distance_m: 0,
  ...over,
})

describe('permitFacts', () => {
  it('lists units, new sqft, and floors in order for a new build', () => {
    expect(permitFacts(permit({
      work_class: 'New', housing_units: 232, total_new_add_sqft: 129307, number_of_floors: 6,
    }))).toEqual(['232 units', '129,307 sq ft', '6 floors'])
  })

  it('drops the city placeholder counts of 1', () => {
    expect(permitFacts(permit({
      work_class: 'New', housing_units: 1, number_of_floors: 1, total_new_add_sqft: 400,
    }))).toEqual(['400 sq ft'])
  })

  it('stays silent on a pure interior remodel', () => {
    expect(permitFacts(permit({
      work_class: 'Remodel', housing_units: 1, number_of_floors: 5, total_new_add_sqft: null,
    }))).toEqual([])
  })

  it('shows added area on a remodel that grows the building', () => {
    expect(permitFacts(permit({
      work_class: 'Addition', total_new_add_sqft: 800, number_of_floors: 2,
    }))).toEqual(['800 sq ft', '2 floors'])
  })

  it('rounds fractional square footage', () => {
    expect(permitFacts(permit({ work_class: 'New', total_new_add_sqft: 1234.6 }))).toEqual(['1,235 sq ft'])
  })
})

describe('permitClassLabel', () => {
  it('strips the city code prefix', () => {
    expect(permitClassLabel('R- 101 Single Family Houses - Detached'))
      .toBe('Single Family Houses - Detached')
  })

  it('leaves an uncoded value untouched', () => {
    expect(permitClassLabel('Commercial Remodel')).toBe('Commercial Remodel')
  })

  it('passes null through', () => {
    expect(permitClassLabel(null)).toBeNull()
  })
})
