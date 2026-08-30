import { useEffect, useState } from 'react'
import { geocodeAddress, type AddressMatch } from '../api/permits'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

interface AddressSearchProps {
  onSelect: (match: AddressMatch) => void
  selectedLabel: string | null
}

export function AddressSearch({ onSelect, selectedLabel }: AddressSearchProps) {
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
      <input
        id="address"
        className="field__input"
        placeholder={selectedLabel ?? '1100 Congress Ave'}
        value={query}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(matches.length > 0)}
      />
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
    </div>
  )
}
