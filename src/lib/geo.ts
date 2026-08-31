import type { AddressMatch } from '../api/permits'

// The four supported search radii, in metres. Single source of truth: the
// sidebar segmented control, the map's draggable handle, and the default all
// read from here.
export const RADIUS_CHOICES = [
  { value: 402, label: '1/4 mile' },
  { value: 805, label: '1/2 mile' },
  { value: 1609, label: '1 mile' },
  { value: 3219, label: '2 miles' },
] as const

export const RADIUS_STEPS = RADIUS_CHOICES.map((choice) => choice.value)
export const DEFAULT_RADIUS = 1609

export const nearestRadiusStep = (meters: number) =>
  RADIUS_STEPS.reduce((closest, step) =>
    (Math.abs(step - meters) < Math.abs(closest - meters) ? step : closest))

// The Austin-area bounding box the `/api/permits` function also enforces. Used
// client-side to reject an off-Austin geolocation fix before the request.
export const inAustin = (lat: number, lng: number) =>
  lat >= 29.5 && lat <= 31 && lng >= -98.5 && lng <= -97

// Snap a coordinate to a ~110 m grid (3 decimal places). Neighbours checking
// the same block then share one CDN cache key - and one Supabase query -
// instead of every distinct address being a cache miss, and exact addresses
// stay out of the cache key. See docs/current-state.md "Egress".
export const snapCoord = (value: number) => Math.round(value * 1000) / 1000

export const snapLocation = (match: AddressMatch): AddressMatch => ({
  ...match,
  lat: snapCoord(match.lat),
  lng: snapCoord(match.lng),
})
