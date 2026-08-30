import { describe, expect, it } from 'vitest'
import {
  buildAddressCsv,
  parseBatchResponse,
  parseCsvLine,
} from '../geocode-census-batch-background.mts'

const candidate = (over: Partial<Parameters<typeof buildAddressCsv>[0][number]> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  route_number: 1,
  permit_number: '2025-000001 BP',
  address: '100 CONGRESS AVE',
  zip_code: '78701',
  ...over,
})

describe('buildAddressCsv', () => {
  it('emits one quoted Unique ID, Street, City, State, ZIP row per candidate, no header', () => {
    const csv = buildAddressCsv([candidate(), candidate({ id: 'b', address: '200 W 2ND ST', zip_code: null })])
    expect(csv.split('\n')).toEqual([
      '"11111111-1111-1111-1111-111111111111","100 CONGRESS AVE","Austin","TX","78701"',
      '"b","200 W 2ND ST","Austin","TX",""',
    ])
  })

  it('escapes embedded quotes and keeps embedded commas inside the quoted field', () => {
    const csv = buildAddressCsv([candidate({ address: '100 "A" ST, UNIT 2' })])
    expect(csv).toBe(
      '"11111111-1111-1111-1111-111111111111","100 ""A"" ST, UNIT 2","Austin","TX","78701"',
    )
  })
})

describe('parseCsvLine', () => {
  it('splits a plain line', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('keeps commas inside quoted fields', () => {
    expect(parseCsvLine('"x","-97.75,30.26","y"')).toEqual(['x', '-97.75,30.26', 'y'])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsvLine('"say ""hi""","b"')).toEqual(['say "hi"', 'b'])
  })

  it('handles trailing empty field', () => {
    expect(parseCsvLine('a,b,')).toEqual(['a', 'b', ''])
  })
})

describe('parseBatchResponse', () => {
  it('maps a Match row to lat/lon, reading the "lon,lat" pair in that order', () => {
    const line =
      '"id-1","100 CONGRESS AVE, AUSTIN, TX, 78701","Match","Exact","100 CONGRESS AVE, AUSTIN, TX, 78701","-97.743057,30.267153","12345","L"'
    expect(parseBatchResponse(line).get('id-1')).toEqual({ lat: 30.267153, lon: -97.743057 })
  })

  it('maps No_Match and Tie rows (which have only three columns)', () => {
    const text = [
      '"id-2","1 NOWHERE RD, AUSTIN, TX,","No_Match"',
      '"id-3","5 AMBIGUOUS ST, AUSTIN, TX,","Tie"',
    ].join('\n')
    const results = parseBatchResponse(text)
    expect(results.get('id-2')).toBe('no_match')
    expect(results.get('id-3')).toBe('tie')
  })

  it('treats a Match row with an unparseable coordinate as no_match', () => {
    const line = '"id-4","X","Match","Exact","X","not,coords","",""'
    expect(parseBatchResponse(line).get('id-4')).toBe('no_match')
  })

  it('skips blank lines and rows with no id', () => {
    const text = ['', '"id-5","X","No_Match"', '   ', ',,"Match"'].join('\n')
    const results = parseBatchResponse(text)
    expect([...results.keys()]).toEqual(['id-5'])
  })

  it('handles CRLF line endings from the Census response', () => {
    const text = '"id-6","X","No_Match"\r\n"id-7","Y","No_Match"\r\n'
    expect([...parseBatchResponse(text).keys()]).toEqual(['id-6', 'id-7'])
  })
})
