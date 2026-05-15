'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

const INP: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const SEL: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(29,26,36,0.8)', color: 'var(--on-surface)', fontSize: 14, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }
const LBL: React.CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--on-surface-variant)', margin: '0 0 6px', display: 'block' }

const TYPE_MAP: Record<string, [string, string, string]> = {
  table: ['Стол', 'table_bar', '#8B5CF6'],
  vr: ['VR зона', 'vrpano', '#4cd7f6'],
  ps5: ['PS5', 'sports_esports', '#10B981'],
  zone: ['Зона', 'grid_view', '#F59E0B'],
  small_booth: ['Малая кабинка', 'meeting_room', '#3B82F6'],
  large_booth: ['Большая кабинка', 'door_front', '#06B6D4'],
  hall: ['Зал', 'warehouse', '#94A3B8'],
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
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10, background: 'rgba(21,18,27,0.9)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Пространства</h1>
          <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{spaces.length} зон</p>
        </div>
        <button onClick={() => open()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>Добавить
        </button>
      </div>

      <div style={{ padding: '24px 32px 80px', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {spaces.map((s: any) => {
            const [label, icon, color] = TYPE_MAP[s.type] ?? ['Зона', 'grid_view', '#94A3B8']
            return (
              <div key={s.id} className="glass-l2" onClick={() => open(s)} style={{ borderRadius: 16, padding: '20px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.2s', opacity: s.isActive ? 1 : 0.5 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color }}>{icon}</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '3px 8px', borderRadius: 6, background: s.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', color: s.isActive ? '#10B981' : 'rgba(204,195,216,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {s.isActive ? 'Активна' : 'Неактивна'}
                  </span>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{s.name}</p>
                <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 10px' }}>{label}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic', color: 'var(--on-surface)' }}>{parseFloat(String(s.hourlyRate ?? 0)).toLocaleString('ru')} ₽/ч</span>
                  {s.capacity && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{s.capacity} чел.</span>}
                </div>
                <button onClick={e => { e.stopPropagation(); del.mutate(s.id) }} style={{ position: 'absolute', top: 12, right: 48, width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(244,63,94,0.2)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F87171' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10,8,14,0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="glass-l1" style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{editing ? 'Редактировать' : 'Новое пространство'}</h2>
              <button onClick={() => setShowForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LBL}>Название *</label><input value={form.name} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} style={INP} /></div>
              <div><label style={LBL}>Тип</label>
                <select value={form.type} onChange={e => setForm((p: any) => ({ ...p, type: e.target.value }))} style={SEL}>
                  {Object.entries(TYPE_MAP).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div><label style={LBL}>Ставка в час (₽)</label><input type="number" value={form.hourlyRate} onChange={e => setForm((p: any) => ({ ...p, hourlyRate: e.target.value }))} style={INP} /></div>
              <div><label style={LBL}>Вместимость (чел.)</label><input type="number" value={form.capacity} onChange={e => setForm((p: any) => ({ ...p, capacity: e.target.value }))} placeholder="Не указано" style={INP} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div onClick={() => setForm((p: any) => ({ ...p, isActive: !p.isActive }))} style={{ width: 44, height: 24, borderRadius: 12, background: form.isActive ? '#8B5CF6' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: form.isActive ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
                <span style={{ fontSize: 14 }}>Активна</span>
              </label>
              <button onClick={() => save.mutate({ ...form, hourlyRate: Number(form.hourlyRate), capacity: form.capacity ? Number(form.capacity) : undefined })} disabled={save.isPending || !form.name} style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
                {save.isPending ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
