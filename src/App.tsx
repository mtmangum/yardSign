import { useMemo, useState } from 'react'
import { AddressSearch } from './components/AddressSearch'
import { PermitList } from './components/PermitList'
import { PermitMap } from './components/PermitMap'
import { usePermits } from './hooks/usePermits'
import { useGeolocate } from './hooks/useGeolocate'
import type { AddressMatch, Permit, PermitQuery } from './api/permits'

const RADIUS_OPTIONS = [
  { label: '1/4 mile', value: 402 },
  { label: '1/2 mile', value: 805 },
  { label: '1 mile', value: 1609 },
  { label: '2 miles', value: 3219 },
]

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
  const [location, setLocation] = useState<AddressMatch | null>(DEFAULT_LOCATION)
  const [radius, setRadius] = useState(1609)
  const [days, setDays] = useState(180)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null)

  // Memoized so usePermits does not refetch on every unrelated render.
  const query = useMemo<PermitQuery | null>(
    () => (location ? { lat: location.lat, lng: location.lng, radius, days, limit: LIST_LIMIT } : null),
    [location, radius, days],
  )
  const { permits, mapPermits, total, loading, error } = usePermits(query)
  const geo = useGeolocate(({ lat, lng }) => {
    setSelectedPermit(null)
    setLocation({ label: 'Current location', lat, lng })
  })
  const activeId = hoveredId ?? selectedPermit?.id ?? null
  const listedPermits = useMemo(() => {
    const closest = permits.slice(0, LIST_LIMIT)
    if (!selectedPermit || closest.some((permit) => permit.id === selectedPermit.id)) return closest
    return [selectedPermit, ...closest.slice(0, LIST_LIMIT - 1)]
  }, [permits, selectedPermit])

  const openPermit = (permit: Permit) => {
    if (permit.source_url) window.open(permit.source_url, '_blank', 'noreferrer')
  }

  return (
    <div className="app">
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
              setSelectedPermit(null)
              setLocation(match)
            }}
            selectedLabel={location?.label ?? null}
            onLocate={geo.locate}
            locating={geo.locating}
            geoError={geo.error}
          />
          <div className="field">
            <span className="field__label" id="radius-label">Radius</span>
            <div className="segmented" role="radiogroup" aria-labelledby="radius-label">
                {RADIUS_OPTIONS.map((option) => (
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
            loading={loading}
            error={error}
            hasLocation={Boolean(location)}
            activeId={activeId}
            focusId={selectedPermit?.id ?? null}
            onHover={setHoveredId}
            onSelect={openPermit}
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
          setLocation({ label: 'Dropped pin', lat, lng })
        }}
        permits={mapPermits}
        loading={loading}
        activeId={activeId}
        onHover={setHoveredId}
        onSelectPermit={setSelectedPermit}
        onLocate={geo.locate}
        locating={geo.locating}
        geoError={geo.error}
      />
    </div>
  )
}
