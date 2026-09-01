import { useState } from 'react'
import { divIcon } from 'leaflet'
import { Circle, Marker, Tooltip } from 'react-leaflet'

const pinIcon = divIcon({
  className: 'center-pin',
  html:
    '<svg viewBox="0 0 28 38" width="28" height="38" aria-hidden="true">'
    + '<path class="center-pin__body" d="M14 1.5C7 1.5 1.5 7 1.5 14c0 9.2 12.5 22 12.5 22S26.5 23.2 26.5 14C26.5 7 21 1.5 14 1.5z"/>'
    + '<circle class="center-pin__eye" cx="14" cy="14" r="4.4"/>'
    + '</svg>',
  iconSize: [28, 38],
  iconAnchor: [14, 36],
})

// Matches the ghost perimeter MoveSearchArea draws for the ⌘-click / press-hold
// gestures, so every way of moving the search previews the same way.
const PREVIEW_STYLE = {
  color: '#ec3013',
  weight: 2,
  opacity: 0.72,
  fillColor: '#ec3013',
  fillOpacity: 0.045,
  dashArray: '7 7',
}

/** The search centre as a grab-and-drag pin - the discoverable way to move the
 *  search, alongside the ⌘/Ctrl-click and press-hold gestures in
 *  MoveSearchArea. Dragging previews the new area in red; releasing commits. */
export function CenterPin({
  lat, lng, radius, onCommit,
}: {
  lat: number
  lng: number
  radius: number
  onCommit: (lat: number, lng: number) => void
}) {
  const [preview, setPreview] = useState<[number, number] | null>(null)

  return (
    <>
      {preview && (
        <Circle center={preview} radius={radius} interactive={false} pathOptions={PREVIEW_STYLE} />
      )}
      <Marker
        position={[lat, lng]}
        icon={pinIcon}
        draggable
        keyboard={false}
        zIndexOffset={1000}
        eventHandlers={{
          drag: (event) => {
            const point = event.target.getLatLng()
            setPreview([point.lat, point.lng])
          },
          dragend: (event) => {
            const point = event.target.getLatLng()
            setPreview(null)
            onCommit(point.lat, point.lng)
          },
        }}
      >
        <Tooltip className="radius-tooltip" direction="top" offset={[0, -32]}>
          <strong>Move the search</strong>
          <span>Drag this pin</span>
        </Tooltip>
      </Marker>
    </>
  )
}
