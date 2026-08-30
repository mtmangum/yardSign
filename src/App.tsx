import { useMemo, useState } from 'react'
import { AddressSearch } from './components/AddressSearch'
import { PermitList } from './components/PermitList'
import { PermitMap } from './components/PermitMap'
import { usePermits } from './hooks/usePermits'
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

export default function App() {
  const [location, setLocation] = useState<AddressMatch | null>(DEFAULT_LOCATION)
  const [radius, setRadius] = useState(1609)
  const [days, setDays] = useState(180)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Memoized so usePermits does not refetch on every unrelated render.
  const query = useMemo<PermitQuery | null>(
    () => (location ? { lat: location.lat, lng: location.lng, radius, days } : null),
    [location, radius, days],
  )
  const { permits, loading, error } = usePermits(query)

  const openPermit = (permit: Permit) => {
    if (permit.source_url) window.open(permit.source_url, '_blank', 'noreferrer')
  }

  return (
    <div className="app">
      <aside className="app__panel">
        <header className="masthead">
          <span className="masthead__mark">
            {/* A coroplast lawn sign, face-on: hard corners, 2px ink edge, a red
                bar down the left that rhymes with the .permit list rows. */}
            <svg className="masthead__sign" viewBox="0 0 26 20" aria-hidden="true" focusable="false">
              <rect
                x="1" y="3" width="24" height="14"
                fill="var(--paper-raised)" stroke="currentColor" strokeWidth="2"
              />
              <rect x="2" y="4" width="4" height="12" fill="var(--notice)" />
              <rect x="9" y="7" width="13" height="2" fill="currentColor" />
              <rect x="9" y="11" width="8" height="2" fill="currentColor" />
            </svg>
            Yard Sign
          </span>
          <p className="masthead__tagline">Every notice posted near you, without the drive-by.</p>
        </header>

        <div className="controls">
          <AddressSearch onSelect={setLocation} selectedLabel={location?.label ?? null} />
          <div className="field__row">
            <div className="field">
              <label className="field__label" htmlFor="radius">Radius</label>
              <select
                id="radius"
                className="field__input"
                value={radius}
                onChange={(event) => setRadius(Number(event.target.value))}
              >
                {RADIUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="window">Issued</label>
              <select
                id="window"
                className="field__input"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="results">
          <PermitList
            permits={permits}
            loading={loading}
            error={error}
            hasLocation={Boolean(location)}
            activeId={activeId}
            onHover={setActiveId}
            onSelect={openPermit}
          />
        </div>
      </aside>

      <PermitMap
        center={location ? { lat: location.lat, lng: location.lng } : null}
        radius={radius}
        permits={permits}
        activeId={activeId}
        onHover={setActiveId}
        onLocate={({ lat, lng }) => setLocation({ label: 'Current location', lat, lng })}
      />
    </div>
  )
}
