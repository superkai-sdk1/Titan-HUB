'use client'
import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion'
import { Icon } from '@/components/Icon'

// ─── Style constants ────────────────────────────────────────────────────────

export const INP: React.CSSProperties = {
  width: '100%', minHeight: 48, padding: '13px 16px', borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--on-surface)', fontSize: 15, outline: 'none',
  boxSizing: 'border-box' as const,
  transition: 'border-color 0.2s, box-shadow 0.2s',
}

export const SEL: React.CSSProperties = {
  width: '100%', minHeight: 48, padding: '13px 16px', borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(29,26,36,0.8)',
  color: 'var(--on-surface)', fontSize: 15, outline: 'none', cursor: 'pointer',
  boxSizing: 'border-box' as const,
}

export const LBL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase' as const, letterSpacing: '0.08em',
  color: 'var(--on-surface-variant)', margin: '0 0 8px', display: 'block',
}

// ─── Toggle ─────────────────────────────────────────────────────────────────

export function Toggle({
  value, onChange, color = '#8B5CF6', size = 'md', ariaLabel,
}: {
  value: boolean
  onChange: (v: boolean) => void
  color?: string
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  const d = size === 'sm'
    ? { w: 44, h: 24, knob: 18, on: 23 }
    : { w: 52, h: 28, knob: 22, on: 27 }
  return (
    <div
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={() => onChange(!value)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!value) } }}
      style={{
        width: d.w, height: d.h, borderRadius: d.h / 2,
        background: value ? `linear-gradient(135deg, ${color}, #4cd7f6)` : 'rgba(255,255,255,0.1)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.25s, box-shadow 0.25s',
        flexShrink: 0,
        boxShadow: value ? `0 0 16px ${color}66, inset 0 1px 1px rgba(255,255,255,0.25)` : 'inset 0 1px 2px rgba(0,0,0,0.35)',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? d.on : 3,
        width: d.knob, height: d.knob, borderRadius: '50%',
        background: 'linear-gradient(180deg, #ffffff, #e9e6f0)', transition: 'left 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)',
      }} />
    </div>
  )
}

// ─── Sheet (унифицированный модальный компонент) ────────────────────────────
//
// Поведение:
// • Mobile (<768px): bottom sheet с интерактивной высотой 1:1 с пальцем
// • Desktop (≥768px): centered modal с adaptive height по контенту
// • У самого верха списка тяга вверх растит панель до maxHeight (ровно за
//   пальцем, без снапа), дальше — нативный скролл; тяга вниз сжимает до базы
// • Тяга вниз у базовой высоты (или за ручку) — закрытие

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /**
   * Высота на которой sheet открывается изначально на мобильном (default '60dvh').
   * При скролле списка вверх sheet расширяется до maxHeight.
   */
  initialHeight?: string
  /**
   * Максимальная высота (default '90dvh'). Sheet может expand'иться до неё.
   */
  maxHeight?: string
  /**
   * Размер на десктопе (default 'md'). Sm = 420px, md = 520px, lg = 680px.
   */
  desktopSize?: 'sm' | 'md' | 'lg'
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isDesktop
}

const DESKTOP_WIDTHS = { sm: 420, md: 520, lg: 680 }

