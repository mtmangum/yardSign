import type { Permit } from '../api/permits'

// Work classes in the Austin feed are free text with dozens of values.
// Collapse them to the three a neighbor actually reacts to, plus everything else.
export function permitKind(permit: Permit): 'demolition' | 'new' | 'remodel' | 'other' {
  const work = `${permit.work_class ?? ''} ${permit.permit_type_desc ?? ''}`.toLowerCase()
  if (work.includes('demolition') || work.includes('demo')) return 'demolition'
  if (work.includes('new')) return 'new'
  if (work.includes('remodel') || work.includes('addition') || work.includes('repair')) return 'remodel'
  return 'other'
}

const milesFrom = (meters: number) => `${(meters / 1609.34).toFixed(2)} mi`

const formatValuation = (value: number | null) =>
  value && value > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
    : null

const formatDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

interface PermitListProps {
  permits: Permit[]
  loading: boolean
  error: string | null
  hasLocation: boolean
  activeId: string | null
  onHover: (id: string | null) => void
  onSelect: (permit: Permit) => void
}

export function PermitList({ permits, loading, error, hasLocation, activeId, onHover, onSelect }: PermitListProps) {
  if (!hasLocation) {
    return <p className="results__status">Enter an address to see what has been permitted nearby.</p>
  }
  if (loading) return <p className="results__status">Checking the permit feed…</p>
  if (error) return <p className="results__status">{error}</p>
  if (permits.length === 0) {
    return <p className="results__status">No permits issued in this radius and time window. Try a wider radius.</p>
  }

  return (
    <>
      <div className="results__count">
        {permits.length} permit{permits.length === 1 ? '' : 's'}
      </div>
      {permits.map((permit) => {
        const valuation = formatValuation(permit.total_job_valuation)
        const issued = formatDate(permit.issue_date)
        return (
          <button
            type="button"
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
              <span className="permit__distance">{milesFrom(permit.distance_m)}</span>
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
