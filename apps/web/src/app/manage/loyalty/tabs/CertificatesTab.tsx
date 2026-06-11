'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Icon } from '@/components/Icon'
import { Sheet, Button, IconButton, ConfirmDialog, INP, LBL, formatMoney } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'

const STATUS_MAP: Record<string, [string, string]> = {
  active: ['Активен', 'var(--success)'],
  used: ['Использован', 'var(--on-surface-variant)'],
}

interface Certificate {
  id: string
  code: string
  amount: number
  balance: number
  status: 'active' | 'used'
  createdAt: string
}

export function CertificatesTab() {
  const qc = useQueryClient()
  const { show } = useToast()
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Certificate | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')

  const { data, isLoading } = useQuery<{ certificates: Certificate[] }>({
    queryKey: ['certificates'],
    queryFn: () => api.get('/certificates'),
  })

  const create = useMutation({
    mutationFn: (nominal: number) => api.post('/certificates', { nominal }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['certificates'] }); setShowCreate(false); setAmount('') },
    onError: () => show('Не удалось создать сертификат', 'error'),
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.put(`/certificates/${id}/deactivate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['certificates'] }); setSelected(null); setConfirmDeactivate(false) },
    onError: () => { setConfirmDeactivate(false); show('Не удалось деактивировать', 'error') },
  })

  const certificates = data?.certificates ?? []
  const activeCount = certificates.filter(c => c.status === 'active').length

  const copyCode = (cert: Certificate, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(cert.code).then(() => {
      setCopiedId(cert.id)
      setTimeout(() => setCopiedId(null), 1500)
    }).catch(() => show('Не удалось скопировать', 'error'))
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    try { return format(new Date(dateStr), 'd MMM yyyy', { locale: ru }) } catch { return '—' }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>Активных: {activeCount}</span>
        <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--primary-violet)', color: '#fff', fontSize: 13, fontWeight: 700, minHeight: 40 }}>
          <Icon name="add_card" size={18} color="#fff" /> Создать
        </button>
      </div>

      {isLoading && !data ? (
        <StateView state="loading" />
      ) : certificates.length === 0 ? (
        <StateView state="empty" icon="card_giftcard" title="Сертификатов нет" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {certificates.map(cert => {
            const [statusLabel, statusColor] = STATUS_MAP[cert.status] ?? ['—', 'var(--on-surface-variant)']
            const isCopied = copiedId === cert.id
            return (
              <div key={cert.id} className="glass-l2" onClick={() => setSelected(cert)} style={{ borderRadius: 16, padding: 18, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', top: 16, right: 16, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `color-mix(in srgb, ${statusColor} 16%, transparent)`, color: statusColor, border: `1px solid ${statusColor}` }}>
                  {statusLabel}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingRight: 110 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '0.04em' }}>{cert.code}</span>
                  <IconButton icon={isCopied ? 'check' : 'content_copy'} ariaLabel="Скопировать код" variant="ghost" size={36} onClick={(e: any) => copyCode(cert, e)} style={{ color: isCopied ? 'var(--success)' : 'var(--on-surface-variant)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <span style={LBL}>Номинал</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cert.amount)}</span>
                  </div>
                  <div>
                    <span style={LBL}>Остаток</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cert.balance)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title="Сертификат" desktopSize="sm">
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '0.04em', textAlign: 'center', padding: '12px 0', background: 'rgba(255,255,255,0.04)', borderRadius: 14 }}>
              {selected.code}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><span style={LBL}>Номинал</span><span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(selected.amount)}</span></div>
              <div><span style={LBL}>Остаток</span><span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(selected.balance)}</span></div>
              <div><span style={LBL}>Статус</span><span style={{ fontSize: 14, fontWeight: 700, color: STATUS_MAP[selected.status]?.[1] }}>{STATUS_MAP[selected.status]?.[0] ?? '—'}</span></div>
              <div><span style={LBL}>Создан</span><span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{formatDate(selected.createdAt)}</span></div>
            </div>
            {selected.status === 'active' && (
              <Button variant="danger" fullWidth onClick={() => setConfirmDeactivate(true)}>Деактивировать</Button>
            )}
          </div>
        )}
      </Sheet>

      {/* Create */}
      <Sheet open={showCreate} onClose={() => setShowCreate(false)} title="Новый сертификат" desktopSize="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Номинал (₽)</label>
            <input type="number" min="0" inputMode="decimal" placeholder="1000" value={amount} onChange={e => setAmount(e.target.value)} style={INP} autoFocus />
          </div>
          <Button fullWidth size="lg" loading={create.isPending} disabled={!parseFloat(amount)} onClick={() => create.mutate(Number(amount))}>Создать сертификат</Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() => selected && deactivate.mutate(selected.id)}
        title="Деактивировать сертификат?"
        message="Сертификат больше нельзя будет использовать для оплаты."
        confirmLabel="Деактивировать"
        danger
        loading={deactivate.isPending}
      />
    </div>
  )
}
