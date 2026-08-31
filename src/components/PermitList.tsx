import { useEffect, useRef } from 'react'
import type { Permit } from '../api/permits'
import { formatDate, formatDistance, formatValuation } from '../lib/format'
import { KIND_ORDER, permitKind, type PermitKind } from '../lib/permitKind'

interface PermitListProps {
  permits: Permit[]
  mappedCount: number
  total: number
  loading: boolean
  error: string | null
  hasLocation: boolean
  activeId: string | null
  focusId: string | null
  focusKey: string
  onHover: (id: string | null) => void
  onSelect: (permit: Permit) => void
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

export function PermitList({ permits, mappedCount, total, loading, error, hasLocation, activeId, focusId, focusKey, onHover, onSelect }: PermitListProps) {
  const focusedRow = useRef<HTMLButtonElement | null>(null)

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
  if (permits.length === 0) {
    return <p className="results__status">No permits issued in this radius and time window. Try a wider radius.</p>
  }

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
        <div className="results__kinds" aria-label="Permit types in the visible results">
          {KIND_ORDER.map((kind) => (
            <span className="kind-count" data-kind={kind} key={kind}>
              <i aria-hidden="true" />
              <span>{kind === 'new' ? 'New' : kind[0].toUpperCase() + kind.slice(1)}</span>
              <strong>{n(kindCounts[kind])}</strong>
            </span>
          ))}
        </div>
      </div>
      {permits.map((permit) => {
        const valuation = formatValuation(permit.total_job_valuation)
        const issued = formatDate(permit.issue_date)
        return (
          <button
            type="button"
            ref={focusId === permit.id ? focusedRow : undefined}
            key={permit.id}
            className="permit"
            data-kind={permitKind(permit)}
            data-active={activeId === permit.id}
            onMouseEnter={() => onHover(permit.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(permit)}
          >
            <div className="permit__head">
              <span className="permit__address">{permit.address ?? 'Address not recorded'}</span>
              <span className="permit__distance">
                {formatDistance(permit.distance_m)}
                {permit.source_url && <span className="permit__external" aria-hidden="true"> ↗</span>}
              </span>
            </div>
            <span className="permit__work">{permit.work_class ?? permit.permit_type_desc ?? 'Permit'}</span>
            {permit.description && <p className="permit__description">{permit.description}</p>}
            <div className="permit__meta">
              {[issued, valuation, permit.status_current].filter(Boolean).join(' · ')}
            </div>
          </button>
        )
      })}
    </>
  )
}