export function Sheet({
  open, onClose, title, children,
  initialHeight = '60dvh',
  maxHeight = '90dvh',
  desktopSize = 'md',
}: SheetProps) {
  const isDesktop = useIsDesktop()
  const scrollRef = useRef<HTMLDivElement>(null)
  // Высота панели в px — управляется жестом 1:1 с пальцем (motion value, без
  // CSS-transition, чтобы рост/сжатие шли ровно за пальцем).
  const sheetH = useMotionValue(typeof window !== 'undefined' ? window.innerHeight * 0.6 : 480)
  // Смещение вниз при свайпе-закрытии.
  const dragY = useMotionValue(0)

  // Пиксельные границы высоты из initialHeight/maxHeight (поддержка dvh/vh/px).
  const dimsRef = useRef({ initial: 0, max: 0 })
  const computeDims = useCallback(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const toPx = (s: string) => {
      const n = parseFloat(s) || 0
      return s.includes('px') ? n : (vh * n) / 100
    }
    dimsRef.current = { initial: toPx(initialHeight), max: toPx(maxHeight) }
  }, [initialHeight, maxHeight])

  useEffect(() => {
    if (!open) return
    computeDims()
    sheetH.set(dimsRef.current.initial)
    dragY.set(0)
    const onResize = () => {
      computeDims()
      const { initial, max } = dimsRef.current
      sheetH.set(Math.min(Math.max(sheetH.get(), initial), max))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, computeDims, sheetH, dragY])

  // Блокируем скролл body когда sheet открыт (предотвращаем background scroll)
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const DISMISS_THRESHOLD = 110
  const DISMISS_VELOCITY = 600
  // Overlay затухает при свайпе-закрытии.
  const overlayOpacity = useTransform(dragY, [0, 280], [1, 0])

  const close = useCallback(() => {
    animate(dragY, dimsRef.current.max + 240, { duration: 0.25, ease: [0.32, 0.72, 0, 1] }).then(onClose)
  }, [dragY, onClose])

  // ── Жест по контенту (touch): у самого верха тянем — растим/сжимаем панель
  //    1:1 с пальцем; дальше — нативный скролл. Палец вниз у верха на базовой
  //    высоте — закрытие.
  const gRef = useRef<{ y0: number; st0: number; h0: number; mode: 'none' | 'grow' | 'shrink' | 'dismiss' | 'scroll' } | null>(null)

  const onTouchStart = useCallback((e: TouchEvent) => {
    const el = scrollRef.current
    gRef.current = { y0: e.touches[0].clientY, st0: el?.scrollTop ?? 0, h0: sheetH.get(), mode: 'none' }
  }, [sheetH])

  const onTouchMove = useCallback((e: TouchEvent) => {
    const g = gRef.current
    if (!g) return
    const dy = e.touches[0].clientY - g.y0
    const { initial, max } = dimsRef.current
    if (g.mode === 'none') {
      if (Math.abs(dy) < 4) return
      const atTop = g.st0 <= 0
      if (dy < 0) g.mode = atTop && g.h0 < max - 1 ? 'grow' : 'scroll'
      else g.mode = atTop ? (g.h0 > initial + 1 ? 'shrink' : 'dismiss') : 'scroll'
    }
    if (g.mode === 'scroll') return
    if (e.cancelable) e.preventDefault()
    if (g.mode === 'grow' || g.mode === 'shrink') {
      sheetH.set(Math.min(max, Math.max(initial, g.h0 - dy)))
    } else if (g.mode === 'dismiss') {
      dragY.set(Math.max(0, dy))
    }
  }, [sheetH, dragY])

  const onTouchEnd = useCallback(() => {
    const g = gRef.current
    gRef.current = null
    if (g && g.mode === 'dismiss') {
      if (dragY.get() > DISMISS_THRESHOLD) close()
      else animate(dragY, 0, { type: 'spring', damping: 34, stiffness: 360 })
    }
  }, [dragY, close])

  // touchmove навешиваем non-passive — иначе preventDefault не отменит нативный скролл.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || isDesktop || !open) return
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [isDesktop, open, onTouchStart, onTouchMove, onTouchEnd])

  // ── Жест по «ручке» (onPan — работает и мышью): резайз + закрытие 1:1.
  const handleH0 = useRef(0)
  const onHandlePanStart = useCallback(() => { handleH0.current = sheetH.get() }, [sheetH])
  const onHandlePan = useCallback((_: PointerEvent, info: PanInfo) => {
    const { initial, max } = dimsRef.current
    const target = handleH0.current - info.offset.y
    if (target < initial) { sheetH.set(initial); dragY.set(initial - target) }
    else { dragY.set(0); sheetH.set(Math.min(max, target)) }
  }, [sheetH, dragY])
  const onHandlePanEnd = useCallback((_: PointerEvent, info: PanInfo) => {
    if (dragY.get() > DISMISS_THRESHOLD || info.velocity.y > DISMISS_VELOCITY) close()
    else animate(dragY, 0, { type: 'spring', damping: 34, stiffness: 360 })
  }, [dragY, close])

  // ── Desktop variant: centered modal с адаптивной высотой ────────────────
  if (isDesktop) {
    const width = DESKTOP_WIDTHS[desktopSize]
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
            }}
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 360 }}
              style={{
                width: `min(${width}px, 100%)`,
                maxHeight: 'min(85vh, 720px)',
                borderRadius: 20,
                boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'rgba(29, 24, 40, 0.98)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {title && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '20px 24px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}>
                  <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, #C4B5FD, #4cd7f6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.01em' }}>{title}</h2>
                  <button onClick={onClose} aria-label="Закрыть" style={{
                    width: 32, height: 32, borderRadius: 9,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--on-surface-variant)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              )}
              <div ref={scrollRef} style={{
                overflowY: 'auto',
                overflowX: 'hidden',
                overscrollBehavior: 'contain',
                padding: '20px 24px 24px',
                flex: 1,
                minWidth: 0,
              }}>
                {children}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  // ── Mobile variant: интерактивный bottom sheet (высота 1:1 с пальцем) ──────
  return (
    <AnimatePresence onExitComplete={() => animate(dragY, 0, { duration: 0 })}>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{
              opacity: overlayOpacity,
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
            onClick={onClose}
          />

          {/* Sheet panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320, restDelta: 0.5 }}
            style={{
              position: 'fixed',
              bottom: 0, left: 0, right: 0,
              zIndex: 101,
            }}
          >
            <motion.div
              style={{
                y: dragY,
                width: '100%',
                maxWidth: 560,
                margin: '0 auto',
                height: sheetH,
                background: 'rgba(29, 24, 40, 0.96)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Ручка — резайз/закрытие 1:1 (onPan не трансформирует сам элемент) */}
              <motion.div
                onPanStart={onHandlePanStart}
                onPan={onHandlePan}
                onPanEnd={onHandlePanEnd}
                style={{
                  padding: '12px 24px 6px',
                  cursor: 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: 44, height: 5,
                  background: 'linear-gradient(90deg, rgba(139,92,246,0.5), rgba(76,215,246,0.5))',
                  borderRadius: 4,
                  margin: '0 auto',
                }} />
              </motion.div>

              {/* Header (если задан title) */}
              {title && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 22px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}>
                  <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, #C4B5FD, #4cd7f6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.01em' }}>{title}</h2>
                  <button onClick={onClose} aria-label="Закрыть" style={{
                    width: 30, height: 30, borderRadius: 9,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--on-surface-variant)',
                  }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
              )}

              {/* Scrollable content — нативный скролл; у верха жест растит/сжимает панель */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-y',
                  // Нижний отступ учитывает плавающую нижнюю навигацию (--bottom-nav-clear),
                  // иначе последний элемент (кнопка «Сохранить») оставался под панелью и
                  // его нельзя было домотать/нажать.
                  padding: '18px 22px calc(24px + var(--bottom-nav-clear, 96px))',
                }}
              >
                {children}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── PageHeader ──────────────────────────────────────────────────────────────

