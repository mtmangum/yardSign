import { useEffect, useRef } from 'react'
import type { Permit } from '../api/permits'
import { formatDate, formatDistance, formatValuation } from '../lib/format'
import { KIND_ORDER, permitKind, type PermitKind } from '../lib/permitKind'

interface PermitListProps {
  permits: Permit[]
  mappedCount: number
  total: number
  activeKinds: PermitKind[]
  onToggleKind: (kind: PermitKind) => void
  loading: boolean
  error: string | null
  hasLocation: boolean
  activeId: string | null
  focusId: string | null
  focusKey: string
  onHover: (id: string | null) => void
  onSelect: (permit: Permit) => void
}

const KIND_CHIP_LABEL: Record<PermitKind, string> = {
  demolition: 'Demolition', new: 'New', remodel: 'Remodel', other: 'Other',
}

const n = (value: number) => value.toLocaleString('en-US')

const animateScroll = (element: HTMLElement | Window, target: number) => {
  const start = element instanceof Window ? element.scrollY : element.scrollTop
  const distance = target - start
  if (Math.abs(distance) < 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.scrollTo({ top: target })
    return () => undefined
  }

  const started = performance.now()
  const duration = 220
  let frame = 0
  const tick = (now: number) => {
    const progress = Math.min((now - started) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    element.scrollTo({ top: start + distance * eased })
    if (progress < 1) frame = window.requestAnimationFrame(tick)
  }
  frame = window.requestAnimationFrame(tick)
  return () => window.cancelAnimationFrame(frame)
}

export function PermitList({ permits, mappedCount, total, activeKinds, onToggleKind, loading, error, hasLocation, activeId, focusId, focusKey, onHover, onSelect }: PermitListProps) {
  const focusedRow = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!focusId || !focusedRow.current) return
    const row = focusedRow.current
    const results = row.closest<HTMLElement>('.results')
    const mobile = window.matchMedia('(max-width: 860px)').matches
    if (mobile) {
      return animateScroll(window, window.scrollY + row.getBoundingClientRect().top - 64)
    }
    const summaryHeight = results?.querySelector<HTMLElement>('.results__summary')?.offsetHeight ?? 0
    return results ? animateScroll(results, row.offsetTop - summaryHeight) : undefined
  }, [focusId, focusKey, permits])

  if (!hasLocation) {
    return (
      <p className="results__status">
        Enter an address, or tap the crosshair on the map, to see what has been
        permitted nearby.
      </p>
    )
  }
  if (loading) return <p className="results__status">Checking the permit feed…</p>
  if (error) return <p className="results__status">{error}</p>

  const filtering = activeKinds.length > 0
  const kindCounts = permits.reduce<Record<PermitKind, number>>(
    (counts, permit) => {
      counts[permitKind(permit)] += 1
      return counts
    },
    { demolition: 0, new: 0, remodel: 0, other: 0 },
  )

  return (
    <>
      <div className="results__summary">
        <div className="results__count">
          <strong>{n(total)}</strong>
          <span>{total === 1 ? 'permit nearby' : 'permits nearby'}</span>
          {total > permits.length && (
            <small>{n(mappedCount)} mapped · {n(permits.length)} closest listed</small>
          )}
        </div>
        <div className="results__kinds" aria-label="Filter by permit type">
          {KIND_ORDER.map((kind) => (
            <button
              type="button"
              className="kind-count"
              data-kind={kind}
              aria-pressed={activeKinds.includes(kind)}
              key={kind}
              onClick={() => onToggleKind(kind)}
            >
              <i aria-hidden="true" />
              <span>{KIND_CHIP_LABEL[kind]}</span>
              {!filtering && <strong>{n(kindCounts[kind])}</strong>}
            </button>
          ))}
          {filtering && (
            <button
              type="button"
              className="results__clear"
              onClick={() => activeKinds.forEach(onToggleKind)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {permits.length === 0 ? (
        <p className="results__status">
          {filtering
            ? 'No permits of the selected type in this area and time window.'
            : 'No permits issued in this radius and time window. Try a wider radius.'}
        </p>
      ) : permits.map((permit) => {
        const valuation = formatValuation(permit.total_job_valuation)
        const issued = formatDate(permit.issue_date)
        return (
          <div
            key={permit.id}
            ref={focusId === permit.id ? focusedRow : undefined}
            className="permit-card"
            data-kind={permitKind(permit)}
            data-active={activeId === permit.id}
            onMouseEnter={() => onHover(permit.id)}
            onMouseLeave={() => onHover(null)}
          >
            <button type="button" className="permit" onClick={() => onSelect(permit)}>
              <div className="permit__head">
                <span className="permit__address">{permit.address ?? 'Address not recorded'}</span>
                <span className="permit__distance">{formatDistance(permit.distance_m)}</span>
              </div>
              <span className="permit__work">{permit.work_class ?? permit.permit_type_desc ?? 'Permit'}</span>
              {permit.description && <p className="permit__description">{permit.description}</p>}
              <div className="permit__meta">
                {[issued, valuation, permit.status_current].filter(Boolean).join(' · ')}
              </div>
            </button>
            {permit.source_url && (
              <a
                className="permit__link"
                href={permit.source_url}
                target="_blank"
                rel="noreferrer"
              >
                City permit record <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        )
      })}
    </>
  )
}
