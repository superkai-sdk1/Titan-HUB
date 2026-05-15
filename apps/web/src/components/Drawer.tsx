'use client'
import { motion, AnimatePresence } from 'framer-motion'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  icon?: React.ReactNode
  children: React.ReactNode
}

export function Drawer({ open, onClose, title, subtitle, icon, children }: DrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="glass-1"
            style={{
              width: '100%',
              maxWidth: 560,
              maxHeight: '92dvh',
              overflowY: 'auto',
              borderRadius: '32px 32px 0 0',
              padding: '20px 24px 40px',
              boxShadow: 'var(--sh-drawer)',
            }}
          >
            {/* Drag indicator */}
            <div style={{
              width: 36, height: 4,
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 4,
              margin: '0 auto 20px',
            }} />

            {/* Header */}
            {(title || icon) && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
                {icon && (
                  <div style={{
                    width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                    background: 'rgba(var(--accent-rgb),0.15)',
                    border: '1px solid rgba(var(--accent-rgb),0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {icon}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  {title && (
                    <h2 className="drawer-title" style={{ fontSize: 18, margin: 0, color: 'var(--text-primary)' }}>
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  style={{
                    width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              </div>
            )}

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
