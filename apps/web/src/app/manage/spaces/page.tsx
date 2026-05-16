'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Sheet, INP, LBL, Toggle } from '@/components/manage/DesignSystem'

const TYPE_MAP: Record<string, [string, string, string]> = {
  table:       ['Стол',            'table_bar',       '#8B5CF6'],
  vr:          ['VR зона',         'vrpano',           '#4cd7f6'],
  ps5:         ['PS5',             'sports_esports',   '#10B981'],
  zone:        ['Зона',            'grid_view',        '#F59E0B'],
  small_booth: ['Малая кабинка',   'meeting_room',     '#3B82F6'],
  large_booth: ['Большая кабинка', 'door_front',       '#06B6D4'],
  hall:        ['Зал',             'warehouse',        '#94A3B8'],
}

const BLANK = { name: '', type: 'table', hourlyRate: '0', isActive: true, capacity: '' }

export default function SpacesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK)

  const { data } = useQuery({ queryKey: ['spaces', 'all'], queryFn: () => api.get<any>('/spaces/all') })
  const spaces: any[] = data?.spaces ?? []

  const save = useMutation({ mutationFn: (b: any) => editing ? api.patch(`/spaces/${editing.id}`, b) : api.post('/spaces', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['spaces'] }); setShowForm(false); setEditing(null); setForm(BLANK) } })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/spaces/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['spaces'] }) })

  function open(s?: any) {
    setEditing(s ?? null)
    setForm(s ? { name: s.name, type: s.type, hourlyRate: String(s.hourlyRate ?? 0), isActive: s.isActive ?? true, capacity: String(s.capacity ?? '') } : BLANK)
    setShowForm(true)
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Пространства"
        subtitle={`${spaces.length} зон`}
        action={{ label: 'Добавить', icon: 'add', onClick: () => open() }}
      />

      <div style={{ padding: '16px', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {spaces.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>table_bar</span>
            <p style={{ fontSize: 15, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Нет пространств</p>
            <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.3)', margin: '6px 0 0' }}>Добавьте зоны, столы, кабинки</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {spaces.map((s: any) => {
              const [label, icon, color] = TYPE_MAP[s.type] ?? ['Зона', 'grid_view', '#94A3B8']
              return (
                <div key={s.id} className="glass-l2" onClick={() => open(s)}
                  style={{ borderRadius: 18, padding: 18, cursor: 'pointer', position: 'relative', transition: 'border-color 0.2s, transform 0.15s', opacity: s.isActive ? 1 : 0.5 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}55`; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 16px ${color}22` }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 24, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '3px 8px', borderRadius: 6, background: s.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', color: s.isActive ? '#10B981' : 'rgba(204,195,216,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {s.isActive ? 'Активна' : 'Откл.'}
                    </span>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 3px' }}>{s.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 12px' }}>{label}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, fontStyle: 'italic', color, fontFamily: "'JetBrains Mono',monospace" }}>
                      {parseFloat(String(s.hourlyRate ?? 0)).toLocaleString('ru')} ₽/ч
                    </span>
                    {s.capacity && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{s.capacity} чел.</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); del.mutate(s.id) }} style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Sheet open={showForm} onClose={() => { setShowForm(false); setEditing(null); setForm(BLANK) }} title={editing ? 'Редактировать' : 'Новое пространство'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={LBL}>Название *</label><input value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} placeholder="Стол 1, VR комната…" /></div>

          {/* Type selector as pill buttons */}
          <div>
            <label style={LBL}>Тип</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {Object.entries(TYPE_MAP).map(([k, [l, icon, color]]) => (
                <button key={k} onClick={() => setForm((p: any) => ({ ...p, type: k }))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${form.type === k ? color : 'rgba(255,255,255,0.1)'}`, background: form.type === k ? `${color}22` : 'rgba(255,255,255,0.04)', color: form.type === k ? color : 'var(--on-surface-variant)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>{l}
                </button>
              ))}
            </div>
          </div>

          <div><label style={LBL}>Ставка в час (₽)</label><input type="number" value={form.hourlyRate} onChange={e => setForm((p: any) => ({ ...p, hourlyRate: e.target.value }))} style={INP} /></div>
          <div><label style={LBL}>Вместимость (чел.)</label><input type="number" value={form.capacity} onChange={e => setForm((p: any) => ({ ...p, capacity: e.target.value }))} placeholder="Не указано" style={INP} /></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Активна</p>
            <Toggle value={form.isActive} onChange={v => setForm((p: any) => ({ ...p, isActive: v }))} />
          </div>
          <button onClick={() => save.mutate({ ...form, hourlyRate: Number(form.hourlyRate), capacity: form.capacity ? Number(form.capacity) : undefined })} disabled={save.isPending || !form.name} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