export function PageHeader({
  title, subtitle, action, onBack,
}: {
  title: string
  subtitle?: string
  action?: { label: string; icon: string; onClick: () => void }
  onBack?: () => void
}) {
  const router = useRouter()

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      background: 'rgba(21,18,27,0.95)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      padding: '16px 20px',
    }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.4), rgba(76,215,246,0.3), transparent)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        <button
          onClick={onBack ?? (() => router.back())}
          aria-label="Назад"
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.9)' }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0, transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1), border-color 0.2s', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          <Icon name="arrow_back" size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.01em', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'linear-gradient(135deg, #A78BFA, #4cd7f6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{subtitle}</p>}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.95)' }}
            onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #9D6CFF 0%, #8B5CF6 42%, #4cd7f6 130%)', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0, boxShadow: '0 6px 22px rgba(139,92,246,0.38), inset 0 1px 0 rgba(255,255,255,0.28)', transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
          >
            <Icon name={action.icon} size={18} />
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── SectionGroup ────────────────────────────────────────────────────────────

export function SectionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ ...LBL, marginBottom: 10, paddingLeft: 4 }}>{title}</p>
      <div className="glass-l2" style={{ borderRadius: 18, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ─── FormField ───────────────────────────────────────────────────────────────

export function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LBL}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '6px 0 0' }}>{hint}</p>}
    </div>
  )
}

