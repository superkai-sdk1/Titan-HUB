'use client'
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion'

// ─── Style constants ────────────────────────────────────────────────────────

export const INP: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--on-surface)', fontSize: 14, outline: 'none',
  boxSizing: 'border-box' as const,
  transition: 'border-color 0.2s',
}

export const SEL: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(29,26,36,0.8)',
  color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer',
  boxSizing: 'border-box' as const,
}

export const LBL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase' as const, letterSpacing: '0.08em',
  color: 'var(--on-surface-variant)', margin: '0 0 8px', display: 'block',
}

// ─── Toggle ─────────────────────────────────────────────────────────────────

export function Toggle({
  value, onChange, color = '#8B5CF6',
}: {
  value: boolean
  onChange: (v: boolean) => void
  color?: string
}) {
  return (
    <div
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 52, height: 28, borderRadius: 14,
        background: value ? color : 'rgba(255,255,255,0.1)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        boxShadow: value ? `0 0 12px ${color}55` : 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 27 : 3,
        width: 22, height: 22, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

// ─── Sheet (унифицированный модальный компонент) ────────────────────────────
//
// Поведение:
// • Mobile (<768px): bottom sheet с snap points [initial, full]
// • Desktop (≥768px): centered modal (max 480px) или anchored popover если
//   передан anchorRef (привязка к триггер-элементу)
// • Drag-to-close работает везде — за handle ИЛИ по контенту, если скролл вверху
// • Smart scroll: при достижении верха списка drag вверх увеличивает sheet
// • Snap-points переключаются автоматически в зависимости от скролла

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /**
   * Высота на которой sheet открывается изначально (default '60dvh').
   * При скролле списка вверх sheet расширяется до maxHeight.
   */
  initialHeight?: string
  /**
   * Максимальная высота (default '90dvh'). Sheet может expand'иться до неё.
   */
  maxHeight?: string
  /**
   * Если передан — на desktop sheet появляется рядом с этим элементом (popover).
   * Без anchorRef — centered modal на desktop / bottom sheet на mobile.
   */
  anchorRef?: React.RefObject<HTMLElement | null>
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

export function Sheet({
  open, onClose, title, children,
  initialHeight = '60dvh',
  maxHeight = '90dvh',
  anchorRef,
}: SheetProps) {
  const isDesktop = useIsDesktop()
  const scrollRef = useRef<HTMLDivElement>(null)
  // Y offset от изначальной позиции (drag down = +, drag up = -)
  const dragY = useMotionValue(0)
  // Текущий snap-point: 0 = initial, 1 = expanded (max)
  const [snap, setSnap] = useState<0 | 1>(0)
  // Desktop anchor position
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // ── Снимаем позицию anchor при открытии (desktop popover режим) ────────
  useEffect(() => {
    if (!open || !isDesktop || !anchorRef?.current) {
      setAnchorPos(null)
      return
    }
    const rect = anchorRef.current.getBoundingClientRect()
    setAnchorPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.max(rect.width, 280),
    })
    const onResize = () => {
      if (anchorRef.current) {
        const r = anchorRef.current.getBoundingClientRect()
        setAnchorPos({ top: r.bottom + 8, left: r.left, width: Math.max(r.width, 280) })
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, isDesktop, anchorRef])

  useEffect(() => {
    if (open) {
      animate(dragY, 0, { duration: 0 })
      setSnap(0)
    }
  }, [open, dragY])

  // ── Mobile: snap-driven height ─────────────────────────────────────────
  // На expanded snap (1) высота = maxHeight, на initial (0) = initialHeight
  const sheetHeight = snap === 1 ? maxHeight : initialHeight

  const DISMISS_THRESHOLD = 120
  const EXPAND_THRESHOLD = -80
  const DISMISS_VELOCITY = 600

  // Overlay прозрачность затухает при drag-down (только когда снизу)
  const overlayOpacity = useTransform(dragY, [0, 280], [1, 0])

  const handleDragEnd = useCallback((_: PointerEvent, info: PanInfo) => {
    const offset = info.offset.y
    const velocity = info.velocity.y

    // Быстрый свайп вниз закрывает
    if (velocity > DISMISS_VELOCITY) {
      animate(dragY, 600, { duration: 0.25, ease: [0.32, 0.72, 0, 1] }).then(onClose)
      return
    }
    // Быстрый свайп вверх expand'ит (если ещё не expanded)
    if (velocity < -DISMISS_VELOCITY && snap === 0) {
      setSnap(1)
      animate(dragY, 0, { type: 'spring', damping: 32, stiffness: 320 })
      return
    }

    // Расстояние
    if (offset > DISMISS_THRESHOLD) {
      if (snap === 1) {
        // Из expanded → схлопываем до initial
        setSnap(0)
        animate(dragY, 0, { type: 'spring', damping: 32, stiffness: 320 })
      } else {
        // Из initial → закрываем
        animate(dragY, 600, { duration: 0.25, ease: [0.32, 0.72, 0, 1] }).then(onClose)
      }
      return
    }
    if (offset < EXPAND_THRESHOLD && snap === 0) {
      setSnap(1)
      animate(dragY, 0, { type: 'spring', damping: 32, stiffness: 320 })
      return
    }
    // Иначе spring обратно в исходное
    animate(dragY, 0, { type: 'spring', damping: 32, stiffness: 350 })
  }, [dragY, onClose, snap])

  // ── Drag условия для контента: разрешён только когда скролл в крайней точке ─
  const SCROLL_LOCK_SLACK = 4
  const startScrollTopRef = useRef(0)
  const dragDirectionRef = useRef<'down' | 'up' | null>(null)

  const onContentDragStart = useCallback(() => {
    startScrollTopRef.current = scrollRef.current?.scrollTop ?? 0
    dragDirectionRef.current = null
  }, [])

  const onContentDrag = useCallback((_: PointerEvent, info: PanInfo) => {
    const el = scrollRef.current
    if (!el) return
    const scrollTop = el.scrollTop
    const offset = info.offset.y

    // Определяем направление при первом значимом движении
    if (dragDirectionRef.current === null && Math.abs(offset) > 5) {
      dragDirectionRef.current = offset > 0 ? 'down' : 'up'
    }

    if (dragDirectionRef.current === 'down') {
      // Тянем вниз: разрешено только если скролл уже в самом верху
      if (scrollTop > SCROLL_LOCK_SLACK) {
        dragY.set(0)
        return
      }
      // Применяем
      dragY.set(Math.max(0, offset))
    } else if (dragDirectionRef.current === 'up') {
      // Тянем вверх: разрешено только если sheet ещё не expanded И скролл в верху
      if (snap === 1) {
        // Sheet уже max — apply elastic resistance
        dragY.set(offset * 0.05)
        return
      }
      if (scrollTop > SCROLL_LOCK_SLACK) {
        // Скролл вниз внутри списка — не drag'аем sheet
        dragY.set(0)
        return
      }
      dragY.set(offset)
    }
  }, [dragY, snap])

  // ── Desktop variant: anchor popover ИЛИ centered modal ──────────────────
  if (isDesktop && open) {
    const popoverStyle: React.CSSProperties = anchorPos
      ? {
          position: 'fixed',
          top: Math.min(anchorPos.top, window.innerHeight - 100),
          left: Math.min(anchorPos.left, window.innerWidth - 480),
          width: Math.min(anchorPos.width, 480),
          maxHeight: '70vh',
        }
      : {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(480px, calc(100vw - 48px))',
          maxHeight: maxHeight,
        }

    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: anchorPos ? -8 : 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', damping: 28, stiffness: 380 }}
              style={{ zIndex: 101, ...popoverStyle }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="glass-l2"
                style={{
                  borderRadius: 20,
                  boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  maxHeight: '100%',
                  background: 'rgba(29, 24, 40, 0.96)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                }}
              >
                {title && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '18px 22px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                  }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{title}</h2>
                    <button onClick={onClose} style={{
                      width: 30, height: 30, borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--on-surface-variant)',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                    </button>
                  </div>
                )}
                <div ref={scrollRef} style={{
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  padding: '20px 22px 24px',
                  flex: 1,
                }}>
                  {children}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  // ── Mobile variant: bottom sheet с snap points ──────────────────────────
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
                height: sheetHeight,
                background: 'rgba(29, 24, 40, 0.96)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px 20px 0 0',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle — primary drag affordance */}
              <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.2}
                dragDirectionLock
                onDrag={(_, info) => dragY.set(info.offset.y)}
                onDragEnd={handleDragEnd}
                style={{
                  padding: '12px 24px 6px',
                  cursor: 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: 40, height: 4,
                  background: 'rgba(255,255,255,0.2)',
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
                  <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{title}</h2>
                  <button onClick={onClose} style={{
                    width: 30, height: 30, borderRadius: 9,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--on-surface-variant)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>
              )}

              {/* Scrollable content с drag-aware behavior */}
              <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0}
                dragDirectionLock
                onDragStart={onContentDragStart}
                onDrag={onContentDrag}
                onDragEnd={handleDragEnd}
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  touchAction: 'pan-y',
                }}
              >
                <div
                  ref={scrollRef}
                  style={{
                    height: '100%',
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                    padding: '18px 22px calc(24px + env(safe-area-inset-bottom))',
                  }}
                >
                  {children}
                </div>
              </motion.div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        <button
          onClick={onBack ?? (() => router.back())}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)', flexShrink: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>{subtitle}</p>}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{action.icon}</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: `${color}11`, border: `1px solid ${color}33`, minWidth: 72 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color, fontStyle: 'italic', lineHeight: 1 }}>{value}</span>
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
      style={{
        width: '100%', padding: '16px', borderRadius: 16, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
        background: isSaved ? 'rgba(16,185,129,0.8)' : isPending ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
        color: isPending ? 'var(--on-surface-variant)' : '#fff',
        fontSize: 15, fontWeight: 700,
        transition: 'all 0.3s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: isSaved ? '0 4px 20px rgba(16,185,129,0.3)' : '0 4px 20px rgba(139,92,246,0.3)',
      }}
    >
      {isSaved
        ? <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>Сохранено!</>
        : isPending
        ? 'Сохраняем…'
        : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>{label}</>
      }
    </button>
  )
}
