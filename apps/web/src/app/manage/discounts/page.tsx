'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Sheet, INP, LBL } from '@/components/manage/DesignSystem'

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
  const activeCount = discounts.filter(d => d.isActive).length
  const invalidate = () => qc.invalidateQueries({ queryKey: ['discounts'] })

  const createMut = useMutation({ mutationFn: (body: object) => api.post('/discounts', body), onSuccess: () => { invalidate(); closeSheet() } })
  const updateMut = useMutation({ mutationFn: ({ id, ...body }: any) => api.patch(`/discounts/${id}`, body), onSuccess: () => { invalidate(); closeSheet() } })
  const deleteMut = useMutation({ mutationFn: (id: string) => api.delete(`/discounts/${id}`), onSuccess: () => { invalidate(); closeSheet() } })
  const toggleMut = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/discounts/${id}`, { isActive }), onSuccess: () => invalidate() })

  function openCreate() { setSelected(null); setForm(emptyForm); setShowCreate(true) }
  function openEdit(d: Discount) { setSelected(d); setForm({ name: d.name, type: d.type, value: String(d.value), isActive: d.isActive, isAuto: d.isAuto, minQuantity: d.minQuantity != null ? String(d.minQuantity) : '' }); setShowCreate(true) }
  function closeSheet() { setShowCreate(false); setSelected(null); setForm(emptyForm) }

  function handleSubmit() {
    const body: any = { name: form.name.trim(), type: form.type, value: parseFloat(form.value) || 0, isActive: form.isActive, isAuto: form.isAuto }
    if (form.minQuantity) body.minQuantity = parseInt(form.minQuantity) || undefined
    selected ? updateMut.mutate({ id: selected.id, ...body }) : createMut.mutate(body)
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Скидки"
        subtitle={`${discounts.length} скидок · ${activeCount} активных`}
        action={{ label: 'Добавить', icon: 'add', onClick: openCreate }}
      />

      <div style={{ padding: '16px 16px 100px', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {discounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>discount</span>
            <p style={{ fontSize: 15, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Скидок нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {discounts.map(d => {
              const color = d.type === 'percent' ? '#8B5CF6' : '#4cd7f6'
              return (
                <div key={d.id} className="glass-l2"
                  style={{ borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, transition: 'border-color 0.2s, opacity 0.2s', opacity: d.isActive ? 1 : 0.6 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}44` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 14px ${color}22` }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color }}>{d.type === 'percent' ? '%' : '₽'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                      {d.isAuto && <span style={{ padding: '2px 7px', borderRadius: 6, background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Авто</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace" }}>{d.type === 'percent' ? `${d.value}%` : `${d.value} ₽`}</span>
                      {d.minQuantity != null && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>от {d.minQuantity} шт</span>}
                    </div>
                  </div>
                  {/* Quick toggle */}
                  <button onClick={e => { e.stopPropagation(); toggleMut.mutate({ id: d.id, isActive: !d.isActive }) }}
                    style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${d.isActive ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`, background: d.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', color: d.isActive ? '#10B981' : 'var(--on-surface-variant)', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    {d.isActive ? 'Вкл.' : 'Откл.'}
                  </button>
                  <button onClick={() => openEdit(d)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(139,92,246,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Sheet open={showCreate} onClose={closeSheet} title={selected ? 'Редактировать скидку' : 'Новая скидка'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Название</label><input style={INP} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Название скидки" /></div>

          {/* Type pills */}
          <div>
            <label style={LBL}>Тип</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['percent', 'Процент (%)', '#8B5CF6'], ['fixed', 'Фиксированная (₽)', '#4cd7f6']] as [string, string, string][]).map(([k, l, c]) => (
                <button key={k} onClick={() => setForm(f => ({ ...f, type: k as 'percent' | 'fixed' }))} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${form.type === k ? c : 'rgba(255,255,255,0.1)'}`, background: form.type === k ? `${c}22` : 'rgba(255,255,255,0.04)', color: form.type === k ? c : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div><label style={LBL}>Значение {form.type === 'percent' ? '(%)' : '(₽)'}</label><input style={INP} type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder={form.type === 'percent' ? 'Процент' : 'Сумма'} /></div>
          <div><label style={LBL}>Мин. количество (необязательно)</label><input style={INP} type="number" min="1" value={form.minQuantity} onChange={e => setForm(f => ({ ...f, minQuantity: e.target.value }))} placeholder="от X шт" /></div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${form.isActive ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`, background: form.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', color: form.isActive ? '#10B981' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{form.isActive ? 'toggle_on' : 'toggle_off'}</span>Активна
            </button>
            <button onClick={() => setForm(f => ({ ...f, isAuto: !f.isAuto }))} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${form.isAuto ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`, background: form.isAuto ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.04)', color: form.isAuto ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>Авто
            </button>
          </div>

          <button onClick={handleSubmit} disabled={!form.name.trim() || !form.value} style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 15, fontWeight: 700, opacity: (!form.name.trim() || !form.value) ? 0.5 : 1 }}>
            {selected ? 'Сохранить' : 'Создать скидку'}
          </button>
          {selected && (
            <button onClick={() => deleteMut.mutate(selected.id)} style={{ width: '100%', padding: '14px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 15, fontWeight: 700 }}>
              Удалить скидку
            </button>
          )}
        </div>
      </Sheet>
    </div>
  )
}
