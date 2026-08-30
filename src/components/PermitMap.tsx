import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Circle, useMap } from 'react-leaflet'
import type { Permit } from '../api/permits'
import { permitKind } from './PermitList'

const KIND_COLOR: Record<ReturnType<typeof permitKind>, string> = {
  demolition: '#b02a37',
  new: '#d9480f',
  remodel: '#2b6cb0',
  other: '#6b7280',
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
}

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431]

export function PermitMap({ center, radius, permits, activeId, onHover }: PermitMapProps) {
  return (
    <div className="app__map">
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
              radius={active ? 9 : 6}
              pathOptions={{
                color: KIND_COLOR[kind],
                fillColor: KIND_COLOR[kind],
                fillOpacity: active ? 0.95 : 0.7,
                weight: active ? 3 : 1,
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
