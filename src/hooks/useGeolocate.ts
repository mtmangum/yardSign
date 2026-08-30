import { useState } from 'react'

// Matches the /api/permits guard, so an off-Austin fix is rejected before the
// request rather than after a 400.
const inAustin = (lat: number, lng: number) => lat >= 29.5 && lat <= 31 && lng >= -98.5 && lng <= -97

interface Geolocate {
  locate: () => void
  locating: boolean
  error: string | null
}

/** Shared "search from my location" behaviour for the panel button and the map
 *  crosshair. `onLocate` gets Austin-area coordinates only. */
export function useGeolocate(onLocate: (coords: { lat: number; lng: number }) => void): Geolocate {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locate = () => {
    if (!navigator.geolocation) {
      setError('This browser cannot share a location.')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false)
        if (!inAustin(coords.latitude, coords.longitude)) {
          setError('You seem to be outside the Austin area.')
          return
        }
        onLocate({ lat: coords.latitude, lng: coords.longitude })
      },
      (geoError) => {
        setLocating(false)
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? 'Location access was denied.'
            : 'Could not get your location.',
        )
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return { locate, locating, error }
}
