import { describe, expect, it } from 'vitest'
import { DEFAULT_RADIUS } from './geo'
import { DEFAULT_DAYS, parseUrl, toUrl } from './searchParams'

describe('parseUrl', () => {
  it('reads an address from the path plus query params', () => {
    expect(parseUrl('/1100-congress-ave-austin-tx', '?r=805&d=90&k=demolition,new&p=2025-1+BP')).toEqual({
      address: '1100 congress ave austin tx',
      ll: null,
      radius: 805,
      days: 90,
      kinds: ['demolition', 'new'],
      permit: '2025-1 BP',
    })
  })

  it('still reads a legacy ?q= when the path is root', () => {
    expect(parseUrl('/', '?q=1100%20Congress%20Ave').address).toBe('1100 Congress Ave')
  })

  it('reads a lat,lng search (path stays root)', () => {
    const s = parseUrl('/', '?ll=30.264,-97.747')
    expect(s.ll).toEqual([30.264, -97.747])
    expect(s.address).toBeNull()
    expect(s.permit).toBeNull()
  })

  it('falls back to defaults for missing / bad params', () => {
    expect(parseUrl('/', '')).toEqual({
      address: null, ll: null, radius: DEFAULT_RADIUS, days: DEFAULT_DAYS, kinds: [], permit: null,
    })
    expect(parseUrl('/', '?r=abc&d=-4&ll=nope').radius).toBe(DEFAULT_RADIUS)
    expect(parseUrl('/', '?ll=nope').ll).toBeNull()
  })

  it('drops unknown kinds', () => {
    expect(parseUrl('/', '?k=demolition,bogus,other').kinds).toEqual(['demolition', 'other'])
  })
})

describe('toUrl', () => {
  const base = { address: null, ll: null, radius: DEFAULT_RADIUS, days: DEFAULT_DAYS, kinds: [] as const }

  it('is "/" when everything is default', () => {
    expect(toUrl({ ...base, source: 'default' })).toBe('/')
  })

  it('writes the address as a path slug (ignoring any ll)', () => {
    expect(toUrl({
      ...base, source: 'address', address: '1412 NORTHRIDGE DR, AUSTIN, TX, 78723', ll: [30.27, -97.74],
    })).toBe('/1412-northridge-dr-austin-tx-78723')
  })

  it('writes ?ll for pin / geo sources', () => {
    expect(toUrl({ ...base, source: 'pin', ll: [30.264, -97.747] })).toBe('/?ll=30.264%2C-97.747')
  })

  it('appends filters and the open card to the path', () => {
    expect(toUrl({
      ...base, source: 'address', address: '1100 Congress Ave', radius: 402, kinds: ['remodel'], permit: '2025-1 BP',
    })).toBe('/1100-congress-ave?r=402&k=remodel&p=2025-1+BP')
  })

  it('keeps non-default filters even for the default location', () => {
    expect(toUrl({ ...base, source: 'default', radius: 402, kinds: ['remodel'] })).toBe('/?r=402&k=remodel')
  })

  it('round-trips a canonical address through parseUrl', () => {
    const url = toUrl({
      source: 'address', address: '1412 NORTHRIDGE DR, AUSTIN, TX, 78723', ll: null,
      radius: 3219, days: 365, kinds: ['new'], permit: '2025-9 DEM',
    })
    const [path, search] = url.split('?')
    expect(parseUrl(path, `?${search}`)).toEqual({
      address: '1412 northridge dr austin tx 78723', ll: null,
      radius: 3219, days: 365, kinds: ['new'], permit: '2025-9 DEM',
    })
  })
})
