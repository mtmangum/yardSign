const METERS_PER_MILE = 1609.34

/** "0.42 mi", or "0.42 mi away" with `long`. */
export const formatDistance = (meters: number, long = false) =>
  `${(meters / METERS_PER_MILE).toFixed(2)} mi${long ? ' away' : ''}`

/** Whole-dollar currency, or null for zero / missing valuations. */
export const formatValuation = (value: number | null) =>
  value && value > 0
    ? new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0,
    }).format(value)
    : null

/** "Jun 1, 2025" from a bare "YYYY-MM-DD"; null passes through. */
export const formatDate = (value: string | null) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
    : null
