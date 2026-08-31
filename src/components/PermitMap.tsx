import { useEffect, useRef, useState, type RefObject } from 'react'
import { divIcon } from 'leaflet'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Circle, Tooltip, useMap, useMapEvents } from 'react-leaflet'
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

const RADIUS_STEPS = [402, 805, 1609, 3219] as const
const RADIUS_MIN = RADIUS_STEPS[0]
const RADIUS_MAX = RADIUS_STEPS[RADIUS_STEPS.length - 1]
const resizeHandleIcon = divIcon({
  className: 'radius-handle',
  html: '<span class="radius-handle__grip"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

const nearestRadiusStep = (meters: number) =>
  RADIUS_STEPS.reduce((closest, step) =>
    Math.abs(step - meters) < Math.abs(closest - meters) ? step : closest)

const formatMapDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }) : null

const formatMapValue = (value: number | null) =>
  value && value > 0
    ? new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0,
    }).format(value)
    : null

const formatMapDistance = (meters: number) => `${(meters / 1609.34).toFixed(2)} mi away`

function RadiusOverlay({
  lat, lng, radius, onRadiusChange,
}: {
  lat: number
  lng: number
  radius: number
  onRadiusChange: (radius: number) => void
}) {
  const map = useMap()
  const [previewRadius, setPreviewRadius] = useState(radius)

  useEffect(() => setPreviewRadius(radius), [radius])

  const lngMeters = 111320 * Math.max(Math.cos(lat * Math.PI / 180), 0.000001)
  const handlePosition: [number, number] = [lat, lng + previewRadius / lngMeters]

  return (
    <>
      <Circle
        center={[lat, lng]}
        radius={previewRadius}
        pathOptions={{ color: '#17171a', weight: 1, fillOpacity: 0.04, dashArray: '4 4' }}
      />
      <Marker
        position={handlePosition}
        icon={resizeHandleIcon}
        draggable
        keyboard={false}
        zIndexOffset={1000}
        eventHandlers={{
          drag: (event) => {
            const meters = map.distance([lat, lng], event.target.getLatLng())
            setPreviewRadius(Math.min(Math.max(meters, RADIUS_MIN), RADIUS_MAX))
          },
          dragend: (event) => {
            const meters = map.distance([lat, lng], event.target.getLatLng())
            const snapped = nearestRadiusStep(meters)
            setPreviewRadius(snapped)
            onRadiusChange(snapped)
          },
        }}
      >
        <Tooltip className="radius-tooltip" direction="top" offset={[0, -12]}>
          <strong>Resize search area</strong>
          <span>Drag and release to update</span>
        </Tooltip>
      </Marker>
    </>
  )
}

function Recenter({
  lat, lng, radius, skipNextFit,
}: {
  lat: number
  lng: number
  radius: number
  skipNextFit: RefObject<boolean>
}) {
  const map = useMap()
  useEffect(() => {
    if (skipNextFit.current) {
      skipNextFit.current = false
      return
    }
    // Fit the search circle rather than a fixed zoom, so changing the radius
    // reframes the map the way a user expects.
    map.fitBounds([
      [lat - radius / 111320, lng - radius / 88000],
      [lat + radius / 111320, lng + radius / 88000],
    ], { padding: [24, 24] })
  }, [lat, lng, radius, map, skipNextFit])
  return null
}

function RefreshMapSize({ active }: { active: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!active) return
    const frame = window.requestAnimationFrame(() => map.invalidateSize())
    return () => window.cancelAnimationFrame(frame)
  }, [active, map])
  return null
}

