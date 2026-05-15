'use client'
import { useRef, useState } from 'react'

interface SwipeableRowProps {
  onDelete: () => void
  children: React.ReactNode
}

export function SwipeableRow({ onDelete, children }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0)
  const startX = useRef<number | null>(null)
  const swiping = useRef(false)

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    swiping.current = false
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null) return
    const dx = startX.current - e.touches[0].clientX
    if (dx > 0) {
      swiping.current = true
      setOffset(Math.min(dx, 80))
    }
  }

  function onTouchEnd() {
    if (offset > 50) {
      onDelete()
      setOffset(0)
    } else {
      setOffset(0)
    }
    startX.current = null
    swiping.current = false
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Красный фон — виден только во время свайпа */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 80,
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          opacity: Math.min(offset / 40, 1),
          transition: offset === 0 ? 'opacity 0.25s ease' : 'none',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            color: '#fff',
            fontSize: 22,
            fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24",
          }}
        >
          delete
        </span>
      </div>

      {/* Контент со смещением */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(-${offset}px)`,
          transition: offset === 0 ? 'transform 0.25s ease' : 'none',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  )
}
