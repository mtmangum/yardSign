import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Circle, useMap } from 'react-leaflet'
import type { Permit } from '../api/permits'
import { permitKind } from './PermitList'

// Keep in sync with the --demolition/--new-build/--remodel/--other tokens in
// global.css. Static (not read from CSS) because Leaflet paints to canvas; the
// Stadia basemap is always light, so the light-mode ramp is always correct.
const KIND_COLOR: Record<ReturnType<typeof permitKind>, string> = {
  demolition: '#ec3013',
  new: '#201e1d',
  remodel: '#8c877f',
  other: '#c9c5c0',
}

function Recenter({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const map = useMap()
  useEffect(() => {
    // Fit the search circle rather than a fixed zoom, so changing the radius
    // reframes the map the way a user expects.
    map.fitBounds([
      [lat - radius / 111320, lng - radius / 88000],
      [lat + radius / 111320, lng + radius / 88000],
    ], { padding: [24, 24] })
  }, [lat, lng, radius, map])
  return null
}

interface PermitMapProps {
  center: { lat: number; lng: number } | null
  radius: number
  permits: Permit[]
  activeId: string | null
  onHover: (id: string | null) => void
  onLocate: () => void
  locating: boolean
  geoError: string | null
}

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431]

export function PermitMap({
  center, radius, permits, activeId, onHover, onLocate, locating, geoError,
}: PermitMapProps) {
  return (
    <div className="app__map">
      <button
        type="button"
        className="map__locate"
        onClick={onLocate}
        disabled={locating}
        aria-label="Search from my location"
        title="Search from my location"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        </svg>
      </button>
      {geoError && <p className="map__geo-error" role="alert">{geoError}</p>}

      <MapContainer center={AUSTIN_CENTER} zoom={12} scrollWheelZoom style={{ height: '100%' }}>
        {/*
          Stadia Maps "Alidade Smooth": a desaturated basemap so the permit
          markers carry the colour. Keyless from localhost; production needs a
          free, domain-restricted key appended as `?api_key=...` (set it in
          VITE_STADIA_API_KEY and interpolate here). CARTO's Voyager tiles were
          dropped when CARTO started watermarking keyless requests.
        */}
        <TileLayer
          attribution='&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={`https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png${
            import.meta.env.VITE_STADIA_API_KEY ? `?api_key=${import.meta.env.VITE_STADIA_API_KEY}` : ''
          }`}
        />

        {center && (
          <>
            <Recenter lat={center.lat} lng={center.lng} radius={radius} />
            <Circle
              center={[center.lat, center.lng]}
              radius={radius}
              pathOptions={{ color: '#17171a', weight: 1, fillOpacity: 0.04, dashArray: '4 4' }}
            />
          </>
        )}

        {permits.map((permit) => {
          const kind = permitKind(permit)
          const active = activeId === permit.id
          return (
            <CircleMarker
              key={permit.id}
              center={[permit.latitude, permit.longitude]}
              radius={active ? 9 : kind === 'demolition' ? 7 : 5}
              pathOptions={{
                color: '#ffffff',
                fillColor: KIND_COLOR[kind],
                fillOpacity: active ? 1 : 0.85,
                weight: 1.5,
              }}
              eventHandlers={{
                mouseover: () => onHover(permit.id),
                mouseout: () => onHover(null),
              }}
            >
              <Popup>
                <div className="map__popup">
                  <h3>{permit.address ?? 'Address not recorded'}</h3>
                  <p>{permit.work_class ?? permit.permit_type_desc}</p>
                  {permit.description && <p>{permit.description}</p>}
                  {permit.source_url && (
                    <a href={permit.source_url} target="_blank" rel="noreferrer">
                      Open in the city permit portal
                    </a>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      <div className="map__legend">
        {(['demolition', 'new', 'remodel', 'other'] as const).map((kind) => (
          <div className="map__legend-row" key={kind}>
            <span className="map__legend-dot" style={{ background: KIND_COLOR[kind] }} />
            <span>{kind === 'new' ? 'New construction' : kind[0].toUpperCase() + kind.slice(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
