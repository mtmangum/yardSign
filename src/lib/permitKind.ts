import type { Permit } from '../api/permits'

export type PermitKind = 'demolition' | 'new' | 'remodel' | 'other'

// Order used by the map legend and the sidebar kind counts: headline signal first.
export const KIND_ORDER: readonly PermitKind[] = ['demolition', 'new', 'remodel', 'other']

// Marker fill / legend swatch per kind. Kept in sync with the
// --demolition / --new-build / --remodel / --other tokens in global.css; not
// read from CSS because Leaflet paints markers to canvas, and the Stadia
// basemap is always light so the light-mode ramp is always correct.
export const KIND_COLOR: Record<PermitKind, string> = {
  demolition: '#ec3013',
  new: '#201e1d',
  remodel: '#8c877f',
  other: '#c9c5c0',
}

export const KIND_LABEL: Record<PermitKind, string> = {
  demolition: 'Demolition',
  new: 'New construction',
  remodel: 'Remodel',
  other: 'Other',
}

// `work_class` is the only classification signal that reaches the browser
// (`permit_type_desc` is just "Electrical Permit" / "Plumbing Permit" / etc.,
// and `permit_class_mapped` is only Residential vs Commercial). It is a closed
// set of ~30 free-text values in the Issued Construction Permits feed; this
// table is every value seen in the trailing 18 months, checked 2026-08-30 with
// a `$group=work_class` query. Anything unrecognised falls through to the
// substring heuristics below so a new feed value degrades gracefully.
//
// The buckets are "what a neighbor reacts to", not the city's taxonomy:
//   demolition - a structure is coming down
//   new        - a structure is going up (incl. Shell and Homebuilder Loop)
//   remodel    - work on an existing building (incl. additions and repairs)
//   other      - equipment swaps, signs, irrigation, driveways, utilities
const WORK_CLASS_KIND: Record<string, PermitKind> = {
  'new': 'new',
  'shell': 'new',
  'homebuilder loop': 'new',
  'demolition': 'demolition',
  'demo': 'demolition',
  'remodel': 'remodel',
  'addition': 'remodel',
  'addition and remodel': 'remodel',
  'remodel mobile home': 'remodel',
  'repair': 'remodel',
  // Interior, non-structural demo is the gut phase of a remodel - the building
  // is not coming down. It must NOT land in the demolition bucket, which is the
  // app's headline "something is being torn down near you" signal.
  'interior demo non-structural': 'remodel',
  'change out': 'other',
  'upgrade': 'other',
  'irrigation': 'other',
  'wall': 'other',
  'auxiliary power': 'other',
  'auxiliary water': 'other',
  'special inspections program': 'other',
  'temporary loop': 'other',
  'fireline': 'other',
  'freestanding': 'other',
  'projecting': 'other',
  'awning': 'other',
  'roof': 'other',
  'relocation': 'other',
  'modification': 'other',
  'plumbing service line': 'other',
  'plumbing utility connection': 'other',
  'grease interceptor (gi) replacement': 'other',
  'cut over/tank abandonment': 'other',
}

export function permitKind(permit: Permit): PermitKind {
  // permit_class is the strongest signal for the headline bucket: its
  // "R- 645 Demolition One Family Homes" / "C- 649 Demolition ..." classes mean
  // a structure is coming down. work_class cannot make that call - it files
  // teardowns and "Interior Demo Non-Structural" gut-jobs under one "Demolition".
  const permitClass = (permit.permit_class ?? '').toLowerCase()
  if (permitClass.includes('demolition')) return 'demolition'

  const work = (permit.work_class ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (!work) return 'other'

  const known = WORK_CLASS_KIND[work]
  if (known) return known

  // Unknown value: fall back to substring matching, checking the interior-demo
  // exclusion before the demolition rule so a future "Interior Demo ..." variant
  // is still kept out of the demolition bucket.
  if (work.includes('interior demo') || work.includes('non-structural')) return 'remodel'
  if (work.includes('demolition') || work.includes('demo')) return 'demolition'
  if (work.includes('remodel') || work.includes('renovation') || work.includes('addition') ||
      work.includes('repair') || work.includes('alteration')) return 'remodel'
  if (work.includes('shell') || /\bnew\b/.test(work)) return 'new'
  return 'other'
}
