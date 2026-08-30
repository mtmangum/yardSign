import { describe, expect, it } from 'vitest'
import { numberParam } from '../permits.mts'

const params = (qs: string) => new URLSearchParams(qs)

describe('numberParam', () => {
  it('returns the fallback when the key is absent', () => {
    // Regression: Number(null) is 0 and finite, which used to slip past the
    // guard and become p_limit: 0 -> clamped to 1 -> one row per query.
    expect(numberParam(params('lat=30&lng=-97'), 'limit', 500)).toBe(500)
    expect(numberParam(params(''), 'radius', 1609)).toBe(1609)
  })

  it('returns the fallback for a present-but-blank value', () => {
    expect(numberParam(params('limit='), 'limit', 500)).toBe(500)
    expect(numberParam(params('limit=%20%20'), 'limit', 500)).toBe(500)
  })

  it('returns the fallback for a non-numeric value', () => {
    expect(numberParam(params('limit=lots'), 'limit', 500)).toBe(500)
  })

  it('parses a real numeric value, including zero and negatives', () => {
    expect(numberParam(params('limit=250'), 'limit', 500)).toBe(250)
    expect(numberParam(params('minValuation=0'), 'minValuation', 999)).toBe(0)
    expect(numberParam(params('days=-5'), 'days', 180)).toBe(-5)
  })
})