// ─── ToggleRow ───────────────────────────────────────────────────────────────

export function ToggleRow({
  label, subtitle, value, onChange, color,
}: {
  label: string
  subtitle?: string
  value: boolean
  onChange: (v: boolean) => void
  color?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: 'var(--on-surface)' }}>{label}</p>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      <Toggle value={value} onChange={onChange} color={color} />
    </div>
  )
}

// ─── StatChip ────────────────────────────────────────────────────────────────

export function StatChip({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: `linear-gradient(160deg, ${color}1f, ${color}0a)`, border: `1px solid ${color}33`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)`, minWidth: 72 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color, fontStyle: 'italic', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 4, fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

// ─── SaveButton ──────────────────────────────────────────────────────────────

export function SaveButton({
  onClick, isPending, isSaved, label = 'Сохранить',
}: {
  onClick: () => void
  isPending: boolean
  isSaved: boolean
  label?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={isPending}
      onPointerDown={e => { if (!isPending) e.currentTarget.style.transform = 'scale(0.98)' }}
      onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
      onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      style={{
        width: '100%', padding: '16px', borderRadius: 16, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
        background: isSaved ? 'linear-gradient(135deg, #10B981, #0EA5A5)' : isPending ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #9D6CFF 0%, #8B5CF6 42%, #4cd7f6 130%)',
        color: isPending ? 'var(--on-surface-variant)' : '#fff',
        fontSize: 15, fontWeight: 700,
        transition: 'background 0.3s, box-shadow 0.3s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        boxShadow: isSaved ? '0 6px 22px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.25)' : isPending ? 'none' : '0 6px 22px rgba(139,92,246,0.38), inset 0 1px 0 rgba(255,255,255,0.28)',
      }}
    >
      {isSaved
        ? <><Icon name="check_circle" size={18} />Сохранено!</>
        : isPending
        ? 'Сохраняем…'
        : <><Icon name="save" size={18} />{label}</>
      }
    </button>
  )
}

// ─── Money formatting (единый форматтер по всему проекту) ─────────────────────

export function formatMoney(
  value: number | string | null | undefined,
  opts?: { sign?: boolean; kopecks?: boolean; currency?: boolean },
): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0')) || 0
  const frac = opts?.kopecks ? 2 : 0
  const body = Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: frac, maximumFractionDigits: frac })
  const sign = n < 0 ? '−' : (opts?.sign && n > 0 ? '+' : '')
  const suffix = opts?.currency === false ? '' : ' ₽'
  return `${sign}${body}${suffix}`
}

// ─── Button (единая кнопка: варианты + размеры, тач-цель ≥44px) ───────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

const BTN_SIZES: Record<ButtonSize, { minHeight: number; padding: string; fontSize: number; radius: number; icon: number }> = {
  sm: { minHeight: 38, padding: '0 14px', fontSize: 13, radius: 12, icon: 16 },
  md: { minHeight: 44, padding: '0 18px', fontSize: 14, radius: 14, icon: 18 },
  lg: { minHeight: 52, padding: '0 22px', fontSize: 15, radius: 16, icon: 20 },
}

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  icon, iconRight, fullWidth, loading, disabled, type = 'button', ariaLabel, style,
}: {
  children?: React.ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: string
  iconRight?: string
  fullWidth?: boolean
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  ariaLabel?: string
  style?: React.CSSProperties
}) {
  const s = BTN_SIZES[size]
  const isDisabled = disabled || loading
  const variantStyle: React.CSSProperties =
    variant === 'primary' ? { background: 'linear-gradient(135deg, #9D6CFF 0%, #8B5CF6 42%, #4cd7f6 130%)', color: '#fff', border: 'none', boxShadow: '0 6px 22px rgba(139,92,246,0.38), inset 0 1px 0 rgba(255,255,255,0.28)' }
    : variant === 'danger' ? { background: 'linear-gradient(135deg, rgba(251,113,133,0.16), rgba(251,113,133,0.08))', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.35)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }
    : variant === 'secondary' ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))', color: 'var(--on-surface)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }
    : { background: 'transparent', color: 'var(--on-surface-variant)', border: '1px solid transparent' }
  const press = (v: string) => (e: React.PointerEvent<HTMLButtonElement>) => { if (!isDisabled) e.currentTarget.style.transform = v }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      onPointerDown={press('scale(0.96)')}
      onPointerUp={press('scale(1)')}
      onPointerLeave={press('scale(1)')}
      style={{
        minHeight: s.minHeight, padding: s.padding, borderRadius: s.radius, fontSize: s.fontSize, fontWeight: 700,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        width: fullWidth ? '100%' : undefined,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: isDisabled ? 0.55 : 1,
        transition: 'opacity 0.2s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s',
        WebkitTapHighlightColor: 'transparent', userSelect: 'none', touchAction: 'manipulation',
        ...variantStyle,
        ...style,
      }}
    >
      {loading
        ? <Icon name="progress_activity" size={s.icon} style={{ animation: 'spin 1s linear infinite' }} />
        : icon ? <Icon name={icon} size={s.icon} /> : null}
      {children}
      {!loading && iconRight ? <Icon name={iconRight} size={s.icon} /> : null}
    </button>
  )
}

// ─── IconButton (иконочная кнопка с обязательным aria-label) ──────────────────

export function IconButton({
  icon, onClick, ariaLabel, variant = 'secondary', size = 40, disabled, style,
}: {
  icon: string
  onClick?: (e: React.MouseEvent) => void
  ariaLabel: string
  variant?: 'secondary' | 'ghost' | 'danger'
  size?: number
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const bg = variant === 'danger' ? 'linear-gradient(135deg, rgba(251,113,133,0.16), rgba(251,113,133,0.07))' : variant === 'ghost' ? 'transparent' : 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))'
  const color = variant === 'danger' ? 'var(--danger)' : 'var(--on-surface-variant)'
  const border = variant === 'ghost' ? '1px solid transparent' : variant === 'danger' ? '1px solid rgba(251,113,133,0.28)' : '1px solid rgba(255,255,255,0.1)'
  const press = (v: string) => (e: React.PointerEvent<HTMLButtonElement>) => { if (!disabled) e.currentTarget.style.transform = v }
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={press('scale(0.9)')}
      onPointerUp={press('scale(1)')}
      onPointerLeave={press('scale(1)')}
      style={{
        width: size, height: size, minWidth: size, borderRadius: Math.round(size * 0.28),
        border, background: bg, color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1), border-color 0.2s, background 0.2s',
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        boxShadow: variant === 'ghost' ? undefined : 'inset 0 1px 0 rgba(255,255,255,0.06)',
        ...style,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </button>
  )
}

// ─── ConfirmDialog (подтверждение действий, особенно деструктивных) ───────────

export function ConfirmDialog({
  open, onClose, onConfirm, title, message,
  confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', danger, loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
}) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => { if (!loading) onClose() }}
          style={{
            position: 'fixed', inset: 0, zIndex: 120,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            style={{
              width: 'min(360px, 100%)', borderRadius: 20, padding: 24,
              background: 'rgba(29, 24, 40, 0.98)',
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            <div style={{
              width: 46, height: 46, borderRadius: 14, marginBottom: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: danger ? 'linear-gradient(160deg, rgba(251,113,133,0.24), rgba(251,113,133,0.07))' : 'linear-gradient(160deg, rgba(139,92,246,0.24), rgba(76,215,246,0.08))',
              border: `1px solid ${danger ? 'rgba(251,113,133,0.36)' : 'rgba(139,92,246,0.34)'}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}>
              <Icon name={danger ? 'warning' : 'help'} size={24} color={danger ? 'var(--danger)' : '#a78bfa'} />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>{title}</h2>
            {message && <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: message ? 0 : 16 }}>
              <Button variant="secondary" fullWidth onClick={onClose} disabled={loading}>{cancelLabel}</Button>
              <Button
                variant="primary"
                fullWidth
                loading={loading}
                onClick={onConfirm}
                style={danger ? { background: 'linear-gradient(135deg, #FB7185, #F43F5E)', boxShadow: '0 6px 22px rgba(251,113,133,0.4), inset 0 1px 0 rgba(255,255,255,0.28)' } : undefined}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
