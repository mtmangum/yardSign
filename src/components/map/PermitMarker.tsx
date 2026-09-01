import { useEffect, useRef } from 'react'
import type { CircleMarker as LeafletCircleMarker } from 'leaflet'
import { CircleMarker, Popup } from 'react-leaflet'
import type { Permit } from '../../api/permits'
import { formatDate, formatDistance, formatValuation } from '../../lib/format'
import { KIND_COLOR, permitKind } from '../../lib/permitKind'

export function PermitMarker({
  permit, active, open, narrow, popupTopPadding, onHover, onSelect,
}: {
  permit: Permit
  active: boolean
  /** Selected from the sidebar - open this marker's popup. */
  open: boolean
  narrow: boolean
  popupTopPadding: [number, number]
  onHover: (id: string | null) => void
  onSelect: (permit: Permit) => void
}) {
  const kind = permitKind(permit)
  const markerRef = useRef<LeafletCircleMarker>(null)
  const meta = [formatDate(permit.issue_date), formatValuation(permit.total_job_valuation), permit.status_current]
    .filter(Boolean)

  useEffect(() => {
    if (open) markerRef.current?.openPopup()
  }, [open])

  return (
    <CircleMarker
      ref={markerRef}
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
        click: () => onSelect(permit),
      }}
    >
      <Popup
        key={narrow ? 'narrow' : 'wide'}
        minWidth={380}
        maxWidth={440}
        autoPanPaddingTopLeft={popupTopPadding}
        autoPanPaddingBottomRight={[16, 16]}
        keepInView
      >
        <div className="map__popup" data-kind={kind}>
          <div className="map__popup-eyebrow">
            <span className="map__popup-kind">
              {permit.work_class ?? permit.permit_type_desc ?? 'Permit'}
            </span>
            <span className="map__popup-distance">{formatDistance(permit.distance_m, true)}</span>
          </div>
          <h3>{permit.address ?? 'Address not recorded'}</h3>
          {permit.description && <p className="map__popup-description">{permit.description}</p>}
          <div className="map__popup-meta">
            {meta.map((item) => <span key={item}>{item}</span>)}
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
}
