'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { PageHeader, Sheet, Button, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

interface Client {
  id: string
  nickname: string
  balance: number
  lastVisit?: string
  clientTier?: string
}

function avatarColor(name: string) {
  const hues = [0, 10, 350, 5, 355]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % hues.length
  return `hsl(${hues[h]}, 65%, 40%)`
}

function formatDate(str: string) {
  try {
    return format(new Date(str), 'd MMM yyyy', { locale: ru })
  } catch {
    return '—'
  }
}

export default function DebtorsPage() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [selected, setSelected] = useState<Client | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const { data, isLoading } = useQuery<{ clients: Client[] }>({
    queryKey: ['clients-debtors'],
    queryFn: () => api.get('/clients?filter=debtors'),
  })

  const allClients = data?.clients ?? []
  const debtors = useMemo(
    () => allClients.filter(c => c.balance < 0).sort((a, b) => a.balance - b.balance),
    [allClients]
  )
  const totalDebt = debtors.reduce((sum, c) => sum + Math.abs(c.balance), 0)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clients-debtors'] })

  const payMut = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      api.post(`/clients/${id}/balance`, { amount, reason }),
    onSuccess: () => { invalidate(); closeSheet() },
    onError: () => show('Не удалось зачислить платёж', 'error'),
  })

  function openSheet(client: Client) {
    setSelected(client)
    setAmount(String(Math.abs(client.balance)))
    setNote('')
  }

  function closeSheet() {
    setSelected(null)
    setAmount('')
    setNote('')
  }

  function handlePay() {
    if (!selected) return
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    payMut.mutate({ id: selected.id, amount: amt, reason: note.trim() || 'Погашение долга' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <PageHeader title="Должники" subtitle={debtors.length > 0 ? `Общий долг: ${formatMoney(totalDebt)}` : 'Нет задолженностей'} />

      <div style={{ padding: '16px 16px var(--bottom-nav-clear, 24px)', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : debtors.length === 0 ? (
          <StateView state="empty" icon="check_circle" title="Должников нет" description="Все клиенты с положительным или нулевым балансом." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {debtors.map((client) => {
              const initial = (client.nickname ?? '?')[0].toUpperCase()
              const color = avatarColor(client.nickname ?? '')
              return (
                <div key={client.id} className="glass-l2" style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 17, fontWeight: 800, color: '#fff', border: '2px solid rgba(251,113,133,0.4)' }}>
                    {initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{client.nickname}</div>
                    {client.lastVisit && (
                      <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>Последний визит: {formatDate(client.lastVisit)}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--danger)', fontStyle: 'italic', fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(client.balance)}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => openSheet(client)} style={{ borderColor: 'rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                      Погасить долг
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onClose={closeSheet} title="Погасить долг" desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.04)' }}>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '0 0 4px' }}>
              Клиент: <strong style={{ color: 'var(--on-surface)' }}>{selected?.nickname}</strong>
            </p>
            <p style={{ fontSize: 13, margin: 0 }}>
              Текущий баланс: <strong style={{ color: 'var(--danger)', fontStyle: 'italic' }}>{formatMoney(selected?.balance ?? 0)}</strong>
            </p>
          </div>
          <div>
            <label style={LBL}>Сумма пополнения (₽)</label>
            <input style={INP} type="number" min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Сумма" autoFocus />
          </div>
          <div>
            <label style={LBL}>Заметка</label>
            <input style={INP} value={note} onChange={e => setNote(e.target.value)} placeholder="Причина / комментарий" />
          </div>
          <Button
            fullWidth size="lg" loading={payMut.isPending} disabled={!parseFloat(amount)} onClick={handlePay}
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)', boxShadow: '0 4px 20px rgba(16,185,129,0.3)' }}
          >
            Зачислить
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
