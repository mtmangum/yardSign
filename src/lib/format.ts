import type { Permit } from '../api/permits'
import { permitKind } from './permitKind'

const METERS_PER_MILE = 1609.34
const grouped = new Intl.NumberFormat('en-US')

/** "0.42 mi", or "0.42 mi away" with `long`. */
export const formatDistance = (meters: number, long = false) =>
  `${(meters / METERS_PER_MILE).toFixed(2)} mi${long ? ' away' : ''}`

/** The "how big is this" facts a neighbour reacts to, in order: "42 units",
 *  "51,000 sq ft", "5 floors".
 *
 *  Only shown for permits that actually add a structure or floor area — new
 *  builds, and remodels with `total_new_add_sqft`. On a pure interior remodel
 *  the unit and floor counts describe the *existing* building, not the work, so
 *  they mislead more than they inform. `housing_units` and `number_of_floors`
 *  are also stamped as 1 by default on plenty of non-residential permits, so a
 *  count only counts when it's above that placeholder. */
export function permitFacts(permit: Permit): string[] {
  const sqft = permit.total_new_add_sqft ?? 0
  const addsArea = sqft > 0
  if (!addsArea && permitKind(permit) !== 'new') return []

  const facts: string[] = []
  const units = permit.housing_units
  const floors = permit.number_of_floors
  if (units && units > 1) facts.push(`${grouped.format(units)} units`)
  if (addsArea) facts.push(`${grouped.format(Math.round(sqft))} sq ft`)
  if (floors && floors > 1) facts.push(`${floors} floors`)
  return facts
}

/** Drop the city's code prefix: "R- 101 Single Family Houses" -> "Single Family
 *  Houses". Leaves the value untouched if it doesn't start with a code. */
export const permitClassLabel = (value: string | null) => {
  if (!value) return null
  const trimmed = value.replace(/^[A-Za-z]?\s*-?\s*\d+\s+/, '').trim()
  return trimmed || value
}

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
