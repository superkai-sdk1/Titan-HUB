'use client'
import { useState, useCallback, createContext, useContext, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@/components/Icon'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  show: (message: string, type?: ToastType, duration?: number) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, message, duration }])
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const TOAST_CONFIG: Record<ToastType, { icon: string; color: string; bg: string }> = {
  success: { icon: 'check_circle', color: 'var(--success)', bg: 'rgba(52,211,153,0.12)' },
  error:   { icon: 'cancel',       color: 'var(--danger)',  bg: 'rgba(251,113,133,0.12)' },
  warning: { icon: 'warning',      color: 'var(--warning)', bg: 'rgba(251,191,36,0.12)' },
  info:    { icon: 'info',         color: 'var(--info)',    bg: 'rgba(96,165,250,0.12)' },
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      width: 'min(calc(100vw - 32px), 360px)',
    }}>
      <AnimatePresence>
        {toasts.map(toast => {
          const { icon, color, bg } = TOAST_CONFIG[toast.type]
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
                background: bg,
                border: `1px solid ${color}33`,
                borderRadius: 14,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px ${color}22`,
                pointerEvents: 'all',
              }}
            >
              <Icon name={icon} size={18} color={color} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--on-surface)' }}>
                {toast.message}
              </span>
              <button
                onClick={() => onDismiss(toast.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', padding: 2, flexShrink: 0 }}
              >
                <Icon name="close" size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
