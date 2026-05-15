'use client'
import { useRef, useState, useEffect, useCallback } from 'react'

interface PullToRefreshContainerProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  disabled?: boolean
}

type PTRState = 'idle' | 'pulling' | 'refreshing'

const THRESHOLD = 80
const MAX_PULL = 120

export function PullToRefreshContainer({ onRefresh, children, disabled }: PullToRefreshContainerProps) {
  const [state, setState] = useState<PTRState>('idle')
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled) return
    // Only trigger if scrolled to top
    const el = containerRef.current
    if (!el) return
    const scrollTop = el.scrollTop ?? 0
    if (scrollTop > 0) return
    startY.current = e.touches[0].clientY
  }, [disabled])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current === null || disabled) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) { startY.current = null; return }
    // Prevent default scroll only when pulling
    e.preventDefault()
    const dist = Math.min(dy * 0.5, MAX_PULL)
    setPullDistance(dist)
    setState(dist >= THRESHOLD ? 'pulling' : 'pulling')
  }, [disabled])

  const handleTouchEnd = useCallback(async () => {
    if (startY.current === null) return
    startY.current = null
    if (pullDistance >= THRESHOLD) {
      setState('refreshing')
      setPullDistance(THRESHOLD)
      try { await onRefresh() } finally {
        setState('idle')
        setPullDistance(0)
      }
    } else {
      setState('idle')
      setPullDistance(0)
    }
  }, [pullDistance, onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  const indicatorY = state === 'refreshing' ? THRESHOLD : pullDistance
  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const showIndicator = pullDistance > 8 || state === 'refreshing'

  return (
    <div ref={containerRef} style={{ position: 'relative', overflowY: 'auto', height: '100%', WebkitOverflowScrolling: 'touch' }}>
      {/* Pull indicator */}
      {showIndicator && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: indicatorY,
            transition: state === 'refreshing' ? 'height 0.2s ease' : 'none',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            opacity: progress,
            transform: `scale(${0.6 + progress * 0.4})`,
            transition: state === 'refreshing' ? 'opacity 0.2s' : 'none',
          }}>
            {state === 'refreshing' ? (
              <>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  border: '2px solid rgba(139,92,246,0.3)',
                  borderTopColor: '#8B5CF6',
                  animation: 'ptr-spin 0.6s linear infinite',
                }} />
                <span style={{ fontSize: 11, color: '#8B5CF6', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>ОБНОВЛЕНИЕ…</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{
                  fontSize: 20, color: '#8B5CF6',
                  transform: progress >= 1 ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}>arrow_downward</span>
                <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.06em' }}>
                  {progress >= 1 ? 'ОТПУСТИТЕ' : 'ПОТЯНИТЕ ВНИЗ'}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content with push-down during pull */}
      <div style={{
        transform: state !== 'idle' ? `translateY(${indicatorY}px)` : 'translateY(0)',
        transition: state === 'idle' ? 'transform 0.3s ease' : state === 'refreshing' ? 'transform 0.2s ease' : 'none',
      }}>
        {children}
      </div>

      <style>{`
        @keyframes ptr-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
