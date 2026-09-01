import { useEffect, useRef } from 'react'
import type { CircleMarker as LeafletCircleMarker } from 'leaflet'
import { CircleMarker, Popup } from 'react-leaflet'
import type { Permit } from '../../api/permits'
import { formatDate, formatDistance, formatValuation, permitClassLabel, permitFacts } from '../../lib/format'
import { KIND_COLOR, permitKind } from '../../lib/permitKind'

export function PermitMarker({
  permit, active, open, narrow, popupTopPadding, onHover, onSelect, onDeselect,
}: {
  permit: Permit
  active: boolean
  /** Selected from the sidebar - open this marker's popup. */
  open: boolean
  narrow: boolean
  popupTopPadding: [number, number]
  onHover: (id: string | null) => void
  onSelect: (permit: Permit) => void
  onDeselect: () => void
}) {
  const kind = permitKind(permit)
  const markerRef = useRef<LeafletCircleMarker>(null)
  const openRef = useRef(open)
  openRef.current = open
  const applied = formatDate(permit.applied_date)
  const issued = formatDate(permit.issue_date)
  const meta = [
    applied && `Applied ${applied}`,
    issued && `Issued ${issued}`,
    formatValuation(permit.total_job_valuation),
    permit.status_current,
  ].filter(Boolean)
  const eyebrow = permit.work_class ?? permit.permit_type_desc ?? 'Permit'
  const classLabel = permitClassLabel(permit.permit_class)
  const facts = permitFacts(permit)

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
        // Fires on the × button and on Esc. Ignore the close Leaflet does when
        // another marker's popup opens (this one is no longer `open` by then).
        popupclose: () => { if (openRef.current) onDeselect() },
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
            <span className="map__popup-kind">{eyebrow}</span>
            <span className="map__popup-distance">{formatDistance(permit.distance_m, true)}</span>
          </div>
          <h3>{permit.address ?? 'Address not recorded'}</h3>
          {classLabel && classLabel.toLowerCase() !== eyebrow.toLowerCase() && (
            <p className="map__popup-class">{classLabel}</p>
          )}
          {permit.description && <p className="map__popup-description">{permit.description}</p>}
          {facts.length > 0 && <div className="map__popup-facts">{facts.join(' · ')}</div>}
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
