import { useEffect, useState } from 'react'
import { divIcon } from 'leaflet'
import { Circle, Marker, Tooltip, useMap } from 'react-leaflet'
import { RADIUS_STEPS, nearestRadiusStep } from '../../lib/geo'

const RADIUS_MIN = RADIUS_STEPS[0]
const RADIUS_MAX = RADIUS_STEPS[RADIUS_STEPS.length - 1]

const handleIcon = divIcon({
  className: 'radius-handle',
  html: '<span class="radius-handle__grip"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

/** The dashed search circle plus a grip on its eastern edge. Dragging previews a
 *  new radius; releasing snaps to the nearest of the four supported steps. */
export function RadiusHandle({
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

  const lngMeters = 111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.000001)
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
        icon={handleIcon}
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
