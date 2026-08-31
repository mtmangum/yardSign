import { useEffect, type RefObject } from 'react'
import { useMap } from 'react-leaflet'
import { KIND_COLOR, KIND_LABEL, KIND_ORDER } from '../../lib/permitKind'

/** Fit the map to the search circle whenever the centre or radius changes, so
 *  changing the radius reframes the view. `skipNextFit` lets a dropped pin keep
 *  the user's current pan. */
export function Recenter({
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
    const lngMeters = 111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.000001)
    const mobile = map.getSize().x <= 860
    map.fitBounds(
      [
        [lat - radius / 111320, lng - radius / lngMeters],
        [lat + radius / 111320, lng + radius / lngMeters],
      ],
      { padding: mobile ? [0, 0] : [24, 24] },
    )
  }, [lat, lng, radius, map, skipNextFit])
  return null
}

/** Leaflet mis-measures a container that was hidden (mobile List view); nudge it
 *  once the map becomes active again. */
export function RefreshMapSize({ active }: { active: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!active) return
    const frame = window.requestAnimationFrame(() => map.invalidateSize())
    return () => window.cancelAnimationFrame(frame)
  }, [active, map])
  return null
}

export function MapLegend() {
  return (
    <div className="map__legend">
      {KIND_ORDER.map((kind) => (
        <div className="map__legend-row" key={kind}>
          <span className="map__legend-dot" style={{ background: KIND_COLOR[kind] }} />
          <span>{KIND_LABEL[kind]}</span>
        </div>
      ))}
    </div>
  )
}
