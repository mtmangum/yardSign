import { useEffect, useRef, useState } from 'react'
import { Circle, useMap, useMapEvents } from 'react-leaflet'

const PREVIEW_STYLE = {
  color: '#ec3013',
  weight: 2,
  opacity: 0.72,
  fillColor: '#ec3013',
  fillOpacity: 0.045,
  dashArray: '7 7',
}

/** Reposition the search centre without panning the basemap:
 *   - desktop: ⌘/Ctrl-hover previews, ⌘/Ctrl-click commits
 *   - touch: press and hold 400 ms, drag the ghost perimeter, release to commit
 *  A quick swipe still pans normally. */
export function MoveSearchArea({
  radius, onMove,
}: {
  radius: number
  onMove: (lat: number, lng: number) => void
}) {
  const map = useMap()
  const [previewCenter, setPreviewCenter] = useState<[number, number] | null>(null)
  const previewFrame = useRef<number | null>(null)
  const pendingPreview = useRef<[number, number] | null>(null)
  const suppressClickUntil = useRef(0)

  // Coalesce preview updates to one per frame - pointermove / mousemove fire far
  // faster than we need to redraw the ghost circle.
  const queuePreview = (center: [number, number] | null) => {
    pendingPreview.current = center
    if (previewFrame.current !== null) return
    previewFrame.current = window.requestAnimationFrame(() => {
      previewFrame.current = null
      setPreviewCenter(pendingPreview.current)
    })
  }

  useEffect(() => {
    const clearPreview = (event: KeyboardEvent) => {
      if (event.key === 'Meta' || event.key === 'Control') queuePreview(null)
    }
    const clearOnBlur = () => queuePreview(null)
    window.addEventListener('keyup', clearPreview)
    window.addEventListener('blur', clearOnBlur)
    return () => {
      window.removeEventListener('keyup', clearPreview)
      window.removeEventListener('blur', clearOnBlur)
      if (previewFrame.current !== null) window.cancelAnimationFrame(previewFrame.current)
    }
  }, [])

  useEffect(() => {
    const container = map.getContainer()
    let holdTimer: number | null = null
    let touch: {
      pointerId: number
      startX: number
      startY: number
      center: [number, number]
      active: boolean
    } | null = null

    const clearHold = () => {
      if (holdTimer !== null) window.clearTimeout(holdTimer)
      holdTimer = null
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return
      if ((event.target as Element).closest('.leaflet-control, .leaflet-marker-icon, a, button')) return
      const point = map.mouseEventToLatLng(event)
      touch = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        center: [point.lat, point.lng],
        active: false,
      }
      holdTimer = window.setTimeout(() => {
        if (!touch) return
        touch.active = true
        map.dragging.disable()
        queuePreview(touch.center)
        navigator.vibrate?.(10)
      }, 400)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!touch || event.pointerId !== touch.pointerId) return
      const point = map.mouseEventToLatLng(event)
      touch.center = [point.lat, point.lng]
      if (!touch.active) {
        if (Math.hypot(event.clientX - touch.startX, event.clientY - touch.startY) > 10) {
          clearHold()
          touch = null
        }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      queuePreview(touch.center)
    }

    const finishTouch = (event: PointerEvent) => {
      if (!touch || event.pointerId !== touch.pointerId) return
      clearHold()
      const finished = touch
      touch = null
      if (!finished.active) return
      event.preventDefault()
      event.stopPropagation()
      suppressClickUntil.current = performance.now() + 500
      map.dragging.enable()
      queuePreview(null)
      if (event.type === 'pointerup') onMove(finished.center[0], finished.center[1])
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove, { passive: false })
    container.addEventListener('pointerup', finishTouch)
    container.addEventListener('pointercancel', finishTouch)
    return () => {
      clearHold()
      map.dragging.enable()
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', finishTouch)
      container.removeEventListener('pointercancel', finishTouch)
    }
  }, [map, onMove])

  useMapEvents({
    mousemove: (event) => {
      const pointer = event.originalEvent as MouseEvent
      queuePreview(pointer.metaKey || pointer.ctrlKey ? [event.latlng.lat, event.latlng.lng] : null)
    },
    mouseout: () => queuePreview(null),
    click: (event) => {
      if (performance.now() < suppressClickUntil.current) return
      const pointer = event.originalEvent as MouseEvent
      if (!pointer.metaKey && !pointer.ctrlKey) return
      pointer.preventDefault()
      queuePreview(null)
      onMove(event.latlng.lat, event.latlng.lng)
    },
  })

  return previewCenter
    ? <Circle center={previewCenter} radius={radius} interactive={false} pathOptions={PREVIEW_STYLE} />
    : null
}
