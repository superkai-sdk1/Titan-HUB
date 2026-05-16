'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Sheet, INP, LBL } from '@/components/manage/DesignSystem'

const STATUS: Record<string, [string, string, string]> = {
  planned:   ['Запланировано', '#3B82F6', 'schedule'],
  active:    ['Активно',       '#10B981', 'play_circle'],
  completed: ['Завершено',     '#94A3B8', 'check_circle'],
  cancelled: ['Отменено',      '#F43F5E', 'cancel'],
}

const TYPES: Record<string, [string, string, string]> = {
  titan: ['Titan клуб', 'home', '#8B5CF6'],
  away:  ['Выезд',      'directions_car', '#F59E0B'],
}

const PAY_TYPES: Record<string, string> = {
  fixed:    'Фиксированная',
  per_head: 'С головы',
  free:     'Бесплатно',
}

const BLANK = { type: 'titan', date: new Date().toISOString().split('T')[0], startTime: '18:00', endTime: '', paymentType: 'fixed', fixedAmount: '', comment: '' }

const MONTHS_SHORT = ['', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export default function EventsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState<any>(BLANK)

  const { data } = useQuery({ queryKey: ['events'], queryFn: () => api.get<any>('/events') })
  const events: any[] = (data?.events ?? []).sort((a: any, b: any) => b.date.localeCompare(a.date))
  const upcomingCount = events.filter(e => e.status === 'planned' || e.status === 'active').length

  const create = useMutation({ mutationFn: (b: any) => api.post('/events', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setShowForm(false); setForm(BLANK) } })
  const update = useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/events/${id}`, b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) } })
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/events/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setSelected(null) } })

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'hidden', width: '100%' }}>
      {/* Header — top-level route, no back button */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(21,18,27,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 680, margin: '0 auto', width: '100%' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Мероприятия</h1>
            <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>
              {events.length} событий{upcomingCount > 0 ? ` · ${upcomingCount} предстоящих` : ''}
            </p>
          </div>
          <button
            onClick={() => { setForm(BLANK); setShowForm(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(139,92,246,0.3)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Добавить
          </button>
        </div>
      </div>

      <div style={{ padding: '16px', flex: 1, maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'rgba(204,195,216,0.2)', display: 'block', marginBottom: 12 }}>event</span>
            <p style={{ fontSize: 15, color: 'rgba(204,195,216,0.4)', margin: 0 }}>Мероприятий нет</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map((ev: any) => {
              const [statusLabel, statusColor, statusIcon] = STATUS[ev.status] ?? ['—', '#94A3B8', 'help']
              const [typeLabel, typeIcon, typeColor] = TYPES[ev.type] ?? ['—', 'event', '#94A3B8']
              const day = ev.date.split('-')[2]
              const month = MONTHS_SHORT[Number(ev.date.split('-')[1])] ?? ''
              return (
                <div key={ev.id} className="glass-l2" onClick={() => setSelected(ev)}
                  style={{ borderRadius: 16, padding: '16px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'border-color 0.2s, transform 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${statusColor}44`; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}>
                  {/* Calendar date block */}
                  <div style={{ width: 54, height: 54, borderRadius: 14, background: `${statusColor}18`, border: `1px solid ${statusColor}33`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, fontStyle: 'italic', color: statusColor, lineHeight: 1 }}>{day}</span>
                    <span style={{ fontSize: 10, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: "'JetBrains Mono',monospace" }}>{month}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: typeColor }}>{typeIcon}</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{typeLabel}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", padding: '2px 7px', borderRadius: 6, background: `${statusColor}20`, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 10 }}>{statusIcon}</span>{statusLabel}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--on-surface-variant)', margin: '0 0 3px' }}>
                      {ev.startTime}{ev.endTime ? ` — ${ev.endTime}` : ''} · {PAY_TYPES[ev.paymentType] ?? ev.paymentType}
                      {ev.fixedAmount ? ` · ${parseFloat(ev.fixedAmount).toLocaleString('ru')} ₽` : ''}
                    </p>
                    {ev.comment && <p style={{ fontSize: 12, color: 'rgba(204,195,216,0.5)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.comment}</p>}
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(204,195,216,0.3)', flexShrink: 0 }}>chevron_right</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create sheet */}
      <Sheet open={showForm} onClose={() => setShowForm(false)} title="Новое мероприятие">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LBL}>Тип</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(TYPES).map(([k, [l, icon, c]]) => (
                <button key={k} onClick={() => setForm((p: any) => ({ ...p, type: k }))}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${form.type === k ? c : 'rgba(255,255,255,0.1)'}`, background: form.type === k ? `${c}22` : 'rgba(255,255,255,0.04)', color: form.type === k ? c : 'var(--on-surface-variant)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>{l}
                </button>
              ))}
            </div>
          </div>
          <div><label style={LBL}>Дата</label><input type="date" value={form.date} onChange={e => setForm((p: any) => ({ ...p, date: e.target.value }))} style={INP} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={LBL}>Начало</label><input type="time" value={form.startTime} onChange={e => setForm((p: any) => ({ ...p, startTime: e.target.value }))} style={INP} /></div>
            <div><label style={LBL}>Конец</label><input type="time" value={form.endTime} onChange={e => setForm((p: any) => ({ ...p, endTime: e.target.value }))} style={INP} /></div>
          </div>
          <div>
            <label style={LBL}>Оплата</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(PAY_TYPES).map(([k, v]) => (
                <button key={k} onClick={() => setForm((p: any) => ({ ...p, paymentType: k }))}
                  style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: `1px solid ${form.paymentType === k ? '#8B5CF6' : 'rgba(255,255,255,0.1)'}`, background: form.paymentType === k ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)', color: form.paymentType === k ? '#a78bfa' : 'var(--on-surface-variant)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {form.paymentType !== 'free' && (
            <div><label style={LBL}>Сумма (₽)</label><input type="number" value={form.fixedAmount} onChange={e => setForm((p: any) => ({ ...p, fixedAmount: e.target.value }))} style={INP} /></div>
          )}
          <div><label style={LBL}>Комментарий</label><input value={form.comment} onChange={e => setForm((p: any) => ({ ...p, comment: e.target.value }))} placeholder="Необязательно" style={INP} /></div>
          <button onClick={() => create.mutate(form)} disabled={create.isPending}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #8B5CF6, #4cd7f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
            {create.isPending ? 'Создаём…' : 'Создать мероприятие'}
          </button>
        </div>
      </Sheet>

      {/* Detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected ? (TYPES[selected.type]?.[0] ?? selected.type) : ''}>
        {selected && (() => {
          const [, statusColor, statusIcon] = STATUS[selected.status] ?? ['—', '#94A3B8', 'help']
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: `${statusColor}15`, border: `1px solid ${statusColor}33` }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: statusColor }}>{statusIcon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{STATUS[selected.status]?.[0]}</span>
                <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginLeft: 'auto' }}>{selected.date}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {[
                  ['Время', `${selected.startTime}${selected.endTime ? ` — ${selected.endTime}` : ''}`],
                  ['Тип оплаты', PAY_TYPES[selected.paymentType] ?? selected.paymentType],
                  ['Сумма', selected.fixedAmount ? `${parseFloat(selected.fixedAmount).toLocaleString('ru')} ₽` : '—'],
                  ['Комментарий', selected.comment || '—'],
                ].map(([k, v]) => v && v !== '—' ? (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>{k}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)' }}>{v}</span>
                  </div>
                ) : null)}
              </div>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Изменить статус</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {Object.entries(STATUS).filter(([k]) => k !== selected.status).map(([k, [l, c]]) => (
                    <button key={k} onClick={() => update.mutate({ id: selected.id, status: k })}
                      style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${c}44`, background: `${c}11`, color: c, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => del.mutate(selected.id)}
                style={{ width: '100%', padding: '13px 0', borderRadius: 14, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#F87171', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>Удалить мероприятие
              </button>
            </div>
          )
        })()}
      </Sheet>
    </div>
  )
}
