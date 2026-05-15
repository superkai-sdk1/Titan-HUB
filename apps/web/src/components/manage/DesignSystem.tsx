'use client'
import React, { useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'

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

// ─── Sheet ──────────────────────────────────────────────────────────────────

export function Sheet({
  open, onClose, title, children, maxHeight = '90dvh',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxHeight?: string
}) {
  const dragY = useMotionValue(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const overlayOpacity = useTransform(dragY, [0, 280], [1, 0])
  const panelScale    = useTransform(dragY, [0, 200], [1, 0.97])

  useEffect(() => {
    if (open) animate(dragY, 0, { duration: 0 })
  }, [open, dragY])

  const DISMISS_THRESHOLD = 120
  const DISMISS_VELOCITY  = 600
  const SCROLL_LOCK_SLACK = 4

  const handleDragEnd = useCallback((_: PointerEvent, info: { offset: { y: number }; velocity: { y: number } }) => {
    const shouldDismiss =
      info.offset.y > DISMISS_THRESHOLD ||
      info.velocity.y > DISMISS_VELOCITY

    if (shouldDismiss) {
      animate(dragY, 600, { duration: 0.25, ease: [0.32, 0.72, 0, 1] }).then(onClose)
    } else {
      animate(dragY, 0, { type: 'spring', damping: 30, stiffness: 350 })
    }
  }, [dragY, onClose])

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
              background: 'rgba(0,0,0,0.65)',
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
              y: dragY,
              scale: panelScale,
              position: 'fixed',
              bottom: 0, left: 0, right: 0,
              zIndex: 101,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="glass-1"
              style={{
                width: '100%',
                maxWidth: 480,
                maxHeight,
                borderRadius: '24px 24px 0 0',
                boxShadow: 'var(--sh-drawer)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Drag handle zone */}
              <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.18 }}
                dragDirectionLock
                onDragStart={() => {
                  if ((scrollRef.current?.scrollTop ?? 0) > SCROLL_LOCK_SLACK) {
                    animate(dragY, 0, { duration: 0 })
                    return false
                  }
                }}
                onDrag={(_, info) => {
                  if ((scrollRef.current?.scrollTop ?? 0) > SCROLL_LOCK_SLACK) return
                  const raw = info.offset.y
                  dragY.set(raw > 0 ? raw : raw * 0.15)
                }}
                onDragEnd={handleDragEnd}
                style={{
                  padding: '14px 24px 8px',
                  cursor: 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: 36, height: 4,
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 4,
                  margin: '0 auto',
                }} />
              </motion.div>

              {/* Header */}
              {title && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 24px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>{title}</h2>
                  <button
                    onClick={onClose}
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--on-surface-variant)',
                      flexShrink: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>
              )}

              {/* Scrollable content */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                  padding: '20px 24px 40px',
                }}
              >
                {children}
              </div>
            </div>
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
