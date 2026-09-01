import { useEffect, useMemo, useRef, useState } from 'react'
import { AddressSearch } from './components/AddressSearch'
import { PermitList } from './components/PermitList'
import { PermitMap } from './components/map/PermitMap'
import { usePermits } from './hooks/usePermits'
import { useGeolocate } from './hooks/useGeolocate'
import { RADIUS_CHOICES, snapLocation } from './lib/geo'
import type { PermitKind } from './lib/permitKind'
import { type LocationSource, parseUrl, toUrl } from './lib/searchParams'
import { fetchPermit, geocodeAddress, type AddressMatch, type Permit, type PermitQuery } from './api/permits'

const WINDOW_OPTIONS = [
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 6 months', value: 180 },
  { label: 'Last year', value: 365 },
]

// Land on downtown Austin with data already on the map, rather than a blank
// slate that asks the user to do something before it shows its worth. They
// search their own address or hit the locate button from there.
const DEFAULT_LOCATION: AddressMatch = { label: 'Downtown Austin', lat: 30.2672, lng: -97.7431 }
const LIST_LIMIT = 500

export default function App() {
  // The URL is the source of truth for a search on load and on back/forward.
  const [initial] = useState(() => parseUrl(window.location.pathname, window.location.search))

  const [location, setLocationState] = useState<AddressMatch | null>(
    initial.ll
      ? snapLocation({ label: 'Map location', lat: initial.ll[0], lng: initial.ll[1] })
      : initial.address
        ? null // resolved by the geocode effect below
        : snapLocation(DEFAULT_LOCATION),
  )
  const [locationSource, setLocationSource] = useState<LocationSource>(
    initial.address ? 'address' : initial.ll ? 'pin' : 'default',
  )
  const setLocation = (match: AddressMatch, source: LocationSource) => {
    setLocationSource(source)
    setLocationState(snapLocation(match))
  }

  const [radius, setRadius] = useState(initial.radius)
  const [days, setDays] = useState(initial.days)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null)
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map')
  const [activeKinds, setActiveKinds] = useState<PermitKind[]>(initial.kinds)
  const [addressError, setAddressError] = useState<string | null>(null)

  // Resolve the address from the URL path (or a legacy ?q=). Use the geocoder's
  // normalised label so the URL rewrites to the canonical slug; drop to the
  // default view with a note if it can't be placed.
  useEffect(() => {
    if (!initial.address || initial.ll) return
    let cancelled = false
    geocodeAddress(initial.address).then((matches) => {
      if (cancelled) return
      if (matches[0]) {
        setLocationState(snapLocation({ label: matches[0].label, lat: matches[0].lat, lng: matches[0].lng }))
      } else {
        setAddressError(`Couldn't find "${initial.address}". Try searching again.`)
        setLocationSource('default')
        setLocationState(snapLocation(DEFAULT_LOCATION))
      }
    })
    return () => { cancelled = true }
  }, [initial])

  // Resolve a ?p=<permit number> from the URL - open its card, and centre on it
  // when the link carried no area of its own.
  useEffect(() => {
    if (!initial.permit) return
    let cancelled = false
    const near = initial.ll ? { lat: initial.ll[0], lng: initial.ll[1] } : undefined
    fetchPermit(initial.permit, near).then((permit) => {
      if (cancelled || !permit) return
      setSelectedPermit(permit)
      if (!initial.address && !initial.ll) {
        setLocationSource('pin')
        setLocationState(snapLocation({
          label: permit.address ?? 'Shared permit', lat: permit.latitude, lng: permit.longitude,
        }))
      }
    })
    return () => { cancelled = true }
  }, [initial])

  // Reflect the search into the URL: a new place pushes a history entry (so
  // back/forward walks between searches), a filter tweak on the same place just
  // replaces it (no history spam).
  const skipNextUrlWrite = useRef(false)
  const lastPlaceKey = useRef('')
  const urlWriteMounted = useRef(false)
  useEffect(() => {
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false
      return
    }
    // A shared address is still being geocoded - don't blow it out of the URL
    // in the gap.
    if (locationSource === 'address' && !location) return

    const next = toUrl({
      source: locationSource,
      address: location?.label ?? null,
      ll: location ? [location.lat, location.lng] : null,
      radius,
      days,
      kinds: activeKinds,
      permit: selectedPermit?.permit_number ?? null,
    })
    const placeKey = `${locationSource}:${location?.lat ?? ''},${location?.lng ?? ''}`
    const newPlace = urlWriteMounted.current && placeKey !== lastPlaceKey.current
    lastPlaceKey.current = placeKey
    urlWriteMounted.current = true

    if (next === window.location.pathname + window.location.search) return
    window.history[newPlace ? 'pushState' : 'replaceState'](null, '', next)
  }, [location, locationSource, radius, days, activeKinds, selectedPermit])

  // Back/forward: re-read the URL into state.
  useEffect(() => {
    const onPop = () => {
      const s = parseUrl(window.location.pathname, window.location.search)
      skipNextUrlWrite.current = true
      setRadius(s.radius)
      setDays(s.days)
      setActiveKinds(s.kinds)
      setSelectedPermit(null)
      if (s.permit) {
        const near = s.ll ? { lat: s.ll[0], lng: s.ll[1] } : undefined
        fetchPermit(s.permit, near).then((permit) => permit && setSelectedPermit(permit))
      }
      if (s.ll) {
        setLocationSource('pin')
        setLocationState(snapLocation({ label: 'Map location', lat: s.ll[0], lng: s.ll[1] }))
      } else if (s.address) {
        setLocationSource('address')
        geocodeAddress(s.address).then((m) => {
          if (m[0]) setLocationState(snapLocation({ label: m[0].label, lat: m[0].lat, lng: m[0].lng }))
        })
      } else {
        setLocationSource('default')
        setLocationState(snapLocation(DEFAULT_LOCATION))
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Memoized so usePermits does not refetch on every unrelated render.
  const query = useMemo<PermitQuery | null>(
    () => (location ? { lat: location.lat, lng: location.lng, radius, days, limit: LIST_LIMIT, kinds: activeKinds } : null),
    [location, radius, days, activeKinds],
  )
  const { permits, mapPermits, total, loading, error } = usePermits(query)
  const geo = useGeolocate(({ lat, lng }) => {
    setSelectedPermit(null)
    setLocation({ label: 'Current location', lat, lng }, 'geo')
    setMobileView('map')
  })
  const activeId = hoveredId ?? selectedPermit?.id ?? null
  const listedPermits = useMemo(() => {
    const closest = permits.slice(0, LIST_LIMIT)
    if (!selectedPermit || closest.some((permit) => permit.id === selectedPermit.id)) return closest
    return [selectedPermit, ...closest.slice(0, LIST_LIMIT - 1)]
  }, [permits, selectedPermit])

  // The map draws the grid sample; make sure a permit picked from the sidebar
  // has a marker (and therefore a popup) even if it fell outside that sample.
  const mappedPermits = useMemo(() => {
    if (!selectedPermit || mapPermits.some((permit) => permit.id === selectedPermit.id)) return mapPermits
    return [selectedPermit, ...mapPermits]
  }, [mapPermits, selectedPermit])

  // Selecting a permit (from either the list or a marker) shows its card on the
  // map; on mobile that means switching to the map view.
  const selectPermit = (permit: Permit) => {
    setSelectedPermit(permit)
    setMobileView('map')
  }

  const toggleKind = (kind: PermitKind) => {
    setSelectedPermit(null)
    setActiveKinds((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind])
  }

  return (
    <div className="app" data-mobile-view={mobileView}>
      <nav className="mobile-view-switcher" aria-label="Choose mobile view">
        <button
          type="button"
          aria-pressed={mobileView === 'map'}
          onClick={() => setMobileView('map')}
        >
          Map
        </button>
        <button
          type="button"
          aria-pressed={mobileView === 'list'}
          onClick={() => setMobileView('list')}
        >
          List
        </button>
      </nav>
      <aside className="app__panel">
        <header className="masthead">
          <span className="masthead__mark">
            <svg className="masthead__sign" viewBox="0 0 38 34" aria-hidden="true" focusable="false">
              <path className="masthead__stake" d="M9 23v9l2-3V23M28 23v9l2-3V23" />
              <rect className="masthead__board" x="1" y="1" width="36" height="23" />
              <rect className="masthead__flag" x="3" y="3" width="11" height="19" />
              <path className="masthead__monogram" d="m6 8 2.5 4L11 8M8.5 12v5" />
              <path className="masthead__copy" d="M18 8h14M18 12h11M18 17h7" />
            </svg>
            Yard Sign
          </span>
          <p className="masthead__tagline">Every notice posted near you, without the drive-by.</p>
        </header>

        <div className="controls">
          <AddressSearch
            onSelect={(match) => {
              setAddressError(null)
              setSelectedPermit(null)
              setLocation(match, 'address')
              setMobileView('map')
            }}
            selectedLabel={location?.label ?? null}
            onLocate={geo.locate}
            locating={geo.locating}
            geoError={geo.error ?? addressError}
          />
          <div className="field">
            <span className="field__label" id="radius-label">Radius</span>
            <div className="segmented" role="radiogroup" aria-labelledby="radius-label">
                {RADIUS_CHOICES.map((option) => (
                <button
                  type="button"
                  className="segmented__option"
                  role="radio"
                  aria-checked={radius === option.value}
                  key={option.value}
                  onClick={() => {
                    setSelectedPermit(null)
                    setRadius(option.value)
                  }}
                >
                  {option.label}
                </button>
                ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label" id="window-label">Issued</span>
            <div className="segmented" role="radiogroup" aria-labelledby="window-label">
                {WINDOW_OPTIONS.map((option) => (
                <button
                  type="button"
                  className="segmented__option"
                  role="radio"
                  aria-checked={days === option.value}
                  key={option.value}
                  onClick={() => {
                    setSelectedPermit(null)
                    setDays(option.value)
                  }}
                >
                  {option.label.replace('Last ', '')}
                </button>
                ))}
            </div>
          </div>
        </div>

        <div className="results">
          <PermitList
            permits={listedPermits}
            mappedCount={mapPermits.length}
            total={total}
            activeKinds={activeKinds}
            onToggleKind={toggleKind}
            loading={loading}
            error={error}
            hasLocation={Boolean(location)}
            activeId={activeId}
            focusId={selectedPermit?.id ?? null}
            focusKey={mobileView}
            onHover={setHoveredId}
            onSelect={selectPermit}
          />
        </div>
      </aside>

      <PermitMap
        center={location ? { lat: location.lat, lng: location.lng } : null}
        radius={radius}
        onRadiusChange={(nextRadius) => {
          setSelectedPermit(null)
          setRadius(nextRadius)
        }}
        onCenterChange={(lat, lng) => {
          setSelectedPermit(null)
          setLocation({ label: 'Dropped pin', lat, lng }, 'pin')
        }}
        permits={mappedPermits}
        loading={loading}
        active={mobileView === 'map'}
        activeId={activeId}
        selectedId={selectedPermit?.id ?? null}
        onHover={setHoveredId}
        onSelectPermit={selectPermit}
        onDeselectPermit={() => setSelectedPermit(null)}
        onLocate={geo.locate}
        locating={geo.locating}
        geoError={geo.error}
      />
    </div>
  )
}
