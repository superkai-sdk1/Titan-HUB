'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

const STATUS_MAP: Record<string, [string, string]> = {
  active: ['Активен', '#10B981'],
  used: ['Использован', 'rgba(204,195,216,0.4)'],
  expired: ['Истёк', '#F43F5E'],
}

interface Certificate {
  id: string
  code: string
  amount: number
  balance: number
  expiryDate?: string
  comment?: string
  status: 'active' | 'used' | 'expired'
  createdAt: string
}

export default function CertificatesPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Certificate | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [form, setForm] = useState({ amount: '', expiryDate: '', comment: '' })

  const { data } = useQuery<{ certificates: Certificate[] }>({
    queryKey: ['certificates'],
    queryFn: () => api.get('/certificates'),
  })

  const create = useMutation({
    mutationFn: (body: { amount: number; expiryDate?: string; comment?: string }) =>
      api.post('/certificates', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      setShowCreate(false)
      setForm({ amount: '', expiryDate: '', comment: '' })
    },
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.put(`/certificates/${id}/deactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      setSelected(null)
    },
  })

  const certificates = data?.certificates ?? []
  const activeCount = certificates.filter(c => c.status === 'active').length

  const copyCode = (cert: Certificate, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(cert.code).then(() => {
      setCopiedId(cert.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: ru })
    } catch {
      return dateStr
    }
  }

  return (
    <div style={{ padding: '24px 16px', maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--on-surface)' }}>Сертификаты</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--on-surface-variant)' }}>
            Активных: {activeCount}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--primary, #6750A4), #9C72CF)',
            color: '#fff', fontWeight: 600, fontSize: 14,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_card</span>
          Создать
        </button>
      </div>

      {/* List */}
      {certificates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 56, display: 'block', marginBottom: 12, opacity: 0.4 }}>card_giftcard</span>
          <p style={{ margin: 0, fontSize: 15 }}>Сертификатов нет</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {certificates.map(cert => {
            const [statusLabel, statusColor] = STATUS_MAP[cert.status] ?? ['Неизвестно', 'rgba(255,255,255,0.3)']
            const isCopied = copiedId === cert.id
            return (
              <div
                key={cert.id}
                className="glass-l2"
                onClick={() => setSelected(cert)}
                style={{ borderRadius: 16, padding: 20, cursor: 'pointer', position: 'relative' }}
              >
                {/* Status badge */}
                <span style={{
                  position: 'absolute', top: 16, right: 16,
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: cert.status === 'active'
                    ? 'rgba(16,185,129,0.15)'
                    : cert.status === 'expired'
                      ? 'rgba(244,63,94,0.15)'
                      : 'rgba(204,195,216,0.1)',
                  color: statusColor,
                  border: `1px solid ${statusColor}`,
                }}>
                  {statusLabel}
                </span>

                {/* Code row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingRight: 110 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '0.04em' }}>
                    {cert.code}
                  </span>
                  <button
                    onClick={e => copyCode(cert, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: isCopied ? '#10B981' : 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {isCopied ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>

                {/* Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <span style={LBL}>Номинал</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>
                      {cert.amount.toLocaleString('ru')} ₽
                    </span>
                  </div>
                  <div>
                    <span style={LBL}>Остаток</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--on-surface)' }}>
                      {cert.balance.toLocaleString('ru')} ₽
                    </span>
                  </div>
                  <div>
                    <span style={LBL}>Истекает</span>
                    <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>
                      {formatDate(cert.expiryDate)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Sheet */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="glass-l2"
            style={{ width: '100%', borderRadius: '24px 24px 0 0', padding: 28, boxSizing: 'border-box', maxWidth: 600, margin: '0 auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Сертификат</h2>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center' }}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color: 'var(--on-surface)', marginBottom: 20, letterSpacing: '0.04em' }}>
              {selected.code}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <span style={LBL}>Номинал</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)' }}>{selected.amount.toLocaleString('ru')} ₽</span>
              </div>
              <div>
                <span style={LBL}>Остаток</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)' }}>{selected.balance.toLocaleString('ru')} ₽</span>
              </div>
              <div>
                <span style={LBL}>Статус</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: STATUS_MAP[selected.status]?.[1] ?? 'var(--on-surface)' }}>
                  {STATUS_MAP[selected.status]?.[0] ?? '—'}
                </span>
              </div>
              <div>
                <span style={LBL}>Истекает</span>
                <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{formatDate(selected.expiryDate)}</span>
              </div>
              <div>
                <span style={LBL}>Создан</span>
                <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{formatDate(selected.createdAt)}</span>
              </div>
              {selected.comment && (
                <div>
                  <span style={LBL}>Комментарий</span>
                  <span style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>{selected.comment}</span>
                </div>
              )}
            </div>

            {selected.status === 'active' && (
              <button
                onClick={() => deactivate.mutate(selected.id)}
                disabled={deactivate.isPending}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)',
                  background: 'rgba(244,63,94,0.1)', color: '#F43F5E', fontWeight: 600, fontSize: 15,
                  cursor: deactivate.isPending ? 'not-allowed' : 'pointer',
                  opacity: deactivate.isPending ? 0.5 : 1,
                  boxSizing: 'border-box',
                }}
              >
                Деактивировать
              </button>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="glass-l2"
            style={{ width: '100%', borderRadius: '24px 24px 0 0', padding: 28, boxSizing: 'border-box', maxWidth: 600, margin: '0 auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--on-surface)' }}>Новый сертификат</h2>
              <button
                onClick={() => setShowCreate(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center' }}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LBL}>Сумма *</label>
                <input
                  type="number"
                  placeholder="1000"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  style={INP}
                />
              </div>
              <div>
                <label style={LBL}>Срок действия</label>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                  style={INP}
                />
              </div>
              <div>
                <label style={LBL}>Комментарий</label>
                <input
                  placeholder="Необязательно"
                  value={form.comment}
                  onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                  style={INP}
                />
              </div>
              <button
                onClick={() =>
                  create.mutate({
                    amount: Number(form.amount),
                    ...(form.expiryDate ? { expiryDate: form.expiryDate } : {}),
                    ...(form.comment ? { comment: form.comment } : {}),
                  })
                }
                disabled={create.isPending || !form.amount}
                style={{
                  width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                  cursor: create.isPending || !form.amount ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, var(--primary, #6750A4), #9C72CF)',
                  color: '#fff', fontWeight: 600, fontSize: 15,
                  opacity: create.isPending || !form.amount ? 0.5 : 1,
                  boxSizing: 'border-box',
                }}
              >
                {create.isPending ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
