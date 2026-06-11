'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader, Sheet, Button, ConfirmDialog, INP, LBL, Toggle } from '@/components/manage/DesignSystem'
import { StateView } from '@/components/StateView'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/Icon'

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
  const { show } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK)
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['spaces', 'all'], queryFn: () => api.get<any>('/spaces/all') })
  const spaces: any[] = data?.spaces ?? []

  const save = useMutation({ mutationFn: (b: any) => editing ? api.patch(`/spaces/${editing.id}`, b) : api.post('/spaces', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['spaces'] }); setShowForm(false); setEditing(null); setForm(BLANK) }, onError: () => show('Не удалось сохранить', 'error') })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/spaces/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['spaces'] }); setConfirmDelId(null) }, onError: () => { setConfirmDelId(null); show('Не удалось удалить', 'error') } })

  const [pairCode, setPairCode] = useState<{ code: string; spaceName: string; expiresIn: number } | null>(null)
  const [pairCountdown, setPairCountdown] = useState(0)

  const genPair = useMutation({
    mutationFn: (spaceId: string) => api.post<{ code: string; spaceName: string; expiresIn: number }>(`/spaces/${spaceId}/tablet-link-code`, {}),
    onSuccess: (data) => {
      setPairCode(data)
      setPairCountdown(data.expiresIn)
    },
    onError: () => show('Не удалось сгенерировать код', 'error'),
  })

  React.useEffect(() => {
    if (!pairCode || pairCountdown <= 0) return
    const t = setInterval(() => {
      setPairCountdown((s) => {
        if (s <= 1) { setPairCode(null); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [pairCode, pairCountdown])

  function open(s?: any) {
    setEditing(s ?? null)
    setForm(s ? { name: s.name, type: s.type, hourlyRate: String(s.hourlyRate ?? 0), isActive: s.isActive ?? true, capacity: String(s.capacity ?? '') } : BLANK)
    setShowForm(true)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Пространства"
        subtitle={`${spaces.length} зон`}
        action={{ label: 'Добавить', icon: 'add', onClick: () => open() }}
      />

      <div style={{ padding: '16px', maxWidth: 'var(--content-narrow)', margin: '0 auto', width: '100%' }}>
        {isLoading && !data ? (
          <StateView state="loading" />
        ) : spaces.length === 0 ? (
          <StateView state="empty" icon="table_bar" title="Нет пространств" description="Добавьте зоны, столы, кабинки" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {spaces.map((s: any) => {
              const [label, icon, color] = TYPE_MAP[s.type] ?? ['Зона', 'grid_view', '#94A3B8']
              return (
                <div key={s.id} className="glass-l2" onClick={() => open(s)}
                  style={{ borderRadius: 18, padding: 18, cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'border-color 0.2s, transform 0.15s', opacity: s.isActive ? 1 : 0.5 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}55`; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={icon} size={24} color={color} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '3px 8px', borderRadius: 6, background: s.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', color: s.isActive ? '#10B981' : 'rgba(204,195,216,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {s.isActive ? 'Активна' : 'Откл.'}
                    </span>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 3px' }}>{s.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--on-surface-variant)', margin: '0 0 12px' }}>{label}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace" }}>
                      {parseFloat(String(s.hourlyRate ?? 0)).toLocaleString('ru')} ₽/ч
                    </span>
                    {s.capacity && <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{s.capacity} чел.</span>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); setConfirmDelId(s.id) }} aria-label="Удалить пространство" style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(251,113,133,0.25)', background: 'rgba(251,113,133,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
                    <Icon name="delete" size={15} />
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
                  <Icon name={icon} size={14} />{l}
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

          {/* Привязка планшета (только для существующих) */}
          {editing && (
            <button
              onClick={() => genPair.mutate(editing.id)}
              disabled={genPair.isPending}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 12,
                border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.08)',
                color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Icon name="tablet_mac" size={16} />
              {genPair.isPending ? 'Генерируем…' : 'Привязать планшет'}
            </button>
          )}

          <Button fullWidth size="lg" loading={save.isPending} disabled={!form.name} onClick={() => save.mutate({ ...form, hourlyRate: Number(form.hourlyRate), capacity: form.capacity ? Number(form.capacity) : undefined })} style={{ marginTop: 4 }}>Сохранить</Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelId}
        onClose={() => setConfirmDelId(null)}
        onConfirm={() => confirmDelId && del.mutate(confirmDelId)}
        title="Удалить пространство?"
        confirmLabel="Удалить"
        danger
        loading={del.isPending}
      />

      {/* Pairing code dialog */}
      {pairCode && (
        <div
          onClick={() => setPairCode(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-l2"
            style={{
              borderRadius: 24, padding: 32, maxWidth: 420, width: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="tablet_mac" size={32} color="#a78bfa" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>Код привязки</h3>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: 0 }}>{pairCode.spaceName}</p>
            </div>
            <div style={{
              fontSize: 48, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em',
              color: '#a78bfa', padding: '12px 24px', borderRadius: 16,
              background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)',
            }}>
              {pairCode.code}
            </div>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center' }}>
              Откройте на планшете <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>titanpos.ru/tablet</code> и введите код.
              <br />Действителен ещё {Math.floor(pairCountdown / 60)}:{String(pairCountdown % 60).padStart(2, '0')}
            </p>
            <button
              onClick={() => setPairCode(null)}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                color: 'var(--on-surface)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