function MoveSearchArea({
  radius, onMove,
}: {
  radius: number
  onMove: (lat: number, lng: number) => void
}) {
  const [previewCenter, setPreviewCenter] = useState<[number, number] | null>(null)
  const previewFrame = useRef<number | null>(null)
  const pendingPreview = useRef<[number, number] | null>(null)

  const queuePreview = (center: [number, number] | null) => {
    pendingPreview.current = center
    if (previewFrame.current !== null) return
    previewFrame.current = window.requestAnimationFrame(() => {
      previewFrame.current = null
      setPreviewCenter(pendingPreview.current)
    })
  }

  useEffect(() => {
    const clearPreview = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control') queuePreview(null)
    }
    const clearOnBlur = () => queuePreview(null)
    window.addEventListener('keyup', clearPreview)
    window.addEventListener('blur', clearOnBlur)
    return () => {
      window.removeEventListener('keyup', clearPreview)
      window.removeEventListener('blur', clearOnBlur)
      if (previewFrame.current !== null) window.cancelAnimationFrame(previewFrame.current)
    }
  }, [])

  useMapEvents({
    mousemove: (event) => {
      const pointer = event.originalEvent as MouseEvent
      queuePreview(pointer.metaKey || pointer.ctrlKey
        ? [event.latlng.lat, event.latlng.lng]
        : null)
    },
    mouseout: () => queuePreview(null),
    click: (event) => {
      const pointer = event.originalEvent as MouseEvent
      if (!pointer.metaKey && !pointer.ctrlKey) return
      pointer.preventDefault()
      queuePreview(null)
      onMove(event.latlng.lat, event.latlng.lng)
    },
  })

  return previewCenter ? (
    <Circle
      center={previewCenter}
      radius={radius}
      interactive={false}
      pathOptions={{
        color: '#ec3013',
        weight: 2,
        opacity: 0.72,
        fillColor: '#ec3013',
        fillOpacity: 0.045,
        dashArray: '7 7',
      }}
    />
  ) : null
}

interface PermitMapProps {
  center: { lat: number; lng: number } | null
  radius: number
  onRadiusChange: (radius: number) => void
  onCenterChange: (lat: number, lng: number) => void
  permits: Permit[]
  loading: boolean
  active: boolean
  activeId: string | null
  onHover: (id: string | null) => void
  onSelectPermit: (permit: Permit) => void
  onLocate: () => void
  locating: boolean
  geoError: string | null
}

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431]

export function PermitMap({
  center, radius, onRadiusChange, onCenterChange, permits, loading, active, activeId, onHover, onSelectPermit, onLocate, locating, geoError,
}: PermitMapProps) {
  const skipNextFit = useRef(false)

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

      <MapContainer center={AUSTIN_CENTER} zoom={12} scrollWheelZoom preferCanvas style={{ height: '100%' }}>
        <RefreshMapSize active={active} />
        <MoveSearchArea radius={radius} onMove={(lat, lng) => {
          skipNextFit.current = true
          onCenterChange(lat, lng)
        }} />
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
            <Recenter
              lat={center.lat}
              lng={center.lng}
              radius={radius}
              skipNextFit={skipNextFit}
            />
            <RadiusOverlay
              lat={center.lat}
              lng={center.lng}
              radius={radius}
              onRadiusChange={onRadiusChange}
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
                click: () => onSelectPermit(permit),
              }}
            >
              <Popup minWidth={380} maxWidth={440}>
                <div className="map__popup" data-kind={kind}>
                  <div className="map__popup-eyebrow">
                    <span className="map__popup-kind">
                      {permit.work_class ?? permit.permit_type_desc ?? 'Permit'}
                    </span>
                    <span className="map__popup-distance">{formatMapDistance(permit.distance_m)}</span>
                  </div>
                  <h3>{permit.address ?? 'Address not recorded'}</h3>
                  {permit.description && <p className="map__popup-description">{permit.description}</p>}
                  <div className="map__popup-meta">
                    {[formatMapDate(permit.issue_date), formatMapValue(permit.total_job_valuation), permit.status_current]
                      .filter(Boolean)
                      .map((item) => <span key={item}>{item}</span>)}
                  </div>
                  {permit.source_url && (
                    <a className="map__popup-link" href={permit.source_url} target="_blank" rel="noreferrer">
                      View city permit <span aria-hidden="true">↗</span>
                    </a>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {loading && <div className="map__loading" role="status">Updating map…</div>}

      <div className="map__move-hint">⌘/Ctrl-click map to move search</div>

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
