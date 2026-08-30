import { useEffect, useState } from 'react'
import { geocodeAddress, type AddressMatch } from '../api/permits'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

interface AddressSearchProps {
  onSelect: (match: AddressMatch) => void
  selectedLabel: string | null
  onLocate: () => void
  locating: boolean
  geoError: string | null
}

export function AddressSearch({ onSelect, selectedLabel, onLocate, locating, geoError }: AddressSearchProps) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<AddressMatch[]>([])
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebouncedValue(query, 350)

  useEffect(() => {
    if (debouncedQuery.trim().length < 5) {
      setMatches([])
      return
    }
    const controller = new AbortController()
    geocodeAddress(debouncedQuery, controller.signal)
      .then((results) => {
        setMatches(results)
        setOpen(results.length > 0)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [debouncedQuery])

  const select = (match: AddressMatch) => {
    onSelect(match)
    setQuery('')
    setMatches([])
    setOpen(false)
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor="address">Address</label>
      <div className="address-row">
        <input
          id="address"
          className="field__input"
          placeholder={selectedLabel ?? '1100 Congress Ave'}
          value={query}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(matches.length > 0)}
        />
        <button
          type="button"
          className="locate"
          onClick={onLocate}
          disabled={locating}
          aria-label="Search from my location"
          title="Search from my location"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" fill="currentColor" />
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
          </svg>
        </button>
      </div>
      {open && (
        <ul className="suggestions">
          {matches.map((match) => (
            <li key={`${match.lat},${match.lng},${match.label}`}>
              <button type="button" className="suggestions__item" onClick={() => select(match)}>
                {match.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {geoError && <p className="locate__error" role="alert">{geoError}</p>}
    </div>
  )
}
