'use client'
/**
 * Перехват выхода при несохранённых изменениях (черновики ревизий/поставок).
 * Активный экран регистрирует { isDirty, onSave, onDraft, onDiscard, title }. При попытке
 * уйти (смена вкладки/закрытие раздела/клик по ссылке меню/перезагрузка) показывается
 * диалог с тремя действиями: Сохранить (применить), Черновик (сохранить не применяя),
 * Отменить (отбросить и выйти). Тап мимо диалога = остаться.
 */
import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './DesignSystem'
import { Icon } from '@/components/Icon'

export interface GuardRegistration {
  isDirty: () => boolean
  onSave: () => Promise<void> | void
  onDraft: () => Promise<void> | void
  onDiscard: () => void
  title: string // винительный падеж: "ревизию", "поставку"
}

interface GuardCtx {
  register: (reg: GuardRegistration | null) => void
  attempt: (proceed: () => void) => void
}

const Ctx = createContext<GuardCtx | null>(null)

export function useUnsavedGuard(): GuardCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUnsavedGuard must be used within UnsavedGuardProvider')
  return ctx
}

export function UnsavedGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const regRef = useRef<GuardRegistration | null>(null)
  const proceedRef = useRef<(() => void) | null>(null)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<null | 'save' | 'draft'>(null)

  const register = useCallback((reg: GuardRegistration | null) => { regRef.current = reg }, [])

  const openDialog = useCallback((proceed: () => void) => {
    proceedRef.current = proceed
    setTitle(regRef.current?.title ?? '')
    setOpen(true)
  }, [])

  const attempt = useCallback((proceed: () => void) => {
    const reg = regRef.current
    if (reg && reg.isDirty()) openDialog(proceed)
    else proceed()
  }, [openDialog])

  // Нативный prompt при перезагрузке/закрытии вкладки или PWA, пока есть изменения.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (regRef.current?.isDirty()) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  // Перехват кликов по внутренним ссылкам (меню, нижняя навигация), пока есть изменения.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const reg = regRef.current
      if (!reg || !reg.isDirty()) return
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (!href.startsWith('/')) return // внешние ссылки/якоря не трогаем
      if (href === window.location.pathname || href === window.location.pathname + window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      openDialog(() => router.push(href))
    }
    document.addEventListener('click', h, true) // capture-фаза — раньше Next Link
    return () => document.removeEventListener('click', h, true)
  }, [router, openDialog])

  const finish = useCallback(() => {
    // Обработчики (onSave/onDraft/onDiscard) уже сняли «грязное» состояние, поэтому
    // повторного перехвата не будет; регистрацию НЕ обнуляем (иначе ломается перехват
    // при последующих in-tab переходах, когда экран остаётся смонтированным).
    const p = proceedRef.current
    proceedRef.current = null
    setOpen(false)
    setBusy(null)
    p?.()
  }, [])

  const doSave = useCallback(async () => {
    const reg = regRef.current; if (!reg) return finish()
    setBusy('save')
    try { await reg.onSave(); finish() } catch { setBusy(null) }
  }, [finish])
  const doDraft = useCallback(async () => {
    const reg = regRef.current; if (!reg) return finish()
    setBusy('draft')
    try { await reg.onDraft(); finish() } catch { setBusy(null) }
  }, [finish])
  const doDiscard = useCallback(() => {
    regRef.current?.onDiscard()
    finish()
  }, [finish])

  return (
    <Ctx.Provider value={{ register, attempt }}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => { if (!busy) setOpen(false) }}
            style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 28, stiffness: 360 }}
              style={{ width: 'min(360px, 100%)', borderRadius: 20, padding: 24, background: 'rgba(29, 24, 40, 0.98)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}
            >
              <div style={{ width: 46, height: 46, borderRadius: 14, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <Icon name="warning" size={24} color="#F59E0B" />
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>Изменения не сохранены</h2>
              <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', margin: '0 0 20px', lineHeight: 1.5 }}>
                У вас есть незавершённая {title || 'операция'}. Сохранить перед выходом?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Button variant="primary" fullWidth loading={busy === 'save'} disabled={busy === 'draft'} onClick={doSave}>Сохранить</Button>
                <Button variant="secondary" fullWidth loading={busy === 'draft'} disabled={busy === 'save'} onClick={doDraft}>Черновик</Button>
                <button onClick={doDiscard} disabled={!!busy}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', background: 'transparent', color: '#F87171', fontSize: 14, fontWeight: 700, opacity: busy ? 0.5 : 1 }}>
                  Отменить изменения
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  )
}
