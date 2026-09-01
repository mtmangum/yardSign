import { useRef } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import type { Permit } from '../../api/permits'
import { useIsNarrow } from '../../hooks/useIsNarrow'
import { MoveSearchArea } from './MoveSearchArea'
import { PermitMarker } from './PermitMarker'
import { RadiusHandle } from './RadiusHandle'
import { MapLegend, Recenter, RefreshMapSize } from './mapControls'

const AUSTIN_CENTER: [number, number] = [30.2672, -97.7431]

// Stadia Maps "Alidade Smooth": a desaturated basemap so the markers carry the
// colour. Keyless from localhost; production sets VITE_STADIA_API_KEY (a free,
// domain-restricted key). CARTO Voyager was dropped once CARTO started
// watermarking keyless requests.
const TILE_URL = `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png${
  import.meta.env.VITE_STADIA_API_KEY ? `?api_key=${import.meta.env.VITE_STADIA_API_KEY}` : ''
}`
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

interface PermitMapProps {
  center: { lat: number; lng: number } | null
  radius: number
  onRadiusChange: (radius: number) => void
  onCenterChange: (lat: number, lng: number) => void
  permits: Permit[]
  loading: boolean
  active: boolean
  activeId: string | null
  /** Permit selected from the sidebar - its marker popup opens. */
  selectedId: string | null
  onHover: (id: string | null) => void
  onSelectPermit: (permit: Permit) => void
  onDeselectPermit: () => void
  onLocate: () => void
  locating: boolean
  geoError: string | null
}

export function PermitMap({
  center, radius, onRadiusChange, onCenterChange, permits, loading, active, activeId, selectedId,
  onHover, onSelectPermit, onDeselectPermit, onLocate, locating, geoError,
}: PermitMapProps) {
  const skipNextFit = useRef(false)
  const narrow = useIsNarrow()
  const popupTopPadding: [number, number] = narrow ? [16, 164] : [24, 24]

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

      <MapContainer center={AUSTIN_CENTER} zoom={12} zoomSnap={0} scrollWheelZoom preferCanvas style={{ height: '100%' }}>
        <RefreshMapSize active={active} />
        <MoveSearchArea
          radius={radius}
          onMove={(lat, lng) => {
            skipNextFit.current = true
            onCenterChange(lat, lng)
          }}
        />
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />

        {center && (
          <>
            <Recenter lat={center.lat} lng={center.lng} radius={radius} skipNextFit={skipNextFit} />
            <RadiusHandle lat={center.lat} lng={center.lng} radius={radius} onRadiusChange={onRadiusChange} />
          </>
        )}

        {permits.map((permit) => (
          <PermitMarker
            key={permit.id}
            permit={permit}
            active={activeId === permit.id}
            open={selectedId === permit.id}
            narrow={narrow}
            popupTopPadding={popupTopPadding}
            onHover={onHover}
            onSelect={onSelectPermit}
            onDeselect={onDeselectPermit}
          />
        ))}
      </MapContainer>

      {loading && <div className="map__loading" role="status">Updating map…</div>}
      <div className="map__move-hint">⌘/Ctrl-click map to move search</div>
      <div className="map__touch-hint">Press and hold map to move search</div>
      <MapLegend />
    </div>
  )
}
