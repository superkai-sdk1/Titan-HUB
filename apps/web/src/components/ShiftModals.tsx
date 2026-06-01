'use client'
import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Icon } from '@/components/Icon'
import { useOpenShift, useCloseShift } from '@/hooks/useShift'

interface EveningTypeOption { key: string; label: string; color?: string | null }

const LBL: React.CSSProperties = { display: 'block', marginBottom: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)' }

/* ─── Открытие смены ──────────────────────────────────────────────── */
export function OpenShiftModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const openShift = useOpenShift()
  const [cashStart, setCashStart] = useState('0')
  const [eveningType, setEveningType] = useState('none')
  const [reason, setReason] = useState('')

  const { data: lastCashEndData } = useQuery({
    queryKey: ['shifts', 'last-cash-end'],
    queryFn: () => api.get<{ cashEnd: number | null }>('/shifts/last-cash-end'),
    enabled: open,
  })
  const { data: eveningTypesData } = useQuery({
    queryKey: ['pricing', 'evening-types'],
    queryFn: () => api.get<{ eveningTypes: EveningTypeOption[] } | EveningTypeOption[]>('/pricing/evening-types'),
    enabled: open,
  })
  const eveningTypes: EveningTypeOption[] = Array.isArray(eveningTypesData) ? eveningTypesData : (eveningTypesData?.eveningTypes ?? [])

  // Сброс выбора при каждом открытии.
  useEffect(() => { if (open) { setReason(''); setEveningType('none') } }, [open])
  // Преднаполнение кассой = остаток на конец прошлой смены (непрерывность кассы).
  useEffect(() => {
    if (open) setCashStart(lastCashEndData?.cashEnd != null ? String(lastCashEndData.cashEnd) : '0')
  }, [open, lastCashEndData])

  if (!open) return null

  const expectedStart = lastCashEndData?.cashEnd ?? null
  const cashStartNum = parseFloat(cashStart || '0') || 0
  const openDiscrepancy = expectedStart != null ? cashStartNum - expectedStart : 0
  const openChanged = expectedStart != null && openDiscrepancy !== 0
  const reasonMissing = openChanged && !reason.trim()

  async function handleOpen() {
    await openShift.mutateAsync({
      cashStart: cashStartNum,
      eveningType,
      ...(openChanged ? { adjustmentReason: reason.trim() } : {}),
    })
    onClose()
  }

  const evBtn = (key: string, label: string, c: string, full?: boolean): React.CSSProperties => {
    const active = eveningType === key
    return {
      ...(full ? { gridColumn: '1 / -1' } : {}),
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, padding: '12px 10px',
      borderRadius: 14, cursor: 'pointer', textAlign: 'center',
      border: active ? `1.5px solid ${c}` : '1px solid rgba(255,255,255,0.08)',
      background: active ? `${c}26` : 'rgba(255,255,255,0.04)',
      color: active ? c : 'var(--on-surface)', fontSize: 13, fontWeight: active ? 700 : 600,
      transition: 'all 0.15s',
    }
  }
  const noneType = eveningTypes.find(et => et.key === 'none')

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', zIndex: 80, display: 'flex', alignItems: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-l1" style={{ width: '100%', maxWidth: 520, margin: '0 auto', borderRadius: '32px 32px 0 0', padding: '24px 24px calc(24px + var(--bottom-nav-clear, 40px))', maxHeight: '88dvh', overflowY: 'auto', boxShadow: 'var(--sh-drawer)' }}>
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 4, margin: '0 auto 24px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', marginBottom: 24, color: 'var(--on-surface)' }}>ОТКРЫТЬ СМЕНУ</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Наличные в начале</label>
            <input type="number" value={cashStart} onChange={e => setCashStart(e.target.value)} className="glass-l2" style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)', fontSize: 15, outline: 'none', background: 'none' }} />
            {expectedStart != null && (
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '6px 0 0' }}>Ожидается с прошлой смены: {expectedStart.toLocaleString('ru')} ₽</p>
            )}
          </div>

          {openChanged && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: openDiscrepancy > 0 ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${openDiscrepancy > 0 ? 'rgba(52,211,153,0.25)' : 'rgba(244,63,94,0.25)'}` }}>
              <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: openDiscrepancy > 0 ? 'var(--success)' : 'var(--danger)' }}>
                {openDiscrepancy > 0 ? `Излишек +${openDiscrepancy.toLocaleString('ru')} ₽ — будет внесение` : `Недостача ${openDiscrepancy.toLocaleString('ru')} ₽ — будет изъятие`}
              </p>
            </div>
          )}
          {openChanged && (
            <div>
              <label style={LBL}>Причина расхождения (внесение/изъятие)</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Например: довнесли разменную монету" className="glass-l2" style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: `1px solid ${reasonMissing ? 'rgba(244,63,94,0.4)' : 'rgba(255,255,255,0.08)'}`, color: 'var(--on-surface)', fontSize: 14, outline: 'none', background: 'none' }} />
            </div>
          )}

          <div>
            <label style={LBL}>Тип вечера</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {eveningTypes.filter(et => et.key !== 'none').map(et => (
                <button key={et.key} onClick={() => setEveningType(et.key)} style={evBtn(et.key, et.label, et.color || '#8B5CF6')}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: et.color || '#8B5CF6', flexShrink: 0 }} />
                  {et.label}
                </button>
              ))}
              <button onClick={() => setEveningType(noneType?.key ?? 'none')} style={evBtn(noneType?.key ?? 'none', 'Без вечера', noneType?.color || '#94A3B8', true)}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: noneType?.color || '#94A3B8', flexShrink: 0 }} />
                Без вечера
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button onClick={onClose} className="glass-l2" style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, background: 'none' }}>Отмена</button>
            <button onClick={handleOpen} disabled={openShift.isPending || reasonMissing} style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: '0 4px 20px rgba(139,92,246,0.35)', opacity: (openShift.isPending || reasonMissing) ? 0.6 : 1 }}>
              {openShift.isPending ? 'Открываем…' : 'Открыть'}
            </button>
          </div>
          {openShift.isError && <p style={{ fontSize: 12, color: 'var(--danger)', textAlign: 'center', margin: 0 }}>{(openShift.error as Error)?.message ?? 'Ошибка открытия смены'}</p>}
        </div>
      </div>
    </div>
  )
}

/* ─── Закрытие смены ──────────────────────────────────────────────── */
export function CloseShiftModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeShift = useCloseShift()
  const [cashEnd, setCashEnd] = useState('')
  const [reason, setReason] = useState('')

  const { data: cashBalance } = useQuery({
    queryKey: ['shifts', 'cash-balance'],
    queryFn: () => api.get<{ expected: number; cashStart: number; cashPayments?: number }>('/shifts/cash-balance'),
    enabled: open,
  })

  useEffect(() => { if (open) setReason('') }, [open])
  useEffect(() => {
    if (open && cashBalance?.expected != null) setCashEnd(prev => (prev === '' ? String(cashBalance.expected) : prev))
  }, [open, cashBalance])
  // Полный сброс при закрытии модалки, чтобы при следующем открытии преднаполнить заново.
  useEffect(() => { if (!open) setCashEnd('') }, [open])

  if (!open) return null

  const expected = parseFloat(String(cashBalance?.expected ?? 0)) || 0
  const cashEndNum = parseFloat(cashEnd || '0') || 0
  const discrepancy = cashEndNum - expected
  const reasonMissing = discrepancy !== 0 && !reason.trim()

  async function handleClose() {
    await closeShift.mutateAsync({
      cashEnd: cashEndNum,
      ...(discrepancy !== 0 ? { adjustmentReason: reason.trim() } : {}),
    })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', zIndex: 80, display: 'flex', alignItems: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-l1" style={{ width: '100%', maxWidth: 520, margin: '0 auto', borderRadius: '32px 32px 0 0', padding: '28px 28px calc(28px + var(--bottom-nav-clear, 40px))', maxHeight: '88dvh', overflowY: 'auto', boxShadow: 'var(--sh-drawer)' }}>
        <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 4, margin: '0 auto 24px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={26} color="var(--danger)" />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, color: 'var(--on-surface)' }}>ЗАКРЫТЬ СМЕНУ</h2>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>Проверьте кассу перед закрытием</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-l2" style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', margin: '0 0 6px' }}>ОЖИДАЕТСЯ В КАССЕ</p>
            <p style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', margin: 0, color: 'var(--on-surface)' }}>{expected.toLocaleString('ru')} ₽</p>
            {cashBalance?.cashStart != null && (
              <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '4px 0 0' }}>
                Начало смены: {Number(cashBalance.cashStart).toLocaleString('ru')} ₽ + Наличные платежи: {Number(cashBalance.cashPayments ?? 0).toLocaleString('ru')} ₽
              </p>
            )}
          </div>

          <div>
            <label style={LBL}>Фактически в кассе</label>
            <input type="number" value={cashEnd} onChange={e => setCashEnd(e.target.value)} placeholder="0" className="glass-l2" style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--on-surface)', fontSize: 22, fontWeight: 800, fontStyle: 'italic', outline: 'none', background: 'none', fontVariantNumeric: 'tabular-nums' }} />
          </div>

          {cashEnd !== '' && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: discrepancy >= 0 ? 'rgba(52,211,153,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${discrepancy >= 0 ? 'rgba(52,211,153,0.25)' : 'rgba(244,63,94,0.25)'}` }}>
              <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: discrepancy < 0 ? 'var(--danger)' : 'var(--success)' }}>
                Расхождение: {discrepancy >= 0 ? '+' : ''}{discrepancy.toLocaleString('ru')} ₽
                {discrepancy === 0 ? ' — всё сходится!' : discrepancy > 0 ? ' — излишек, будет внесение' : ' — недостача, будет изъятие'}
              </p>
            </div>
          )}

          {discrepancy !== 0 && (
            <div>
              <label style={LBL}>Причина расхождения (внесение/изъятие)</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder={discrepancy > 0 ? 'Например: излишек, внесли в кассу' : 'Например: недостача, изъятие'} className="glass-l2" style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: `1px solid ${reasonMissing ? 'rgba(244,63,94,0.4)' : 'rgba(255,255,255,0.08)'}`, color: 'var(--on-surface)', fontSize: 14, outline: 'none', background: 'none' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} className="glass-l2" style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, background: 'none' }}>Отмена</button>
            <button onClick={handleClose} disabled={closeShift.isPending || cashEnd === '' || reasonMissing} style={{ flex: 2, padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #ef4444, #f97316)', color: '#fff', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: '0 4px 20px rgba(244,63,94,0.3)', opacity: (closeShift.isPending || cashEnd === '' || reasonMissing) ? 0.5 : 1 }}>
              {closeShift.isPending ? 'ЗАКРЫВАЕМ…' : 'ЗАКРЫТЬ СМЕНУ'}
            </button>
          </div>
          {closeShift.isError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0, textAlign: 'center' }}>{(closeShift.error as Error)?.message ?? 'Ошибка закрытия смены'}</p>}
        </div>
      </div>
    </div>
  )
}
