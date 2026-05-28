'use client'
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion'
import { Icon } from '@/components/Icon'

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
        background: value ? color : 'rgba(255,255,255,0.1)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        boxShadow: value ? `0 0 12px ${color}55` : 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? d.on : 3,
        width: d.knob, height: d.knob, borderRadius: '50%',
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
// • Desktop (≥768px): centered modal с adaptive height по контенту
// • Drag-to-close работает везде — за handle ИЛИ по контенту, если скролл вверху
// • Smart scroll: при достижении верха списка drag вверх увеличивает sheet
// • Snap-points переключаются автоматически в зависимости от скролла

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
  // Y offset от изначальной позиции (drag down = +, drag up = -)
  const dragY = useMotionValue(0)
  // Текущий snap-point: 0 = initial, 1 = expanded (max)
  const [snap, setSnap] = useState<0 | 1>(0)

  useEffect(() => {
    if (open) {
      animate(dragY, 0, { duration: 0 })
      setSnap(0)
    }
  }, [open, dragY])

  // Блокируем скролл body когда sheet открыт (предотвращаем background scroll)
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

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
                  <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{title}</h2>
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
                overscrollBehavior: 'contain',
                padding: '20px 24px 24px',
                flex: 1,
              }}>
                {children}
              </div>
            </motion.div>
          </motion.div>
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
                    <Icon name="close" size={16} />
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
          <Icon name="arrow_back" size={18} />
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
    variant === 'primary' ? { background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', border: 'none', boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }
    : variant === 'danger' ? { background: 'rgba(251,113,133,0.12)', color: 'var(--danger)', border: '1px solid rgba(251,113,133,0.3)' }
    : variant === 'secondary' ? { background: 'rgba(255,255,255,0.06)', color: 'var(--on-surface)', border: '1px solid rgba(255,255,255,0.1)' }
    : { background: 'transparent', color: 'var(--on-surface-variant)', border: '1px solid transparent' }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      style={{
        minHeight: s.minHeight, padding: s.padding, borderRadius: s.radius, fontSize: s.fontSize, fontWeight: 700,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        width: fullWidth ? '100%' : undefined,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: isDisabled ? 0.55 : 1,
        transition: 'opacity 0.2s, transform 0.1s',
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
  onClick?: () => void
  ariaLabel: string
  variant?: 'secondary' | 'ghost' | 'danger'
  size?: number
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const bg = variant === 'danger' ? 'rgba(251,113,133,0.1)' : variant === 'ghost' ? 'transparent' : 'rgba(255,255,255,0.05)'
  const color = variant === 'danger' ? 'var(--danger)' : 'var(--on-surface-variant)'
  const border = variant === 'ghost' ? '1px solid transparent' : '1px solid rgba(255,255,255,0.08)'
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{
        width: size, height: size, minWidth: size, borderRadius: Math.round(size * 0.28),
        border, background: bg, color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </button>
  )
}
