'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

interface Discount {
  id: string
  name: string
  type: 'percent' | 'fixed'
  value: number
  isActive: boolean
  isAuto: boolean
  minQuantity?: number
  itemId?: string
}

const emptyForm = { name: '', type: 'percent' as 'percent' | 'fixed', value: '', isActive: true, isAuto: false, minQuantity: '' }

export default function DiscountsPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Discount | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data } = useQuery<{ discounts: Discount[] }>({
    queryKey: ['discounts'],
    queryFn: () => api.get('/discounts'),
  })

  const discounts = data?.discounts ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ['discounts'] })

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/discounts', body),
    onSuccess: () => { invalidate(); closeSheet() },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/discounts/${id}`, body),
    onSuccess: () => { invalidate(); closeSheet() },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/discounts/${id}`),
    onSuccess: () => { invalidate(); closeSheet() },
  })

  function openCreate() {
    setSelected(null)
    setForm(emptyForm)
    setShowCreate(true)
  }

  function openEdit(d: Discount) {
    setSelected(d)
    setForm({ name: d.name, type: d.type, value: String(d.value), isActive: d.isActive, isAuto: d.isAuto, minQuantity: d.minQuantity != null ? String(d.minQuantity) : '' })
    setShowCreate(true)
  }

  function closeSheet() {
    setShowCreate(false)
    setSelected(null)
    setForm(emptyForm)
  }

  function handleSubmit() {
    const body: any = {
      name: form.name.trim(),
      type: form.type,
      value: parseFloat(form.value) || 0,
      isActive: form.isActive,
      isAuto: form.isAuto,
    }
    if (form.minQuantity) body.minQuantity = parseInt(form.minQuantity) || undefined
    if (selected) {
      updateMut.mutate({ id: selected.id, ...body })
    } else {
      createMut.mutate(body)
    }
  }

  const isOpen = showCreate

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Скидки</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{discounts.length} {discounts.length === 1 ? 'скидка' : 'скидок'}</p>
          </div>
          <button
            onClick={openCreate}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Добавить
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '16px 32px 80px', flex: 1 }}>
        {discounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>discount</span>
            <p style={{ fontSize: 14, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Скидок нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {discounts.map((d) => (
              <div
                key={d.id}
                className="glass-l2"
                onClick={() => openEdit(d)}
                style={{ borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'border-color 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
              >
                {/* Type badge */}
                <div style={{ width: 42, height: 42, borderRadius: 12, background: d.type === 'percent' ? 'rgba(139,92,246,0.15)' : 'rgba(76,215,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: d.type === 'percent' ? '#8B5CF6' : '#4cd7f6' }}>
                    {d.type === 'percent' ? '%' : '₽'}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</span>
                    {d.isAuto && (
                      <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Авто</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                    {d.minQuantity != null && (
                      <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>от {d.minQuantity} шт</span>
                    )}
                    {d.itemId && (
                      <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>link</span>Товар
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: d.type === 'percent' ? '#8B5CF6' : '#4cd7f6' }}>
                    {d.type === 'percent' ? `${d.value}%` : `${d.value} ₽`}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: 6, background: d.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)', color: d.isActive ? '#10B981' : '#94A3B8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {d.isActive ? 'Активна' : 'Откл.'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom sheet overlay */}
      {isOpen && (
        <div
          onClick={closeSheet}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        />
      )}

      {/* Bottom sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
          transform: isOpen ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
          background: 'rgba(29,26,36,0.98)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          borderRadius: '24px 24px 0 0', padding: '20px 24px 32px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 20px' }}>
          {selected ? 'Редактировать скидку' : 'Новая скидка'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LBL}>Название</label>
            <input style={INP} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Название скидки" />
          </div>

          <div>
            <label style={LBL}>Тип</label>
            <select style={SEL} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}>
              <option value="percent">Процент (%)</option>
              <option value="fixed">Фиксированная (₽)</option>
            </select>
          </div>

          <div>
            <label style={LBL}>Значение</label>
            <input style={INP} type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder={form.type === 'percent' ? 'Процент' : 'Сумма'} />
          </div>

          <div>
            <label style={LBL}>Мин. количество (необязательно)</label>
            <input style={INP} type="number" min="1" value={form.minQuantity} onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))} placeholder="от X шт" />
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: `1px solid ${form.isActive ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`, background: form.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)', color: form.isActive ? '#10B981' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{form.isActive ? 'toggle_on' : 'toggle_off'}</span>
              Активна
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, isAuto: !f.isAuto }))}
              style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: `1px solid ${form.isAuto ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`, background: form.isAuto ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)', color: form.isAuto ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{form.isAuto ? 'auto_awesome' : 'auto_awesome'}</span>
              Авто
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!form.name.trim() || !form.value}
            style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 15, fontWeight: 700, opacity: (!form.name.trim() || !form.value) ? 0.5 : 1 }}
          >
            {selected ? 'Сохранить' : 'Создать'}
          </button>

          {selected && (
            <button
              onClick={() => deleteMut.mutate(selected.id)}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 15, fontWeight: 700 }}
            >
              Удалить скидку
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
