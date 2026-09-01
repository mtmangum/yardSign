import { describe, expect, it } from 'vitest'
import { fromAddressSlug, toAddressSlug } from './addressSlug'

describe('toAddressSlug', () => {
  it('lowercases and collapses punctuation to single hyphens', () => {
    expect(toAddressSlug('1412 NORTHRIDGE DR, AUSTIN, TX, 78723')).toBe('1412-northridge-dr-austin-tx-78723')
  })

  it('trims leading and trailing separators', () => {
    expect(toAddressSlug('  # 200, Main St.  ')).toBe('200-main-st')
  })
})

describe('fromAddressSlug', () => {
  it('turns a slug back into a geocoder-friendly string', () => {
    expect(fromAddressSlug('/1412-northridge-dr-austin-tx-78723')).toBe('1412 northridge dr austin tx 78723')
  })

  it('is empty for the root path and index.html', () => {
    expect(fromAddressSlug('/')).toBe('')
    expect(fromAddressSlug('')).toBe('')
    expect(fromAddressSlug('/index.html')).toBe('')
  })

  it('decodes percent-encoding and survives a malformed escape', () => {
    expect(fromAddressSlug('/1100%20congress')).toBe('1100 congress')
    expect(fromAddressSlug('/bad-%e0-slug')).toBe('bad %e0 slug')
  })
})
