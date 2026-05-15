'use client'
import React from 'react'
import { useRouter } from 'next/navigation'

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
  open, onClose, title, children, maxHeight = '90vh',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxHeight?: string
}) {
  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 100,
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.3s',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
          transform: open ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
          background: 'rgba(25,22,34,0.98)',
          backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
          maxHeight, overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Centering wrapper */}
        <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 24px 40px' }}>
          {/* Handle */}
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

          {title && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--on-surface)' }}>{title}</h2>
              <button
                onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
          )}

          {children}
        </div>
      </div>
    </>
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
