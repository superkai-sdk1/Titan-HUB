'use client'
/**
 * Хук для подтверждения деструктивных действий.
 *
 * Использование:
 *   const { confirm, dialog } = useConfirm()
 *   const onDelete = () => confirm({
 *     title: 'Удалить мероприятие?',
 *     message: 'Действие нельзя отменить.',
 *     confirmLabel: 'Удалить',
 *     destructive: true,
 *     onConfirm: () => delMutation.mutate(id),
 *   })
 *
 *   return <>...{dialog}</>
 */
import { useState, useCallback } from 'react'
import { Icon } from '@/components/Icon'

interface ConfirmOpts {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}

export function useConfirm() {
  const [pending, setPending] = useState<ConfirmOpts | null>(null)
  const [working, setWorking] = useState(false)

  const confirm = useCallback((opts: ConfirmOpts) => setPending(opts), [])

  const handleConfirm = async () => {
    if (!pending) return
    setWorking(true)
    try {
      await pending.onConfirm()
    } finally {
      setWorking(false)
      setPending(null)
    }
  }

  const dialog = pending ? (
    <div
      onClick={() => !working && setPending(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-l2"
        style={{
          borderRadius: 20, padding: 24, maxWidth: 380, width: '100%',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: pending.destructive ? 'rgba(244,63,94,0.12)' : 'rgba(139,92,246,0.12)',
            border: `1px solid ${pending.destructive ? 'rgba(244,63,94,0.3)' : 'rgba(139,92,246,0.3)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon
              name={pending.destructive ? 'warning' : 'help'}
              size={24}
              color={pending.destructive ? '#F87171' : '#a78bfa'}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px', color: 'var(--on-surface)' }}>
              {pending.title}
            </h3>
            {pending.message && (
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.4 }}>
                {pending.message}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            disabled={working}
            onClick={() => setPending(null)}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--on-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              minHeight: 44,
            }}
          >
            {pending.cancelLabel ?? 'Отмена'}
          </button>
          <button
            disabled={working}
            onClick={handleConfirm}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
              background: pending.destructive
                ? 'linear-gradient(135deg, #F43F5E, #DC2626)'
                : 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              minHeight: 44,
              opacity: working ? 0.6 : 1,
            }}
          >
            {working ? '...' : (pending.confirmLabel ?? 'Подтвердить')}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, dialog }
}
