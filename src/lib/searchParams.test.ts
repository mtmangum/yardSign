import { describe, expect, it } from 'vitest'
import { DEFAULT_RADIUS } from './geo'
import { DEFAULT_DAYS, parseSearchState, toSearchString } from './searchParams'

describe('parseSearchState', () => {
  it('reads an address search', () => {
    expect(parseSearchState('?q=1100%20Congress%20Ave&r=805&d=90&k=demolition,new')).toEqual({
      address: '1100 Congress Ave',
      ll: null,
      radius: 805,
      days: 90,
      kinds: ['demolition', 'new'],
    })
  })

  it('reads a lat,lng search', () => {
    const s = parseSearchState('?ll=30.264,-97.747')
    expect(s.ll).toEqual([30.264, -97.747])
    expect(s.address).toBeNull()
  })

  it('falls back to defaults for missing / bad params', () => {
    expect(parseSearchState('')).toEqual({
      address: null, ll: null, radius: DEFAULT_RADIUS, days: DEFAULT_DAYS, kinds: [],
    })
    expect(parseSearchState('?r=abc&d=-4&ll=nope').radius).toBe(DEFAULT_RADIUS)
    expect(parseSearchState('?d=-4').days).toBe(DEFAULT_DAYS)
    expect(parseSearchState('?ll=nope').ll).toBeNull()
  })

  it('drops unknown kinds', () => {
    expect(parseSearchState('?k=demolition,bogus,other').kinds).toEqual(['demolition', 'other'])
  })
})

describe('toSearchString', () => {
  const base = { address: null, ll: null, radius: DEFAULT_RADIUS, days: DEFAULT_DAYS, kinds: [] as const }

  it('is "/" when everything is default', () => {
    expect(toSearchString({ ...base, source: 'default' })).toBe('/')
  })

  it('writes ?q for an address source, ignoring any ll', () => {
    expect(toSearchString({
      ...base, source: 'address', address: '1100 Congress Ave', ll: [30.27, -97.74],
    })).toBe('?q=1100+Congress+Ave')
  })

  it('writes ?ll for pin / geo sources', () => {
    expect(toSearchString({ ...base, source: 'pin', ll: [30.264, -97.747] })).toBe('?ll=30.264%2C-97.747')
    expect(toSearchString({ ...base, source: 'geo', ll: [30.1, -97.9] })).toBe('?ll=30.1%2C-97.9')
  })

  it('omits location entirely for the default source but keeps non-default filters', () => {
    expect(toSearchString({
      ...base, source: 'default', radius: 402, kinds: ['remodel'],
    })).toBe('?r=402&k=remodel')
  })

  it('round-trips with parseSearchState', () => {
    const written = toSearchString({
      source: 'address', address: 'X St', ll: null, radius: 3219, days: 365, kinds: ['new', 'other'],
    })
    expect(parseSearchState(written)).toEqual({
      address: 'X St', ll: null, radius: 3219, days: 365, kinds: ['new', 'other'],
    })
  })
})
